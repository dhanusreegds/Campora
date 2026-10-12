const { HelpRoom, RoomEvent, RoomSignal, RoomFile, MeetingRequest, User } = require('../models');
const hs = require('../config/helpSessions');
const ApiError = require('../utils/ApiError');
const { cleanText, MINI_USER_FIELDS } = require('../utils/helpers');
const { notify } = require('./notificationService');

const MIN = 60 * 1000;
const PRESENCE_MS = 15000;

// ---------------------------------------------------------------- status and access
/** scheduled -> active (from JOIN_EARLY minutes before start) -> archived (at the scheduled end). Derived from the clock. */
function statusOf(room, now = Date.now()) {
  if (room.cancelledAt) return 'cancelled';
  if (room.archivedAt) return 'archived';
  if (now >= room.scheduledEnd.getTime()) return 'ended'; // past its end, archive pending
  if (now >= room.scheduledStart.getTime() - hs.JOIN_EARLY_MINUTES * MIN) return 'active';
  return 'scheduled';
}

const roleIn = (room, userId) => (String(room.seeker) === String(userId) ? 'seeker' : String(room.helper) === String(userId) ? 'helper' : null);

/** Loads a room by its code. Anyone who is not the seeker or helper gets a 404, so room codes reveal nothing. */
async function loadForUser(code, user) {
  const room = await HelpRoom.findOne({ roomId: String(code) });
  if (!room || !roleIn(room, user._id)) throw new ApiError(404, 'Help Room not found.');
  if (statusOf(room) === 'ended') return archive(room, {});
  return room;
}

const requireActive = (room) => {
  const s = statusOf(room);
  if (s === 'active') return;
  if (s === 'scheduled') throw new ApiError(409, `The Help Room opens ${hs.JOIN_EARLY_MINUTES} minutes before the session starts.`);
  throw new ApiError(409, 'This session has ended. The room is read-only now.');
};

// ---------------------------------------------------------------- archive
/** Closes the room for good. Safe to call from the scheduler, a request, or the End button: it runs once. */
async function archive(room, { by } = {}) {
  const both = room.seekerState && room.seekerState.joinedAt && room.helperState && room.helperState.joinedAt;
  const outcome = both ? 'completed' : 'no_show';
  const closed = await HelpRoom.findOneAndUpdate(
    { _id: room._id, archivedAt: null, cancelledAt: null },
    { $set: { archivedAt: new Date(), outcome, ...(by ? { endedBy: by } : {}) } },
    { returnDocument: 'after' }
  );
  if (!closed) return HelpRoom.findById(room._id); // someone else already archived or cancelled it

  await MeetingRequest.updateOne({ _id: closed.meeting, status: 'accepted' }, { $set: { status: outcome === 'completed' ? 'completed' : 'missed' } });
  const text = outcome === 'completed'
    ? `Your session "${closed.title}" has ended. Notes, whiteboard, chat and files stay available in the room.`
    : `"${closed.title}" ended without both people joining. The room is archived.`;
  for (const uid of [closed.seeker, closed.helper]) {
    await notify(uid, {
      title: 'Session ended', message: text, type: 'room', link: `#/room/${closed.roomId}`, actionLabel: 'Open session summary',
      meta: { startAt: closed.scheduledStart, durationMinutes: Math.round((closed.scheduledEnd - closed.scheduledStart) / MIN), topic: closed.title, roomId: closed.roomId },
    });
  }
  if (outcome === 'completed') {
    // Mentoring challenges verify themselves from completed sessions.
    const { onActivity } = require('./challengeService');
    await Promise.all([onActivity(closed.seeker), onActivity(closed.helper)]);
  }
  return closed;
}

// ---------------------------------------------------------------- views
async function describeRoom(room, user) {
  const [seeker, helper, files] = await Promise.all([
    User.findById(room.seeker).select(MINI_USER_FIELDS).lean(),
    User.findById(room.helper).select(MINI_USER_FIELDS).lean(),
    RoomFile.find({ room: room._id }).sort({ createdAt: 1 }).select('name size mimeType uploader createdAt').lean(),
  ]);
  const status = statusOf(room);
  return {
    room: {
      roomId: room.roomId, title: room.title, category: room.category, categoryLabel: hs.categoryLabel(room.category),
      scheduledStart: room.scheduledStart, scheduledEnd: room.scheduledEnd,
      durationMinutes: Math.round((room.scheduledEnd - room.scheduledStart) / MIN),
      opensAt: new Date(room.scheduledStart.getTime() - hs.JOIN_EARLY_MINUTES * MIN),
      status, writable: status === 'active', outcome: room.outcome || null, archivedAt: room.archivedAt || null,
      seeker, helper, myRole: roleIn(room, user._id),
      notes: { text: room.notes.text, version: room.notes.version, updatedAt: room.notes.updatedAt },
      code: { text: room.code.text, language: room.code.language, version: room.code.version, updatedAt: room.code.updatedAt },
      files: files.map((f) => ({ _id: f._id, name: f.name, size: f.size, mimeType: f.mimeType, uploader: f.uploader, createdAt: f.createdAt })),
    },
    serverTime: new Date(),
  };
}

// ---------------------------------------------------------------- join + presence
async function join(room, user, sid) {
  requireActive(room);
  if (!sid || typeof sid !== 'string' || sid.length > 60) throw new ApiError(400, 'Missing session id.');
  const role = roleIn(room, user._id);
  const key = `${role}State`;
  const now = new Date();
  const firstJoin = !room[key].joinedAt;
  const set = { [`${key}.sid`]: sid, [`${key}.lastSeen`]: now };
  if (firstJoin) set[`${key}.joinedAt`] = now;
  await HelpRoom.updateOne({ _id: room._id }, { $set: set });
  if (firstJoin) await appendEvent(room, 'system', user._id, { text: `${user.name} joined the room.` });
  return { iceServers: hs.iceServers(), role };
}

async function leave(room, user, sid) {
  const key = `${roleIn(room, user._id)}State`;
  if (room[key].sid === sid) await HelpRoom.updateOne({ _id: room._id, [`${key}.sid`]: sid }, { $set: { [`${key}.lastSeen`]: new Date(0) } });
  return { ok: true };
}

// ---------------------------------------------------------------- event log (chat, whiteboard, files)
async function appendEvent(room, kind, from, payload) {
  const bumped = await HelpRoom.findOneAndUpdate(
    { _id: room._id, eventSeq: { $lt: hs.MAX_EVENTS_PER_ROOM } },
    { $inc: { eventSeq: 1 } },
    { returnDocument: 'after' }
  );
  if (!bumped) throw new ApiError(413, 'This room has reached its activity limit.');
  return RoomEvent.create({ room: room._id, seq: bumped.eventSeq, kind, from, payload });
}

async function postChat(room, user, text) {
  requireActive(room);
  return appendEvent(room, 'chat', user._id, { text: cleanText(text, { max: 1000, required: true, label: 'Message' }) });
}

const COLOR = /^#[0-9a-fA-F]{6}$/;
async function postStroke(room, user, body) {
  requireActive(room);
  const id = cleanText(body.id, { max: 40, required: true, label: 'Stroke id' });
  if (!/^[\w-]+$/.test(id)) throw new ApiError(400, 'Invalid stroke id.');
  const tool = body.tool === 'eraser' ? 'eraser' : 'pen';
  const color = COLOR.test(body.color) ? body.color : '#27394A';
  const size = Math.min(40, Math.max(1, Number(body.size) || 3));
  // Points are a flat list [x0, y0, x1, y1, ...] in 0..1 board coordinates. Flat keeps documents small and
  // works on every MongoDB-compatible database (some reject nested arrays).
  if (!Array.isArray(body.pts) || body.pts.length < 2 || body.pts.length % 2 !== 0 || body.pts.length > 600) throw new ApiError(400, 'Invalid stroke.');
  const pts = body.pts.map((v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new ApiError(400, 'Invalid stroke point.');
    return Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000;
  });
  return appendEvent(room, 'stroke', user._id, { id, tool, color, size, start: !!body.start, pts });
}

async function clearBoard(room, user) {
  requireActive(room);
  await RoomEvent.deleteMany({ room: room._id, kind: { $in: ['stroke', 'undo'] } });
  return appendEvent(room, 'clear', user._id, {});
}

async function undoStroke(room, user, id) {
  requireActive(room);
  const sid = cleanText(id, { max: 40, required: true, label: 'Stroke id' });
  if (!(await RoomEvent.exists({ room: room._id, kind: 'stroke', from: user._id, 'payload.id': sid }))) throw new ApiError(404, 'You can only undo your own strokes.');
  await RoomEvent.deleteMany({ room: room._id, kind: 'stroke', 'payload.id': sid });
  return appendEvent(room, 'undo', user._id, { id: sid });
}

// ---------------------------------------------------------------- notes + code (last writer wins)
async function saveDoc(room, user, field, text, extra = {}) {
  requireActive(room);
  const max = field === 'notes' ? 20000 : 50000;
  if (typeof text !== 'string') throw new ApiError(400, 'Text is required.');
  if (text.length > max) throw new ApiError(400, `That is too long (maximum ${max} characters).`);
  const set = { [`${field}.text`]: text, [`${field}.updatedBy`]: user._id, [`${field}.updatedAt`]: new Date(), ...extra };
  const updated = await HelpRoom.findOneAndUpdate({ _id: room._id }, { $set: set, $inc: { [`${field}.version`]: 1 } }, { returnDocument: 'after' });
  return { version: updated[field].version };
}
const saveNotes = (room, user, text) => saveDoc(room, user, 'notes', text);
const LANGS = ['javascript', 'python', 'java', 'cpp', 'c', 'sql', 'html', 'plain'];
const saveCode = (room, user, text, language) => saveDoc(room, user, 'code', text, LANGS.includes(language) ? { 'code.language': language } : {});

// ---------------------------------------------------------------- signalling (WebRTC)
const SIGNAL_TYPES = new Set(['hello', 'description', 'candidate', 'state', 'screen', 'bye']);
async function postSignal(room, user, sid, data) {
  requireActive(room);
  if (!data || typeof data !== 'object' || !SIGNAL_TYPES.has(data.type)) throw new ApiError(400, 'Invalid signal.');
  if (JSON.stringify(data).length > 30000) throw new ApiError(400, 'Signal too large.');
  const other = roleIn(room, user._id) === 'seeker' ? room.helper : room.seeker;
  await RoomSignal.create({ room: room._id, from: user._id, to: other, fromSid: String(sid || '').slice(0, 60), data });
  return { ok: true };
}

// ---------------------------------------------------------------- polling
async function sync(room, user, { since = 0, sid = '', notesV = -1, codeV = -1 }) {
  const role = roleIn(room, user._id);
  const key = `${role}State`;
  const status = statusOf(room);
  const out = { status, serverTime: new Date(), events: [], signals: [] };

  // Another tab took over this person's seat in the room.
  if (sid && room[key].sid && room[key].sid !== sid) { out.superseded = true; return out; }
  if (sid && status === 'active') await HelpRoom.updateOne({ _id: room._id, [`${key}.sid`]: sid }, { $set: { [`${key}.lastSeen`]: new Date() } });

  const events = await RoomEvent.find({ room: room._id, seq: { $gt: Number(since) || 0 } }).sort({ seq: 1 }).limit(500).lean();
  out.events = events.map((e) => ({ seq: e.seq, kind: e.kind, from: e.from, payload: e.payload, createdAt: e.createdAt }));
  out.hasMore = events.length === 500;

  const fresh = await HelpRoom.findById(room._id).select('notes code seekerState helperState').lean();
  if (fresh.notes.version !== Number(notesV)) out.notes = { text: fresh.notes.text, version: fresh.notes.version, updatedBy: fresh.notes.updatedBy };
  if (fresh.code.version !== Number(codeV)) out.code = { text: fresh.code.text, language: fresh.code.language, version: fresh.code.version, updatedBy: fresh.code.updatedBy };

  const other = fresh[role === 'seeker' ? 'helperState' : 'seekerState'] || {};
  out.partner = { online: !!(other.lastSeen && Date.now() - new Date(other.lastSeen).getTime() < PRESENCE_MS), joined: !!other.joinedAt };

  if (sid && status === 'active') {
    const signals = await RoomSignal.find({ room: room._id, to: user._id }).sort({ createdAt: 1 }).limit(100).lean();
    if (signals.length) {
      await RoomSignal.deleteMany({ _id: { $in: signals.map((s) => s._id) } });
      out.signals = signals.map((s) => ({ fromSid: s.fromSid, data: s.data }));
    }
  }
  return out;
}

// ---------------------------------------------------------------- files
const safeName = (raw) => String(raw || 'file').split(/[\\/]/).pop().replace(/[\u0000-\u001f<>:"|?*]/g, '').trim().slice(0, 160) || 'file';

async function addFile(room, user, { name, mimeType, buffer }) {
  requireActive(room);
  if (!buffer || !buffer.length) throw new ApiError(400, 'The file is empty.');
  if (buffer.length > hs.MAX_FILE_BYTES) throw new ApiError(413, `Files can be up to ${Math.round(hs.MAX_FILE_BYTES / 1048576)} MB.`);
  if ((await RoomFile.countDocuments({ room: room._id })) >= hs.MAX_FILES_PER_ROOM) throw new ApiError(409, `This room already has ${hs.MAX_FILES_PER_ROOM} files.`);
  const file = await RoomFile.create({
    room: room._id, uploader: user._id, name: safeName(name),
    mimeType: String(mimeType || 'application/octet-stream').slice(0, 120), size: buffer.length, data: buffer,
  });
  await appendEvent(room, 'file', user._id, { fileId: String(file._id), name: file.name, size: file.size });
  return file;
}

async function getFile(room, fileId) {
  const file = await RoomFile.findOne({ _id: fileId, room: room._id }).select('+data');
  if (!file) throw new ApiError(404, 'File not found.');
  return file;
}

module.exports = {
  statusOf, roleIn, loadForUser, requireActive, archive, describeRoom, join, leave, postChat, postStroke, clearBoard,
  undoStroke, saveNotes, saveCode, postSignal, sync, addFile, getFile,
};

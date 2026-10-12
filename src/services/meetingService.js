const crypto = require('crypto');
const { MeetingRequest, HelpRoom, User } = require('../models');
const hs = require('../config/helpSessions');
const { TIMEZONE } = require('../config/challenges');
const ApiError = require('../utils/ApiError');
const { cleanText, parseDate, assertObjectId } = require('../utils/helpers');
const { notify } = require('./notificationService');

const MIN = 60 * 1000;
const OPEN_STATUSES = ['pending', 'reschedule_proposed'];

const whenText = (date) =>
  new Date(date).toLocaleString('en-IN', { timeZone: TIMEZONE, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

const describe = (m) => `"${m.topic}" (${hs.categoryLabel(m.category)}), ${whenText(m.startAt)}, ${m.durationMinutes} min`;
const metaOf = (m, roomId) => ({ startAt: m.startAt, durationMinutes: m.durationMinutes, category: m.category, topic: m.topic, roomId });

function validateSlot(startAtRaw, durationRaw) {
  const startAt = parseDate(startAtRaw, { label: 'Start time', required: true });
  const durationMinutes = Number(durationRaw);
  if (!hs.DURATIONS.includes(durationMinutes)) throw new ApiError(400, `Duration must be one of: ${hs.DURATIONS.join(', ')} minutes.`);
  const now = Date.now();
  if (startAt.getTime() < now + hs.MIN_LEAD_MINUTES * MIN) throw new ApiError(400, `Pick a start time at least ${hs.MIN_LEAD_MINUTES} minutes from now.`);
  if (startAt.getTime() > now + hs.MAX_DAYS_AHEAD * 24 * 60 * MIN) throw new ApiError(400, `Sessions can be booked up to ${hs.MAX_DAYS_AHEAD} days ahead.`);
  startAt.setSeconds(0, 0);
  return { startAt, durationMinutes, endAt: new Date(startAt.getTime() + durationMinutes * MIN) };
}

// Is the person already in another accepted session that overlaps this slot?
async function hasConflict(userId, role, startAt, endAt, excludeId) {
  const filter = { [role]: userId, status: 'accepted', startAt: { $lt: endAt }, endAt: { $gt: startAt } };
  if (excludeId) filter._id = { $ne: excludeId };
  return !!(await MeetingRequest.exists(filter));
}

async function create(seeker, body) {
  assertObjectId(body.helperId, 'helper');
  const helper = await User.findOne({ _id: body.helperId, role: 'helper' });
  if (!helper) throw new ApiError(404, 'Mentor not found.');
  if (!hs.CATEGORY_KEYS.includes(body.category)) throw new ApiError(400, 'Choose the type of help you need.');
  const topic = cleanText(body.topic, { max: 140, required: true, label: 'Topic' });
  const reason = cleanText(body.reason, { max: 1000, label: 'Reason' });
  const slot = validateSlot(body.startAt, body.durationMinutes);

  const open = await MeetingRequest.countDocuments({ seeker: seeker._id, status: { $in: OPEN_STATUSES } });
  if (open >= hs.MAX_OPEN_REQUESTS_PER_SEEKER) throw new ApiError(429, `You have ${open} requests waiting for a reply. Wait for answers before sending more.`);
  if (await MeetingRequest.exists({ seeker: seeker._id, helper: helper._id, status: { $in: OPEN_STATUSES }, startAt: slot.startAt })) {
    throw new ApiError(409, `You already asked ${helper.name} for this time. Wait for a reply.`);
  }
  if (await hasConflict(seeker._id, 'seeker', slot.startAt, slot.endAt)) throw new ApiError(409, 'You already have an accepted session at that time.');

  const meeting = await MeetingRequest.create({ seeker: seeker._id, helper: helper._id, category: body.category, topic, reason, ...slot });
  await notify(helper._id, {
    title: 'Meeting request received',
    message: `${seeker.name} wants a session: ${describe(meeting)}.`,
    type: 'meeting', link: '#/sessions', actionLabel: 'Review request', meta: metaOf(meeting),
  });
  return meeting;
}

async function load(id) {
  assertObjectId(id, 'session request');
  const m = await MeetingRequest.findById(id);
  if (!m) throw new ApiError(404, 'Session request not found.');
  return m;
}
const isParty = (m, user) => [String(m.seeker), String(m.helper)].includes(String(user._id));
const otherOf = (m, user) => (String(m.seeker) === String(user._id) ? m.helper : m.seeker);

const createRoom = (m) =>
  HelpRoom.create({
    meeting: m._id, seeker: m.seeker, helper: m.helper, roomId: crypto.randomBytes(12).toString('hex'),
    title: m.topic, category: m.category, scheduledStart: m.startAt, scheduledEnd: m.endAt,
  });

/** Helper accepts a pending request, or the Seeker accepts the Helper's suggested time. */
async function accept(user, id) {
  const m = await load(id);
  const byHelper = String(m.helper) === String(user._id) && m.status === 'pending';
  const bySeeker = String(m.seeker) === String(user._id) && m.status === 'reschedule_proposed';
  if (!byHelper && !bySeeker) throw new ApiError(409, m.status === 'accepted' ? 'This session is already accepted.' : 'This request cannot be accepted right now.');

  const slot = bySeeker
    ? { startAt: m.proposal.startAt, endAt: m.proposal.endAt, durationMinutes: m.proposal.durationMinutes }
    : { startAt: m.startAt, endAt: m.endAt, durationMinutes: m.durationMinutes };

  if (slot.startAt.getTime() < Date.now() + 2 * MIN) {
    await MeetingRequest.updateOne({ _id: m._id, status: m.status }, { $set: { status: 'expired' } });
    throw new ApiError(409, 'That time has already passed, so this request expired. Ask for a new time.');
  }
  if (await hasConflict(m.helper, 'helper', slot.startAt, slot.endAt, m._id)) throw new ApiError(409, byHelper ? 'You already have an accepted session at that time.' : 'The mentor is no longer free at that time.');
  if (await hasConflict(m.seeker, 'seeker', slot.startAt, slot.endAt, m._id)) throw new ApiError(409, byHelper ? 'The student already has a session at that time.' : 'You already have a session at that time.');

  // Atomic status change: only one caller can move the request out of its current state.
  const updated = await MeetingRequest.findOneAndUpdate(
    { _id: m._id, status: m.status },
    { $set: { status: 'accepted', respondedAt: new Date(), ...slot } },
    { returnDocument: 'after' }
  );
  if (!updated) throw new ApiError(409, 'This request was just updated. Refresh and try again.');

  let room;
  try {
    room = await createRoom(updated);
  } catch (err) {
    await MeetingRequest.updateOne({ _id: m._id }, { $set: { status: m.status } });
    throw err;
  }

  const [seeker, helper] = await Promise.all([User.findById(updated.seeker).select('name'), User.findById(updated.helper).select('name')]);
  const detail = describe(updated);
  // Each person gets one notification with the title, time, duration and a "Join Help Room" button.
  const toSeeker = byHelper
    ? { title: 'Request accepted', text: `${helper.name} accepted your session: ${detail}.` }
    : { title: 'Help Room ready', text: `Session with ${helper.name} confirmed: ${detail}.` };
  const toHelper = byHelper
    ? { title: 'Help Room ready', text: `Session with ${seeker.name} confirmed: ${detail}.` }
    : { title: 'New time accepted', text: `${seeker.name} accepted your suggested time: ${detail}.` };
  for (const [uid, n] of [[updated.seeker, toSeeker], [updated.helper, toHelper]]) {
    await notify(uid, {
      title: n.title,
      message: `${n.text} Your private Help Room opens ${hs.JOIN_EARLY_MINUTES} minutes before the start.`,
      type: 'room', link: `#/room/${room.roomId}`, actionLabel: 'Join Help Room', meta: metaOf(updated, room.roomId),
    });
  }
  return { meeting: updated, room };
}

async function reject(user, id, noteRaw) {
  const m = await load(id);
  const byHelper = String(m.helper) === String(user._id) && m.status === 'pending';
  const bySeeker = String(m.seeker) === String(user._id) && m.status === 'reschedule_proposed';
  if (!byHelper && !bySeeker) throw new ApiError(409, 'This request cannot be rejected right now.');
  const note = cleanText(noteRaw, { max: 400, label: 'Note' });
  const updated = await MeetingRequest.findOneAndUpdate(
    { _id: m._id, status: m.status },
    { $set: { status: 'rejected', responseNote: note, respondedAt: new Date() } },
    { returnDocument: 'after' }
  );
  if (!updated) throw new ApiError(409, 'This request was just updated. Refresh and try again.');
  await notify(otherOf(m, user), {
    title: 'Request rejected',
    message: `${user.name} ${byHelper ? 'cannot take' : 'declined the new time for'} ${describe(m)}.${note ? ` Note: ${note}` : ''}`,
    type: 'meeting', link: '#/sessions', meta: metaOf(m),
  });
  return updated;
}

async function suggest(user, id, body) {
  const m = await load(id);
  if (String(m.helper) !== String(user._id) || m.status !== 'pending') throw new ApiError(409, 'You can only suggest a new time for a pending request sent to you.');
  const slot = validateSlot(body.startAt, body.durationMinutes || m.durationMinutes);
  if (await hasConflict(m.helper, 'helper', slot.startAt, slot.endAt, m._id)) throw new ApiError(409, 'You already have an accepted session at that time.');
  const note = cleanText(body.note, { max: 400, label: 'Note' });
  const updated = await MeetingRequest.findOneAndUpdate(
    { _id: m._id, status: 'pending' },
    { $set: { status: 'reschedule_proposed', proposal: { ...slot, note, proposedAt: new Date() }, respondedAt: new Date() } },
    { returnDocument: 'after' }
  );
  if (!updated) throw new ApiError(409, 'This request was just updated. Refresh and try again.');
  await notify(m.seeker, {
    title: 'New time suggested',
    message: `${user.name} suggested ${whenText(slot.startAt)} (${slot.durationMinutes} min) for "${m.topic}".${note ? ` Note: ${note}` : ''}`,
    type: 'meeting', link: '#/sessions', actionLabel: 'Review new time',
    meta: { startAt: slot.startAt, durationMinutes: slot.durationMinutes, category: m.category, topic: m.topic },
  });
  return updated;
}

async function cancel(user, id) {
  const m = await load(id);
  if (!isParty(m, user)) throw new ApiError(404, 'Session request not found.');
  const isSeeker = String(m.seeker) === String(user._id);
  const allowed = isSeeker ? [...OPEN_STATUSES, 'accepted'] : ['accepted'];
  if (!allowed.includes(m.status)) throw new ApiError(409, 'This request cannot be cancelled now.');
  if (m.status === 'accepted' && m.startAt.getTime() <= Date.now()) throw new ApiError(409, 'The session has already started. Use "End session" inside the Help Room instead.');
  const updated = await MeetingRequest.findOneAndUpdate(
    { _id: m._id, status: m.status },
    { $set: { status: 'cancelled', cancelledBy: user._id } },
    { returnDocument: 'after' }
  );
  if (!updated) throw new ApiError(409, 'This request was just updated. Refresh and try again.');
  if (m.status === 'accepted') await HelpRoom.updateOne({ meeting: m._id, archivedAt: null }, { $set: { cancelledAt: new Date() } });
  await notify(otherOf(m, user), {
    title: 'Session cancelled', message: `${user.name} cancelled ${describe(m)}.`, type: 'meeting', link: '#/sessions', meta: metaOf(m),
  });
  return updated;
}

module.exports = { create, accept, reject, suggest, cancel, whenText, describe, validateSlot, OPEN_STATUSES };

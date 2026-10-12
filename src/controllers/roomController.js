const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { assertObjectId } = require('../utils/helpers');
const rooms = require('../services/roomService');

const load = (req) => rooms.loadForUser(req.params.code, req.user);
const sidOf = (req) => String(req.get('x-room-sid') || (req.body && req.body.sid) || req.query.sid || '');

exports.get = asyncHandler(async (req, res) => res.json(await rooms.describeRoom(await load(req), req.user)));
exports.join = asyncHandler(async (req, res) => res.json(await rooms.join(await load(req), req.user, sidOf(req))));
exports.leave = asyncHandler(async (req, res) => res.json(await rooms.leave(await load(req), req.user, sidOf(req))));
exports.sync = asyncHandler(async (req, res) => {
  const room = await load(req);
  res.json(await rooms.sync(room, req.user, { since: req.query.since, sid: String(req.query.sid || ''), notesV: req.query.notesV, codeV: req.query.codeV }));
});
exports.chat = asyncHandler(async (req, res) => res.status(201).json({ seq: (await rooms.postChat(await load(req), req.user, (req.body || {}).text)).seq }));
exports.stroke = asyncHandler(async (req, res) => res.status(201).json({ seq: (await rooms.postStroke(await load(req), req.user, req.body || {})).seq }));
exports.clear = asyncHandler(async (req, res) => res.json({ seq: (await rooms.clearBoard(await load(req), req.user)).seq }));
exports.undo = asyncHandler(async (req, res) => res.json({ seq: (await rooms.undoStroke(await load(req), req.user, (req.body || {}).id)).seq }));
exports.notes = asyncHandler(async (req, res) => res.json(await rooms.saveNotes(await load(req), req.user, (req.body || {}).text)));
exports.code = asyncHandler(async (req, res) => {
  const b = req.body || {};
  res.json(await rooms.saveCode(await load(req), req.user, b.text, b.language));
});
exports.signal = asyncHandler(async (req, res) => {
  const b = req.body || {};
  res.status(201).json(await rooms.postSignal(await load(req), req.user, b.sid, b.data));
});

// POST /api/rooms/:code/files?name=...   (raw file bytes in the body)
exports.upload = asyncHandler(async (req, res) => {
  const room = await load(req);
  if (!Buffer.isBuffer(req.body)) throw new ApiError(400, 'Send the file as the request body.');
  const file = await rooms.addFile(room, req.user, { name: req.query.name, mimeType: req.get('content-type'), buffer: req.body });
  res.status(201).json({ file: { _id: file._id, name: file.name, size: file.size } });
});

// Always sent as a download, never rendered in the browser.
exports.download = asyncHandler(async (req, res) => {
  const room = await load(req);
  assertObjectId(req.params.fileId, 'file');
  const file = await rooms.getFile(room, req.params.fileId);
  res.set({
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Content-Length': file.data.length,
  });
  res.send(file.data);
});

exports.end = asyncHandler(async (req, res) => {
  const room = await load(req);
  const status = rooms.statusOf(room);
  if (status === 'cancelled') throw new ApiError(409, 'This session was cancelled.');
  if (status === 'archived') throw new ApiError(409, 'This session has already ended.');
  if (status !== 'active') throw new ApiError(409, 'The session has not started yet.');
  const closed = await rooms.archive(room, { by: req.user._id });
  res.json({ outcome: closed.outcome || null });
});

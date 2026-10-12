const { MeetingRequest, HelpRoom } = require('../models');
const hs = require('../config/helpSessions');
const asyncHandler = require('../utils/asyncHandler');
const meetings = require('../services/meetingService');
const rooms = require('../services/roomService');
const { MINI_USER_FIELDS } = require('../utils/helpers');

exports.meta = asyncHandler(async (_req, res) => {
  res.json({ categories: hs.CATEGORIES, durations: hs.DURATIONS, minLeadMinutes: hs.MIN_LEAD_MINUTES, maxDaysAhead: hs.MAX_DAYS_AHEAD, joinEarlyMinutes: hs.JOIN_EARLY_MINUTES });
});

exports.create = asyncHandler(async (req, res) => {
  res.status(201).json({ meeting: await meetings.create(req.user, req.body || {}) });
});

// Everything the current user is part of.
exports.list = asyncHandler(async (req, res) => {
  const me = req.user._id;
  // Requests nobody answered before their start time are closed as expired.
  await MeetingRequest.updateMany({ $or: [{ seeker: me }, { helper: me }], status: { $in: meetings.OPEN_STATUSES }, startAt: { $lte: new Date() } }, { $set: { status: 'expired' } });
  const list = await MeetingRequest.find({ $or: [{ seeker: me }, { helper: me }] })
    .sort({ startAt: -1 }).limit(200).populate('seeker', MINI_USER_FIELDS).populate('helper', MINI_USER_FIELDS).lean();
  const roomDocs = await HelpRoom.find({ meeting: { $in: list.map((m) => m._id) } }).lean();
  const byMeeting = new Map(roomDocs.map((r) => [String(r.meeting), r]));
  const sessions = list.map((m) => {
    const room = byMeeting.get(String(m._id));
    return {
      ...m,
      categoryLabel: hs.categoryLabel(m.category),
      room: room ? {
        roomId: room.roomId, status: rooms.statusOf(room), scheduledStart: room.scheduledStart, scheduledEnd: room.scheduledEnd,
        opensAt: new Date(room.scheduledStart.getTime() - hs.JOIN_EARLY_MINUTES * 60000), outcome: room.outcome || null,
      } : null,
    };
  });
  res.json({ sessions, serverTime: new Date() });
});

exports.accept = asyncHandler(async (req, res) => {
  const { meeting, room } = await meetings.accept(req.user, req.params.id);
  res.json({ meeting, roomId: room.roomId });
});
exports.reject = asyncHandler(async (req, res) => res.json({ meeting: await meetings.reject(req.user, req.params.id, (req.body || {}).note) }));
exports.suggest = asyncHandler(async (req, res) => res.json({ meeting: await meetings.suggest(req.user, req.params.id, req.body || {}) }));
exports.cancel = asyncHandler(async (req, res) => res.json({ meeting: await meetings.cancel(req.user, req.params.id) }));

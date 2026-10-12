const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { Announcement, EventCheckin } = require('../models');
const challenges = require('../services/challengeService');
const { weekOf } = require('../utils/time');
const { assertObjectId } = require('../utils/helpers');

exports.dashboard = asyncHandler(async (req, res) => res.json(await challenges.getDashboard(req.user)));
exports.summary = asyncHandler(async (req, res) => res.json(await challenges.getSummary(req.user)));

// POST /api/challenges/complete   { challengeKey, scope: 'weekly' | 'daily', note, url }
exports.complete = asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (typeof b.challengeKey !== 'string' || !['weekly', 'daily'].includes(b.scope)) throw new ApiError(400, 'Choose a challenge to complete.');
  const r = await challenges.completeManually(req.user, { challengeKey: b.challengeKey, scope: b.scope, note: b.note, url: b.url });
  res.json({ pointsAwarded: r.points, streak: r.streak });
});

exports.leaderboard = asyncHandler(async (req, res) => {
  const week = weekOf();
  const data = await challenges.weeklyLeaderboard(week, { limit: Math.min(Number(req.query.limit) || 20, 50), meId: req.user._id });
  res.json({ weekKey: week.weekKey, ...data });
});

exports.checkin = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'event');
  const a = await Announcement.findById(req.params.id);
  if (!a) throw new ApiError(404, 'Event not found.');
  res.json(await challenges.checkInToEvent(req.user, a));
});

exports.myCheckins = asyncHandler(async (req, res) => {
  const rows = await EventCheckin.find({ user: req.user._id }).select('announcement').lean();
  res.json({ announcementIds: rows.map((r) => String(r.announcement)) });
});

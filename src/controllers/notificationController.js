const { Notification } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { assertObjectId } = require('../utils/helpers');

// GET /api/notifications
exports.list = asyncHandler(async (req, res) => {
  const [notifications, unread] = await Promise.all([
    Notification.find({ recipient: req.user._id }).sort({ createdAt: -1 }).limit(30).lean(),
    Notification.countDocuments({ recipient: req.user._id, read: false }),
  ]);
  res.json({ notifications, unread });
});

// POST /api/notifications/:id/read
exports.markRead = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'notification');
  const result = await Notification.updateOne({ _id: req.params.id, recipient: req.user._id }, { $set: { read: true } });
  if (!result.matchedCount) throw new ApiError(404, 'Notification not found.');
  res.json({ ok: true });
});

// POST /api/notifications/read-all
exports.markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ recipient: req.user._id, read: false }, { $set: { read: true } });
  res.json({ ok: true });
});

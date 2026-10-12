const { Message, Connection, User, Notification } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { assertObjectId, cleanText, MINI_USER_FIELDS } = require('../utils/helpers');
const { notify } = require('../services/notificationService');

// Chat is only allowed between a Seeker and a Helper who have an accepted connection.
async function requireConnection(me, otherId) {
  assertObjectId(otherId, 'user');
  const other = await User.findById(otherId).select(MINI_USER_FIELDS);
  if (!other) throw new ApiError(404, 'User not found.');
  if (other.role === me.role) throw new ApiError(403, 'Chat is only available between a Seeker and a Helper.');

  const pair = me.role === 'seeker' ? { seeker: me._id, helper: other._id } : { seeker: other._id, helper: me._id };
  const connection = await Connection.findOne({ ...pair, status: 'accepted' });
  if (!connection) throw new ApiError(403, 'Chat unlocks once a help request between you two is accepted.');
  return other;
}

// GET /api/chat/conversations
exports.conversations = asyncHandler(async (req, res) => {
  const isSeeker = req.user.role === 'seeker';
  const otherField = isSeeker ? 'helper' : 'seeker';
  const connections = await Connection.find({ [isSeeker ? 'seeker' : 'helper']: req.user._id, status: 'accepted' })
    .populate(otherField, MINI_USER_FIELDS)
    .lean();

  const list = await Promise.all(
    connections
      .filter((c) => c[otherField])
      .map(async (c) => {
        const other = c[otherField];
        const [last, unread] = await Promise.all([
          Message.findOne({
            $or: [
              { sender: req.user._id, receiver: other._id },
              { sender: other._id, receiver: req.user._id },
            ],
          })
            .sort({ timestamp: -1 })
            .lean(),
          Message.countDocuments({ sender: other._id, receiver: req.user._id, read: false }),
        ]);
        return { user: other, lastMessage: last || null, unread, since: c.createdAt };
      })
  );

  list.sort((a, b) => new Date(b.lastMessage?.timestamp || b.since) - new Date(a.lastMessage?.timestamp || a.since));
  res.json({ conversations: list });
});

// GET /api/chat/:userId
exports.history = asyncHandler(async (req, res) => {
  const other = await requireConnection(req.user, req.params.userId);
  const filter = {
    $or: [
      { sender: req.user._id, receiver: other._id },
      { sender: other._id, receiver: req.user._id },
    ],
  };
  const messages = await Message.find(filter).sort({ timestamp: 1 }).limit(300).lean();
  await Message.updateMany({ sender: other._id, receiver: req.user._id, read: false }, { $set: { read: true } });
  res.json({ user: other, messages });
});

// POST /api/chat/:userId   { content }
exports.send = asyncHandler(async (req, res) => {
  const other = await requireConnection(req.user, req.params.userId);
  const content = cleanText(req.body && req.body.content, { max: 1000, required: true, label: 'Message' });
  const message = await Message.create({ sender: req.user._id, receiver: other._id, content });

  // Only one unread "new message" notification per sender at a time.
  const already = await Notification.exists({
    recipient: other._id,
    type: 'chat',
    read: false,
    link: `#/chat/${req.user._id}`,
  });
  if (!already) {
    await notify(other._id, {
      title: `New message from ${req.user.name}`,
      message: content.length > 80 ? `${content.slice(0, 77)}...` : content,
      type: 'chat',
      link: `#/chat/${req.user._id}`,
    });
  }
  res.status(201).json({ message });
});

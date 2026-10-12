const mongoose = require('mongoose');

const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: ['match', 'request', 'accepted', 'rejected', 'completed', 'chat', 'points', 'system', 'meeting', 'room', 'challenge', 'streak'],
      default: 'system',
    },
    // In-app route to open when the notification is clicked, e.g. "#/requests".
    link: { type: String, default: '' },
    // Optional button label (e.g. "Join Help Room") and structured data the browser formats in local time.
    actionLabel: { type: String, default: '' },
    meta: { type: Schema.Types.Mixed },
    read: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ recipient: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);

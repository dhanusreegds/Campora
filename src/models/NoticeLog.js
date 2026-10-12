const mongoose = require('mongoose');

const { Schema } = mongoose;

// Remembers which one-off notifications were already sent, e.g. "weekly challenges ready for 2026-W41".
const noticeLogSchema = new Schema(
  { user: { type: Schema.Types.ObjectId, ref: 'User', required: true }, key: { type: String, required: true } },
  { timestamps: { createdAt: true, updatedAt: false } }
);

noticeLogSchema.index({ user: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('NoticeLog', noticeLogSchema);

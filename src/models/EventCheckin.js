const mongoose = require('mongoose');

const { Schema } = mongoose;

// A student checking in to a campus event (Announcement). Lets event challenges be verified on Campora.
const eventCheckinSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    announcement: { type: Schema.Types.ObjectId, ref: 'Announcement', required: true },
    category: { type: String, default: 'general' },
    weekKey: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

eventCheckinSchema.index({ user: 1, announcement: 1 }, { unique: true });
eventCheckinSchema.index({ user: 1, weekKey: 1 });

module.exports = mongoose.model('EventCheckin', eventCheckinSchema);

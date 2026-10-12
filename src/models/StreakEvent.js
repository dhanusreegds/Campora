const mongoose = require('mongoose');

const { Schema } = mongoose;

// Ledger of streak point awards. Unique on (user, day, kind): a day can only ever pay out once.
const streakEventSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    dateKey: { type: String, required: true },
    weekKey: { type: String, required: true, index: true },
    kind: { type: String, enum: ['daily', 'bonus5', 'bonus7'], required: true },
    streakDay: { type: Number, required: true },
    points: { type: Number, required: true, min: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

streakEventSchema.index({ user: 1, dateKey: 1, kind: 1 }, { unique: true });

module.exports = mongoose.model('StreakEvent', streakEventSchema);

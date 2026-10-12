const mongoose = require('mongoose');

const { Schema } = mongoose;

const userStreakSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    currentStreak: { type: Number, default: 0, min: 0 },
    longestStreak: { type: Number, default: 0, min: 0 },
    lastCompletedDate: { type: String, default: '' },
    streakPoints: { type: Number, default: 0, min: 0 },
    challengePoints: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('UserStreak', userStreakSchema);

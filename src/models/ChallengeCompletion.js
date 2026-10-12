const mongoose = require('mongoose');

const { Schema } = mongoose;

// One row per completed challenge. The unique index is what stops double rewards: a user can complete
// a given challenge only once per period (one week, or one day for daily tasks).
const challengeCompletionSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  challenge: { type: Schema.Types.ObjectId, ref: 'CampusChallenge', required: true },
  challengeKey: String,
  title: String,
  periodType: { type: String, enum: ['weekly', 'daily'], required: true },
  periodKey: { type: String, required: true },
  weekKey: { type: String, required: true, index: true },
  dateKey: { type: String, required: true },
  pointsAwarded: { type: Number, required: true, min: 0 },
  source: { type: String, enum: ['auto', 'self'], required: true },
  proofNote: { type: String, default: '', maxlength: 500 },
  proofUrl: { type: String, default: '', maxlength: 500 },
  completedAt: { type: Date, default: Date.now },
});

challengeCompletionSchema.index({ user: 1, challenge: 1, periodType: 1, periodKey: 1 }, { unique: true });
challengeCompletionSchema.index({ user: 1, dateKey: 1 });
challengeCompletionSchema.index({ weekKey: 1, user: 1 });

module.exports = mongoose.model('ChallengeCompletion', challengeCompletionSchema);

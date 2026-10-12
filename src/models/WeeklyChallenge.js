const mongoose = require('mongoose');

const { Schema } = mongoose;

// The set of challenges chosen for one week and one audience (seekers or helpers).
// Unique index makes generation safe under concurrent requests. Items are snapshots, so editing the
// pool later never changes a week that was already published.
const itemSchema = new Schema(
  {
    challenge: { type: Schema.Types.ObjectId, ref: 'CampusChallenge', required: true },
    key: String, title: String, description: String, category: String, difficulty: String,
    points: Number, verificationType: String, target: Number, eventCategory: String,
  },
  { _id: false }
);

const weeklyChallengeSchema = new Schema(
  {
    weekKey: { type: String, required: true },
    year: { type: Number, required: true },
    week: { type: Number, required: true },
    audience: { type: String, enum: ['seeker', 'helper'], required: true },
    startKey: String,
    endKey: String,
    items: { type: [itemSchema], default: [] },
  },
  { timestamps: true }
);

weeklyChallengeSchema.index({ weekKey: 1, audience: 1 }, { unique: true });

module.exports = mongoose.model('WeeklyChallenge', weeklyChallengeSchema);

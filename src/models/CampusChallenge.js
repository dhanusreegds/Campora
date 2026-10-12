const mongoose = require('mongoose');

const { Schema } = mongoose;

// The pool of challenges that weekly (and daily) sets are drawn from.
const campusChallengeSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 400 },
    category: { type: String, required: true },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], required: true },
    points: { type: Number, required: true, min: 0 },
    kind: { type: String, enum: ['weekly', 'daily'], required: true, index: true },
    audience: { type: String, enum: ['all', 'seeker', 'helper'], default: 'all' },
    verificationType: { type: String, enum: ['self', 'link', 'session', 'request', 'posted', 'event'], required: true },
    target: { type: Number, default: 1, min: 1 },
    eventCategory: { type: String, default: '' },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CampusChallenge', campusChallengeSchema);

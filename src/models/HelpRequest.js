const mongoose = require('mongoose');

const { Schema } = mongoose;

const matchedHelperSchema = new Schema(
  {
    helper: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    score: { type: Number, default: 0 },
    matchedSkills: { type: [String], default: [] },
    explanation: { type: String, default: '' },
  },
  { _id: false }
);

const helpRequestSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    category: { type: String, trim: true, maxlength: 80, default: 'General' },
    requiredSkills: { type: [String], default: [] },
    // "direct" = sent to one chosen Helper, "public" = posted for matching Helpers.
    type: { type: String, enum: ['direct', 'public'], required: true },
    postedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    assignedHelper: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    assistanceType: { type: String, trim: true, maxlength: 60, default: '' },
    difficulty: { type: String, enum: ['basic', 'intermediate', 'advanced'], default: 'basic' },
    deadline: Date,
    matchingScore: { type: Number, default: 0 },
    matchedHelpers: { type: [matchedHelperSchema], default: [] },
    // Helpers who rejected a public post (it stays open for others).
    declinedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'completed'],
      default: 'pending',
      index: true,
    },
    acceptedAt: Date,
    rejectedAt: Date,
    completedAt: Date,
    // Guards against awarding points twice for the same request.
    pointsAwarded: { type: Boolean, default: false },
    pointsValue: { type: Number, default: 0 },
  },
  { timestamps: true }
);

helpRequestSchema.index({ type: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('HelpRequest', helpRequestSchema);

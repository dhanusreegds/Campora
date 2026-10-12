const mongoose = require('mongoose');
const { CATEGORY_KEYS, DURATIONS } = require('../config/helpSessions');

const { Schema } = mongoose;

// A Seeker's request for a one-to-one Help Session with a Helper.
// pending -> accepted | rejected | reschedule_proposed | cancelled | expired
// reschedule_proposed -> accepted | rejected | cancelled | expired      (the Seeker answers)
// accepted -> completed | missed | cancelled
const meetingRequestSchema = new Schema(
  {
    seeker: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    helper: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    category: { type: String, enum: CATEGORY_KEYS, required: true },
    topic: { type: String, required: true, trim: true, maxlength: 140 },
    reason: { type: String, trim: true, maxlength: 1000, default: '' },
    startAt: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, required: true, enum: DURATIONS },
    endAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'reschedule_proposed', 'cancelled', 'expired', 'completed', 'missed'],
      default: 'pending',
      index: true,
    },
    proposal: { startAt: Date, endAt: Date, durationMinutes: Number, note: { type: String, trim: true, maxlength: 400, default: '' }, proposedAt: Date },
    responseNote: { type: String, trim: true, maxlength: 400, default: '' },
    respondedAt: Date,
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

meetingRequestSchema.index({ helper: 1, status: 1, startAt: 1 });
meetingRequestSchema.index({ seeker: 1, status: 1, startAt: 1 });

module.exports = mongoose.model('MeetingRequest', meetingRequestSchema);

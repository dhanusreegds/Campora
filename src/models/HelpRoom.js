const mongoose = require('mongoose');

const { Schema } = mongoose;

const partySchema = new Schema({ sid: { type: String, default: '' }, lastSeen: Date, joinedAt: Date }, { _id: false });

// One private room per accepted meeting (the unique index on "meeting" guarantees it).
// Status is derived from the clock (see roomService.statusOf), so it is correct without any background job.
const helpRoomSchema = new Schema(
  {
    meeting: { type: Schema.Types.ObjectId, ref: 'MeetingRequest', required: true, unique: true },
    seeker: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    helper: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    roomId: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    category: { type: String, required: true },
    scheduledStart: { type: Date, required: true, index: true },
    scheduledEnd: { type: Date, required: true, index: true },
    seekerState: { type: partySchema, default: () => ({}) },
    helperState: { type: partySchema, default: () => ({}) },
    notes: {
      text: { type: String, default: '', maxlength: 20000 },
      version: { type: Number, default: 0 },
      updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      updatedAt: Date,
    },
    code: {
      text: { type: String, default: '', maxlength: 50000 },
      language: { type: String, default: 'javascript', maxlength: 30 },
      version: { type: Number, default: 0 },
      updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      updatedAt: Date,
    },
    eventSeq: { type: Number, default: 0 },
    archivedAt: Date,
    outcome: { type: String, enum: ['completed', 'no_show'] },
    endedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: Date,
    reminderSent: { type: Boolean, default: false },
    startingSoonSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('HelpRoom', helpRoomSchema);

const mongoose = require('mongoose');

const { Schema } = mongoose;

const announcementSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, required: true, trim: true, maxlength: 1500 },
    eventDate: { type: Date, required: true, index: true },
    venue: { type: String, trim: true, maxlength: 120, default: '' },
    organizer: { type: String, trim: true, maxlength: 120, default: '' },
    // Used to verify event challenges. Existing announcements default to "general".
    category: { type: String, enum: ['general', 'workshop', 'club', 'technical', 'hackathon'], default: 'general' },
    registrationLink: { type: String, trim: true, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Announcement', announcementSchema);

const mongoose = require('mongoose');

const { Schema } = mongoose;

// Files shared in a Help Room. Kept after the session ends so both people can still download them.
const roomFileSchema = new Schema(
  {
    room: { type: Schema.Types.ObjectId, ref: 'HelpRoom', required: true, index: true },
    uploader: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, maxlength: 160 },
    mimeType: { type: String, default: 'application/octet-stream', maxlength: 120 },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true, select: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model('RoomFile', roomFileSchema);

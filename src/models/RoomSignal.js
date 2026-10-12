const mongoose = require('mongoose');

const { Schema } = mongoose;

// Short-lived WebRTC signalling messages. Deleted once read, and they expire on their own after 2 minutes.
const roomSignalSchema = new Schema({
  room: { type: Schema.Types.ObjectId, ref: 'HelpRoom', required: true },
  from: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  to: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  fromSid: { type: String, required: true },
  data: { type: Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now, expires: 120 },
});

roomSignalSchema.index({ room: 1, to: 1, createdAt: 1 });

module.exports = mongoose.model('RoomSignal', roomSignalSchema);

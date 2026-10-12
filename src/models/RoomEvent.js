const mongoose = require('mongoose');

const { Schema } = mongoose;

// Ordered log of everything shared in a room: chat messages, whiteboard strokes, file announcements.
const roomEventSchema = new Schema({
  room: { type: Schema.Types.ObjectId, ref: 'HelpRoom', required: true },
  seq: { type: Number, required: true },
  kind: { type: String, enum: ['chat', 'stroke', 'clear', 'undo', 'file', 'system'], required: true },
  from: { type: Schema.Types.ObjectId, ref: 'User' },
  payload: { type: Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
});

roomEventSchema.index({ room: 1, seq: 1 }, { unique: true });

module.exports = mongoose.model('RoomEvent', roomEventSchema);

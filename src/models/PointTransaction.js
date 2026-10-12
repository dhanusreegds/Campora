const mongoose = require('mongoose');

const { Schema } = mongoose;

// One row per points award. The unique index on "request" guarantees a request can only ever
// award points once, even if two "complete" calls arrive at the same moment.
const pointTransactionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    request: { type: Schema.Types.ObjectId, ref: 'HelpRequest', required: true, unique: true },
    points: { type: Number, required: true, min: 0 },
    reason: { type: String, default: 'Help request completed' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model('PointTransaction', pointTransactionSchema);

const mongoose = require('mongoose');

const { Schema } = mongoose;

const connectionSchema = new Schema(
  {
    seeker: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    helper: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'ended'], default: 'accepted' },
    // The request that created the connection.
    request: { type: Schema.Types.ObjectId, ref: 'HelpRequest' },
  },
  { timestamps: true }
);

connectionSchema.index({ seeker: 1, helper: 1 }, { unique: true });

module.exports = mongoose.model('Connection', connectionSchema);

const mongoose = require('mongoose');

const { Schema } = mongoose;

const redemptionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    benefit: { type: Schema.Types.ObjectId, ref: 'Benefit', required: true },
    benefitName: { type: String, required: true },
    pointsUsed: { type: Number, required: true, min: 0 },
    redemptionId: { type: String, required: true, unique: true },
    // The text encoded into the QR image.
    qrData: { type: String, required: true },
    status: { type: String, enum: ['active', 'used'], default: 'active' },
    usedAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Redemption', redemptionSchema);

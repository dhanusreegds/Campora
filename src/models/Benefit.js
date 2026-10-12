const mongoose = require('mongoose');

const benefitSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    pointsRequired: { type: Number, required: true, min: 1 },
    // Units still available to redeem.
    availability: { type: Number, default: 0, min: 0 },
    icon: { type: String, default: 'gift' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Benefit', benefitSchema);

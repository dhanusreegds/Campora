const { Benefit, Redemption, User } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { assertObjectId } = require('../utils/helpers');
const qr = require('../services/qrService');
const { notify } = require('../services/notificationService');

// GET /api/benefits
exports.list = asyncHandler(async (_req, res) => {
  const benefits = await Benefit.find({ isActive: true }).sort({ pointsRequired: 1 }).lean();
  res.json({ benefits });
});

// POST /api/benefits/:id/redeem   { confirm: true }
exports.redeem = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'benefit');
  if (!req.body || req.body.confirm !== true) {
    throw new ApiError(400, 'Confirm the redemption before points are deducted.');
  }

  const benefit = await Benefit.findOne({ _id: req.params.id, isActive: true });
  if (!benefit) throw new ApiError(404, 'Benefit not found.');
  if (benefit.availability < 1) throw new ApiError(409, `${benefit.name} is out of stock.`);

  // 1) Deduct points only if the balance is sufficient (atomic).
  const deducted = await User.updateOne(
    { _id: req.user._id, points: { $gte: benefit.pointsRequired } },
    { $inc: { points: -benefit.pointsRequired } }
  );
  if (!deducted.matchedCount) {
    throw new ApiError(400, `You need ${benefit.pointsRequired} points for this benefit. You have ${req.user.points}.`);
  }

  const refund = () => User.updateOne({ _id: req.user._id }, { $inc: { points: benefit.pointsRequired } });

  // 2) Reserve one unit of stock (atomic).
  let reserved;
  try {
    reserved = await Benefit.findOneAndUpdate(
      { _id: benefit._id, isActive: true, availability: { $gte: 1 } },
      { $inc: { availability: -1 } },
      { returnDocument: 'after' }
    );
  } catch (err) {
    await refund();
    throw err;
  }
  if (!reserved) {
    await refund();
    throw new ApiError(409, `${benefit.name} just ran out of stock. Your points were not deducted.`);
  }

  // 3) Create the redemption record with a unique ID.
  let redemption;
  for (let attempt = 0; attempt < 5 && !redemption; attempt += 1) {
    const redemptionId = qr.generateRedemptionId();
    try {
      redemption = await Redemption.create({
        user: req.user._id,
        benefit: benefit._id,
        benefitName: benefit.name,
        pointsUsed: benefit.pointsRequired,
        redemptionId,
        qrData: qr.buildQrPayload(redemptionId),
      });
    } catch (err) {
      if (err.code !== 11000) {
        await refund();
        await Benefit.updateOne({ _id: benefit._id }, { $inc: { availability: 1 } });
        throw err;
      }
    }
  }
  if (!redemption) {
    await refund();
    await Benefit.updateOne({ _id: benefit._id }, { $inc: { availability: 1 } });
    throw new ApiError(500, 'Could not generate a unique redemption ID. Please try again.');
  }

  await notify(req.user._id, {
    title: 'Redemption successful',
    message: `${benefit.name} redeemed for ${benefit.pointsRequired} points. Your code is ${redemption.redemptionId}.`,
    type: 'points',
    link: '#/benefits',
  });

  res.status(201).json({
    redemption,
    qrImage: await qr.toDataUrl(redemption.qrData),
    remainingPoints: (await User.findById(req.user._id).select('points')).points,
    demoNotice: 'Demo redemption only. This is not a real coupon or voucher.',
  });
});

// GET /api/redemptions   (history for the current user)
exports.myRedemptions = asyncHandler(async (req, res) => {
  const redemptions = await Redemption.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50).lean();
  res.json({ redemptions });
});

// GET /api/redemptions/:redemptionId   (owner only, includes the QR image)
exports.getRedemption = asyncHandler(async (req, res) => {
  const code = qr.normalizeCode(req.params.redemptionId);
  if (!code) throw new ApiError(400, 'That is not a valid redemption ID.');
  const redemption = await Redemption.findOne({ redemptionId: code, user: req.user._id }).lean();
  if (!redemption) throw new ApiError(404, 'Redemption not found.');
  res.json({ redemption, qrImage: await qr.toDataUrl(redemption.qrData) });
});

// POST /api/redemptions/validate   { code }
// Demo validator: checks whether a code exists and whether it was already used.
exports.validate = asyncHandler(async (req, res) => {
  const code = qr.normalizeCode(req.body && req.body.code);
  if (!code) throw new ApiError(400, 'Enter a code like CAMP-ABC123.');
  const redemption = await Redemption.findOne({ redemptionId: code }).lean();
  if (!redemption) return res.json({ valid: false, message: 'No demo redemption found with this code.' });
  res.json({
    valid: redemption.status === 'active',
    status: redemption.status,
    benefitName: redemption.benefitName,
    usedAt: redemption.usedAt || null,
    message:
      redemption.status === 'active'
        ? 'Valid demo code. It has not been used yet.'
        : 'This demo code was already used.',
  });
});

// POST /api/redemptions/use   { code }
// Demo counter action: marks a code as used. Works only once per code.
exports.markUsed = asyncHandler(async (req, res) => {
  const code = qr.normalizeCode(req.body && req.body.code);
  if (!code) throw new ApiError(400, 'Enter a code like CAMP-ABC123.');
  const redemption = await Redemption.findOneAndUpdate(
    { redemptionId: code, status: 'active' },
    { $set: { status: 'used', usedAt: new Date() } },
    { returnDocument: 'after' }
  );
  if (!redemption) {
    const exists = await Redemption.exists({ redemptionId: code });
    throw new ApiError(exists ? 409 : 404, exists ? 'This demo code was already used.' : 'No demo redemption found with this code.');
  }
  res.json({ redemption, message: `${redemption.benefitName} marked as used.` });
});

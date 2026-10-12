const { HelpRequest, User, PointTransaction } = require('../models');
const pointsConfig = require('../config/points');
const ApiError = require('../utils/ApiError');
const { notify } = require('./notificationService');

const pointsFor = (difficulty) => pointsConfig.byDifficulty[difficulty] ?? pointsConfig.byDifficulty.basic;

/**
 * Marks an accepted request as completed and awards points to the Helper.
 *
 * Duplicate awards are prevented in two layers:
 *   1. a PointTransaction row with a UNIQUE index on the request (only one insert can succeed), and
 *   2. a conditional update that only matches a request that is still "accepted" with pointsAwarded === false.
 */
async function completeRequest(requestId, helperId) {
  const existing = await HelpRequest.findById(requestId).select('assignedHelper status pointsAwarded difficulty postedBy');
  if (!existing || String(existing.assignedHelper) !== String(helperId)) {
    throw new ApiError(404, 'Request not found.');
  }
  if (existing.status === 'completed' || existing.pointsAwarded) {
    throw new ApiError(409, 'This request is already completed and its points were already awarded.');
  }
  if (existing.status !== 'accepted') {
    throw new ApiError(400, 'Only accepted requests can be marked as completed.');
  }

  const points = pointsFor(existing.difficulty);

  // 1) Claim the award. The unique index on PointTransaction.request means only ONE caller can
  //    ever get past this line for a given request, even under concurrent requests.
  let ledger;
  try {
    ledger = await PointTransaction.create({ user: helperId, request: existing._id, points });
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, 'This request was already completed. Points are only awarded once.');
    throw err;
  }

  const undoLedger = () => PointTransaction.deleteOne({ _id: ledger._id }).catch(() => {});

  // 2) Mark the request as completed (only if it is still accepted and not yet awarded).
  let request;
  try {
    request = await HelpRequest.findOneAndUpdate(
      { _id: requestId, assignedHelper: helperId, status: 'accepted', pointsAwarded: false },
      { $set: { status: 'completed', completedAt: new Date(), pointsAwarded: true, pointsValue: points } },
      { returnDocument: 'after' }
    );
  } catch (err) {
    await undoLedger();
    throw err;
  }
  if (!request) {
    await undoLedger();
    throw new ApiError(409, 'This request was already completed. Points are only awarded once.');
  }

  // Count each Seeker once in "students helped".
  const earlier = await HelpRequest.countDocuments({
    assignedHelper: helperId,
    postedBy: request.postedBy,
    status: 'completed',
    _id: { $ne: request._id },
  });

  let helper;
  try {
    await User.updateOne({ _id: helperId }, { $inc: { points, studentsHelped: earlier === 0 ? 1 : 0 } });
    helper = await User.findById(helperId);
  } catch (err) {
    // Roll the request back so the Helper can retry and points stay consistent.
    await HelpRequest.updateOne({ _id: request._id }, { $set: { status: 'accepted', pointsAwarded: false, pointsValue: 0 }, $unset: { completedAt: '' } });
    await undoLedger();
    throw err;
  }

  if (pointsConfig.seekerBonus > 0) {
    await User.updateOne({ _id: request.postedBy }, { $inc: { points: pointsConfig.seekerBonus } });
  }

  await notify(request.postedBy, {
    title: 'Request completed',
    message: `${helper.name} marked "${request.title}" as completed.${pointsConfig.seekerBonus > 0 ? ` You earned ${pointsConfig.seekerBonus} reward points.` : ''}`,
    type: 'completed',
    link: '#/requests',
  });
  await notify(helperId, {
    title: `You earned ${points} points`,
    message: `Thanks for helping with "${request.title}".`,
    type: 'points',
    link: '#/benefits',
  });

  return { request, pointsAwarded: points, helper };
}

module.exports = { completeRequest, pointsFor };

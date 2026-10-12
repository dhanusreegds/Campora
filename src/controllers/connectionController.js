const { Connection } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { PUBLIC_USER_FIELDS } = require('../utils/helpers');

// GET /api/connections   (accepted connections for the current user)
exports.list = asyncHandler(async (req, res) => {
  const isSeeker = req.user.role === 'seeker';
  const otherField = isSeeker ? 'helper' : 'seeker';
  const connections = await Connection.find({ [isSeeker ? 'seeker' : 'helper']: req.user._id, status: 'accepted' })
    .sort({ createdAt: -1 })
    .populate(otherField, PUBLIC_USER_FIELDS)
    .lean();

  res.json({
    connections: connections
      .filter((c) => c[otherField])
      .map((c) => ({ _id: c._id, status: c.status, since: c.createdAt, user: c[otherField] })),
  });
});

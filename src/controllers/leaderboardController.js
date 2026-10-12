const asyncHandler = require('../utils/asyncHandler');
const { getLeaderboard } = require('../services/leaderboardService');

// GET /api/leaderboard?limit=5
exports.list = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 0, 50) || undefined;
  const { entries, total } = await getLeaderboard({ limit });
  res.json({ leaderboard: entries, totalHelpers: total });
});

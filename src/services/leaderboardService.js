const { User } = require('../models');
const { PUBLIC_USER_FIELDS } = require('../utils/helpers');

/**
 * Helpers ordered by their stored points (highest first). Ranks are calculated from the data:
 * Helpers with the same points share a rank.
 */
async function getLeaderboard({ limit } = {}) {
  const helpers = await User.find({ role: 'helper' })
    .select(PUBLIC_USER_FIELDS)
    .sort({ points: -1, studentsHelped: -1, name: 1 })
    .lean();

  let lastPoints = null;
  let lastRank = 0;
  helpers.forEach((h, i) => {
    if (h.points !== lastPoints) {
      lastRank = i + 1;
      lastPoints = h.points;
    }
    h.rank = lastRank;
  });
  return { entries: limit ? helpers.slice(0, limit) : helpers, total: helpers.length };
}

module.exports = { getLeaderboard };

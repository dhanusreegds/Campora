const { HelpRequest, Connection, Announcement } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const matching = require('../services/matching');
const { getLeaderboard } = require('../services/leaderboardService');

const upcomingAnnouncements = (limit) => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return Announcement.find({ eventDate: { $gte: startOfToday } })
    .sort({ eventDate: 1 })
    .limit(limit)
    .populate('createdBy', 'name username')
    .lean();
};

// GET /api/dashboard/seeker
exports.seeker = asyncHandler(async (req, res) => {
  const me = req.user;
  const [connections, pending, accepted, completed, recentRequests, leaderboard, announcements] = await Promise.all([
    Connection.countDocuments({ seeker: me._id, status: 'accepted' }),
    HelpRequest.countDocuments({ postedBy: me._id, status: 'pending' }),
    HelpRequest.countDocuments({ postedBy: me._id, status: 'accepted' }),
    HelpRequest.countDocuments({ postedBy: me._id, status: 'completed' }),
    HelpRequest.find({ postedBy: me._id }).sort({ createdAt: -1 }).limit(5).select('requiredSkills category').lean(),
    getLeaderboard({ limit: 5 }),
    upcomingAnnouncements(3),
  ]);

  // Recommend Helpers from the topics the Seeker asked about recently (or listed on their profile).
  const topicSkills = [...new Set([...recentRequests.flatMap((r) => r.requiredSkills || []), ...(me.skills || [])])].slice(0, 12);
  let recommended = [];
  let basedOn = 'top';
  if (topicSkills.length) {
    const result = await matching.findMatches({ requiredSkills: topicSkills }, { limit: 4, minScore: 1 });
    recommended = result.matches.map((m) => ({
      _id: m.helper._id,
      name: m.helper.name,
      username: m.helper.username,
      department: m.helper.department,
      verified: m.helper.verified,
      profileImage: m.helper.profileImage,
      points: m.helper.points,
      score: m.score,
      matchedSkills: m.matchedSkills,
      explanation: m.explanation,
    }));
    if (recommended.length) basedOn = 'interests';
  }
  if (!recommended.length) {
    const top = await getLeaderboard({ limit: 4 });
    recommended = top.entries.map((h) => ({
      _id: h._id,
      name: h.name,
      username: h.username,
      department: h.department,
      verified: h.verified,
      profileImage: h.profileImage,
      points: h.points,
      matchedSkills: (h.skills || []).slice(0, 3),
    }));
  }

  res.json({
    stats: { connections, pending, accepted, completed, points: me.points },
    recommended,
    recommendedBasedOn: basedOn,
    leaderboard: leaderboard.entries,
    announcements,
  });
});

// GET /api/dashboard/helper
exports.helper = asyncHandler(async (req, res) => {
  const me = req.user;
  const [pending, active, completed, board, announcements] = await Promise.all([
    HelpRequest.countDocuments({
      status: 'pending',
      $or: [
        { type: 'direct', assignedHelper: me._id },
        { type: 'public', 'matchedHelpers.helper': me._id, declinedBy: { $ne: me._id } },
      ],
    }),
    HelpRequest.countDocuments({ assignedHelper: me._id, status: 'accepted' }),
    HelpRequest.countDocuments({ assignedHelper: me._id, status: 'completed' }),
    getLeaderboard(),
    upcomingAnnouncements(3),
  ]);

  const mine = board.entries.find((h) => String(h._id) === String(me._id));

  res.json({
    stats: {
      studentsHelped: me.studentsHelped,
      points: me.points,
      pending,
      active,
      completed,
    },
    // Calculated from stored points, not a fixed value.
    rank: mine ? mine.rank : null,
    totalHelpers: board.total,
    announcements,
  });
});

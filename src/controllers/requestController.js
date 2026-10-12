const { HelpRequest, Connection, User } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const {
  assertObjectId,
  parseSkills,
  cleanText,
  parseDate,
  containsRegex,
  MINI_USER_FIELDS,
} = require('../utils/helpers');
const matching = require('../services/matching');
const matchingConfig = require('../config/matching');
const { notify } = require('../services/notificationService');
const { completeRequest, pointsFor } = require('../services/pointsService');
const { onActivity } = require('../services/challengeService');

const DIFFICULTIES = ['basic', 'intermediate', 'advanced'];

function readCommonFields(body) {
  const difficulty = body.difficulty || 'basic';
  if (!DIFFICULTIES.includes(difficulty)) throw new ApiError(400, 'Difficulty must be basic, intermediate or advanced.');
  return {
    title: cleanText(body.title, { max: 140, required: true, label: 'Title' }),
    description: cleanText(body.description, { max: 2000, required: true, label: 'Description' }),
    category: cleanText(body.category, { max: 80, label: 'Subject' }) || 'General',
    difficulty,
    deadline: parseDate(body.deadline, { label: 'Deadline' }),
    requiredSkills: parseSkills(body.requiredSkills),
  };
}

// POST /api/requests/direct   (Seeker -> one chosen Helper)
exports.createDirect = asyncHandler(async (req, res) => {
  const body = req.body || {};
  assertObjectId(body.helperId, 'helper');
  const helper = await User.findOne({ _id: body.helperId, role: 'helper' });
  if (!helper) throw new ApiError(404, 'Helper not found.');

  const fields = readCommonFields(body);
  const assistanceType = cleanText(body.assistanceType, { max: 60, label: 'Assistance type' });

  const duplicate = await HelpRequest.exists({
    postedBy: req.user._id,
    assignedHelper: helper._id,
    type: 'direct',
    status: 'pending',
    title: fields.title,
  });
  if (duplicate) throw new ApiError(409, `You already sent this request to ${helper.name}. Wait for a reply first.`);

  const { skills, match } = await matching.scoreForHelper(fields, helper.toObject());

  const request = await HelpRequest.create({
    ...fields,
    requiredSkills: skills,
    assistanceType,
    type: 'direct',
    postedBy: req.user._id,
    assignedHelper: helper._id,
    matchingScore: match ? match.score : 0,
  });

  await notify(helper._id, {
    title: 'New help request',
    message: `${req.user.name} asked for help: "${request.title}".`,
    type: 'request',
    link: '#/requests',
  });

  await onActivity(req.user._id); // Campus Challenges: "Ask for help"
  res.status(201).json({ request });
});

// POST /api/requests/public   (Seeker posts a public question; Helpers are matched by skill)
exports.createPublic = asyncHandler(async (req, res) => {
  const fields = readCommonFields(req.body || {});

  const result = await matching.findMatches(fields);
  const { matches } = result;

  const request = await HelpRequest.create({
    ...fields,
    requiredSkills: result.skills,
    type: 'public',
    postedBy: req.user._id,
    matchingScore: matches.length ? matches[0].score : 0,
    matchedHelpers: matches.map((m) => ({
      helper: m.helper._id,
      score: m.score,
      matchedSkills: m.matchedSkills,
      explanation: m.explanation,
    })),
  });

  // Notify the best-fitting Helpers.
  const toNotify = matches.slice(0, matchingConfig.maxNotified);
  await Promise.all(
    toNotify.map((m) =>
      notify(m.helper._id, {
        title: 'New Help Request',
        message: `A post matching your skills has been recommended to you: "${request.title}" (matched: ${m.matchedSkills.join(', ')}).`,
        type: 'match',
        link: '#/requests',
      })
    )
  );

  await onActivity(req.user._id); // Campus Challenges: "Ask for help"
  res.status(201).json({
    request,
    engine: result.engine,
    skills: result.skills,
    skillsSource: result.skillsSource,
    matches: matches.map((m, index) => ({
      helper: {
        _id: m.helper._id,
        name: m.helper.name,
        username: m.helper.username,
        department: m.helper.department,
        verified: m.helper.verified,
        profileImage: m.helper.profileImage,
        skills: m.helper.skills,
        points: m.helper.points,
      },
      score: m.score,
      matchedSkills: m.matchedSkills,
      missingSkills: m.missingSkills,
      explanation: m.explanation,
      message: matching.describeFit(m),
      notified: index < toNotify.length,
    })),
  });
});

// GET /api/requests/mine   (Seeker: everything they sent or posted)
exports.listMine = asyncHandler(async (req, res) => {
  const requests = await HelpRequest.find({ postedBy: req.user._id })
    .sort({ createdAt: -1 })
    .populate('assignedHelper', MINI_USER_FIELDS)
    .populate('matchedHelpers.helper', MINI_USER_FIELDS)
    .lean();
  res.json({ requests });
});

function tabFilter(tab, me) {
  switch (tab) {
    case 'incoming':
      return {
        status: 'pending',
        $or: [
          { type: 'direct', assignedHelper: me },
          { type: 'public', 'matchedHelpers.helper': me, declinedBy: { $ne: me } },
        ],
      };
    case 'open':
      return { type: 'public', status: 'pending', declinedBy: { $ne: me }, 'matchedHelpers.helper': { $ne: me } };
    case 'active':
      return { assignedHelper: me, status: 'accepted' };
    case 'history':
      return { assignedHelper: me, status: { $in: ['completed', 'rejected'] } };
    default:
      throw new ApiError(400, 'Unknown tab.');
  }
}

// GET /api/requests/incoming?tab=incoming|open|active|history&subject=&skill=
exports.listForHelper = asyncHandler(async (req, res) => {
  const me = req.user._id;
  const tab = req.query.tab || 'incoming';
  const filter = tabFilter(tab, me);

  const extra = [];
  if (req.query.subject) extra.push({ category: containsRegex(req.query.subject) });
  if (req.query.skill) extra.push({ requiredSkills: containsRegex(req.query.skill) });
  const query = extra.length ? { $and: [filter, ...extra] } : filter;

  const tabs = ['incoming', 'open', 'active', 'history'];
  const [requests, ...counts] = await Promise.all([
    HelpRequest.find(query).sort({ createdAt: -1 }).limit(100).populate('postedBy', MINI_USER_FIELDS).lean(),
    ...tabs.map((t) => HelpRequest.countDocuments(tabFilter(t, me))),
  ]);

  const shaped = requests.map((r) => {
    const myMatch = (r.matchedHelpers || []).find((m) => String(m.helper) === String(me)) || null;
    const { matchedHelpers, declinedBy, ...rest } = r; // never expose other Helpers' match data
    return { ...rest, seeker: r.postedBy, myMatch, potentialPoints: pointsFor(r.difficulty) };
  });

  res.json({ requests: shaped, counts: Object.fromEntries(tabs.map((t, i) => [t, counts[i]])) });
});

// POST /api/requests/:id/accept
exports.accept = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'request');
  const me = req.user._id;

  const request = await HelpRequest.findOneAndUpdate(
    {
      _id: req.params.id,
      status: 'pending',
      $or: [
        { type: 'direct', assignedHelper: me },
        { type: 'public', declinedBy: { $ne: me } },
      ],
    },
    { $set: { status: 'accepted', assignedHelper: me, acceptedAt: new Date() } },
    { returnDocument: 'after' }
  );

  if (!request) {
    const existing = await HelpRequest.findById(req.params.id).select('status');
    if (!existing) throw new ApiError(404, 'Request not found.');
    if (existing.status !== 'pending') throw new ApiError(409, 'This request was already handled.');
    throw new ApiError(403, 'You cannot accept this request.');
  }

  // Accepting creates the connection that unlocks chat.
  try {
    await Connection.findOneAndUpdate(
      { seeker: request.postedBy, helper: me },
      { $set: { status: 'accepted' }, $setOnInsert: { request: request._id } },
      { upsert: true, returnDocument: 'after' }
    );
  } catch (err) {
    if (err.code !== 11000) throw err; // connection already exists
  }

  await notify(request.postedBy, {
    title: 'Request accepted',
    message: `${req.user.name} accepted "${request.title}". You can chat now.`,
    type: 'accepted',
    link: `#/chat/${me}`,
  });

  res.json({ request });
});

// POST /api/requests/:id/reject
exports.reject = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'request');
  const me = req.user._id;
  const existing = await HelpRequest.findById(req.params.id);
  if (!existing) throw new ApiError(404, 'Request not found.');
  if (existing.status !== 'pending') throw new ApiError(409, 'This request was already handled.');

  if (existing.type === 'direct') {
    if (String(existing.assignedHelper) !== String(me)) throw new ApiError(403, 'You cannot reject this request.');
    const request = await HelpRequest.findOneAndUpdate(
      { _id: existing._id, status: 'pending' },
      { $set: { status: 'rejected', rejectedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (!request) throw new ApiError(409, 'This request was already handled.');
    await notify(existing.postedBy, {
      title: 'Request declined',
      message: `${req.user.name} could not take "${existing.title}". Try another Helper.`,
      type: 'rejected',
      link: '#/requests',
    });
    return res.json({ request });
  }

  // Public post: only hide it for this Helper. It stays open for others.
  await HelpRequest.updateOne({ _id: existing._id }, { $addToSet: { declinedBy: me } });
  res.json({ request: existing, hiddenForYou: true });
});

// POST /api/requests/:id/complete
exports.complete = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'request');
  const { request, pointsAwarded, helper } = await completeRequest(req.params.id, req.user._id);
  // Campus Challenges: completed requests count for both people.
  await Promise.all([onActivity(helper._id), onActivity(request.postedBy)]);
  res.json({ request, pointsAwarded, totalPoints: helper.points, studentsHelped: helper.studentsHelped });
});

const { User, Connection, HelpRequest } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const {
  containsRegex,
  assertObjectId,
  parseSkills,
  cleanText,
  cleanUrl,
  PUBLIC_USER_FIELDS,
} = require('../utils/helpers');

/** For a Seeker: how each Helper relates to them ("connected", "pending" or "none"). */
async function relationsFor(user, helperIds) {
  const map = new Map();
  if (user.role !== 'seeker' || !helperIds.length) return map;
  const [connections, pending] = await Promise.all([
    Connection.find({ seeker: user._id, helper: { $in: helperIds }, status: 'accepted' }).select('helper').lean(),
    HelpRequest.find({ postedBy: user._id, type: 'direct', status: 'pending', assignedHelper: { $in: helperIds } })
      .select('assignedHelper')
      .lean(),
  ]);
  pending.forEach((r) => map.set(String(r.assignedHelper), 'pending'));
  connections.forEach((c) => map.set(String(c.helper), 'connected'));
  return map;
}

// GET /api/helpers?q=&department=&course=&year=&skill=&verified=&sort=
exports.searchHelpers = asyncHandler(async (req, res) => {
  const { q, department, course, year, skill, verified, sort } = req.query;
  const filter = { role: 'helper' };

  const words = String(q || '').trim().split(/\s+/).filter(Boolean).slice(0, 6);
  if (words.length) {
    const fields = ['name', 'username', 'skills', 'department', 'course', 'expertise', 'bio'];
    filter.$and = words.map((w) => {
      const rx = containsRegex(w);
      return { $or: fields.map((f) => ({ [f]: rx })) };
    });
  }
  if (department) filter.department = containsRegex(department);
  if (course) filter.course = containsRegex(course);
  if (year) {
    const y = Number(year);
    if (Number.isInteger(y)) filter.year = y;
  }
  if (skill) filter.skills = containsRegex(skill);
  if (verified === 'true') filter.verified = true;

  const order = sort === 'name' ? { name: 1 } : { points: -1, name: 1 };
  const helpers = await User.find(filter).select(PUBLIC_USER_FIELDS).sort(order).limit(60).lean();
  const relations = await relationsFor(req.user, helpers.map((h) => h._id));

  res.json({
    helpers: helpers.map((h) => ({ ...h, relation: relations.get(String(h._id)) || 'none' })),
  });
});

// GET /api/helpers/:id
exports.getHelper = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id);
  const helper = await User.findOne({ _id: req.params.id, role: 'helper' }).select(PUBLIC_USER_FIELDS).lean();
  if (!helper) throw new ApiError(404, 'Helper not found.');

  const [contributions, relations] = await Promise.all([
    HelpRequest.find({ assignedHelper: helper._id, status: 'completed' })
      .sort({ completedAt: -1 })
      .limit(6)
      .select('title category difficulty completedAt pointsValue')
      .lean(),
    relationsFor(req.user, [helper._id]),
  ]);

  res.json({ helper: { ...helper, relation: relations.get(String(helper._id)) || 'none' }, contributions });
});

// PUT /api/users/me
exports.updateMe = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const user = req.user;

  // Only these fields can be edited. Role, points and the verified badge can never be changed here.
  if (body.name !== undefined) user.name = cleanText(body.name, { max: 80, required: true, label: 'Name' });
  if (body.department !== undefined) user.department = cleanText(body.department, { max: 80, label: 'Department' });
  if (body.course !== undefined) user.course = cleanText(body.course, { max: 80, label: 'Course' });
  if (body.year !== undefined) {
    if (body.year === '' || body.year === null) user.year = undefined;
    else {
      const y = Number(body.year);
      if (!(y >= 1 && y <= 6)) throw new ApiError(400, 'Year of study must be between 1 and 6.');
      user.year = y;
    }
  }
  if (body.skills !== undefined) user.skills = parseSkills(body.skills);
  if (body.bio !== undefined) user.bio = cleanText(body.bio, { max: 600, label: 'Bio' });
  if (body.profileImage !== undefined) user.profileImage = cleanUrl(body.profileImage, 'Profile image link');
  if (user.role === 'helper') {
    if (body.expertise !== undefined) user.expertise = cleanText(body.expertise, { max: 600, label: 'Expertise' });
    if (body.availability !== undefined) user.availability = cleanText(body.availability, { max: 120, label: 'Availability' });
  }

  await user.save();
  res.json({ user });
});

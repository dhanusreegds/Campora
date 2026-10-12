const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { jwtSecret, jwtExpiresIn } = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { parseSkills, cleanText } = require('../utils/helpers');

const signToken = (user) => jwt.sign({ sub: String(user._id), role: user.role }, jwtSecret, { expiresIn: jwtExpiresIn });
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

exports.login = asyncHandler(async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) throw new ApiError(400, 'Enter your username and password.');

  const user = await User.findOne({ username: String(username).toLowerCase().trim() }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Username or password is incorrect.');
  }
  if (role && user.role !== role) {
    throw new ApiError(403, `This is a ${capitalize(user.role)} account. Use the ${capitalize(user.role)} login instead.`);
  }
  res.json({ token: signToken(user), user });
});

exports.register = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const name = cleanText(body.name, { max: 80, required: true, label: 'Name' });
  const username = cleanText(body.username, { max: 24, required: true, label: 'Username' }).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  const role = body.role;

  if (!['seeker', 'helper'].includes(role)) throw new ApiError(400, 'Choose whether you are a Seeker or a Helper.');
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    throw new ApiError(400, 'Username must be 3-24 characters: lowercase letters, numbers and underscores.');
  }
  if (password.length < 6) throw new ApiError(400, 'Password must be at least 6 characters.');
  if (await User.exists({ username })) throw new ApiError(409, 'That username is already taken.');

  const year = body.year ? Number(body.year) : undefined;
  if (year !== undefined && !(year >= 1 && year <= 6)) throw new ApiError(400, 'Year of study must be between 1 and 6.');

  const user = await User.create({
    name,
    username,
    password: await User.hashPassword(password),
    role,
    department: cleanText(body.department, { max: 80 }),
    course: cleanText(body.course, { max: 80 }),
    year,
    skills: parseSkills(body.skills),
    // New accounts are never verified: the badge is assigned manually in this prototype.
    verified: false,
    points: 0,
  });
  res.status(201).json({ token: signToken(user), user });
});

exports.me = asyncHandler(async (req, res) => {
  res.json({ user: req.user });
});

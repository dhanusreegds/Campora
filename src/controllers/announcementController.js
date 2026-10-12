const { Announcement } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { assertObjectId, cleanText, cleanUrl, parseDate } = require('../utils/helpers');

// GET /api/announcements   (chronological by event date, soonest first)
exports.list = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.upcoming === 'true') {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    filter.eventDate = { $gte: startOfToday };
  }
  const limit = Math.min(Number(req.query.limit) || 100, 100);
  const announcements = await Announcement.find(filter)
    .sort({ eventDate: 1 })
    .limit(limit)
    .populate('createdBy', 'name username verified')
    .lean();
  res.json({ announcements });
});

// POST /api/announcements   (Helpers only)
exports.create = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const announcement = await Announcement.create({
    title: cleanText(body.title, { max: 140, required: true, label: 'Title' }),
    description: cleanText(body.description, { max: 1500, required: true, label: 'Description' }),
    eventDate: parseDate(body.eventDate, { label: 'Event date', required: true }),
    venue: cleanText(body.venue, { max: 120, label: 'Venue' }),
    organizer: cleanText(body.organizer, { max: 120, label: 'Organizer' }) || req.user.name,
    category: ['general', 'workshop', 'club', 'technical', 'hackathon'].includes(body.category) ? body.category : 'general',
    registrationLink: cleanUrl(body.registrationLink, 'Registration link'),
    createdBy: req.user._id,
  });
  res.status(201).json({ announcement });
});

// DELETE /api/announcements/:id   (only the Helper who posted it)
exports.remove = asyncHandler(async (req, res) => {
  assertObjectId(req.params.id, 'announcement');
  const result = await Announcement.deleteOne({ _id: req.params.id, createdBy: req.user._id });
  if (!result.deletedCount) throw new ApiError(404, 'Announcement not found, or it was posted by someone else.');
  res.json({ ok: true });
});

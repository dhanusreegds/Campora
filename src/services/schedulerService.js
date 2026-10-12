// Background upkeep, run every 30 seconds while the server is up:
//   archive finished Help Rooms, send reminders, expire unanswered requests, prepare weekly challenges.
// Every action is idempotent (atomic flags / unique ledgers), and Help Room status is also derived from the
// clock on each request, so nothing breaks if the server was off for a while.
const { HelpRoom, MeetingRequest, ChallengeCompletion, User, WeeklyChallenge } = require('../models');
const hs = require('../config/helpSessions');
const cfg = require('../config/challenges');
const roomService = require('./roomService');
const meetingService = require('./meetingService');
const challengeService = require('./challengeService');
const { notify, notifyOnce } = require('./notificationService');

const MIN = 60 * 1000;
let lastEndingCheck = 0;

const roomMeta = (room) => ({
  startAt: room.scheduledStart, durationMinutes: Math.round((room.scheduledEnd - room.scheduledStart) / MIN), topic: room.title, roomId: room.roomId,
});

async function archiveFinishedRooms(now) {
  const finished = await HelpRoom.find({ archivedAt: null, cancelledAt: null, scheduledEnd: { $lte: now } }).limit(50);
  for (const room of finished) await roomService.archive(room, {});
  return finished.length;
}

async function sendRoomNotices(now) {
  let sent = 0;
  // Reminder: one hour before (only for sessions booked more than an hour ahead).
  const soon = await HelpRoom.find({
    archivedAt: null, cancelledAt: null, reminderSent: false,
    scheduledStart: { $gt: now, $lte: new Date(now.getTime() + hs.REMINDER_MINUTES * MIN) },
  });
  for (const room of soon) {
    const claimed = await HelpRoom.findOneAndUpdate({ _id: room._id, reminderSent: false }, { $set: { reminderSent: true } });
    if (!claimed || room.scheduledStart - room.createdAt < hs.REMINDER_MINUTES * MIN) continue;
    for (const uid of [room.seeker, room.helper]) {
      await notify(uid, {
        title: 'Meeting reminder', message: `"${room.title}" starts at ${meetingService.whenText(room.scheduledStart)}.`,
        type: 'room', link: `#/room/${room.roomId}`, actionLabel: 'Open Help Room', meta: roomMeta(room),
      });
    }
    sent += 1;
  }
  // Starting soon: ten minutes before the start (the room opens a few minutes before).
  const starting = await HelpRoom.find({
    archivedAt: null, cancelledAt: null, startingSoonSent: false,
    scheduledStart: { $lte: new Date(now.getTime() + hs.STARTING_SOON_MINUTES * MIN) }, scheduledEnd: { $gt: now },
  });
  for (const room of starting) {
    const claimed = await HelpRoom.findOneAndUpdate({ _id: room._id, startingSoonSent: false }, { $set: { startingSoonSent: true } });
    if (!claimed || room.scheduledStart - room.createdAt < hs.STARTING_SOON_MINUTES * MIN) continue;
    for (const uid of [room.seeker, room.helper]) {
      await notify(uid, {
        title: 'Session starting soon',
        message: `"${room.title}" starts at ${meetingService.whenText(room.scheduledStart)}. The Help Room opens ${hs.JOIN_EARLY_MINUTES} minutes before.`,
        type: 'room', link: `#/room/${room.roomId}`, actionLabel: 'Join Help Room', meta: roomMeta(room),
      });
    }
    sent += 1;
  }
  return sent;
}

async function expireOpenRequests(now) {
  const stale = await MeetingRequest.find({ status: { $in: meetingService.OPEN_STATUSES }, startAt: { $lte: now } }).limit(100);
  for (const m of stale) {
    if (!(await MeetingRequest.findOneAndUpdate({ _id: m._id, status: m.status }, { $set: { status: 'expired' } }))) continue;
    await notify(m.seeker, {
      title: 'Request expired',
      message: `Your request "${m.topic}" got no answer before ${meetingService.whenText(m.startAt)}. Try another time or mentor.`,
      type: 'meeting', link: '#/sessions',
    });
  }
  return stale.length;
}

async function weeklyChallengeUpkeep(now) {
  const week = await challengeService.ensureCurrentWeekPlans(now);
  const msLeft = week.end.getTime() - now.getTime();
  if (msLeft > cfg.ENDING_SOON_HOURS * 3600 * 1000 || Date.now() - lastEndingCheck < 10 * MIN) return 0;
  lastEndingCheck = Date.now();

  let notified = 0;
  for (const audience of ['seeker', 'helper']) {
    const plan = await WeeklyChallenge.findOne({ weekKey: week.weekKey, audience }).lean();
    if (!plan || !plan.items.length) continue;
    const done = await ChallengeCompletion.aggregate([{ $match: { weekKey: week.weekKey, periodType: 'weekly' } }, { $group: { _id: '$user', n: { $sum: 1 } } }]);
    const doneBy = new Map(done.map((d) => [String(d._id), d.n]));
    for (const u of await User.find({ role: audience }).select('_id').lean()) {
      const left = plan.items.length - (doneBy.get(String(u._id)) || 0);
      if (left <= 0) continue;
      const sent = await notifyOnce(u._id, `week-end:${week.weekKey}`, {
        title: 'Weekly challenges ending soon',
        message: `${left} challenge${left === 1 ? '' : 's'} left this week. About ${Math.max(1, Math.round(msLeft / 3600000))} hours to go.`,
        type: 'challenge', link: '#/challenges', actionLabel: 'Open challenges',
      });
      if (sent) notified += 1;
    }
  }
  return notified;
}

async function tick(now = new Date()) {
  const result = {};
  const steps = [['archived', archiveFinishedRooms], ['roomNotices', sendRoomNotices], ['expired', expireOpenRequests], ['weekly', weeklyChallengeUpkeep]];
  for (const [name, fn] of steps) {
    try { result[name] = await fn(now); } catch (err) { console.error(`Scheduler step "${name}" failed:`, err.message); result[name] = 'error'; }
  }
  return result;
}

function startScheduler(intervalMs = 30000) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await tick(); } finally { running = false; }
  };
  const timer = setInterval(run, intervalMs);
  timer.unref();
  run();
  return () => clearInterval(timer);
}

module.exports = { tick, startScheduler };

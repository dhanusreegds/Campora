// Demo data for Help Sessions and Campus Challenges. Called at the end of seedDatabase().
const crypto = require('crypto');
const { User, Announcement, MeetingRequest, HelpRoom, RoomEvent, CampusChallenge, WeeklyChallenge, ChallengeCompletion, UserStreak } = require('../models');
const challengeService = require('../services/challengeService');
const { weekOf, addDays, dateKeyOf } = require('../utils/time');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const roundTo5 = (ms) => Math.ceil(ms / (5 * MIN)) * 5 * MIN;

async function seedFeatures() {
  await challengeService.ensurePool();
  const now = new Date();
  const week = weekOf(now);
  const [seeker, rahul, priya, arjun] = await Promise.all(['seeker_demo', 'helper_demo', 'priya_nair', 'arjun_mehta'].map((u) => User.findOne({ username: u })));

  // Campus events this week: they make the event challenges possible and checkable.
  await Announcement.insertMany([
    { title: 'Git and GitHub Workshop', description: 'Hands-on workshop: branches, pull requests and collaborating on a small project. Bring your laptop.', eventDate: new Date(now.getTime() + 90 * MIN), venue: 'Lab 3, CSE Block', organizer: 'Coding Club', category: 'workshop', createdBy: rahul._id },
    { title: 'Robotics Club Open House', description: 'See what the Robotics Club is building this semester and meet the team.', eventDate: new Date(week.start.getTime() + 4 * DAY + 14 * HOUR), venue: 'Innovation Hub', organizer: 'Robotics Club', category: 'club', createdBy: arjun._id },
    { title: 'Tech Talk: Careers in Machine Learning', description: 'A guest talk on getting started in ML, followed by Q&A.', eventDate: new Date(week.start.getTime() + 5 * DAY + 15 * HOUR), venue: 'Auditorium', organizer: 'IT Department', category: 'technical', createdBy: priya._id },
  ]);

  // Earlier weeks, so the weekly draw has history to avoid repeating.
  for (const back of [2, 1, 0]) {
    const w = weekOf(new Date(now.getTime() - back * 7 * DAY));
    for (const audience of ['seeker', 'helper']) {
      const items = await challengeService.generatePlanItems(w, audience);
      await WeeklyChallenge.create({ weekKey: w.weekKey, year: w.year, week: w.week, audience, startKey: w.startKey, endKey: w.endKey, items });
    }
  }

  // Streak history (demo only: no extra points are added to balances).
  const dailies = await CampusChallenge.find({ kind: 'daily', audience: 'all' }).sort({ key: 1 }).lean();
  const logDaily = (user, daysAgo, i) => {
    const dateKey = addDays(dateKeyOf(now), -daysAgo);
    const c = dailies[i % dailies.length];
    return ChallengeCompletion.create({
      user: user._id, challenge: c._id, challengeKey: c.key, title: c.title, periodType: 'daily', periodKey: dateKey,
      weekKey: weekOf(new Date(now.getTime() - daysAgo * DAY)).weekKey, dateKey, pointsAwarded: c.points, source: 'self',
      proofNote: 'Completed as part of the demo data.', completedAt: new Date(now.getTime() - daysAgo * DAY),
    });
  };
  const setStreak = (user, current, longest, daysAgoLast) =>
    UserStreak.create({ user: user._id, currentStreak: current, longestStreak: longest, lastCompletedDate: addDays(dateKeyOf(now), -daysAgoLast) });

  for (let d = 1; d <= 3; d += 1) await logDaily(seeker, d, d);
  await setStreak(seeker, 3, 5, 1); // yesterday was active: finishing a task today makes it 4
  for (let d = 1; d <= 2; d += 1) await logDaily(rahul, d, d + 4);
  await setStreak(rahul, 2, 2, 1);
  for (let d = 0; d <= 4; d += 1) await logDaily(priya, d, d + 8);
  await setStreak(priya, 5, 5, 0);
  await logDaily(arjun, 0, 3);
  await setStreak(arjun, 1, 1, 0);

  // Help Sessions
  const makeRoom = (m, extra = {}) =>
    HelpRoom.create({ meeting: m._id, seeker: m.seeker, helper: m.helper, roomId: crypto.randomBytes(12).toString('hex'), title: m.topic, category: m.category, scheduledStart: m.startAt, scheduledEnd: m.endAt, ...extra });

  // 1) Accepted and upcoming: Ananya and Rahul, tomorrow.
  const upStart = new Date(roundTo5(now.getTime() + 26 * HOUR));
  const upcoming = await MeetingRequest.create({
    seeker: seeker._id, helper: rahul._id, category: 'resume_review', topic: 'Resume review for internship applications',
    reason: 'I am applying for summer internships and want feedback on my projects section.',
    startAt: upStart, durationMinutes: 20, endAt: new Date(upStart.getTime() + 20 * MIN), status: 'accepted', respondedAt: now,
  });
  await makeRoom(upcoming, { reminderSent: true, startingSoonSent: true });

  // 2) Pending: Ananya asked Priya.
  const penStart = new Date(roundTo5(now.getTime() + 50 * HOUR));
  await MeetingRequest.create({
    seeker: seeker._id, helper: priya._id, category: 'coding_help', topic: 'Understanding pandas groupby',
    reason: 'My groupby results look wrong and I cannot tell why.',
    startAt: penStart, durationMinutes: 30, endAt: new Date(penStart.getTime() + 30 * MIN), status: 'pending',
  });

  // 3) A finished session with notes, chat and code history.
  const pastStart = new Date(roundTo5(now.getTime() - 3 * DAY));
  const past = await MeetingRequest.create({
    seeker: seeker._id, helper: rahul._id, category: 'subject_doubt', topic: 'CPU scheduling doubts', reason: 'Round Robin and priority scheduling.',
    startAt: pastStart, durationMinutes: 30, endAt: new Date(pastStart.getTime() + 30 * MIN), status: 'completed', respondedAt: new Date(pastStart.getTime() - DAY),
  });
  const pastRoom = await makeRoom(past, {
    archivedAt: past.endAt, outcome: 'completed',
    seekerState: { joinedAt: pastStart, lastSeen: past.endAt }, helperState: { joinedAt: pastStart, lastSeen: past.endAt },
    notes: { text: 'Round Robin: waiting time = completion - burst - arrival.\nTry quantum 2 vs 4 and compare the average.\nHomework: priority scheduling with aging.', version: 3, updatedBy: rahul._id, updatedAt: past.endAt },
    code: { text: '// Round Robin sketch\nconst quantum = 2;\nlet queue = [["P1", 5], ["P2", 3], ["P3", 8]];\n', language: 'javascript', version: 2, updatedBy: rahul._id, updatedAt: past.endAt },
    reminderSent: true, startingSoonSent: true,
  });
  const log = [
    ['system', rahul._id, { text: 'Rahul Kumar joined the room.' }],
    ['system', seeker._id, { text: 'Ananya Sharma joined the room.' }],
    ['chat', seeker._id, { text: 'Hi Rahul! Ready when you are.' }],
    ['chat', rahul._id, { text: 'Hi! Let us start with your Gantt chart for quantum 2.' }],
  ];
  await RoomEvent.insertMany(log.map(([kind, from, payload], i) => ({ room: pastRoom._id, seq: i + 1, kind, from, payload, createdAt: new Date(pastStart.getTime() + i * MIN) })));
  await HelpRoom.updateOne({ _id: pastRoom._id }, { $set: { eventSeq: log.length } });
}

module.exports = { seedFeatures };

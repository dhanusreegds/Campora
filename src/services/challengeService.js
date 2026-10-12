const {
  User, CampusChallenge, WeeklyChallenge, ChallengeCompletion, UserStreak, StreakEvent,
  EventCheckin, Announcement, HelpRoom, HelpRequest,
} = require('../models');
const cfg = require('../config/challenges');
const ApiError = require('../utils/ApiError');
const { cleanText, cleanUrl } = require('../utils/helpers');
const { weekOf, addDays, dateKeyOf, startOfDay } = require('../utils/time');
const { notify, notifyOnce } = require('./notificationService');

// ------------------------------------------------------------------ randomness
// Seeded generator: two requests racing to create the same week produce the same set, and a draw can be reproduced.
function hashStr(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rngFrom(seed) {
  let a = hashStr(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function weightedPick(list, weightOf, rng) {
  const total = list.reduce((n, x) => n + weightOf(x), 0);
  if (!list.length || total <= 0) return list[0];
  let r = rng() * total;
  for (const x of list) { r -= weightOf(x); if (r <= 0) return x; }
  return list[list.length - 1];
}

// ------------------------------------------------------------------ pool
async function ensurePool() {
  const ops = cfg.POOL.map((c) => ({
    updateOne: {
      filter: { key: c.key },
      // "active" is only set on first insert, so switching a challenge off in the database sticks.
      update: { $set: { ...c }, $setOnInsert: { active: true } },
      upsert: true,
    },
  }));
  await CampusChallenge.bulkWrite(ops, { ordered: false });
}

const snapshot = (c) => ({
  challenge: c._id, key: c.key, title: c.title, description: c.description, category: c.category,
  difficulty: c.difficulty, points: c.points, verificationType: c.verificationType, target: c.target || 1,
  eventCategory: c.eventCategory || '',
});

// ------------------------------------------------------------------ weekly plan
async function generatePlanItems(week, audience, { previousPlans } = {}) {
  const pool = await CampusChallenge.find({ kind: 'weekly', active: true, audience: { $in: ['all', audience] } }).lean();

  // Event challenges are only offered when a matching event is actually scheduled this week.
  const events = await Announcement.find({ eventDate: { $gte: week.start, $lt: week.end } }).select('category').lean();
  const eventCats = new Set(events.map((e) => e.category));
  let candidates = pool.filter((c) => c.verificationType !== 'event' || eventCats.has(c.eventCategory));

  // Recency: what was used in the last three weeks for this audience.
  const previous = previousPlans || (await WeeklyChallenge.find({ audience, startKey: { $lt: week.startKey } }).sort({ startKey: -1 }).limit(3).lean());
  const age = new Map();
  previous.forEach((plan, i) => plan.items.forEach((it) => { if (!age.has(String(it.challenge))) age.set(String(it.challenge), i + 1); }));
  const weight = (c) => {
    const a = age.get(String(c._id));
    return a === 1 ? 0.03 : a === 2 ? 0.3 : a === 3 ? 0.65 : 1;
  };

  // Never repeat last week's set when the pool is big enough to avoid it.
  const fresh = candidates.filter((c) => age.get(String(c._id)) !== 1);
  if (fresh.length >= cfg.WEEKLY_SIZE + 2) candidates = fresh;

  const rng = rngFrom(`${week.weekKey}:${audience}`);
  const n = Math.min(cfg.WEEKLY_SIZE, candidates.length);
  // Mix of difficulties: one hard, the rest split between easy and medium.
  const hard = n >= 4 ? 1 : 0;
  const easy = Math.ceil((n - hard) / 2);
  const slots = [...Array(easy).fill('easy'), ...Array(n - hard - easy).fill('medium'), ...Array(hard).fill('hard')];

  const chosen = [];
  const catCount = new Map();
  const eventCount = () => chosen.filter((c) => c.verificationType === 'event').length;
  const left = () => candidates.filter((c) => !chosen.includes(c));

  for (const slot of slots) {
    const tiers = [
      (c) => c.difficulty === slot && !catCount.get(c.category) && (c.verificationType !== 'event' || eventCount() < 1),
      (c) => c.difficulty === slot && (catCount.get(c.category) || 0) < 2 && (c.verificationType !== 'event' || eventCount() < 1),
      (c) => !catCount.get(c.category) && (c.verificationType !== 'event' || eventCount() < 1),
      (c) => (catCount.get(c.category) || 0) < 2,
      () => true,
    ];
    let pick;
    for (const ok of tiers) {
      const options = left().filter(ok);
      if (options.length) { pick = weightedPick(options, weight, rng); break; }
    }
    if (!pick) break;
    chosen.push(pick);
    catCount.set(pick.category, (catCount.get(pick.category) || 0) + 1);
  }
  return chosen.map(snapshot);
}

/** Returns the plan for a week and audience, creating it on first use. */
async function ensurePlan(week, audience) {
  let plan = await WeeklyChallenge.findOne({ weekKey: week.weekKey, audience }).lean();
  if (plan) return { plan, created: false };
  const items = await generatePlanItems(week, audience);
  try {
    const doc = await WeeklyChallenge.create({
      weekKey: week.weekKey, year: week.year, week: week.week, audience,
      startKey: week.startKey, endKey: week.endKey, items,
    });
    plan = doc.toObject();
  } catch (err) {
    if (err.code !== 11000) throw err;
    return { plan: await WeeklyChallenge.findOne({ weekKey: week.weekKey, audience }).lean(), created: false };
  }
  announceNewWeek(plan, audience).catch((e) => console.error('Weekly announcement failed:', e.message));
  return { plan, created: true };
}

async function announceNewWeek(plan, audience) {
  const users = await User.find({ role: audience }).select('_id').lean();
  const total = plan.items.reduce((n, i) => n + i.points, 0);
  for (const u of users) {
    await notifyOnce(u._id, `week-new:${plan.weekKey}`, {
      title: 'New weekly challenges',
      message: `${plan.items.length} fresh challenges are ready, worth up to ${total} points this week.`,
      type: 'challenge', link: '#/challenges',
    });
  }
}

async function ensureCurrentWeekPlans(date = new Date()) {
  const week = weekOf(date);
  await Promise.all(['seeker', 'helper'].map((a) => ensurePlan(week, a)));
  return week;
}

// ------------------------------------------------------------------ daily challenge
async function getDailyPick(user, dateKey) {
  const pool = await CampusChallenge.find({ kind: 'daily', active: true, audience: { $in: ['all', user.role] } }).sort({ key: 1 }).lean();
  if (!pool.length) return null;
  const pickFor = (key, exclude) => {
    const options = exclude ? pool.filter((c) => String(c._id) !== String(exclude)) : pool;
    return options[Math.floor(rngFrom(`${user._id}:${key}`)() * options.length)] || pool[0];
  };
  const yesterday = pickFor(addDays(dateKey, -1), null); // never the same task two days in a row
  return pickFor(dateKey, yesterday._id);
}

// ------------------------------------------------------------------ progress for auto-verified challenges
async function autoProgress(user, item, week) {
  const range = { $gte: week.start, $lt: week.end };
  switch (item.verificationType) {
    case 'session':
      return HelpRoom.countDocuments({ [user.role === 'helper' ? 'helper' : 'seeker']: user._id, outcome: 'completed', archivedAt: range });
    case 'request':
      return HelpRequest.countDocuments(
        user.role === 'helper'
          ? { assignedHelper: user._id, status: 'completed', completedAt: range }
          : { postedBy: user._id, status: 'completed', completedAt: range }
      );
    case 'posted':
      return HelpRequest.countDocuments({ postedBy: user._id, createdAt: range });
    case 'event':
      return EventCheckin.countDocuments({ user: user._id, weekKey: week.weekKey, category: item.eventCategory });
    default:
      return 0;
  }
}
const isAuto = (item) => ['session', 'request', 'posted', 'event'].includes(item.verificationType);

// ------------------------------------------------------------------ streak
const streakPointsFor = (day) => cfg.streak.perDay * Math.min(day, cfg.streak.maxDailyMultiplier);

async function ledgerAward(userId, dateKey, week, kind, streakDay, points) {
  try {
    await StreakEvent.create({ user: userId, dateKey, weekKey: week.weekKey, kind, streakDay, points });
  } catch (err) {
    if (err.code === 11000) return 0; // this day already paid out for this kind
    throw err;
  }
  await User.updateOne({ _id: userId }, { $inc: { points } });
  await UserStreak.updateOne({ user: userId }, { $inc: { streakPoints: points } });
  return points;
}

/** Marks today as active for the user and pays streak points once per day. */
async function bumpStreak(userId, dateKey, week) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    let s = await UserStreak.findOne({ user: userId });
    if (!s) {
      try { s = await UserStreak.create({ user: userId }); } catch (e) { if (e.code !== 11000) throw e; s = await UserStreak.findOne({ user: userId }); }
    }
    if (s.lastCompletedDate === dateKey) return { changed: false, streak: s.currentStreak, points: 0, bonus: 0 };

    const next = s.lastCompletedDate === addDays(dateKey, -1) ? s.currentStreak + 1 : 1;
    // Compare-and-set: only one concurrent request can move the streak forward for this day.
    const updated = await UserStreak.findOneAndUpdate(
      { user: userId, lastCompletedDate: s.lastCompletedDate },
      { $set: { currentStreak: next, lastCompletedDate: dateKey, longestStreak: Math.max(s.longestStreak, next) } },
      { returnDocument: 'after' }
    );
    if (!updated) continue;

    const points = await ledgerAward(userId, dateKey, week, 'daily', next, streakPointsFor(next));
    let bonus = 0;
    if (next === 5) bonus += await ledgerAward(userId, dateKey, week, 'bonus5', next, cfg.streak.fiveDayBonus);
    if (next % 7 === 0) bonus += await ledgerAward(userId, dateKey, week, 'bonus7', next, cfg.streak.weeklyBonus);
    return { changed: true, streak: next, points, bonus };
  }
  return { changed: false, streak: 0, points: 0, bonus: 0 };
}

// ------------------------------------------------------------------ completing a challenge
async function completeChallenge(user, { item, periodType, periodKey, source, proofNote = '', proofUrl = '', week }) {
  const now = new Date();
  const dateKey = dateKeyOf(now);
  const points = item.points;

  // 1) Claim the reward. The unique index means only one caller can get past this for a given user,
  //    challenge and period, even if two requests arrive together.
  let completion;
  try {
    completion = await ChallengeCompletion.create({
      user: user._id, challenge: item.challenge, challengeKey: item.key, title: item.title,
      periodType, periodKey, weekKey: week.weekKey, dateKey, pointsAwarded: points, source, proofNote, proofUrl, completedAt: now,
    });
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, 'You already completed this challenge. Rewards are only given once.');
    throw err;
  }

  // 2) Pay out. If anything fails the claim is removed, so the student can try again.
  try {
    await User.updateOne({ _id: user._id }, { $inc: { points } });
    await UserStreak.updateOne({ user: user._id }, { $inc: { challengePoints: points }, $setOnInsert: { currentStreak: 0, longestStreak: 0, lastCompletedDate: '', streakPoints: 0 } }, { upsert: true });
  } catch (err) {
    await ChallengeCompletion.deleteOne({ _id: completion._id }).catch(() => {});
    throw err;
  }

  const streak = await bumpStreak(user._id, dateKey, week);

  await notify(user._id, {
    title: 'Challenge completed',
    message: `"${item.title}" is done. +${points} points${streak.points ? `, +${streak.points + streak.bonus} streak points` : ''}.`,
    type: 'challenge', link: '#/challenges',
  });
  if (streak.changed && streak.streak >= 2) {
    const milestone = cfg.streak.milestones.includes(streak.streak);
    await notify(user._id, {
      title: milestone ? `${streak.streak}-day streak milestone` : 'Streak maintained',
      message: milestone
        ? `${streak.streak} days in a row. Keep it going!${streak.bonus ? ` Bonus: +${streak.bonus} points.` : ''}`
        : `You are on a ${streak.streak}-day streak.`,
      type: 'streak', link: '#/challenges',
    });
  }
  return { completion, points, streak };
}

/** Student-initiated completion (self-reported or link-proof challenges). */
async function completeManually(user, { challengeKey, scope, note, url }) {
  const week = weekOf(new Date());
  const dateKey = week.today;

  let item;
  let periodType;
  let periodKey;
  if (scope === 'daily') {
    const pick = await getDailyPick(user, dateKey);
    if (!pick || pick.key !== challengeKey) throw new ApiError(400, 'That is not today\'s challenge.');
    item = snapshot(pick);
    periodType = 'daily';
    periodKey = dateKey;
  } else {
    const { plan } = await ensurePlan(week, user.role);
    item = plan.items.find((i) => i.key === challengeKey);
    if (!item) throw new ApiError(404, 'That challenge is not part of your challenges this week.');
    periodType = 'weekly';
    periodKey = week.weekKey;
  }

  if (isAuto(item)) throw new ApiError(400, 'This challenge is verified automatically. Do the activity in Campora and it completes by itself.');

  const proofNote = cleanText(note, { max: 500, label: 'Note' });
  const proofUrl = cleanUrl(url, 'Proof link');
  if (item.verificationType === 'link') {
    if (!proofUrl) throw new ApiError(400, 'Paste a link to your work as proof (starting with https://).');
  } else if (proofNote.length < 10) {
    throw new ApiError(400, 'Write at least a short sentence about what you did (10 characters or more).');
  }

  // Limit honor-system claims per day so a whole week cannot be claimed in one sitting.
  const selfToday = await ChallengeCompletion.countDocuments({ user: user._id, dateKey, source: 'self' });
  if (selfToday >= cfg.MAX_SELF_REPORTED_PER_DAY) {
    throw new ApiError(429, `You can log up to ${cfg.MAX_SELF_REPORTED_PER_DAY} self-reported challenges per day. Come back tomorrow for the rest.`);
  }
  return completeChallenge(user, { item, periodType, periodKey, source: 'self', proofNote, proofUrl, week });
}

/** Completes any auto-verified challenge whose requirement is now met. Safe to call any time. */
async function syncAuto(user) {
  const week = weekOf();
  const { plan } = await ensurePlan(week, user.role);
  const completed = [];
  for (const item of plan.items.filter(isAuto)) {
    const done = await ChallengeCompletion.exists({ user: user._id, challenge: item.challenge, periodType: 'weekly', periodKey: week.weekKey });
    if (done) continue;
    if ((await autoProgress(user, item, week)) >= (item.target || 1)) {
      try {
        completed.push(await completeChallenge(user, { item, periodType: 'weekly', periodKey: week.weekKey, source: 'auto', week }));
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 409)) throw err;
      }
    }
  }
  return completed;
}

/** Called after real activity (session ended, request completed, event check-in). Never throws. */
async function onActivity(userId) {
  try {
    const user = await User.findById(userId);
    if (user) await syncAuto(user);
  } catch (err) {
    console.error('Challenge sync failed:', err.message);
  }
}

// ------------------------------------------------------------------ dashboard + leaderboard
async function weeklyLeaderboard(week, { limit = 10, meId } = {}) {
  const [fromChallenges, fromStreaks] = await Promise.all([
    ChallengeCompletion.aggregate([{ $match: { weekKey: week.weekKey } }, { $group: { _id: '$user', points: { $sum: '$pointsAwarded' }, completed: { $sum: 1 } } }]),
    StreakEvent.aggregate([{ $match: { weekKey: week.weekKey } }, { $group: { _id: '$user', points: { $sum: '$points' } } }]),
  ]);
  const totals = new Map();
  fromChallenges.forEach((r) => totals.set(String(r._id), { user: r._id, points: r.points, completed: r.completed }));
  fromStreaks.forEach((r) => {
    const t = totals.get(String(r._id)) || { user: r._id, points: 0, completed: 0 };
    t.points += r.points;
    totals.set(String(r._id), t);
  });
  const rows = [...totals.values()].filter((r) => r.points > 0).sort((a, b) => b.points - a.points || b.completed - a.completed);
  let lastPts = null;
  let lastRank = 0;
  rows.forEach((r, i) => { if (r.points !== lastPts) { lastRank = i + 1; lastPts = r.points; } r.rank = lastRank; });
  const top = rows.slice(0, limit);
  const mine = meId ? rows.find((r) => String(r.user) === String(meId)) : null;
  const ids = [...new Set([...top.map((r) => String(r.user)), ...(mine ? [String(meId)] : [])])];
  const users = await User.find({ _id: { $in: ids } }).select('name username role department year verified profileImage').lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  const shape = (r) => ({ rank: r.rank, points: r.points, completed: r.completed, user: byId.get(String(r.user)) });
  return { entries: top.map(shape).filter((e) => e.user), me: mine ? shape(mine) : null, participants: rows.length };
}

const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

async function getDashboard(user) {
  await syncAuto(user); // pick up any activity that happened since the last visit
  const week = weekOf();
  const { plan } = await ensurePlan(week, user.role);

  const [completions, streakDoc, board, selfToday, fresh, streakWeek, totalDone] = await Promise.all([
    ChallengeCompletion.find({ user: user._id, weekKey: week.weekKey }).lean(),
    UserStreak.findOne({ user: user._id }).lean(),
    weeklyLeaderboard(week, { limit: 5, meId: user._id }),
    ChallengeCompletion.countDocuments({ user: user._id, dateKey: week.today, source: 'self' }),
    User.findById(user._id).select('points').lean(),
    StreakEvent.aggregate([{ $match: { user: user._id, weekKey: week.weekKey } }, { $group: { _id: null, points: { $sum: '$points' } } }]),
    ChallengeCompletion.countDocuments({ user: user._id }),
  ]);

  const weeklyDone = new Map(completions.filter((c) => c.periodType === 'weekly').map((c) => [String(c.challenge), c]));
  const activeDays = new Set(completions.map((c) => c.dateKey));
  const weeklyPoints = completions.reduce((n, c) => n + c.pointsAwarded, 0) + (streakWeek[0] ? streakWeek[0].points : 0);

  const items = [];
  for (const it of plan.items) {
    const done = weeklyDone.get(String(it.challenge));
    const auto = isAuto(it);
    const progress = done ? it.target || 1 : auto ? Math.min(await autoProgress(user, it, week), it.target || 1) : 0;
    items.push({ ...it, completed: !!done, completedAt: done ? done.completedAt : null, pointsAwarded: done ? done.pointsAwarded : 0, auto, progress, target: it.target || 1 });
  }

  const dailyPick = await getDailyPick(user, week.today);
  const dailyDone = dailyPick ? completions.find((c) => c.periodType === 'daily' && c.periodKey === week.today && String(c.challenge) === String(dailyPick._id)) : null;

  const lastDate = streakDoc ? streakDoc.lastCompletedDate : '';
  const alive = lastDate === week.today || lastDate === addDays(week.today, -1);
  const currentStreak = alive && streakDoc ? streakDoc.currentStreak : 0;
  const activeToday = lastDate === week.today;
  const weeklyCompleted = items.filter((i) => i.completed).length;

  return {
    week: {
      weekKey: week.weekKey, startKey: week.startKey, endKey: week.endKey, endsAt: week.end,
      hoursLeft: Math.max(0, Math.round((week.end.getTime() - Date.now()) / 3600000)),
      days: week.days.map((d, i) => ({ dateKey: d, label: DAY_LABELS[i], active: activeDays.has(d), isToday: d === week.today, isFuture: d > week.today })),
    },
    stats: {
      currentStreak,
      longestStreak: streakDoc ? Math.max(streakDoc.longestStreak, currentStreak) : 0,
      activeToday,
      atRisk: !activeToday && currentStreak > 0,
      nextMilestone: cfg.streak.milestones.find((m) => m > currentStreak) || null,
      challengesCompleted: totalDone,
      weeklyCompleted,
      weeklyTotal: items.length,
      completionPercent: items.length ? Math.round((weeklyCompleted / items.length) * 100) : 0,
      weeklyPoints,
      weeklyPointsAvailable: items.reduce((n, i) => n + i.points, 0),
      totalPoints: fresh ? fresh.points : user.points,
      lifetimeChallengePoints: streakDoc ? streakDoc.challengePoints + streakDoc.streakPoints : 0,
    },
    today: dailyPick ? {
      key: dailyPick.key, title: dailyPick.title, description: dailyPick.description, category: dailyPick.category,
      difficulty: dailyPick.difficulty, points: dailyPick.points, verificationType: dailyPick.verificationType,
      completed: !!dailyDone, nextStreakPoints: activeToday ? 0 : streakPointsFor(currentStreak + 1),
    } : null,
    items,
    selfReported: { usedToday: selfToday, limit: cfg.MAX_SELF_REPORTED_PER_DAY },
    streakRules: { perDay: cfg.streak.perDay, cap: cfg.streak.perDay * cfg.streak.maxDailyMultiplier, fiveDayBonus: cfg.streak.fiveDayBonus, weeklyBonus: cfg.streak.weeklyBonus },
    leaderboard: board,
  };
}

/** Compact version for the dashboards. */
async function getSummary(user) {
  const d = await getDashboard(user);
  return { stats: d.stats, today: d.today, week: { weekKey: d.week.weekKey, hoursLeft: d.week.hoursLeft } };
}

// ------------------------------------------------------------------ event check-in
async function checkInToEvent(user, announcement) {
  // Check-in opens 2 hours before the event and closes at the end of the following day.
  const opens = new Date(announcement.eventDate.getTime() - 2 * 3600 * 1000);
  const closes = startOfDay(addDays(dateKeyOf(announcement.eventDate), 2));
  const now = new Date();
  if (now < opens) throw new ApiError(400, 'Check-in opens 2 hours before the event starts.');
  if (now >= closes) throw new ApiError(400, 'Check-in for this event has closed.');
  try {
    await EventCheckin.create({ user: user._id, announcement: announcement._id, category: announcement.category || 'general', weekKey: weekOf(now).weekKey });
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, 'You already checked in to this event.');
    throw err;
  }
  const done = await syncAuto(user);
  return { completed: done.map((d) => ({ title: d.completion.title, points: d.points })) };
}

module.exports = {
  ensurePool, ensurePlan, ensureCurrentWeekPlans, generatePlanItems, getDailyPick, completeManually, syncAuto, onActivity,
  getDashboard, getSummary, weeklyLeaderboard, checkInToEvent, bumpStreak, streakPointsFor, isAuto,
};

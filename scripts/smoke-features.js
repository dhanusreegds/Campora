// Integration check for Help Sessions, Help Rooms, Campus Challenges and streaks.
// Run on a freshly seeded database, with the server started like this so a room can open immediately:
//   ROOM_JOIN_EARLY_MINUTES=60 SESSION_MIN_LEAD_MINUTES=1 npm start
//   ROOM_JOIN_EARLY_MINUTES=60 SESSION_MIN_LEAD_MINUTES=1 npm run smoke:features
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/db');
const { HelpRoom, MeetingRequest, ChallengeCompletion, UserStreak, StreakEvent, Notification, WeeklyChallenge, CampusChallenge } = require('../src/models');
const scheduler = require('../src/services/schedulerService');
const challengeService = require('../src/services/challengeService');
const { weekOf } = require('../src/utils/time');

const BASE = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
let passed = 0;
let failed = 0;
const check = (name, ok, extra = '') => {
  if (ok) { passed += 1; console.log(`  ok    ${name}`); } else { failed += 1; console.log(`  FAIL  ${name} ${extra}`); }
};

async function call(method, path, { token, body, raw, headers } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { ...(raw ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(headers || {}) },
    body: raw || (body ? JSON.stringify(body) : undefined),
  });
  let data = null;
  if ((res.headers.get('content-type') || '').includes('json')) { try { data = await res.json(); } catch { /* none */ } }
  return { status: res.status, data, res };
}
const login = async (u, p, role) => (await call('POST', '/auth/login', { body: { username: u, password: p, role } })).data;
const inMinutes = (m) => new Date(Date.now() + m * 60000).toISOString();
const notifs = async (token) => (await call('GET', '/notifications', { token })).data.notifications;

(async () => {
  await connectDB();
  console.log(`Campora feature checks against ${BASE}\n`);
  const s = await login('seeker_demo', 'seeker123', 'seeker');
  const h = await login('helper_demo', 'helper123', 'helper');
  const p = await login('priya_nair', 'helper123', 'helper');
  const sT = s.token, hT = h.token, pT = p.token;

  console.log('Help Session requests');
  const meta = await call('GET', '/sessions/meta', { token: sT });
  check('meta lists the 7 help types', meta.status === 200 && meta.data.categories.length === 7);
  const base = { helperId: h.user._id, category: 'coding_help', topic: 'x', durationMinutes: 20 };
  check('invalid help type rejected', (await call('POST', '/sessions/requests', { token: sT, body: { ...base, category: 'nope', startAt: inMinutes(60) } })).status === 400);
  check('past start time rejected', (await call('POST', '/sessions/requests', { token: sT, body: { ...base, startAt: inMinutes(-30) } })).status === 400);
  check('odd duration rejected', (await call('POST', '/sessions/requests', { token: sT, body: { ...base, startAt: inMinutes(60), durationMinutes: 17 } })).status === 400);
  check('helper cannot create a request', (await call('POST', '/sessions/requests', { token: hT, body: { ...base, helperId: p.user._id, startAt: inMinutes(60) } })).status === 403);

  const t1 = inMinutes(30);
  const created = await call('POST', '/sessions/requests', { token: sT, body: { helperId: h.user._id, category: 'interview_prep', topic: 'Mock interview for placements', reason: 'Practice HR questions.', startAt: t1, durationMinutes: 20 } });
  check('seeker sends a meeting request', created.status === 201 && created.data.meeting.status === 'pending');
  const mid = created.data.meeting._id;
  check('duplicate for the same time blocked', (await call('POST', '/sessions/requests', { token: sT, body: { helperId: h.user._id, category: 'interview_prep', topic: 'Again', startAt: t1, durationMinutes: 20 } })).status === 409);
  check('helper notified: meeting request received', (await notifs(hT)).some((n) => n.title === 'Meeting request received'));
  check('wrong helper cannot accept', (await call('POST', `/sessions/requests/${mid}/accept`, { token: pT })).status === 409);
  check('seeker cannot accept their own request', (await call('POST', `/sessions/requests/${mid}/accept`, { token: sT })).status === 409);

  console.log('\nSuggest another time, accept, room creation');
  const sug = await call('POST', `/sessions/requests/${mid}/suggest`, { token: hT, body: { startAt: inMinutes(45), durationMinutes: 30, note: 'Free later.' } });
  check('helper suggests another time', sug.status === 200 && sug.data.meeting.status === 'reschedule_proposed');
  check('seeker notified of new time', (await notifs(sT)).some((n) => n.title === 'New time suggested'));
  check('helper cannot accept their own proposal', (await call('POST', `/sessions/requests/${mid}/accept`, { token: hT })).status === 409);
  const acc = await call('POST', `/sessions/requests/${mid}/accept`, { token: sT });
  check('seeker accepts the suggested time', acc.status === 200 && acc.data.roomId && acc.data.meeting.durationMinutes === 30);
  const code = acc.data.roomId;
  check('accepting twice is rejected', (await call('POST', `/sessions/requests/${mid}/accept`, { token: sT })).status === 409);
  check('exactly one room exists for the meeting', (await HelpRoom.countDocuments({ meeting: mid })) === 1);
  const sn = (await notifs(sT)).find((n) => n.title === 'Help Room ready');
  check('seeker gets "Help Room ready" with Join button and details', sn && sn.actionLabel === 'Join Help Room' && sn.link === `#/room/${code}` && sn.meta.durationMinutes === 30);
  check('helper gets a notification too', (await notifs(hT)).some((n) => n.title === 'New time accepted' && n.actionLabel === 'Join Help Room'));
  check('overlapping session for the same student blocked', (await call('POST', '/sessions/requests', { token: sT, body: { helperId: p.user._id, category: 'coding_help', topic: 'Overlapping', startAt: inMinutes(50), durationMinutes: 20 } })).status === 409);

  console.log('\nHelp Room privacy');
  const outsider = await login('arjun_mehta', 'helper123', 'helper');
  check('outsider gets 404 for the room', (await call('GET', `/rooms/${code}`, { token: outsider.token })).status === 404);
  check('outsider cannot sync', (await call('GET', `/rooms/${code}/sync?sid=x`, { token: outsider.token })).status === 404);
  check('outsider cannot post chat', (await call('POST', `/rooms/${code}/chat`, { token: outsider.token, body: { text: 'hi' } })).status === 404);
  check('outsider cannot join', (await call('POST', `/rooms/${code}/join`, { token: outsider.token, body: { sid: 'x' } })).status === 404);
  check('unauthenticated request rejected', (await call('GET', `/rooms/${code}`)).status === 401);
  const info = await call('GET', `/rooms/${code}`, { token: sT });
  check('participants can read the room', info.status === 200 && info.data.room.myRole === 'seeker' && info.data.room.seeker.name === 'Ananya Sharma');
  check('room is open (join window)', info.data.room.status === 'active');

  console.log('\nInside the room');
  const sidS = 'sid-seeker-1', sidH = 'sid-helper-1';
  check('seeker joins', (await call('POST', `/rooms/${code}/join`, { token: sT, body: { sid: sidS } })).status === 200);
  const j = await call('POST', `/rooms/${code}/join`, { token: hT, body: { sid: sidH } });
  check('helper joins and gets ICE servers', j.status === 200 && Array.isArray(j.data.iceServers) && j.data.iceServers.length > 0);
  check('chat message', (await call('POST', `/rooms/${code}/chat`, { token: sT, body: { text: 'Hello mentor' } })).status === 201);
  check('empty chat rejected', (await call('POST', `/rooms/${code}/chat`, { token: sT, body: { text: '   ' } })).status === 400);
  check('whiteboard stroke saved (coordinates clamped)', (await call('POST', `/rooms/${code}/strokes`, { token: sT, body: { id: 'st1', tool: 'pen', color: '#27394A', size: 3, start: true, pts: [0.1, 0.1, 0.2, 0.3, 5, -2] } })).status === 201);
  check('malformed stroke rejected', (await call('POST', `/rooms/${code}/strokes`, { token: sT, body: { id: 'st2', pts: [0.1, 0.2, 0.3] } })).status === 400);
  check('notes saved', (await call('PUT', `/rooms/${code}/notes`, { token: hT, body: { text: 'Prepare STAR answers.' } })).data.version === 1);
  check('code saved', (await call('PUT', `/rooms/${code}/code`, { token: hT, body: { text: 'print(1)', language: 'python' } })).data.version === 1);
  check('signal accepted', (await call('POST', `/rooms/${code}/signal`, { token: sT, body: { sid: sidS, data: { type: 'hello' } } })).status === 201);
  check('invalid signal rejected', (await call('POST', `/rooms/${code}/signal`, { token: sT, body: { sid: sidS, data: { type: 'evil' } } })).status === 400);
  const sync = await call('GET', `/rooms/${code}/sync?since=0&sid=${sidH}&notesV=0&codeV=0`, { token: hT });
  check('helper sync: events, notes, code', sync.data.events.some((e) => e.kind === 'chat') && sync.data.events.some((e) => e.kind === 'stroke') && sync.data.notes.text.includes('STAR') && sync.data.code.language === 'python');
  check('helper receives the seeker signal (once)', sync.data.signals.length === 1 && sync.data.signals[0].fromSid === sidS);
  const again = await call('GET', `/rooms/${code}/sync?since=0&sid=${sidH}&notesV=1&codeV=1`, { token: hT });
  check('signals are consumed after delivery', again.data.signals.length === 0 && !again.data.notes);
  check('partner shows online', (await call('GET', `/rooms/${code}/sync?since=0&sid=${sidS}`, { token: sT })).data.partner.online === true);
  check('second tab supersedes the first', (await call('GET', `/rooms/${code}/sync?since=0&sid=other-tab`, { token: sT })).data.superseded === true);
  check('cannot undo the other person\'s stroke', (await call('POST', `/rooms/${code}/undo`, { token: hT, body: { id: 'st1' } })).status === 404);
  check('undo own stroke', (await call('POST', `/rooms/${code}/undo`, { token: sT, body: { id: 'st1' } })).status === 200);
  const up = await call('POST', `/rooms/${code}/files?name=${encodeURIComponent('resume draft.txt')}`, { token: sT, raw: Buffer.from('my resume text'), headers: { 'Content-Type': 'text/plain' } });
  check('file upload', up.status === 201 && up.data.file.name === 'resume draft.txt');
  const dl = await call('GET', `/rooms/${code}/files/${up.data.file._id}`, { token: hT });
  const body = Buffer.from(await dl.res.arrayBuffer()).toString();
  check('file download is an attachment with nosniff', dl.status === 200 && body === 'my resume text' && /attachment/.test(dl.res.headers.get('content-disposition')) && dl.res.headers.get('x-content-type-options') === 'nosniff');
  check('outsider cannot download the file', (await call('GET', `/rooms/${code}/files/${up.data.file._id}`, { token: outsider.token })).status === 404);
  check('oversized file rejected', (await call('POST', `/rooms/${code}/files?name=big.bin`, { token: sT, raw: Buffer.alloc(5 * 1024 * 1024, 1), headers: { 'Content-Type': 'application/octet-stream' } })).status === 413);
  check('whiteboard clear', (await call('POST', `/rooms/${code}/clear`, { token: hT })).status === 200);

  console.log('\nSession end and archive');
  const ended = await call('POST', `/rooms/${code}/end`, { token: hT });
  check('either person can end the session', ended.status === 200 && ended.data.outcome === 'completed');
  const room = await call('GET', `/rooms/${code}`, { token: sT });
  check('room is archived and read-only', room.data.room.status === 'archived' && room.data.room.writable === false);
  check('notes and files remain accessible', room.data.room.notes.text.includes('STAR') && room.data.room.files.length === 1);
  check('chat blocked after the end', (await call('POST', `/rooms/${code}/chat`, { token: sT, body: { text: 'late' } })).status === 409);
  check('notes locked after the end', (await call('PUT', `/rooms/${code}/notes`, { token: sT, body: { text: 'late' } })).status === 409);
  check('upload blocked after the end', (await call('POST', `/rooms/${code}/files?name=a.txt`, { token: sT, raw: Buffer.from('x'), headers: { 'Content-Type': 'text/plain' } })).status === 409);
  check('cannot rejoin an archived room', (await call('POST', `/rooms/${code}/join`, { token: sT, body: { sid: 'z' } })).status === 409);
  check('files still downloadable after archive', (await call('GET', `/rooms/${code}/files/${up.data.file._id}`, { token: sT })).status === 200);
  check('meeting marked completed', (await MeetingRequest.findById(mid)).status === 'completed');
  check('both got "Session ended"', (await Notification.countDocuments({ title: 'Session ended', recipient: { $in: [s.user._id, h.user._id] }, createdAt: { $gte: new Date(Date.now() - 60000) } })) >= 2);
  check('ending twice is rejected', (await call('POST', `/rooms/${code}/end`, { token: hT })).status === 409);

  console.log('\nReject, cancel, expire, no-show, scheduler');
  const r2 = await call('POST', '/sessions/requests', { token: sT, body: { helperId: p.user._id, category: 'career_guidance', topic: 'Higher studies', startAt: inMinutes(180), durationMinutes: 20 } });
  const rej = await call('POST', `/sessions/requests/${r2.data.meeting._id}/reject`, { token: pT, body: { note: 'Not available' } });
  check('helper rejects', rej.status === 200 && rej.data.meeting.status === 'rejected');
  check('seeker notified of rejection', (await notifs(sT)).some((n) => n.title === 'Request rejected'));
  check('rejected request cannot be accepted', (await call('POST', `/sessions/requests/${r2.data.meeting._id}/accept`, { token: pT })).status === 409);
  const r3 = await call('POST', '/sessions/requests', { token: sT, body: { helperId: p.user._id, category: 'general_mentorship', topic: 'Chat about college life', startAt: inMinutes(240), durationMinutes: 15 } });
  const acc3 = await call('POST', `/sessions/requests/${r3.data.meeting._id}/accept`, { token: pT });
  check('accept creates a second, separate room', acc3.status === 200 && acc3.data.roomId !== code);
  check('seeker cancels an accepted session', (await call('POST', `/sessions/requests/${r3.data.meeting._id}/cancel`, { token: sT })).status === 200);
  check('cancelled room is closed', (await call('GET', `/rooms/${acc3.data.roomId}`, { token: sT })).data.room.status === 'cancelled');
  check('cancelled room cannot be joined', (await call('POST', `/rooms/${acc3.data.roomId}/join`, { token: sT, body: { sid: 'q' } })).status === 409);

  const r4 = await call('POST', '/sessions/requests', { token: sT, body: { helperId: p.user._id, category: 'project_guidance', topic: 'Project scoping', startAt: inMinutes(600), durationMinutes: 15 } });
  const acc4 = await call('POST', `/sessions/requests/${r4.data.meeting._id}/accept`, { token: pT });
  await HelpRoom.updateOne({ roomId: acc4.data.roomId }, { $set: { scheduledStart: new Date(Date.now() - 40 * 60000), scheduledEnd: new Date(Date.now() - 25 * 60000) } });
  const tickRes = await scheduler.tick();
  check('scheduler archives finished rooms', tickRes.archived >= 1);
  const r4room = await HelpRoom.findOne({ roomId: acc4.data.roomId });
  check('no-show session archived with outcome no_show', !!r4room.archivedAt && r4room.outcome === 'no_show');
  check('meeting marked missed', (await MeetingRequest.findById(r4.data.meeting._id)).status === 'missed');
  const r5 = await call('POST', '/sessions/requests', { token: sT, body: { helperId: p.user._id, category: 'coding_help', topic: 'Unanswered one', startAt: inMinutes(700), durationMinutes: 15 } });
  await MeetingRequest.updateOne({ _id: r5.data.meeting._id }, { $set: { startAt: new Date(Date.now() - 60000), endAt: new Date(Date.now() + 14 * 60000) } });
  await scheduler.tick();
  check('unanswered request expires', (await MeetingRequest.findById(r5.data.meeting._id)).status === 'expired');
  const r6 = await call('POST', '/sessions/requests', { token: sT, body: { helperId: p.user._id, category: 'resume_review', topic: 'Reminder test', startAt: inMinutes(900), durationMinutes: 15 } });
  const acc6 = await call('POST', `/sessions/requests/${r6.data.meeting._id}/accept`, { token: pT });
  await HelpRoom.collection.updateOne({ roomId: acc6.data.roomId }, { $set: { createdAt: new Date(Date.now() - 3 * 3600000), scheduledStart: new Date(Date.now() + 8 * 60000), scheduledEnd: new Date(Date.now() + 23 * 60000) } });
  await scheduler.tick();
  await scheduler.tick();
  const reminders = (await notifs(sT)).filter((n) => ['Meeting reminder', 'Session starting soon'].includes(n.title));
  check('reminder and "starting soon" sent exactly once each', reminders.filter((n) => n.title === 'Meeting reminder').length === 1 && reminders.filter((n) => n.title === 'Session starting soon').length === 1);

  console.log('\nCampus Challenges');
  const d = await call('GET', '/challenges', { token: sT });
  check('dashboard loads', d.status === 200 && d.data.items.length === 5);
  check('items have category, difficulty, points', d.data.items.every((i) => i.category && ['easy', 'medium', 'hard'].includes(i.difficulty) && i.points > 0));
  check('seeker does not get helper-only challenges', d.data.items.every((i) => !/^w-help-(session|request|notes)/.test(i.key)));
  check('a daily challenge is offered', !!d.data.today && d.data.today.points > 0);
  check('week grid has 7 days', d.data.week.days.length === 7);
  check('helper gets their own set', (await call('GET', '/challenges', { token: hT })).data.items.every((i) => !/^w-seek-/.test(i.key)));
  check('streak carried from demo history', d.data.stats.currentStreak >= 3);

  const before = (await call('GET', '/auth/me', { token: sT })).data.user.points;
  const manual = d.data.items.find((i) => !i.auto && i.verificationType === 'self') || d.data.items.find((i) => !i.auto);
  check('self-reported challenge needs a real note', (await call('POST', '/challenges/complete', { token: sT, body: { challengeKey: manual.key, scope: 'weekly', note: 'ok' } })).status === 400);
  check('challenge outside my set is rejected', (await call('POST', '/challenges/complete', { token: sT, body: { challengeKey: 'w-help-session', scope: 'weekly', note: 'I did it, honestly, trust me.' } })).status === 404);
  check('cannot claim a weekly task as the daily one', (await call('POST', '/challenges/complete', { token: sT, body: { challengeKey: manual.key, scope: 'daily', note: 'I did it, honestly, trust me.' } })).status === 400);
  const proof = manual.verificationType === 'link' ? { url: 'https://github.com/example/project', note: 'My project' } : { note: 'Solved five problems on LeetCode and noted my approach.' };
  const done = await call('POST', '/challenges/complete', { token: sT, body: { challengeKey: manual.key, scope: 'weekly', ...proof } });
  check('challenge completed', done.status === 200 && done.data.pointsAwarded === manual.points, JSON.stringify(done.data));
  const afterOne = (await call('GET', '/auth/me', { token: sT })).data.user.points;
  check('points added to the shared balance (challenge + streak)', afterOne - before === manual.points + done.data.streak.points + done.data.streak.bonus, `${before}->${afterOne}`);
  const todayKey = d.data.week.days.find((x) => x.isToday).dateKey;
  check('streak went 3 -> 4 today, paying 15 streak points once', (await UserStreak.findOne({ user: s.user._id })).currentStreak === 4 && (await StreakEvent.find({ user: s.user._id, dateKey: todayKey, kind: 'daily' })).reduce((n, e) => n + e.points, 0) === 15);
  check('same challenge cannot be rewarded twice', (await call('POST', '/challenges/complete', { token: sT, body: { challengeKey: manual.key, scope: 'weekly', ...proof } })).status === 409);
  const race = await Promise.all([1, 2, 3, 4].map(() => call('POST', '/challenges/complete', { token: sT, body: { challengeKey: d.data.today.key, scope: 'daily', note: 'Did the daily task for real today.' } })));
  check('simultaneous daily claims succeed exactly once', race.filter((r) => r.status === 200).length === 1, race.map((r) => r.status).join(','));
  check('streak points paid once for today', (await StreakEvent.countDocuments({ user: s.user._id, dateKey: todayKey, kind: 'daily' })) === 1);
  const d2 = await call('GET', '/challenges', { token: sT });
  const doneItems = d2.data.items.filter((i) => i.completed).length;
  check('weekly progress updated', doneItems >= 1 && d2.data.stats.weeklyCompleted === doneItems && d2.data.stats.completionPercent === Math.round((doneItems / 5) * 100));
  check('today shows as active in the week grid', d2.data.week.days.find((x) => x.isToday).active === true);
  check('stats: weekly points and streak', d2.data.stats.weeklyPoints >= manual.points && d2.data.stats.currentStreak === 4 && d2.data.stats.longestStreak >= 5);
  check('same set returned on every load (stable week)', JSON.stringify(d.data.items.map((i) => i.key)) === JSON.stringify(d2.data.items.map((i) => i.key)));
  const cap = [];
  for (const it of d2.data.items.filter((i) => !i.completed && !i.auto)) {
    const pr = it.verificationType === 'link' ? { url: 'https://example.com/p' } : { note: 'Wrote a proper summary of what I did.' };
    cap.push((await call('POST', '/challenges/complete', { token: sT, body: { challengeKey: it.key, scope: 'weekly', ...pr } })).status);
  }
  check('daily cap on honor-system claims enforced (429)', cap.includes(429) || cap.length < 3, cap.join(','));
  const autoItem = d2.data.items.find((i) => i.auto && !i.completed);
  check('auto-verified challenges cannot be claimed by hand', !autoItem || (await call('POST', '/challenges/complete', { token: sT, body: { challengeKey: autoItem.key, scope: 'weekly', note: 'I totally did this one.' } })).status === 400);

  console.log('\nAuto-verification from real activity');
  const wk = weekOf();
  const pin = async (audience, keys) => {
    const plan = await WeeklyChallenge.findOne({ weekKey: wk.weekKey, audience });
    const docs = await CampusChallenge.find({ key: { $in: keys } }).lean();
    const keep = plan.items.filter((i) => !keys.includes(i.key)).slice(0, 5 - docs.length);
    plan.items = [...docs.map((c) => ({ challenge: c._id, key: c.key, title: c.title, description: c.description, category: c.category, difficulty: c.difficulty, points: c.points, verificationType: c.verificationType, target: c.target, eventCategory: c.eventCategory || '' })), ...keep];
    await plan.save();
  };
  await pin('helper', ['w-help-session', 'w-help-request']);
  await pin('seeker', ['w-seek-session', 'w-seek-request', 'w-seek-post']);
  const hBefore = (await call('GET', '/auth/me', { token: hT })).data.user.points;
  const hdash = await call('GET', '/challenges', { token: hT });
  const sessionItem = hdash.data.items.find((i) => i.key === 'w-help-session');
  check('"Help a junior in a Help Session" completes from the finished session', sessionItem && sessionItem.completed === true && sessionItem.pointsAwarded === 40);
  check('points reached the helper balance', (await call('GET', '/auth/me', { token: hT })).data.user.points >= hBefore + 40);
  const reqItem0 = hdash.data.items.find((i) => i.key === 'w-help-request');
  check('request challenge starts incomplete', reqItem0 && reqItem0.completed === false && reqItem0.progress === 0);
  const sd0 = await call('GET', '/challenges', { token: sT });
  const dr = await call('POST', '/requests/direct', { token: sT, body: { helperId: h.user._id, title: `Challenge link ${Date.now()}`, description: 'Testing the challenge hook.', category: 'General', difficulty: 'basic' } });
  check('posting a request completes "Ask for help" automatically', sd0.data.items.some((i) => i.key === 'w-seek-post') && (await call('GET', '/challenges', { token: sT })).data.items.find((i) => i.key === 'w-seek-post').completed === true, JSON.stringify(dr.data).slice(0, 120));
  await call('POST', `/requests/${dr.data.request._id}/accept`, { token: hT });
  await call('POST', `/requests/${dr.data.request._id}/complete`, { token: hT });
  check('completing a request completes the helper challenge', (await call('GET', '/challenges', { token: hT })).data.items.find((i) => i.key === 'w-help-request').completed === true);
  check('...and the seeker\'s "Get a doubt resolved"', (await call('GET', '/challenges', { token: sT })).data.items.find((i) => i.key === 'w-seek-request').completed === true);
  await call('GET', '/challenges', { token: sT });
  check('reloading never re-awards an auto challenge', (await ChallengeCompletion.countDocuments({ user: s.user._id, challengeKey: 'w-seek-request' })) === 1);

  const anns = (await call('GET', '/announcements', { token: sT })).data.announcements;
  const workshop = anns.find((a) => a.category === 'workshop');
  check('announcements carry a category', !!workshop);
  check('event check-in works', (await call('POST', `/announcements/${workshop._id}/checkin`, { token: sT })).status === 200);
  check('duplicate check-in blocked', (await call('POST', `/announcements/${workshop._id}/checkin`, { token: sT })).status === 409);
  const far = anns.find((a) => a.category === 'technical');
  check('check-in not allowed long before the event', !(far && new Date(far.eventDate) - Date.now() > 2 * 3600000) || (await call('POST', `/announcements/${far._id}/checkin`, { token: sT })).status === 400);
  check('my check-ins listed', (await call('GET', '/announcements/checkins/mine', { token: sT })).data.announcementIds.includes(workshop._id));

  console.log('\nWeekly randomisation');
  const seen = [];
  let history = [];
  for (let i = 1; i <= 8; i += 1) {
    const items = await challengeService.generatePlanItems(weekOf(new Date(Date.now() + i * 7 * 86400000)), 'seeker', { previousPlans: history.slice(0, 3) });
    seen.push(items.map((x) => x.key));
    history = [{ items: items.map((x) => ({ challenge: x.challenge })) }, ...history];
  }
  const overlap = seen.slice(1).map((set, i) => set.filter((k) => seen[i].includes(k)).length);
  console.log(`        (overlap with previous week over 7 chained draws: ${overlap.join(', ')} of 5)`);
  check('each generated week has 5 distinct challenges', seen.every((set) => set.length === 5 && new Set(set).size === 5));
  check('consecutive weeks share at most 1 challenge', overlap.every((n) => n <= 1), overlap.join(','));
  check('weeks differ from each other', new Set(seen.map((x) => x.join(','))).size > 1);
  check('same week always draws the same set (deterministic)', JSON.stringify((await challengeService.generatePlanItems(wk, 'seeker')).map((x) => x.key)) === JSON.stringify((await challengeService.generatePlanItems(wk, 'seeker')).map((x) => x.key)));
  check('mix includes a hard challenge', (await challengeService.generatePlanItems(wk, 'helper')).some((x) => x.difficulty === 'hard'));

  console.log('\nLeaderboard');
  const lb = await call('GET', '/challenges/leaderboard', { token: sT });
  check('weekly leaderboard lists students with ranks', lb.status === 200 && lb.data.entries.length >= 2 && lb.data.entries[0].rank === 1);
  check('leaderboard sorted by points', lb.data.entries.every((e, i, a) => i === 0 || a[i - 1].points >= e.points));
  check('my entry is included', !!lb.data.me && lb.data.me.user.username === 'seeker_demo');
  check('summary endpoint', (await call('GET', '/challenges/summary', { token: sT })).data.stats.currentStreak === 4);
  const hlb = await call('GET', '/leaderboard', { token: sT });
  check('existing helper leaderboard still works', hlb.status === 200 && hlb.data.leaderboard.length > 0);

  console.log(`\n${passed} passed, ${failed} failed`);
  await mongoose.disconnect();
  process.exit(failed ? 1 : 0);
})().catch(async (e) => { console.error(e); await mongoose.disconnect(); process.exit(1); });

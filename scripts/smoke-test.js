// End-to-end API check of the main Campora workflows.
// Usage: start the server, then run   npm run smoke
// (uses BASE_URL, default http://localhost:3000). It adds a little data; run `npm run seed` to reset.

const BASE = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
let passed = 0;
let failed = 0;

function check(name, condition, extra = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, data };
}

async function login(username, password, role) {
  const r = await call('POST', '/auth/login', { body: { username, password, role } });
  return r;
}

(async () => {
  console.log(`Campora smoke test against ${BASE}\n`);

  console.log('Authentication');
  const s = await login('seeker_demo', 'seeker123', 'seeker');
  const h = await login('helper_demo', 'helper123', 'helper');
  check('seeker demo login', s.status === 200 && s.data.user.name === 'Ananya Sharma');
  check('helper demo login', h.status === 200 && h.data.user.name === 'Rahul Kumar');
  check('password hash is never returned', !('password' in s.data.user));
  check('wrong password rejected', (await login('seeker_demo', 'nope', 'seeker')).status === 401);
  check('wrong role login rejected', (await login('seeker_demo', 'seeker123', 'helper')).status === 403);
  const sT = s.data.token;
  const hT = h.data.token;

  console.log('\nRole-based access');
  check('helper cannot search helpers', (await call('GET', '/helpers', { token: hT })).status === 403);
  check('seeker cannot view helper requests', (await call('GET', '/requests/incoming', { token: sT })).status === 403);
  check('seeker cannot post announcements', (await call('POST', '/announcements', { token: sT, body: { title: 'x' } })).status === 403);
  check('unauthenticated request rejected', (await call('GET', '/notifications')).status === 401);

  console.log('\nSeeker: search and dashboard');
  const search = await call('GET', '/helpers?q=java', { token: sT });
  check('search by skill finds Rahul', search.data.helpers.some((x) => x.username === 'helper_demo'));
  check('search hides non-matching helpers', !search.data.helpers.some((x) => x.username === 'arjun_mehta'));
  const verified = await call('GET', '/helpers?verified=true', { token: sT });
  check('verified filter works', verified.data.helpers.length > 0 && verified.data.helpers.every((x) => x.verified));
  const rahul = search.data.helpers.find((x) => x.username === 'helper_demo');
  check('connected helper is flagged', rahul.relation === 'connected');
  const sd = await call('GET', '/dashboard/seeker', { token: sT });
  check('seeker dashboard stats', sd.status === 200 && typeof sd.data.stats.points === 'number' && sd.data.leaderboard.length > 0);

  console.log('\nPublic post and skill matching');
  const helperBefore = await call('GET', '/notifications', { token: hT });
  const post = await call('POST', '/requests/public', {
    token: sT,
    body: {
      title: 'Java inheritance and polymorphism help',
      description: 'Need examples of super and overriding.',
      category: 'Java Programming',
      requiredSkills: ['Java', 'OOP', 'Inheritance'],
      difficulty: 'basic',
    },
  });
  check('public post created', post.status === 201);
  const top = post.data.matches[0];
  check('Rahul is the top match', top && top.helper.username === 'helper_demo', JSON.stringify(post.data.matches.map((m) => m.helper.username)));
  check('matched skills include Java and OOP', top && top.matchedSkills.includes('Java') && top.matchedSkills.includes('Object-Oriented Programming'));
  check('match explanation returned', top && /Java and OOP match/.test(top.explanation), top && top.explanation);
  check('pop-up message returned', top && top.message.includes('Rahul Kumar (@helper_demo)'));
  check('unrelated helper not matched', !post.data.matches.some((m) => m.helper.username === 'vikram_singh'));
  const helperAfter = await call('GET', '/notifications', { token: hT });
  check('helper notified', helperAfter.data.unread === helperBefore.data.unread + 1);
  check('notification text matches spec', helperAfter.data.notifications[0].message.startsWith('A post matching your skills has been recommended to you'));

  const detected = await call('POST', '/requests/public', {
    token: sT,
    body: { title: 'Help with CPU scheduling', description: 'Round robin and deadlocks in operating systems', category: 'Operating Systems' },
  });
  check('skills detected from text when none provided', detected.data.skillsSource === 'detected' && detected.data.skills.length > 0);

  console.log('\nDirect request, accept, chat');
  const priya = (await call('GET', '/helpers?q=priya', { token: sT })).data.helpers[0];
  const direct = await call('POST', '/requests/direct', {
    token: sT,
    body: { helperId: rahul._id, title: `Smoke test ${Date.now()}`, description: 'Testing the flow', category: 'Data Structures', difficulty: 'advanced' },
  });
  check('direct request created (pending)', direct.status === 201 && direct.data.request.status === 'pending');
  const dupe = await call('POST', '/requests/direct', {
    token: sT,
    body: { helperId: rahul._id, title: direct.data.request.title, description: 'again', category: 'x' },
  });
  check('duplicate pending request blocked', dupe.status === 409);
  check('missing title rejected', (await call('POST', '/requests/direct', { token: sT, body: { helperId: rahul._id, description: 'x' } })).status === 400);

  const incoming = await call('GET', '/requests/incoming?tab=incoming', { token: hT });
  check('helper sees the direct request', incoming.data.requests.some((r) => r._id === direct.data.request._id));
  check('helper sees the recommended public post', incoming.data.requests.some((r) => r._id === post.data.request._id));
  const filtered = await call('GET', '/requests/incoming?tab=incoming&subject=java', { token: hT });
  check('subject filter works', filtered.data.requests.length > 0 && filtered.data.requests.every((r) => /java/i.test(r.category)));

  // Priya cannot accept a direct request meant for Rahul
  const pT = (await login('priya_nair', 'helper123', 'helper')).data.token;
  check('other helper cannot accept a direct request', (await call('POST', `/requests/${direct.data.request._id}/accept`, { token: pT })).status === 403);

  const acc = await call('POST', `/requests/${direct.data.request._id}/accept`, { token: hT });
  check('helper accepts request', acc.status === 200 && acc.data.request.status === 'accepted');
  check('accepting twice is rejected', (await call('POST', `/requests/${direct.data.request._id}/accept`, { token: hT })).status === 409);

  const conns = await call('GET', '/connections', { token: sT });
  check('connection exists', conns.data.connections.some((c) => c.user.username === 'helper_demo'));
  const msg = await call('POST', `/chat/${rahul._id}`, { token: sT, body: { content: 'Hello from the smoke test' } });
  check('seeker sends chat message', msg.status === 201);
  const seekerId = s.data.user._id;
  const hist = await call('GET', `/chat/${seekerId}`, { token: hT });
  check('helper reads chat history (seeded + new)', hist.status === 200 && hist.data.messages.length >= 9);
  check('chat blocked without accepted connection', (await call('GET', `/chat/${priya._id}`, { token: sT })).status === 403);
  check('empty message rejected', (await call('POST', `/chat/${rahul._id}`, { token: sT, body: { content: '   ' } })).status === 400);

  console.log('\nPoints (completion, duplicates, leaderboard)');
  const pointsBefore = (await call('GET', '/auth/me', { token: hT })).data.user.points;
  const done = await call('POST', `/requests/${direct.data.request._id}/complete`, { token: hT });
  check('helper completes request', done.status === 200 && done.data.request.status === 'completed');
  check('advanced request awards configured points', done.data.pointsAwarded === 20, `got ${done.data.pointsAwarded}`);
  const pointsAfter = (await call('GET', '/auth/me', { token: hT })).data.user.points;
  check('helper points increased in database', pointsAfter === pointsBefore + done.data.pointsAwarded);
  const again = await call('POST', `/requests/${direct.data.request._id}/complete`, { token: hT });
  check('second completion blocked (no duplicate points)', again.status === 409);
  const parallel = await Promise.all(
    [1, 2].map(async (n) => {
      const r = await call('POST', '/requests/direct', { token: sT, body: { helperId: rahul._id, title: `Parallel ${Date.now()}-${n}`, description: 'x', category: 'General' } });
      return r.data.request._id;
    })
  );
  await call('POST', `/requests/${parallel[0]}/accept`, { token: hT });
  const beforeRace = (await call('GET', '/auth/me', { token: hT })).data.user.points;
  const race = await Promise.all([1, 2, 3, 4, 5].map(() => call('POST', `/requests/${parallel[0]}/complete`, { token: hT })));
  const afterRace = (await call('GET', '/auth/me', { token: hT })).data.user.points;
  check('simultaneous completions succeed exactly once', race.filter((r) => r.status === 200).length === 1, race.map((r) => r.status).join(','));
  check('simultaneous completions award points exactly once', afterRace === beforeRace + 10, `${beforeRace} -> ${afterRace}`);
  check('cannot complete a pending request', (await call('POST', `/requests/${parallel[1]}/complete`, { token: hT })).status === 400);

  const board = await call('GET', '/leaderboard', { token: sT });
  const pts = board.data.leaderboard.map((x) => x.points);
  check('leaderboard sorted by stored points', pts.every((p, i) => i === 0 || pts[i - 1] >= p));
  check('leaderboard ranks calculated', board.data.leaderboard[0].rank === 1);
  const hd = await call('GET', '/dashboard/helper', { token: hT });
  check('helper dashboard rank is calculated', hd.status === 200 && Number.isInteger(hd.data.rank));

  console.log('\nReject flow');
  const rejReq = await call('POST', '/requests/direct', { token: sT, body: { helperId: priya._id, title: `Reject me ${Date.now()}`, description: 'x', category: 'Data Science' } });
  const rej = await call('POST', `/requests/${rejReq.data.request._id}/reject`, { token: pT });
  check('helper rejects direct request', rej.status === 200 && rej.data.request.status === 'rejected');
  const mine = await call('GET', '/requests/mine', { token: sT });
  check('seeker sees rejected status', mine.data.requests.find((r) => r._id === rejReq.data.request._id).status === 'rejected');

  console.log('\nAnnouncements');
  const ann = await call('POST', '/announcements', {
    token: hT,
    body: { title: 'Smoke test workshop', description: 'Testing', eventDate: new Date(Date.now() + 86400000).toISOString(), venue: 'Lab', organizer: 'QA' },
  });
  check('helper creates announcement', ann.status === 201);
  check('unsafe registration link rejected', (await call('POST', '/announcements', { token: hT, body: { title: 'x', description: 'y', eventDate: new Date().toISOString(), registrationLink: 'javascript:alert(1)' } })).status === 400);
  const list = await call('GET', '/announcements', { token: sT });
  const dates = list.data.announcements.map((a) => new Date(a.eventDate).getTime());
  check('seeker sees announcements in chronological order', dates.every((d, i) => i === 0 || dates[i - 1] <= d) && list.data.announcements.some((a) => a._id === ann.data.announcement._id));

  console.log('\nCampus benefits and QR redemption');
  const benefits = (await call('GET', '/benefits', { token: hT })).data.benefits;
  const canteen = benefits.find((b) => b.name === 'Canteen Coupon');
  const pre = (await call('GET', '/auth/me', { token: hT })).data.user.points;
  check('unconfirmed redemption rejected', (await call('POST', `/benefits/${canteen._id}/redeem`, { token: hT, body: {} })).status === 400);
  check('points untouched without confirmation', (await call('GET', '/auth/me', { token: hT })).data.user.points === pre);
  const redeem = await call('POST', `/benefits/${canteen._id}/redeem`, { token: hT, body: { confirm: true } });
  check('redemption succeeds', redeem.status === 201 && /^CAMP-[A-Z0-9]{6}$/.test(redeem.data.redemption.redemptionId));
  check('points deducted', redeem.data.remainingPoints === pre - 50);
  check('QR image generated', redeem.data.qrImage.startsWith('data:image/png;base64,'));
  const code = redeem.data.redemption.redemptionId;
  const v1 = await call('POST', '/redemptions/validate', { token: sT, body: { code } });
  check('validator sees an unused code', v1.data.valid === true);
  check('mark as used', (await call('POST', '/redemptions/use', { token: sT, body: { code } })).status === 200);
  check('reusing a code is blocked', (await call('POST', '/redemptions/use', { token: sT, body: { code } })).status === 409);
  check('validator sees a used code', (await call('POST', '/redemptions/validate', { token: sT, body: { code } })).data.valid === false);
  const tooExpensive = benefits.find((b) => b.pointsRequired > 100000) || { _id: benefits[3]._id };
  const poor = await call('POST', `/benefits/${tooExpensive._id}/redeem`, { token: (await login('vikram_singh', 'helper123')).data.token, body: { confirm: true } });
  check('insufficient points rejected', poor.status === 400, JSON.stringify(poor.data));
  const history = await call('GET', '/redemptions', { token: hT });
  check('redemption history lists the code', history.data.redemptions.some((r) => r.redemptionId === code));

  console.log('\nProfile');
  const upd = await call('PUT', '/users/me', { token: hT, body: { skills: 'Java, Object-Oriented Programming, Data Structures, Algorithms, Operating Systems', availability: 'Weekdays, 6-8 PM', points: 99999, verified: false, role: 'seeker' } });
  const me = (await call('GET', '/auth/me', { token: hT })).data.user;
  check('profile update saves skills', upd.status === 200 && me.skills.length === 5);
  check('points, verified and role cannot be self-edited', me.points !== 99999 && me.verified === true && me.role === 'helper');
  const reg = await call('POST', '/auth/register', { body: { name: 'Test User', username: `tester_${Date.now() % 100000}`, password: 'secret12', role: 'seeker', skills: 'Python' } });
  check('registration works and is not verified', reg.status === 201 && reg.data.user.verified === false);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

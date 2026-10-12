import { api } from '../api.js';
import { html, icon, avatar, setHTML, onClick, toast, openModal, formValues, progressBar, emptyState, cap } from '../ui.js';

const fmt = (n) => Number(n || 0).toLocaleString();
const VERIFY = {
  self: 'Self-reported', link: 'Proof link needed', session: 'Verified by Help Sessions',
  request: 'Verified by Help Requests', posted: 'Verified by Help Requests', event: 'Verified by event check-in',
};
const GO = { session: '#/sessions', request: '#/requests', posted: '#/post', event: '#/announcements' };

const difficulty = (d) => {
  const n = { easy: 1, medium: 2, hard: 3 }[d] || 1;
  return html`<span class="diff diff-${d}" aria-label="Difficulty: ${d}">${[1, 2, 3].map((i) => html`<i class="${i <= n ? 'on' : ''}"></i>`)}<span>${cap(d)}</span></span>`;
};

export default async function challengesPage({ root, user, refreshUser }) {
  let data = null;
  let filter = 'All';
  let stopped = false;
  // The Seeker's "Post a Request" page is not in the Helper menu, so send Helpers to their request list instead.
  const go = (type) => (type === 'posted' && user.role === 'helper' ? '#/requests' : GO[type] || '#/dashboard');

  async function load() {
    data = await api.get('/challenges');
    if (!stopped) paint();
  }

  function streakCard() {
    const s = data.stats;
    return html`
      <section class="panel streak-card">
        <div class="streak-main">
          <div class="flame ${s.currentStreak ? 'lit' : ''}" aria-hidden="true">${icon('flame', 34)}</div>
          <div>
            <h2 class="streak-title">${s.currentStreak === 1 ? '1 Day Streak' : `${s.currentStreak} Day Streak`}</h2>
            <p class="muted small">${s.activeToday ? 'You have done something today. Streak safe.' : s.atRisk ? 'Complete a challenge today to keep your streak going.' : 'Complete any challenge today to start a streak.'}${s.nextMilestone ? ` Next milestone: ${s.nextMilestone} days.` : ''}</p>
            <p class="small"><strong>Best:</strong> ${s.longestStreak} days</p>
          </div>
        </div>
        <ol class="week-days" aria-label="This week">
          ${data.week.days.map((d) => html`<li class="${d.active ? 'done' : ''} ${d.isToday ? 'today' : ''} ${d.isFuture ? 'future' : ''}"><span class="mark">${d.active ? icon('check', 14) : ''}</span><span class="dn">${d.label.slice(0, 3)}</span><span class="sr-only">${d.label}${d.active ? ', done' : ''}</span></li>`)}
        </ol>
        <p class="muted small streak-rules">Streak points: +${data.streakRules.perDay} on day 1, +${data.streakRules.perDay * 2} on day 2, +${data.streakRules.cap} from day 3. Bonus +${data.streakRules.fiveDayBonus} on day 5 and +${data.streakRules.weeklyBonus} every 7th day. Paid once per day.</p>
      </section>`;
  }

  function statsCard() {
    const s = data.stats;
    return html`
      <section class="panel stats-card">
        <div class="week-progress">
          <div class="row between"><strong>This Week</strong><span class="muted small">${data.week.hoursLeft >= 24 ? `${Math.floor(data.week.hoursLeft / 24)} days left` : `${data.week.hoursLeft} hours left`}</span></div>
          ${progressBar(s.weeklyCompleted, s.weeklyTotal, 'Weekly challenges completed')}
          <div class="row between"><span>${s.weeklyCompleted}/${s.weeklyTotal} Challenges</span><span class="muted">${s.completionPercent}% complete</span></div>
        </div>
        <div class="mini-stats">
          <div><span class="muted small">Weekly Points</span><strong>${fmt(s.weeklyPoints)}</strong><span class="muted small">incl. streak points</span></div>
          <div><span class="muted small">Total Points</span><strong>${fmt(s.totalPoints)}</strong><span class="muted small">your Campora balance</span></div>
          <div><span class="muted small">Completed</span><strong>${fmt(s.challengesCompleted)}</strong><span class="muted small">all time</span></div>
        </div>
      </section>`;
  }

  function todayCard() {
    const t = data.today;
    if (!t) return '';
    return html`
      <section class="panel today-card ${t.completed ? 'is-done' : ''}">
        <div class="eyebrow">Today's Challenge</div>
        <h3>${t.title}</h3>
        <p class="muted">${t.description}</p>
        <div class="row gap flow">
          <span class="points">+${t.points} points</span>${difficulty(t.difficulty)}<span class="chip">${t.category}</span>
          ${!t.completed && t.nextStreakPoints ? html`<span class="muted small">+${t.nextStreakPoints} streak points</span>` : ''}
        </div>
        <div class="foot">${t.completed
          ? html`<span class="badge status-completed">${icon('check', 14)} Done for today</span>`
          : html`<button class="btn btn-primary" data-complete="${t.key}" data-scope="daily" data-type="${t.verificationType}">${icon('check', 16)} Complete Challenge</button>`}
        </div>
      </section>`;
  }

  function itemRow(it) {
    return html`
      <li class="challenge ${it.completed ? 'done' : ''}">
        <span class="state" aria-hidden="true">${it.completed ? icon('check', 16) : ''}</span>
        <div class="body">
          <div class="top"><strong>${it.title}</strong><span class="points">+${it.points} points</span></div>
          <p class="muted small">${it.description}</p>
          <div class="row gap flow small">
            <span class="chip">${it.category}</span>${difficulty(it.difficulty)}
            <span class="muted">${it.completed ? 'Completed' : VERIFY[it.verificationType]}</span>
          </div>
          ${it.auto && it.target > 1 ? html`<div class="item-progress">${progressBar(it.progress, it.target, it.title)}<span class="muted small">${it.progress}/${it.target}</span></div>` : ''}
        </div>
        <div class="act">${it.completed
          ? html`<span class="badge status-completed">Completed</span>`
          : it.auto
            ? html`<a class="btn btn-soft btn-sm" href="${go(it.verificationType)}">${it.progress ? 'Continue' : 'Start'}</a>`
            : html`<button class="btn btn-primary btn-sm" data-complete="${it.key}" data-scope="weekly" data-type="${it.verificationType}">Mark complete</button>`}</div>
      </li>`;
  }

  function leaderboardCard() {
    const lb = data.leaderboard;
    const meIn = lb.entries.some((e) => e.user.username === user.username);
    const row = (e, me) => html`<li class="${me ? 'me' : ''}"><span class="rank">${e.rank}</span>${avatar(e.user, 'sm')}<span class="who"><strong>${e.user.name}</strong>${me ? ' (you)' : ''}<small class="muted">${cap(e.user.role)}${e.user.department ? `, ${e.user.department}` : ''}</small></span><span class="pts">${fmt(e.points)}</span></li>`;
    return html`
      <section class="panel">
        <h3>Weekly Leaderboard</h3>
        ${lb.entries.length ? html`<ol class="week-board">${lb.entries.map((e) => row(e, e.user.username === user.username))}${lb.me && !meIn ? html`<li class="gap-row" aria-hidden="true">...</li>${row(lb.me, true)}` : ''}</ol>
          <p class="muted small">Points earned this week from challenges and streaks. ${lb.participants} student${lb.participants === 1 ? '' : 's'} on the board.</p>`
          : html`<p class="muted">Nobody has points yet this week. Complete a challenge to take the first spot.</p>`}
        <a class="btn btn-ghost btn-sm" href="#/leaderboard">${icon('award', 15)} Helper leaderboard</a>
      </section>`;
  }

  function paint() {
    const cats = ['All', ...new Set(data.items.map((i) => i.category))];
    if (!cats.includes(filter)) filter = 'All';
    const items = data.items.filter((i) => filter === 'All' || i.category === filter);
    setHTML(root, html`
      <header class="page-head">
        <div><h1>Campus Challenges</h1><p class="muted">New challenges every week. Learn, build, attend, mentor, and keep your streak alive.</p></div>
        <div class="actions"><span class="chip chip-accent">${icon('target', 14)} ${data.week.weekKey}</span></div>
      </header>

      <div class="challenge-hero">${streakCard()}${statsCard()}</div>

      <div class="challenge-layout">
        <div class="stack">
          ${todayCard()}
          <section class="panel">
            <div class="row between flow"><h3>Weekly Challenges</h3>
              <div class="filter-chips" role="group" aria-label="Challenge categories">${cats.map((c) => html`<button class="fchip" type="button" data-cat="${c}" aria-pressed="${String(c === filter)}">${c}</button>`)}</div></div>
            ${items.length ? html`<ul class="challenge-list">${items.map(itemRow)}</ul>` : emptyState('Nothing in this category', 'Pick another category to see more challenges.')}
            <p class="muted small">${data.selfReported.usedToday}/${data.selfReported.limit} self-reported challenges logged today. Challenges marked as verified complete by themselves when you do the activity in Campora. Each challenge pays out once.</p>
          </section>
        </div>
        <aside class="stack">${leaderboardCard()}</aside>
      </div>`);
  }

  function completeModal(key, scope, type) {
    const item = scope === 'daily' ? data.today : data.items.find((i) => i.key === key);
    if (!item) return;
    const needsLink = type === 'link';
    const modal = openModal({
      title: item.title,
      body: html`
        <form id="c-form" class="stack" novalidate>
          <div id="c-error" class="form-error" role="alert" hidden></div>
          <p class="muted">${item.description}</p>
          ${needsLink ? html`<div class="field"><label for="c-url">Link to your work</label><input class="input" id="c-url" name="url" type="url" placeholder="https://github.com/you/project" required><p class="hint">GitHub, Drive, portfolio or any public link that shows the work.</p></div>` : ''}
          <div class="field"><label for="c-note">${needsLink ? 'Short description (optional)' : 'What did you do?'}</label><textarea class="textarea" id="c-note" name="note" maxlength="500" style="min-height:90px" placeholder="${needsLink ? 'What did you build?' : 'A sentence or two is enough.'}"></textarea></div>
          <p class="muted small">This one is self-reported, so please be honest. It earns +${item.points} points once.</p>
        </form>`,
      footer: html`<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn btn-primary" id="c-send" type="submit" form="c-form">${icon('check', 16)} Complete challenge</button>`,
    });
    const form = modal.el.querySelector('#c-form');
    const err = modal.el.querySelector('#c-error');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = modal.el.querySelector('#c-send');
      const v = formValues(form);
      err.hidden = true;
      btn.disabled = true;
      try {
        const r = await api.post('/challenges/complete', { challengeKey: key, scope, note: v.note, url: v.url });
        modal.close();
        const sp = r.streak.points + r.streak.bonus;
        toast(`Challenge completed: +${r.pointsAwarded} points${sp ? `, +${sp} streak points` : ''}.${r.streak.changed && r.streak.streak > 1 ? ` ${r.streak.streak}-day streak!` : ''}`, { type: 'success' });
        await Promise.all([load(), refreshUser()]);
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
        btn.disabled = false;
      }
    });
  }

  onClick(root, '[data-complete]', (el) => completeModal(el.dataset.complete, el.dataset.scope, el.dataset.type));
  onClick(root, '[data-cat]', (el) => { filter = el.dataset.cat; paint(); });

  await load();
  const timer = setInterval(() => { if (!document.hidden) load().catch(() => {}); }, 30000);
  return () => { stopped = true; clearInterval(timer); };
}

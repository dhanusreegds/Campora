import { api } from '../api.js';
import { fmtSlot, progressBar, html, icon, avatar, verifiedBadge, chips, scoreBar, fmtDate, fmtDateTime, emptyState, setHTML, onClick, cap } from '../ui.js';

export default async function dashboardPage(ctx) {
  return ctx.user.role === 'helper' ? helperDashboard(ctx) : seekerDashboard(ctx);
}


/** Campus Challenges and upcoming Help Sessions, shown on both dashboards. Failures here never block the dashboard. */
async function featureCards(user) {
  const [ch, se] = await Promise.all([api.get('/challenges/summary').catch(() => null), api.get('/sessions').catch(() => null)]);
  const upcoming = se ? se.sessions.filter((x) => x.status === 'accepted' && x.room && !['archived', 'cancelled'].includes(x.room.status)).sort((a, b) => new Date(a.startAt) - new Date(b.startAt)) : [];
  const waiting = se ? se.sessions.filter((x) => x.status === 'pending' && user.role === 'helper').length : 0;
  const next = upcoming[0];
  const other = next && (user.role === 'seeker' ? next.helper : next.seeker);
  return html`
    <div class="mini-card-grid">
      ${ch ? html`<section class="panel" aria-labelledby="cc-h">
        <div class="panel-head"><h2 id="cc-h">Campus Challenges</h2><a href="#/challenges">Open</a></div>
        <div class="row"><span class="flame ${ch.stats.currentStreak ? 'lit' : ''}" style="width:44px;height:44px">${icon('flame', 22)}</span><div><strong>${ch.stats.currentStreak} day streak</strong><div class="muted small">Best: ${ch.stats.longestStreak} days</div></div></div>
        ${progressBar(ch.stats.weeklyCompleted, ch.stats.weeklyTotal, 'Weekly challenges completed')}
        <div class="row between small"><span>${ch.stats.weeklyCompleted}/${ch.stats.weeklyTotal} this week</span><span class="muted">${ch.stats.weeklyPoints} weekly points</span></div>
        ${ch.today ? html`<div class="next-session"><span class="eyebrow">Today's challenge</span><strong>${ch.today.title}</strong><span class="muted small">${ch.today.completed ? 'Done for today' : `+${ch.today.points} points`}</span></div>` : ''}
      </section>` : ''}
      ${se ? html`<section class="panel" aria-labelledby="hs-h">
        <div class="panel-head"><h2 id="hs-h">Help Sessions</h2><a href="#/sessions">Open</a></div>
        ${next ? html`<div class="next-session"><span class="eyebrow">Next session</span><strong>${next.topic}</strong><span class="muted small">${fmtSlot(next.startAt, next.durationMinutes)} with ${other.name}</span>
          <a class="btn btn-soft btn-sm" style="align-self:flex-start;margin-top:6px" href="#/sessions">${icon('video', 15)} View</a></div>` : html`<p class="muted">${user.role === 'seeker' ? 'No sessions booked. Book a one-to-one session with a mentor.' : 'No upcoming sessions.'}</p>`}
        ${waiting ? html`<div class="row"><span class="badge status-pending">${waiting}</span><span>meeting request${waiting === 1 ? '' : 's'} waiting for your reply</span></div>` : ''}
        ${user.role === 'seeker' && !next ? html`<a class="btn btn-primary btn-sm" style="align-self:flex-start" href="#/search">Find a mentor</a>` : ''}
      </section>` : ''}
    </div>`;
}

const announcementItem = (a) => html`
  <div class="person-row">
    <span class="date-block" style="width:54px;padding:6px 2px"><span class="m" style="display:block">${new Date(a.eventDate).toLocaleDateString(undefined, { month: 'short' })}</span><span class="d" style="font-size:1.4rem">${new Date(a.eventDate).getDate()}</span></span>
    <div class="info"><div class="name">${a.title}</div><div class="meta">${[a.venue, a.organizer].filter(Boolean).join(', ')}</div></div>
  </div>`;

async function seekerDashboard({ root, user }) {
  const [d, cards] = await Promise.all([api.get('/dashboard/seeker'), featureCards(user)]);
  const s = d.stats;
  setHTML(root, html`
    <header class="page-head">
      <div><h1>Welcome back, ${user.name.split(' ')[0]}</h1><p class="muted">Here is where your learning stands today.</p></div>
      <div class="actions"><a class="btn btn-primary" href="#/post">${icon('edit', 16)} Post a request</a><a class="btn btn-ghost" href="#/search">${icon('search', 16)} Search Helpers</a></div>
    </header>

    <section class="statband" aria-label="Your numbers">
      <div class="stat"><div class="num">${s.connections}</div><div class="lbl">Total connections</div></div>
      <div class="stat"><div class="num">${s.pending}</div><div class="lbl">Pending requests</div></div>
      <div class="stat"><div class="num">${s.accepted}</div><div class="lbl">Accepted requests</div></div>
      <div class="stat"><div class="num">${s.points}</div><div class="lbl">Available reward points</div></div>
    </section>

    <div class="cols" style="margin-top:28px">
      <section class="panel" aria-labelledby="rec-h">
        <div class="panel-head"><h2 id="rec-h">Recommended Helpers</h2><a href="#/search">See all</a></div>
        <p class="muted small" style="margin:-8px 0 14px">${d.recommendedBasedOn === 'interests' ? 'Based on the topics you asked about and your interests.' : 'Top Helpers right now. Post a request to get skill-matched suggestions.'}</p>
        ${d.recommended.length ? d.recommended.map((h) => html`
          <div class="person-row">
            ${avatar(h)}
            <div class="info">
              <div class="name">${h.name} ${h.verified ? verifiedBadge() : ''}</div>
              <div class="meta">${(h.matchedSkills || []).slice(0, 3).join(', ')}</div>
            </div>
            ${h.score ? scoreBar(h.score) : ''}
            <a class="btn btn-ghost btn-sm" href="#/helper/${h._id}">View</a>
          </div>`) : emptyState('No Helpers yet', 'Helpers will appear here as they join.')}
      </section>

      <section class="panel mini-board" aria-labelledby="lb-h">
        <div class="panel-head"><h2 id="lb-h">Helper leaderboard</h2><a href="#/leaderboard">Full board</a></div>
        ${d.leaderboard.map((h) => html`
          <div class="person-row">
            <span class="mini-rank">${h.rank}</span>
            ${avatar(h, 'sm')}
            <div class="info"><div class="name">${h.name} ${h.verified ? verifiedBadge() : ''}</div><div class="meta">${h.studentsHelped} students helped</div></div>
            <span class="pts">${h.points}</span>
          </div>`)}
      </section>
    </div>

    ${cards}

    <section class="panel" style="margin-top:22px" aria-labelledby="an-h">
      <div class="panel-head"><h2 id="an-h">Recent announcements</h2><a href="#/announcements">All announcements</a></div>
      ${d.announcements.length ? d.announcements.map(announcementItem) : html`<p class="muted">No upcoming events yet.</p>`}
    </section>`);
}

async function helperDashboard({ root, user }) {
  const [d, cards] = await Promise.all([api.get('/dashboard/helper'), featureCards(user)]);
  const s = d.stats;
  setHTML(root, html`
    <header class="page-head">
      <div><h1>Welcome, ${user.name.split(' ')[0]}</h1><p class="muted">Thanks for helping other students on campus.</p></div>
      <div class="actions"><a class="btn btn-primary" href="#/requests">${icon('file', 16)} View requests</a><a class="btn btn-ghost" href="#/announcements">${icon('megaphone', 16)} Post an announcement</a></div>
    </header>

    <section class="statband" aria-label="Your numbers">
      <div class="stat"><div class="num">${s.studentsHelped}</div><div class="lbl">Students helped</div></div>
      <div class="stat"><div class="num">${s.points}</div><div class="lbl">Earned points</div></div>
      <div class="stat"><div class="num">${s.pending}</div><div class="lbl">Pending requests</div></div>
      <div class="stat"><div class="num">${s.completed}</div><div class="lbl">Completed requests</div></div>
    </section>

    <div class="cols" style="margin-top:28px">
      <section class="panel" aria-labelledby="pf-h">
        <div class="panel-head"><h2 id="pf-h">Your profile</h2><a href="#/profile">Edit</a></div>
        <div class="stack">
          <div class="row wrap">
            ${user.verified
              ? html`${verifiedBadge()}<span class="muted small">Assigned manually in this prototype.</span>`
              : html`<span class="badge badge-type">Not verified</span><span class="muted small">Badges are assigned manually in this prototype.</span>`}
          </div>
          <div><div class="small muted" style="margin-bottom:6px">Skills and expertise</div>${user.skills.length ? chips(user.skills, { max: 12 }) : html`<p class="muted">Add your skills so Seekers can find you.</p>`}</div>
          ${user.expertise ? html`<p>${user.expertise}</p>` : ''}
          <div class="notice">${d.rank
            ? html`<strong>Leaderboard position: ${d.rank} of ${d.totalHelpers} Helpers.</strong> Calculated from stored points, so it changes as points change.`
            : 'Leaderboard position is not available yet.'}
            <a href="#/leaderboard">View leaderboard</a></div>
        </div>
      </section>

      <section class="panel" aria-labelledby="wq-h">
        <div class="panel-head"><h2 id="wq-h">Your queue</h2><a href="#/requests">Open</a></div>
        <div class="stack">
          <div class="row"><span class="badge status-pending">${s.pending}</span><span>waiting for your reply</span></div>
          <div class="row"><span class="badge status-accepted">${s.active}</span><span>accepted and in progress</span></div>
          <div class="row"><span class="badge status-completed">${s.completed}</span><span>completed</span></div>
          <a class="btn btn-primary btn-sm" style="align-self:flex-start" href="#/requests">Manage requests</a>
        </div>
      </section>
    </div>

    ${cards}

    <section class="panel" style="margin-top:22px" aria-labelledby="an-h">
      <div class="panel-head"><h2 id="an-h">Upcoming announcements</h2><a href="#/announcements">All announcements</a></div>
      ${d.announcements.length ? d.announcements.map(announcementItem) : html`<p class="muted">No upcoming events yet. Post one for your fellow students.</p>`}
    </section>`);
}

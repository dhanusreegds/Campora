import { api } from '../api.js';
import { html, avatar, chips, verifiedBadge, setHTML, emptyState } from '../ui.js';

export default async function leaderboardPage({ root, user }) {
  const { leaderboard, totalHelpers } = await api.get('/leaderboard');
  setHTML(root, html`
    <header class="page-head"><div><h1>Helper leaderboard</h1><p class="muted">Ranked by contribution points. Points come from completed help requests, so the order changes as Helpers earn or spend points.</p></div></header>
    ${leaderboard.length ? html`
    <div class="board" role="table" aria-label="Helper leaderboard, ${totalHelpers} Helpers">
      <div class="board-row head" role="row"><span role="columnheader">Rank</span><span role="columnheader">Helper</span><span class="skills-col" role="columnheader">Skills</span><span class="helped" role="columnheader" style="text-align:right">Students helped</span><span role="columnheader" style="text-align:right">Points</span></div>
      ${leaderboard.map((h) => html`
        <div class="board-row ${h._id === user._id ? 'me' : ''}" role="row">
          <span class="rank r${h.rank}" role="cell">${h.rank}</span>
          <span class="row" role="cell">${avatar(h)}<span><a href="#/helper/${h._id}" style="font-weight:700;text-decoration:none;color:inherit">${h.name}</a> ${h.verified ? verifiedBadge() : ''}<br><span class="muted small">@${h.username}${h._id === user._id ? ' (you)' : ''}</span></span></span>
          <span class="skills-col" role="cell">${chips(h.skills || [], { max: 3 })}</span>
          <span class="helped" role="cell">${h.studentsHelped}</span>
          <span class="pts" role="cell">${h.points}<small>points</small></span>
        </div>`)}
    </div>` : emptyState('No Helpers yet', 'The leaderboard fills up as Helpers join and earn points.')}`);
}

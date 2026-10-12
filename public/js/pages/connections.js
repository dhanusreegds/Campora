import { api } from '../api.js';
import { html, icon, avatar, chips, verifiedBadge, setHTML, emptyState, academicLine, fmtDate } from '../ui.js';

export default async function connectionsPage({ root, user }) {
  const { connections } = await api.get('/connections');
  const isSeeker = user.role === 'seeker';
  setHTML(root, html`
    <header class="page-head"><div><h1>My connections</h1><p class="muted">${isSeeker ? 'Helpers who accepted one of your requests.' : 'Students you agreed to help.'}</p></div></header>
    ${connections.length
      ? html`<div class="grid-cards">${connections.map((c) => html`
        <article class="helper-card ${c.user.verified ? 'is-verified' : ''}">
          <div class="top">${avatar(c.user, 'lg')}<div><div class="name">${c.user.name}</div><div class="user">@${c.user.username}</div><div style="margin-top:4px">${c.user.verified ? verifiedBadge() : ''}</div></div></div>
          <div class="muted small">${academicLine(c.user)}</div>
          ${chips(c.user.skills || [], { max: 4 })}
          <div class="row wrap"><span class="badge status-accepted">${c.status[0].toUpperCase() + c.status.slice(1)}</span><span class="muted small">Connected since ${fmtDate(c.since)}</span></div>
          <div class="actions">
            ${isSeeker ? html`<a class="btn btn-ghost btn-sm" href="#/helper/${c.user._id}">View profile</a>` : ''}
            <a class="btn btn-primary btn-sm" href="#/chat/${c.user._id}">${icon('chat', 15)} Open chat</a>
          </div>
        </article>`)}</div>`
      : emptyState('No connections yet', 'A connection is created when a Helper accepts your request.', { href: '#/search', label: 'Search Helpers' })}`);
}

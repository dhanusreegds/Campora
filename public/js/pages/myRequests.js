import { api } from '../api.js';
import { html, icon, avatar, chips, statusBadge, verifiedBadge, scoreBar, setHTML, onClick, emptyState, fmtDate, cap } from '../ui.js';

const STATUSES = ['all', 'pending', 'accepted', 'completed', 'rejected'];

export default async function myRequestsPage({ root }) {
  const { requests } = await api.get('/requests/mine');
  let status = 'all';
  let type = 'all';

  const countOf = (s) => requests.filter((r) => s === 'all' || r.status === s).length;

  function card(r) {
    const helper = r.assignedHelper;
    const canChat = helper && ['accepted', 'completed'].includes(r.status);
    return html`
      <article class="req s-${r.status}">
        <div class="badges">${statusBadge(r.status)}<span class="badge badge-type">${r.type === 'direct' ? 'Sent to a Helper' : 'Public post'}</span><span class="badge badge-type">${cap(r.difficulty)}</span></div>
        <h3>${r.title}</h3>
        <div class="meta"><span>${r.category}</span><span>Posted ${fmtDate(r.createdAt)}</span>${r.deadline ? html`<span>Deadline ${fmtDate(r.deadline)}</span>` : ''}${r.assistanceType ? html`<span>${r.assistanceType}</span>` : ''}</div>
        <details><summary>Show details</summary><p>${r.description}</p></details>
        ${r.requiredSkills.length ? chips(r.requiredSkills, { max: 8 }) : ''}
        <div class="foot">
          ${helper
            ? html`<span class="mini-match">${avatar(helper, 'sm')}<span>${r.status === 'pending' ? 'Sent to' : r.status === 'rejected' ? 'Declined by' : r.status === 'completed' ? 'Completed by' : 'Accepted by'} <strong>${helper.name}</strong></span></span>`
            : r.matchedHelpers.length
              ? html`<div class="stack" style="gap:8px;width:100%"><span class="small muted">Recommended Helpers (notified when the match is strong):</span><div class="row wrap">${r.matchedHelpers.slice(0, 4).map((m) => html`<a class="mini-match" href="#/helper/${m.helper._id}" style="color:inherit;text-decoration:none">${avatar(m.helper, 'sm')}<span><strong>${m.helper.name}</strong> ${m.score}%<br><span class="muted">${m.matchedSkills.join(', ')}</span></span></a>`)}</div></div>`
              : html`<span class="muted small">Waiting for a Helper. No skill matches were found yet.</span>`}
          <span class="spacer"></span>
          ${canChat ? html`<a class="btn btn-soft btn-sm" href="#/chat/${helper._id}">${icon('chat', 15)} Open chat</a>` : ''}
        </div>
      </article>`;
  }

  function paint() {
    const list = requests.filter((r) => (status === 'all' || r.status === status) && (type === 'all' || r.type === type));
    setHTML(root, html`
      <header class="page-head"><div><h1>My requests</h1><p class="muted">Requests you sent to Helpers and questions you posted publicly.</p></div><div class="actions"><a class="btn btn-primary" href="#/post">${icon('plus', 16)} New public post</a></div></header>
      <div class="tabs" role="tablist" aria-label="Filter by status">${STATUSES.map((s) => html`<button class="tab" role="tab" data-status="${s}" aria-selected="${String(s === status)}">${cap(s)} <span class="n">${countOf(s)}</span></button>`)}</div>
      <div class="row wrap" style="margin-bottom:16px"><label class="small muted" for="type-filter">Show</label><select class="select" id="type-filter" style="width:auto"><option value="all" ${type === 'all' ? 'selected' : ''}>All requests</option><option value="direct" ${type === 'direct' ? 'selected' : ''}>Sent to a Helper</option><option value="public" ${type === 'public' ? 'selected' : ''}>Public posts</option></select></div>
      ${list.length ? html`<div class="req-list">${list.map(card)}</div>` : emptyState('Nothing here yet', requests.length ? 'No requests match this filter.' : 'Send a request to a Helper or post a question to get started.', { href: '#/search', label: 'Search Helpers' })}`);
  }

  paint();
  onClick(root, '[data-status]', (el) => { status = el.dataset.status; paint(); });
  root.addEventListener('change', (e) => { if (e.target.id === 'type-filter') { type = e.target.value; paint(); } });
}

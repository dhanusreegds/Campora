import { api, qs } from '../api.js';
import { html, icon, avatar, chips, statusBadge, setHTML, toHTML, onClick, emptyState, debounce, spinner, fmtDate, cap, toast, confirmDialog } from '../ui.js';

const TABS = [
  ['incoming', 'Incoming'],
  ['open', 'Community posts'],
  ['active', 'Active'],
  ['history', 'History'],
];

const EMPTY = {
  incoming: ['No incoming requests', 'Requests sent to you and public posts that match your skills will show up here.'],
  open: ['No other open posts', 'Public posts that were not matched to you appear here so you can still pick them up.'],
  active: ['Nothing in progress', 'Accepted requests stay here until you mark them as completed.'],
  history: ['No history yet', 'Completed and rejected requests will be listed here.'],
};

export default async function helperRequestsPage({ root, refreshUser }) {
  let tab = 'incoming';
  let counts = {};
  let requests = [];
  let seq = 0;

  setHTML(root, html`
    <header class="page-head"><div><h1>Help requests</h1><p class="muted">Accept what you can help with, chat with the student, then mark the request completed to earn points.</p></div></header>
    <div class="tabs" id="tabs" role="tablist" aria-label="Request lists"></div>
    <form class="row wrap" id="filters" style="margin-bottom:16px" role="search" aria-label="Filter requests">
      <div class="field" style="min-width:200px;flex:1"><label for="fs">Subject</label><input class="input" id="fs" name="subject" placeholder="e.g. Operating Systems"></div>
      <div class="field" style="min-width:200px;flex:1"><label for="fk">Skill</label><input class="input" id="fk" name="skill" placeholder="e.g. Java"></div>
    </form>
    <div id="list"></div>`);
  const listEl = root.querySelector('#list');
  const tabsEl = root.querySelector('#tabs');
  const form = root.querySelector('#filters');

  function paintTabs() {
    setHTML(tabsEl, TABS.map(([key, label]) => html`<button class="tab" role="tab" data-tab="${key}" aria-selected="${String(key === tab)}">${label} <span class="n">${counts[key] ?? 0}</span></button>`));
  }

  function card(r) {
    const s = r.seeker || {};
    const recommended = r.type === 'public' && r.myMatch;
    const highlight = r.myMatch ? r.myMatch.matchedSkills : [];
    return html`
      <article class="req s-${r.status}" data-id="${r._id}">
        <div class="badges">
          ${statusBadge(r.status)}
          <span class="badge badge-type">${r.type === 'direct' ? 'Sent to you' : 'Public post'}</span>
          ${recommended && r.status === 'pending' ? html`<span class="badge status-accepted">Recommended for you</span>` : ''}
          <span class="badge badge-type">${cap(r.difficulty)}</span>
          <span class="badge badge-type">${r.status === 'completed' ? `+${r.pointsValue} points earned` : `Worth ${r.potentialPoints} points`}</span>
        </div>
        <h3>${r.title}</h3>
        <div class="meta"><span>${r.category}</span><span>Posted ${fmtDate(r.createdAt)}</span>${r.deadline ? html`<span>Deadline ${fmtDate(r.deadline)}</span>` : ''}${r.assistanceType ? html`<span>${r.assistanceType}</span>` : ''}</div>
        <details><summary>Read the full question</summary><p>${r.description}</p></details>
        ${r.requiredSkills.length ? chips(r.requiredSkills, { max: 8, highlight }) : ''}
        ${recommended ? html`<div class="match-line"><strong>${r.myMatch.score}% match.</strong> ${r.myMatch.explanation}</div>` : ''}
        <div class="foot">
          <span class="mini-match">${avatar(s, 'sm')}<span>Asked by <strong>${s.name || 'a student'}</strong>${s.department ? html`<br><span class="muted">${s.department}${s.year ? `, Year ${s.year}` : ''}</span>` : ''}</span></span>
          <span class="spacer"></span>
          ${['incoming', 'open'].includes(tab) && r.status === 'pending' ? html`
            <button class="btn btn-danger btn-sm" data-action="reject" data-id="${r._id}" data-type="${r.type}">Reject</button>
            <button class="btn btn-primary btn-sm" data-action="accept" data-id="${r._id}">${icon('check', 15)} Accept</button>` : ''}
          ${r.status === 'accepted' ? html`
            <a class="btn btn-soft btn-sm" href="#/chat/${s._id}">${icon('chat', 15)} Open chat</a>
            <button class="btn btn-primary btn-sm" data-action="complete" data-id="${r._id}" data-points="${r.potentialPoints}">${icon('check', 15)} Mark completed</button>` : ''}
          ${r.status === 'completed' ? html`<a class="btn btn-ghost btn-sm" href="#/chat/${s._id}">Open chat</a>` : ''}
        </div>
      </article>`;
  }

  async function load() {
    const mine = ++seq;
    listEl.innerHTML = toHTML(spinner());
    const v = Object.fromEntries(new FormData(form).entries());
    try {
      const data = await api.get(`/requests/incoming${qs({ tab, subject: v.subject, skill: v.skill })}`);
      if (mine !== seq) return;
      requests = data.requests;
      counts = data.counts;
      paintTabs();
      setHTML(listEl, requests.length ? html`<div class="req-list">${requests.map(card)}</div>` : emptyState(...EMPTY[tab]));
    } catch (err) {
      if (mine === seq) setHTML(listEl, html`<div class="form-error">${err.message}</div>`);
    }
  }

  onClick(tabsEl, '[data-tab]', (el) => { tab = el.dataset.tab; paintTabs(); load(); });
  form.addEventListener('input', debounce(load, 300));
  form.addEventListener('submit', (e) => e.preventDefault());

  onClick(listEl, '[data-action]', async (el) => {
    const { action, id } = el.dataset;
    el.disabled = true;
    try {
      if (action === 'accept') {
        const { request } = await api.post(`/requests/${id}/accept`);
        toast('Request accepted. A connection was created and chat is now open.', { type: 'success', link: { href: `#/chat/${request.postedBy}`, label: 'Open chat' } });
      } else if (action === 'reject') {
        const isPublic = el.dataset.type === 'public';
        const ok = await confirmDialog({
          title: 'Reject this request?',
          message: isPublic ? 'The post will be hidden for you. It stays open for other Helpers.' : 'The student will be told you cannot take this request.',
          confirmText: 'Reject',
          danger: true,
        });
        if (!ok) { el.disabled = false; return; }
        await api.post(`/requests/${id}/reject`);
        toast(isPublic ? 'Post hidden from your list.' : 'Request rejected.');
      } else if (action === 'complete') {
        const ok = await confirmDialog({
          title: 'Mark as completed?',
          message: `You will earn ${el.dataset.points} points. Points are awarded once per request, and this cannot be undone.`,
          confirmText: 'Mark completed',
        });
        if (!ok) { el.disabled = false; return; }
        const res = await api.post(`/requests/${id}/complete`);
        toast(`Well done! You earned ${res.pointsAwarded} points. Total: ${res.totalPoints}.`, { type: 'success' });
        await refreshUser();
      }
      await load();
    } catch (err) {
      toast(err.message, { type: 'error' });
      el.disabled = false;
      load();
    }
  });

  await load();
}

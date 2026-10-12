import { api } from '../api.js';
import { html, icon, avatar, verifiedBadge, setHTML, onClick, emptyState, toast, confirmDialog, fmtSlot, countdown, cap } from '../ui.js';
import { openBookingModal, openSuggestModal } from './sessionBooking.js';

const TABS = [['requests', 'Requests'], ['upcoming', 'Upcoming'], ['past', 'Past']];
const STATUS_LABEL = {
  pending: 'Waiting for reply', reschedule_proposed: 'New time suggested', accepted: 'Confirmed', rejected: 'Declined',
  cancelled: 'Cancelled', expired: 'Expired', completed: 'Completed', missed: 'Missed',
};
const BADGE_CLASS = { reschedule_proposed: 'pending', missed: 'rejected', expired: 'used', cancelled: 'used' };
const EMPTY = {
  requests: ['No open requests', 'Meeting requests waiting for an answer show up here.'],
  upcoming: ['No upcoming sessions', 'Accepted sessions appear here with a Join Help Room button.'],
  past: ['No past sessions yet', 'Completed, declined and cancelled sessions are listed here.'],
};

export default async function sessionsPage({ root, user }) {
  const isSeeker = user.role === 'seeker';
  let sessions = [];
  let offset = 0; // server clock minus browser clock, so countdowns are right even if the PC clock is off
  let tab = null;
  let stopped = false;
  let reloadQueued = false;

  const now = () => Date.now() + offset;
  const isOpen = (s) => ['pending', 'reschedule_proposed'].includes(s.status);
  const isUpcoming = (s) => s.status === 'accepted' && s.room && !['archived', 'cancelled'].includes(s.room.status);
  const group = (key) => {
    if (key === 'requests') return sessions.filter(isOpen).sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
    if (key === 'upcoming') return sessions.filter(isUpcoming).sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
    return sessions.filter((s) => !isOpen(s) && !isUpcoming(s));
  };

  async function load() {
    const d = await api.get('/sessions');
    if (stopped) return;
    sessions = d.sessions;
    offset = new Date(d.serverTime).getTime() - Date.now();
    if (!tab) tab = group('upcoming').length ? 'upcoming' : group('requests').length ? 'requests' : 'upcoming';
    paint();
  }

  function person(s) {
    const other = isSeeker ? s.helper : s.seeker;
    return html`<span class="mini-match">${avatar(other, 'sm')}<span>${isSeeker ? 'Mentor' : 'Student'}: <strong>${other.name}</strong> ${other.verified ? verifiedBadge() : ''}${other.department ? html`<br><span class="muted">${other.department}${other.year ? `, Year ${other.year}` : ''}</span>` : ''}</span></span>`;
  }

  function actions(s) {
    const out = [];
    const room = s.room;
    if (s.status === 'pending' && !isSeeker) {
      out.push(html`<button class="btn btn-danger btn-sm" data-act="reject" data-id="${s._id}">Reject</button>`);
      out.push(html`<button class="btn btn-ghost btn-sm" data-act="suggest" data-id="${s._id}">${icon('clock', 15)} Suggest another time</button>`);
      out.push(html`<button class="btn btn-primary btn-sm" data-act="accept" data-id="${s._id}">${icon('check', 15)} Accept</button>`);
    } else if (s.status === 'pending' && isSeeker) {
      out.push(html`<button class="btn btn-ghost btn-sm" data-act="cancel" data-id="${s._id}">Cancel request</button>`);
    } else if (s.status === 'reschedule_proposed' && isSeeker) {
      out.push(html`<button class="btn btn-ghost btn-sm" data-act="cancel" data-id="${s._id}">Cancel request</button>`);
      out.push(html`<button class="btn btn-danger btn-sm" data-act="reject" data-id="${s._id}">Decline new time</button>`);
      out.push(html`<button class="btn btn-primary btn-sm" data-act="accept" data-id="${s._id}">${icon('check', 15)} Accept new time</button>`);
    } else if (s.status === 'accepted' && room) {
      if (now() < new Date(s.startAt).getTime()) out.push(html`<button class="btn btn-ghost btn-sm" data-act="cancel" data-id="${s._id}">Cancel session</button>`);
      if (room.status === 'active') out.push(html`<a class="btn btn-primary" href="#/room/${room.roomId}">${icon('video', 16)} Join Help Room</a>`);
      else if (room.status === 'scheduled') out.push(html`<button class="btn btn-soft" disabled>${icon('lock', 15)} Opens in <span class="js-count" data-to="${room.opensAt}">...</span></button>`);
      else out.push(html`<a class="btn btn-soft btn-sm" href="#/room/${room.roomId}">View room</a>`);
    } else if (room && ['completed', 'missed'].includes(s.status)) {
      out.push(html`<a class="btn btn-soft btn-sm" href="#/room/${room.roomId}">${icon('file', 15)} Session summary</a>`);
    }
    return out;
  }

  function card(s) {
    const proposal = s.status === 'reschedule_proposed' && s.proposal;
    const first = (u) => u.name.split(' ')[0];
    const before = now() < new Date(s.startAt).getTime();
    return html`
      <article class="req s-${s.status === 'reschedule_proposed' ? 'pending' : s.status}">
        <div class="badges">
          <span class="badge status-${BADGE_CLASS[s.status] || s.status}">${STATUS_LABEL[s.status] || cap(s.status)}</span>
          <span class="badge badge-type">${s.categoryLabel}</span>
          <span class="badge badge-type">${s.durationMinutes} min</span>
        </div>
        <h3>${s.topic}</h3>
        <div class="meta"><span>${icon('calendar', 15)} ${fmtSlot(s.startAt, s.durationMinutes)}</span></div>
        ${s.reason ? html`<details><summary>Reason and details</summary><p>${s.reason}</p></details>` : ''}
        ${proposal ? html`<div class="match-line"><strong>${first(s.helper)} suggests ${fmtSlot(proposal.startAt, proposal.durationMinutes)}.</strong>${proposal.note ? ` "${proposal.note}"` : ''}</div>` : ''}
        ${s.status === 'rejected' && s.responseNote ? html`<div class="match-line">Note: ${s.responseNote}</div>` : ''}
        ${s.status === 'accepted' && s.room && s.room.status === 'scheduled' ? html`<div class="match-line">${icon('lock', 14)} Your private Help Room is ready. It opens a few minutes before the start and is only visible to you and ${first(isSeeker ? s.helper : s.seeker)}.</div>` : ''}
        ${s.status === 'accepted' && s.room && s.room.status === 'active' ? html`<div class="match-line"><strong>The room is open.</strong> ${before ? 'Starts in' : 'Ends in'} <span class="js-count" data-to="${before ? s.startAt : s.room.scheduledEnd}">...</span></div>` : ''}
        <div class="foot">${person(s)}<span class="spacer"></span>${actions(s)}</div>
      </article>`;
  }

  function paint() {
    const counts = Object.fromEntries(TABS.map(([k]) => [k, group(k).length]));
    const list = group(tab);
    setHTML(root, html`
      <header class="page-head">
        <div><h1>Help Sessions</h1><p class="muted">${isSeeker ? 'Book a focused one-to-one session with a senior. Pick the kind of help, a mentor and a time.' : 'Answer meeting requests from students. Accepted sessions get a private Help Room.'}</p></div>
        ${isSeeker ? html`<div class="actions"><button class="btn btn-primary" id="book">${icon('plus', 16)} Book a session</button></div>` : ''}
      </header>
      <div class="tabs" role="tablist" aria-label="Session lists">${TABS.map(([k, label]) => html`<button class="tab" role="tab" data-tab="${k}" aria-selected="${String(k === tab)}">${label} <span class="n">${counts[k]}</span></button>`)}</div>
      ${list.length ? html`<div class="req-list">${list.map(card)}</div>` : emptyState(...EMPTY[tab], isSeeker && tab !== 'past' ? { href: '#/search', label: 'Find a mentor' } : undefined)}`);
    tickCounts();
  }

  function tickCounts() {
    let crossed = false;
    root.querySelectorAll('.js-count').forEach((el) => {
      const ms = new Date(el.dataset.to).getTime() - now();
      el.textContent = countdown(ms);
      if (ms <= 0) crossed = true;
    });
    // When a countdown reaches zero, refresh once so the Join button appears or disappears.
    if (crossed && !reloadQueued) { reloadQueued = true; setTimeout(() => { reloadQueued = false; if (!stopped) load().catch(() => {}); }, 1500); }
  }

  onClick(root, '[data-tab]', (el) => { tab = el.dataset.tab; paint(); });
  onClick(root, '#book', () => openBookingModal({ onDone: () => { tab = 'requests'; load(); } }));
  onClick(root, '[data-act]', async (el) => {
    const { act, id } = el.dataset;
    const s = sessions.find((x) => x._id === id);
    if (!s) return;
    try {
      if (act === 'suggest') return openSuggestModal(s, load);
      if (act === 'accept') {
        el.disabled = true;
        const r = await api.post(`/sessions/requests/${id}/accept`);
        toast('Session confirmed. A private Help Room was created for it.', { type: 'success', link: { href: `#/room/${r.roomId}`, label: 'Open room' } });
        tab = 'upcoming';
      } else if (act === 'reject') {
        const ok = await confirmDialog({ title: isSeeker ? 'Decline the new time?' : 'Reject this request?', message: isSeeker ? 'The request will be closed. You can book another time.' : `${s.seeker.name} will be told you cannot take this session.`, confirmText: isSeeker ? 'Decline' : 'Reject', danger: true });
        if (!ok) return;
        await api.post(`/sessions/requests/${id}/reject`);
        toast(isSeeker ? 'Request closed.' : 'Request rejected.');
      } else if (act === 'cancel') {
        const ok = await confirmDialog({ title: 'Cancel this session?', message: s.status === 'accepted' ? 'The Help Room will be closed and the other person will be notified.' : 'The request will be withdrawn.', confirmText: 'Cancel session', danger: true });
        if (!ok) return;
        await api.post(`/sessions/requests/${id}/cancel`);
        toast('Cancelled.');
      }
      await load();
    } catch (err) {
      toast(err.message, { type: 'error' });
      el.disabled = false;
      load().catch(() => {});
    }
  });

  await load();
  const tickTimer = setInterval(tickCounts, 1000);
  const loadTimer = setInterval(() => { if (!document.hidden) load().catch(() => {}); }, 20000);
  return () => { stopped = true; clearInterval(tickTimer); clearInterval(loadTimer); };
}

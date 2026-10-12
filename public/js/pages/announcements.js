import { api } from '../api.js';
import { html, icon, setHTML, onClick, openModal, formValues, toast, emptyState, confirmDialog, fmtDateTime, cap } from '../ui.js';

export default async function announcementsPage({ root, user }) {
  const isHelper = user.role === 'helper';
  let items = [];
  let checked = new Set();

  async function load() {
    const { announcements } = await api.get('/announcements');
    items = announcements;
    try { checked = new Set((await api.get('/announcements/checkins/mine')).announcementIds); } catch { checked = new Set(); }
    paint();
  }

  // Check-in opens 2 hours before the event and closes two days after it starts (server enforces the same).
  function canCheckIn(a) {
    const t = new Date(a.eventDate).getTime();
    return Date.now() >= t - 2 * 3600 * 1000 && Date.now() < t + 2 * 24 * 3600 * 1000;
  }

  function card(a, past) {
    const d = new Date(a.eventDate);
    const mine = a.createdBy && a.createdBy._id === user._id;
    return html`
      <article class="ann ${past ? 'past' : ''}">
        <div class="date-block" aria-hidden="true"><div class="m">${d.toLocaleDateString(undefined, { month: 'short' })}</div><div class="d">${d.getDate()}</div><div class="y">${d.getFullYear()}</div></div>
        <div>
          <h3>${a.title} ${a.category && a.category !== 'general' ? html`<span class="chip">${cap(a.category)}</span>` : ''}</h3>
          <p>${a.description}</p>
          <div class="meta">
            <span>${icon('clock', 15)} ${fmtDateTime(a.eventDate)}</span>
            ${a.venue ? html`<span>${icon('pin', 15)} ${a.venue}</span>` : ''}
            ${a.organizer ? html`<span>${icon('users', 15)} ${a.organizer}</span>` : ''}
          </div>
        </div>
        <div class="side stack" style="align-items:flex-end;gap:8px">
          ${a.registrationLink && !past ? html`<a class="btn btn-primary btn-sm" href="${a.registrationLink}" target="_blank" rel="noopener noreferrer">Register ${icon('link', 14)}</a>` : ''}
          ${canCheckIn(a) ? (checked.has(a._id) ? html`<span class="badge status-completed">${icon('check', 13)} Checked in</span>` : html`<button class="btn btn-soft btn-sm" data-checkin="${a._id}">${icon('check', 14)} I attended</button>`) : ''}
          ${mine ? html`<button class="btn btn-ghost btn-sm" data-delete="${a._id}" aria-label="Delete ${a.title}">${icon('trash', 14)} Delete</button>` : ''}
        </div>
      </article>`;
  }

  function paint() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const upcoming = items.filter((a) => new Date(a.eventDate) >= startOfToday);
    const past = items.filter((a) => new Date(a.eventDate) < startOfToday).reverse();
    setHTML(root, html`
      <header class="page-head">
        <div><h1>Announcements</h1><p class="muted">Hackathons, workshops, seminars and other campus updates, soonest first.</p></div>
        ${isHelper ? html`<div class="actions"><button class="btn btn-primary" id="new-ann">${icon('plus', 16)} New announcement</button></div>` : ''}
      </header>
      <section aria-labelledby="up-h"><h2 id="up-h" style="margin-bottom:14px">Upcoming</h2>
        ${upcoming.length ? html`<div class="ann-list">${upcoming.map((a) => card(a, false))}</div>` : emptyState('No upcoming events', isHelper ? 'Post the first announcement for your campus.' : 'Check back soon.')}
      </section>
      ${past.length ? html`<section style="margin-top:32px" aria-labelledby="past-h"><h2 id="past-h" style="margin-bottom:14px">Past events</h2><div class="ann-list">${past.map((a) => card(a, true))}</div></section>` : ''}`);
  }

  function openForm() {
    const modal = openModal({
      title: 'New announcement',
      wide: true,
      body: html`
        <form id="ann-form" class="stack" novalidate>
          <div id="ann-error" class="form-error" role="alert" hidden></div>
          <div class="field"><label for="a-title">Title</label><input class="input" id="a-title" name="title" maxlength="140" required placeholder="e.g. Intro to Git workshop"></div>
          <div class="field"><label for="a-desc">Description</label><textarea class="textarea" id="a-desc" name="description" maxlength="1500" required></textarea></div>
          <div class="form-grid">
            <div class="field"><label for="a-date">Event date and time</label><input class="input" id="a-date" name="eventDate" type="datetime-local" required></div>
            <div class="field"><label for="a-cat">Type of event</label><select class="select" id="a-cat" name="category"><option value="general">General</option><option value="workshop">Workshop</option><option value="club">Club event</option><option value="technical">Technical talk or seminar</option><option value="hackathon">Hackathon</option></select></div>
            <div class="field"><label for="a-venue">Venue</label><input class="input" id="a-venue" name="venue" maxlength="120"></div>
            <div class="field"><label for="a-org">Organizer</label><input class="input" id="a-org" name="organizer" maxlength="120" placeholder="${user.name}"></div>
            <div class="field"><label for="a-link">Registration link (optional)</label><input class="input" id="a-link" name="registrationLink" type="url" placeholder="https://"></div>
          </div>
        </form>`,
      footer: html`<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit" form="ann-form">Publish</button>`,
    });
    const form = modal.el.querySelector('#ann-form');
    const err = modal.el.querySelector('#ann-error');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.hidden = true;
      const v = formValues(form);
      if (!v.title.trim() || !v.description.trim() || !v.eventDate) {
        err.textContent = 'Title, description and event date are required.';
        err.hidden = false;
        return;
      }
      try {
        await api.post('/announcements', { ...v, eventDate: new Date(v.eventDate).toISOString() });
        modal.close();
        toast('Announcement published.', { type: 'success' });
        await load();
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
      }
    });
  }

  root.addEventListener('click', async (e) => {
    if (e.target.closest('#new-ann')) openForm();
    const ci = e.target.closest('[data-checkin]');
    if (ci) {
      ci.disabled = true;
      try {
        const r = await api.post(`/announcements/${ci.dataset.checkin}/checkin`);
        const won = r.completed.reduce((n, c) => n + c.points, 0);
        toast(won ? `Checked in. A challenge completed: +${won} points.` : 'Checked in. Thanks for attending!', { type: 'success', link: won ? { href: '#/challenges', label: 'View challenges' } : undefined });
        await load();
      } catch (err) { toast(err.message, { type: 'error' }); ci.disabled = false; }
    }
    const del = e.target.closest('[data-delete]');
    if (del) {
      const ok = await confirmDialog({ title: 'Delete announcement?', message: 'This removes it for everyone.', confirmText: 'Delete', danger: true });
      if (!ok) return;
      try { await api.del(`/announcements/${del.dataset.delete}`); toast('Announcement deleted.'); await load(); } catch (err) { toast(err.message, { type: 'error' }); }
    }
  });

  await load();
}

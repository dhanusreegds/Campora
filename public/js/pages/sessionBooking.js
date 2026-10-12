import { api } from '../api.js';
import { html, icon, openModal, toast, formValues, academicLine } from '../ui.js';

let metaCache = null;
export async function sessionMeta() {
  if (!metaCache) metaCache = await api.get('/sessions/meta');
  return metaCache;
}

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Turns the date + time inputs (the person's local time) into an exact instant. */
const toInstant = (date, time) => new Date(`${date}T${time}`).toISOString();

/**
 * Booking flow for a Seeker: help type -> mentor -> date, time, duration -> topic and reason.
 * Pass { helper } to pre-select a mentor (from a profile or search card).
 */
export async function openBookingModal({ helper, onDone } = {}) {
  const meta = await sessionMeta();
  let helpers = helper ? [helper] : [];
  if (!helper) {
    try { helpers = (await api.get('/helpers')).helpers; } catch { helpers = []; }
  }
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);

  const modal = openModal({
    title: 'Book a Help Session',
    wide: true,
    body: html`
      <form id="book-form" class="stack" novalidate>
        <div id="book-error" class="form-error" role="alert" hidden></div>

        <fieldset class="field help-types">
          <legend class="label">1. What do you need help with?</legend>
          <div class="type-grid">
            ${meta.categories.map((c, i) => html`
              <label class="type-card"><input type="radio" name="category" value="${c.key}" ${i === 0 ? 'checked' : ''}><span><strong>${c.label}</strong><small>${c.hint}</small></span></label>`)}
          </div>
        </fieldset>

        <div class="field">
          <label for="b-helper">2. Choose a mentor</label>
          <select class="select" id="b-helper" name="helperId" required ${helper ? 'disabled' : ''}>
            ${helper ? '' : html`<option value="">Select a mentor</option>`}
            ${helpers.map((h) => html`<option value="${h._id}" ${helper && helper._id === h._id ? 'selected' : ''}>${h.name}${h.verified ? ' (verified)' : ''}${h.year ? `, Year ${h.year}` : ''}</option>`)}
          </select>
          <div class="hint" id="b-helper-info" aria-live="polite"></div>
        </div>

        <div class="form-grid three">
          <div class="field"><label for="b-date">3. Date</label><input class="input" id="b-date" name="date" type="date" min="${localDate(new Date())}" value="${localDate(tomorrow)}" required></div>
          <div class="field"><label for="b-time">Start time</label><input class="input" id="b-time" name="time" type="time" value="17:00" required></div>
          <div class="field"><label for="b-dur">Duration</label><select class="select" id="b-dur" name="durationMinutes">${meta.durations.map((d) => html`<option value="${d}" ${d === 20 ? 'selected' : ''}>${d} minutes</option>`)}</select></div>
        </div>

        <div class="field"><label for="b-topic">4. Topic of the session</label><input class="input" id="b-topic" name="topic" maxlength="140" required placeholder="e.g. Resume review for internship applications"></div>
        <div class="field"><label for="b-reason">Anything the mentor should know? (optional)</label><textarea class="textarea" id="b-reason" name="reason" maxlength="1000" placeholder="What have you tried? What do you want to walk away with?"></textarea></div>
        <p class="muted small">Your mentor can accept, decline or suggest another time. Once accepted, a private Help Room is created for just the two of you. It opens ${meta.joinEarlyMinutes} minutes before the start and closes when the session ends.</p>
      </form>`,
    footer: html`<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn btn-primary" id="book-send" type="submit" form="book-form">${icon('calendar', 16)} Send meeting request</button>`,
  });

  const form = modal.el.querySelector('#book-form');
  const err = modal.el.querySelector('#book-error');
  const info = modal.el.querySelector('#b-helper-info');
  const select = modal.el.querySelector('#b-helper');

  const showInfo = () => {
    const h = helpers.find((x) => x._id === select.value);
    info.textContent = h ? [h.availability ? `Usually available: ${h.availability}.` : 'This mentor has not listed their availability.', academicLine(h)].filter(Boolean).join(' ') : '';
  };
  select.addEventListener('change', showInfo);
  showInfo();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = modal.el.querySelector('#book-send');
    err.hidden = true;
    const v = formValues(form);
    const helperId = helper ? helper._id : v.helperId;
    const problems = [];
    if (!helperId) problems.push('Choose a mentor.');
    if (!v.date || !v.time) problems.push('Pick a date and start time.');
    if (!v.topic.trim()) problems.push('Add a topic for the session.');
    if (problems.length) { err.textContent = problems.join(' '); err.hidden = false; return; }
    btn.disabled = true;
    try {
      await api.post('/sessions/requests', {
        helperId, category: v.category, topic: v.topic, reason: v.reason,
        startAt: toInstant(v.date, v.time), durationMinutes: Number(v.durationMinutes),
      });
      modal.close();
      toast('Meeting request sent. You will be notified when your mentor replies.', { type: 'success', link: { href: '#/sessions', label: 'View sessions' } });
      if (onDone) onDone();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      btn.disabled = false;
    }
  });
  return modal;
}

/** Mentor proposes a different time for a pending request. */
export async function openSuggestModal(session, onDone) {
  const meta = await sessionMeta();
  const start = new Date(session.startAt);
  const modal = openModal({
    title: 'Suggest another time',
    body: html`
      <form id="sug-form" class="stack" novalidate>
        <div id="sug-error" class="form-error" role="alert" hidden></div>
        <p class="muted">${session.seeker.name} asked for <strong>${session.topic}</strong>. Offer a time that suits you better.</p>
        <div class="form-grid three">
          <div class="field"><label for="s-date">Date</label><input class="input" id="s-date" name="date" type="date" min="${localDate(new Date())}" value="${localDate(start)}" required></div>
          <div class="field"><label for="s-time">Start time</label><input class="input" id="s-time" name="time" type="time" value="${pad(start.getHours())}:${pad(start.getMinutes())}" required></div>
          <div class="field"><label for="s-dur">Duration</label><select class="select" id="s-dur" name="durationMinutes">${meta.durations.map((d) => html`<option value="${d}" ${d === session.durationMinutes ? 'selected' : ''}>${d} minutes</option>`)}</select></div>
        </div>
        <div class="field"><label for="s-note">Message (optional)</label><textarea class="textarea" id="s-note" name="note" maxlength="400" style="min-height:80px" placeholder="e.g. I have a lab until 5. Does later work?"></textarea></div>
      </form>`,
    footer: html`<button class="btn btn-ghost" data-close type="button">Cancel</button><button class="btn btn-primary" id="sug-send" type="submit" form="sug-form">Send suggestion</button>`,
  });
  const form = modal.el.querySelector('#sug-form');
  const err = modal.el.querySelector('#sug-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = modal.el.querySelector('#sug-send');
    const v = formValues(form);
    err.hidden = true;
    if (!v.date || !v.time) { err.textContent = 'Pick a date and start time.'; err.hidden = false; return; }
    btn.disabled = true;
    try {
      await api.post(`/sessions/requests/${session._id}/suggest`, { startAt: toInstant(v.date, v.time), durationMinutes: Number(v.durationMinutes), note: v.note });
      modal.close();
      toast('New time sent to the student.', { type: 'success' });
      if (onDone) onDone();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      btn.disabled = false;
    }
  });
}

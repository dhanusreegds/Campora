import { api } from '../api.js';
import { html, icon, avatar, chips, verifiedBadge, openModal, toast, formValues, academicLine } from '../ui.js';

export const SUBJECTS = [
  'Java Programming', 'Python', 'Data Structures', 'Algorithms', 'Operating Systems', 'Computer Networks', 'DBMS',
  'Web Development', 'Machine Learning', 'Data Science', 'Embedded Systems', 'Digital Electronics', 'Mathematics',
  'Placement Preparation', 'Project Guidance', 'Other',
];
export const ASSISTANCE_TYPES = ['Chat guidance', 'One-to-one session', 'Document or code review', 'Study material suggestions', 'Career advice'];

export function helperCard(h) {
  const relation = h.relation || 'none';
  return html`
    <article class="helper-card ${h.verified ? 'is-verified' : ''}" aria-label="${h.name}">
      <div class="top">
        ${avatar(h, 'lg')}
        <div style="min-width:0">
          <div class="name">${h.name}</div>
          <div class="user">@${h.username}</div>
          ${h.verified ? html`<div style="margin-top:4px">${verifiedBadge()}</div>` : ''}
        </div>
      </div>
      <div class="muted small">${academicLine(h)}</div>
      ${chips(h.skills || [], { max: 5 })}
      <div class="facts">
        <div><b>${h.points}</b><span class="muted">points</span></div>
        <div><b>${h.studentsHelped}</b><span class="muted">students helped</span></div>
      </div>
      <div class="actions">
        <button class="btn btn-ghost btn-sm" data-action="profile" data-id="${h._id}">View profile</button>
        ${relation === 'pending'
          ? html`<button class="btn btn-soft btn-sm" disabled>Request pending</button>`
          : html`<button class="btn btn-primary btn-sm" data-action="request" data-id="${h._id}">Send request</button>`}
        ${relation === 'connected' ? html`<button class="btn btn-soft btn-sm" data-action="chat" data-id="${h._id}">${icon('chat', 15)} Chat</button>` : ''}
        <button class="btn btn-ghost btn-sm" data-action="book" data-id="${h._id}">${icon('video', 15)} Book session</button>
      </div>
    </article>`;
}

/** Modal with the personalised help request form (Seeker -> one Helper). */
export function openRequestModal(helper, onSent) {
  const modal = openModal({
    title: `Ask ${helper.name} for help`,
    body: html`
      <form id="request-form" class="stack" novalidate>
        <div id="req-error" class="form-error" role="alert" hidden></div>
        <div class="field"><label for="r-title">Request title</label><input class="input" id="r-title" name="title" maxlength="140" required placeholder="e.g. Understanding OS scheduling algorithms"></div>
        <div class="field"><label for="r-desc">Describe the problem</label><textarea class="textarea" id="r-desc" name="description" maxlength="2000" required placeholder="What have you tried? Where exactly are you stuck?"></textarea></div>
        <div class="form-grid">
          <div class="field"><label for="r-cat">Subject or category</label><input class="input" id="r-cat" name="category" list="subjects" maxlength="80" placeholder="e.g. Operating Systems"><datalist id="subjects">${SUBJECTS.map((s) => html`<option value="${s}">`)}</datalist></div>
          <div class="field"><label for="r-type">Preferred assistance</label><select class="select" id="r-type" name="assistanceType">${ASSISTANCE_TYPES.map((t) => html`<option>${t}</option>`)}</select></div>
          <div class="field"><label for="r-diff">Difficulty</label><select class="select" id="r-diff" name="difficulty"><option value="basic">Basic</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></div>
          <div class="field"><label for="r-deadline">Deadline (optional)</label><input class="input" id="r-deadline" name="deadline" type="date"></div>
        </div>
      </form>`,
    footer: html`<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="send-request" type="submit" form="request-form">Send request</button>`,
  });

  const form = modal.el.querySelector('#request-form');
  const err = modal.el.querySelector('#req-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = modal.el.querySelector('#send-request');
    err.hidden = true;
    const v = formValues(form);
    if (!v.title.trim() || !v.description.trim()) {
      err.textContent = 'Add a title and describe the problem.';
      err.hidden = false;
      return;
    }
    btn.disabled = true;
    try {
      await api.post('/requests/direct', { ...v, helperId: helper._id, deadline: v.deadline || undefined });
      modal.close();
      toast(`Request sent to ${helper.name}. You will be notified when they reply.`, { type: 'success', link: { href: '#/requests', label: 'View my requests' } });
      if (onSent) onSent();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      btn.disabled = false;
    }
  });
}

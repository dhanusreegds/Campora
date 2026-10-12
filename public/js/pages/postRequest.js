import { api } from '../api.js';
import { html, icon, avatar, chips, verifiedBadge, scoreBar, setHTML, openModal, mountSkillInput, formValues, toast } from '../ui.js';
import { SUBJECTS } from './shared.js';

export default async function postRequestPage({ root }) {
  setHTML(root, html`
    <header class="page-head"><div><h1>Post a request</h1><p class="muted">Ask a question publicly. Campora compares the skills you need with Helper profiles and notifies the best fits.</p></div></header>
    <form class="card stack" id="post-form" novalidate style="max-width:820px">
      <div id="post-error" class="form-error" role="alert" hidden></div>
      <div class="field"><label for="p-title">Title</label><input class="input" id="p-title" name="title" maxlength="140" required placeholder="Can someone help me understand Java inheritance and polymorphism?"></div>
      <div class="field"><label for="p-desc">Detailed question</label><textarea class="textarea" id="p-desc" name="description" maxlength="2000" required placeholder="Explain what you are trying to do, what you tried, and where you are stuck."></textarea></div>
      <div class="form-grid">
        <div class="field"><label for="p-cat">Subject</label><input class="input" id="p-cat" name="category" list="subjects-post" maxlength="80" placeholder="e.g. Java Programming"><datalist id="subjects-post">${SUBJECTS.map((s) => html`<option value="${s}">`)}</datalist></div>
        <div class="field"><label for="p-diff">Difficulty level</label><select class="select" id="p-diff" name="difficulty"><option value="basic">Basic</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></div>
        <div class="field full"><span class="label" id="skills-lbl">Skills required</span><div id="skills-input" aria-labelledby="skills-lbl"></div><span class="hint">Press Enter after each skill, for example Java, OOP, Inheritance. Leave empty and Campora will look for known skills in your question.</span></div>
        <div class="field"><label for="p-deadline">Deadline (optional)</label><input class="input" id="p-deadline" name="deadline" type="date"></div>
      </div>
      <div class="row wrap"><button class="btn btn-primary btn-lg" type="submit" id="post-submit">Post and find Helpers</button><span class="muted small">Matching is rule-based: it compares skill names, not meaning.</span></div>
    </form>`);

  const skills = mountSkillInput(root.querySelector('#skills-input'), [], 'Add a skill');
  const form = root.querySelector('#post-form');
  const err = root.querySelector('#post-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const v = formValues(form);
    if (!v.title.trim() || !v.description.trim()) {
      err.textContent = 'Add a title and a detailed question.';
      err.hidden = false;
      return;
    }
    const btn = root.querySelector('#post-submit');
    btn.disabled = true;
    btn.textContent = 'Finding Helpers...';
    try {
      const result = await api.post('/requests/public', { ...v, deadline: v.deadline || undefined, requiredSkills: skills.get() });
      showResult(result);
      form.reset();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Post and find Helpers';
    }
  });
}

function showResult(result) {
  const { matches, skills, skillsSource } = result;
  const top = matches[0];
  const body = html`
    ${top ? html`<div class="notice" style="background:var(--primary);color:#fff;font-weight:600;margin-bottom:14px" role="status">${top.message}</div>` : html`<div class="notice" style="margin-bottom:14px" role="status"><strong>No Helper matches these skills yet.</strong> Your post is public, and Helpers can still find and accept it.</div>`}
    <p class="small muted" style="margin-bottom:10px">Skills ${skillsSource === 'detected' ? 'detected in your question' : 'you listed'}: ${skills.length ? skills.join(', ') : 'none found'}.</p>
    <div class="stack">
      ${matches.map((m) => html`
        <div class="match-card">
          <div class="row">
            ${avatar(m.helper)}
            <div class="spacer"><strong>${m.helper.name}</strong> ${m.helper.verified ? verifiedBadge() : ''}<div class="muted small">@${m.helper.username}</div></div>
            ${scoreBar(m.score)}
          </div>
          ${chips(m.matchedSkills, { max: 8, highlight: m.matchedSkills })}
          <p class="small">${m.explanation}</p>
          <div class="row wrap"><span class="badge ${m.notified ? 'status-accepted' : 'badge-type'}">${m.notified ? 'Notified' : 'Not notified'}</span><a class="btn btn-ghost btn-sm" href="#/helper/${m.helper._id}" data-close>View profile</a></div>
        </div>`)}
    </div>
    <p class="muted small" style="margin-top:14px">Matching engine: rule-based skill comparison. No external AI service is used.</p>`;

  openModal({
    title: top ? 'Your post has matches' : 'Your post is live',
    body,
    wide: true,
    footer: html`<button class="btn btn-ghost" data-close>Post another</button><a class="btn btn-primary" href="#/requests" data-close>Go to my requests</a>`,
  });
  toast('Your request was posted.', { type: 'success' });
}

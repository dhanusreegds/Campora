import { api } from '../api.js';
import { html, avatar, verifiedBadge, setHTML, mountSkillInput, formValues, toast, cap } from '../ui.js';

export default async function profilePage({ root, refreshUser }) {
  const user = await refreshUser();
  const isHelper = user.role === 'helper';

  setHTML(root, html`
    <header class="page-head"><div><h1>My profile</h1><p class="muted">${isHelper ? 'Keep your skills current so Seekers and the matching engine can find you.' : 'Add the topics you want to learn to get better Helper recommendations.'}</p></div></header>
    <div class="cols">
      <form class="card stack" id="profile-form" novalidate>
        <div id="pf-error" class="form-error" role="alert" hidden></div>
        <div class="form-grid">
          <div class="field full"><label for="pf-name">Full name</label><input class="input" id="pf-name" name="name" value="${user.name}" maxlength="80" required></div>
          <div class="field"><label for="pf-dept">Department</label><input class="input" id="pf-dept" name="department" value="${user.department}" maxlength="80"></div>
          <div class="field"><label for="pf-course">Course</label><input class="input" id="pf-course" name="course" value="${user.course}" maxlength="80"></div>
          <div class="field"><label for="pf-year">Year of study</label><select class="select" id="pf-year" name="year"><option value="">Not set</option>${[1, 2, 3, 4, 5, 6].map((y) => html`<option value="${y}" ${user.year === y ? 'selected' : ''}>Year ${y}</option>`)}</select></div>
          ${isHelper ? html`<div class="field"><label for="pf-avail">Availability</label><input class="input" id="pf-avail" name="availability" value="${user.availability}" maxlength="120" placeholder="e.g. Weekdays, 6-8 PM"></div>` : ''}
          <div class="field full"><span class="label" id="pf-skills-l">${isHelper ? 'Skills and expertise areas' : 'Topics I want to learn'}</span><div id="pf-skills" aria-labelledby="pf-skills-l"></div><span class="hint">Press Enter after each one.</span></div>
          <div class="field full"><label for="pf-bio">Short bio</label><textarea class="textarea" id="pf-bio" name="bio" maxlength="600">${user.bio}</textarea></div>
          ${isHelper ? html`<div class="field full"><label for="pf-exp">Expertise description</label><textarea class="textarea" id="pf-exp" name="expertise" maxlength="600" placeholder="What can you help with?">${user.expertise}</textarea></div>` : ''}
          <div class="field full"><label for="pf-img">Profile picture link (optional)</label><input class="input" id="pf-img" name="profileImage" type="url" value="${user.profileImage}" placeholder="https://... (leave empty to use your initials)"></div>
        </div>
        <div><button class="btn btn-primary" type="submit" id="pf-save">Save changes</button></div>
      </form>

      <aside class="panel stack">
        <div class="row">${avatar(user, 'lg')}<div><strong style="font-size:1.1rem">${user.name}</strong><div class="muted">@${user.username}</div></div></div>
        <dl class="detail-list">
          <dt>Role</dt><dd>${cap(user.role)}</dd>
          <dt>Points</dt><dd>${user.points}</dd>
          ${isHelper ? html`<dt>Students helped</dt><dd>${user.studentsHelped}</dd><dt>Verification</dt><dd>${user.verified ? verifiedBadge() : 'Not verified'}</dd>` : ''}
        </dl>
        ${isHelper ? html`<p class="muted small">The verified badge is assigned manually for this prototype. It does not confirm real academic credentials and you cannot change it yourself.</p>` : ''}
      </aside>
    </div>`);

  const skills = mountSkillInput(root.querySelector('#pf-skills'), user.skills, 'Add a skill');
  const form = root.querySelector('#profile-form');
  const err = root.querySelector('#pf-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const btn = root.querySelector('#pf-save');
    btn.disabled = true;
    try {
      await api.put('/users/me', { ...formValues(form), skills: skills.get() });
      await refreshUser();
      toast('Profile saved.', { type: 'success' });
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });
}

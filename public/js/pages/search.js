import { api, qs } from '../api.js';
import { html, icon, setHTML, onClick, debounce, spinner, emptyState, toHTML } from '../ui.js';
import { helperCard, openRequestModal } from './shared.js';
import { openBookingModal } from './sessionBooking.js';

export default async function searchPage({ root }) {
  setHTML(root, html`
    <header class="page-head"><div><h1>Search Helpers</h1><p class="muted">Find seniors by name, skill, department, course or year of study.</p></div></header>
    <form class="filters" id="filters" role="search" aria-label="Search Helpers">
      <div class="field wide"><label for="f-q">Search</label><div class="search-wrap">${icon('search', 18)}<input class="input" id="f-q" name="q" type="search" placeholder="Name, skill, area of expertise..." autocomplete="off"></div></div>
      <div class="field"><label for="f-dept">Department</label><input class="input" id="f-dept" name="department" placeholder="e.g. Computer"></div>
      <div class="field"><label for="f-course">Course</label><input class="input" id="f-course" name="course" placeholder="e.g. B.Tech"></div>
      <div class="field"><label for="f-year">Year</label><select class="select" id="f-year" name="year"><option value="">Any</option>${[1, 2, 3, 4, 5].map((y) => html`<option value="${y}">Year ${y}</option>`)}</select></div>
      <div class="filters-foot">
        <div class="field" style="min-width:200px;flex:1"><label for="f-skill">Skill</label><input class="input" id="f-skill" name="skill" placeholder="e.g. Python"></div>
        <label class="checkbox" style="margin-top:22px"><input type="checkbox" name="verified"> Verified only</label>
        <button class="btn btn-ghost btn-sm" type="reset" style="margin-top:22px">Clear filters</button>
      </div>
    </form>
    <p class="muted small" id="result-count" aria-live="polite" style="margin-bottom:12px"></p>
    <div id="results"></div>`);

  const form = root.querySelector('#filters');
  const results = root.querySelector('#results');
  const count = root.querySelector('#result-count');
  let helpers = [];
  let seq = 0;

  async function load() {
    const mine = ++seq;
    const v = Object.fromEntries(new FormData(form).entries());
    results.innerHTML = toHTML(spinner());
    try {
      const data = await api.get(`/helpers${qs({ ...v, verified: v.verified === 'on' })}`);
      if (mine !== seq) return;
      helpers = data.helpers;
      count.textContent = `${helpers.length} Helper${helpers.length === 1 ? '' : 's'} found`;
      setHTML(results, helpers.length
        ? html`<div class="grid-cards">${helpers.map(helperCard)}</div>`
        : emptyState('No Helpers match those filters', 'Try a broader search or clear the filters.'));
    } catch (err) {
      if (mine === seq) setHTML(results, html`<div class="form-error">${err.message}</div>`);
    }
  }

  const debounced = debounce(load, 300);
  form.addEventListener('input', debounced);
  form.addEventListener('change', debounced);
  form.addEventListener('reset', () => setTimeout(load, 0));
  form.addEventListener('submit', (e) => { e.preventDefault(); load(); });

  onClick(results, '[data-action]', (el) => {
    const helper = helpers.find((h) => h._id === el.dataset.id);
    if (el.dataset.action === 'profile') location.hash = `#/helper/${el.dataset.id}`;
    if (el.dataset.action === 'chat') location.hash = `#/chat/${el.dataset.id}`;
    if (el.dataset.action === 'request' && helper) openRequestModal(helper, load);
    if (el.dataset.action === 'book' && helper) openBookingModal({ helper, onDone: () => { location.hash = '#/sessions'; } });
  });

  await load();
}

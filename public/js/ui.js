// Shared UI helpers: safe HTML templating, icons, modal, toast, avatars, formatting.

// ---------- Safe HTML templating ----------
// html`...` escapes every interpolated value unless it was produced by html`` or raw().
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const raw = (s) => ({ __raw: String(s ?? '') });

function render(v) {
  if (v === null || v === undefined || v === false) return '';
  if (Array.isArray(v)) return v.map(render).join('');
  if (typeof v === 'object' && '__raw' in v) return v.__raw;
  return esc(v);
}

export function html(strings, ...values) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += render(values[i]);
  });
  return raw(out);
}

export const toHTML = (v) => render(v);
export function setHTML(el, v) { el.innerHTML = render(v); }

// ---------- Icons (24x24, stroke based) ----------
const ICONS = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  award: '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
  megaphone: '<path d="M3 11l18-8v18L3 13z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  gift: '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  link: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  back: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  canteen: '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>',
  library: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  print: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  video: '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>',
  videoOff: '<path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/>',
  mic: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
  micOff: '<line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  pen: '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
  eraser: '<path d="M20 20H8.5L3.3 14.8a2 2 0 0 1 0-2.8L12.6 2.7a2 2 0 0 1 2.8 0l5.9 5.9a2 2 0 0 1 0 2.8L12 20.7"/><line x1="8" y1="14" x2="14" y2="20"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-1.97 1.5C7.03 18.98 6 20.24 6 22"/><path d="M14 14.66V17c0 .55.47.98 1.97 1.5 1 .48 2.03 1.74 2.03 3.5"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  leave: '<path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="23" y1="1" x2="1" y2="23"/>',
  undo: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  alert: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  ticket: '<path d="M2 9a3 3 0 0 1 0 6v3a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-3a3 3 0 0 1 0-6V6a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1z"/><line x1="13" y1="5" x2="13" y2="7"/><line x1="13" y1="11" x2="13" y2="13"/><line x1="13" y1="17" x2="13" y2="19"/>',
};

export function icon(name, size = 18) {
  return raw(
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ICONS.gift}</svg>`
  );
}

export const verifiedBadge = () =>
  raw(
    `<span class="verified" title="Verified (assigned manually in this prototype)"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#4A6B8A"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Verified</span>`
  );

export const bridgeArt = () =>
  raw(
    `<svg class="bridge" viewBox="0 0 160 70" aria-hidden="true" focusable="false"><path d="M4 52 Q80 -12 156 52" fill="none" stroke="#4A6B8A" stroke-width="4" stroke-linecap="round"/><path d="M30 34V52M55 21V52M80 17V52M105 21V52M130 34V52" stroke="#A7B8C9" stroke-width="3" stroke-linecap="round"/><path d="M0 52H160" stroke="#4A6B8A" stroke-width="5"/><path d="M0 63q8-5 16 0t16 0 16 0 16 0 16 0 16 0 16 0 16 0 16 0 16 0" fill="none" stroke="#A7B8C9" stroke-width="2" stroke-linecap="round"/></svg>`
  );

// ---------- Formatting ----------
export const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';

const dateOpts = { day: 'numeric', month: 'short', year: 'numeric' };
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, dateOpts) : '');
export const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
export const fmtTime = (d) => new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export function timeAgo(d) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  return fmtDate(d);
}

export const cap = (s = '') => s.charAt(0).toUpperCase() + s.slice(1);
export const yearLabel = (y) => (y ? `Year ${y}` : '');
export const academicLine = (u) => [u.course, u.department, yearLabel(u.year)].filter(Boolean).join(', ');

// ---------- Components ----------
export function avatar(user, size = '') {
  const idx = [...(user.username || user.name || 'x')].reduce((n, c) => n + c.charCodeAt(0), 0) % 4;
  const img = user.profileImage ? html`<img src="${user.profileImage}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
  return html`<span class="avatar ${size} av-${idx}" aria-hidden="true">${img}${initials(user.name)}</span>`;
}

export const statusBadge = (status) => html`<span class="badge status-${status}">${cap(status)}</span>`;

export const chips = (list = [], { max = 6, highlight = [] } = {}) => {
  const hi = new Set(highlight.map((s) => s.toLowerCase()));
  const shown = list.slice(0, max);
  const extra = list.length - shown.length;
  return html`<div class="chip-list">${shown.map((s) => html`<span class="chip ${hi.has(s.toLowerCase()) ? 'match' : ''}">${s}</span>`)}${extra > 0 ? html`<span class="chip">+${extra}</span>` : ''}</div>`;
};

export const scoreBar = (score) => html`<span class="score" title="Matching score"><span class="bar"><i style="width:${Math.max(0, Math.min(100, score))}%"></i></span>${score}%</span>`;

export function emptyState(title, text, action) {
  return html`<div class="empty">${bridgeArt()}<h3>${title}</h3><p>${text}</p>${action ? html`<a class="btn btn-primary" href="${action.href}">${action.label}</a>` : ''}</div>`;
}

export const spinner = () => raw('<div class="spinner" role="status" aria-label="Loading"></div>');

// ---------- Events ----------
/** Delegated click handler: on(root, '[data-action]', (el, event) => ...) */

// ---------- Help Session / challenge helpers ----------
export const fmtSlot = (start, minutes) => {
  const s = new Date(start);
  const e = new Date(s.getTime() + minutes * 60000);
  const day = s.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const t = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${t(s)} to ${t(e)}`;
};

/** "1h 05m", "12:30" or "2d 3h" for a number of milliseconds. */
export function countdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export const fileSize = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

export const progressBar = (value, max, label) =>
  html`<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${value}" aria-label="${label || 'Progress'}"><i style="width:${max ? Math.min(100, Math.round((value / max) * 100)) : 0}%"></i></div>`;

export function onClick(root, selector, handler) {
  root.addEventListener('click', (e) => {
    const el = e.target.closest(selector);
    if (el && root.contains(el)) handler(el, e);
  });
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ---------- Toast ----------
export function toast(message, { type = 'info', duration = 4500, link } = {}) {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = toHTML(html`<span>${message}${link ? html` <a href="${link.href}">${link.label}</a>` : ''}</span>`);
  box.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ---------- Modal ----------
export function openModal({ title, body, footer, wide = false, onClose }) {
  const dlg = document.createElement('dialog');
  dlg.className = `modal ${wide ? 'wide' : ''}`;
  dlg.setAttribute('aria-labelledby', 'modal-title');
  dlg.innerHTML = toHTML(html`
    <div class="modal-head"><h2 id="modal-title">${title}</h2><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="modal-body">${body}</div>
    ${footer ? html`<div class="modal-foot">${footer}</div>` : ''}`);
  document.body.appendChild(dlg);
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
  });
  dlg.addEventListener('close', () => {
    dlg.remove();
    if (onClose) onClose();
  });
  dlg.showModal();
  return { el: dlg, close: () => dlg.close(), body: dlg.querySelector('.modal-body') };
}

export function confirmDialog({ title, message, confirmText = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal({
      title,
      body: html`<div>${message}</div>`,
      footer: html`<button class="btn btn-ghost" data-close>Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirm-yes">${confirmText}</button>`,
      onClose: () => { if (!answered) resolve(false); },
    });
    m.el.querySelector('#confirm-yes').addEventListener('click', () => {
      answered = true;
      resolve(true);
      m.close();
    });
  });
}

// ---------- Skill chip input ----------
export function mountSkillInput(container, initial = [], placeholder = 'Type a skill and press Enter') {
  const skills = [...initial];
  container.classList.add('skill-input');
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder;
  input.setAttribute('aria-label', 'Add a skill');
  container.appendChild(input);

  const paint = () => {
    container.querySelectorAll('.chip').forEach((c) => c.remove());
    skills.forEach((s, i) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = toHTML(html`${s}<button type="button" data-remove="${i}" aria-label="Remove ${s}">&times;</button>`);
      container.insertBefore(chip, input);
    });
  };
  const add = (value) => {
    const v = value.trim().replace(/\s+/g, ' ');
    if (v && !skills.some((s) => s.toLowerCase() === v.toLowerCase()) && skills.length < 15) skills.push(v);
    input.value = '';
    paint();
  };
  container.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove]');
    if (rm) { skills.splice(Number(rm.dataset.remove), 1); paint(); }
    else input.focus();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input.value); }
    else if (e.key === 'Backspace' && !input.value && skills.length) { skills.pop(); paint(); }
  });
  input.addEventListener('blur', () => add(input.value));
  paint();
  return { get: () => { if (input.value.trim()) add(input.value); return [...skills]; } };
}

export const formValues = (form) => Object.fromEntries(new FormData(form).entries());

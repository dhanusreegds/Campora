import { api } from './api.js';
import { getToken, clearSession } from './session.js';
import { html, setHTML, icon, avatar, spinner, toast, toHTML, esc, cap, timeAgo, fmtSlot } from './ui.js';

import dashboard from './pages/dashboard.js';
import search from './pages/search.js';
import helperProfile from './pages/helperProfile.js';
import postRequest from './pages/postRequest.js';
import myRequests from './pages/myRequests.js';
import connections from './pages/connections.js';
import chat from './pages/chat.js';
import helperRequests from './pages/helperRequests.js';
import leaderboard from './pages/leaderboard.js';
import announcements from './pages/announcements.js';
import benefits from './pages/benefits.js';
import profile from './pages/profile.js';
import sessions from './pages/sessions.js';
import room from './pages/room.js';
import challenges from './pages/challenges.js';

const NAV = {
  seeker: [
    ['dashboard', 'Dashboard', 'home'],
    ['search', 'Search Helpers', 'search'],
    ['post', 'Post a Request', 'edit'],
    ['requests', 'My Requests', 'file'],
    ['connections', 'My Connections', 'users'],
    ['sessions', 'Help Sessions', 'video'],
    ['chat', 'Chat', 'chat'],
    ['challenges', 'Campus Challenges', 'trophy'],
    ['leaderboard', 'Leaderboard', 'award'],
    ['announcements', 'Announcements', 'megaphone'],
    ['benefits', 'Campus Benefits', 'gift'],
    ['profile', 'My Profile', 'user'],
  ],
  helper: [
    ['dashboard', 'Dashboard', 'home'],
    ['requests', 'Help Requests', 'file'],
    ['sessions', 'Help Sessions', 'video'],
    ['chat', 'Chat', 'chat'],
    ['challenges', 'Campus Challenges', 'trophy'],
    ['announcements', 'Announcements', 'megaphone'],
    ['leaderboard', 'Leaderboard', 'award'],
    ['benefits', 'Campus Benefits', 'gift'],
    ['profile', 'My Profile', 'user'],
  ],
};

const PAGES = {
  seeker: { dashboard, search, helper: helperProfile, post: postRequest, requests: myRequests, connections, chat, leaderboard, announcements, benefits, profile, sessions, room, challenges },
  helper: { dashboard, requests: helperRequests, chat, sessions, room, challenges, announcements, leaderboard, benefits, profile, helper: helperProfile },
};

const $ = (id) => document.getElementById(id);
const state = { user: null, cleanup: null, routeId: 0, lastUnread: null };

// ---------- Session ----------
async function boot() {
  if (!getToken()) return (window.location.href = '/login.html');
  try {
    const { user } = await api.get('/auth/me');
    state.user = user;
  } catch {
    clearSession();
    return (window.location.href = '/login.html');
  }

  $('app').hidden = false;
  $('menu-btn').innerHTML = toHTML(icon('menu', 22));
  renderShell();
  renderBell();
  window.addEventListener('hashchange', route);
  $('logout').addEventListener('click', () => {
    clearSession();
    window.location.href = '/';
  });
  $('menu-btn').addEventListener('click', () => toggleMenu());
  route();
  pollNotifications(true);
  setInterval(() => pollNotifications(false), 15000);
}

async function refreshUser() {
  const { user } = await api.get('/auth/me');
  state.user = user;
  renderShell();
  return user;
}

function renderShell() {
  const u = state.user;
  setHTML($('who'), html`${avatar(u)}<div><strong>${u.name}</strong><span>${cap(u.role)}, @${u.username}</span></div>`);
  setHTML($('points-pill'), html`${icon('star', 16)} ${u.points} points`);
  const current = currentPage();
  setHTML(
    $('nav'),
    NAV[u.role].map(([key, label, ic]) => html`<a href="#/${key}" ${key === current ? 'aria-current="page"' : ''}>${icon(ic, 19)}<span>${label}</span></a>`)
  );
}

function currentPage() {
  const [page] = location.hash.replace(/^#\/?/, '').split('/');
  const name = page || 'dashboard';
  if (name === 'room') return 'sessions'; // the Help Room belongs to Help Sessions in the menu
  return name === 'helper' ? 'search' : name;
}

// ---------- Router ----------
async function route() {
  const id = ++state.routeId;
  if (state.cleanup) { state.cleanup(); state.cleanup = null; }
  closeMenu();

  const [page, param] = location.hash.replace(/^#\/?/, '').split('/');
  const name = page || 'dashboard';
  const fn = PAGES[state.user.role][name];
  if (!fn) { location.hash = '#/dashboard'; return; }

  renderShell();
  // Every navigation gets a fresh root, so a slow, stale page can never overwrite the current one.
  const root = document.createElement('div');
  root.className = 'page';
  root.innerHTML = toHTML(spinner());
  $('view').replaceChildren(root);
  window.scrollTo(0, 0);

  try {
    const result = await fn({ root, param: param ? decodeURIComponent(param) : undefined, user: state.user, refreshUser });
    if (id !== state.routeId) { if (typeof result === 'function') result(); return; }
    if (typeof result === 'function') state.cleanup = result;
    const label = NAV[state.user.role].find(([k]) => k === (name === 'helper' ? 'search' : name === 'room' ? 'sessions' : name));
    document.title = `${name === 'room' ? 'Help Room' : label ? label[1] : 'Campora'} - Campora`;
    if (!root.contains(document.activeElement)) $('view').focus({ preventScroll: true });
  } catch (err) {
    if (id !== state.routeId) return;
    root.innerHTML = toHTML(html`<div class="empty"><h3>Something went wrong</h3><p>${err.message}</p><a class="btn btn-primary" href="#/dashboard">Back to dashboard</a></div>`);
  }
}

// ---------- Mobile menu ----------
function toggleMenu() {
  const open = !$('sidebar').classList.contains('open');
  open ? openMenu() : closeMenu();
}
function openMenu() {
  $('sidebar').classList.add('open');
  $('menu-btn').setAttribute('aria-expanded', 'true');
  if (!document.querySelector('.nav-scrim')) {
    const scrim = document.createElement('div');
    scrim.className = 'nav-scrim';
    scrim.addEventListener('click', closeMenu);
    document.body.appendChild(scrim);
  }
}
function closeMenu() {
  $('sidebar').classList.remove('open');
  $('menu-btn').setAttribute('aria-expanded', 'false');
  document.querySelector('.nav-scrim')?.remove();
}

// ---------- Notifications ----------
function renderBell() {
  const bell = $('bell');
  bell.innerHTML = toHTML(html`
    <button class="icon-btn" id="bell-btn" type="button" aria-label="Notifications" aria-expanded="false">${icon('bell', 22)}<span class="dot" id="bell-dot" hidden>0</span></button>
    <div class="dropdown" id="bell-panel" hidden></div>`);
  $('bell-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    const panel = $('bell-panel');
    if (!panel.hidden) return closePanel();
    await loadPanel();
    panel.hidden = false;
    $('bell-btn').setAttribute('aria-expanded', 'true');
  });
  document.addEventListener('click', (e) => { if (!bell.contains(e.target)) closePanel(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });
}

function closePanel() {
  const panel = $('bell-panel');
  if (panel) panel.hidden = true;
  $('bell-btn')?.setAttribute('aria-expanded', 'false');
}

function setUnread(n) {
  const dot = $('bell-dot');
  if (!dot) return;
  dot.textContent = n > 9 ? '9+' : n;
  dot.hidden = n === 0;
}

async function pollNotifications(first) {
  try {
    const { notifications, unread } = await api.get('/notifications');
    if (!first && state.lastUnread !== null && unread > state.lastUnread) {
      const newest = notifications.find((n) => !n.read);
      if (newest) toast(`${newest.title}: ${newest.message}`, { type: 'info', duration: 6000 });
    }
    state.lastUnread = unread;
    setUnread(unread);
  } catch { /* ignore polling errors */ }
}

async function loadPanel() {
  const panel = $('bell-panel');
  const { notifications, unread } = await api.get('/notifications');
  state.lastUnread = unread;
  setUnread(unread);
  panel.innerHTML = toHTML(html`
    <div class="dropdown-head"><strong>Notifications</strong>${unread ? html`<button class="btn btn-ghost btn-sm" id="read-all" type="button">Mark all read</button>` : ''}</div>
    <div class="dropdown-list">${notifications.length
      ? notifications.map((n) => html`<button class="notif ${n.read ? '' : 'unread'}" type="button" data-id="${n._id}" data-link="${n.link}"><strong>${n.title}</strong><span>${n.message}</span>${n.meta && n.meta.startAt && n.meta.durationMinutes ? html`<span class="notif-when">${icon('calendar', 13)} ${fmtSlot(n.meta.startAt, n.meta.durationMinutes)}</span>` : ''}${n.actionLabel ? html`<span class="notif-cta">${n.actionLabel}</span>` : ''}<time>${timeAgo(n.createdAt)}</time></button>`)
      : html`<p class="muted" style="padding:20px">Nothing yet. Updates about your requests will show up here.</p>`}</div>`);

  panel.querySelector('#read-all')?.addEventListener('click', async () => {
    await api.post('/notifications/read-all');
    await loadPanel();
  });
  panel.querySelectorAll('.notif').forEach((el) =>
    el.addEventListener('click', async () => {
      try { await api.post(`/notifications/${el.dataset.id}/read`); } catch { /* ignore */ }
      closePanel();
      setUnread(Math.max(0, (state.lastUnread || 1) - 1));
      const link = el.dataset.link;
      if (link && link.startsWith('#/')) {
        if (location.hash === link) route(); else location.hash = link;
      }
    })
  );
}

boot();

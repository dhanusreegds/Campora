import { api } from './api.js';
import { setToken } from './session.js';

const params = new URLSearchParams(location.search);
const role = params.get('role') === 'helper' ? 'helper' : 'seeker';
const isLogin = !!document.getElementById('login-form');
const $ = (id) => document.getElementById(id);

const COPY = {
  seeker: {
    title: 'Get unstuck with a senior who knows the topic.',
    text: 'Search Helpers, post a question and chat once someone accepts.',
    demo: { username: 'seeker_demo', password: 'seeker123' },
  },
  helper: {
    title: 'Share what you know and earn campus rewards.',
    text: 'Answer requests, publish announcements and climb the leaderboard.',
    demo: { username: 'helper_demo', password: 'helper123' },
  },
};
const label = role === 'helper' ? 'Helper' : 'Seeker';

$('tab-seeker').setAttribute('aria-current', role === 'seeker' ? 'page' : 'false');
$('tab-helper').setAttribute('aria-current', role === 'helper' ? 'page' : 'false');
$('side-title').textContent = COPY[role].title;
$('side-text').textContent = COPY[role].text;

function showError(message) {
  const box = $('form-error');
  box.textContent = message;
  box.hidden = !message;
}

async function submit(form, path, payload) {
  const button = $('submit');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Please wait...';
  showError('');
  try {
    const { token } = await api.post(path, payload);
    setToken(token);
    window.location.href = '/app.html#/dashboard';
  } catch (err) {
    showError(err.message);
    button.disabled = false;
    button.textContent = original;
  }
}

if (isLogin) {
  document.title = `${label} login - Campora`;
  $('form-title').textContent = `${label} login`;
  $('form-sub').textContent = role === 'helper' ? 'Welcome back. Your requests are waiting.' : 'Welcome back. Pick up where you left off.';
  $('demo-user').textContent = COPY[role].demo.username;
  $('demo-pass').textContent = COPY[role].demo.password;
  $('register-link').href = `/register.html?role=${role}`;

  $('fill-demo').addEventListener('click', () => {
    $('username').value = COPY[role].demo.username;
    $('password').value = COPY[role].demo.password;
    $('password').focus();
  });

  $('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const username = $('username').value.trim();
    const password = $('password').value;
    if (!username || !password) return showError('Enter your username and password.');
    submit(e.target, '/auth/login', { username, password, role });
  });
} else {
  document.title = `${label} registration - Campora`;
  $('form-title').textContent = `Create a ${label} account`;
  $('form-sub').textContent =
    role === 'helper'
      ? 'Tell Seekers what you can help with. New Helpers start without a verified badge.'
      : 'Tell us what you are learning so we can recommend Helpers.';
  $('skills-label').textContent = role === 'helper' ? 'Skills you can help with' : 'Topics you want to learn';
  $('login-link').href = `/login.html?role=${role}`;

  $('register-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const payload = Object.fromEntries(f.entries());
    payload.role = role;
    if (!payload.name.trim() || !payload.username.trim() || !payload.password) {
      return showError('Name, username and password are required.');
    }
    submit(e.target, '/auth/register', payload);
  });
}

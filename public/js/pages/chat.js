import { api } from '../api.js';
import { html, icon, avatar, verifiedBadge, setHTML, toHTML, onClick, emptyState, fmtTime, timeAgo, toast } from '../ui.js';

export default async function chatPage({ root, param, user }) {
  const { conversations: initial } = await api.get('/chat/conversations');
  let conversations = initial;
  let activeId = param && conversations.some((c) => c.user._id === param) ? param : conversations[0]?.user._id;
  let messages = [];
  let lastKey = '';
  let timer = null;
  let stopped = false;

  if (!conversations.length) {
    setHTML(root, html`
      <header class="page-head"><div><h1>Chat</h1></div></header>
      ${emptyState('No conversations yet', user.role === 'seeker' ? 'Chat unlocks when a Helper accepts one of your requests.' : 'Chat unlocks after you accept a help request.', { href: user.role === 'seeker' ? '#/search' : '#/requests', label: user.role === 'seeker' ? 'Search Helpers' : 'View requests' })}`);
    return;
  }
  if (param && !conversations.some((c) => c.user._id === param)) {
    toast('Chat with that person is not available yet. It opens once a request is accepted.', { type: 'error' });
  }

  setHTML(root, html`
    <header class="page-head"><div><h1>Chat</h1><p class="muted">One-to-one conversations with your connections.</p></div></header>
    <div class="chat ${param ? 'show-thread' : ''}" id="chat">
      <div class="chat-list" id="chat-list" role="list"></div>
      <section class="thread" id="thread" aria-label="Conversation"></section>
    </div>`);
  const chatEl = root.querySelector('#chat');
  const listEl = root.querySelector('#chat-list');
  const threadEl = root.querySelector('#thread');

  const active = () => conversations.find((c) => c.user._id === activeId);

  function paintList() {
    setHTML(listEl, conversations.map((c) => html`
      <button class="chat-item" role="listitem" data-id="${c.user._id}" aria-current="${String(c.user._id === activeId)}">
        ${avatar(c.user)}
        <span class="info"><strong>${c.user.name}</strong><span>${c.lastMessage ? c.lastMessage.content : 'No messages yet. Say hello!'}</span></span>
        ${c.unread && c.user._id !== activeId ? html`<span class="unread">${c.unread}</span>` : ''}
      </button>`));
  }

  function paintThreadShell() {
    const c = active();
    setHTML(threadEl, html`
      <div class="thread-head"><button class="icon-btn back" id="back" aria-label="Back to conversations">${icon('back', 20)}</button>${avatar(c.user)}<div><strong>${c.user.name}</strong> ${c.user.verified ? verifiedBadge() : ''}<div class="muted small">@${c.user.username}</div></div></div>
      <div class="messages" id="messages" aria-live="polite"></div>
      <form class="composer" id="composer"><label class="sr-only" for="msg">Message</label><textarea class="textarea" id="msg" rows="1" maxlength="1000" placeholder="Write a message. Enter sends, Shift+Enter adds a line."></textarea><button class="btn btn-primary" type="submit">${icon('send', 16)} Send</button></form>`);
    paintMessages(true);
  }

  function paintMessages(forceBottom) {
    const box = threadEl.querySelector('#messages');
    if (!box) return;
    const atBottom = forceBottom || box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    let lastDay = '';
    const parts = [];
    if (!messages.length) parts.push(html`<p class="muted" style="margin:auto;text-align:center">No messages yet. Start the conversation.</p>`);
    messages.forEach((m) => {
      const day = new Date(m.timestamp).toDateString();
      if (day !== lastDay) {
        lastDay = day;
        parts.push(html`<div class="day-sep">${new Date(m.timestamp).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</div>`);
      }
      const mine = m.sender === user._id;
      parts.push(html`<div class="bubble ${mine ? 'mine' : ''}"><span class="sr-only">${mine ? 'You' : active().user.name}:</span>${m.content}<time datetime="${m.timestamp}">${fmtTime(m.timestamp)}</time></div>`);
    });
    box.innerHTML = toHTML(parts);
    if (atBottom) box.scrollTop = box.scrollHeight;
  }

  async function loadThread({ forceBottom = false, quiet = false } = {}) {
    try {
      const data = await api.get(`/chat/${activeId}`);
      if (stopped) return;
      const key = data.messages.length + ':' + (data.messages.at(-1)?._id || '');
      if (key !== lastKey || forceBottom) {
        lastKey = key;
        messages = data.messages;
        paintMessages(forceBottom);
      }
      const c = active();
      if (c && c.unread) { c.unread = 0; paintList(); }
    } catch (err) {
      if (!quiet) toast(err.message, { type: 'error' });
    }
  }

  async function selectConversation(id) {
    activeId = id;
    lastKey = '';
    messages = [];
    paintList();
    paintThreadShell();
    chatEl.classList.add('show-thread');
    history.replaceState(null, '', `#/chat/${id}`);
    await loadThread({ forceBottom: true });
  }

  onClick(listEl, '.chat-item', (el) => selectConversation(el.dataset.id));
  onClick(threadEl, '#back', () => { chatEl.classList.remove('show-thread'); history.replaceState(null, '', '#/chat'); });

  threadEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = threadEl.querySelector('#msg');
    const content = input.value.trim();
    if (!content) return;
    input.value = '';
    try {
      await api.post(`/chat/${activeId}`, { content });
      await loadThread({ forceBottom: true });
      const c = active();
      if (c) { c.lastMessage = { content }; paintList(); }
    } catch (err) {
      input.value = content;
      toast(err.message, { type: 'error' });
    }
  });
  threadEl.addEventListener('keydown', (e) => {
    if (e.target.id === 'msg' && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      threadEl.querySelector('#composer').requestSubmit();
    }
  });

  paintList();
  paintThreadShell();
  await loadThread({ forceBottom: true });

  // Simple REST polling keeps the conversation fresh without WebSockets.
  timer = setInterval(async () => {
    if (document.hidden) return;
    await loadThread({ quiet: true });
    try {
      const { conversations: fresh } = await api.get('/chat/conversations');
      if (stopped) return;
      conversations = fresh.map((c) => (c.user._id === activeId ? { ...c, unread: 0 } : c));
      paintList();
    } catch { /* ignore */ }
  }, 4000);

  return () => { stopped = true; clearInterval(timer); };
}

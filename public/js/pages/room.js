import { api, uploadFile, downloadFile } from '../api.js';
import { getToken } from '../session.js';
import { html, icon, avatar, setHTML, toHTML, onClick, emptyState, toast, confirmDialog, fmtSlot, fmtTime, countdown, fileSize, spinner, debounce, timeAgo } from '../ui.js';
import { MediaSession } from '../room/media.js';
import { Whiteboard } from '../room/whiteboard.js';

const LANGS = [['javascript', 'JavaScript'], ['python', 'Python'], ['java', 'Java'], ['cpp', 'C++'], ['c', 'C'], ['sql', 'SQL'], ['html', 'HTML'], ['plain', 'Plain text']];
const COLORS = ['#27394A', '#B3412F', '#2E7D5B', '#2F6DB5', '#C98A12'];
const OUTCOME = { completed: 'Session completed', no_show: 'Ended without both people joining' };

export default async function roomPage({ root, param: code, user }) {
  if (!code) { location.hash = '#/sessions'; return undefined; }
  setHTML(root, spinner());

  let alive = true;
  let teardown = () => {};
  const cleanup = () => { alive = false; teardown(); };

  async function boot() {
    teardown();
    teardown = () => {};
    let data;
    try { data = await api.get(`/rooms/${encodeURIComponent(code)}`); } catch (e) {
      if (!alive) return;
      setHTML(root, emptyState('Help Room not found', e.status === 404 ? 'This room does not exist, or it belongs to someone else.' : e.message, html`<a class="btn btn-primary" href="#/sessions">Back to Help Sessions</a>`));
      return;
    }
    if (!alive) return;
    const room = data.room;
    const offset = new Date(data.serverTime).getTime() - Date.now();
    if (room.status === 'cancelled') {
      setHTML(root, html`${header(room, user)}${emptyState('This session was cancelled', 'No one can join this room.', html`<a class="btn btn-primary" href="#/sessions">Back to Help Sessions</a>`)}`);
      return;
    }
    if (room.status === 'scheduled') teardown = waiting(room, offset);
    else teardown = workspace(room, offset, room.status === 'active');
  }

  // ------------------------------------------------------------ shared header
  function header(room, me) {
    const other = room.myRole === 'seeker' ? room.helper : room.seeker;
    return html`
      <div class="room-head card">
        <div class="room-title">
          <a class="muted back" href="#/sessions">${icon('back', 15)} Help Sessions</a>
          <h1>${room.title}</h1>
          <div class="row gap flow">
            <span class="chip chip-accent">${room.categoryLabel}</span>
            <span class="muted">${fmtSlot(room.scheduledStart, room.durationMinutes)} (${room.durationMinutes} min)</span>
          </div>
        </div>
        <div class="room-people">
          <span class="mini-match">${avatar(room.seeker, 'sm')}<span><span class="muted">Seeker</span><br><strong>${room.seeker.name}</strong></span></span>
          <span class="mini-match">${avatar(room.helper, 'sm')}<span><span class="muted">Helper</span><br><strong>${room.helper.name}</strong></span></span>
        </div>
        <div class="room-clock"><span class="badge" id="room-status">${room.status}</span><strong id="room-count"></strong></div>
      </div>`;
  }

  // ------------------------------------------------------------ before the room opens
  function waiting(room, offset) {
    setHTML(root, html`<div class="room">${header(room, user)}
      <div class="card room-wait">
        <div class="wait-icon">${icon('lock', 28)}</div>
        <h2>Your Help Room opens soon</h2>
        <p class="muted">It unlocks a few minutes before the start time, and only the two of you can enter.</p>
        <div class="big-count" id="wait-count">--:--</div>
      </div></div>`);
    const statusEl = root.querySelector('#room-status');
    statusEl.textContent = 'scheduled';
    statusEl.className = 'badge status-pending';
    const tick = () => {
      const ms = new Date(room.opensAt).getTime() - (Date.now() + offset);
      root.querySelector('#wait-count').textContent = countdown(ms);
      root.querySelector('#room-count').textContent = `Starts in ${countdown(new Date(room.scheduledStart).getTime() - (Date.now() + offset))}`;
      if (ms <= 0) { clearInterval(t); setTimeout(() => alive && boot(), 600); }
    };
    const t = setInterval(tick, 1000);
    tick();
    return () => clearInterval(t);
  }

  // ------------------------------------------------------------ the room itself (live or archived)
  function workspace(room, offset, live) {
    const sid = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const meId = String(user._id);
    const partner = room.myRole === 'seeker' ? room.helper : room.seeker;
    const base = `/rooms/${encodeURIComponent(room.roomId)}`;
    const state = { since: 0, notesV: room.notes.version, codeV: room.code.version, stopped: false, partnerOnline: false, files: [...room.files], busy: false, saving: 0, lastTimer: null };
    let media = null;
    let board = null;
    let syncTimer = null;
    let clockTimer = null;
    let notesDirty = false;
    let codeDirty = false;
    const names = { [String(room.seeker._id)]: room.seeker.name, [String(room.helper._id)]: room.helper.name };

    setHTML(root, html`
      <div class="room ${live ? 'is-live' : 'is-archived'}">
        ${header(room, user)}
        ${live ? '' : html`<div class="card room-summary"><strong>${OUTCOME[room.outcome] || 'Session ended'}</strong><span class="muted">This room is archived and read-only. Notes, whiteboard, code, chat and files stay here for you.</span></div>`}
        <div id="room-banner" class="room-banner" hidden></div>
        <div class="room-grid">
          <section class="room-main">
            ${live ? html`
            <div class="room-stage" id="stage">
              <div class="tile tile-screen" id="tile-screen" hidden><video id="v-screen" autoplay playsinline></video><span class="tile-label">${partner.name} is sharing their screen</span></div>
              <div class="tile tile-remote" id="tile-remote">
                <video id="v-remote" autoplay playsinline></video>
                <div class="tile-off" id="remote-off">${avatar(partner, 'lg')}<span id="remote-msg">Waiting for ${partner.name} to join...</span></div>
                <span class="tile-label"><span id="remote-mic"></span>${partner.name}</span>
                <audio id="a-remote" autoplay></audio>
              </div>
              <div class="tile tile-local" id="tile-local">
                <video id="v-local" autoplay playsinline muted></video>
                <div class="tile-off" id="local-off">${avatar(user, 'sm')}</div>
                <span class="tile-label">You</span>
              </div>
            </div>
            <div class="room-bar" role="toolbar" aria-label="Call controls">
              <button class="rb" id="b-mic" disabled title="Microphone">${icon('mic', 20)}<span>Mic</span></button>
              <button class="rb" id="b-cam" disabled title="Camera">${icon('video', 20)}<span>Camera</span></button>
              <button class="rb" id="b-screen" title="Share your screen">${icon('monitor', 20)}<span>Share screen</span></button>
              <button class="rb rb-leave" id="b-leave" title="Leave the room">${icon('leave', 20)}<span>Leave</span></button>
              <button class="rb rb-end" id="b-end" title="End the session for both of you">${icon('x', 20)}<span>End session</span></button>
            </div>` : ''}
            <div class="room-tabs" role="tablist">
              ${[['board', 'Whiteboard', 'pen'], ['code', 'Code', 'code'], ['notes', 'Notes', 'file'], ['files', 'Files', 'folder']].map(([k, l, ic], i) => html`<button role="tab" class="room-tab ${i === 0 ? 'on' : ''}" data-tab="${k}" aria-selected="${i === 0}">${icon(ic, 16)} ${l}</button>`)}
            </div>
            <div class="room-panes">
              <div class="pane" data-pane="board">
                ${live ? html`<div class="board-tools">
                  <button class="tool on" data-tool="pen" title="Pen">${icon('pen', 16)}</button>
                  <button class="tool" data-tool="eraser" title="Eraser">${icon('eraser', 16)}</button>
                  ${COLORS.map((c, i) => html`<button class="swatch ${i === 0 ? 'on' : ''}" data-color="${c}" style="background:${c}" aria-label="Colour ${c}"></button>`)}
                  <select id="board-size" aria-label="Brush size"><option value="2">Thin</option><option value="4" selected>Medium</option><option value="8">Thick</option></select>
                  <button class="btn btn-ghost btn-sm" id="board-undo">${icon('undo', 15)} Undo</button>
                  <button class="btn btn-ghost btn-sm" id="board-clear">Clear</button>
                  <button class="btn btn-ghost btn-sm" id="board-share">${icon('upload', 15)} Save to files</button>
                </div>` : ''}
                <div class="board-wrap"><canvas id="board" aria-label="Shared whiteboard"></canvas></div>
              </div>
              <div class="pane" data-pane="code" hidden>
                <div class="pane-tools"><label class="muted" for="code-lang">Language</label>
                  <select id="code-lang" ${live ? '' : 'disabled'}>${LANGS.map(([v, l]) => html`<option value="${v}" ${room.code.language === v ? 'selected' : ''}>${l}</option>`)}</select>
                  <span class="muted" id="code-state"></span>
                  <button class="btn btn-ghost btn-sm" id="code-copy">Copy</button></div>
                <textarea id="code" class="code-area" spellcheck="false" autocapitalize="off" autocomplete="off" ${live ? '' : 'readonly'} aria-label="Shared code editor"></textarea>
              </div>
              <div class="pane" data-pane="notes" hidden>
                <div class="pane-tools"><span class="muted">Shared notes. Both of you can edit.</span><span class="muted" id="notes-state"></span></div>
                <textarea id="notes" class="notes-area" ${live ? '' : 'readonly'} placeholder="Agenda, key points, next steps..." aria-label="Shared notes"></textarea>
              </div>
              <div class="pane" data-pane="files" hidden>
                ${live ? html`<div class="pane-tools"><label class="btn btn-soft btn-sm">${icon('upload', 15)} Upload a file<input type="file" id="file-in" hidden></label><span class="muted">Up to 4 MB each</span></div>` : ''}
                <ul class="file-list" id="files"></ul>
              </div>
            </div>
          </section>
          <aside class="room-chat card">
            <h3>Chat</h3>
            <div class="chat-log" id="chat-log" aria-live="polite"></div>
            ${live ? html`<form class="chat-form" id="chat-form"><input name="text" maxlength="1000" placeholder="Write a message..." autocomplete="off" aria-label="Message"><button class="btn btn-primary btn-sm" aria-label="Send">${icon('send', 16)}</button></form>` : ''}
          </aside>
        </div>
      </div>`);

    const $ = (s) => root.querySelector(s);
    const codeEl = $('#code');
    const notesEl = $('#notes');
    codeEl.value = room.code.text;
    notesEl.value = room.notes.text;
    renderFiles();

    // ---- header clock
    const startMs = new Date(room.scheduledStart).getTime();
    const endMs = new Date(room.scheduledEnd).getTime();
    const status = $('#room-status');
    function paintClock() {
      const now = Date.now() + offset;
      if (!live) { status.textContent = room.outcome === 'completed' ? 'completed' : 'archived'; status.className = 'badge status-used'; $('#room-count').textContent = `Ended ${fmtTime(endMs)}`; return; }
      status.textContent = 'live';
      status.className = 'badge status-active';
      const left = endMs - now;
      $('#room-count').textContent = now < startMs ? `Starts in ${countdown(startMs - now)}` : `${countdown(left)} left`;
      $('#room-count').classList.toggle('low', left < 5 * 60000);
    }
    paintClock();
    clockTimer = setInterval(paintClock, 1000);

    // ---- tabs
    onClick(root, '.room-tab', (btn) => {
      root.querySelectorAll('.room-tab').forEach((b) => { const on = b === btn; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
      root.querySelectorAll('.pane').forEach((p) => { p.hidden = p.dataset.pane !== btn.dataset.tab; });
    });

    // ---- helpers for background requests: failures are shown once, never thrown into the polling loop
    const quiet = async (fn, label) => { try { return await fn(); } catch (e) { if (alive && !state.stopped) toast(label ? `${label}: ${e.message}` : e.message, { type: 'error' }); return null; } };
    const banner = (text) => { const b = $('#room-banner'); b.hidden = !text; b.textContent = text || ''; };

    // ---- whiteboard
    board = new Whiteboard($('#board'), {
      me: meId, sid, readOnly: !live,
      onChunk: (c) => quiet(() => api.post(`${base}/strokes`, c)),
      onClear: () => quiet(() => api.post(`${base}/clear`, {})),
      onUndo: (id) => quiet(() => api.post(`${base}/undo`, { id })),
    });
    if (live) {
      onClick(root, '[data-tool]', (b) => { board.setTool(b.dataset.tool); root.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('on', x === b)); });
      onClick(root, '[data-color]', (b) => { board.setColor(b.dataset.color); board.setTool('pen'); root.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('on', x === b)); root.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('on', x.dataset.tool === 'pen')); });
      $('#board-size').addEventListener('change', (e) => board.setSize(e.target.value));
      board.setSize(4);
      $('#board-undo').addEventListener('click', () => board.undo());
      $('#board-clear').addEventListener('click', async () => { if (await confirmDialog({ title: 'Clear the whiteboard?', message: 'This clears it for both of you.', confirmText: 'Clear', danger: true })) board.clear(); });
      $('#board-share').addEventListener('click', async () => {
        const blob = await board.toPNG();
        const file = new File([blob], `whiteboard-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`, { type: 'image/png' });
        await upload(file);
      });
    }

    // ---- notes and code (last writer wins, saved shortly after typing stops)
    const saveNotes = debounce(async () => {
      state.saving += 1;
      const r = await quiet(() => api.put(`${base}/notes`, { text: notesEl.value }), 'Notes not saved');
      state.saving -= 1;
      if (r) { state.notesV = r.version; $('#notes-state').textContent = 'Saved'; }
      notesDirty = state.saving > 0;
    }, 700);
    const saveCode = debounce(async () => {
      state.saving += 1;
      const r = await quiet(() => api.put(`${base}/code`, { text: codeEl.value, language: $('#code-lang').value }), 'Code not saved');
      state.saving -= 1;
      if (r) { state.codeV = r.version; $('#code-state').textContent = 'Saved'; }
      codeDirty = state.saving > 0;
    }, 700);
    if (live) {
      notesEl.addEventListener('input', () => { notesDirty = true; $('#notes-state').textContent = 'Saving...'; saveNotes(); });
      codeEl.addEventListener('input', () => { codeDirty = true; $('#code-state').textContent = 'Saving...'; saveCode(); });
      $('#code-lang').addEventListener('change', () => { codeDirty = true; saveCode(); });
      codeEl.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;
        e.preventDefault();
        const { selectionStart: s, selectionEnd: en } = codeEl;
        codeEl.setRangeText('  ', s, en, 'end');
        codeEl.dispatchEvent(new Event('input'));
      });
    }
    $('#code-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(codeEl.value); toast('Code copied.'); } catch { toast('Could not copy. Select the text and copy it manually.', { type: 'error' }); } });

    // ---- files
    function renderFiles() {
      setHTML($('#files'), state.files.length
        ? state.files.map((f) => html`<li><span class="file-ico">${icon('folder', 18)}</span><span class="file-name"><strong>${f.name}</strong><br><span class="muted">${fileSize(f.size)} - ${names[String(f.uploader)] || 'Someone'}${f.createdAt ? ` - ${timeAgo(f.createdAt)}` : ''}</span></span><button class="btn btn-ghost btn-sm" data-dl="${f._id}" data-name="${f.name}">${icon('download', 15)} Download</button></li>`)
        : html`<li class="muted empty-line">No files shared yet.</li>`);
    }
    onClick(root, '[data-dl]', (b) => quiet(() => downloadFile(`${base}/files/${b.dataset.dl}`, b.dataset.name), 'Download failed'));
    async function upload(file) {
      if (file.size > 4 * 1024 * 1024) { toast('Files can be up to 4 MB.', { type: 'error' }); return; }
      const r = await quiet(() => uploadFile(`${base}/files?name=${encodeURIComponent(file.name)}`, file), 'Upload failed');
      if (r) { toast(`${file.name} shared.`, { type: 'success' }); pollSoon(); }
    }
    if (live) $('#file-in').addEventListener('change', async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) await upload(f); });

    // ---- chat
    const log = $('#chat-log');
    function addLine(ev) {
      const p = ev.payload || {};
      const el = document.createElement('div');
      if (ev.kind === 'system') { el.className = 'chat-sys'; el.textContent = p.text; }
      else if (ev.kind === 'file') { el.className = 'chat-sys'; el.textContent = `${names[String(ev.from)] || 'Someone'} shared ${p.name}`; }
      else {
        const mine = String(ev.from) === meId;
        el.className = `chat-msg ${mine ? 'mine' : ''}`;
        el.innerHTML = toHTML(html`<span class="who">${mine ? 'You' : names[String(ev.from)] || 'Partner'} <time>${fmtTime(ev.createdAt)}</time></span><p>${p.text}</p>`);
      }
      const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
      log.appendChild(el);
      if (atEnd) log.scrollTop = log.scrollHeight;
    }
    if (live) {
      $('#chat-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = e.target.elements.text;
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        const r = await quiet(() => api.post(`${base}/chat`, { text }));
        if (!r) input.value = text; else pollSoon();
      });
    }

    // ---- polling
    function applyEvent(ev) {
      state.since = Math.max(state.since, ev.seq);
      if (['stroke', 'clear', 'undo'].includes(ev.kind)) board.apply(ev);
      else {
        if (ev.kind === 'file' && !state.files.some((f) => String(f._id) === ev.payload.fileId)) { state.files.push({ _id: ev.payload.fileId, name: ev.payload.name, size: ev.payload.size, uploader: ev.from, createdAt: ev.createdAt }); renderFiles(); }
        addLine(ev);
      }
    }
    function applyDocs(out) {
      if (out.notes) {
        if (String(out.notes.updatedBy) !== meId && !notesDirty && document.activeElement !== notesEl) notesEl.value = out.notes.text;
        else if (String(out.notes.updatedBy) !== meId && !notesDirty) { const { selectionStart: a, selectionEnd: b } = notesEl; notesEl.value = out.notes.text; notesEl.setSelectionRange(a, b); }
        if (!notesDirty || String(out.notes.updatedBy) !== meId) state.notesV = out.notes.version;
      }
      if (out.code) {
        const lang = $('#code-lang');
        if (String(out.code.updatedBy) !== meId && !codeDirty) {
          const { selectionStart: a, selectionEnd: b } = codeEl;
          codeEl.value = out.code.text;
          codeEl.setSelectionRange(Math.min(a, codeEl.value.length), Math.min(b, codeEl.value.length));
          lang.value = out.code.language;
        }
        if (!codeDirty || String(out.code.updatedBy) !== meId) state.codeV = out.code.version;
      }
    }
    async function poll() {
      clearTimeout(syncTimer);
      if (state.stopped || !alive) return;
      let next = document.hidden ? 4000 : 1600;
      try {
        const q = new URLSearchParams({ since: state.since, sid: live ? sid : '', notesV: state.notesV, codeV: state.codeV });
        const out = await api.get(`${base}/sync?${q}`);
        if (state.stopped || !alive) return;
        if (out.superseded) { superseded(); return; }
        out.events.forEach(applyEvent);
        applyDocs(out);
        if (out.hasMore) next = 50;
        if (live) {
          if (out.status !== 'active') { state.stopped = true; stopMedia(); toast('The session has ended. The room is now read-only.'); setTimeout(() => alive && boot(), 400); return; }
          presence(out.partner);
          for (const s of out.signals) if (media) media.handleSignal(s.fromSid, s.data);
        }
      } catch (e) {
        if (e.status === 404 || e.status === 403) { state.stopped = true; setHTML(root, emptyState('Help Room unavailable', e.message, html`<a class="btn btn-primary" href="#/sessions">Back to Help Sessions</a>`)); return; }
        next = 4000; // network blip: keep trying
      }
      syncTimer = setTimeout(poll, next);
    }
    const pollSoon = () => { clearTimeout(syncTimer); syncTimer = setTimeout(poll, 60); };

    function presence(p) {
      if (!p) return;
      if (p.online && !state.partnerOnline && media) media.hello();
      state.partnerOnline = p.online;
      const msg = $('#remote-msg');
      if (msg && !state.remoteVideo) msg.textContent = p.online ? `${partner.name} is here. Connecting...` : p.joined ? `${partner.name} stepped out. Waiting for them to return...` : `Waiting for ${partner.name} to join...`;
    }

    function superseded() {
      state.stopped = true;
      stopMedia();
      setHTML(root, html`<div class="room">${header(room, user)}${emptyState('This room is open in another tab', 'A room can be open in one tab at a time for each person.', html`<button class="btn btn-primary" id="take-over">Use this tab instead</button>`)}</div>`);
      $('#take-over').addEventListener('click', () => boot());
    }

    // ---- media
    function stopMedia() { if (media) { media.destroy(); media = null; } }
    function setBar() {
      if (!media) return;
      const on = (id, enabled, hasDev, iconOn, iconOff, label, labelOff) => {
        const b = $(id);
        b.disabled = !hasDev;
        b.classList.toggle('off', hasDev && !enabled);
        b.innerHTML = toHTML(html`${icon(enabled ? iconOn : iconOff, 20)}<span>${enabled ? label : labelOff}</span>`);
      };
      on('#b-mic', media.mic && media.mic.enabled, media.hasMic, 'mic', 'micOff', 'Mic', 'Muted');
      on('#b-cam', media.cam && media.cam.enabled, media.hasCam, 'video', 'videoOff', 'Camera', 'Camera off');
      $('#local-off').hidden = !!(media.cam && media.cam.enabled);
      $('#tile-local').classList.toggle('no-video', !(media.cam && media.cam.enabled));
      const sb = $('#b-screen');
      sb.classList.toggle('on', media.sharing);
      sb.querySelector('span').textContent = media.sharing ? 'Stop sharing' : 'Share screen';
    }
    function playSafe(el) { const p = el.play && el.play(); if (p && p.catch) p.catch(() => {}); }

    async function join() {
      try {
        const j = await api.post(`${base}/join`, { sid });
        if (!alive || state.stopped) return;
        media = new MediaSession({
          iceServers: j.iceServers, polite: j.role === 'helper',
          send: (data) => api.post(`${base}/signal`, { sid, data }),
          onRemote: (kind, stream) => {
            if (kind === 'local') { $('#v-local').srcObject = stream; setBar(); }
            else if (kind === 'cam') { state.remoteVideo = !!stream; $('#v-remote').srcObject = stream; if (stream) playSafe($('#v-remote')); remoteView(); }
            else if (kind === 'audio') { $('#a-remote').srcObject = stream; if (stream) playSafe($('#a-remote')); }
            else if (kind === 'screen') { $('#v-screen').srcObject = stream; if (stream) playSafe($('#v-screen')); }
          },
          onPeerState: (p) => { state.peer = p; remoteView(); },
          onStatus: (s) => {
            if (s === 'connected') banner('');
            else if (s === 'connecting' || s === 'reconnecting') banner(s === 'connecting' ? '' : 'Connection interrupted. Trying to reconnect...');
            else banner(s);
          },
        });
        media.onLocalScreenEnded = () => setBar();
        await media.start();
        setBar();
      } catch (e) {
        if (e.status === 409) { setTimeout(() => alive && boot(), 800); return; }
        toast(e.message, { type: 'error' });
      }
    }
    function remoteView() {
      const p = state.peer || { cam: true, mic: true, screen: false, present: false };
      const videoOn = state.remoteVideo && p.cam && p.present !== false;
      $('#remote-off').hidden = videoOn;
      $('#tile-remote').classList.toggle('no-video', !videoOn);
      if (!videoOn && p.present) $('#remote-msg').textContent = p.cam === false ? `${partner.name} turned their camera off` : `${partner.name} is connected (audio only)`;
      $('#remote-mic').innerHTML = p.mic === false ? toHTML(icon('micOff', 14)) : '';
      $('#tile-screen').hidden = !p.screen;
      $('#stage').classList.toggle('has-screen', !!p.screen);
    }

    if (live) {
      $('#b-mic').addEventListener('click', () => { media && media.toggleMic(); setBar(); });
      $('#b-cam').addEventListener('click', () => { media && media.toggleCam(); setBar(); });
      $('#b-screen').addEventListener('click', async () => {
        if (!media) return;
        try { if (media.sharing) await media.stopScreen(); else await media.startScreen(); } catch (e) { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') toast(e.message, { type: 'error' }); }
        setBar();
      });
      $('#b-leave').addEventListener('click', async () => {
        if (!(await confirmDialog({ title: 'Leave the Help Room?', message: 'The session keeps running until its end time, so you can come back and rejoin.', confirmText: 'Leave' }))) return;
        location.hash = '#/sessions';
      });
      $('#b-end').addEventListener('click', async () => {
        if (!(await confirmDialog({ title: 'End this session for both of you?', message: 'The room will be archived. Notes, whiteboard, chat and files stay available to you both.', confirmText: 'End session', danger: true }))) return;
        state.stopped = true;
        stopMedia();
        try { await api.post(`${base}/end`, {}); } catch (e) { toast(e.message, { type: 'error' }); }
        boot();
      });
    }

    // ---- start
    const leaveBeacon = () => {
      if (!live || state.stopped) return;
      try { fetch(`/api${base}/leave`, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }, body: JSON.stringify({ sid }) }); } catch { /* page is closing */ }
    };
    window.addEventListener('pagehide', leaveBeacon);
    if (live) join();
    poll();

    return () => {
      state.stopped = true;
      clearTimeout(syncTimer);
      clearInterval(clockTimer);
      window.removeEventListener('pagehide', leaveBeacon);
      leaveBeacon();
      stopMedia();
      if (board) board.destroy();
    };
  }

  await boot();
  return cleanup;
}

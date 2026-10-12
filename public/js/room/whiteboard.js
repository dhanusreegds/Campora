// Shared whiteboard. Strokes are stored as flat point lists [x0,y0,x1,y1,...] in 0..1 board coordinates,
// so they look the same on every screen size. Local drawing is instant; chunks are sent every 350 ms.
const W = 1200;
const H = 720;
const SEND_EVERY = 350;
const BG = '#ffffff';

export class Whiteboard {
  constructor(canvas, { me, sid, readOnly = false, onChunk, onClear, onUndo } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    canvas.width = W;
    canvas.height = H;
    this.me = me;
    this.readOnly = readOnly;
    this.onChunk = onChunk || (() => {});
    this.onClear = onClear || (() => {});
    this.onUndo = onUndo || (() => {});
    this.tool = 'pen';
    this.color = '#27394A';
    this.size = 3;
    this.strokes = new Map(); // id -> { tool, color, size, pts }
    this.order = [];
    this.mine = []; // my stroke ids, newest last (for undo)
    this.pendingClears = 0;
    this.current = null;
    this.timer = null;
    this._bind();
    this.redraw();
  }

  setTool(t) { this.tool = t === 'eraser' ? 'eraser' : 'pen'; }
  setColor(c) { this.color = c; }
  setSize(s) { this.size = Math.min(40, Math.max(1, Number(s) || 3)); }
  setReadOnly(v) { this.readOnly = !!v; if (v) this._finish(); this.canvas.classList.toggle('readonly', !!v); }

  // ------------------------------------------------------------ drawing
  _line(s, from) {
    const { ctx } = this;
    const p = s.pts;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = s.tool === 'eraser' ? BG : s.color;
    ctx.fillStyle = ctx.strokeStyle;
    const w = s.tool === 'eraser' ? s.size * 4 : s.size;
    ctx.lineWidth = w;
    if (p.length === 2) {
      ctx.beginPath();
      ctx.arc(p[0] * W, p[1] * H, w / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    const start = Math.max(0, from);
    ctx.moveTo(p[start] * W, p[start + 1] * H);
    for (let i = start + 2; i < p.length; i += 2) ctx.lineTo(p[i] * W, p[i + 1] * H);
    ctx.stroke();
  }

  redraw() {
    this.ctx.fillStyle = BG;
    this.ctx.fillRect(0, 0, W, H);
    for (const id of this.order) { const s = this.strokes.get(id); if (s) this._line(s, 0); }
  }

  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    return [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000];
  }

  _bind() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    this._down = (e) => {
      if (this.readOnly || (e.button !== undefined && e.button > 0)) return;
      e.preventDefault();
      c.setPointerCapture && c.setPointerCapture(e.pointerId);
      const id = `${(this.me || 'u').toString().slice(-6)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const [x, y] = this._pos(e);
      const s = { id, tool: this.tool, color: this.color, size: this.size, pts: [x, y] };
      this.strokes.set(id, s);
      this.order.push(id);
      this.mine.push(id);
      this.current = { s, sentUpTo: 0, first: true };
      this._line(s, 0);
      clearInterval(this.timer);
      this.timer = setInterval(() => this._flush(), SEND_EVERY);
    };
    this._move = (e) => {
      const cur = this.current;
      if (!cur) return;
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of (events.length ? events : [e])) {
        const [x, y] = this._pos(ev);
        const p = cur.s.pts;
        if (p[p.length - 2] === x && p[p.length - 1] === y) continue;
        if (p.length >= 4000) break;
        const from = p.length - 2;
        p.push(x, y);
        this._line({ ...cur.s, pts: p.slice(from) }, 0);
      }
    };
    this._up = () => this._finish();
    c.addEventListener('pointerdown', this._down);
    c.addEventListener('pointermove', this._move);
    c.addEventListener('pointerup', this._up);
    c.addEventListener('pointercancel', this._up);
  }

  _flush() {
    const cur = this.current;
    if (!cur) return;
    const p = cur.s.pts;
    // Each later chunk begins with the previous chunk's last point so the line stays joined.
    let from = cur.first ? 0 : Math.max(0, cur.sentUpTo - 2);
    if (p.length <= cur.sentUpTo && !cur.first) return;
    while (from < p.length) {
      const chunk = p.slice(from, from + 600);
      if (chunk.length < 2) break;
      this.onChunk({ id: cur.s.id, tool: cur.s.tool, color: cur.s.color, size: cur.s.size, start: cur.first, pts: chunk });
      cur.first = false;
      from += chunk.length - 2 || chunk.length;
      if (chunk.length < 600) break;
    }
    cur.sentUpTo = p.length;
  }

  _finish() {
    clearInterval(this.timer);
    this.timer = null;
    if (!this.current) return;
    this._flush();
    this.current = null;
  }

  // ------------------------------------------------------------ actions
  clear() {
    this._finish();
    this.pendingClears += 1;
    this._wipe();
    this.onClear();
  }

  undo() {
    this._finish();
    const id = this.mine.pop();
    if (!id) return;
    this._remove(id);
    this.redraw();
    this.onUndo(id);
  }

  _wipe() { this.strokes.clear(); this.order = []; this.mine = []; this.redraw(); }
  _remove(id) { this.strokes.delete(id); this.order = this.order.filter((x) => x !== id); this.mine = this.mine.filter((x) => x !== id); }

  /** Applies an event from the server log (stroke, clear, undo). Events I produced myself are skipped. */
  apply(ev) {
    if (ev.kind === 'clear') {
      if (this.pendingClears > 0) { this.pendingClears -= 1; return; }
      this._finish();
      this._wipe();
      return;
    }
    if (ev.kind === 'undo') {
      const id = ev.payload.id;
      if (this.strokes.has(id) && !(this.current && this.current.s.id === id)) { this._remove(id); this.redraw(); }
      return;
    }
    if (ev.kind !== 'stroke') return;
    const d = ev.payload;
    if (this.strokes.has(d.id) && (this.mine.includes(d.id) || (this.current && this.current.s.id === d.id))) return; // my own
    let s = this.strokes.get(d.id);
    if (!s) {
      s = { tool: d.tool, color: d.color, size: d.size, pts: [] };
      this.strokes.set(d.id, s);
      this.order.push(d.id);
    }
    const before = s.pts.length;
    s.pts.push(...d.pts);
    this._line(s, before > 0 ? before - 2 : 0);
  }

  toPNG() { return new Promise((res) => this.canvas.toBlob(res, 'image/png')); }

  destroy() {
    this._finish();
    const c = this.canvas;
    c.removeEventListener('pointerdown', this._down);
    c.removeEventListener('pointermove', this._move);
    c.removeEventListener('pointerup', this._up);
    c.removeEventListener('pointercancel', this._up);
  }
}

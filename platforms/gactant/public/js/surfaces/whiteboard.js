// Whiteboard: a shared sketch with a baton. Anyone can draw; the baton says whose turn it
// is, and passing it is how one collaborator hands the board to another.
//
// The board is 100 wide and 60 tall, in board units, origin top-left.
//
// actions (as an actor)
//   draw(shapes)          shapes: [{ type: 'path', points: [[x,y],...], color?, width?, fill? }
//                                   { type: 'line', from: [x,y], to: [x,y], color?, width? }
//                                   { type: 'rect', x, y, w, h, color?, width?, fill? }
//                                   { type: 'circle', x, y, r, color?, width?, fill? }
//                                   { type: 'text', x, y, text, color?, size? }]
//   undo()                removes the actor's most recent mark
//   clear()
//   pass(to, note?)       hand the baton to someone
//   look() -> { text, image }   a picture of the board and a short account of it
// events
//   whiteboard.drew   { who, count }
//   whiteboard.turn   { from, to, note, image? }   image (a data URL) only if the board changed
//                                              since `to` last saw it; a message-only turn has none
//   whiteboard.cleared { who }
//   whiteboard.looked { who }   someone took a look (so the others know their sketch was seen)

import { el } from '../ui.js';
import { callName } from '../names.js';

const W = 100, H = 60, SCALE = 10;
const PALETTE = ['#20242c', '#8a8f99', '#ffffff', '#8b5a3c', '#d9483b', '#ef7d32', '#e8a33d', '#f2d14b', '#3f9d5a', '#2bb3a3', '#3b7dd8', '#8a55c9', '#e36aa8'];
const PAPER = '#fbf8f1';   // the board itself: the eraser draws in it
const SIZES = [0.3, 0.6, 1.2, 2.5, 5];   // brush widths, in board units
// What a person draws with: a pen stroke, an eraser stroke, or a shape dragged out.
const TOOLS = [['pen', '✎', 'pen'], ['eraser', '⌫', 'eraser'], ['line', '╱', 'line'], ['rect', '▭', 'rectangle'], ['circle', '◯', 'circle'], ['text', 'T', 'text']];
const KEEP = 'gactant-whiteboard';   // this browser's last tool, color, size and fill

export class Whiteboard {
  id = 'whiteboard';

  constructor(frame) {
    this.frame = frame;
    this.items = [];
    this.rev = 0;          // goes up with every mark, undo and clear
    this.seen = {};        // who -> the rev they last saw (by looking, or with a turn)
    this.baton = null;     // who the board is handed to, or null if nobody in particular
    this.note = '';
    this.pen = { tool: 'pen', color: PALETTE[0], size: 1, fill: false };   // size: an index into SIZES
    try { Object.assign(this.pen, JSON.parse(localStorage.getItem(KEEP) ?? '{}')); } catch {}
    // Someone's name changed: the board's names follow, so the baton stays theirs.
    frame.bus.on('frame.renamed', ({ from, to }) => {
      if (this.baton === from) this.baton = to;
      if (this.batonFrom === from) this.batonFrom = to;
      if (this.lastLook?.who === from) this.lastLook.who = to;
      if (from in this.seen) { this.seen[to] = this.seen[from]; delete this.seen[from]; }
      for (const it of this.items) if (it.by === from) it.by = to;
      this.renderBaton();
    }, 'whiteboard');
  }

  describe() {
    return 'whiteboard: a shared sketch board, 100 wide by 60 tall in board units (origin top-left), with a baton passed between whoever is drawing.';
  }

  state(viewer) {
    const by = {};
    for (const it of this.items) by[it.by] = (by[it.by] ?? 0) + 1;
    const who = Object.entries(by).map(([k, v]) => `${v} by ${k}`).join(', ') || 'blank';
    return `whiteboard: ${this.items.length} marks (${who}); the baton is with ${this.baton === viewer && viewer ? `you${this.batonFrom ? `, passed by ${this.batonFrom}, who is waiting for you to pass it back when you're done` : ''}` : this.baton ?? 'nobody'}.`;
  }

  actions(who) {
    return {
      draw: (shapes) => this.draw(who, shapes),
      undo: () => this.undo(who),
      clear: () => this.clear(who),
      pass: (to, note) => this.pass(who, to, note),
      look: () => this.look(who),
    };
  }

  draw(who, shapes) {
    if (!Array.isArray(shapes)) shapes = [shapes];
    const added = [];
    for (const s of shapes) {
      if (!s || typeof s !== 'object') continue;
      const item = { ...s, by: who };
      if (item.type === 'line') { item.type = 'path'; item.points = [item.from, item.to]; delete item.from; delete item.to; }
      if (!['path', 'rect', 'circle', 'text'].includes(item.type)) throw new Error(`unknown shape type ${s.type}`);
      added.push(item);
    }
    this.items.push(...added);
    this.rev++;
    this.paint();
    this.frame.bus.emit('whiteboard.drew', { who, count: added.length });
    this.frame.changed();
    return { drawn: added.length, total: this.items.length };
  }

  undo(who) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i].by === who) { this.items.splice(i, 1); this.rev++; break; }
    }
    this.paint();
    this.frame.changed();
    return { total: this.items.length };
  }

  clear(who) {
    this.items = [];
    this.rev++;
    this.paint();
    this.frame.bus.emit('whiteboard.cleared', { who });
    this.frame.changed();
    return { total: 0 };
  }

  pass(from, to, note = '') {
    this.baton = to;
    this.batonFrom = from;
    this.note = note;
    this.seen[from] = this.rev;   // whoever passes it has just seen it
    // The board comes with the turn only if it changed since `to` last saw it.
    const changed = (this.seen[to] ?? -1) !== this.rev;
    const image = changed ? this.picture() : undefined;
    if (changed) this.seen[to] = this.rev;
    this.renderBaton();
    this.frame.bus.emit('whiteboard.turn', { from, to, note, ...(image ? { image } : {}) });
    this.frame.changed();
    return { baton: to };
  }

  /** The board as a picture, drawn fresh so it works even when the board isn't mounted. */
  picture() {
    const c = document.createElement('canvas');
    c.width = W * 8; c.height = H * 8;
    this.paintTo(c.getContext('2d'), 8);
    return c.toDataURL('image/png');
  }

  look(who) {
    if (who) { this.lastLook = { who, at: Date.now() }; this.seen[who] = this.rev; this.renderBaton(); this.frame.bus.emit('whiteboard.looked', { who }); }
    const texts = this.items.filter((i) => i.type === 'text').map((i) => `"${i.text}" (${i.by})`);
    return {
      text: `${this.state()}${texts.length ? ` Words on the board: ${texts.join(', ')}.` : ''}${this.note ? ` Note with the baton: "${this.note}".` : ''}`,
      image: this.picture(),
    };
  }

  // ---------- painting ----------

  paint() { if (this.ctx) this.paintTo(this.ctx, SCALE); }

  paintTo(ctx, k) {
    ctx.fillStyle = '#fbf8f1';
    ctx.fillRect(0, 0, W * k, H * k);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const it of this.items) {
      ctx.strokeStyle = it.color || PALETTE[0];
      ctx.fillStyle = it.fill || it.color || PALETTE[0];
      ctx.lineWidth = (it.width ?? 0.5) * k;
      if (it.type === 'path' && it.points?.length) {
        ctx.beginPath();
        it.points.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k)));
        if (it.points.length === 1) ctx.lineTo(it.points[0][0] * k + 0.01, it.points[0][1] * k);
        if (it.fill) { ctx.closePath(); ctx.fill(); }
        ctx.stroke();
      } else if (it.type === 'rect') {
        if (it.fill) ctx.fillRect(it.x * k, it.y * k, it.w * k, it.h * k);
        ctx.strokeRect(it.x * k, it.y * k, it.w * k, it.h * k);
      } else if (it.type === 'circle') {
        ctx.beginPath(); ctx.arc(it.x * k, it.y * k, Math.max(0, it.r) * k, 0, Math.PI * 2);
        if (it.fill) ctx.fill();
        ctx.stroke();
      } else if (it.type === 'text') {
        ctx.fillStyle = it.color || PALETTE[0];
        ctx.font = `${(it.size ?? 3) * k}px "Segoe Print", "Comic Sans MS", cursive`;
        ctx.textBaseline = 'top';
        ctx.fillText(String(it.text ?? ''), it.x * k, it.y * k);
      }
    }
  }

  // ---------- the human side ----------

  mount(root) {
    const canvas = el('canvas', { class: 'wb-canvas', width: W * SCALE, height: H * SCALE });
    this.ctx = canvas.getContext('2d');
    const toBoard = (e) => {
      const r = canvas.getBoundingClientRect();
      return [+((e.clientX - r.left) / r.width * W).toFixed(1), +((e.clientY - r.top) / r.height * H).toFixed(1)];
    };
    // A stroke grows as the pointer moves; a shape is dragged out from where it began.
    let stroke = null, from = null;
    const width = () => SIZES[this.pen.size] ?? SIZES[1];
    canvas.addEventListener('pointerdown', (e) => {
      const p = toBoard(e), { tool, color, fill } = this.pen;
      if (tool === 'text') {
        const text = prompt('Text for the board:', '');
        if (text) this.draw(this.frame.seat, { type: 'text', x: p[0], y: p[1], text, color, size: Math.max(2, width() * 2.5) });
        return;
      }
      canvas.setPointerCapture(e.pointerId);
      from = p;
      const by = this.frame.seat;
      stroke = tool === 'pen' || tool === 'eraser' ? { type: 'path', points: [p], color: tool === 'eraser' ? PAPER : color, width: tool === 'eraser' ? width() * 2 : width(), by }
        : tool === 'line' ? { type: 'path', points: [p, p], color, width: width(), by }
        : tool === 'rect' ? { type: 'rect', x: p[0], y: p[1], w: 0, h: 0, color, width: width(), ...(fill ? { fill: color } : {}), by }
        : { type: 'circle', x: p[0], y: p[1], r: 0, color, width: width(), ...(fill ? { fill: color } : {}), by };
      this.items.push(stroke);
      this.paint();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!stroke) return;
      const p = toBoard(e);
      if (this.pen.tool === 'line') stroke.points[1] = p;
      else if (stroke.type === 'rect') Object.assign(stroke, { x: Math.min(from[0], p[0]), y: Math.min(from[1], p[1]), w: Math.abs(p[0] - from[0]), h: Math.abs(p[1] - from[1]) });
      else if (stroke.type === 'circle') stroke.r = +Math.hypot(p[0] - from[0], p[1] - from[1]).toFixed(1);
      else {
        const q = stroke.points.at(-1);
        if (Math.hypot(p[0] - q[0], p[1] - q[1]) <= 0.4) return;
        stroke.points.push(p);
      }
      this.paint();
    });
    const end = () => {
      if (!stroke) return;
      stroke = null;
      this.rev++;
      this.frame.bus.emit('whiteboard.drew', { who: this.frame.seat, count: 1 });
      this.frame.changed();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    // The toolbar: what to draw with, how thick, what color (any, past the swatches), and
    // whether shapes are filled. Remembered in this browser.
    const keep = () => { try { localStorage.setItem(KEEP, JSON.stringify(this.pen)); } catch {} };
    const group = (items, on) => { items.forEach(([b, v]) => b.classList.toggle('on', on(v))); };
    const tools = TOOLS.map(([id, icon, name]) => [el('button', { class: 'wb-tool', title: name, 'aria-label': name, onclick: () => { this.pen.tool = id; keep(); refresh(); } }, icon), id]);
    const sizes = SIZES.map((w, i) => [el('button', { class: 'wb-size', title: `brush ${i + 1}`, 'aria-label': `brush size ${i + 1}`, onclick: () => { this.pen.size = i; keep(); refresh(); } },
      el('i', { style: `width:${4 + i * 3}px;height:${4 + i * 3}px` })), i]);
    const swatches = PALETTE.map((c) => [el('button', { class: 'wb-swatch', style: `background:${c}`, title: c, 'aria-label': `color ${c}`, onclick: () => { this.pen.color = c; if (this.pen.tool === 'eraser') this.pen.tool = 'pen'; keep(); refresh(); } }), c]);
    const custom = el('input', { class: 'wb-custom', type: 'color', title: 'any color', value: this.pen.color });
    custom.addEventListener('input', () => { this.pen.color = custom.value; if (this.pen.tool === 'eraser') this.pen.tool = 'pen'; keep(); refresh(); });
    const fill = el('button', { class: 'wb-tool', title: 'fill shapes', onclick: () => { this.pen.fill = !this.pen.fill; keep(); refresh(); } }, '◼');
    const refresh = () => {
      group(tools, (v) => v === this.pen.tool);
      group(sizes, (v) => v === this.pen.size);
      group(swatches, (v) => v === this.pen.color);
      custom.classList.toggle('on', !PALETTE.includes(this.pen.color));
      fill.classList.toggle('on', this.pen.fill);
      for (const [b] of sizes) b.firstChild.style.background = this.pen.tool === 'eraser' ? PAPER : this.pen.color;
    };
    refresh();
    this.batonEl = el('div', { class: 'wb-baton' });
    const bar = el('div', { class: 'wb-bar' },
      el('div', { class: 'wb-group' }, ...tools.map(([b]) => b), fill),
      el('div', { class: 'wb-group' }, ...sizes.map(([b]) => b)),
      el('div', { class: 'wb-group wb-colors' }, ...swatches.map(([b]) => b), custom),
      el('button', { class: 'wb-btn', onclick: () => this.undo(this.frame.seat) }, 'undo'),
      el('button', { class: 'wb-btn', onclick: () => { if (confirm('Clear the whiteboard?')) this.clear(this.frame.seat); } }, 'clear'),
      el('button', { class: 'wb-btn', title: 'a bigger board to draw on (Esc to put it back)', onclick: () => root.classList.toggle('wb-big') }, '⤢'),
      this.batonEl);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') root.classList.remove('wb-big'); });
    const holder = el('div', { class: 'wb-holder' }, canvas);
    root.append(el('div', { class: 'pane-label' }, 'whiteboard: sketch an idea, then hand it over'), holder, bar);
    // Keep the board's shape: as large as fits, centred, so pointer maths stays exact.
    new ResizeObserver(() => {
      const r = holder.getBoundingClientRect();
      const k = Math.min(r.width / W, r.height / H);
      canvas.style.width = `${W * k}px`;
      canvas.style.height = `${H * k}px`;
    }).observe(holder);
    this.paint();
    this.renderBaton();
  }

  renderBaton() {
    if (!this.batonEl) return;
    const seat = this.frame.seat, other = this.frame.actant?.name ?? 'the ludant';
    this.batonEl.replaceChildren();
    if (this.lastLook && this.lastLook.who !== seat) {
      const mins = Math.round((Date.now() - this.lastLook.at) / 60000);
      this.batonEl.append(el('span', { class: 'wb-seen' }, `${this.lastLook.who} looked ${mins < 1 ? 'just now' : `${mins}m ago`}`));
    }
    if (this.baton && this.baton !== seat) {
      this.batonEl.append(el('span', { class: 'wb-turn' }, `${this.baton}'s turn`),
        el('button', { class: 'wb-btn', onclick: () => this.pass(this.baton, seat, '') }, 'take it back'));
    } else {
      const note = el('input', { class: 'wb-note', placeholder: 'note (optional)' });
      this.batonEl.append(note, el('button', { class: 'wb-btn', onclick: () => this.pass(seat, other, note.value) }, `hand it to ${other === this.frame.actant?.name ? callName(this.frame.actant.soma) : other} →`));
    }
  }

  toJSON() { return { items: this.items, rev: this.rev, seen: this.seen, baton: this.baton, batonFrom: this.batonFrom, note: this.note, lastLook: this.lastLook }; }
  load(json) { this.items = json?.items ?? []; this.baton = json?.baton ?? null; this.note = json?.note ?? ''; this.lastLook = json?.lastLook ?? null; this.batonFrom = json?.batonFrom ?? null; this.rev = json?.rev ?? 0; this.seen = json?.seen ?? {}; }
}

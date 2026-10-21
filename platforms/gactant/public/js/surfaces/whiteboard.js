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
//   whiteboard.turn   { from, to, note }
//   whiteboard.cleared { who }
//   whiteboard.looked { who }   someone took a look (so the others know their sketch was seen)

import { el } from '../ui.js';

const W = 100, H = 60, SCALE = 10;
const PALETTE = ['#20242c', '#d9483b', '#e8a33d', '#3f9d5a', '#3b7dd8', '#8a55c9', '#ffffff'];

export class Whiteboard {
  id = 'whiteboard';

  constructor(frame) {
    this.frame = frame;
    this.items = [];
    this.baton = null;     // who the board is handed to, or null if nobody in particular
    this.note = '';
    this.color = PALETTE[0];
  }

  describe(viewer) {
    const by = {};
    for (const it of this.items) by[it.by] = (by[it.by] ?? 0) + 1;
    const who = Object.entries(by).map(([k, v]) => `${v} by ${k}`).join(', ') || 'blank';
    return `whiteboard: a shared sketch board, 100 wide by 60 tall in board units (origin top-left); ${this.items.length} marks (${who}); the baton is with ${this.baton === viewer && viewer ? `you${this.batonFrom ? `, passed by ${this.batonFrom}, who is waiting for you to pass it back when you're done` : ''}` : this.baton ?? 'nobody'}.`;
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
    this.paint();
    this.frame.bus.emit('whiteboard.drew', { who, count: added.length });
    this.frame.changed();
    return { drawn: added.length, total: this.items.length };
  }

  undo(who) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i].by === who) { this.items.splice(i, 1); break; }
    }
    this.paint();
    this.frame.changed();
    return { total: this.items.length };
  }

  clear(who) {
    this.items = [];
    this.paint();
    this.frame.bus.emit('whiteboard.cleared', { who });
    this.frame.changed();
    return { total: 0 };
  }

  pass(from, to, note = '') {
    this.baton = to;
    this.batonFrom = from;
    this.note = note;
    this.renderBaton();
    this.frame.bus.emit('whiteboard.turn', { from, to, note });
    this.frame.changed();
    return { baton: to };
  }

  look(who) {
    if (who) { this.lastLook = { who, at: Date.now() }; this.renderBaton(); this.frame.bus.emit('whiteboard.looked', { who }); }
    // Draw onto a fresh canvas so a look works even when the board isn't mounted.
    const c = document.createElement('canvas');
    c.width = W * 8; c.height = H * 8;
    this.paintTo(c.getContext('2d'), 8);
    const texts = this.items.filter((i) => i.type === 'text').map((i) => `"${i.text}" (${i.by})`);
    return {
      text: `${this.describe()}${texts.length ? ` Words on the board: ${texts.join(', ')}.` : ''}${this.note ? ` Note with the baton: "${this.note}".` : ''}`,
      image: c.toDataURL('image/png'),
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
    let stroke = null;
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      stroke = { type: 'path', points: [toBoard(e)], color: this.color, width: this.color === '#ffffff' ? 3 : 0.5, by: this.frame.seat };
      this.items.push(stroke);
      this.paint();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!stroke) return;
      const p = toBoard(e), q = stroke.points.at(-1);
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.4) { stroke.points.push(p); this.paint(); }
    });
    const end = () => {
      if (!stroke) return;
      stroke = null;
      this.frame.bus.emit('whiteboard.drew', { who: this.frame.seat, count: 1 });
      this.frame.changed();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    const swatches = PALETTE.map((c) => {
      const b = el('button', { class: 'wb-swatch', style: `background:${c}`, title: c === '#ffffff' ? 'eraser' : c });
      b.addEventListener('click', () => { this.color = c; swatches.forEach((s) => s.classList.toggle('on', s === b)); });
      return b;
    });
    swatches[0].classList.add('on');
    this.batonEl = el('div', { class: 'wb-baton' });
    const bar = el('div', { class: 'wb-bar' },
      ...swatches,
      el('button', { class: 'wb-btn', onclick: () => this.undo(this.frame.seat) }, 'undo'),
      el('button', { class: 'wb-btn', onclick: () => { if (confirm('Clear the whiteboard?')) this.clear(this.frame.seat); } }, 'clear'),
      this.batonEl);
    const holder = el('div', { class: 'wb-holder' }, canvas);
    root.append(holder, bar);
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
      this.batonEl.append(note, el('button', { class: 'wb-btn primary', onclick: () => this.pass(seat, other, note.value) }, `your turn, ${other} →`));
    }
  }

  toJSON() { return { items: this.items, baton: this.baton, batonFrom: this.batonFrom, note: this.note, lastLook: this.lastLook }; }
  load(json) { this.items = json?.items ?? []; this.baton = json?.baton ?? null; this.note = json?.note ?? ''; this.lastLook = json?.lastLook ?? null; this.batonFrom = json?.batonFrom ?? null; }
}

// Stage: a canvas with a clock and input. It draws nothing itself; whoever hooks into it
// draws. It runs at display rate and knows nothing about games or actants.
//
// For code running at frame rate, `stage.api` is the handle:
//   ctx, width, height, t (seconds), frame (count)
//   size(w, h)            change the logical resolution (pixels scale up crisply)
//   input.keys            Set of keys held ('arrowleft', 'a', ' ', ...)
//   input.pressed         Set of keys that went down since the last frame
//   input.pointer         { x, y, down, clicked } in stage coordinates; clicked lasts one frame
// actions (as an actor)
//   look() -> { text, image }   a picture of the stage right now
//   restart()                   clear a halt and reset the clock
// events
//   stage.frame    { dt, t, frame }      every display frame while running
//   stage.key      { key, down }
//   stage.pointer  { x, y, kind }        kind: down | up
//   stage.halted   { message }           a frame handler threw; the stage stops until restarted
//
// A frame handler that throws halts the stage at once, because a game that throws on
// every frame is broken, not unlucky.

import { el } from '../ui.js';

export class Stage {
  id = 'stage';

  constructor(frame) {
    this.frame = frame;
    this.width = 320; this.height = 240;
    this.canvas = el('canvas', { class: 'stage-canvas', width: this.width, height: this.height });
    this.ctx = this.canvas.getContext('2d');
    this.input = { keys: new Set(), pressed: new Set(), pointer: { x: 0, y: 0, down: false, clicked: false } };
    this.t = 0; this.count = 0; this.fps = 0;
    this.halted = null;
    const stage = this;
    this.api = {
      ctx: this.ctx, input: this.input,
      get width() { return stage.width; }, get height() { return stage.height; },
      get t() { return stage.t; }, get frame() { return stage.count; },
      size: (w, h) => this.size(w, h),
    };
    frame.bus.on('frame.error', (e) => { if (e.during === 'stage.frame' && !this.halted) this.halt(e.message); }, 'stage');
  }

  describe() {
    const state = this.halted ? `HALTED by an error: ${this.halted}` : `running at ${Math.round(this.fps)} fps`;
    return `stage: a ${this.width}×${this.height} canvas with a frame clock and keyboard/pointer input, ${state}.`;
  }

  actions() {
    return { look: () => this.look(), restart: () => this.restart() };
  }

  size(w, h) {
    w = Math.max(16, Math.min(1920, Math.round(w))); h = Math.max(16, Math.min(1080, Math.round(h)));
    this.width = this.canvas.width = w;
    this.height = this.canvas.height = h;
    this.fit();
  }

  halt(message) {
    this.halted = message;
    this.haltEl?.replaceChildren(el('div', {}, `stage halted: ${message}`), el('button', { onclick: () => this.restart() }, 'restart'));
    this.haltEl?.classList.add('on');
    this.frame.bus.emit('stage.halted', { message });
  }

  restart() {
    this.halted = null;
    this.haltEl?.classList.remove('on');
    this.frame.bus.errors.clear();
    this.t = 0; this.count = 0;
    return { running: true };
  }

  look() {
    // Scale up with nearest-neighbour so small pixel art stays legible.
    const k = Math.max(1, Math.floor(640 / this.width));
    const c = document.createElement('canvas');
    c.width = this.width * k; c.height = this.height * k;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(this.canvas, 0, 0, c.width, c.height);
    return { text: this.describe(), image: c.toDataURL('image/png') };
  }

  mount(root) {
    this.root = root;
    this.haltEl = el('div', { class: 'stage-halt' });
    const wrap = el('div', { class: 'stage-wrap', tabindex: 0 }, this.canvas, this.haltEl);
    root.append(wrap);
    this.wrap = wrap;

    const key = (e) => (e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase());
    wrap.addEventListener('keydown', (e) => {
      const k = key(e);
      if (k.startsWith('arrow') || k === ' ') e.preventDefault();
      if (!this.input.keys.has(k)) { this.input.pressed.add(k); this.frame.bus.emit('stage.key', { key: k, down: true }); }
      this.input.keys.add(k);
    });
    wrap.addEventListener('keyup', (e) => { const k = key(e); this.input.keys.delete(k); this.frame.bus.emit('stage.key', { key: k, down: false }); });
    wrap.addEventListener('blur', () => this.input.keys.clear());
    const at = (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.input.pointer.x = (e.clientX - r.left) / r.width * this.width;
      this.input.pointer.y = (e.clientY - r.top) / r.height * this.height;
    };
    this.canvas.addEventListener('pointermove', at);
    this.canvas.addEventListener('pointerdown', (e) => {
      wrap.focus(); at(e);
      this.input.pointer.down = true; this.input.pointer.clicked = true;
      this.frame.bus.emit('stage.pointer', { x: this.input.pointer.x, y: this.input.pointer.y, kind: 'down' });
    });
    this.canvas.addEventListener('pointerup', (e) => {
      at(e); this.input.pointer.down = false;
      this.frame.bus.emit('stage.pointer', { x: this.input.pointer.x, y: this.input.pointer.y, kind: 'up' });
    });
    new ResizeObserver(() => this.fit()).observe(root);
    this.fit();

    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this.fps = this.fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
      if (!this.halted) {
        this.t += dt; this.count++;
        this.frame.bus.emit('stage.frame', { dt, t: this.t, frame: this.count });
      }
      this.input.pressed.clear();
      this.input.pointer.clicked = false;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** Largest whole-number scale that fits once there's room for 2×; below that, whatever fits. */
  fit() {
    if (!this.root) return;
    const r = this.root.getBoundingClientRect();
    const s = Math.min((r.width - 8) / this.width, (r.height - 8) / this.height);
    const k = s >= 2 ? Math.floor(s) : s;
    this.canvas.style.width = `${Math.max(1, this.width * k)}px`;
    this.canvas.style.height = `${Math.max(1, this.height * k)}px`;
  }

  toJSON() { return { width: this.width, height: this.height }; }
  load(json) { if (json?.width) this.size(json.width, json.height); }
}

// Stage: a canvas with a clock and input. It draws nothing itself; whoever hooks into it
// draws. It runs at display rate and knows nothing about games or actants.
//
// For code running at frame rate, `stage.api` is the handle:
//   ctx, width, height, t (seconds), frame (count)
//   size(w, h)            change the logical resolution (pixels scale up crisply)
//   caption               a line of text saying what's happening (score, who's where); every
//                         look reports it, so anyone looking can check the picture against it
//   input.keys            Set of keys held ('arrowleft', 'a', ' ', ...)
//   input.pressed         Set of keys that went down since the last frame
//   input.pointer         { x, y, down, clicked } in stage coordinates; clicked lasts one frame
// actions (as an actor)
//   look() -> { text, image }   a picture of the stage right now
//   restart()                   clear a halt and reset the clock
//   press(key, ms = 100)        hold a key for a while, as if on the keyboard (resolves after)
//   hold(key) / release(key)    hold a key down until released
//   point(x, y, down?)          move the pointer to stage coordinates; down: true/false presses or lifts
//   wait(ms)                    let the stage run
//   advance(seconds)            run that much game time at once (max 120 s), for seeing what happens later
// Input actions are the same input a human gives, so anyone in the frame can playtest.
// events
//   stage.frame    { dt, t, frame }      every display frame while running
//   stage.key      { key, down }
//   stage.pointer  { x, y, kind }        kind: down | up
//   stage.halted   { message }           a frame handler threw; the stage stops until restarted
//
// On touch screens the stage shows a pad (arrows and a space button) that holds and
// releases those keys, so a game written for the keyboard is playable on a phone.
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
      get caption() { return stage.caption; }, set caption(v) { stage.caption = String(v ?? '').slice(0, 300); },
    };
    this.caption = '';
    frame.bus.on('frame.error', (e) => { if (e.during === 'stage.frame' && !this.halted) this.halt(e.message); }, 'stage');
  }

  describe() {
    const state = this.halted ? `HALTED by an error: ${this.halted}` : `running at ${Math.round(this.fps)} fps`;
    return `stage: a ${this.width}×${this.height} canvas with a frame clock and keyboard/pointer input, ${state}. People on touch screens get an on-screen pad that presses the arrow keys and space, so games should be playable with those (or the pointer) alone. Anyone in the frame can give it input as a player would (actions: press(key, ms), hold(key), release(key), point(x, y, down), wait(ms), advance(seconds), look(), restart()).`;
  }

  actions() {
    const wait = (ms) => new Promise((r) => setTimeout(r, Math.max(0, Math.min(10000, ms))));
    return {
      look: () => this.look(),
      restart: () => this.restart(),
      hold: (key) => { this.keyDown(String(key).toLowerCase()); return { held: [...this.input.keys] }; },
      release: (key) => { this.keyUp(String(key).toLowerCase()); return { held: [...this.input.keys] }; },
      press: async (key, ms = 100) => { const k = String(key).toLowerCase(); this.keyDown(k); await wait(ms); this.keyUp(k); return { pressed: k, ms }; },
      point: (x, y, down) => this.point(x, y, down),
      wait: async (ms) => { await wait(ms); return { waited: ms }; },
      advance: (seconds) => this.advance(seconds),
    };
  }

  /** Fast-forward: emit frames back to back with a fixed step. Input stays as it is, so
   *  held keys stay held. Stops early if a frame handler halts the stage. */
  advance(seconds) {
    const dt = 1 / 60, n = Math.round(Math.max(0, Math.min(120, Number(seconds) || 0)) / dt);
    let i = 0;
    for (; i < n && !this.halted; i++) {
      this.t += dt; this.count++;
      this.frame.bus.emit('stage.frame', { dt, t: this.t, frame: this.count });
      this.input.pressed.clear();
      this.input.pointer.clicked = false;
    }
    return { advanced: +(i * dt).toFixed(2), halted: this.halted };
  }

  keyDown(k) {
    if (!this.input.keys.has(k)) { this.input.pressed.add(k); this.frame.bus.emit('stage.key', { key: k, down: true }); }
    this.input.keys.add(k);
  }

  keyUp(k) {
    this.input.keys.delete(k);
    this.frame.bus.emit('stage.key', { key: k, down: false });
  }

  point(x, y, down) {
    const p = this.input.pointer;
    p.x = x; p.y = y;
    if (down === true && !p.down) { p.down = true; p.clicked = true; this.frame.bus.emit('stage.pointer', { x, y, kind: 'down' }); }
    if (down === false && p.down) { p.down = false; this.frame.bus.emit('stage.pointer', { x, y, kind: 'up' }); }
    return { x, y, down: p.down };
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
    const moment = ` This look is at game time ${this.t.toFixed(1)} s (frame ${this.count}).${this.caption ? ` Caption: "${this.caption}"` : ' No caption is set.'}`;
    return { text: `${this.describe()}${moment}${k > 1 ? ` (This picture is enlarged ${k}× so pixels are clear; coordinates are still stage coordinates, ${this.width}×${this.height}.)` : ''}`, image: c.toDataURL('image/png') };
  }

  mount(root) {
    this.root = root;
    this.haltEl = el('div', { class: 'stage-halt' });
    const wrap = el('div', { class: 'stage-wrap', tabindex: 0 }, this.canvas, this.haltEl);
    root.append(wrap);
    this.wrap = wrap;
    this.touch = matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('pad');
    if (this.touch) root.append(this.pad());

    const key = (e) => e.key.toLowerCase();
    wrap.addEventListener('keydown', (e) => {
      const k = key(e);
      if (k.startsWith('arrow') || k === ' ') e.preventDefault();
      if (!e.repeat) this.keyDown(k);
    });
    wrap.addEventListener('keyup', (e) => this.keyUp(key(e)));
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

  /** Buttons that press keys while a finger is on them. */
  pad() {
    const button = (key, label, cls = '') => {
      const b = el('button', { class: `pad-btn ${cls}`, 'aria-label': key }, label);
      const up = () => { b.classList.remove('on'); this.keyUp(key); };
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('on'); this.keyDown(key); });
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      return b;
    };
    return el('div', { class: 'pad' },
      el('div', { class: 'pad-arrows' },
        el('span'), button('arrowup', '▲'), el('span'),
        button('arrowleft', '◀'), button('arrowdown', '▼'), button('arrowright', '▶')),
      button(' ', 'space', 'pad-space'));
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

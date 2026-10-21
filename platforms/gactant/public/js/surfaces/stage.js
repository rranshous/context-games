// Stage: a canvas with a clock and input. It draws nothing itself; whoever hooks into it
// draws. It runs at display rate and knows nothing about games or actants.
//
// The stage is the frame's, like every surface. What draws on it runs in the sandbox,
// so every display frame the stage sends a tick (the clock and the input) across, and
// what comes back is pictures: the layers the game drew in its buffer (stage-buffer.js),
// which the stage shows. Only one tick is out at a time, so a slow game shows as slow
// rather than falling behind.
//
// For game code, in the sandbox, the buffer's `api` is the handle:
//   ctx, width, height, t (seconds), frame (count)
//   size(w, h)            change the logical resolution (pixels scale up crisply)
//   caption               a line of text saying what's happening (score, who's where); every
//                         look reports it, so anyone looking can check the picture against it
//   input.keys            Set of keys held ('arrowleft', 'a', ' ', ...)
//   input.pressed         Set of keys that went down since the last frame
//   input.pointer         { x, y, down, clicked } in stage coordinates; clicked lasts one frame
//   three()               switch on a WebGL layer under the 2D canvas and get
//                         { THREE, scene, camera, renderer } (three.js, from the frame's
//                         libraries). The stage renders scene with camera after every frame;
//                         set view.camera to swap cameras. ctx then draws on a transparent
//                         layer on top, for a HUD: clear it each frame. Calling three() again
//                         gives a fresh scene and camera; rebuilding the game turns it off.
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
//   stage.pad      { pad, button, down } a controller button (pad: its index), while the game has the controller
//
// Controllers: every connected controller goes to the game each frame (input.pads), and
// input.players merges them with the keyboard (player 1 is the keyboard and controller 1;
// players 2… are the other controllers). Controller 1 also presses keys (d-pad and left
// stick as the arrows, A as space; stage.key says from: 'pad'), so games made for the
// keyboard play from the couch unchanged.
//
// On touch screens the stage shows a pad (arrows and a space button) that holds and
// releases those keys, so a game written for the keyboard is playable on a phone.
//
// A frame handler that throws halts the stage at once, because a game that throws on
// every frame is broken, not unlucky. The sandbox reports it; the stage stops ticking.

import { el } from '../ui.js';

const TICK_LOST_MS = 1000;   // a tick that hasn't come back by then is given up on
const STARVED_MS = 3000;     // no picture for this long, while running: say so
const PLAYING_MS = 1200;     // the ludant's edge stays lit this long after its last input
const PAD_KEYS = { up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright', a: ' ' };

export class Stage {
  id = 'stage';

  constructor(frame) {
    this.frame = frame;
    this.width = 640; this.height = 360;
    this.canvas = el('canvas', { class: 'stage-canvas', width: this.width, height: this.height });
    this.ctx = this.canvas.getContext('2d');
    this.input = { keys: new Set(), pressed: new Set(), pointer: { x: 0, y: 0, down: false, clicked: false } };
    this.t = 0; this.count = 0; this.fps = 0;
    this.halted = null;
    this.caption = '';
    this.three = false;
    this.live = false;     // ticking: once the sandbox has the ludant
    this.out = 0;          // when the tick in flight was sent, or 0
    this.padPressed = new Map();   // pad index -> buttons that went down since the last tick
    this.padKeys = new Set();      // keys controller 1 is holding down
    this.ludantHeld = new Set();   // keys the ludant is holding
    this.ludantAt = 0;             // when the ludant last gave the stage input
  }

  /** The ludant is playing itself: its input comes from the sandbox, a person's from the
   *  page, so the stage can tell without asking. While it plays, the stage's edge lights in
   *  its color; a person can see at a glance that the game isn't playing itself. */
  ludantInput(action, args) {
    this.ludantAt = performance.now();
    const k = String(args[0] ?? '').toLowerCase();
    if (action === 'hold') this.ludantHeld.add(k);
    if (action === 'release') this.ludantHeld.delete(k);
    this.actions()[action](...args);
    this.showPlaying();
  }

  showPlaying() {
    const on = this.ludantHeld.size > 0 || performance.now() - this.ludantAt < PLAYING_MS;
    if (on !== this.playingShown) { this.playingShown = on; this.layers?.classList.toggle('ludant-playing', on); }
  }

  /** Say on the stage that the game jumped ahead, and who jumped it. */
  flash(text) {
    if (!this.flashEl) return;
    this.flashEl.textContent = text;
    this.flashEl.classList.remove('on'); void this.flashEl.offsetWidth; this.flashEl.classList.add('on');
  }

  describe() {
    const state = this.halted ? `HALTED by an error: ${this.halted}` : `running at ${Math.round(this.fps)} fps`;
    const mode = this.three ? ' It is drawing in 3D now (three.js under a 2D overlay).' : '';
    return `stage: a ${this.width}×${this.height} canvas with a frame clock and keyboard/pointer input, ${state}. People on touch screens get an on-screen pad that presses the arrow keys and space, so games should be playable with those (or the pointer) alone. Anyone in the frame can give it input as a player would (actions: press(key, ms), hold(key), release(key), point(x, y, down), wait(ms), advance(seconds), look(), restart()). A game can draw in 2D (ctx) or in 3D with three.js (stage.three()), with ctx as a HUD on top. Controllers: ${this.controllers() ? `${this.controllers()} connected now` : 'none connected right now'}; a game reads them through stage.input.players (or .pads). When you play it yourself, people can see that: the stage's edge lights up in your color while you give it input, and a jump ahead is announced on the stage ("${this.frame.actant?.name ?? 'you'} skipped ahead 10 s").${mode}`;
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

  /** Fast-forward: the game runs that far ahead in the sandbox at once; the clock follows. */
  advance(seconds) {
    this.advancing = true;   // a person (the explorer, a shard) asked, not the ludant
    return this.frame.sandbox.call('stage', 'advance', [seconds]).finally(() => { this.advancing = false; });
  }

  // ---------- across the bridge ----------

  /** What the game drew this frame, as pictures: the 3D layer (if on) under the 2D one. */
  shown({ layers, pixels, width, height, caption, three }) {
    this.out = 0;
    this.lastPicture = performance.now();
    this.pictures = (this.pictures ?? 0) + 1;
    if (this.starved) {
      this.starved = false;
      this.starvedEl?.classList.remove('on');
      this.frame.inspector.note('changed', 'the stage is getting pictures from the game again');
    }
    this.caption = caption ?? '';
    this.three = Boolean(three);
    this.ctx.clearRect(0, 0, this.width, this.height);
    for (const bmp of layers ?? []) { this.ctx.drawImage(bmp, 0, 0, this.width, this.height); bmp.close?.(); }
    if (pixels && width === this.width && height === this.height) this.ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
  }

  /** The game's clock jumped ahead (it advanced itself). */
  advanced(t, count) {
    const jumped = t - this.t;
    this.t = t; this.count = count;
    if (jumped < 0.5) return;
    if (!this.advancing) { this.ludantAt = performance.now(); this.showPlaying(); }
    this.flash(`${this.advancing ? 'skipped' : `${this.frame.actant.name} skipped`} ahead ${jumped.toFixed(jumped < 10 ? 1 : 0)} s`);
  }

  /** The game asked for a different resolution. */
  resized(w, h) {
    this.width = this.canvas.width = w;
    this.height = this.canvas.height = h;
    this.fit();
    this.frame.changed();
  }

  tick(dt) {
    if (!this.live || this.halted || !this.frame.sandbox.bridge) return;
    const now = performance.now();
    this.liveSince ??= now;
    this.showPlaying();
    // The game runs in the sandbox and only pictures come back. If they stop coming, the
    // stage would just sit there, so it says what's wrong instead.
    if (!this.starved && now - (this.lastPicture ?? this.liveSince) > STARVED_MS) {
      this.starved = true;
      this.starvedEl?.classList.add('on');
      this.frame.inspector.note('fault', `the stage hasn't had a picture from the game for ${Math.round((now - (this.lastPicture ?? this.liveSince)) / 1000)} s (${this.pictures ?? 0} pictures so far, ${this.count} ticks sent)`);
      // Pictures may have stopped crossing: pixels always do.
      this.frame.sandbox.usePixels('pictures stopped arriving');
    }
    if (this.out && now - this.out < TICK_LOST_MS) return;
    this.t += dt; this.count++;
    this.out = now;
    const p = this.input.pointer;
    const pads = this.frame.gameHasPads?.() ? (this.frame.pads?.list ?? []).map((pad) => ({ ...pad, pressed: Object.fromEntries([...(this.padPressed.get(pad.index) ?? [])].map((b) => [b, true])) })) : [];
    this.frame.sandbox.bridge.send('tick', { dt, t: this.t, frame: this.count, fps: this.fps,
      input: { keys: [...this.input.keys], pressed: [...this.input.pressed], pointer: { x: p.x, y: p.y, down: p.down, clicked: p.clicked }, pads } });
    this.input.pressed.clear();
    this.padPressed.clear();
    p.clicked = false;
  }

  keyDown(k, from) {
    if (!this.input.keys.has(k)) { this.input.pressed.add(k); this.frame.bus.emit('stage.key', { key: k, down: true, ...(from ? { from } : {}) }); }
    this.input.keys.add(k);
  }

  keyUp(k, from) {
    this.input.keys.delete(k);
    this.frame.bus.emit('stage.key', { key: k, down: false, ...(from ? { from } : {}) });
  }

  /** A controller button, while the game has the controller. */
  padEvent({ pad, button, down, repeat }) {
    if (repeat) return;
    if (down) {
      if (!this.padPressed.has(pad)) this.padPressed.set(pad, new Set());
      this.padPressed.get(pad).add(button);
    }
    this.frame.bus.emit('stage.pad', { pad, button, down });
    // Controller 1 (the lowest connected) also presses keys.
    const first = Math.min(...(this.frame.pads?.list ?? []).map((p) => p.index));
    const key = PAD_KEYS[button];
    if (pad !== first || !key) return;
    if (down) { this.padKeys.add(key); this.keyDown(key, 'pad'); }
    else if (this.padKeys.delete(key)) this.keyUp(key, 'pad');
  }

  /** The controller went to the page: let go of whatever it was holding in the game. */
  releasePads() {
    for (const k of this.padKeys) this.keyUp(k, 'pad');
    this.padKeys.clear();
    this.padPressed.clear();
  }

  controllers() { return (this.frame.pads?.list ?? []).length; }

  point(x, y, down) {
    const p = this.input.pointer;
    p.x = x; p.y = y;
    if (down === true && !p.down) { p.down = true; p.clicked = true; this.frame.bus.emit('stage.pointer', { x, y, kind: 'down' }); }
    if (down === false && p.down) { p.down = false; this.frame.bus.emit('stage.pointer', { x, y, kind: 'up' }); }
    return { x, y, down: p.down };
  }

  halt(message) {
    this.halted = message;
    this.haltEl?.replaceChildren(el('div', {}, `stage halted: ${message}`), el('button', { onclick: () => this.restart() }, 'restart'));
    this.haltEl?.classList.add('on');
    this.frame.bus.emit('stage.halted', { message });
  }

  /** Clear a halt and reset the clock. `quiet` when the sandbox asked, so it isn't told back. */
  restart(quiet = false) {
    this.halted = null;
    this.out = 0;
    this.haltEl?.classList.remove('on');
    this.t = 0; this.count = 0;
    if (!quiet) this.frame.sandbox.send('restart');
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
    this.starvedEl = el('div', { class: 'stage-starved' }, 'waiting for a picture from the game…');
    this.flashEl = el('div', { class: 'stage-flash' });
    this.layers = el('div', { class: 'stage-layers' }, this.canvas);
    const wrap = el('div', { class: 'stage-wrap', tabindex: 0 }, this.layers, this.haltEl, this.starvedEl, this.flashEl);
    root.append(wrap);
    this.wrap = wrap;
    this.touch = matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('pad');
    if (this.touch) root.append(this.pad());

    const key = (e) => e.key.toLowerCase();
    wrap.addEventListener('keydown', (e) => {
      const k = key(e);
      // Edge on Xbox also sends a controller's presses as keys it can't name; the
      // controller itself comes through the Gamepad API.
      if (k === 'unidentified') return;
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
      this.tick(dt);
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
    this.layers.style.width = `${Math.max(1, this.width * k)}px`;
    this.layers.style.height = `${Math.max(1, this.height * k)}px`;
  }

  toJSON() { return { width: this.width, height: this.height }; }
  load(json) { if (json?.width) { this.width = this.canvas.width = json.width; this.height = this.canvas.height = json.height; } }
}

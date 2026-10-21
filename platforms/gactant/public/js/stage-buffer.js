// The stage's buffer: the game's side of the stage, in the sandbox. The stage itself is
// a frame surface (its canvas on the page, its clock, its input, its pad, its halts);
// what lives here is only what a game must touch at frame rate: the canvases it draws
// on, and a copy of the stage's clock and input.
//
// Every display frame the frame sends a tick (dt, t, frame, input). The buffer delivers
// stage.frame to the ludant's hooks, renders three.js if it's on, and sends back what
// was drawn as pictures, which the frame shows. Pictures don't carry code, so nothing the
// game runs reaches the page.
//
// Pictures go as ImageBitmaps (one per layer, handed over without copying) where the
// browser can pass them between the sandbox's process and the page's. Firefox with site
// isolation (Fission) silently drops them, so the frame checks with a probe when it starts
// and, if the probe doesn't arrive, asks for pixels instead: one layer, composited here,
// copied across as an ArrayBuffer.
//
// For game code, `api` is the handle it always was:
//   ctx, width, height, t, frame, size(w, h), caption, three(), image(name), images(),
//   input { keys, pressed, pointer, pads, players }
// The ludant's own surfaces.stage is local too, so its tools can test at full speed:
//   look() and advance() read and run this buffer directly; hold, release and point change
//   the input here and at the frame, so a held key holds both for a person and for an advance.

const MAX_W = 1920, MAX_H = 1080;

// The keyboard as a controller, for player 1. (Arrows or WASD are the d-pad and left
// stick; space, Z or Enter is A; X or Shift is B; C is X; V is Y; Q and E are the bumpers.)
const KEYPAD = {
  up: ['arrowup', 'w'], down: ['arrowdown', 's'], left: ['arrowleft', 'a'], right: ['arrowright', 'd'],
  a: [' ', 'z', 'enter'], b: ['x', 'shift'], x: ['c'], y: ['v'], lb: ['q'], rb: ['e'],
};

/** One controller-shaped player: { index, down, pressed, value: { lt, rt }, left, right }. */
function keyboardPlayer(keys, pressed) {
  const down = {}, now = {};
  for (const [button, ks] of Object.entries(KEYPAD)) {
    if (ks.some((k) => keys.has(k))) down[button] = true;
    if (ks.some((k) => pressed.has(k))) now[button] = true;
  }
  const left = { x: (down.right ? 1 : 0) - (down.left ? 1 : 0), y: (down.down ? 1 : 0) - (down.up ? 1 : 0) };
  return { index: 0, from: 'keyboard', down, pressed: now, value: { lt: 0, rt: 0 }, left, right: { x: 0, y: 0 } };
}

const bigger = (a, b) => (Math.abs(b) > Math.abs(a) ? b : a);
function merge(kb, pad) {
  if (!pad) return kb;
  return {
    index: 0, from: 'keyboard+pad',
    down: { ...kb.down, ...pad.down }, pressed: { ...kb.pressed, ...pad.pressed },
    value: { lt: Math.max(kb.value.lt, pad.value?.lt ?? 0), rt: Math.max(kb.value.rt, pad.value?.rt ?? 0) },
    left: { x: bigger(kb.left.x, pad.left.x), y: bigger(kb.left.y, pad.left.y) }, right: pad.right,
  };
}

export class StageBuffer {
  constructor({ bus, libs, frame }) {
    this.bus = bus;
    this.libs = libs;
    this.frame = frame;   // the bridge, once there is one
    this.width = 640; this.height = 360;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width; this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d');
    this.glCanvas = null;   // made the first time a game asks for three()
    this.gl = null;         // { renderer, scene, camera, active }
    this.input = { keys: new Set(), pressed: new Set(), pointer: { x: 0, y: 0, down: false, clicked: false }, pads: [] };
    // Players: what most games want. Player 1 is the keyboard and the first controller;
    // players 2… are the other controllers. Worked out on each read, so a key the ludant
    // holds during an advance counts too.
    const input = this.input;
    Object.defineProperty(input, 'players', {
      enumerable: true,
      get() {
        const pads = input.pads.map((p, i) => ({ ...p, index: i }));
        return [merge(keyboardPlayer(input.keys, input.pressed), pads[0]), ...pads.slice(1)];
      },
    });
    this.t = 0; this.count = 0; this.fps = 0;
    this.halted = null;
    this.caption = '';
    this.sending = false;
    this.pixels = false;    // send raw pixels instead of ImageBitmaps (see above)
    this.images = new Map(); // art by name, as ImageBitmaps (see the art surface)
    this.waiters = [];       // { until, resolve }: waits counted in game time
    const stage = this;
    this.api = {
      ctx: this.ctx, input: this.input,
      get width() { return stage.width; }, get height() { return stage.height; },
      get t() { return stage.t; }, get frame() { return stage.count; },
      size: (w, h) => this.size(w, h),
      three: () => this.three(),
      image: (name) => this.images.get(String(name)) ?? null,
      images: () => [...this.images.keys()],
      get caption() { return stage.caption; }, set caption(v) { stage.caption = String(v ?? '').slice(0, 300); },
    };
    // A hook that throws during a frame halts the stage: a game that throws on every frame
    // is broken, not unlucky. The frame shows the halt and tells everyone.
    bus.on('frame.error', (e) => { if (e.during === 'stage.frame' && !this.halted) this.halt(e.message); }, 'stage');
  }

  // ---------- driven by the frame ----------

  /** One display frame: the frame's clock and input, then the game runs and is shown. */
  tick({ dt, t, frame, fps, input }) {
    this.t = t; this.count = frame; this.fps = fps;
    this.take(input);
    if (!this.halted) {
      this.bus.emit('stage.frame', { dt, t, frame });
      this.render3d();
    }
    this.input.pressed.clear();
    this.input.pointer.clicked = false;
    for (const pad of this.input.pads) pad.pressed = {};
    this.wakeWaiters();
    return this.show();
  }

  take(input) {
    if (!input) return;
    this.input.keys.clear(); for (const k of input.keys) this.input.keys.add(k);
    for (const k of input.pressed) this.input.pressed.add(k);
    Object.assign(this.input.pointer, input.pointer);
    this.input.pads = (input.pads ?? []).map((p) => ({ id: p.id, down: p.down ?? {}, pressed: p.pressed ?? {}, value: p.value ?? { lt: 0, rt: 0 }, left: p.left ?? { x: 0, y: 0 }, right: p.right ?? { x: 0, y: 0 } }));
  }

  /** Send what was drawn to the frame, as pictures. One at a time: a slow game shows at the
   *  rate it can draw rather than piling up frames behind it. */
  async show() {
    if (!this.frame) return;
    if (this.sending) { this.again = true; return; }
    this.sending = true;
    try {
      const three = Boolean(this.gl?.active);
      if (this.pixels) {
        const { data, width, height } = this.composite();
        this.frame.sendWith([data.buffer], 'frame', { pixels: data.buffer, width, height, caption: this.caption, three });
      } else {
        const layers = [];
        if (three) layers.push(await createImageBitmap(this.glCanvas));
        layers.push(await createImageBitmap(this.canvas));
        this.frame.sendWith(layers, 'frame', { layers, caption: this.caption, three });
      }
    } catch (err) {
      // Said once, where people can see it: a stage that can't show its game looks dead.
      if (!this.pictureFault) { this.pictureFault = true; this.frame.send('note', 'fault', `the game's picture couldn't be sent to the stage: ${err?.message ?? err}`); }
    } finally {
      this.sending = false;
    }
    if (this.again) { this.again = false; this.show(); }
  }

  /** A picture of the ludant's art, ready for drawImage (or a three.js texture). */
  async addImage(name, bytes, type) {
    try { this.images.set(name, await createImageBitmap(new Blob([bytes], { type }))); }
    catch (err) { this.frame?.send('note', 'fault', `the art "${name}" couldn't be read: ${err.message}`); }
  }

  /** Both layers as one picture's pixels. */
  composite() {
    const c = this.flat ??= document.createElement('canvas');
    if (c.width !== this.width || c.height !== this.height) { c.width = this.width; c.height = this.height; this.flatCtx = null; }
    const g = this.flatCtx ??= c.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, c.width, c.height);
    if (this.gl?.active) g.drawImage(this.glCanvas, 0, 0);
    g.drawImage(this.canvas, 0, 0);
    return g.getImageData(0, 0, c.width, c.height);
  }

  /** A small picture, for the frame to see whether pictures reach it at all. */
  async probe() {
    const c = document.createElement('canvas'); c.width = 4; c.height = 4;
    const b = await createImageBitmap(c);
    this.frame.sendWith([b], 'probe', b);
  }

  /** The frame cleared a halt (someone pressed restart). */
  restarted() {
    this.halted = null;
    this.bus.errors.clear();
    this.t = 0; this.count = 0;
  }

  /** Clear a halt from this side (a rebuilt game, or the ludant asking), and tell the frame. */
  restart() {
    this.restarted();
    this.frame?.send('restart');
    return { running: true };
  }

  // ---------- the game's handle ----------

  size(w, h) {
    w = Math.max(16, Math.min(MAX_W, Math.round(w))); h = Math.max(16, Math.min(MAX_H, Math.round(h)));
    if (w === this.width && h === this.height) return;
    this.width = this.canvas.width = w;
    this.height = this.canvas.height = h;
    if (this.glCanvas) { this.glCanvas.width = w; this.glCanvas.height = h; }
    if (this.gl) {
      this.gl.renderer.setSize(w, h, false);
      if (this.gl.camera?.isPerspectiveCamera) { this.gl.camera.aspect = w / h; this.gl.camera.updateProjectionMatrix(); }
    }
    this.frame?.send('size', w, h);
  }

  /** Switch on the WebGL layer: a fresh scene and camera, the same renderer. */
  three() {
    const THREE = this.libs?.THREE;
    if (!THREE) throw new Error('three.js is not available in this frame');
    if (!this.gl) {
      this.glCanvas = document.createElement('canvas');
      this.glCanvas.width = this.width; this.glCanvas.height = this.height;
      const renderer = new THREE.WebGLRenderer({ canvas: this.glCanvas, antialias: false, preserveDrawingBuffer: true });
      this.gl = { renderer };
    }
    const { renderer } = this.gl;
    renderer.setSize(this.width, this.height, false);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, this.width / this.height, 0.1, 2000);
    camera.position.set(0, 2, 6);
    camera.lookAt(0, 0, 0);
    Object.assign(this.gl, { scene, camera, active: true });
    this.ctx.clearRect(0, 0, this.width, this.height);
    const gl = this.gl;
    return { THREE, scene, renderer, get camera() { return gl.camera; }, set camera(c) { gl.camera = c; } };
  }

  /** Before a game is (re)built: back to plain 2D until it asks for three() again. */
  beginGame() {
    if (this.gl) { this.gl.active = false; this.gl.scene = null; }
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  render3d() {
    const gl = this.gl;
    if (!gl?.active || !gl.scene || !gl.camera || this.halted) return;
    try { gl.renderer.render(gl.scene, gl.camera); }
    catch (err) { this.halt(`three.js render: ${err.message}`); }
  }

  halt(message) {
    this.halted = message;
    this.frame?.send('halt', message);
  }

  // ---------- the ludant's own stage actions, here beside the game ----------

  actions() {
    const wait = (ms) => this.gameTime(Math.max(0, Math.min(10000, ms)));
    const key = (k) => String(k).toLowerCase();
    return {
      look: () => this.look(),
      restart: () => this.restart(),
      hold: (k) => this.hold(key(k)),
      release: (k) => this.release(key(k)),
      press: async (k, ms = 100) => { this.hold(key(k)); await wait(ms); this.release(key(k)); return { pressed: key(k), ms }; },
      point: (x, y, down) => {
        const p = this.input.pointer;
        p.x = x; p.y = y;
        if (down === true && !p.down) { p.down = true; p.clicked = true; }
        if (down === false) p.down = false;
        this.frame?.send('input', 'point', [x, y, down]);
        return { x, y, down: p.down };
      },
      wait: async (ms) => { await wait(ms); return { waited: ms }; },
      advance: (seconds) => this.advance(seconds),
    };
  }

  /** Wait this many ms of game time: frames, not the clock on the wall. A browser that slows
   *  a hidden page's timers would otherwise stretch "press for 100 ms" into seconds. If the
   *  stage isn't running (halted, or paused with nobody there), the wall clock stands in. */
  gameTime(ms) {
    const until = this.t + ms / 1000;
    return new Promise((resolve) => {
      const w = { until, resolve };
      this.waiters.push(w);
      // Answered by the frame that reaches it (see tick); this is only for no frames at all.
      setTimeout(() => { const i = this.waiters.indexOf(w); if (i >= 0) { this.waiters.splice(i, 1); resolve(); } }, ms + 1500);
    });
  }

  /** Waits whose game time has come. */
  wakeWaiters() {
    if (!this.waiters.length) return;
    const due = this.waiters.filter((w) => this.t >= w.until);
    this.waiters = this.waiters.filter((w) => this.t < w.until);
    for (const w of due) w.resolve();
  }

  hold(k) {
    if (!this.input.keys.has(k)) this.input.pressed.add(k);
    this.input.keys.add(k);
    this.frame?.send('input', 'hold', [k]);
    return { held: [...this.input.keys] };
  }

  release(k) {
    this.input.keys.delete(k);
    this.frame?.send('input', 'release', [k]);
    return { held: [...this.input.keys] };
  }

  /** Fast-forward: frames back to back with a fixed step, here and now. Input stays as it
   *  is, so held keys stay held. Stops early if the game halts. The frame's clock follows. */
  advance(seconds) {
    const dt = 1 / 60, n = Math.round(Math.max(0, Math.min(120, Number(seconds) || 0)) / dt);
    let i = 0;
    for (; i < n && !this.halted; i++) {
      this.t += dt; this.count++;
      this.bus.emit('stage.frame', { dt, t: this.t, frame: this.count });
      this.input.pressed.clear();
      this.input.pointer.clicked = false;
      for (const pad of this.input.pads) pad.pressed = {};
    }
    this.render3d();
    this.frame?.send('advanced', this.t, this.count);
    this.show();
    return { advanced: +(i * dt).toFixed(2), halted: this.halted };
  }

  describe() {
    const state = this.halted ? `HALTED by an error: ${this.halted}` : `running at ${Math.round(this.fps)} fps`;
    const mode = this.gl?.active ? ' It is drawing in 3D now (three.js under a 2D overlay).' : '';
    return `stage: a ${this.width}×${this.height} canvas with a frame clock and keyboard/pointer input, ${state}. People on touch screens get an on-screen pad that presses the arrow keys and space, so games should be playable with those (or the pointer) alone. Anyone in the frame can give it input as a player would (actions: press(key, ms), hold(key), release(key), point(x, y, down), wait(ms), advance(seconds), look(), restart()). A game can draw in 2D (ctx) or in 3D with three.js (stage.three()), with ctx as a HUD on top.${mode}`;
  }

  /** A picture of what the game has drawn, from the buffer itself. */
  look() {
    const k = Math.max(1, Math.floor(640 / this.width));
    const c = document.createElement('canvas');
    c.width = this.width * k; c.height = this.height * k;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    if (this.gl?.active) g.drawImage(this.glCanvas, 0, 0, c.width, c.height);
    g.drawImage(this.canvas, 0, 0, c.width, c.height);
    const moment = ` This look is at game time ${this.t.toFixed(1)} s (frame ${this.count}).${this.caption ? ` Caption: "${this.caption}"` : ' No caption is set.'}`;
    return { text: `${this.describe()}${moment}${k > 1 ? ` (This picture is enlarged ${k}× so pixels are clear; coordinates are still stage coordinates, ${this.width}×${this.height}.)` : ''}`, image: c.toDataURL('image/png') };
  }
}

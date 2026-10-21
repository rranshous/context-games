// The stage's buffer: the game's side of the stage, in the sandbox. The stage itself is
// a frame surface (its canvas on the page, its clock, its input, its pad, its halts);
// what lives here is only what a game must touch at frame rate: the canvases it draws
// on, and a copy of the stage's clock and input.
//
// Every display frame the frame sends a tick (dt, t, frame, input). The buffer delivers
// stage.frame to the ludant's hooks, renders three.js if it's on, and sends back what
// was drawn as pictures (ImageBitmaps), which the frame shows. Pictures don't carry code,
// so nothing the game runs reaches the page.
//
// For game code, `api` is the handle it always was:
//   ctx, width, height, t, frame, size(w, h), caption, input { keys, pressed, pointer }, three()
// The ludant's own surfaces.stage is local too, so its tools can test at full speed:
//   look() and advance() read and run this buffer directly; hold, release and point change
//   the input here and at the frame, so a held key holds both for a person and for an advance.

const MAX_W = 1920, MAX_H = 1080;

export class StageBuffer {
  constructor({ bus, libs, frame }) {
    this.bus = bus;
    this.libs = libs;
    this.frame = frame;   // the bridge, once there is one
    this.width = 320; this.height = 240;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width; this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d');
    this.glCanvas = null;   // made the first time a game asks for three()
    this.gl = null;         // { renderer, scene, camera, active }
    this.input = { keys: new Set(), pressed: new Set(), pointer: { x: 0, y: 0, down: false, clicked: false } };
    this.t = 0; this.count = 0; this.fps = 0;
    this.halted = null;
    this.caption = '';
    this.sending = false;
    const stage = this;
    this.api = {
      ctx: this.ctx, input: this.input,
      get width() { return stage.width; }, get height() { return stage.height; },
      get t() { return stage.t; }, get frame() { return stage.count; },
      size: (w, h) => this.size(w, h),
      three: () => this.three(),
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
    return this.show();
  }

  take(input) {
    if (!input) return;
    this.input.keys.clear(); for (const k of input.keys) this.input.keys.add(k);
    for (const k of input.pressed) this.input.pressed.add(k);
    Object.assign(this.input.pointer, input.pointer);
  }

  /** Send what was drawn to the frame, as pictures. One at a time: a slow game shows at the
   *  rate it can draw rather than piling up frames behind it. */
  async show() {
    if (!this.frame) return;
    if (this.sending) { this.again = true; return; }
    this.sending = true;
    try {
      const layers = [];
      if (this.gl?.active) layers.push(await createImageBitmap(this.glCanvas));
      layers.push(await createImageBitmap(this.canvas));
      this.frame.sendWith(layers, 'frame', { layers, caption: this.caption, three: Boolean(this.gl?.active) });
    } catch (err) {
      console.warn('[stage] could not send the picture', err);
    } finally {
      this.sending = false;
    }
    if (this.again) { this.again = false; this.show(); }
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
    const wait = (ms) => new Promise((r) => setTimeout(r, Math.max(0, Math.min(10000, ms))));
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

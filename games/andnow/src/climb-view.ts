// The Climb's viewer: a camera over the tall world (drag to pan, wheel to zoom, keys), a
// minimap strip with each step sized by the square root of its height (so the thin start
// band still shows beside the 2000-row steps), step labels with what each needs, and bodies coloured by their
// chemistry. Pixel art: one pixel per cell, scaled up crisp.
import { genomeOf } from './sim/dish';
import { CONFIG, DEBRIS, World } from './sim/world';

type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Far enough out to see the whole world at once (below 1 px per cell the view samples). */
const MIN_ZOOM = 0.05;

export interface Camera { x: number; y: number; zoom: number } // top-left cell, px per cell

/** Colour for a body: hunters (meat) red, insulated cool, armored warm, plain grazers pale. */
export function bodyColor(world: World, id: number): RGB {
  const t = world.warriors[id].traits;
  if (!t) return [230, 230, 230];
  if (t.meat && !t.plants) return mix([200, 40, 60], [255, 120, 160], Math.min(1, (t.bite - 1) / 3));
  if (t.meat) return [230, 90, 200]; // eats both
  if (t.insulation > t.armor) return mix([140, 220, 255], [40, 110, 255], Math.min(1, (t.insulation - 1) / 3));
  if (t.armor > t.insulation) return mix([255, 210, 110], [255, 110, 40], Math.min(1, (t.armor - 1) / 3));
  return [235, 235, 225];
}

export class ClimbView {
  cam: Camera;
  private pix = document.createElement('canvas');
  private pctx = this.pix.getContext('2d')!;
  private drag: { x: number; y: number; cx: number; cy: number } | null = null;
  /** A body the camera follows and outlines (dragging the view lets go of it). */
  follow: number | null = null;
  /** A body picked by tapping it: outlined cell by cell, everything else dimmed (no camera move). */
  selected: number | null = null;

  constructor(private canvas: HTMLCanvasElement, private mini: HTMLCanvasElement, private world: () => World, private redraw: () => void, cam?: Camera) {
    const w = world();
    this.cam = cam ?? { x: 0, y: 0, zoom: 3 };
    this.seenShift = w.yShift ?? 0;
    if (!cam) this.centerOn(w.w / 2, w.board.seaLevel ?? 0); else this.clamp();
    // Pointer events cover mouse and touch: one pointer drags, two pinch to zoom.
    canvas.style.touchAction = 'none';
    const pts = new Map<number, { x: number; y: number }>();
    let pinch: { d: number; zoom: number; wx: number; wy: number } | null = null;
    let tap: { x: number; y: number } | null = null; // where a press began, until it moves enough to be a drag
    const spread = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { this.drag = { x: e.clientX, y: e.clientY, cx: this.cam.x, cy: this.cam.y }; tap = { x: e.clientX, y: e.clientY }; }
      else if (pts.size === 2) {
        const r = canvas.getBoundingClientRect(), [a, b] = [...pts.values()];
        const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
        pinch = { d: spread(), zoom: this.cam.zoom, wx: this.cam.x + mx / this.cam.zoom, wy: this.cam.y + my / this.cam.zoom };
        this.drag = null;
        tap = null;
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size === 2) {
        const r = canvas.getBoundingClientRect(), [a, b] = [...pts.values()];
        const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
        this.cam.zoom = Math.max(MIN_ZOOM, Math.min(12, pinch.zoom * spread() / Math.max(1, pinch.d)));
        this.cam.x = pinch.wx - mx / this.cam.zoom; this.cam.y = pinch.wy - my / this.cam.zoom;
      } else if (this.drag) {
        if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 5) return; // (a tap's jitter isn't a drag)
        tap = null;
        this.follow = null;
        this.cam.x = this.drag.cx - (e.clientX - this.drag.x) / this.cam.zoom;
        this.cam.y = this.drag.cy - (e.clientY - this.drag.y) / this.cam.zoom;
      } else return;
      this.clamp(); this.redraw();
    });
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (tap && e.type === 'pointerup' && !pts.size) {
        const r = canvas.getBoundingClientRect();
        this.select(...this.cellAt(e.clientX - r.left, e.clientY - r.top));
      }
      tap = null;
      pinch = null;
      const rest = [...pts.values()][0];
      this.drag = rest ? { x: rest.x, y: rest.y, cx: this.cam.x, cy: this.cam.y } : null;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    // The wheel anywhere on the stage (board, minimap, timeline, the borders between) zooms and
    // never scrolls the page: around the pointer over the board, else around the view's middle.
    (canvas.parentElement ?? canvas).addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect(), over = e.target === canvas;
      const mx = over ? e.clientX - r.left : canvas.width / 2, my = over ? e.clientY - r.top : canvas.height / 2;
      const wx = this.cam.x + mx / this.cam.zoom, wy = this.cam.y + my / this.cam.zoom;
      // Gentle, and in proportion to the scroll: a wheel notch (~100) is ×1.1, and a trackpad's
      // stream of small deltas glides instead of every event jumping ×1.25.
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      this.cam.zoom = Math.max(MIN_ZOOM, Math.min(12, this.cam.zoom * Math.exp(-Math.max(-100, Math.min(100, dy)) * 0.001)));
      this.cam.x = wx - mx / this.cam.zoom; this.cam.y = wy - my / this.cam.zoom;
      this.clamp(); this.redraw();
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const s = 40 / this.cam.zoom * 4;
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') this.cam.x -= s;
      else if (k === 'arrowright' || k === 'd') this.cam.x += s;
      else if (k === 'arrowup' || k === 'w') this.cam.y -= s;
      else if (k === 'arrowdown' || k === 's') this.cam.y += s;
      else if (k === '+' || k === '=') this.cam.zoom = Math.min(12, this.cam.zoom * 1.25);
      else if (k === '-') this.cam.zoom = Math.max(MIN_ZOOM, this.cam.zoom * 0.8);
      else return;
      e.preventDefault(); this.clamp(); this.redraw();
    });
    mini.addEventListener('click', (e) => {
      const r = mini.getBoundingClientRect();
      const y = this.miniToRow(e.clientY - r.top), x = ((e.clientX - r.left) / mini.width) * this.world().w;
      this.centerOn(x, y); this.redraw();
    });
  }

  /** Viewport size in cells. */
  get viewW() { return this.canvas.width / this.cam.zoom; }
  get viewH() { return this.canvas.height / this.cam.zoom; }

  /** Follow a body: zoom so it fits comfortably, centre on it, outline it. */
  focus(id: number) {
    const world = this.world(), cells = world.cellsOf(id);
    if (!cells.length) return;
    const xs = cells.map((c) => c % world.w), ys = cells.map((c) => (c / world.w) | 0);
    const bw = Math.max(...xs) - Math.min(...xs) + 1, bh = Math.max(...ys) - Math.min(...ys) + 1;
    this.cam.zoom = Math.max(1, Math.min(8, Math.min(this.canvas.width / (bw + 30), this.canvas.height / (bh + 30))));
    this.follow = id;
    this.selected = id;
    this.snap = true;
    this.goal = null;
    this.redraw();
  }

  /** Keep a followed body in view; let go once it's dead. */
  private track() {
    if (this.follow === null) return;
    const wr = this.world().warriors[this.follow];
    if (!wr?.alive) { this.follow = null; return; }
    // The body's middle, not its IP (which runs all over it). A body's middle wobbles as it
    // grows and loses cells at its ends, so the camera only picks a new spot once the middle
    // has wandered a way off (hysteresis), then glides there and stops on a whole pixel.
    const world = this.world(), cells = world.cellsOf(this.follow);
    if (!cells.length) return;
    let sx = 0, sy = 0;
    for (const c of cells) { sx += c % world.w; sy += (c / world.w) | 0; }
    const mx = sx / cells.length + 0.5, my = sy / cells.length + 0.5;
    const slack = Math.max(3, Math.min(this.viewW, this.viewH) * 0.12);
    if (this.snap || !this.goal || Math.abs(mx - this.goal.x) > slack || Math.abs(my - this.goal.y) > slack) this.goal = { x: mx, y: my };
    const z = this.cam.zoom, x = this.goal.x - this.viewW / 2, y = this.goal.y - this.viewH / 2;
    const now = performance.now(), k = this.snap ? 1 : 1 - Math.exp(-(now - this.lastTrack) / 250);
    this.snap = false;
    this.lastTrack = now;
    // (each step at least a pixel, so whole-pixel rounding can't stall it short of the goal)
    const step = (d: number) => { const m = d * k; return Math.abs(m * z) >= 1 ? m : Math.sign(d) * Math.min(Math.abs(d), 1 / z); };
    const cx = this.cam.x, cy = this.cam.y;
    this.cam.x = Math.round((cx + step(x - cx)) * z) / z; // (whole screen pixels: no shimmer)
    this.cam.y = Math.round((cy + step(y - cy)) * z) / z;
    this.clamp();
    this.gliding = this.cam.x !== cx || this.cam.y !== cy;
  }
  private snap = false; // (the first look at a newly followed body jumps there)
  private lastTrack = 0;
  private goal: { x: number; y: number } | null = null;
  private seenShift = 0; // (the world's yShift the camera was last placed under)
  /** The camera is still easing toward a followed body: worth another frame even when paused. */
  gliding = false;

  /** Tap: pick the body at (or within a cell of) this cell; tapping nothing, or it again, lets go. */
  select(x: number, y: number) {
    const world = this.world();
    let id: number | null = null;
    for (let d = 0; d <= 1 && id === null; d++) for (let dy = -d; dy <= d && id === null; dy++) for (let dx = -d; dx <= d; dx++) {
      if (x + dx < 0 || y + dy < 0 || x + dx >= world.w || y + dy >= world.h) continue;
      const o = world.owner[world.idx(x + dx, y + dy)];
      if (o >= 0 && world.warriors[o]?.alive) { id = o; break; }
    }
    this.selected = id === this.selected ? null : id;
    this.redraw();
  }

  /**
   * The picked body: dim everything else and trace its true edge (the sides of its cells
   * that don't touch another of its cells), so a body pressed against another stands apart.
   */
  private renderSelected() {
    if (this.selected !== null && !this.world().warriors[this.selected]?.alive) this.selected = null;
    if (this.selected === null) return;
    const world = this.world(), id = this.selected, cells = world.cellsOf(id), z = this.cam.zoom, W = world.w;
    if (!cells.length) return;
    const ctx = this.canvas.getContext('2d')!, X = (x: number) => Math.round((x - this.cam.x) * z), Y = (y: number) => Math.round((y - this.cam.y) * z);
    const shade = new Path2D(), edge = new Path2D();
    shade.rect(0, 0, this.canvas.width, this.canvas.height);
    const mine = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < world.h && world.owner[y * W + x] === id;
    for (const c of cells) {
      const x = c % W, y = (c / W) | 0, x0 = X(x), y0 = Y(y), x1 = X(x + 1), y1 = Y(y + 1);
      shade.rect(x0, y0, x1 - x0, y1 - y0);
      if (!mine(x, y - 1)) { edge.moveTo(x0, y0); edge.lineTo(x1, y0); }
      if (!mine(x, y + 1)) { edge.moveTo(x0, y1); edge.lineTo(x1, y1); }
      if (!mine(x - 1, y)) { edge.moveTo(x0, y0); edge.lineTo(x0, y1); }
      if (!mine(x + 1, y)) { edge.moveTo(x1, y0); edge.lineTo(x1, y1); }
    }
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fill(shade, 'evenodd');
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = z >= 4 ? 2 : 1;
    ctx.stroke(edge);
    ctx.restore();
  }

  /** The followed body's outline. */
  private renderMark() {
    this.renderSelected();
    if (this.follow === null) return;
    const world = this.world(), cells = world.cellsOf(this.follow);
    if (!cells.length) return;
    const xs = cells.map((c) => c % world.w), ys = cells.map((c) => (c / world.w) | 0), z = this.cam.zoom;
    const x0 = (Math.min(...xs) - this.cam.x) * z, y0 = (Math.min(...ys) - this.cam.y) * z;
    const x1 = (Math.max(...xs) + 1 - this.cam.x) * z, y1 = (Math.max(...ys) + 1 - this.cam.y) * z;
    const ctx = this.canvas.getContext('2d')!, pad = 4;
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad);
    ctx.restore();
  }

  centerOn(x: number, y: number) { this.cam.x = x - this.viewW / 2; this.cam.y = y - this.viewH / 2; this.clamp(); }

  private clamp() {
    const w = this.world();
    // (A view bigger than the world is centred on it.)
    this.cam.x = this.viewW >= w.w ? (w.w - this.viewW) / 2 : Math.max(0, Math.min(w.w - this.viewW, this.cam.x));
    this.cam.y = this.viewH >= w.h ? (w.h - this.viewH) / 2 : Math.max(0, Math.min(w.h - this.viewH, this.cam.y));
  }

  /** Board cell under a canvas pixel. */
  cellAt(px: number, py: number): [number, number] { return [Math.floor(this.cam.x + px / this.cam.zoom), Math.floor(this.cam.y + py / this.cam.zoom)]; }

  // ---------- the minimap: each step sized by the square root of its height ----------

  /** Minimap sections, top to bottom, each sized by the square root of its step's height (step 0 small but visible). */
  private sections() {
    const b = this.world().board, Hi = b.stepHi!, Lo = b.stepLo!, n = Hi - Lo + 1, H = this.mini.height;
    const weights = Array.from({ length: n }, (_, k) => Math.sqrt(b.stepH![Hi - k - Lo]));
    const total = weights.reduce((a, c) => a + c, 0);
    let y = 0;
    return weights.map((wt, k) => {
      const y0 = y;
      y += (wt / total) * H;
      return { step: Hi - k, top: b.stepTop![Hi - k - Lo], h: b.stepH![Hi - k - Lo], y0, y1: y };
    });
  }
  private rowToMini(row: number) {
    for (const s of this.sections()) if (row >= s.top && row < s.top + s.h) return s.y0 + ((row - s.top) / s.h) * (s.y1 - s.y0);
    return this.mini.height;
  }
  private miniToRow(y: number) {
    for (const s of this.sections()) if (y >= s.y0 && y < s.y1) return s.top + ((y - s.y0) / (s.y1 - s.y0)) * s.h;
    return 0;
  }

  // ---------- drawing ----------

  /** Background colour of an empty floor cell: air bluer then violet the higher, water darker the deeper. */
  private sky(step: number, row: number): RGB {
    const b = this.world().board, sea = b.seaLevel ?? 0;
    if (step > 0) return mix([150, 200, 240], [40, 20, 80], Math.min(1, (step - 1 + this.frac(step, row)) / Math.max(2, b.stepHi!)));
    if (step < 0) return mix([30, 110, 160], [4, 8, 30], Math.min(1, (-step - 1 + this.frac(step, row)) / Math.max(2, -b.stepLo!)));
    return row < sea ? [170, 215, 245] : [50, 140, 190];
  }
  /** How far through its step a row is (0 at the edge toward step 0, 1 at the far edge). */
  private frac(step: number, row: number) {
    const b = this.world().board, Lo = b.stepLo!, top = b.stepTop![step - Lo], h = b.stepH![step - Lo];
    const f = (row - top) / h;
    return step > 0 ? 1 - f : f;
  }

  /**
   * Zoomed out below 1 px per cell: one sample per screen pixel for the scenery (rock, sky,
   * water, plants), then every body drawn on top as a dot at its IP, so none vanish.
   */
  private renderFar() {
    const world = this.world(), b = world.board, st = b.step!, z = this.cam.zoom;
    const W = this.canvas.width, H = this.canvas.height;
    const ctx = this.canvas.getContext('2d')!;
    const img = ctx.createImageData(W, H), d = img.data;
    for (let py = 0; py < H; py++) {
      const y = Math.floor(this.cam.y + py / z);
      for (let px = 0; px < W; px++) {
        const x = Math.floor(this.cam.x + px / z), p = (py * W + px) * 4;
        if (x < 0 || y < 0 || x >= world.w || y >= world.h) { d[p + 3] = 255; continue; }
        const c = y * world.w + x;
        const col: RGB = b.terrain[c] !== 0 ? (st[c] > 0 ? [105, 95, 108] : st[c] < 0 ? [50, 42, 38] : [90, 80, 70])
          : world.resource[c] ? (st[c] > 0 ? [150, 220, 90] : [40, 150, 70]) : this.sky(st[c], y);
        d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255;
      }
    }
    const dot = Math.max(1, Math.round(z * 4));
    for (const wr of world.living()) {
      const px = Math.floor((wr.ipX - this.cam.x) * z), py = Math.floor((wr.ipY - this.cam.y) * z);
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const col = bodyColor(world, wr.id);
      for (let dy = 0; dy < dot && py + dy < H; dy++) for (let dx = 0; dx < dot && px + dx < W; dx++) {
        const p = ((py + dy) * W + px + dx) * 4;
        d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2];
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  render() {
    // Rows joined on above move everything down: keep the camera on the same spot.
    const shift = this.world().yShift ?? 0;
    if (shift !== this.seenShift) {
      this.cam.y += shift - this.seenShift;
      if (this.goal) this.goal.y += shift - this.seenShift;
      this.seenShift = shift;
    }
    this.track();
    if (this.cam.zoom < 1) { this.renderFar(); this.renderMark(); this.renderLabels(); this.renderMini(); return; }
    const world = this.world(), b = world.board, st = b.step!;
    const vw = Math.ceil(this.viewW) + 1, vh = Math.ceil(this.viewH) + 1, x0 = Math.floor(this.cam.x), y0 = Math.floor(this.cam.y);
    if (this.pix.width !== vw || this.pix.height !== vh) { this.pix.width = vw; this.pix.height = vh; }
    const img = this.pctx.createImageData(vw, vh), d = img.data;
    const colors = new Map<number, RGB>();
    const sea = b.seaLevel ?? -1;
    for (let j = 0; j < vh; j++) {
      const y = y0 + j;
      if (y >= world.h) break;
      for (let i = 0; i < vw; i++) {
        const x = x0 + i;
        if (x >= world.w) break;
        const c = y * world.w + x, o = world.owner[c];
        let col: RGB;
        if (b.terrain[c] !== 0) {
          const n = ((Math.imul(x * 73856093 ^ y * 19349663, 2654435761) >>> 0) % 100) / 100;
          col = st[c] > 0 ? mix([120, 110, 120], [90, 80, 95], n) : st[c] < 0 ? mix([60, 50, 45], [38, 32, 30], n) : [90, 80, 70];
        } else if (o >= 0) {
          let cc = colors.get(o);
          if (!cc) { cc = bodyColor(world, o); colors.set(o, cc); }
          const wo = world.warriors[o];
          col = c === wo.ipY * world.w + wo.ipX ? mix(cc, [0, 0, 0], 0.45) : cc;
        } else {
          col = this.sky(st[c], y);
          if (y === sea) col = mix(col, [255, 255, 255], 0.35);
          if (o === DEBRIS) col = mix(col, [170, 160, 150], 0.4);
          else if (world.resource[c]) {
            const r = Math.min(1, (world.ripe[c] - 1) / Math.max(1, CONFIG.foodRipeMax - 1));
            const fresh: RGB = st[c] > 0 ? [150, 220, 90] : [40, 150, 70];
            col = r < 0.5 ? mix(fresh, [110, 230, 100], r * 2) : mix([110, 230, 100], [255, 210, 60], (r - 0.5) * 2);
          }
        }
        const p = (j * vw + i) * 4;
        d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255;
      }
    }
    this.pctx.putImageData(img, 0, 0);
    const ctx = this.canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const z = this.cam.zoom;
    ctx.drawImage(this.pix, (x0 - this.cam.x) * z, (y0 - this.cam.y) * z, vw * z, vh * z);
    this.renderMark();
    this.renderLabels();
    this.renderMini();
  }

  /** Step boundary lines, each with a small label on its line at the right edge. */
  private renderLabels() {
    const b = this.world().board, z = this.cam.zoom, ctx = this.canvas.getContext('2d')!;
    // Step boundaries, each with a small label sitting on its line (not pinned over the view).
    const Lo = b.stepLo!, Hi = b.stepHi!;
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.textBaseline = 'bottom';
    const right = Math.min(this.canvas.width, (this.world().w - this.cam.x) * z); // the world's edges on screen
    const left = Math.max(0, -this.cam.x * z);
    let lastY = -1e9;
    for (let n = Hi; n >= Lo; n--) {
      const bottomRow = b.stepTop![n - Lo] + b.stepH![n - Lo], sy = (bottomRow - this.cam.y) * z; // the line below step n
      if (sy < 12 || sy > this.canvas.height + 12) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(left, sy, right - left, 1);
      if (sy - lastY < 30) continue; // (zoomed far out, thin steps' labels would pile up)
      lastY = sy;
      const short = this.canvas.width < 600;
      const below = n - 1, label = (k: number) => short
        ? (k > 0 ? `+${k} · ${k} insul` : k < 0 ? `${k} · ${-k} armor` : '0 · sea')
        : (k > 0 ? `+${k} · ${k} insulation · food ×${10 ** k}` : k < 0 ? `${k} · ${-k} armor · food ×${10 ** -k}` : '0 · sea level');
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      // The ▼ label for the step below, unless its own line comes right after (then that line's ▲ says it).
      const nextLine = below >= Lo ? (b.stepTop![below - Lo] + b.stepH![below - Lo] - this.cam.y) * z : Infinity;
      const t1 = `▲ ${label(n)}`, t2 = below >= Lo && nextLine - sy >= 30 ? `▼ ${label(below)}` : '';
      const w1 = ctx.measureText(t1).width, w2 = ctx.measureText(t2).width, x = right - Math.max(w1, w2) - 14;
      ctx.fillRect(x - 3, sy - 13, w1 + 6, 13);
      if (t2) ctx.fillRect(x - 3, sy + 1, w2 + 6, 13);
      ctx.fillStyle = n > 0 ? '#bfe6ff' : n < 0 ? '#ffd9a0' : '#ffffff';
      ctx.fillText(t1, x, sy - 1);
      if (t2) { ctx.fillStyle = below > 0 ? '#bfe6ff' : below < 0 ? '#ffd9a0' : '#ffffff'; ctx.textBaseline = 'top'; ctx.fillText(t2, x, sy + 2); ctx.textBaseline = 'bottom'; }
    }
  }

  /** The minimap: life density per bin over the step-normalized strip, plus the camera's box. */
  private renderMini() {
    const world = this.world(), m = this.mini, ctx = m.getContext('2d')!, W = m.width, H = m.height;
    const secs = this.sections();
    for (const s of secs) {
      const c = this.sky(s.step, s.top + s.h / 2);
      ctx.fillStyle = `rgb(${c.map((v) => v * 0.55).join(',')})`;
      ctx.fillRect(0, s.y0, W, s.y1 - s.y0);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(0, s.y0, W, 1);
      ctx.fillStyle = '#ddd';
      ctx.font = '11px ui-monospace, Menlo, monospace';
      ctx.textBaseline = 'top';
      ctx.fillText(s.step > 0 ? `+${s.step}` : String(s.step), 3, s.y0 + 2);
    }
    // Bodies: a dot per body at its IP, coloured by chemistry.
    for (const wr of world.living()) {
      const c = bodyColor(world, wr.id);
      ctx.fillStyle = `rgb(${c.join(',')})`;
      ctx.fillRect((wr.ipX / world.w) * W, this.rowToMini(wr.ipY), 2, 2);
    }
    // The camera's view.
    const y0 = this.rowToMini(this.cam.y), y1 = this.rowToMini(Math.min(world.h - 1, this.cam.y + this.viewH));
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect((this.cam.x / world.w) * W + 0.5, y0 + 0.5, Math.max(2, (this.viewW / world.w) * W), Math.max(2, y1 - y0));
  }

  /** Side panel: population by step, chemistry, diets, top genomes, deaths, active tiles. */
  panel(esc: (s: string) => string): string {
    const world = this.world(), b = world.board, Hi = b.stepHi!, st = b.step!;
    const living = world.living();
    const by = new Array(Hi - b.stepLo! + 1).fill(0), arm = new Map<number, number>(), ins = new Map<number, number>();
    let plants = 0, meat = 0, both = 0, paceSum = 0;
    const counts = new Map<string, { n: number; id: number }>();
    for (const w of living) {
      by[Hi - st[w.ipY * world.w + w.ipX]]++;
      const t = w.traits;
      if (t) {
        arm.set(t.armor, (arm.get(t.armor) ?? 0) + 1);
        ins.set(t.insulation, (ins.get(t.insulation) ?? 0) + 1);
        if (t.plants && t.meat) both++; else if (t.meat) meat++; else if (t.plants) plants++;
        paceSum += t.pace;
      }
      const g = genomeOf(world, w.id, ' / ');
      const c = counts.get(g) ?? { n: 0, id: w.id };
      c.n++;
      counts.set(g, c);
    }
    const max = Math.max(1, ...by);
    const bars = by.map((n, k) => {
      const step = Hi - k;
      const c = this.sky(step, b.stepTop![step - b.stepLo!] + b.stepH![step - b.stepLo!] / 2);
      return `<div class="stats" style="display:flex;gap:6px;align-items:center"><span style="width:28px">${step > 0 ? `+${step}` : step}</span><span style="display:inline-block;height:9px;width:${Math.round((n / max) * 160)}px;background:rgb(${c.join(',')})"></span>${n}</div>`;
    }).join('');
    const hist = (m: Map<number, number>) => [...m.entries()].sort((a, c) => a[0] - c[0]).map(([k, n]) => `${k}: ${n}`).join(' · ');
    const deaths = new Map<string, number>();
    for (const [rk, n] of world.deaths) { const k = rk.slice(rk.indexOf('|') + 1).replace('core ', ''); deaths.set(k, (deaths.get(k) ?? 0) + n); }
    const tiles = world.tileStats();
    const top = [...counts.entries()].sort((a, c) => c[1].n - a[1].n).slice(0, 6);
    const css = (c: number[]) => `rgb(${c.join(',')})`;
    return `<div class="name">The Climb</div>
      <div class="stats">${living.length} alive · ${world.warriors.length} ever lived · pace ${living.length ? (paceSum / living.length).toFixed(2) : '-'} avg</div>
      <div class="stats">upkeep in ${tiles.active} of ${tiles.total} tiles (only near life)</div>
      <div class="name" style="margin-top:6px">by step</div>${bars}
      <div class="stats" style="margin-top:6px"><span style="color:#ffb46e">armor</span> ${hist(arm)}</div>
      <div class="stats"><span style="color:#8cd2ff">insulation</span> ${hist(ins)}</div>
      <div class="stats">diet: plants ${plants} · <span style="color:#ff6b8b">meat ${meat}</span> · <span style="color:#e65ac8">both ${both}</span></div>
      <div class="stats" title="a body's colour says what it eats and what it's made of">colours: <span style="color:#ff6b8b">■ meat</span> <span style="color:#e65ac8">■ both</span> · plants: <span style="color:#5aa8ff">■ insulated</span> <span style="color:#ff9a4a">■ armored</span> <span style="color:#ebebe1">■ plain</span></div>
      <div class="name" style="margin-top:6px">top genomes</div>
      ${top.map(([g, c]) => `<div class="genome"><span style="color:${css(bodyColor(world, c.id))}">${String(c.n).padStart(3)} ×</span> <code>${esc(g)}</code></div>`).join('')}
      <div class="stats" style="margin-top:6px">deaths: ${[...deaths.entries()].sort((a, c) => c[1] - a[1]).slice(0, 6).map(([k, n]) => `${esc(k)} ${n}`).join(' · ')}</div>
      <div class="stats" style="margin-top:6px;color:#6e7681">tap a body to pick it · drag to pan · pinch, wheel or +/- to zoom · WASD/arrows · tap the strip to jump</div>`;
  }
}

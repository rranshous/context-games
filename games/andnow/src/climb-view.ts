// The Climb's viewer: a camera over the tall world (drag to pan, wheel to zoom, keys), a
// minimap strip with every step given an equal share (so the thin start band shows beside
// the 2000-row steps), step labels with what each needs, and bodies coloured by their
// chemistry. Pixel art: one pixel per cell, scaled up crisp.
import { genomeOf } from './sim/dish';
import { CONFIG, DEBRIS, World } from './sim/world';

type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

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

  constructor(private canvas: HTMLCanvasElement, private mini: HTMLCanvasElement, private world: () => World, private redraw: () => void, cam?: Camera) {
    const w = world();
    this.cam = cam ?? { x: 0, y: 0, zoom: 3 };
    if (!cam) this.centerOn(w.w / 2, w.board.seaLevel ?? 0);
    // Pointer events cover mouse and touch: one pointer drags, two pinch to zoom.
    canvas.style.touchAction = 'none';
    const pts = new Map<number, { x: number; y: number }>();
    let pinch: { d: number; zoom: number; wx: number; wy: number } | null = null;
    const spread = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) this.drag = { x: e.clientX, y: e.clientY, cx: this.cam.x, cy: this.cam.y };
      else if (pts.size === 2) {
        const r = canvas.getBoundingClientRect(), [a, b] = [...pts.values()];
        const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
        pinch = { d: spread(), zoom: this.cam.zoom, wx: this.cam.x + mx / this.cam.zoom, wy: this.cam.y + my / this.cam.zoom };
        this.drag = null;
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size === 2) {
        const r = canvas.getBoundingClientRect(), [a, b] = [...pts.values()];
        const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
        this.cam.zoom = Math.max(1, Math.min(12, pinch.zoom * spread() / Math.max(1, pinch.d)));
        this.cam.x = pinch.wx - mx / this.cam.zoom; this.cam.y = pinch.wy - my / this.cam.zoom;
      } else if (this.drag) {
        this.cam.x = this.drag.cx - (e.clientX - this.drag.x) / this.cam.zoom;
        this.cam.y = this.drag.cy - (e.clientY - this.drag.y) / this.cam.zoom;
      } else return;
      this.clamp(); this.redraw();
    });
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      pinch = null;
      const rest = [...pts.values()][0];
      this.drag = rest ? { x: rest.x, y: rest.y, cx: this.cam.x, cy: this.cam.y } : null;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      const wx = this.cam.x + mx / this.cam.zoom, wy = this.cam.y + my / this.cam.zoom;
      this.cam.zoom = Math.max(1, Math.min(12, this.cam.zoom * (e.deltaY < 0 ? 1.25 : 0.8)));
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
      else if (k === '-') this.cam.zoom = Math.max(1, this.cam.zoom * 0.8);
      else return;
      e.preventDefault(); this.clamp(); this.redraw();
    });
    mini.addEventListener('click', (e) => {
      const r = mini.getBoundingClientRect();
      const y = this.miniToRow(e.clientY - r.top), x = ((e.clientX - r.left) / mini.width) * this.world().w;
      this.centerOn(x, y); this.redraw();
    });
  }

  /** Zoom by a factor around the middle of the view (the on-screen buttons). */
  zoomBy(f: number) {
    const wx = this.cam.x + this.viewW / 2, wy = this.cam.y + this.viewH / 2;
    this.cam.zoom = Math.max(1, Math.min(12, this.cam.zoom * f));
    this.centerOn(wx, wy);
    this.redraw();
  }

  /** Jump to the middle of a step (the on-screen buttons). */
  goToStep(n: number) {
    const b = this.world().board, S = b.climbSteps!;
    if (n < -S || n > S) return;
    const top = b.stepTop![n + S], h = b.stepH![n + S];
    // Near step 0's edge for the big steps (where life arrives first), the middle for step 0.
    this.centerOn(this.cam.x + this.viewW / 2, n === 0 ? top + h / 2 : n > 0 ? top + h - this.viewH / 2 : top + this.viewH / 2);
    this.redraw();
  }

  /** Viewport size in cells. */
  get viewW() { return this.canvas.width / this.cam.zoom; }
  get viewH() { return this.canvas.height / this.cam.zoom; }

  centerOn(x: number, y: number) { this.cam.x = x - this.viewW / 2; this.cam.y = y - this.viewH / 2; this.clamp(); }

  private clamp() {
    const w = this.world();
    this.cam.x = Math.max(0, Math.min(w.w - this.viewW, this.cam.x));
    this.cam.y = Math.max(0, Math.min(w.h - this.viewH, this.cam.y));
  }

  /** Board cell under a canvas pixel. */
  cellAt(px: number, py: number): [number, number] { return [Math.floor(this.cam.x + px / this.cam.zoom), Math.floor(this.cam.y + py / this.cam.zoom)]; }

  // ---------- the minimap: every step an equal share of the strip ----------

  private sections() {
    const b = this.world().board, S = b.climbSteps!, n = 2 * S + 1, H = this.mini.height;
    return Array.from({ length: n }, (_, k) => ({ step: S - k, top: b.stepTop![2 * S - k], h: b.stepH![2 * S - k], y0: (k * H) / n, y1: ((k + 1) * H) / n }));
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
    if (step > 0) return mix([150, 200, 240], [40, 20, 80], Math.min(1, (step - 1 + this.frac(step, row)) / Math.max(1, b.climbSteps!)));
    if (step < 0) return mix([30, 110, 160], [4, 8, 30], Math.min(1, (-step - 1 + this.frac(step, row)) / Math.max(1, b.climbSteps!)));
    return row < sea ? [170, 215, 245] : [50, 140, 190];
  }
  /** How far through its step a row is (0 at the edge toward step 0, 1 at the far edge). */
  private frac(step: number, row: number) {
    const b = this.world().board, S = b.climbSteps!, top = b.stepTop![step + S], h = b.stepH![step + S];
    const f = (row - top) / h;
    return step > 0 ? 1 - f : f;
  }

  render() {
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
    // Step boundaries, each with a small label sitting on its line (not pinned over the view).
    const S = b.climbSteps!;
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.textBaseline = 'bottom';
    for (let n = S; n >= -S; n--) {
      const bottomRow = b.stepTop![n + S] + b.stepH![n + S], sy = (bottomRow - this.cam.y) * z; // the line below step n
      if (sy < 12 || sy > this.canvas.height + 12) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(0, sy, this.canvas.width, 1);
      const short = this.canvas.width < 600;
      const below = n - 1, label = (k: number) => short
        ? (k > 0 ? `+${k} · ${k} insul` : k < 0 ? `${k} · ${-k} armor` : '0 · sea')
        : (k > 0 ? `+${k} · ${k} insulation · food ×${10 ** k}` : k < 0 ? `${k} · ${-k} armor · food ×${10 ** -k}` : '0 · sea level');
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      const t1 = `▲ ${label(n)}`, t2 = below >= -S ? `▼ ${label(below)}` : '';
      const w1 = ctx.measureText(t1).width, w2 = ctx.measureText(t2).width, x = this.canvas.width - Math.max(w1, w2) - 14;
      ctx.fillRect(x - 3, sy - 13, w1 + 6, 13);
      if (t2) ctx.fillRect(x - 3, sy + 1, w2 + 6, 13);
      ctx.fillStyle = n > 0 ? '#bfe6ff' : n < 0 ? '#ffd9a0' : '#ffffff';
      ctx.fillText(t1, x, sy - 1);
      if (t2) { ctx.fillStyle = below > 0 ? '#bfe6ff' : below < 0 ? '#ffd9a0' : '#ffffff'; ctx.textBaseline = 'top'; ctx.fillText(t2, x, sy + 2); ctx.textBaseline = 'bottom'; }
    }
    this.renderMini();
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
    const world = this.world(), b = world.board, S = b.climbSteps!, st = b.step!;
    const living = world.living();
    const by = new Array(2 * S + 1).fill(0), arm = new Map<number, number>(), ins = new Map<number, number>();
    let plants = 0, meat = 0, both = 0, paceSum = 0;
    const counts = new Map<string, { n: number; id: number }>();
    for (const w of living) {
      by[S - st[w.ipY * world.w + w.ipX]]++;
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
      const step = S - k;
      const c = this.sky(step, b.stepTop![step + S] + b.stepH![step + S] / 2);
      return `<div class="stats" style="display:flex;gap:6px;align-items:center"><span style="width:28px">${step > 0 ? `+${step}` : step}</span><span style="display:inline-block;height:9px;width:${Math.round((n / max) * 160)}px;background:rgb(${c.join(',')})"></span>${n}</div>`;
    }).join('');
    const hist = (m: Map<number, number>) => [...m.entries()].sort((a, c) => a[0] - c[0]).map(([k, n]) => `${k}: ${n}`).join(' · ');
    const deaths = new Map<string, number>();
    for (const w of world.warriors) if (!w.alive && w.deathReason) {
      const k = w.deathReason.replace(/ by .*/, '').replace(/ \(.*/, '').replace('core ', '');
      deaths.set(k, (deaths.get(k) ?? 0) + 1);
    }
    const tiles = world.tileStats();
    const top = [...counts.entries()].sort((a, c) => c[1].n - a[1].n).slice(0, 6);
    const css = (c: number[]) => `rgb(${c.join(',')})`;
    return `<div class="name">The Climb</div>
      <div class="stats">${living.length} alive (cap ${Number.isFinite(CONFIG.maxWarriors) ? CONFIG.maxWarriors : '∞'}) · ${world.warriors.length} ever lived · pace ${living.length ? (paceSum / living.length).toFixed(2) : '-'} avg</div>
      <div class="stats">upkeep in ${tiles.active} of ${tiles.total} tiles (only near life)</div>
      <div class="name" style="margin-top:6px">by step</div>${bars}
      <div class="stats" style="margin-top:6px"><span style="color:#ffb46e">armor</span> ${hist(arm)}</div>
      <div class="stats"><span style="color:#8cd2ff">insulation</span> ${hist(ins)}</div>
      <div class="stats">diet: plants ${plants} · <span style="color:#ff6b8b">meat ${meat}</span> · both ${both}</div>
      <div class="name" style="margin-top:6px">top genomes</div>
      ${top.map(([g, c]) => `<div class="genome"><span style="color:${css(bodyColor(world, c.id))}">${String(c.n).padStart(3)} ×</span> <code>${esc(g)}</code></div>`).join('')}
      <div class="stats" style="margin-top:6px">deaths: ${[...deaths.entries()].sort((a, c) => c[1] - a[1]).slice(0, 6).map(([k, n]) => `${esc(k)} ${n}`).join(' · ')}</div>
      <div class="stats" style="margin-top:6px;color:#6e7681">drag to pan · pinch, wheel or +/- to zoom · WASD/arrows · tap the strip to jump</div>`;
  }
}

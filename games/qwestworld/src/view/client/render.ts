// render.ts — paints the continent: terrain, borders, a hundred thousand dots, and the names of things

import { MAP_W, MAP_H, NO_REGION, DEAD, Terrain, MetaResponse, StateResponse } from '../../shared/types.js';
import { Soldiers, POS_SCALE } from './api.js';

type RGB = [number, number, number];

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lighten = (c: RGB, t: number): string => {
  const m = mix(c, [255, 255, 255], t);
  return `rgb(${m[0] | 0},${m[1] | 0},${m[2] | 0})`;
};

const PALETTE: Record<Terrain, [RGB, RGB]> = {
  [Terrain.DEEP]: [hex('#0d2338'), hex('#173d5c')],
  [Terrain.WATER]: [hex('#1f5579'), hex('#3a86a6')],
  [Terrain.SAND]: [hex('#d8c28c'), hex('#e4d3a2')],
  [Terrain.GRASS]: [hex('#6f9a4c'), hex('#a3ad6a')],
  [Terrain.FOREST]: [hex('#3c6634'), hex('#557a44')],
  [Terrain.HILLS]: [hex('#95895c'), hex('#b1a47a')],
  [Terrain.MOUNTAIN]: [hex('#77716b'), hex('#a39e98')],
  [Terrain.SNOW]: [hex('#dfe4e8'), hex('#ffffff')],
};

export class Camera {
  x = MAP_W / 2;
  y = MAP_H / 2;
  scale = 1;

  fit(w: number, h: number, panel: number) {
    this.scale = Math.min((w - panel) / MAP_W, h / MAP_H) * 0.98;
    this.x = MAP_W / 2 + panel / 2 / this.scale;
    this.y = MAP_H / 2;
  }

  toScreen(wx: number, wy: number, w: number, h: number): [number, number] {
    return [(wx - this.x) * this.scale + w / 2, (wy - this.y) * this.scale + h / 2];
  }

  toWorld(sx: number, sy: number, w: number, h: number): [number, number] {
    return [(sx - w / 2) / this.scale + this.x, (sy - h / 2) / this.scale + this.y];
  }
}

export class Renderer {
  terrainCanvas = document.createElement('canvas');
  territoryCanvas = document.createElement('canvas');
  private ownerKey = '';
  private region: Uint16Array | null = null;

  constructor(private ctx: CanvasRenderingContext2D) {
    for (const c of [this.terrainCanvas, this.territoryCanvas]) { c.width = MAP_W; c.height = MAP_H; }
  }

  paintTerrain(terrain: Uint8Array, height: Uint8Array) {
    const g = this.terrainCanvas.getContext('2d')!;
    const img = g.createImageData(MAP_W, MAP_H);
    // Height range per terrain, to spread each band across its two palette colors
    const lo = new Array(8).fill(255), hi = new Array(8).fill(0);
    for (let i = 0; i < terrain.length; i++) {
      const t = terrain[i];
      if (height[i] < lo[t]) lo[t] = height[i];
      if (height[i] > hi[t]) hi[t] = height[i];
    }
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const i = y * MAP_W + x;
        const t = terrain[i] as Terrain;
        const span = Math.max(1, hi[t] - lo[t]);
        let c = mix(PALETTE[t][0], PALETTE[t][1], (height[i] - lo[t]) / span);
        const land = t > Terrain.WATER;
        if (land) {
          // Hillshade, light from the north-west
          const a = height[Math.max(0, i - MAP_W - 1)], b = height[Math.min(terrain.length - 1, i + MAP_W + 1)];
          const s = Math.max(-1, Math.min(1, (a - b) * 0.09));
          c = s > 0 ? mix(c, [255, 246, 220], s * 0.35) : mix(c, [20, 24, 30], -s * 0.45);
        } else if (nearLand(terrain, x, y)) {
          c = mix(c, [150, 200, 210], 0.35); // surf
        }
        const edge = Math.min(x, y, MAP_W - 1 - x, MAP_H - 1 - y);
        if (edge < 48) c = mix(c, PALETTE[Terrain.DEEP][0], Math.pow(1 - edge / 48, 2));
        img.data[i * 4] = c[0];
        img.data[i * 4 + 1] = c[1];
        img.data[i * 4 + 2] = c[2];
        img.data[i * 4 + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }

  setRegions(region: Uint16Array) {
    this.region = region;
    this.ownerKey = '';
  }

  /** Repaint the territory tint whenever any settlement changes hands. */
  paintTerritory(state: StateResponse) {
    const key = state.settlements.map(s => s.owner).join(',');
    if (key === this.ownerKey || !this.region) return;
    this.ownerKey = key;
    const owner = state.settlements.map(s => s.owner);
    const colors = state.kingdoms.map(k => hex(k.color));
    const region = this.region;
    const g = this.territoryCanvas.getContext('2d')!;
    const img = g.createImageData(MAP_W, MAP_H);
    const ownerAt = (i: number) => (region[i] === NO_REGION ? -1 : owner[region[i]]);
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const i = y * MAP_W + x;
        const o = ownerAt(i);
        if (o < 0) continue;
        const border =
          (x > 0 && ownerAt(i - 1) !== o && ownerAt(i - 1) >= 0) ||
          (x < MAP_W - 1 && ownerAt(i + 1) !== o && ownerAt(i + 1) >= 0) ||
          (y > 0 && ownerAt(i - MAP_W) !== o && ownerAt(i - MAP_W) >= 0) ||
          (y < MAP_H - 1 && ownerAt(i + MAP_W) !== o && ownerAt(i + MAP_W) >= 0);
        const c = colors[o];
        img.data[i * 4] = c[0];
        img.data[i * 4 + 1] = c[1];
        img.data[i * 4 + 2] = c[2];
        img.data[i * 4 + 3] = border ? 230 : 62;
      }
    }
    g.putImageData(img, 0, 0);
  }

  draw(cam: Camera, meta: MetaResponse, state: StateResponse, prev: Soldiers | null, cur: Soldiers | null, t: number) {
    const ctx = this.ctx;
    const w = ctx.canvas.width / devicePixelRatio, h = ctx.canvas.height / devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.fillStyle = '#0d2338';
    ctx.fillRect(0, 0, w, h);

    // World layers
    const [ox, oy] = cam.toScreen(0, 0, w, h);
    ctx.imageSmoothingEnabled = cam.scale < 2.5;
    ctx.drawImage(this.terrainCanvas, ox, oy, MAP_W * cam.scale, MAP_H * cam.scale);
    ctx.globalAlpha = Math.max(0.35, Math.min(1, 2.2 / cam.scale));
    ctx.drawImage(this.territoryCanvas, ox, oy, MAP_W * cam.scale, MAP_H * cam.scale);
    ctx.globalAlpha = 1;

    const colors = state.kingdoms.map(k => hex(k.color));
    this.drawArmyLines(cam, meta, state, w, h);
    if (cur) this.drawSoldiers(cam, prev, cur, t, colors, w, h);
    this.drawSettlements(cam, meta, state, colors, w, h);
    this.drawCouriers(cam, state, colors, w, h);
    this.drawArmyBanners(cam, state, colors, w, h);
  }

  private sxBuf = new Float32Array(0);
  private syBuf = new Float32Array(0);

  private drawSoldiers(cam: Camera, prev: Soldiers | null, cur: Soldiers, t: number, colors: RGB[], w: number, h: number) {
    const ctx = this.ctx;
    const size = Math.max(1.8, cam.scale * 0.42);
    const half = size / 2;
    const k = cam.scale / POS_SCALE;
    const x0 = w / 2 - cam.x * cam.scale, y0 = h / 2 - cam.y * cam.scale;
    if (this.sxBuf.length < cur.n) { this.sxBuf = new Float32Array(cur.n * 2); this.syBuf = new Float32Array(cur.n * 2); }
    const SX = this.sxBuf, SY = this.syBuf;

    // Interpolate and project once; NaN marks off-screen or dead
    for (let i = 0; i < cur.n; i++) {
      const f = cur.f[i];
      if (f === DEAD) { SX[i] = NaN; continue; }
      let px = cur.x[i], py = cur.y[i];
      if (prev && i < prev.n && prev.f[i] === f) {
        const dx = px - prev.x[i], dy = py - prev.y[i];
        if (dx * dx + dy * dy < 64 * 64) { px = prev.x[i] + dx * t; py = prev.y[i] + dy * t; }
      }
      const sx = px * k + x0, sy = py * k + y0;
      SX[i] = sx < -4 || sy < -4 || sx > w + 4 || sy > h + 4 ? NaN : sx;
      SY[i] = sy;
    }

    if (size >= 2) {
      ctx.fillStyle = 'rgba(15,10,5,.7)';
      for (let i = 0; i < cur.n; i++) {
        const sx = SX[i];
        if (sx === sx) ctx.fillRect(sx - half - 0.75, SY[i] - half - 0.75, size + 1.5, size + 1.5);
      }
    }
    for (let f = 0; f < colors.length; f++) {
      ctx.fillStyle = lighten(colors[f], 0.45);
      for (let i = 0; i < cur.n; i++) {
        const sx = SX[i];
        if (cur.f[i] === f && sx === sx) ctx.fillRect(sx - half, SY[i] - half, size, size);
      }
    }
  }

  private drawSettlements(cam: Camera, meta: MetaResponse, state: StateResponse, colors: RGB[], w: number, h: number) {
    const ctx = this.ctx;
    const showNames = cam.scale >= 1.5;
    const seats = new Set(state.kingdoms.filter(k => k.alive).map(k => k.capital));
    for (const s of meta.settlements) {
      const v = state.settlements[s.id];
      const [x, y] = cam.toScreen(s.x + 0.5, s.y + 0.5, w, h);
      if (x < -60 || y < -30 || x > w + 60 || y > h + 30) continue;
      const c = colors[v.owner] ?? [128, 128, 128];
      const seat = seats.has(s.id);
      const r = seat ? 5.5 : 3.6;

      const thinker = seat ? state.kingdoms.find(k => k.capital === s.id && k.thinking && k.brain !== 'script') : undefined;
      if (thinker) {
        const p = (performance.now() / 1600) % 1;
        ctx.strokeStyle = `rgba(243,217,139,${0.8 * (1 - p)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r + 4 + p * 16, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (v.siege > 0) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255,240,200,.9)';
        ctx.lineWidth = 2;
        ctx.arc(x, y, r + 5, -Math.PI / 2, -Math.PI / 2 + v.siege * Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      ctx.strokeStyle = '#1a140c';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (seat) ctx.rect(x - r, y - r, r * 2, r * 2);
      else ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (seat) {
        ctx.strokeStyle = '#e9c46a';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - r - 2.5, y - r - 2.5, r * 2 + 5, r * 2 + 5);
      }

      if (showNames || seat) {
        ctx.font = `${seat ? 600 : 500} ${seat ? 14 : 12}px Cinzel, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(10,8,5,.85)';
        const label = cam.scale >= 3 ? `${s.name} · ${v.garrison}` : s.name;
        ctx.strokeText(label, x, y + r + 4);
        ctx.fillStyle = '#f4ecd8';
        ctx.fillText(label, x, y + r + 4);
      }
    }
  }

  /** Riders carrying orders (small, fast) and envoys (a lantern with a faint trail). */
  private drawCouriers(cam: Camera, state: StateResponse, colors: RGB[], w: number, h: number) {
    const ctx = this.ctx;
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 300);
    for (const c of state.couriers ?? []) {
      const x = c.x0 + (c.x1 - c.x0) * c.t + 0.5, y = c.y0 + (c.y1 - c.y0) * c.t + 0.5;
      const [sx, sy] = cam.toScreen(x, y, w, h);
      if (sx < -10 || sy < -10 || sx > w + 10 || sy > h + 10) continue;
      const col = colors[c.faction] ?? [255, 255, 255];
      if (c.kind === 'envoy') {
        const [ax, ay] = cam.toScreen(c.x0 + 0.5, c.y0 + 0.5, w, h);
        ctx.strokeStyle = `rgba(255,244,214,${0.18 * pulse})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(sx, sy); ctx.stroke();
        ctx.fillStyle = `rgba(255,244,214,${0.35 * pulse})`;
        ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff4d6';
        ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.5 * pulse})`;
        ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fffaf0';
        ctx.beginPath(); ctx.arc(sx, sy, 2, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  private drawArmyLines(cam: Camera, meta: MetaResponse, state: StateResponse, w: number, h: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    for (const a of state.armies) {
      if (a.order !== 'march' || a.size < 10) continue;
      const t = meta.settlements[a.target];
      const k = state.kingdoms[a.faction];
      const [x1, y1] = cam.toScreen(a.x, a.y, w, h);
      const [x2, y2] = cam.toScreen(t.x + 0.5, t.y + 0.5, w, h);
      ctx.strokeStyle = k.color + 'aa';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawArmyBanners(cam: Camera, state: StateResponse, colors: RGB[], w: number, h: number) {
    const ctx = this.ctx;
    ctx.font = '600 12px "EB Garamond", serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const a of state.armies) {
      if (a.size < 10) continue;
      const [x, y] = cam.toScreen(a.x, a.y, w, h);
      if (x < -80 || y < -40 || x > w + 80 || y > h + 40) continue;
      const c = colors[a.faction];
      const mood = a.morale < 0.3 ? ' ☹' : a.morale >= 0.8 ? ' ★' : '';
      const label = `${a.general} · ${a.size}${mood}`;
      const tw = ctx.measureText(label).width;
      const bx = x + 6, by = y - 22;
      // Pole and pennant
      ctx.strokeStyle = 'rgba(20,15,10,.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, by - 7);
      ctx.stroke();
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},.92)`;
      ctx.beginPath();
      ctx.moveTo(x, by - 8);
      ctx.lineTo(bx + tw + 8, by - 8);
      ctx.lineTo(bx + tw + 3, by);
      ctx.lineTo(bx + tw + 8, by + 8);
      ctx.lineTo(x, by + 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fffaf0';
      ctx.fillText(label, bx, by + 0.5);
    }
  }
}

function nearLand(terrain: Uint8Array, x: number, y: number): boolean {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= MAP_W || yy >= MAP_H) continue;
      if (terrain[yy * MAP_W + xx] > Terrain.WATER) return true;
    }
  }
  return false;
}

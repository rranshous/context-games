// mapgen.ts — deterministic continent generation from a seed
//
// Everything here is a pure function of the seed, so saves only need the
// dynamic state (owners, soldiers, armies) — the land regenerates identically.

import { MAP_W, MAP_H, Terrain, TERRAIN_COST, NO_REGION } from '../shared/types.js';
import { mulberry32, fbm, Rng } from './rng.js';
import { NameGen } from './names.js';
import { distanceField } from './flow.js';

export const KINGDOM_COLORS = ['#d64545', '#3f6fd8', '#e0b030', '#9b5de5', '#e07b39', '#2fb5a8'];

const TEMPERAMENTS = [
  'ambitious and proud', 'cautious and patient', 'vengeful and quick to anger', 'pious and stern',
  'greedy for land', 'young and reckless', 'old and cunning', 'honorable but stubborn',
];

export interface SettlementDef {
  id: number;
  name: string;
  x: number;
  y: number;
  tile: number;
  capital: boolean;
  kingdom: number; // founding kingdom
  food: number;
  neighbors: number[];
}

export interface KingdomDef {
  id: number;
  name: string;
  king: string;
  temperament: string;
  color: string;
  capital: number; // settlement id
}

export interface WorldMap {
  seed: number;
  terrain: Uint8Array;
  height: Uint8Array;
  cost: Uint8Array;
  region: Uint16Array; // settlement id owning each tile, NO_REGION for water
  settlements: SettlementDef[];
  kingdoms: KingdomDef[];
}

export interface MapGenOptions {
  settlements?: number;
  kingdoms?: number;
}

export function generateMap(seed: number, opts: MapGenOptions = {}): WorldMap {
  const nSettlements = opts.settlements ?? 64;
  const nKingdoms = opts.kingdoms ?? 4;
  const rng = mulberry32(seed);
  const names = new NameGen(rng);
  const n = MAP_W * MAP_H;

  // --- Heightmap: warped fbm, ridges, pulled down toward the map edge ---
  const h = new Float32Array(n);
  const moist = new Float32Array(n);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x;
      const wx = x + (fbm(x / 260, y / 260, seed + 11, 4) - 0.5) * 160;
      const wy = y + (fbm(x / 260, y / 260, seed + 29, 4) - 0.5) * 160;
      const nx = (x / MAP_W) * 2 - 1, ny = (y / MAP_H) * 2 - 1;
      const edge = Math.pow(Math.max(Math.abs(nx), Math.abs(ny) * 0.9), 3) * 0.6 + (nx * nx + ny * ny) * 0.25;
      const base = fbm(wx / 190, wy / 190, seed, 6);
      const ridge = 1 - Math.abs(fbm(wx / 110, wy / 110, seed + 3, 5) * 2 - 1);
      h[i] = base + Math.pow(ridge, 4) * 0.28 - edge;
      moist[i] = fbm(x / 140, y / 140, seed + 57, 5);
    }
  }

  // Sea level and land bands by quantile, so every seed has similar proportions
  const sorted = Float32Array.from(h).sort();
  const q = (p: number) => sorted[Math.floor(p * (n - 1))];
  const sea = q(0.44), deep = q(0.3);
  const land = Array.from(h).filter(v => v > sea).sort((a, b) => a - b);
  const lq = (p: number) => land[Math.floor(p * (land.length - 1))];
  const sandT = lq(0.03), hillT = lq(0.72), mountT = lq(0.9), snowT = lq(0.975);

  const terrain = new Uint8Array(n);
  const height = new Uint8Array(n);
  const hmin = sorted[0], hmax = sorted[n - 1];
  for (let i = 0; i < n; i++) {
    const v = h[i];
    height[i] = Math.round(((v - hmin) / (hmax - hmin)) * 255);
    let t: Terrain;
    if (v <= deep) t = Terrain.DEEP;
    else if (v <= sea) t = Terrain.WATER;
    else if (v <= sandT) t = Terrain.SAND;
    else if (v >= snowT) t = Terrain.SNOW;
    else if (v >= mountT) t = Terrain.MOUNTAIN;
    else if (v >= hillT) t = moist[i] > 0.6 ? Terrain.FOREST : Terrain.HILLS;
    else t = moist[i] > 0.54 ? Terrain.FOREST : Terrain.GRASS;
    terrain[i] = t;
  }

  // --- Passability: only the largest landmass is walkable ---
  const cost = new Uint8Array(n);
  for (let i = 0; i < n; i++) cost[i] = TERRAIN_COST[terrain[i] as Terrain];
  const main = largestComponent(cost);
  for (let i = 0; i < n; i++) if (!main[i]) cost[i] = 0;

  // --- Settlements: greedy poisson-ish, favoring grassland and coasts ---
  const candidates: { tile: number; score: number }[] = [];
  for (let k = 0; k < 30000; k++) {
    const tile = Math.floor(rng() * n);
    const t = terrain[tile];
    if (!main[tile] || t === Terrain.MOUNTAIN || t === Terrain.SNOW) continue;
    let score = rng() * 0.6;
    if (t === Terrain.GRASS) score += 0.4;
    if (t === Terrain.HILLS) score += 0.15;
    if (nearWater(terrain, tile, 4)) score += 0.3;
    candidates.push({ tile, score });
  }
  candidates.sort((a, b) => b.score - a.score);

  const placed: number[] = [];
  let minDist = 52;
  while (placed.length < nSettlements && minDist > 10) {
    for (const c of candidates) {
      if (placed.length >= nSettlements) break;
      const cx = c.tile % MAP_W, cy = Math.floor(c.tile / MAP_W);
      const ok = placed.every(p => {
        const dx = (p % MAP_W) - cx, dy = Math.floor(p / MAP_W) - cy;
        return dx * dx + dy * dy >= minDist * minDist;
      });
      if (ok) placed.push(c.tile);
    }
    minDist -= 6;
  }

  const settlements: SettlementDef[] = placed.map((tile, id) => ({
    id,
    name: names.place(),
    x: tile % MAP_W,
    y: Math.floor(tile / MAP_W),
    tile,
    capital: false,
    kingdom: 0,
    food: 0,
    neighbors: [],
  }));

  // --- Capitals: farthest-point sampling ---
  const capitals: number[] = [Math.floor(rng() * settlements.length)];
  while (capitals.length < nKingdoms) {
    let best = -1, bestD = -1;
    for (const s of settlements) {
      if (capitals.includes(s.id)) continue;
      const d = Math.min(...capitals.map(c => {
        const o = settlements[c];
        return (o.x - s.x) ** 2 + (o.y - s.y) ** 2;
      }));
      if (d > bestD) { bestD = d; best = s.id; }
    }
    capitals.push(best);
  }
  // First capital was random; re-pull it away from the others for fairness
  {
    let best = capitals[0], bestD = -1;
    for (const s of settlements) {
      if (capitals.slice(1).includes(s.id)) continue;
      const d = Math.min(...capitals.slice(1).map(c => (settlements[c].x - s.x) ** 2 + (settlements[c].y - s.y) ** 2));
      if (d > bestD) { bestD = d; best = s.id; }
    }
    capitals[0] = best;
  }

  const kingdoms: KingdomDef[] = capitals.map((cap, id) => {
    settlements[cap].capital = true;
    return {
      id,
      name: names.realm(settlements[cap].name),
      king: names.person(),
      temperament: TEMPERAMENTS[Math.floor(rng() * TEMPERAMENTS.length)],
      color: KINGDOM_COLORS[id % KINGDOM_COLORS.length],
      capital: cap,
    };
  });

  // Founding allegiance: nearest capital by walking distance
  const byCapital = distanceField(cost, capitals.map(c => settlements[c].tile));
  for (const s of settlements) {
    const l = byCapital.label[s.tile];
    s.kingdom = l === NO_REGION ? 0 : l;
  }

  // Regions: each tile belongs to the settlement nearest by walking distance
  const regions = distanceField(cost, settlements.map(s => s.tile));
  const region = regions.label;

  // Adjacency and food from regions
  const adj = settlements.map(() => new Set<number>());
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x;
      const a = region[i];
      if (a === NO_REGION) continue;
      const t = terrain[i];
      settlements[a].food += t === Terrain.GRASS ? 1 : t === Terrain.FOREST ? 0.5 : t === Terrain.HILLS ? 0.3 : 0.1;
      if (x + 1 < MAP_W) {
        const b = region[i + 1];
        if (b !== NO_REGION && b !== a) { adj[a].add(b); adj[b].add(a); }
      }
      if (y + 1 < MAP_H) {
        const b = region[i + MAP_W];
        if (b !== NO_REGION && b !== a) { adj[a].add(b); adj[b].add(a); }
      }
    }
  }
  settlements.forEach((s, i) => { s.neighbors = [...adj[i]]; });

  return { seed, terrain, height, cost, region, settlements, kingdoms };
}

function nearWater(terrain: Uint8Array, tile: number, r: number): boolean {
  const x = tile % MAP_W, y = Math.floor(tile / MAP_W);
  for (let dy = -r; dy <= r; dy += 2) {
    for (let dx = -r; dx <= r; dx += 2) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= MAP_W || yy >= MAP_H) continue;
      if (terrain[yy * MAP_W + xx] <= Terrain.WATER) return true;
    }
  }
  return false;
}

function largestComponent(cost: Uint8Array): Uint8Array {
  const n = MAP_W * MAP_H;
  const comp = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let s = 0; s < n; s++) {
    if (cost[s] === 0 || comp[s] !== -1) continue;
    const id = sizes.length;
    let size = 0;
    comp[s] = id;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % MAP_W;
      const ns = [x > 0 ? i - 1 : -1, x < MAP_W - 1 ? i + 1 : -1, i - MAP_W, i + MAP_W];
      for (const j of ns) {
        if (j < 0 || j >= n || cost[j] === 0 || comp[j] !== -1) continue;
        comp[j] = id;
        stack.push(j);
      }
    }
    sizes.push(size);
  }
  const best = sizes.indexOf(Math.max(...sizes));
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = comp[i] === best ? 1 : 0;
  return out;
}

export type { Rng };

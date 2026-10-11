// Petri dish settings, shared by the headless runner (dist/petri.mjs) and the viewer
// (?petri=1). In the spirit of Tierra: no score, no reaper; replicators on a plate with
// copy errors (substitutions, insertions, deletions), food, starvation and old age; no cap
// on the population, so a saturated plate is where offense and defense could pay.
// Whatever persists, persists. The plate is MEGA-plate style: clean in the middle, rings
// of rising toxin out to the rim, and armor (K cells) is the only way deeper.
import { CODE, glyphOf } from './glyphs';
import { CONFIG, World } from './world';

export const DISH_DEFAULTS: Record<string, number> = {
  size: 160,      // plate diameter (cells)
  bands: 5,       // toxin levels 0 (middle) … 4 (rim)
  food: 5,        // about one food spot per food² cells
  spawn: 40,      // ticks a food spot needs untouched to regrow
  ripen: 300,     // an uneaten pickup grows one pickup's worth every this many ticks…
  ripemax: 5,     // …up to this many (so fresh territory is rich, picked-over ground poor)
  toxin: 0.001,   // per tick, a cell's chance of dying one toxin level above its warrior's armor…
  step: 10,       // …times this for each further level
  error: 0.02,    // DIVIDE: chance each copied cell becomes a random glyph
  insert: 0.02,   // DIVIDE: chance the child gains a fat cell
  delete: 0.02,   // DIVIDE: chance the child loses a cell
  life: 6000,     // typical lifespan (each warrior's is 50–150% of it)
  cap: 0,         // most warriors alive at once (DIVIDE fails at the cap); 0 = no cap: food and space decide
};

/** Apply dish settings; `get(k)` returns an override or null. Returns the settings used. */
export function applyDish(get: (k: string) => string | null): Record<string, number> {
  const o: Record<string, number> = {};
  for (const [k, d] of Object.entries(DISH_DEFAULTS)) { const v = get(k); o[k] = v !== null && v !== '' ? Number(v) : d; }
  CONFIG.plate = o.size;
  CONFIG.plateBands = o.bands;
  CONFIG.plateFood = o.food;
  CONFIG.spawnInterval = o.spawn;
  CONFIG.foodRipen = o.ripen;
  CONFIG.foodRipeMax = o.ripemax;
  CONFIG.toxinRate = o.toxin;
  CONFIG.toxinStep = o.step;
  CONFIG.copyError = o.error;
  CONFIG.copyInsert = o.insert;
  CONFIG.copyDelete = o.delete;
  CONFIG.lifespan = o.life;
  CONFIG.maxWarriors = o.cap > 0 ? o.cap : Infinity;
  CONFIG.reaperCap = 0;
  CONFIG.tickCap = 1e12;
  CONFIG.endless = true;
  return o;
}

const K = CODE['K'];

/** A warrior's armor: how many K cells it has. */
export function armorOf(world: World, id: number): number {
  let n = 0;
  for (const c of world.cellsOf(id)) if (world.code[c] === K) n++;
  return n;
}

/** Toxin level under a warrior's IP (where it "lives"). */
export function bandOf(world: World, id: number): number {
  const w = world.warriors[id];
  return world.board.toxin?.[world.idx(w.ipX, w.ipY)] ?? 0;
}

/** A warrior's genome: its glyph grid, cropped (position-free), rows joined by `/`. */
export function genomeOf(world: World, id: number, sep = '/'): string {
  const cells = world.cellsOf(id);
  if (!cells.length) return '';
  const xs = cells.map((c) => c % world.w), ys = cells.map((c) => (c / world.w) | 0);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
  const rows: string[] = [];
  for (let y = y0; y <= y1; y++) {
    let r = '';
    for (let x = x0; x <= x1; x++) { const i = world.idx(x, y); r += world.owner[i] === id ? glyphOf(world.code[i]) : ' '; }
    rows.push(r.replace(/\s+$/, ''));
  }
  return rows.join(sep);
}

/** One moment of a dish, for reports. */
export interface DishSnapshot {
  t: number; alive: number; births: number; maxGen: number;
  bands: number[];                  // living warriors by toxin level under their IP
  armor: number[];                  // living warriors by K count
  deaths: Record<string, number>;   // all deaths so far, by cause
  weapons: { B: number; W: number; poison: number }; // living warriors carrying each
  attacks: { bombs: number; poisons: number };       // hits so far, kin included
  top: [string, number][];          // most common living genomes (up to 12)
  shapes: [string, number][];       // most common body outlines (genome with every cell as #)
  distinct: number;                 // distinct living genomes
  glyphs: Record<string, number>;   // living warriors carrying each glyph
  acts: Record<string, number>;     // per living warrior: lifetime collects, bomb hits, poison writes, kills, self-writes, grows, swaps, flows, oozes
  body: { mean: number; max: number; genome: number; grows: number }; // living: cells (mean, max), cells of the most common genome, GROWs per warrior
}

const WEAPON = { B: CODE['B'], W: CODE['W'], poison: CODE['@'] };

export function dishSnapshot(world: World, founders: number): DishSnapshot {
  const living = world.living();
  const bands = new Array(CONFIG.plateBands).fill(0), armor: number[] = [];
  const counts = new Map<string, number>();
  const weapons = { B: 0, W: 0, poison: 0 };
  const shapes = new Map<string, number>(), glyphs: Record<string, number> = {};
  const acts: Record<string, number> = { collected: 0, bombHits: 0, poisonWrites: 0, kills: 0, selfWrites: 0, grows: 0, swaps: 0, flows: 0, oozes: 0 };
  for (const w of living) {
    bands[bandOf(world, w.id)]++;
    const a = armorOf(world, w.id);
    armor[a] = (armor[a] ?? 0) + 1;
    const g = genomeOf(world, w.id);
    counts.set(g, (counts.get(g) ?? 0) + 1);
    const outline = g.replace(/[^ /]/g, '#');
    shapes.set(outline, (shapes.get(outline) ?? 0) + 1);
    for (const ch of new Set(g.replace(/[ /]/g, ''))) glyphs[ch] = (glyphs[ch] ?? 0) + 1;
    for (const k in acts) acts[k] += (w.stats as unknown as Record<string, number>)[k] / living.length;
    const cells = world.cellsOf(w.id);
    for (const k of ['B', 'W', 'poison'] as const) if (cells.some((c) => world.code[c] === WEAPON[k])) weapons[k]++;
  }
  for (let a = 0; a < armor.length; a++) armor[a] ??= 0;
  const deaths: Record<string, number> = {};
  for (const w of world.warriors) {
    if (w.alive || !w.deathReason) continue;
    const k = w.deathReason.replace(/ by .*/, '').replace(/ \(.*/, '');
    deaths[k] = (deaths[k] ?? 0) + 1;
  }
  return {
    t: world.t, alive: living.length, births: world.warriors.length - founders,
    maxGen: Math.max(0, ...living.map((w) => w.gen)), bands, armor, deaths, weapons,
    attacks: { ...world.attacks },
    top: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
    shapes: [...shapes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
    distinct: counts.size, glyphs, acts,
    body: {
      mean: living.reduce((a, w) => a + w.cellCount, 0) / Math.max(1, living.length),
      max: Math.max(0, ...living.map((w) => w.cellCount)),
      genome: [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0].replace(/[ /]/g, '').length ?? 0,
      grows: living.reduce((a, w) => a + w.stats.grows, 0) / Math.max(1, living.length),
    },
  };
}

/** A snapshot as report lines. */
export function formatSnapshot(s: DishSnapshot, founder: string): string[] {
  let front = -1;
  s.bands.forEach((n, b) => { if (n >= 3) front = b; });
  return [
    `t${String(s.t).padStart(7)}  alive ${String(s.alive).padStart(4)}  births ${String(s.births).padStart(6)}  gen ≤${String(s.maxGen).padStart(4)}  bands [${s.bands.map((n) => String(n).padStart(4)).join(' ')}]  front ${front}  armor {${s.armor.map((n, a) => (n ? `${a}K:${n}` : '')).filter(Boolean).join(' ')}}`,
    `           deaths: ${Object.entries(s.deaths).map(([k, n]) => `${k} ${n}`).join(', ')}`,
    `           bodies: ${s.body.mean.toFixed(1)} cells on average, largest ${s.body.max}; most common genome ${s.body.genome} cells; ${s.body.grows.toFixed(2)} GROWs per living warrior`,
    `           weapons: B in ${s.weapons.B}, W in ${s.weapons.W}, @ in ${s.weapons.poison}; so far ${s.attacks.bombs} bomb hits, ${s.attacks.poisons} poison writes`,
    ...s.top.slice(0, 3).map(([g, n]) => `           ${String(n).padStart(4)} × ${g}${g === founder ? '   (founder)' : ''}`),
  ];
}

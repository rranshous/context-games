// Petri dish settings, shared by the headless runner (dist/petri.mjs) and the viewer
// (?petri=1). In the spirit of Tierra: no score, no reaper; replicators on a plate with
// copy errors (substitutions, insertions, deletions), food, starvation and old age; no cap
// on the population, so a saturated plate is where offense and defense could pay.
// Whatever persists, persists. The plate is MEGA-plate style: clean in the middle, rings
// of rising toxin out to the rim, and armor (K cells) is the only way deeper.
import { CODE, glyphOf } from './glyphs';
import { CONFIG, Warrior, World } from './world';

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
  island: 0,      // 1 = island survival (side view: islanders and sea creatures; size = width)
  climb: 0,       // 1 = The Climb (steps up into air and down into water, 10× taller and richer each; size = width)
  base: 20,       // climb: step 0's height (step ±n is base × 10^n)
  steps: 2,       // climb: steps each way
  crowd: 24,      // climb: DIVIDE fails where the parent's tile (64×64) already holds this many bodies (local crowding, not a global cap)
  stomach: 4,     // climb: max size is at most this many times the body's cells
  hunger: 1500,   // climb: ticks a full body of plain cells lasts unfed at step 0 (all cells burn 2^|step|× further out)
  shell: 3,       // climb: armor (K) and insulation (I) cells burn this many times a plain cell
  fat: 0.5,       // climb: fat cells burn this many times a plain cell
  starve: 600,    // island: ticks an unfed seal with max size 20 lasts
  sharkstarve: 6000, // island: the same for a shark (10×, like its lifespan)
  sharklife: 10,  // island: shark lifespan, times a seal's
  kelp: 8,        // island: max size a seal gains per kelp (times ripeness)
  seafeed: 3,     // island: max size a sea creature gains per dead cell (and per cell of a seal it kills)
  bite: 2,        // island: a shark's BOMB reach
  full: 0.75,     // island: a shark at this share of its size cap is full and won't bite
  shallows: 0.4,  // island: top share of the water sharks can't enter
  calm: 0.25,     // island: top share of the water with no pressure
  depth: 0.75,    // island: sea depth as a share of its width
  arrive: 60000,  // island: tick the reef channel opens and the sharks swim in
  seals: 60,      // island: seals already spread through the calm water at the start
};

/** Apply dish settings; `get(k)` returns an override or null. Returns the settings used. */
export function applyDish(get: (k: string) => string | null): Record<string, number> {
  const o: Record<string, number> = {};
  for (const [k, d] of Object.entries(DISH_DEFAULTS)) { const v = get(k); o[k] = v !== null && v !== '' ? Number(v) : d; }
  // Island survival's own defaults where not told otherwise: a big sea, and kelp that goes
  // from a snack (8) to a feast (8× ripe) if left alone ~1750 ticks.
  if (o.climb > 0) {
    // The Climb's own defaults: wide, harsh steps, ripening plants, a few dozen of each founder.
    const unset = (k: string) => (get(k) ?? '') === '';
    if (unset('size')) o.size = 2000;
    if (unset('ripen')) o.ripen = 250;
    if (unset('ripemax')) o.ripemax = 8;
    if (unset('toxin')) o.toxin = 0.005;
    if (unset('seals')) o.seals = 40;

  }
  if (o.island > 0) {
    const unset = (k: string) => (get(k) ?? '') === '';
    if (unset('size')) o.size = 360;
    if (unset('ripen')) o.ripen = 250;
    if (unset('ripemax')) o.ripemax = 8;
    if (unset('toxin')) o.toxin = 0.005; // pressure one band past your armor: ~200 ticks to lose your core
  }
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
  CONFIG.island = o.island > 0;
  CONFIG.climb = o.climb > 0;
  CONFIG.climbBase = o.base;
  CONFIG.climbSteps = o.steps;
  CONFIG.starve = o.starve;
  CONFIG.sharkStarve = o.sharkstarve;
  CONFIG.sharkLife = o.sharklife;
  CONFIG.kelpFeed = o.kelp;
  CONFIG.seaFeed = o.seafeed;
  CONFIG.biteRange = o.bite;
  CONFIG.sharkFull = o.full;
  CONFIG.shallows = o.shallows;
  CONFIG.calm = o.calm;
  CONFIG.depth = o.depth;
  CONFIG.sharkArrive = o.arrive;
  CONFIG.seals = o.seals;
  CONFIG.reaperCap = 0;
  CONFIG.crowd = o.crowd;
  CONFIG.stomach = o.stomach;
  CONFIG.climbStarve = o.hunger;
  CONFIG.shellBurn = o.shell;
  CONFIG.fatBurn = o.fat;
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
  const w = world.warrior(id);
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
  sea?: { alive: number; bands: number[]; armor: number[]; top: [string, number][] }; // island survival: the sea creatures (the rest is islanders)
  climb?: ClimbSnapshot;
}

/** The Climb: where life is and what it's made of. */
export interface ClimbSnapshot {
  steps: number[];                       // living by step under the IP, from the highest step (stepHi) down
  armor: number[]; insulation: number[]; // living by trait value
  diet: { plants: number; meat: number; both: number; none: number };
  founders: Record<string, number>;      // living by founder name (lineage)
  top: [string, number][];               // most common genomes
  biggest: { genome: string; cells: number; step: number; meat: boolean } | null; // the largest body alive (kraken watch)
  mods: Record<string, number>;          // living carrying each chemistry glyph (I ~ x n)
  tiles: number;                         // tiles getting upkeep
}

function climbSnapshot(world: World): ClimbSnapshot {
  const b = world.board, Hi = b.stepHi!, st = b.step!;
  const steps = new Array(Hi - b.stepLo! + 1).fill(0), armor: number[] = [], insulation: number[] = [];
  const diet = { plants: 0, meat: 0, both: 0, none: 0 }, founders: Record<string, number> = {}, counts = new Map<string, number>();
  const mods: Record<string, number> = { I: 0, '~': 0, x: 0, n: 0 };
  let biggest: ClimbSnapshot['biggest'] = null;
  for (const w of world.living()) {
    const n = st[world.idx(w.ipX, w.ipY)];
    steps[Hi - n]++;
    const t = w.traits;
    if (t) {
      armor[t.armor] = (armor[t.armor] ?? 0) + 1;
      insulation[t.insulation] = (insulation[t.insulation] ?? 0) + 1;
      if (t.plants && t.meat) diet.both++; else if (t.meat) diet.meat++; else if (t.plants) diet.plants++; else diet.none++;
    }
    const f = world.warrior(w.lineage).name;
    founders[f] = (founders[f] ?? 0) + 1;
    const g = genomeOf(world, w.id);
    counts.set(g, (counts.get(g) ?? 0) + 1);
    for (const ch of Object.keys(mods)) if (g.includes(ch)) mods[ch]++;
    if (!biggest || w.cellCount > biggest.cells) biggest = { genome: g, cells: w.cellCount, step: n, meat: !!t?.meat };
  }
  for (const a of [armor, insulation]) for (let k = 0; k < a.length; k++) a[k] ??= 0;
  return { steps, armor, insulation, diet, founders, top: [...counts.entries()].sort((a, c) => c[1] - a[1]).slice(0, 12), biggest, mods, tiles: world.tileStats().active };
}

const WEAPON = { B: CODE['B'], W: CODE['W'], poison: CODE['@'] };

export function dishSnapshot(world: World, founders: number): DishSnapshot {
  const all = world.living();
  const living = all.filter((w) => w.realm === 0);
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
  for (const [rk, n] of world.deaths) { const k = rk.slice(rk.indexOf('|') + 1); deaths[k] = (deaths[k] ?? 0) + n; }
  return {
    t: world.t, alive: living.length, births: world.everLived() - founders,
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
    sea: CONFIG.island ? seaSnapshot(world, all.filter((w) => w.realm === 1)) : undefined,
    climb: CONFIG.climb ? climbSnapshot(world) : undefined,
  };
}

function seaSnapshot(world: World, sea: Warrior[]) {
  const bands = new Array(CONFIG.plateBands).fill(0), armor: number[] = [], counts = new Map<string, number>();
  for (const w of sea) {
    bands[bandOf(world, w.id)]++;
    const a = armorOf(world, w.id);
    armor[a] = (armor[a] ?? 0) + 1;
    const g = genomeOf(world, w.id);
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  for (let a = 0; a < armor.length; a++) armor[a] ??= 0;
  return { alive: sea.length, bands, armor, top: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8) };
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
    ...(s.sea ? [
      `           sea: ${s.sea.alive} alive, by depth band [${s.sea.bands.join(' ')}], armor {${s.sea.armor.map((n, a) => (n ? `${a}K:${n}` : '')).filter(Boolean).join(' ')}}`,
      ...s.sea.top.slice(0, 3).map(([g, n]) => `           ${String(n).padStart(4)} × ${g}`),
    ] : []),
  ];
}

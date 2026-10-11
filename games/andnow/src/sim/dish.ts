// Petri dish settings, shared by the headless runner (dist/petri.mjs) and the viewer
// (?petri=1). In the spirit of Tierra: no score, no reaper; replicators on a plate with
// copy errors (substitutions, insertions, deletions), food, starvation and old age.
// Whatever persists, persists. The plate is MEGA-plate style: clean in the middle, rings
// of rising toxin out to the rim, and armor (K cells) is the only way deeper.
import { CODE } from './glyphs';
import { CONFIG, World } from './world';

export const DISH_DEFAULTS: Record<string, number> = {
  size: 120,      // plate diameter (cells)
  bands: 5,       // toxin levels 0 (middle) … 4 (rim)
  food: 5,        // about one food spot per food² cells
  spawn: 40,      // ticks a food spot needs untouched to regrow
  toxin: 0.001,   // per tick, a cell's chance of dying one toxin level above its warrior's armor…
  step: 10,       // …times this for each further level
  error: 0.02,    // DIVIDE: chance each copied cell becomes a random glyph
  insert: 0.02,   // DIVIDE: chance the child gains a fat cell
  delete: 0.02,   // DIVIDE: chance the child loses a cell
  life: 6000,     // typical lifespan (each warrior's is 50–150% of it)
  cap: 300,       // most warriors alive at once (DIVIDE fails at the cap): keeps it fast
};

/** Apply dish settings; `get(k)` returns an override or null. Returns the settings used. */
export function applyDish(get: (k: string) => string | null): Record<string, number> {
  const o: Record<string, number> = {};
  for (const [k, d] of Object.entries(DISH_DEFAULTS)) { const v = get(k); o[k] = v !== null && v !== '' ? Number(v) : d; }
  CONFIG.plate = o.size;
  CONFIG.plateBands = o.bands;
  CONFIG.plateFood = o.food;
  CONFIG.spawnInterval = o.spawn;
  CONFIG.toxinRate = o.toxin;
  CONFIG.toxinStep = o.step;
  CONFIG.copyError = o.error;
  CONFIG.copyInsert = o.insert;
  CONFIG.copyDelete = o.delete;
  CONFIG.lifespan = o.life;
  CONFIG.maxWarriors = o.cap;
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

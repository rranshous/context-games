// Petri dish: evolution with no score (see src/sim/dish.ts for the rules). One or more
// replicators start in the clean middle of a plate ringed by rising toxin; reports how far
// out life has spread, how much armor it carries, and which genomes are winning.
//
//   node dist/petri.mjs [warriors/amoeba.warrior ...] [--seed 1] [--ticks 100000] [--report 2500]
//                       [--size 160] [--bands 5] [--food 5] [--spawn 40] [--ripen 300] [--ripemax 5] [--toxin 0.001] [--step 10]
//                       [--error 0.02] [--insert 0.02] [--delete 0.02] [--life 6000] [--cap 500]
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { applyDish, armorOf, bandOf, DISH_DEFAULTS } from './sim/dish';
import { glyphOf } from './sim/glyphs';
import { parseWarrior } from './sim/warrior-file';
import { World } from './sim/world';

const args = process.argv.slice(2);
const val = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : null; };
const valued = new Set(['seed', 'ticks', 'report', ...Object.keys(DISH_DEFAULTS)].map((k) => `--${k}`));
const files = args.filter((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]));
if (!files.length) files.push('warriors/amoeba.warrior');
const TICKS = Number(val('ticks') ?? 100000), REPORT = Number(val('report') ?? 2500);
const dish = applyDish(val);

const specs = files.map((f) => parseWarrior(readFileSync(f, 'utf8'), basename(f, '.warrior')));
const world = new World(Number(val('seed') ?? 1), specs);

/** A warrior's genome: its glyph grid, cropped (position-free). */
function genome(id: number): string {
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
  return rows.join('/');
}

const founder = genome(0);
console.log(`petri dish: ${specs.map((s) => s.name).join(', ')} (${founder}), seed ${world.seed}, ${TICKS} ticks; ${Object.entries(dish).map(([k, v]) => `${k} ${v}`).join(', ')}\n`);
console.log('band = toxin level under the IP (0 = clean middle); armor = K cells; the front = outermost band holding 3+ warriors\n');

const report = () => {
  const living = world.living();
  const byBand = new Array(dish.bands).fill(0);
  const armors = new Map<number, number>();
  const counts = new Map<string, number>();
  for (const w of living) {
    byBand[bandOf(world, w.id)]++;
    const a = armorOf(world, w.id);
    armors.set(a, (armors.get(a) ?? 0) + 1);
    const g = genome(w.id);
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  let front = -1;
  byBand.forEach((n, b) => { if (n >= 3) front = b; });
  const deaths: Record<string, number> = {};
  for (const w of world.warriors) if (!w.alive && w.deathReason) { const k = w.deathReason.replace(/ by .*/, '').replace(/ \(.*/, ''); deaths[k] = (deaths[k] ?? 0) + 1; }
  const maxGen = Math.max(0, ...living.map((w) => w.gen));
  console.log(`t${String(world.t).padStart(7)}  alive ${String(living.length).padStart(3)}  births ${String(world.warriors.length - specs.length).padStart(6)}  gen ≤${String(maxGen).padStart(4)}  bands [${byBand.map((n) => String(n).padStart(3)).join(' ')}]  front ${front}  armor {${[...armors.entries()].sort((a, b) => a[0] - b[0]).map(([a, n]) => `${a}K:${n}`).join(' ')}}`);
  console.log(`           deaths: ${Object.entries(deaths).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  for (const [g, n] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)) console.log(`           ${String(n).padStart(3)} × ${g}${g === founder ? '   (founder)' : ''}`);
};

const t0 = Date.now();
while (world.t < TICKS && world.living().length) {
  world.tick();
  if (world.t % REPORT === 0) report();
}
if (world.t % REPORT !== 0) report();
console.log(`\n${world.t} ticks in ${((Date.now() - t0) / 1000).toFixed(0)} s${world.living().length ? '' : ' (extinct)'}`);

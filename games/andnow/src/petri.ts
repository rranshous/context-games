// Petri dish: evolution with no score (see src/sim/dish.ts for the rules). One dish, run
// here; for many seeds at once (on the farm too) use dist/dishes.mjs. One or more
// replicators start in the clean middle of a plate ringed by rising toxin; reports how far
// out life has spread, how much armor it carries, and which genomes are winning.
//
//   node dist/petri.mjs [warriors/amoeba.warrior ...] [--seed 1] [--ticks 100000] [--report 2500]
//                       [--size 160] [--bands 5] [--food 5] [--spawn 40] [--ripen 300] [--ripemax 5] [--toxin 0.001] [--step 10]
//                       [--error 0.02] [--insert 0.02] [--delete 0.02] [--life 6000] [--cap 0 (none)]
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { applyDish, DISH_DEFAULTS, dishSnapshot, formatSnapshot, genomeOf } from './sim/dish';
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

const founder = genomeOf(world, 0);
console.log(`petri dish: ${specs.map((s) => s.name).join(', ')} (${founder}), seed ${world.seed}, ${TICKS} ticks; ${Object.entries(dish).map(([k, v]) => `${k} ${v}`).join(', ')}\n`);
console.log('band = toxin level under the IP (0 = clean middle); armor = K cells; the front = outermost band holding 3+ warriors\n');
const report = () => { for (const line of formatSnapshot(dishSnapshot(world, specs.length), founder)) console.log(line); };

const t0 = Date.now();
while (world.t < TICKS && world.living().length) {
  world.tick();
  if (world.t % REPORT === 0) report();
}
if (world.t % REPORT !== 0) report();
console.log(`\n${world.t} ticks in ${((Date.now() - t0) / 1000).toFixed(0)} s${world.living().length ? '' : ' (extinct)'}`);

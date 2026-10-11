// Dish sweep: many petri dishes (one per seed) at once, on local threads plus the Potluck
// farm (default http://localhost:7700). Each dish is one sequential run, so the farm helps
// when there are more dishes than local threads. Same rules and settings as dist/petri.mjs.
//
//   node dist/dishes.mjs [warriors/amoeba.warrior ...] [--seeds 1-8] [--ticks 100000] [--report 20000]
//                        [--farm URL|off] [dish settings: --size --toxin --cap ... see src/sim/dish.ts]
import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { isMainThread } from 'node:worker_threads';
import { farmArg, Runner, serveWork, ThreadPool } from './ga/runner';
import { DISH_DEFAULTS, formatSnapshot } from './sim/dish';
import { DishOutcome, Work } from './work';

if (!isMainThread) serveWork();
else await main();

async function main() {
  const args = process.argv.slice(2);
  const val = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : null; };
  const valued = new Set(['seeds', 'ticks', 'report', 'farm', ...Object.keys(DISH_DEFAULTS)].map((k) => `--${k}`));
  const files = args.filter((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]));
  if (!files.length) files.push('warriors/amoeba.warrior');
  const [lo, hi] = (val('seeds') ?? '1-8').split('-').map(Number);
  const seeds = Array.from({ length: (hi ?? lo) - lo + 1 }, (_, k) => lo + k);
  const ticks = Number(val('ticks') ?? 100000), report = Number(val('report') ?? 20000);
  const settings: Record<string, string> = {};
  for (const k of Object.keys(DISH_DEFAULTS)) { const v = val(k); if (v !== null) settings[k] = v; }

  const pool = new Runner(new ThreadPool(cpus().length), farmArg(process.argv), 24, `dish sweep, seeds ${seeds[0]}-${seeds[seeds.length - 1]}`);
  await pool.init();
  const warriors = files.map((f) => readFileSync(f, 'utf8'));
  console.log(`dish sweep: seeds ${seeds[0]}–${seeds[seeds.length - 1]}, ${ticks} ticks, ${files.join(', ')}; settings ${JSON.stringify({ ...DISH_DEFAULTS, ...settings })}\n`);
  const t0 = Date.now();
  const { outputs, stats } = await pool.runWorkDetailed<DishOutcome>(
    seeds.map((seed): Work => ({ kind: 'dish', warriors, seed, ticks, report, settings })),
    60 * 60 * 1000, // a dish can take many minutes on a phone
  );
  pool.close();
  outputs.forEach((o, k) => {
    console.log(`== seed ${seeds[k]}${o.extinct ? ' (extinct)' : ''}`);
    for (const s of o.snapshots) for (const line of formatSnapshot(s, o.founder)) console.log(line);
  });
  console.log(`\n${seeds.length} dishes in ${((Date.now() - t0) / 1000).toFixed(0)} s (local ${stats.local}, farm ${stats.farm}, re-run locally ${stats.rerun})`);
}

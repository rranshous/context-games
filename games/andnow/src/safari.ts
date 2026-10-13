// Safari: many petri dishes across a spread of dish settings and founders, on local threads
// plus the Potluck farm, each dish saved as it finishes (runs/safari/<round>/<variant>-s<seed>.json)
// for digging through later. A variant is a name, founder files and dish settings
// (see src/sim/dish.ts); the viewer replays any dish at
// ?petri=1&w=<founders>&seed=<seed>&t=<tick>&<settings>.
//
//   node dist/safari.mjs <round> <variants.json> [--seeds 1-2] [--ticks 400000] [--report 10000] [--threads N (local; default all cores)] [--farm URL|off]
//
// variants.json: [{ "name": "default", "w": ["amoeba"], "settings": { "error": "0.05" } }, ...]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { isMainThread } from 'node:worker_threads';
import { farmArg, Runner, serveWork, ThreadPool } from './ga/runner';
import { DishOutcome, Work } from './work';

if (!isMainThread) serveWork();
else await main();

interface Variant { name: string; w?: string[]; settings?: Record<string, string>; ticks?: number } // ticks: this variant's own length (else --ticks)

async function main() {
  const args = process.argv.slice(2);
  const val = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : null; };
  const [round, file] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
  const variants: Variant[] = JSON.parse(readFileSync(file, 'utf8'));
  const [lo, hi] = (val('seeds') ?? '1-2').split('-').map(Number);
  const seeds = Array.from({ length: (hi ?? lo) - lo + 1 }, (_, k) => lo + k);
  const ticks = Number(val('ticks') ?? 400000), report = Number(val('report') ?? 10000);
  const dir = `runs/safari/${round}`;
  mkdirSync(dir, { recursive: true });

  const jobs = variants.flatMap((v) => seeds.map((seed) => ({ v, seed, path: `${dir}/${v.name}-s${seed}.json` })))
    .filter((j) => !existsSync(j.path)); // a re-run picks up where it left off
  const items = jobs.map(({ v, seed }): Work => ({
    kind: 'dish', seed, ticks: v.ticks ?? ticks, report, settings: v.settings ?? {},
    warriors: (v.w ?? ['amoeba']).map((n) => readFileSync(`warriors/${n}.warrior`, 'utf8')),
  }));
  console.log(`safari ${round}: ${jobs.length} dishes (${variants.length} variants × seeds ${seeds[0]}–${seeds[seeds.length - 1]}), ${ticks} ticks`);

  // Fewer local threads leave more dishes for the farm (local runners take the queue's front at once).
  const pool = new Runner(new ThreadPool(Number(val('threads') ?? cpus().length)), farmArg(process.argv), 24, `safari ${round}`);
  await pool.init();
  const t0 = Date.now();
  let n = 0;
  const { stats } = await pool.runWorkDetailed<DishOutcome>(items, 3 * 60 * 60 * 1000, (i, out) => {
    const { v, seed, path } = jobs[i];
    const url = `?${v.settings?.climb ? 'climb=1' : v.settings?.island ? 'island=1' : 'petri=1'}&w=${(v.w ?? ['amoeba']).join(',')}&seed=${seed}${Object.entries(v.settings ?? {}).map(([k, x]) => `&${k}=${x}`).join('')}`;
    writeFileSync(path, JSON.stringify({ variant: v, seed, ticks: v.ticks ?? ticks, url, ...out }));
    const last = out.snapshots[out.snapshots.length - 1];
    console.log(`[${++n}/${jobs.length} ${((Date.now() - t0) / 60000).toFixed(0)}m] ${v.name} s${seed}: ${out.extinct ? `extinct at ${last.t}` : `${last.alive} alive, ${last.distinct} genomes`}; top ${last.top[0]?.[0] ?? '-'}`);
  }, 1);
  pool.close();
  console.log(`done in ${((Date.now() - t0) / 60000).toFixed(0)} min (local ${stats.local}, farm ${stats.farm}, re-run locally ${stats.rerun})`);
}

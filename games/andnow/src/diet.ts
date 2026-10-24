// Who eats what in a climb run, over time: for comparing runs (say, rich corpses against the
// old kill credit). Reads a bake's checkpoints, any rules version.
//
//   node dist/diet.mjs runs/bake/climb7-s2 runs/bake/climb7-s4 [--every 100000] [--to 900000]
//
// For each run, at every --every ticks: how many bodies live on plants only, meat only, both
// or nothing (their traits: B cells give a taste for meat, more C than B for plants), the
// meat eaters' average and biggest size, and the dead cells lying about (rich: a kill's).
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { loadWorld } from './sim/save';
import { DEBRIS } from './sim/world';

const args = process.argv.slice(2);
const flag = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const every = Number(flag('--every', '50000')), to = Number(flag('--to', 'Infinity'));
if (!args.length) { console.log('usage: node dist/diet.mjs <bake dir> [...] [--every 50000] [--to ticks]'); process.exit(1); }

const pad = (v: string | number, n: number) => String(v).padStart(n);
for (const dir of args) {
  const index = JSON.parse(readFileSync(`${dir}/index.json`, 'utf8')) as { rules?: number; marks: { t: number; file?: string }[] };
  console.log(`\n${basename(dir)} (rules ${index.rules ?? '1-2'})`);
  console.log(`${pad('tick', 8)} ${pad('alive', 6)} ${pad('plants', 7)} ${pad('meat', 6)} ${pad('both', 6)} ${pad('none', 5)}  ${pad('meat %', 6)} ${pad('meat avg', 8)} ${pad('meat max', 8)}  ${pad('dead cells', 10)} ${pad('rich', 6)}`);
  for (const m of index.marks) {
    if (m.t % every || m.t > to || !m.file) continue; // (thinned marks have no file)
    const w = loadWorld(gunzipSync(readFileSync(`${dir}/${m.file}`)));
    let plants = 0, meat = 0, both = 0, none = 0, mCells = 0, mMax = 0;
    for (const b of w.living()) {
      const tr = b.traits;
      if (tr?.meat) { if (tr.plants) both++; else meat++; mCells += b.cellCount; mMax = Math.max(mMax, b.cellCount); }
      else if (tr?.plants) plants++;
      else none++;
    }
    const dead = (w as unknown as { cellSets: Map<number, Set<number>> }).cellSets.get(DEBRIS) ?? new Set<number>();
    let rich = 0;
    if (w.flesh) for (const c of dead) if (w.flesh[c]) rich++;
    const n = w.living().length, eaters = meat + both;
    console.log(`${pad(m.t, 8)} ${pad(n, 6)} ${pad(plants, 7)} ${pad(meat, 6)} ${pad(both, 6)} ${pad(none, 5)}  ${pad(n ? (100 * eaters / n).toFixed(1) : '-', 6)} ${pad(eaters ? (mCells / eaters).toFixed(1) : '-', 8)} ${pad(mMax, 8)}  ${pad(dead.size, 10)} ${pad(w.flesh ? rich : '-', 6)}`);
  }
}

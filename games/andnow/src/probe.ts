// Solo probe: each warrior alone on --seeds boards. Does it get out of the start room,
// through narrow passages, to the food, and does its body change and grow on the way?
// Runs on local threads plus the Potluck farm (default http://localhost:7700).
//
//   node dist/probe.mjs <warriors> [--seeds 20] [--ticks 3000] [--farm URL|off]
import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { basename } from 'node:path';
import { isMainThread } from 'node:worker_threads';
import { farmArg, Runner, serveWork, ThreadPool } from './ga/runner';
import { parseWarrior } from './sim/warrior-file';
import { SoloOutcome, Work } from './work';

if (!isMainThread) serveWork();
else await main();

async function main() {
  const args = process.argv.slice(2);
  const opt = (k: string, d: number) => { const i = args.indexOf(`--${k}`); return i >= 0 ? Number(args[i + 1]) : d; };
  const valued = new Set(['--seeds', '--ticks', '--farm']);
  const files = args.filter((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]));
  const N = opt('seeds', 20), TICKS = opt('ticks', 3000);

  const pool = new Runner(new ThreadPool(cpus().length), farmArg(process.argv));
  await pool.init();
  const texts = files.map((f) => readFileSync(f, 'utf8'));
  const items: Work[] = texts.flatMap((t) => Array.from({ length: N }, (_, k): Work => ({ kind: 'solo', warrior: t, seed: k + 1, ticks: TICKS })));
  const out = await pool.runWork<SoloOutcome>(items);
  pool.close();

  console.log(`Solo probe: ${N} boards, ${TICKS} ticks. Per game: pickups, oozes, flows, grows; peak and final body (cells); boards where its whole body left home / was mostly inside a ≤2-wide passage / got wholly into another room / survived\n`);
  const pad = (s: string | number, n: number) => String(s).padStart(n);
  console.log(`${'warrior'.padEnd(24)}${pad('pickups', 8)}${pad('oozes', 7)}${pad('flows', 7)}${pad('grows', 7)}${pad('peak', 6)}${pad('final', 6)}${pad('left', 6)}${pad('squeeze', 8)}${pad('room', 6)}${pad('alive', 6)}`);
  files.forEach((f, k) => {
    const name = parseWarrior(texts[k], basename(f, '.warrior')).name;
    const rs = out.slice(k * N, (k + 1) * N);
    const per = (g: (r: SoloOutcome) => number) => (rs.reduce((a, r) => a + g(r), 0) / N).toFixed(1);
    const of = (g: (r: SoloOutcome) => boolean) => `${rs.filter(g).length}/${N}`;
    console.log(`${name.slice(0, 23).padEnd(24)}${pad(per((r) => r.pickups), 8)}${pad(per((r) => r.oozes), 7)}${pad(per((r) => r.flows), 7)}${pad(per((r) => r.grows), 7)}${pad(per((r) => r.peak), 6)}${pad(per((r) => r.final), 6)}${pad(of((r) => r.left), 6)}${pad(of((r) => r.squeezed), 8)}${pad(of((r) => r.room), 6)}${pad(of((r) => r.alive), 6)}`);
  });
}

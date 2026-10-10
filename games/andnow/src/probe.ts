// Solo probe: each warrior alone on --seeds boards. Does it get out of the start room,
// through narrow passages, to the food, and does its body change and grow on the way?
//
//   node dist/probe.mjs <warriors> [--seeds 20] [--ticks 3000]
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseWarrior } from './sim/warrior-file';
import { CONFIG, World } from './sim/world';

const args = process.argv.slice(2);
const opt = (k: string, d: number) => { const i = args.indexOf(`--${k}`); return i >= 0 ? Number(args[i + 1]) : d; };
const valued = new Set(['--seeds', '--ticks']);
const files = args.filter((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]));
const N = opt('seeds', 20), TICKS = opt('ticks', 3000);
CONFIG.tickCap = TICKS;

console.log(`Solo probe: ${N} boards, ${TICKS} ticks. Per game: pickups, oozes, flows, grows; peak and final body (cells); boards where it left home / squeezed through a ≤2-wide passage / survived\n`);
const pad = (s: string | number, n: number) => String(s).padStart(n);
console.log(`${'warrior'.padEnd(24)}${pad('pickups', 8)}${pad('oozes', 7)}${pad('flows', 7)}${pad('grows', 7)}${pad('peak', 6)}${pad('final', 6)}${pad('left', 6)}${pad('squeeze', 8)}${pad('alive', 6)}`);
for (const f of files) {
  const spec = parseWarrior(readFileSync(f, 'utf8'), basename(f, '.warrior'));
  const t = { pickups: 0, oozes: 0, flows: 0, grows: 0, peak: 0, final: 0, left: 0, squeezed: 0, alive: 0 };
  for (let seed = 1; seed <= N; seed++) {
    const w = new World(seed, [spec]);
    let peak = 0;
    while (!w.result.over) {
      w.tick();
      const c = w.warriors.reduce((a, x) => a + (x.alive ? x.cellCount : 0), 0);
      if (c > peak) peak = c;
    }
    const team = w.warriors;
    for (const x of team) {
      t.pickups += x.stats.collected; t.oozes += x.stats.oozes; t.flows += x.stats.flows; t.grows += x.stats.grows;
    }
    t.peak += peak;
    t.final += team.reduce((a, x) => a + (x.alive ? x.cellCount : 0), 0);
    if (team.some((x) => x.leftHomeAt !== undefined)) t.left++;
    if (team.some((x) => x.stats.squeezed > 0)) t.squeezed++;
    if (team.some((x) => x.alive)) t.alive++;
  }
  const per = (v: number) => (v / N).toFixed(1);
  console.log(`${spec.name.slice(0, 23).padEnd(24)}${pad(per(t.pickups), 8)}${pad(per(t.oozes), 7)}${pad(per(t.flows), 7)}${pad(per(t.grows), 7)}${pad(per(t.peak), 6)}${pad(per(t.final), 6)}${pad(`${t.left}/${N}`, 6)}${pad(`${t.squeezed}/${N}`, 8)}${pad(`${t.alive}/${N}`, 6)}`);
}

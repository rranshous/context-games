// Headless runner.
//   node dist/headless.mjs warriors/a.warrior warriors/b.warrior [--seed N] [--ticks N] [--frames K] [--glyphs]
//   node dist/headless.mjs --tournament warriors/*.warrior [--seeds N] [--ticks N]
//   node dist/headless.mjs --solo warriors/a.warrior --ticks 500 --frames 100
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { asciiMap, statusLine } from './sim/ascii';
import { runMatch, runTournament } from './sim/match';
import { parseWarrior } from './sim/warrior-file';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string, def: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const valued = new Set(['--seed', '--ticks', '--frames', '--seeds']);
const files = args.filter((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]));
if (!files.length) {
  console.log('usage: node dist/headless.mjs [--tournament|--solo] <warrior files> [--seed N] [--seeds N] [--ticks N] [--frames K] [--glyphs]');
  process.exit(1);
}
const specs = files.map((f) => parseWarrior(readFileSync(f, 'utf8'), basename(f, '.warrior')));
const tickCap = opt('ticks', 0) || undefined;

if (flag('tournament')) {
  const n = opt('seeds', 5);
  const seeds = Array.from({ length: n }, (_, i) => i + 1);
  const { table, pairs, reasons } = runTournament(specs, seeds, tickCap);
  console.log(`Tournament: ${specs.length} warriors, ${n} boards, both seatings\n`);
  for (const r of table) console.log(`${r.name.padEnd(16)} W ${String(r.wins).padStart(3)}  L ${String(r.losses).padStart(3)}  D ${String(r.draws).padStart(3)}`);
  console.log('\nhow matches ended:', Object.entries(reasons).map(([k, v]) => `${k} ${v}`).join(', '));
  console.log('');
  for (const [k, v] of Object.entries(pairs)) {
    const [a, b] = k.split(' vs ');
    console.log(`${k.padEnd(34)} ${a} ${v.a} / ${b} ${v.b} / draw ${v.d}`);
  }
} else {
  const seed = opt('seed', 1);
  const frames = opt('frames', 0);
  const { world, summary } = runMatch(specs, seed, {
    tickCap,
    onTick: (w) => {
      if (frames && w.t % frames === 0) {
        console.log(`\n--- tick ${w.t} --- ${statusLine(w)}`);
        console.log(asciiMap(w, { glyphs: flag('glyphs') }));
      }
    },
  });
  if (frames) {
    console.log(`\n--- final, tick ${world.t} ---`);
    console.log(asciiMap(world, { glyphs: flag('glyphs') }));
  }
  console.log(`\nseed ${seed}, ${summary.ticks} ticks: ${summary.winner ?? 'no winner'} (${summary.reason})`);
  console.log(statusLine(world));
  const kinds: Record<string, number> = {};
  for (const e of world.events) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
  console.log('events:', JSON.stringify(kinds));
  if (flag('events')) for (const e of world.events) console.log(`  t${e.t} ${e.text}`);
}

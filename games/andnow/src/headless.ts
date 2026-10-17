// Headless runner.
//   node dist/headless.mjs warriors/a.warrior warriors/b.warrior [--seed N] [--ticks N] [--frames K] [--glyphs]
//   node dist/headless.mjs --tournament warriors/*.warrior [--seeds N] [--ticks N] [--farm URL|off]
//   node dist/headless.mjs --ffa warriors/*.warrior [--matches 200] [--ticks N] [--farm URL|off]   (4-player free-for-alls)
// Tournaments and FFAs run on local threads plus the Potluck farm (default http://localhost:7700).
//   node dist/headless.mjs --selfmod <warriors> [--seeds N]   (do warriors rewrite themselves mid-match?)
//   node dist/headless.mjs --solo warriors/a.warrior --ticks 500 --frames 100
import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { basename } from 'node:path';
import { isMainThread } from 'node:worker_threads';
import { farmArg, Runner, serveWork, ThreadPool } from './ga/runner';
import { asciiMap, statusLine } from './sim/ascii';
import { PlayMatches, runFfa, runMatch, runTournament } from './sim/match';
import { MatchOutcome, Work } from './work';
import { glyphOf } from './sim/glyphs';
import { parseWarrior } from './sim/warrior-file';
import { World } from './sim/world';

if (!isMainThread) serveWork();
else await main();

async function main() {
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string, def: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const valued = new Set(['--seed', '--ticks', '--frames', '--seeds', '--matches', '--farm']);
const files = args.filter((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]));
if (!files.length) {
  console.log('usage: node dist/headless.mjs [--tournament|--solo] <warrior files> [--seed N] [--seeds N] [--ticks N] [--frames K] [--glyphs]');
  process.exit(1);
}
const specs = files.map((f) => parseWarrior(readFileSync(f, 'utf8'), basename(f, '.warrior')));
const tickCap = opt('ticks', 0) || undefined;

// Many independent matches: local threads plus the farm.
const play: PlayMatches = async (games) => {
  const pool = new Runner(new ThreadPool(cpus().length), farmArg(process.argv), 24, flag('ffa') ? 'free-for-all' : 'tournament');
  await pool.init();
  const texts = new Map(specs.map((s, k) => [s, files[k]]));
  try {
    return await pool.runWork<MatchOutcome>(games.map((g): Work => ({
      kind: 'match', warriors: g.specs.map((sp) => readFileSync(texts.get(sp)!, 'utf8')), names: g.specs.map((sp) => sp.name), seed: g.seed, ticks: tickCap ?? 5000,
    })));
  } finally { pool.close(); }
};

if (flag('selfmod')) {
  // Do warriors rewrite themselves mid-match? Each warrior vs each other given warrior,
  // on --seeds boards: self-modification counters, and the body at the start vs the end,
  // aligned on its body frame (so moving doesn't count as change).
  const n = opt('seeds', 4), cap = tickCap ?? 3000;
  const bodyAt = (w: World, id: number) => {
    const wr = w.warrior(id);
    return new Map(w.cellsOf(id).map((c) => [`${(c % w.w) - wr.ox},${((c / w.w) | 0) - wr.oy}`, glyphOf(w.code[c])]));
  };
  const render = (m: Map<string, string>, other: Map<string, string>, mark: boolean) => {
    const pts = [...m.keys(), ...other.keys()].map((k) => k.split(',').map(Number));
    const x0 = Math.min(...pts.map((p) => p[0])), x1 = Math.max(...pts.map((p) => p[0]));
    const y0 = Math.min(...pts.map((p) => p[1])), y1 = Math.max(...pts.map((p) => p[1]));
    const rows: string[] = [];
    for (let y = y0; y <= y1; y++) {
      let r = '';
      for (let x = x0; x <= x1; x++) {
        const g = m.get(`${x},${y}`);
        r += g === undefined ? ' ' : mark && other.get(`${x},${y}`) !== g ? g : (mark ? '·' : g);
      }
      rows.push(r.replace(/\s+$/, ''));
    }
    return rows;
  };
  console.log(`Self-modification: each warrior vs the others, ${n} boards each, ${cap} ticks\n`);
  for (let a = 0; a < specs.length; a++) {
    const tot = { selfWrites: 0, grows: 0, swaps: 0, flows: 0, oozes: 0, squeezed: 0, changed: 0, games: 0 };
    let best: { changed: number; start: Map<string, string>; end: Map<string, string>; vs: string } | null = null;
    for (let b = 0; b < specs.length; b++) {
      if (a === b && specs.length > 1) continue;
      for (let seed = 1; seed <= n; seed++) {
        const pair = specs.length > 1 ? [specs[a], specs[b]] : [specs[a]];
        const w = new World(seed, pair);
        const start = bodyAt(w, 0);
        let end = start;
        while (!w.result.over && w.t < cap) { w.tick(); if (w.warrior(0).alive) end = bodyAt(w, 0); }
        const st = w.warrior(0).stats;
        let changed = 0;
        for (const [k, g] of end) if (start.has(k) && start.get(k) !== g) changed++;
        tot.selfWrites += st.selfWrites; tot.grows += st.grows; tot.swaps += st.swaps; tot.flows += st.flows; tot.oozes += st.oozes; tot.squeezed += st.squeezed > 0 ? 1 : 0; tot.changed += changed; tot.games++;
        if (!best || changed > best.changed) best = { changed, start, end, vs: specs[b].name };
      }
    }
    const g = Math.max(1, tot.games);
    console.log(`${specs[a].name.padEnd(16)} per game: ${(tot.selfWrites / g).toFixed(1)} self-writes, ${(tot.grows / g).toFixed(1)} grows, ${(tot.swaps / g).toFixed(1)} swaps, ${(tot.flows / g).toFixed(1)} flows, ${(tot.oozes / g).toFixed(1)} oozes; squeezed through a narrow passage in ${(100 * tot.squeezed / g).toFixed(0)}% of games; ${(tot.changed / g).toFixed(1)} of its starting cells end with a different glyph`);
    if (best && best.changed > 0) {
      const s0 = render(best.start, best.start, false), s1 = render(best.end, best.start, true);
      console.log(`  most changed (vs ${best.vs}): start → end (· = unchanged)`);
      for (let k = 0; k < Math.max(s0.length, s1.length); k++) console.log(`    ${(s0[k] ?? '').padEnd(18)}  ${s1[k] ?? ''}`);
    }
  }
} else if (flag('explore')) {
  // How fast does each warrior get out of its start room? Solo, on many boards.
  const n = opt('seeds', 20), cap = tickCap ?? 2000;
  console.log(`Leaving home: each warrior alone, ${n} boards, ${cap} ticks\n`);
  for (const spec of specs) {
    const times: number[] = [];
    for (let seed = 1; seed <= n; seed++) {
      const { world } = runMatch([spec], seed, { tickCap: cap });
      const t = world.warrior(0).leftHomeAt;
      if (t !== undefined) times.push(t);
    }
    times.sort((a, b) => a - b);
    const med = times.length ? times[Math.floor(times.length / 2)] : NaN;
    console.log(`${spec.name.padEnd(16)} left home on ${String(times.length).padStart(2)}/${n} boards   median tick ${isNaN(med) ? '—' : med}`);
  }
} else if (flag('ffa')) {
  const n = opt('matches', 200);
  const { rows, reasons } = await runFfa(specs, n, play);
  console.log(`Free-for-all: ${n} four-player matches among ${specs.length} warriors\n`);
  for (const r of rows) {
    console.log(`${r.name.padEnd(16)} games ${String(r.games).padStart(3)}  win ${(100 * r.wins / Math.max(1, r.games)).toFixed(0).padStart(3)}%  died ${(100 * r.deaths / Math.max(1, r.games)).toFixed(0).padStart(3)}%  kills ${r.kills}`);
  }
  console.log('\nhow matches ended:', Object.entries(reasons).map(([k, v]) => `${k} ${v}`).join(', '));
} else if (flag('tournament')) {
  const n = opt('seeds', 5);
  const seeds = Array.from({ length: n }, (_, i) => i + 1);
  const { table, pairs, reasons } = await runTournament(specs, seeds, play);
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
}

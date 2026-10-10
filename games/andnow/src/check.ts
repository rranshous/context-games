// Golden replay check: the guard for sim changes that must not change behavior
// (e.g. optimizations). Records a fingerprint of the full world state on every tick of
// many matches, then verifies a later build reproduces every one exactly.
//
//   node dist/check.mjs --record golden.json
//   node dist/check.mjs --verify golden.json
//   node dist/check.mjs --bench golden.json     (same matches, no hashing: raw sim speed)
//   node dist/check.mjs --canary golden.json canary.json   (slice for Potluck canaries)
//
// Coverage: every warrior in warriors/ and warriors/evolved/, plus random and mutated
// genomes (so every instruction gets exercised), in duels and 4-player free-for-alls.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mutate, randomGenome, toText } from './ga/genome';
import { GLYPHS } from './sim/glyphs';
import { makeRng } from './sim/rng';
import { parseWarrior } from './sim/warrior-file';
import { World } from './sim/world';
import { Case, CHECKPOINT, replay, Replay, TICKS } from './sim/fingerprint';

function corpus(): Case[] {
  const files = ['warriors', 'warriors/evolved'].flatMap((d) =>
    readdirSync(d).filter((f) => f.endsWith('.warrior')).sort().map((f) => join(d, f)));
  const known = files.map((f) => readFileSync(f, 'utf8'));
  const rng = makeRng(424242);
  const randoms: string[] = [];
  for (let i = 0; i < 40; i++) randoms.push(toText(randomGenome(rng), `rand${i}`));
  for (let i = 0; i < 40; i++) {
    const base = parseWarrior(known[i % known.length]);
    const g = { cells: base.cells.map((c) => ({ ...c })), ip: { ...base.ip }, dir: base.dir };
    for (let k = 0; k < 3; k++) mutate(g, rng);
    randoms.push(toText(g, `mut${i}`));
  }
  const all = [...known, ...randoms];
  const out: Case[] = [];
  const pick = () => all[Math.floor(rng() * all.length)];
  // Every known pair once, then random duels and free-for-alls.
  for (let i = 0; i < known.length; i++) for (let j = i + 1; j < known.length; j++) out.push({ sources: [known[i], known[j]], seed: 1 + out.length });
  for (let k = 0; k < 150; k++) out.push({ sources: [pick(), pick()], seed: 1 + out.length });
  for (let k = 0; k < 100; k++) out.push({ sources: [pick(), pick(), pick(), pick()], seed: 1 + out.length });
  for (const r of randoms.slice(0, 30)) out.push({ sources: [r], seed: 1 + out.length });
  return out;
}

const args = process.argv.slice(2);
const mode = args[0], file = args[1];
if (!['--record', '--verify', '--bench', '--canary'].includes(mode) || !file) {
  console.log('usage: node dist/check.mjs --record|--verify|--bench <golden.json> | --canary <golden.json> <canary.json>');
  process.exit(1);
}
if (mode === '--canary') {
  // A small slice of the golden replays (spread across duels, FFAs and solos) for
  // devices to check themselves against before taking work (see farm-task.ts).
  const g = JSON.parse(readFileSync(file, 'utf8'));
  const picks = g.cases.map((c: Case, i: number) => ({ case: c, final: g.results[i].final, ticks: g.results[i].ticks }))
    .filter((_: unknown, i: number) => i % 29 === 7);
  writeFileSync(args[2], JSON.stringify(picks));
  console.log(`wrote ${picks.length} canary cases to ${args[2]}`);
  process.exit(0);
}
if (mode === '--bench') {
  const cases: Case[] = JSON.parse(readFileSync(file, 'utf8')).cases;
  const t0 = Date.now();
  let ticks = 0;
  for (const c of cases) {
    try {
      const w = new World(c.seed, c.sources.map((s) => parseWarrior(s)));
      while (w.t < TICKS && !w.result.over) w.tick();
      ticks += w.t;
    } catch { /* same cases fail the same way in every build */ }
  }
  const ms = Date.now() - t0;
  console.log(`bench: ${ticks} ticks in ${ms} ms (${(ticks / ms * 1000).toFixed(0)} ticks/s)`);
  process.exit(0);
}
// The corpus is stored in the golden file, so verify replays exactly what was recorded
// even after warriors/ changes.
const cases: Case[] = mode === '--record' ? corpus() : JSON.parse(readFileSync(file, 'utf8')).cases;
const t0 = Date.now();
const results: Replay[] = [];
const glyphs: Record<string, number> = {};
for (const c of cases) {
  try {
    results.push(replay(c, glyphs));
  } catch (e) {
    results.push({ name: `error @${c.seed}: ${(e as Error).message}`, ticks: -1, checkpoints: [], final: 0 });
  }
}
const ms = Date.now() - t0;
const totalTicks = results.reduce((a, r) => a + Math.max(0, r.ticks), 0);

if (mode === '--record') {
  writeFileSync(file, JSON.stringify({ cases, results }));
  console.log(`recorded ${results.length} matches, ${totalTicks} ticks in ${ms} ms`);
  console.log('warrior-ticks by last action:', Object.entries(glyphs).map(([k, v]) => `${k || '(none)'}:${v}`).join(' '), `(glyph table ${GLYPHS.length})`);
} else {
  const golden: Replay[] = JSON.parse(readFileSync(file, 'utf8')).results;
  let bad = 0;
  results.forEach((r, i) => {
    const g = golden[i];
    if (!g || g.name !== r.name || g.ticks !== r.ticks || g.final !== r.final) {
      bad++;
      if (bad <= 10) {
        const at = g ? g.checkpoints.findIndex((c, k) => c !== r.checkpoints[k]) : -1;
        console.log(`MISMATCH ${r.name}: ticks ${g?.ticks}→${r.ticks}; first differing checkpoint ${at < 0 ? 'after last' : `≤ tick ${(at + 1) * CHECKPOINT}`}`);
      }
    }
  });
  console.log(bad ? `FAIL: ${bad}/${results.length} matches differ` : `OK: all ${results.length} matches identical on every tick`);
  console.log(`${totalTicks} ticks in ${ms} ms (${(totalTicks / ms * 1000).toFixed(0)} ticks/s)`);
  process.exit(bad ? 1 : 0);
}

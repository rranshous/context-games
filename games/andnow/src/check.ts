// Golden replay check: the guard for sim changes that must not change behavior
// (e.g. optimizations). Records a fingerprint of the full world state on every tick of
// many matches, then verifies a later build reproduces every one exactly.
//
//   node dist/check.mjs --record golden.json
//   node dist/check.mjs --verify golden.json
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

const TICKS = 2000;
const CHECKPOINT = 50; // also keep the running hash every N ticks, to locate a divergence

function fnv(h: number, v: number): number {
  h ^= v & 0xff; h = Math.imul(h, 16777619);
  h ^= (v >>> 8) & 0xff; h = Math.imul(h, 16777619);
  h ^= (v >>> 16) & 0xff; h = Math.imul(h, 16777619);
  h ^= (v >>> 24) & 0xff; h = Math.imul(h, 16777619);
  return h >>> 0;
}
const fnum = (h: number, x: number) => fnv(fnv(h, Math.floor(x * 1e6)), Math.floor(x * 1e6 / 4294967296));
const fstr = (h: number, s: string) => { for (let i = 0; i < s.length; i++) h = fnv(h, s.charCodeAt(i)); return h; };

/** Fingerprint of everything observable in the world. */
function stateHash(w: World, h: number): number {
  h = fnv(h, w.t);
  for (let i = 0; i < w.owner.length; i++) { h = fnv(h, w.owner[i]); h = fnv(h, w.code[i]); h = fnv(h, w.resource[i]); }
  for (const x of w.warriors) {
    for (const v of [x.alive ? 1 : 0, x.ipX, x.ipY, x.ox, x.oy, x.dir, x.cellCount, x.executed, x.lastOk ? 1 : 0, x.diedAt ?? -1,
      x.stats.collected, x.stats.bombHits, x.stats.poisonWrites, x.stats.kills, x.leftHomeAt ?? -1,
      x.lastHarm?.by ?? -1, x.lastHarm?.t ?? -1]) h = fnv(h, v);
    h = fnum(fnum(fnum(h, x.maxSize), x.speed), x.accum);
    h = fstr(h, x.lastAct + (x.deathReason ?? ''));
    h = fnv(h, x.stack.length);
    for (const v of x.stack) h = fnv(h, v);
  }
  h = fnv(h, w.events.length);
  const e = w.events[w.events.length - 1];
  if (e) h = fstr(h, `${e.t}${e.kind}${e.text}`);
  h = fstr(h, w.result.reason);
  return h;
}

interface Golden { name: string; ticks: number; checkpoints: number[]; final: number }
interface Case { sources: string[]; seed: number }

function runOne(c: Case, glyphs: Record<string, number>): Golden {
  const specs = c.sources.map((s) => parseWarrior(s));
  const seed = c.seed;
  const w = new World(seed, specs);
  let h = 2166136261;
  const checkpoints: number[] = [];
  for (let t = 0; t < TICKS && !w.result.over; t++) {
    w.tick();
    h = stateHash(w, h);
    if (w.t % CHECKPOINT === 0) checkpoints.push(h);
    for (const x of w.warriors) if (x.alive) glyphs[x.lastAct] = (glyphs[x.lastAct] ?? 0) + 1;
  }
  return { name: `${specs.map((s) => s.name).join(' vs ')} @${seed}`, ticks: w.t, checkpoints, final: h };
}

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
if ((mode !== '--record' && mode !== '--verify') || !file) {
  console.log('usage: node dist/check.mjs --record|--verify <golden.json>');
  process.exit(1);
}
// The corpus is stored in the golden file, so verify replays exactly what was recorded
// even after warriors/ changes.
const cases: Case[] = mode === '--record' ? corpus() : JSON.parse(readFileSync(file, 'utf8')).cases;
const t0 = Date.now();
const results: Golden[] = [];
const glyphs: Record<string, number> = {};
for (const c of cases) {
  try {
    results.push(runOne(c, glyphs));
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
  const golden: Golden[] = JSON.parse(readFileSync(file, 'utf8')).results;
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

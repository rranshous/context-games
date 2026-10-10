// Petri dish: evolution inside a single long match. One replicator alone on a board, with
// copy errors on DIVIDE and a reaper (when the population is at the cap, each birth kills
// the oldest living warrior). Corpses become debris, which COLLECT turns back into size.
// Birth, death, variation and competition for food: does selection happen in-game?
//
//   node dist/petri.mjs [warriors/amoeba.warrior ...] [--seed 1] [--ticks 30000] [--cap 40]
//                       [--spawn 40] [--error 0.02] [--life 6000] [--report 2500]
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { glyphOf } from './sim/glyphs';
import { parseWarrior } from './sim/warrior-file';
import { CONFIG, World } from './sim/world';

const args = process.argv.slice(2);
const opt = (k: string, d: number) => { const i = args.indexOf(`--${k}`); return i >= 0 ? Number(args[i + 1]) : d; };
const valued = new Set(['--seed', '--ticks', '--cap', '--spawn', '--error', '--report', '--life']);
const files = args.filter((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]));
if (!files.length) files.push('warriors/amoeba.warrior');
const TICKS = opt('ticks', 30000), REPORT = opt('report', 2500);
CONFIG.reaperCap = opt('cap', 40);
CONFIG.spawnInterval = opt('spawn', 40);
CONFIG.copyError = opt('error', 0.02);
CONFIG.lifespan = opt('life', 6000);
CONFIG.tickCap = TICKS + 1;
CONFIG.endless = true;

// Several replicators = several lineages competing in one dish (each starts in its own corner).
const specs = files.map((f) => parseWarrior(readFileSync(f, 'utf8'), basename(f, '.warrior')));
const spec = specs[0];
const world = new World(opt('seed', 1), specs);

/** A warrior's genome: its glyph grid, cropped (position-free). */
function genome(id: number): string {
  const cells = world.cellsOf(id);
  if (!cells.length) return '';
  const xs = cells.map((c) => c % world.w), ys = cells.map((c) => (c / world.w) | 0);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
  const rows: string[] = [];
  for (let y = y0; y <= y1; y++) {
    let r = '';
    for (let x = x0; x <= x1; x++) { const i = world.idx(x, y); r += world.owner[i] === id ? glyphOf(world.code[i]) : ' '; }
    rows.push(r.replace(/\s+$/, ''));
  }
  return rows.join('/');
}

const founderGenome = genome(0);
console.log(`petri dish: ${spec.name} (${founderGenome}), seed ${world.seed}, ${TICKS} ticks, population cap ${CONFIG.reaperCap}, lifespan ${CONFIG.lifespan}, food every ${CONFIG.spawnInterval} ticks per spot, copy error ${CONFIG.copyError}\n`);

const history: { t: number; living: number; founderShare: number }[] = [];
const report = () => {
  const living = world.warriors.filter((w) => w.alive);
  const counts = new Map<string, number>();
  for (const w of living) { const g = genome(w.id); counts.set(g, (counts.get(g) ?? 0) + 1); }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const births = world.warriors.length - 1;
  const reaped = world.warriors.filter((w) => w.deathReason === 'reaped (oldest)' || w.deathReason === 'old age').length;
  const maxGen = Math.max(0, ...living.map((w) => w.gen));
  const founderShare = (counts.get(founderGenome) ?? 0) / Math.max(1, living.length);
  history.push({ t: world.t, living: living.length, founderShare });
  console.log(`t${String(world.t).padStart(6)}  alive ${String(living.length).padStart(3)}  births ${String(births).padStart(4)}  died ${String(reaped).padStart(4)}  deepest generation ${String(maxGen).padStart(3)}  genomes ${String(counts.size).padStart(3)}  founder's genome ${(100 * founderShare).toFixed(0).padStart(3)}%`);
  if (specs.length > 1) console.log(`           lineages: ${specs.map((s, k) => `${s.name} ${living.filter((w) => w.lineage === k).length}`).join(', ')}`);
  for (const [g, n] of top) console.log(`           ${String(n).padStart(3)} × ${g}${g === founderGenome ? '   (founder)' : ''}`);
};

while (world.t < TICKS && !world.result.over) {
  world.tick();
  if (world.t % REPORT === 0) report();
}
if (world.t % REPORT !== 0) report();
const kinds: Record<string, number> = {};
for (const e of world.events) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
console.log('\nrecent events:', JSON.stringify(kinds));

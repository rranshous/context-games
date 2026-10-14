// Bake a long dish into checkpoints the viewer can jump between.
//
//   node dist/bake.mjs "<viewer query>" <ticks> [--every 1000] [--out runs/bake/<name>] [--resume]
//   e.g. node dist/bake.mjs "climb=1&w=climber,diver,hunter&seed=2" 200000 --out runs/bake/c200k-s2
//
// Writes t<tick>.andnow.gz (the whole world, see src/sim/save.ts) every --every ticks, and
// index.json listing them with a few facts each (who's alive, the biggest body and where).
// --resume carries on from the last checkpoint in --out (same run: the sim is deterministic).
// Open it in the viewer with ?bake=runs/bake/<name>. Same seed and settings as a safari
// dish replay the same run.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { applyDish, genomeOf } from './sim/dish';
import { loadWorld, saveWorld } from './sim/save';
import { parseWarrior } from './sim/warrior-file';
import { World } from './sim/world';
import { BUNDLED } from './warriors';

const args = process.argv.slice(2);
const flag = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const every = Number(flag('--every', '1000'));
const resume = args.includes('--resume');
if (resume) args.splice(args.indexOf('--resume'), 1);
const [query, ticksArg] = args;
const out = flag('--out', '') || args[2] || `runs/bake/${query?.replace(/[^a-z0-9=,]+/gi, '_')}`;
const ticks = Number(ticksArg);
if (!query || !ticks) {
  console.log('usage: node dist/bake.mjs "<viewer query>" <ticks> [--every 1000] [--out dir]');
  process.exit(1);
}

const params = new URLSearchParams(query);
applyDish((k) => params.get(k));
const names = (params.get('w') ?? 'climber,diver,hunter').split(',');
const source = (n: string) => n.startsWith('evo:') ? readFileSync(`warriors/evolved/${n.slice(4)}.warrior`, 'utf8') : BUNDLED[n] ?? readFileSync(`warriors/${n}.warrior`, 'utf8');
let world = new World(Number(params.get('seed')) || 1, names.map((n, i) => parseWarrior(source(n), `warrior${i + 1}`)));

interface Mark { t: number; file: string; alive: number; kb: number; biggest?: { id: number; cells: number; x: number; y: number; name: string; genome: string } }
mkdirSync(out, { recursive: true });
let index = { query, every, ticks, marks: [] as Mark[] };
if (resume && existsSync(`${out}/index.json`)) {
  const old = JSON.parse(readFileSync(`${out}/index.json`, 'utf8')) as typeof index;
  if (old.query !== query || old.every !== every) throw new Error(`${out} is a different bake (${old.query}, every ${old.every})`);
  index = { ...old, ticks };
  world = loadWorld(gunzipSync(readFileSync(`${out}/${old.marks[old.marks.length - 1].file}`)));
  console.log(`resuming at tick ${world.t}`);
} else if (existsSync(`${out}/index.json`)) console.log(`(overwriting ${out})`);

const save = () => {
  const file = `t${String(world.t).padStart(7, '0')}.andnow.gz`;
  const gz = gzipSync(saveWorld(world, query), { level: 6 });
  writeFileSync(`${out}/${file}`, gz);
  let big: Mark['biggest'];
  for (const w of world.living()) if (!big || w.cellCount > big.cells) big = { id: w.id, cells: w.cellCount, x: w.ipX, y: w.ipY, name: w.name, genome: '' };
  if (big) big.genome = genomeOf(world, big.id);
  index.marks.push({ t: world.t, file, alive: world.living().length, kb: Math.round(gz.length / 1024), biggest: big });
  writeFileSync(`${out}/index.json`, JSON.stringify(index));
};

const t0 = Date.now(), tStart = world.t;
if (!resume || !index.marks.length) save();
while (world.t < ticks && world.living().length && !world.result.over) {
  world.tick();
  if (world.t % every === 0) {
    save();
    const m = index.marks[index.marks.length - 1];
    if (world.t % (every * 10) === 0) console.log(`t${world.t} alive ${m.alive} biggest ${m.biggest?.cells ?? 0} · ${((Date.now() - t0) / (world.t - tStart)).toFixed(1)} ms/tick · ${m.kb} KB`);
  }
}
if (world.t % every !== 0) save();
console.log(`done: ${index.marks.length} checkpoints in ${out}`);

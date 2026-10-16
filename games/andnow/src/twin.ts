// Twin check: run the serial engine and another engine side by side from the same start,
// and stop at the first tick where their worlds differ. The acceptance test for any engine:
// it must give the same world as World.tick, bit for bit, on every tick.
//
//   node dist/twin.mjs <start> [--engine par] [--ticks 200]
//
// <start> is a bake folder (its latest checkpoint), a checkpoint file (.andnow.gz), or a
// viewer query for a fresh world (e.g. "climb=1&w=climber,diver,hunter&seed=2").
import { existsSync, readFileSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { applyDish } from './sim/dish';
import { makeEngine } from './sim/engine';
import { loadWorld } from './sim/save';
import { parseWarrior } from './sim/warrior-file';
import { World } from './sim/world';
import { BUNDLED } from './warriors';

const args = process.argv.slice(2);
const flag = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const engineName = flag('--engine', 'par');
const ticks = Number(flag('--ticks', '200'));
const start = args[0];
if (!start) { console.log('usage: node dist/twin.mjs <bake dir | checkpoint.andnow.gz | query> [--engine par] [--ticks 200]'); process.exit(1); }

function open(): World {
  let file = start;
  if (existsSync(start) && statSync(start).isDirectory()) {
    const index = JSON.parse(readFileSync(`${start}/index.json`, 'utf8'));
    file = `${start}/${index.marks[index.marks.length - 1].file}`;
  }
  if (existsSync(file)) return loadWorld(gunzipSync(readFileSync(file)));
  const p = new URLSearchParams(start);
  applyDish((k) => p.get(k));
  const names = (p.get('w') ?? 'climber,diver,hunter').split(',');
  return new World(Number(p.get('seed')) || 1, names.map((n, i) => parseWarrior(BUNDLED[n] ?? readFileSync(`warriors/${n}.warrior`, 'utf8'), `warrior${i + 1}`)));
}

/** The first difference between two values, as a path, or '' if they're the same. */
function diff(a: unknown, b: unknown, path: string, depth = 0): string {
  if (a === b || (Number.isNaN(a) && Number.isNaN(b))) return '';
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return `${path}: ${short(a)} ≠ ${short(b)}`;
  if (ArrayBuffer.isView(a)) {
    const x = a as unknown as ArrayLike<number>, y = b as unknown as ArrayLike<number>;
    if (x.length !== y.length) return `${path}.length: ${x.length} ≠ ${y.length}`;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i] && !(Number.isNaN(x[i]) && Number.isNaN(y[i]))) return `${path}[${i}]: ${x[i]} ≠ ${y[i]}`;
    return '';
  }
  if (a instanceof Set || a instanceof Map) {
    const x = [...a], y = [...(b as Set<unknown>)];
    return diff(x, y, `${path}(${a instanceof Set ? 'set' : 'map'})`, depth + 1);
  }
  if (Array.isArray(a)) {
    const y = b as unknown[];
    if (a.length !== y.length) return `${path}.length: ${a.length} ≠ ${y.length}`;
    for (let i = 0; i < a.length; i++) { const d = diff(a[i], y[i], `${path}[${i}]`, depth + 1); if (d) return d; }
    return '';
  }
  const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  for (const k of keys) {
    if (k === 'spec') { if ((x.spec as { name: string })?.name !== (y.spec as { name: string })?.name) return `${path}.spec`; continue; }
    if (typeof x[k] === 'function') continue;
    const d = diff(x[k], y[k], `${path}.${k}`, depth + 1);
    if (d) return d;
  }
  return '';
}
const short = (v: unknown) => { const s = typeof v === 'object' ? JSON.stringify(v) : String(v); return s && s.length > 80 ? s.slice(0, 80) + '…' : s; };

/** Everything that makes up a world's state (the dead share tombstones, so only the living are walked). */
function compare(a: World, b: World): string {
  const A = a as unknown as Record<string, unknown>, B = b as unknown as Record<string, unknown>;
  for (const k of ['t', 'h', 'w', 'yShift', 'result', 'attacks', 'deaths', 'events'] as const) { const d = diff(A[k], B[k], k); if (d) return d; }
  if (a.rng.state !== b.rng.state) return `rng.state: ${a.rng.state} ≠ ${b.rng.state}`;
  if (a.warriors.length !== b.warriors.length) return `warriors.length: ${a.warriors.length} ≠ ${b.warriors.length}`;
  for (const k of ['owner', 'code', 'resource', 'ripe'] as const) {
    const d = diff(a[k], b[k], k);
    if (d) { const i = Number(d.match(/\[(\d+)\]/)?.[1]); return `${d} (x ${i % a.w}, y ${Math.floor(i / a.w)})`; }
  }
  for (const k of ['spawnTimers', 'tileLast', 'tileActive', 'tileCount', 'activeTiles', 'bornIn']) { const d = diff(A[k], B[k], k); if (d) return d; }
  const la = a.living(), lb = b.living();
  if (la.length !== lb.length) return `living: ${la.length} ≠ ${lb.length}`;
  for (let i = 0; i < la.length; i++) { const d = diff(la[i], lb[i], `living[${i}] (id ${la[i].id})`); if (d) return d; }
  const ca = A.cellSets as Map<number, Set<number>>, cb = B.cellSets as Map<number, Set<number>>;
  for (const wr of la) { const d = diff(ca.get(wr.id), cb.get(wr.id), `cellSets[${wr.id}]`); if (d) return d; }
  return '';
}

const ref = open(), other = makeEngine(engineName, open());
console.log(`twin: serial vs ${other.name} from tick ${ref.t}, ${ref.living().length} alive, ${ticks} ticks`);
let ms = [0, 0];
for (let k = 0; k < ticks; k++) {
  let t0 = performance.now();
  ref.tick();
  ms[0] += performance.now() - t0;
  t0 = performance.now();
  await other.tick();
  ms[1] += performance.now() - t0;
  const d = compare(ref, other.world);
  if (d) { console.log(`DIFFER at tick ${ref.t}: ${d}`); process.exit(1); }
  if ((k + 1) % 50 === 0) console.log(`  t${ref.t} same · serial ${(ms[0] / (k + 1)).toFixed(1)} ms/tick · ${other.name} ${(ms[1] / (k + 1)).toFixed(1)} ms/tick`);
}
other.close?.();
console.log(`SAME for ${ticks} ticks (to t${ref.t}) · serial ${(ms[0] / ticks).toFixed(1)} ms/tick · ${other.name} ${(ms[1] / ticks).toFixed(1)} ms/tick`);

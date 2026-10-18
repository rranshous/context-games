// Save and restore a whole world (checkpoints), so a viewer can jump to tick 150,000
// without simulating its way there. Browser-safe (no Node imports); callers gzip.
//
// The format is a JSON header followed by the raw bytes of every typed array:
//   [u32 header length][header JSON (utf-8)][padding to 8][typed array bytes, each 8-aligned]
// The header holds CONFIG, the viewer's query string, and the world as an object table:
// every object, array, Map, Set and typed array is one entry, and a reference to it is
// {"$r": n}, so shared objects (living list ⊂ warriors, shared specs) stay shared.
import { makeRng } from './rng';
import { Cells, CONFIG, DEBRIS, World } from './world';

type Enc = unknown;
const TYPED = { Int8Array, Uint8Array, Uint16Array, Int32Array, Float32Array, Float64Array } as const;
type TypedName = keyof typeof TYPED;
type Typed = InstanceType<(typeof TYPED)[TypedName]>;

export interface SaveHeader { version: 1; query: string; t: number; config: Enc; root: Enc; table: Enc[]; rng: number }

function num(v: number): Enc { return Number.isFinite(v) ? v : { $n: String(v) }; }

export function saveWorld(world: World, query: string): Uint8Array {
  const table: Enc[] = [];
  const ids = new Map<object, number>();
  const blobs: Typed[] = [];
  let offset = 0;
  const enc = (v: unknown): Enc => {
    if (v === undefined) return { $u: 1 };
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
    if (typeof v === 'number') return num(v);
    if (typeof v === 'function') return { $u: 1 }; // (the rng: saved as its state)
    const o = v as object;
    const seen = ids.get(o);
    if (seen !== undefined) return { $r: seen };
    const id = table.length;
    ids.set(o, id);
    table.push(null);
    let body: Enc;
    if (ArrayBuffer.isView(o)) {
      const name = o.constructor.name as TypedName;
      if (!(name in TYPED)) throw new Error(`can't save a ${name}`);
      offset = Math.ceil(offset / 8) * 8;
      body = { $ta: name, off: offset, len: (o as Typed).length };
      blobs.push(o as Typed);
      offset += (o as Typed).byteLength;
    } else if (Array.isArray(o)) body = { $a: o.map(enc) };
    else if (o instanceof Map) body = { $m: [...o.entries()].map(([k, x]) => [enc(k), enc(x)]) };
    else if (o instanceof Set || o instanceof Cells) body = { $s: [...o].map(enc) }; // (a body's Cells are a Set, saved)
    else {
      const out: Record<string, Enc> = {};
      // (Keys sorted: a save says the same thing however the object came to have its fields.)
      for (const [k, x] of Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) if (x !== undefined && typeof x !== 'function') out[k] = enc(x);
      body = { $o: out };
    }
    table[id] = body;
    return { $r: id };
  };
  const root = enc(world);
  const header: SaveHeader = { version: 1, query, t: world.t, config: enc({ ...CONFIG }), root, table, rng: world.rng.state };
  // (CONFIG went through the same table; that's fine, it's small.)
  const json = new TextEncoder().encode(JSON.stringify(header));
  const start = Math.ceil((4 + json.length) / 8) * 8;
  const out = new Uint8Array(start + offset);
  new DataView(out.buffer).setUint32(0, json.length, true);
  out.set(json, 4);
  let k = 0;
  for (const e of table) {
    const b = e as { $ta?: TypedName; off: number };
    if (!b || !b.$ta) continue;
    const a = blobs[k++];
    out.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), start + b.off);
  }
  return out;
}

/** Just the header (query, tick, config) without rebuilding the world. */
export function readHeader(bytes: Uint8Array): SaveHeader {
  const n = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + n)));
}

/** Rebuild a saved world. Sets CONFIG to the saved one, as the world depends on it. */
export function loadWorld(bytes: Uint8Array): World {
  const header = readHeader(bytes);
  if (header.version !== 1) throw new Error(`unknown save version ${header.version}`);
  const n = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true);
  const start = Math.ceil((4 + n) / 8) * 8;
  const table = header.table as Record<string, Enc>[];
  // Plain objects are the ones JSON.parse made, patched in place: adding properties one by
  // one under computed keys leaves V8 slow dictionary objects, and ticks ran 3× slower.
  const rootId = (header.root as { $r: number }).$r;
  const objs: unknown[] = table.map((e) => {
    if ('$o' in e) return e.$o;
    if ('$ta' in e) {
      const C = TYPED[e.$ta as TypedName];
      const at = bytes.byteOffset + start + (e.off as number);
      return new C(bytes.buffer.slice(at, at + (e.len as number) * C.BYTES_PER_ELEMENT) as ArrayBuffer);
    }
    if ('$a' in e) return [];
    if ('$m' in e) return new Map();
    if ('$s' in e) return new Set();
    throw new Error('bad save entry');
  });
  const dec = (v: Enc): unknown => {
    if (v === null || typeof v !== 'object') return v;
    const o = v as Record<string, unknown>;
    if ('$r' in o) return objs[o.$r as number];
    if ('$u' in o) return undefined;
    if ('$n' in o) return Number(o.$n);
    throw new Error('bad save entry');
  };
  table.forEach((e, i) => {
    const o = objs[i];
    if ('$a' in e) for (const x of e.$a as Enc[]) (o as unknown[]).push(dec(x));
    else if ('$m' in e) for (const [k, x] of e.$m as Enc[][]) (o as Map<unknown, unknown>).set(dec(k), dec(x));
    else if ('$s' in e) for (const x of e.$s as Enc[]) (o as Set<unknown>).add(dec(x));
    else if ('$o' in e) { const r = o as Record<string, unknown>; for (const k in r) r[k] = dec(r[k] as Enc); }
  });
  Object.assign(CONFIG, dec(header.config));
  const world = Object.setPrototypeOf(objs[rootId] as object, World.prototype) as World;
  world.rng = restoreRng(header.rng);
  // Climbs saved before the world could grow: a fixed ±climbSteps world, never shifted.
  const b = world.board as typeof world.board & { climbSteps?: number };
  if (CONFIG.climb && b.stepLo === undefined) {
    b.stepLo = -b.climbSteps!; b.stepHi = b.climbSteps!; delete b.climbSteps;
    b.climbBase = CONFIG.climbBase; b.foodSpacing = CONFIG.plateFood;
  }
  world.yShift ??= 0;
  // Runs on rules before ids by zone (RULES < 3) kept bodies in one array by id: enough to
  // look at them (src/diet.ts compares runs across rules), never to carry them on.
  const old = world as unknown as { warriors?: unknown[] };
  if (old.warriors && !('zoneBodies' in world)) Object.defineProperty(world, 'warrior', { value: (id: number) => old.warriors![id] });
  if ('zoneBodies' in world) world.reshape();
  // Checkpoints from before kill() dropped the dead's empty cell sets carry millions of them.
  const w = world as unknown as { cellSets: Map<number, Set<number> | Cells>; sortedCells: Map<number, number[]> };
  for (const [id, set] of w.cellSets) if (id !== DEBRIS) w.cellSets.set(id, new Cells([...set]));
  for (const [id, set] of w.cellSets) if (!set.size && (id < 0 || !world.warrior(id)?.alive)) w.cellSets.delete(id);
  for (const [id, cells] of w.sortedCells) if (!w.cellSets.has(id)) w.sortedCells.delete(id);
  return world;
}

function restoreRng(state: number) { const r = makeRng(0); r.state = state; return r; }

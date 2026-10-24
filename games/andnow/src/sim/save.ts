// Save and restore a whole world (checkpoints), so a viewer can jump to tick 150,000
// without simulating its way there. Browser-safe (no Node imports); callers gzip.
//
// The format (version 3) is a magic line, the object table, the raw bytes of every typed
// array, then a JSON header:
//   ["andnow save 3\n"][table: one JSON entry per line, tableBytes long][padding to 8]
//   [typed array bytes, each 8-aligned][header JSON (utf-8)][u32 header length]
// The header holds CONFIG, the viewer's query string, and the root of the world's object
// table: every object, array, Map, Set and typed array is one entry, and a reference to it
// is {"$r": n}, so shared objects (living list ⊂ warriors, shared specs) stay shared.
// The table is written breadth first, so each entry is done as it's reached and goes out
// at once: saveChunks hands the save over a piece at a time, and nothing but the
// object→id map is held while it does (a crowded world's save used to need several times
// the world's own memory). The header goes last because only then is the table's length
// known. (Version 1 had the table inside a header at the front, version 2 a line at a time
// after it; both still load.)
import { makeRng } from './rng';
import { Cells, CONFIG, DEBRIS, World } from './world';

type Enc = unknown;
const TYPED = { Int8Array, Uint8Array, Uint16Array, Int32Array, Float32Array, Float64Array } as const;
type TypedName = keyof typeof TYPED;
type Typed = InstanceType<(typeof TYPED)[TypedName]>;

export interface SaveHeader { version: 1 | 2 | 3; query: string; t: number; config: Enc; root: Enc; table?: Enc[]; tableBytes?: number; rng: number }

function num(v: number): Enc { return Number.isFinite(v) ? v : { $n: String(v) }; }

const MAGIC = new TextEncoder().encode('andnow save 3\n');

/** A save, a piece at a time (see the top). The world mustn't change until it's all out. */
export function* saveChunks(world: World, query: string): Generator<Uint8Array> {
  const ids = new Map<object, number>();
  const queue: (object | null)[] = [];
  const blobs: Typed[] = [];
  let offset = 0;
  const ref = (v: unknown): Enc => {
    if (v === undefined) return { $u: 1 };
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
    if (typeof v === 'number') return num(v);
    if (typeof v === 'function') return { $u: 1 }; // (the rng: saved as its state)
    const o = v as object;
    let id = ids.get(o);
    if (id === undefined) { id = queue.length; ids.set(o, id); queue.push(o); }
    return { $r: id };
  };
  const entry = (o: object): Enc => {
    if (ArrayBuffer.isView(o)) {
      const name = o.constructor.name as TypedName;
      if (!(name in TYPED)) throw new Error(`can't save a ${name}`);
      offset = Math.ceil(offset / 8) * 8;
      const e = { $ta: name, off: offset, len: (o as Typed).length };
      blobs.push(o as Typed);
      offset += (o as Typed).byteLength;
      return e;
    }
    if (Array.isArray(o)) return { $a: o.map(ref) };
    if (o instanceof Map) return { $m: [...o.entries()].map(([k, x]) => [ref(k), ref(x)]) };
    if (o instanceof Set || o instanceof Cells) return { $s: [...o].map(ref) }; // (a body's Cells are a Set, saved)
    const out: Record<string, Enc> = {};
    // (Keys sorted: a save says the same thing however the object came to have its fields.)
    for (const [k, x] of Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) if (x !== undefined && typeof x !== 'function') out[k] = ref(x);
    return { $o: out };
  };
  const root = ref(world);
  const config = ref({ ...CONFIG }); // (through the same table; that's fine, it's small)
  const te = new TextEncoder();
  yield MAGIC;
  let tableBytes = 0, chunk = '';
  const flush = () => { const b = te.encode(chunk); tableBytes += b.length; chunk = ''; return b; };
  for (let i = 0; i < queue.length; i++) {
    chunk += JSON.stringify(entry(queue[i]!)) + '\n';
    queue[i] = null;
    if (chunk.length > 1 << 20) yield flush();
  }
  yield flush();
  let at = MAGIC.length + tableBytes;
  const pad = (to: number) => { const z = new Uint8Array(to - at); at = to; return z; };
  const blobAt = Math.ceil(at / 8) * 8;
  yield pad(blobAt);
  for (const a of blobs) {
    yield pad(blobAt + Math.ceil((at - blobAt) / 8) * 8);
    yield new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    at += a.byteLength;
  }
  const header: SaveHeader = { version: 3, query, t: world.t, config, root, tableBytes, rng: world.rng.state };
  const json = te.encode(JSON.stringify(header));
  yield json;
  const n = new Uint8Array(4);
  new DataView(n.buffer).setUint32(0, json.length, true);
  yield n;
}

/** A whole save in one buffer (for small worlds and hashing; a bake streams saveChunks). */
export function saveWorld(world: World, query: string): Uint8Array {
  const parts = [...saveChunks(world, query)];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** Where a save's parts are: its header, and where its table and typed arrays start. */
function layout(bytes: Uint8Array): { header: SaveHeader; tableAt: number; blobAt: number } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), td = new TextDecoder();
  if (MAGIC.every((b, i) => bytes[i] === b)) {
    const n = dv.getUint32(bytes.length - 4, true);
    const header = JSON.parse(td.decode(bytes.subarray(bytes.length - 4 - n, bytes.length - 4))) as SaveHeader;
    return { header, tableAt: MAGIC.length, blobAt: Math.ceil((MAGIC.length + header.tableBytes!) / 8) * 8 };
  }
  const n = dv.getUint32(0, true);
  const header = JSON.parse(td.decode(bytes.subarray(4, 4 + n))) as SaveHeader;
  return { header, tableAt: 4 + n, blobAt: Math.ceil((4 + n + (header.tableBytes ?? 0)) / 8) * 8 };
}

/** Just the header (query, tick, config) without rebuilding the world. */
export function readHeader(bytes: Uint8Array): SaveHeader { return layout(bytes).header; }

/** Rebuild a saved world. Sets CONFIG to the saved one, as the world depends on it. */
export function loadWorld(bytes: Uint8Array): World {
  const { header, tableAt, blobAt: start } = layout(bytes);
  if (![1, 2, 3].includes(header.version)) throw new Error(`unknown save version ${header.version}`);
  const table = (header.table ?? readTable(bytes.subarray(tableAt, tableAt + header.tableBytes!))) as Record<string, Enc>[];
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
  w.sortedCells.clear(); // (a cache: bodies keep theirs on their Cells now)
  return world;
}

// The table's lines, decoded a few MB at a time (cut at a newline) and parsed one by one.
function readTable(bytes: Uint8Array): Enc[] {
  const td = new TextDecoder(), table: Enc[] = [];
  for (let i = 0; i < bytes.length;) {
    let j = Math.min(i + (1 << 23), bytes.length);
    while (j < bytes.length && bytes[j - 1] !== 10) j++;
    const lines = td.decode(bytes.subarray(i, j)).split('\n');
    for (const l of lines) if (l) table.push(JSON.parse(l));
    i = j;
  }
  return table;
}

function restoreRng(state: number) { const r = makeRng(0); r.state = state; return r; }

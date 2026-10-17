// A worker of the parallel engine (src/par.ts). It owns a strip of columns (whole tiles):
// it wakes, regrows and sinks that strip itself, and runs the turns and upkeeps it's dealt,
// in any order their waits allow. Cells are shared memory; bodies it doesn't hold are stale
// copies (or stubs) it never touches until one is sent over.
import { MessagePort, parentPort } from 'node:worker_threads';
import { applyPack, bury, inside, Pack, packBody, provName, stub } from './sim/replica';
import { capsOf, Share } from './sim/schedule';
import { loadWorld } from './sim/save';
import { CONFIG, DEBRIS, Tracker, Warrior, World, WorldEvent } from './sim/world';

const port = parentPort!;
/** (Node 16+; not in this TypeScript lib yet.) */
const waitAsync = (Atomics as unknown as { waitAsync(a: Int32Array, i: number, v: number): { async: boolean; value: Promise<string> | string } }).waitAsync;
let me = 0, K = 1;
let world: World;
let x0 = 0, x1 = 0;                 // my strip of columns
let done: Int32Array, wake: Int32Array, bar: Int32Array;
let peers: (MessagePort | null)[] = [];

/** Bodies I hold (whose copy here is the live one). */
let held = new Set<number>();
/** Children born this tick, by parent, that I hold. */
let children = new Map<number, number[]>();

// Per op: events and deaths tagged with its position, births, deaths.
let events: [number, WorldEvent][] = [];
let deathsOut: [number, string, number][] = [];
let births: number[] = [];  // [prov, pos, seq, lineage]
let died: number[] = [];
let shadow = new Map<string, number>();
let attacks0: [number, number] = [0, 0];
let pos = 0, actor = -1, seq = 0, nextId = 0, endId = 0;

const tracker: Tracker = {
  tile: (k) => { Atomics.add(inside(world).tileCount, k, 1); },
  newId() {
    if (nextId >= endId) throw new Error(`par worker ${me}: out of child ids`);
    const id = nextId++;
    births.push(id, pos, seq++, world.warriors[actor].lineage);
    let l = children.get(actor);
    if (!l) children.set(actor, l = []);
    l.push(id);
    held.add(id);
    return id;
  },
  childName: (id) => provName(id),
  died: (id) => { died.push(id); },
};

function startOutputs() {
  world.events.length = 0; // (begin's, or what came with the world: main has those)
  events = []; deathsOut = []; births = []; died = []; seq = 0;
  shadow = new Map(world.deaths);
  attacks0 = [world.attacks.bombs, world.attacks.poisons];
}
function afterOp(p: number) {
  for (const e of world.events) events.push([p, e]);
  world.events.length = 0;
  for (const [k, n] of world.deaths) { const d = n - (shadow.get(k) ?? 0); if (d) { deathsOut.push([p, k, d]); shadow.set(k, n); } }
}
function outputs() {
  const a = world.attacks;
  return { events, deaths: deathsOut, attacks: [a.bombs - attacks0[0], a.poisons - attacks0[1]], died };
}

// ---------- objects between workers ----------

let arrived = new Int32Array(0);        // packs in, per share item
let itemAt = new Map<number, number>(); // position → share item
let poke: (() => void) | null = null;
let packed: ((j: number) => void) | null = null; // (a body came in for item j: maybe it's ready)
let curStamp = -1;
let early: { stamp: number; items: Items }[] = []; // (packs for a phase I haven't started yet)
type Items = [number, number, Pack[]][]; // [target position, key, packs]
const post = (w: number, items: Items) => peers[w]!.postMessage({ stamp: curStamp, items });

function packKey(key: number): Pack[] {
  if (key >= 0) { held.delete(key); return [packBody(world, key)]; }
  const parent = -1 - key, kids = children.get(parent) ?? [];
  children.delete(parent);
  return kids.map((id) => { held.delete(id); return packBody(world, id); });
}

function onPacks(m: { stamp: number; items: Items }) {
  if (m.stamp !== curStamp) { early.push(m); return; }
  const items = m.items;
  for (const [target, key, packs] of items) {
    for (const p of packs) {
      applyPack(world, p);
      if (!('dead' in p)) held.add(p.id);
    }
    if (key < 0) children.set(-1 - key, packs.filter((p) => !('dead' in p)).map((p) => p.id));
    const j = itemAt.get(target);
    if (j === undefined) throw new Error(`par worker ${me}: packs for position ${target}, not mine`);
    arrived[j]++;
    packed?.(j);
  }
  poke?.();
}

// ---------- running a share ----------

/** Where a phase's time went, for reports: running ops, waiting, everything else; waits. */
let prof = { run: 0, wait: 0, all: 0, waits: 0, passes: 0, yields: 0, yieldMs: 0, scans: 0, setup: 0 };

async function run(share: Share, stamp: number, upkeep: boolean) {
  const tAll = performance.now();
  prof = { run: 0, wait: 0, all: 0, waits: 0, passes: 0, yields: 0, yieldMs: 0, scans: 0, setup: 0 };
  const { ids, pos: P, predOff, preds, packsIn, outOff, outKey, outW, outPos, notify } = share;
  const m = ids.length;
  // Hand over what others need first.
  const first = new Map<number, Items>();
  for (let q = 0; q < share.sendKey.length; q++) {
    const w = share.sendW[q];
    let l = first.get(w);
    if (!l) first.set(w, l = []);
    l.push([share.sendPos[q], share.sendKey[q], packKey(share.sendKey[q])]);
  }
  for (const [w, l] of first) post(w, l);
  // Readiness, kept by events: local waits count down as my ops finish; remote waits are
  // checked only when woken, and only the ones someone is waiting on.
  const localLeft = new Int32Array(m), remoteLeft = new Int32Array(m);
  const succCount = new Int32Array(m + 1);
  const waitersOn = new Map<number, number[]>();
  for (let j = 0; j < m; j++) for (let q = predOff[j]; q < predOff[j + 1]; q++) {
    const p = preds[q], i = itemAt.get(p);
    if (i !== undefined) { localLeft[j]++; succCount[i + 1]++; }
    else if (Atomics.load(done, p) !== stamp) {
      remoteLeft[j]++;
      let l = waitersOn.get(p);
      if (!l) waitersOn.set(p, l = []);
      l.push(j);
    }
  }
  for (let j = 0; j < m; j++) succCount[j + 1] += succCount[j];
  const succ = new Int32Array(succCount[m]), fill = succCount.slice(0, m);
  for (let j = 0; j < m; j++) for (let q = predOff[j]; q < predOff[j + 1]; q++) { const i = itemAt.get(preds[q]); if (i !== undefined) succ[fill[i]++] = j; }
  // Ready ops: first the ones another worker waits on (they're on someone's critical
  // path), then lowest position first.
  const heap: number[] = [], prio = new Float64Array(m);
  for (let j = 0; j < m; j++) prio[j] = (notify[j] ? 0 : 1e9) + j;
  const push = (j: number) => {
    heap.push(j);
    for (let c = heap.length - 1; c > 0;) { const p = (c - 1) >> 1; if (prio[heap[p]] <= prio[heap[c]]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let c = 0; ;) { const l = 2 * c + 1, r = l + 1; let b = c; if (l < heap.length && prio[heap[l]] < prio[heap[b]]) b = l; if (r < heap.length && prio[heap[r]] < prio[heap[b]]) b = r; if (b === c) break; [heap[b], heap[c]] = [heap[c], heap[b]]; c = b; }
    }
    return top;
  };
  let packsDue = 0;
  for (let j = 0; j < m; j++) packsDue += packsIn[j] - arrived[j];
  const remoteDone = () => {
    let freed = false;
    for (const [p, l] of waitersOn) {
      prof.scans++;
      if (Atomics.load(done, p) !== stamp) continue;
      waitersOn.delete(p);
      for (const j of l) { remoteLeft[j]--; check(j); }
      freed = true;
    }
    return freed;
  };
  const queued = new Uint8Array(m);
  const check = (j: number) => { if (!queued[j] && !localLeft[j] && !remoteLeft[j] && arrived[j] >= packsIn[j]) { queued[j] = 1; push(j); } };
  for (let j = 0; j < m; j++) check(j);
  packed = (j) => { packsDue--; check(j); };
  prof.setup = performance.now() - tAll;
  let left = m;
  while (left) {
    let seen = Atomics.load(wake, me);
    while (heap.length) {
      // Someone finished something: free what waited on it now, not once I run dry (a
      // neighbour may be stuck on the chain behind it). Bodies come in as messages, so
      // let those in too.
      const now = Atomics.load(wake, me);
      if (now !== seen) {
        seen = now;
        remoteDone();
        if (packsDue > 0) { const ty = performance.now(); prof.yields++; await new Promise<void>((r) => setImmediate(r)); prof.yieldMs += performance.now() - ty; continue; }
      }
      const j = pop();
      const p = P[j], wr: Warrior | undefined = world.warriors[ids[j]];
      pos = p; actor = ids[j];
      const tr0 = performance.now();
      if (wr && wr.alive && wr.id === ids[j]) { if (upkeep) world.upkeep(wr); else world.turn(wr); }
      prof.run += performance.now() - tr0;
      afterOp(p);
      if (outOff[j + 1] > outOff[j]) {
        const outs = new Map<number, Items>();
        for (let q = outOff[j]; q < outOff[j + 1]; q++) {
          let l = outs.get(outW[q]);
          if (!l) outs.set(outW[q], l = []);
          l.push([outPos[q], outKey[q], packKey(outKey[q])]);
        }
        for (const [w, l] of outs) post(w, l);
      }
      Atomics.store(done, p, stamp);
      for (let mask = notify[j], w = 0; mask; mask >>= 1, w++) if (mask & 1) { Atomics.add(wake, w, 1); Atomics.notify(wake, w); }
      left--;
      for (let q = succCount[j]; q < succCount[j + 1]; q++) { const s2 = succ[q]; localLeft[s2]--; check(s2); }
    }
    if (!left) break;
    if (remoteDone() || heap.length) continue;
    // Nothing can run: wait for a neighbour's op, or a body to arrive.
    const tw0 = performance.now();
    prof.waits++;
    await new Promise<void>((res) => {
      poke = res;
      const r = waitAsync(wake, me, seen);
      if (r.async) void (r.value as Promise<string>).then(() => res()); else res();
    });
    poke = null;
    prof.wait += performance.now() - tw0;
    prof.passes++;
  }
  packed = null;
  prof.all = performance.now() - tAll;
}

/** Everyone through barrier number `n`. */
async function barrier(n: number) {
  if (Atomics.add(bar, 0, 1) + 1 >= n * K) { Atomics.notify(bar, 0); return; }
  for (;;) {
    const v = Atomics.load(bar, 0);
    if (v >= n * K) return;
    const r = waitAsync(bar, 0, v);
    if (r.async) await r.value;
  }
}
let barriers = 0;
let begun: Promise<void> = Promise.resolve();

function setShare(share: Share, stamp: number) {
  arrived = new Int32Array(share.ids.length);
  itemAt = new Map();
  share.pos.forEach((p, j) => itemAt.set(p, j));
  curStamp = stamp;
  const later = early.filter((e) => e.stamp !== stamp), now = early.filter((e) => e.stamp === stamp);
  early = later;
  for (const e of now) onPacks(e);
}

/** My strip's dead cells, in descending index order (bottom rows first). */
function debrisInStrip(): number[] {
  const { owner, w, h } = world, out: number[] = [];
  for (let y = h - 1; y >= 0; y--) { const row = y * w; for (let x = x1 - 1; x >= x0; x--) if (owner[row + x] === DEBRIS) out.push(row + x); }
  return out;
}

const live = (id: number) => { const wr = world.warriors[id]; return !!wr && wr.alive && wr.id === id; };

/** Summaries of the living bodies I hold, in id order. */
function summaries() {
  const io = inside(world), W = world.w;
  const ids = [...held].filter(live).sort((a, b) => a - b);
  const n = ids.length, box = new Int32Array(n * 4), ip = new Int32Array(n * 2), f = new Float64Array(n * 2), harm = new Int32Array(n * 2), caps = new Uint8Array(n);
  ids.forEach((id, k) => {
    const wr = world.warriors[id];
    let bx0 = wr.ipX, by0 = wr.ipY, bx1 = wr.ipX, by1 = wr.ipY;
    for (const c of io.cellSets.get(id) ?? []) { const x = c % W, y = (c / W) | 0; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
    box[k * 4] = bx0; box[k * 4 + 1] = by0; box[k * 4 + 2] = bx1; box[k * 4 + 3] = by1;
    ip[k * 2] = wr.ipX; ip[k * 2 + 1] = wr.ipY;
    f[k * 2] = wr.accum; f[k * 2 + 1] = wr.speed;
    harm[k * 2] = wr.lastHarm ? wr.lastHarm.by : -1; harm[k * 2 + 1] = wr.lastHarm ? wr.lastHarm.t : 0;
    caps[k] = capsOf(world.code, io.cellSets.get(id) ?? []);
  });
  return { ids: Int32Array.from(ids), box, ip, f, harm, caps };
}

type Msg = { type: string; [k: string]: unknown };

port.on('message', async (m: Msg) => {
  try {
    if (m.type === 'load') {
      me = m.k as number; K = m.K as number;
      world = loadWorld(m.bytes as Uint8Array);
      const io = inside(world), sab = m.sab as Record<string, SharedArrayBuffer>;
      world.owner = new Int32Array(sab.owner); world.code = new Uint8Array(sab.code);
      world.resource = new Uint8Array(sab.resource); world.ripe = new Float32Array(sab.ripe);
      io.tileCount = new Uint16Array(sab.tileCount); io.tileActive = new Uint8Array(sab.tileActive); io.tileLast = new Float64Array(sab.tileLast);
      done = new Int32Array(sab.done); wake = new Int32Array(sab.wake); bar = new Int32Array(sab.bar);
      barriers = m.barriers as number;
      const cuts = m.cuts as Int32Array;
      x0 = me ? cuts[me - 1] : 0; x1 = me < cuts.length ? cuts[me] : world.w;
      for (const p of peers) p?.close();
      peers = m.peers as (MessagePort | null)[];
      peers.forEach((p) => p?.on('message', onPacks));
      held = new Set(m.held as Int32Array);
      children = new Map();
      world.track = tracker;
      port.postMessage({ type: 'loaded' });
      return;
    }
    if (m.type === 'begin') {
      world.t = m.t as number;
      for (const id of m.dead as Int32Array) if (!held.has(id) && world.warriors[id]?.alive) bury(world, id, world.warriors[id].lineage);
      begun = (async () => {
        const T = CONFIG.tile;
        if (m.next) world.wakeTiles(m.next as Uint8Array, x0 / T, x1 / T);
        world.regrow();
        await barrier(++barriers);
        if (world.t % CONFIG.sinkEvery === 0) world.sink(debrisInStrip());
        await barrier(++barriers);
      })();
      return;
    }
    if (m.type === 'turns') {
      await begun;
      const share = m.share as Share;
      setShare(share, m.stamp as number);
      startOutputs();
      nextId = m.first as number; endId = m.end as number;
      for (let i = world.warriors.length; i < (m.top as number); i++) world.warriors.push(null as never);
      await run(share, m.stamp as number, false);
      // Bodies harmed this tick (a death in upkeep pays whoever harmed it).
      const harmed: number[] = [];
      for (const id of held) { const wr = world.warriors[id]; if (live(id) && wr.lastHarm?.t === world.t) harmed.push(id, wr.lastHarm.by, wr.lastHarm.t); }
      port.postMessage({ type: 'turned', births, harmed, prof, ...outputs() });
      return;
    }
    if (m.type === 'upkeep') {
      // Children get their ids and names: the holder renames its own (and rewrites their
      // cells); everyone else gets a stub.
      const io = inside(world), base = m.base as number, map = m.map as Int32Array, names = m.names as string[], lin = m.lineage as Int32Array;
      const objs: Warrior[] = [];
      for (let k = 0; k < map.length; k++) {
        const p = map[k], f = base + k;
        const wr = held.has(p) ? world.warriors[p] : null;
        if (wr && wr.id === p) {
          wr.id = f; wr.name = names[k];
          const set = io.cellSets.get(p);
          if (set) { for (const c of set) world.owner[c] = f; io.cellSets.delete(p); io.cellSets.set(f, set); }
          io.sortedCells.delete(p);
          held.delete(p); held.add(f);
          objs.push(wr);
        } else {
          if (wr) held.delete(p); // (a tombstone: born and dead this tick)
          objs.push(wr ?? stub(f, lin[k], names[k]));
        }
      }
      world.warriors.length = base;
      for (const wr of objs) world.warriors.push(wr);
      for (const id of m.dead as Int32Array) if (!held.has(id) && world.warriors[id]?.alive) bury(world, id, world.warriors[id].lineage);
      children = new Map();
      const share = m.share as Share;
      setShare(share, m.stamp as number);
      startOutputs();
      await run(share, m.stamp as number, true);
      port.postMessage({ type: 'kept', sum: summaries(), prof, ...outputs() });
      return;
    }
    if (m.type === 'dead') {
      for (const id of m.dead as Int32Array) if (!held.has(id) && world.warriors[id]?.alive) bury(world, id, world.warriors[id].lineage);
      return;
    }
    if (m.type === 'sync') {
      const io = inside(world), T = CONFIG.tile;
      const packs = [...held].filter(live).map((id) => packBody(world, id));
      const timers: number[] = [];
      io.spawnsInTile.forEach((list, k) => { const tx = k % io.tw; if (tx * T >= x0 && tx * T < x1) for (const s of list) timers.push(s, io.spawnTimers[s]); });
      port.postMessage({ type: 'synced', packs, timers });
      return;
    }
  } catch (e) {
    port.postMessage({ type: 'error', error: String((e as Error).stack ?? e) });
  }
});
port.postMessage({ type: 'ready' });

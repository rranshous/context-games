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
const debug = process.env.PAR_DEBUG ? (...a: unknown[]) => console.error(`[w${me} t${world?.t}]`, ...a) : () => {};
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
  events = []; deathsOut = []; births = []; died = []; seq = 0; diedSeen = 0;
  shadow = new Map(world.deaths);
  attacks0 = [world.attacks.bombs, world.attacks.poisons];
}
let diedSeen = 0;
function afterOp(p: number) {
  if (world.events.length) { for (const e of world.events) events.push([p, e]); world.events.length = 0; }
  if (died.length === diedSeen) return; // (the tally only moves when someone dies)
  diedSeen = died.length;
  for (const [k, n] of world.deaths) { const d = n - (shadow.get(k) ?? 0); if (d) { deathsOut.push([p, k, d]); shadow.set(k, n); } }
}
function outputs() {
  const a = world.attacks;
  return { events, deaths: deathsOut, attacks: [a.bombs - attacks0[0], a.poisons - attacks0[1]], died };
}

// ---------- objects between workers ----------

type Items = [number, number, Pack[]][]; // [target position, key, packs]
let phase: Phase | null = null;
let early: { stamp: number; items: Items }[] = []; // (packs for a phase I haven't started yet)
const post = (w: number, items: Items) => { debug('send to', w, items.map((x) => `${x[0]}:${x[1]}`).join(' ')); peers[w]!.postMessage({ stamp: phase!.stamp, items }); };

function packKey(key: number): Pack[] {
  if (key >= 0) { held.delete(key); return [packBody(world, key)]; }
  const parent = -1 - key, kids = children.get(parent) ?? [];
  children.delete(parent);
  return kids.map((id) => { held.delete(id); return packBody(world, id); });
}

function onPacks(m: { stamp: number; items: Items }) {
  debug('got', m.stamp, phase?.stamp, m.items.map((x) => `${x[0]}:${x[1]}`).join(' '));
  if (!phase || m.stamp !== phase.stamp) { early.push(m); return; }
  for (const [target, key, packs] of m.items) {
    for (const p of packs) {
      applyPack(world, p);
      if (!('dead' in p)) held.add(p.id);
    }
    if (key < 0) children.set(-1 - key, packs.filter((p) => !('dead' in p)).map((p) => p.id));
    phase.packIn(target);
  }
  phase.poke?.();
}

// ---------- running a phase ----------

/** Where a phase's time went, for reports: running ops, waiting, everything else; waits. */
let prof = { run: 0, wait: 0, all: 0, waits: 0, yields: 0, yieldMs: 0, scans: 0 };

/**
 * One phase (a tick's turns, or its upkeeps) on this worker. Its items come in waves; each
 * runs once its waits are done: local ones count down as my items finish, remote ones are
 * checked when I'm woken (only the ones someone is waiting on), and bodies it needs must
 * have come in.
 */
class Phase {
  // Per item (flat, grown as waves come): body, position, bodies to come in and come so far,
  // workers to wake after, local and remote waits left, state (1 queued, 2 ran), priority.
  n = 0;
  ids = new Int32Array(1024); P = new Int32Array(1024); packsIn = new Int32Array(1024); arrived = new Int32Array(1024);
  notify = new Int32Array(1024); localLeft = new Int32Array(1024); remoteLeft = new Int32Array(1024);
  state = new Uint8Array(1024); prio = new Float64Array(1024);
  // Linked lists in flat buffers: an item's local successors, and objects to send after it.
  succHead = new Int32Array(1024); succ = new Buf2(2);   // [to, next]
  outHead = new Int32Array(1024); out = new Buf2(4);     // [key, worker, position, next]
  itemAt = new Map<number, number>();
  waitersOn = new Map<number, number[]>();
  pending = new Map<number, number>(); // packs in for positions not mine yet
  heap: number[] = [];
  packsDue = 0; left = 0; all = false;
  poke: (() => void) | null = null;
  constructor(readonly stamp: number, readonly upkeep: boolean) {}

  private grow(m: number) {
    if (this.n + m <= this.ids.length) return;
    const c = Math.max(this.n + m, this.ids.length * 2);
    const g = <A extends Int32Array | Uint8Array | Float64Array>(a: A): A => { const b = new (a.constructor as new (n: number) => A)(c); b.set(a); return b; };
    this.ids = g(this.ids); this.P = g(this.P); this.packsIn = g(this.packsIn); this.arrived = g(this.arrived);
    this.notify = g(this.notify); this.localLeft = g(this.localLeft); this.remoteLeft = g(this.remoteLeft);
    this.state = g(this.state); this.prio = g(this.prio); this.succHead = g(this.succHead); this.outHead = g(this.outHead);
  }
  private addOut(i: number, key: number, w: number, p: number) {
    const o = this.out, at = o.add(); o.a[at] = key; o.a[at + 1] = w; o.a[at + 2] = p; o.a[at + 3] = this.outHead[i]; this.outHead[i] = at + 1;
  }

  /** A wave of items: the share, and what it adds to items I already have. */
  add(sh: Share, last: boolean) {
    const base = this.n, m = sh.ids.length;
    this.grow(m);
    for (let q = 0; q < m; q++) {
      const j = base + q, p = sh.pos[q];
      this.itemAt.set(p, j);
      this.ids[j] = sh.ids[q]; this.P[j] = p; this.packsIn[j] = sh.packsIn[q]; this.notify[j] = sh.notify[q];
      const pre = this.pending.get(p) ?? 0;
      if (pre) this.pending.delete(p);
      this.arrived[j] = pre;
      this.packsDue += sh.packsIn[q] - pre;
      this.succHead[j] = 0; this.outHead[j] = 0; this.state[j] = 0;
      for (let r = sh.outOff[q + 1] - 1; r >= sh.outOff[q]; r--) this.addOut(j, sh.outKey[r], sh.outW[r], sh.outPos[r]);
      this.prio[j] = (sh.notify[q] ? 0 : 1e9) + p;
      let ll = 0, rl = 0;
      for (let r = sh.predOff[q]; r < sh.predOff[q + 1]; r++) {
        const pp = sh.preds[r], i = this.itemAt.get(pp);
        if (i !== undefined) {
          if (this.state[i] !== 2) { ll++; const sc = this.succ, at = sc.add(); sc.a[at] = j; sc.a[at + 1] = this.succHead[i]; this.succHead[i] = at + 1; }
        } else if (Atomics.load(done, pp) !== this.stamp) {
          rl++;
          let l = this.waitersOn.get(pp);
          if (!l) this.waitersOn.set(pp, l = []);
          l.push(j);
        }
      }
      this.localLeft[j] = ll; this.remoteLeft[j] = rl;
    }
    this.n += m; this.left += m;
    // Hand over what others need first.
    const first = new Map<number, Items>();
    for (let q = 0; q < sh.sendKey.length; q++) {
      const w = sh.sendW[q];
      let l = first.get(w);
      if (!l) first.set(w, l = []);
      l.push([sh.sendPos[q], sh.sendKey[q], packKey(sh.sendKey[q])]);
    }
    for (const [w, l] of first) post(w, l);
    // What this wave adds to earlier items: hand-offs and wake-ups after them (now, if they ran).
    const lo = sh.lateOut, now = new Map<number, Items>();
    for (let r = 0; r < lo.length; r += 4) {
      const i = this.itemAt.get(lo[r])!;
      if (this.state[i] === 2) { let l = now.get(lo[r + 2]); if (!l) now.set(lo[r + 2], l = []); l.push([lo[r + 3], lo[r + 1], packKey(lo[r + 1])]); }
      else this.addOut(i, lo[r + 1], lo[r + 2], lo[r + 3]);
    }
    for (const [w, l] of now) post(w, l);
    const ln = sh.lateNote;
    for (let r = 0; r < ln.length; r += 2) {
      const i = this.itemAt.get(ln[r])!;
      if (this.state[i] === 2) wakeAll(ln[r + 1]);
      else this.notify[i] |= ln[r + 1]; // (its place in the heap stays: any order is right, this one's just a little less quick)
    }
    if (last) this.all = true;
    for (let q = 0; q < m; q++) this.check(base + q);
    this.poke?.();
  }

  packIn(target: number) {
    const j = this.itemAt.get(target);
    if (j === undefined) { this.pending.set(target, (this.pending.get(target) ?? 0) + 1); return; }
    this.arrived[j]++; this.packsDue--;
    this.check(j);
  }

  check(j: number) {
    if (this.state[j] || this.localLeft[j] || this.remoteLeft[j] || this.arrived[j] < this.packsIn[j]) return;
    this.state[j] = 1;
    const heap = this.heap, prio = this.prio;
    heap.push(j);
    for (let c = heap.length - 1; c > 0;) { const p = (c - 1) >> 1; if (prio[heap[p]] <= prio[heap[c]]) break; const x = heap[p]; heap[p] = heap[c]; heap[c] = x; c = p; }
  }
  private pop() {
    const heap = this.heap, prio = this.prio, top = heap[0], last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let c = 0; ;) { const l = 2 * c + 1, r = l + 1; let b = c; if (l < heap.length && prio[heap[l]] < prio[heap[b]]) b = l; if (r < heap.length && prio[heap[r]] < prio[heap[b]]) b = r; if (b === c) break; const x = heap[b]; heap[b] = heap[c]; heap[c] = x; c = b; }
    }
    return top;
  }
  private remoteDone() {
    let freed = false;
    for (const [p, l] of this.waitersOn) {
      prof.scans++;
      if (Atomics.load(done, p) !== this.stamp) continue;
      this.waitersOn.delete(p);
      for (const j of l) { this.remoteLeft[j]--; this.check(j); }
      freed = true;
    }
    return freed;
  }

  async run() {
    const tAll = performance.now(), timing = !!process.env.PAR_DEBUG;
    prof = { run: 0, wait: 0, all: 0, waits: 0, yields: 0, yieldMs: 0, scans: 0 };
    const S = this.succ.a, O = this.out;
    while (!(this.all && !this.left)) {
      let seen = Atomics.load(wake, me);
      while (this.heap.length) {
        // Someone finished something: free what waited on it now, not once I run dry (a
        // neighbour may be stuck on the chain behind it). Bodies and waves come in as
        // messages, so let those in too.
        const nw = Atomics.load(wake, me);
        if (nw !== seen) {
          seen = nw;
          this.remoteDone();
          if (this.packsDue > 0 || !this.all) { const ty = performance.now(); prof.yields++; await new Promise<void>((r) => setImmediate(r)); prof.yieldMs += performance.now() - ty; continue; }
        }
        const j = this.pop();
        const p = this.P[j], id = this.ids[j], wr: Warrior | undefined = world.warriors[id];
        pos = p; actor = id;
        const tr0 = timing ? performance.now() : 0;
        if (wr && wr.alive && wr.id === id) { if (this.upkeep) world.upkeep(wr); else world.turn(wr); }
        if (timing) prof.run += performance.now() - tr0;
        afterOp(p);
        if (this.outHead[j]) {
          const outs = new Map<number, Items>();
          for (let at = this.outHead[j] - 1; at >= 0; at = O.a[at + 3] - 1) { const w = O.a[at + 1]; let l = outs.get(w); if (!l) outs.set(w, l = []); l.push([O.a[at + 2], O.a[at], packKey(O.a[at])]); }
          for (const [w, l] of outs) post(w, l);
        }
        this.state[j] = 2;
        Atomics.store(done, p, this.stamp);
        if (this.notify[j]) wakeAll(this.notify[j]);
        this.left--;
        const sa = this.succ.a;
        for (let at = this.succHead[j] - 1; at >= 0; at = sa[at + 1] - 1) { const s2 = sa[at]; this.localLeft[s2]--; this.check(s2); }
      }
      if (this.all && !this.left) break;
      if (this.remoteDone() || this.heap.length) continue;
      // Nothing can run: wait for a neighbour's op, a body, or the next wave.
      const tw0 = performance.now();
      prof.waits++;
      await new Promise<void>((res) => {
        this.poke = res;
        const r = waitAsync(wake, me, seen);
        if (r.async) void (r.value as Promise<string>).then(() => res()); else res();
      });
      this.poke = null;
      prof.wait += performance.now() - tw0;
    }
    void S;
    prof.all = performance.now() - tAll;
  }
}

/** A growable Int32 list of fixed-size records (add() gives the first slot of a new one). */
class Buf2 {
  a = new Int32Array(1 << 12);
  n = 0;
  constructor(readonly size: number) {}
  add() {
    if (this.n + this.size > this.a.length) { const b = new Int32Array(this.a.length * 2); b.set(this.a); this.a = b; }
    const at = this.n; this.n += this.size; return at;
  }
}

/** Wake the workers in a bitmask. */
function wakeAll(mask: number) {
  for (let w = 0; mask; mask >>= 1, w++) if (mask & 1) { Atomics.add(wake, w, 1); Atomics.notify(wake, w); }
}

/** Start a phase: packs that came early for it go in. */
function startPhase(stamp: number, upkeep: boolean) {
  phase = new Phase(stamp, upkeep);
  const now = early.filter((e) => e.stamp === stamp);
  early = early.filter((e) => e.stamp !== stamp);
  for (const e of now) onPacks(e);
  return phase;
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
      // The first wave: the phase starts now (more waves may come while it runs).
      const ph = startPhase(m.stamp as number, false);
      startOutputs();
      nextId = m.first as number; endId = m.end as number;
      for (let i = world.warriors.length; i < (m.top as number); i++) world.warriors.push(null as never);
      debug('turns: waiting on begin');
      await begun;
      debug('turns: adding', (m.share as Share).ids.length);
      ph.add(m.share as Share, m.last as boolean);
      debug('turns: running, left', ph.left, 'heap', ph.heap.length, 'all', ph.all);
      await ph.run();
      debug('turns: done');
      // Bodies harmed this tick (a death in upkeep pays whoever harmed it).
      const harmed: number[] = [];
      for (const id of held) { const wr = world.warriors[id]; if (live(id) && wr.lastHarm?.t === world.t) harmed.push(id, wr.lastHarm.by, wr.lastHarm.t); }
      port.postMessage({ type: 'turned', births, harmed, prof, ...outputs() });
      return;
    }
    if (m.type === 'wave') {
      const ph = phase!;
      if (ph.stamp !== m.stamp) throw new Error(`par worker ${me}: a wave for ${m.stamp} during ${ph.stamp}`);
      await begun;
      ph.add(m.share as Share, m.last as boolean);
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
      const ph = startPhase(m.stamp as number, true);
      startOutputs();
      ph.add(m.share as Share, true);
      await ph.run();
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

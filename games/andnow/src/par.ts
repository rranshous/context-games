// The parallel engine: one sim on worker threads, giving the same world as the serial
// engine bit for bit (check with `node dist/twin.mjs <start> --engine par`). Node only.
//
// The board is cut into strips of columns, one per worker. Cells are shared memory, one
// copy for everyone; each body is held by one worker at a time and handed on when another
// worker's turn needs it. The main thread holds no live copy: it plans each phase from
// compact summaries of the bodies (src/sim/schedule.ts), renames the tick's children, and
// gathers a whole world only when asked (sync: checkpoints, the twin check).
//
// A tick: main plans the turns → each worker wakes and regrows its strip | sinks its strip |
// runs its turns as their waits allow → main renames the children and plans upkeep → each
// worker runs its upkeeps and sends back summaries. A tick the plan can't cover (the world
// growing, a lineage with no tombstone yet) runs serially here, then the workers reload.
import { MessageChannel, MessagePort, TransferListItem, Worker } from 'node:worker_threads';
import { ENGINES, Engine } from './sim/engine';
import { applyPack, bury, inside, Pack, renameText, stub } from './sim/replica';
import { capsOf, emptySummaries, planUpkeep, Share, stripOf, Summaries, TurnPlan } from './sim/schedule';
import { saveWorld } from './sim/save';
import { CONFIG, DEBRIS, markTiles, World, WorldEvent } from './sim/world';

const debug = process.env.PAR_DEBUG ? (...a: unknown[]) => console.error('[par]', ...a) : () => {};
type Out = { events: [number, WorldEvent][]; deaths: [number, string, number][]; attacks: [number, number]; died: number[] };
type Reply = Out & { type: string; [k: string]: unknown };

/** A share's arrays, handed over rather than copied. */
const shareBuffers = (s: Share): TransferListItem[] => Object.values(s).map((a) => (a as Int32Array).buffer as ArrayBuffer);

export class ThreadEngine implements Engine {
  readonly name = 'par';
  private workers: Worker[] = [];
  private ready: Promise<unknown>;
  private waiting: { type: string; got: Reply[]; res: (r: Reply[]) => void; rej: (e: Error) => void } | null = null;
  private needReseed = true;
  private synced = true;
  private tombsReady = false;
  private S: Summaries = emptySummaries(0);
  private holder = new Int8Array(0); // worker holding each body, by id
  private cuts = new Int32Array(0);
  private sab: Record<string, SharedArrayBuffer> = {};
  private stamp = 0;
  private activeCount = 0;
  private dead: number[] = [];
  /** The last tick, for reports: sync depth, waits across workers, and ms per part. */
  last = { levels: 0, remote: 0, plan: 0, turns: 0, upkeep: 0, serial: false };

  constructor(readonly world: World, readonly threads = 4) {
    const url = new URL('./par-worker.mjs', import.meta.url);
    const ups: Promise<unknown>[] = [];
    for (let k = 0; k < threads; k++) {
      const w = new Worker(url);
      ups.push(new Promise((r) => w.once('message', r)));
      w.on('message', (m: Reply) => this.onMessage(k, m));
      w.on('error', (e) => this.fail(e));
      this.workers.push(w);
    }
    this.ready = Promise.all(ups);
  }

  private fail(e: Error) { if (this.waiting) this.waiting.rej(e); else throw e; }
  private onMessage(k: number, m: Reply) {
    if (m.type === 'error') { this.fail(new Error(`par worker ${k}: ${m.error}`)); return; }
    const wt = this.waiting;
    if (!wt || m.type !== wt.type) return;
    wt.got[k] = m;
    if (wt.got.filter(Boolean).length === this.threads) { this.waiting = null; wt.res(wt.got); }
  }
  /** Wait for each worker's reply of this type (in worker order). */
  private expect(type: string): Promise<Reply[]> {
    return new Promise<Reply[]>((res, rej) => { this.waiting = { type, got: [], res, rej }; });
  }
  /** Post to every worker, and wait for each one's reply (in worker order). */
  private all(type: string, msg: (k: number) => object, transfer: (k: number) => TransferListItem[] = () => []): Promise<Reply[]> {
    const p = new Promise<Reply[]>((res, rej) => { this.waiting = { type, got: [], res, rej }; });
    this.workers.forEach((w, k) => w.postMessage(msg(k), transfer(k)));
    return p;
  }

  /** Below this many living bodies a tick runs serially here (threads cost more than they save on a small world). */
  readonly minBodies = Number(process.env.ANDNOW_PAR_MIN ?? 8000);
  private big = false;

  /** The plan covers a climb with no global caps, once every lineage has its tombstone, on a world big enough to pay. */
  private parallelOk(t: number) {
    const w = this.world;
    if (!CONFIG.climb || !CONFIG.endless || CONFIG.maxWarriors !== Infinity || CONFIG.reaperCap > 0 || t >= CONFIG.tickCap) return false;
    // (Hysteresis: in at minBodies, out below half that; each switch reloads the workers.)
    const alive = this.needReseed ? w.living().length : this.S.n;
    this.big = this.big ? alive >= this.minBodies / 2 : alive >= this.minBodies;
    if (!this.big) return false;
    if (!this.tombsReady) {
      if (!this.synced) return false;
      const tombs = inside(w).tombstones;
      for (const wr of w.warriors) if (wr && wr.gen === 0 && !tombs.has(wr.id)) return false;
      this.tombsReady = true;
    }
    // A tick that grows the world (World.growClimb) runs serially.
    if (t % 100 === 0) {
      const S = this.needReseed ? null : this.S;
      let top = Infinity, bottom = -1;
      if (S) for (let s = 0; s < S.n; s++) { if (S.ipY[s] < top) top = S.ipY[s]; if (S.ipY[s] > bottom) bottom = S.ipY[s]; }
      else for (const wr of w.living()) { if (wr.ipY < top) top = wr.ipY; if (wr.ipY > bottom) bottom = wr.ipY; }
      if (top < 256 || bottom >= w.h - 256) return false;
    }
    return true;
  }

  async tick() {
    await this.ready;
    const w = this.world;
    if (w.result.over) return;
    if (!this.parallelOk(w.t + 1)) {
      if (!this.synced) await this.sync();
      w.tick();
      this.needReseed = true;
      this.last = { levels: 0, remote: 0, plan: 0, turns: 0, upkeep: 0, serial: true };
      return;
    }
    if (this.needReseed) await this.reseed();
    this.synced = false;
    const t = ++w.t, K = this.threads, io = inside(w), S = this.S;
    const t0 = performance.now();
    // Tiles: marked from every body's IP (World.refreshTiles); each worker wakes its own.
    let next: Uint8Array | null = null;
    if (t % 20 === 1 || !this.activeCount) {
      io.tileCount.fill(0);
      const ips = Array.from({ length: S.n }, (_, s) => ({ ipX: S.ipX[s], ipY: S.ipY[s] }));
      next = markTiles(ips, io.tileCount, io.tw, io.tileActive.length);
      io.activeTiles = [];
      next.forEach((v, k) => { if (v) io.activeTiles.push(k); });
      this.activeCount = io.activeTiles.length;
    }
    // The workers wake, regrow and sink their strips while the turns are planned here.
    const dead = Int32Array.from(this.dead);
    this.dead = [];
    for (const wk of this.workers) wk.postMessage({ type: 'begin', t, next, dead });
    // Turns.
    const n = S.n, order = new Int32Array(n);
    for (let k = 0; k < n; k++) order[k] = (t + k) % n;
    const hold = this.holder;
    const plan = new TurnPlan({ w: w.w, h: w.h, t, tw: io.tw, tileCount: io.tileCount }, S, order, this.cuts, K, (id) => hold[id]);
    const base = w.warriors.length;
    // Provisional child ids, clear of the final ones (base, base + 1, ...) they're renamed to.
    const first = new Int32Array(K + 1);
    first[0] = base + plan.room.reduce((x, y) => x + y, 0);
    for (let k = 0; k < K; k++) first[k + 1] = first[k] + plan.room[k];
    const turnStamp = ++this.stamp;
    // In waves, front of the order first: the workers start on one while the next is planned.
    const replies = this.expect('turned');
    const waves = Math.max(1, Math.min(8, Math.floor(n / 2000)));
    for (let v = 0; v < waves; v++) {
      const a = Math.floor((v * n) / waves), bEnd = Math.floor(((v + 1) * n) / waves), last = v === waves - 1;
      const shares = plan.wave(a, bEnd);
      shares.forEach((share, k) => this.workers[k].postMessage(v ? { type: 'wave', share, stamp: turnStamp, last } : { type: 'turns', share, stamp: turnStamp, first: first[k], end: first[k + 1], top: first[K], provBase: first[0], last }, shareBuffers(share)));
    }
    const keyHolder = plan.holders();
    const t1 = performance.now();
    const turned = await replies;
    const t2 = performance.now();
    // Children: ids and names in turn order, as the serial tick has them.
    const births: [number, number, number, number][] = [];
    for (const r of turned) { const b = r.births as number[]; for (let q = 0; q < b.length; q += 4) births.push([b[q], b[q + 1], b[q + 2], b[q + 3]]); }
    births.sort((a, b) => a[1] - b[1] || a[2] - b[2]);
    const map = new Map<number, number>(), names: string[] = [];
    w.warriors.length = base;
    births.forEach(([p, , , lineage], k) => {
      map.set(p, base + k);
      const name = w.childName(lineage);
      names.push(name);
      w.warriors.push(stub(base + k, lineage, name));
    });
    const fin = (id: number) => map.get(id) ?? id;
    const nameOf = (p: number) => w.warriors[fin(p)]?.name ?? '?';
    // Who holds what now; who died; who was harmed.
    if (hold.length < base + births.length) { const a = new Int8Array(Math.max(base + births.length, hold.length * 2)); a.set(hold); this.holder = a; }
    const holder = this.holder;
    for (let s = 0; s < n; s++) holder[S.id[s]] = keyHolder[s];
    for (const [p, pos] of births) {
      const h = keyHolder[n + order[pos]];
      if (h < 0) {
        const s = order[pos], T = CONFIG.tile;
        throw new Error(`par: body ${S.id[s]} had a child the plan said it couldn't (caps ${S.caps[s]}, accum ${S.accum[s]}, speed ${S.speed[s]}, box ${Array.from(S.box.subarray(s * 4, s * 4 + 4))}, ip tile count ${io.tileCount[Math.floor(S.ipY[s] / T) * io.tw + Math.floor(S.ipX[s] / T)]}, refresh ${!!next}, t ${t}, crowd ${CONFIG.crowd})`);
      }
      holder[fin(p)] = h;
    }
    const diedT = new Set<number>();
    for (const r of turned) for (const id of r.died) diedT.add(fin(id));
    const harm = new Map<number, [number, number]>();
    for (const r of turned) { const h = r.harmed as number[]; for (let q = 0; q < h.length; q += 3) harm.set(fin(h[q]), [h[q + 1], h[q + 2]]); }
    this.merge(turned, (e) => { if (e.who !== undefined) e.who = fin(e.who); e.text = renameText(e.text, nameOf); });
    for (const id of diedT) bury(w, id, w.warriors[id].lineage);
    // Upkeep: everyone alive, in id order.
    const ids: number[] = [], hb: number[] = [], ht: number[] = [];
    for (let s = 0; s < n; s++) {
      const id = S.id[s];
      if (diedT.has(id)) continue;
      const h = harm.get(id);
      ids.push(id); hb.push(h ? h[0] : S.harmBy[s]); ht.push(h ? h[1] : S.harmT[s]);
    }
    births.forEach((_, k) => { const f = base + k; if (diedT.has(f)) return; const h = harm.get(f); ids.push(f); hb.push(h ? h[0] : -1); ht.push(h ? h[1] : 0); });
    const up = planUpkeep(t, Int32Array.from(ids), Int32Array.from(hb), Int32Array.from(ht), K, (id) => holder[id]);
    const upStamp = ++this.stamp;
    const t3 = performance.now();
    const kept = await this.all('kept', (k) => ({
      type: 'upkeep', base, map: Int32Array.from(births, (b) => b[0]), names, lineage: Int32Array.from(births, (b) => b[3]),
      dead: Int32Array.from(diedT), share: up.shares[k], stamp: upStamp,
    }), (k) => shareBuffers(up.shares[k]));
    const t4 = performance.now();
    this.merge(kept);
    // Next tick's summaries: everyone's, merged in id order (each worker's come sorted).
    type Sum = { ids: Int32Array; box: Int32Array; ip: Int32Array; f: Float64Array; harm: Int32Array; caps: Uint8Array };
    const parts = kept.map((r) => r.sum as Sum), at = new Int32Array(K);
    const N = emptySummaries(parts.reduce((a, p) => a + p.ids.length, 0));
    for (let i = 0; i < N.n; i++) {
      let k = -1;
      for (let j = 0; j < K; j++) if (at[j] < parts[j].ids.length && (k < 0 || parts[j].ids[at[j]] < parts[k].ids[at[k]])) k = j;
      const s = parts[k], q = at[k]++, id = s.ids[q];
      N.id[i] = id; holder[id] = k;
      N.ipX[i] = s.ip[q * 2]; N.ipY[i] = s.ip[q * 2 + 1];
      N.box[i * 4] = s.box[q * 4]; N.box[i * 4 + 1] = s.box[q * 4 + 1]; N.box[i * 4 + 2] = s.box[q * 4 + 2]; N.box[i * 4 + 3] = s.box[q * 4 + 3];
      N.accum[i] = s.f[q * 2]; N.speed[i] = s.f[q * 2 + 1];
      N.harmBy[i] = s.harm[q * 2]; N.harmT[i] = s.harm[q * 2 + 1]; N.caps[i] = s.caps[q];
    }
    for (let i = 1; i < N.n; i++) if (N.id[i] <= N.id[i - 1]) throw new Error(`par: body ${N.id[i]} held by two workers (t${t})`);
    this.S = N;
    for (const r of kept) for (const id of r.died) { bury(w, id, w.warriors[id].lineage); this.dead.push(id); }
    this.last = { levels: Math.max(plan.levels, up.levels), remote: plan.remote, plan: (t1 - t0) + (t3 - t2), turns: t2 - t1, upkeep: t4 - t3, serial: false };
    const pf = (rs: Reply[]) => rs.map((r) => { const p = r.prof as Record<string, number>; return `${p.run.toFixed(0)}/${p.wait.toFixed(0)}/${p.all.toFixed(0)} w${p.waits} y${p.yields}:${p.yieldMs.toFixed(0)} s${p.scans}`; }).join(' ');
    if (process.env.PAR_DEBUG) debug(`  run/wait/all ms: turns ${pf(turned)} · upkeep ${pf(kept)}`);
    debug(`t${t} n${n} levels ${plan.levels} remote ${plan.remote} · plan ${(t1 - t0).toFixed(0)} turns ${(t2 - t1).toFixed(0)} relabel+plan ${(t3 - t2).toFixed(0)} upkeep ${(t4 - t3).toFixed(0)} merge ${(performance.now() - t4).toFixed(0)} ms`);
  }

  /** A phase's events, deaths and attacks into the world, in serial order. */
  private merge(replies: Reply[], fix?: (e: WorldEvent) => void) {
    const w = this.world, events: [number, number, WorldEvent][] = [], deaths: [number, number, string, number][] = [];
    let seq = 0;
    for (const r of replies) {
      for (const [p, e] of r.events) events.push([p, seq++, e]);
      for (const [p, k, d] of r.deaths) deaths.push([p, seq++, k, d]);
      w.attacks.bombs += r.attacks[0]; w.attacks.poisons += r.attacks[1];
    }
    events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    deaths.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [, , e] of events) {
      fix?.(e);
      w.events.push(e);
      if (w.events.length > 2000) w.events.splice(0, 500);
    }
    for (const [, , k, d] of deaths) w.deaths.set(k, (w.deaths.get(k) ?? 0) + d);
  }

  /** Make `world` whole: every body from whoever holds it, and the spawn timers. */
  async sync() {
    await this.ready;
    if (this.synced) return;
    const w = this.world, io = inside(w);
    const got = await this.all('synced', () => ({ type: 'sync' }));
    for (const r of got) {
      for (const p of r.packs as Pack[]) applyPack(w, p);
      const tm = r.timers as number[];
      for (let q = 0; q < tm.length; q += 2) io.spawnTimers[tm[q]] = tm[q + 1];
    }
    io.livingList = Array.from(this.S.id, (id) => w.warriors[id]);
    io.livingDirty = false;
    io.sortedCells.clear();
    const debris = new Set<number>();
    for (let i = 0; i < w.owner.length; i++) if (w.owner[i] === DEBRIS) debris.add(i);
    io.cellSets.set(DEBRIS, debris);
    this.synced = true;
  }

  /** Hand the world (whole here) to the workers: cells into shared memory, strips re-cut. */
  private async reseed() {
    const w = this.world, io = inside(w), K = this.threads, T = CONFIG.tile;
    const shared = <A extends ArrayLike<number> & { BYTES_PER_ELEMENT: number }>(name: string, a: A, C: new (b: SharedArrayBuffer) => A & { set(x: ArrayLike<number>): void }): A => {
      const buf = new SharedArrayBuffer(a.length * a.BYTES_PER_ELEMENT);
      const out = new C(buf);
      out.set(a);
      this.sab[name] = buf;
      return out;
    };
    w.owner = shared('owner', w.owner, Int32Array); w.code = shared('code', w.code, Uint8Array);
    w.resource = shared('resource', w.resource, Uint8Array); w.ripe = shared('ripe', w.ripe, Float32Array);
    io.tileCount = shared('tileCount', io.tileCount, Uint16Array); io.tileActive = shared('tileActive', io.tileActive, Uint8Array);
    io.tileLast = shared('tileLast', io.tileLast, Float64Array);
    this.sab.done ??= new SharedArrayBuffer(4 << 22);
    this.sab.provLineage ??= new SharedArrayBuffer(4 << 22);
    this.sab.wake ??= new SharedArrayBuffer(4 * K);
    this.sab.bar = new SharedArrayBuffer(4);
    // Summaries, from the whole world here.
    const living = w.living();
    const S = emptySummaries(living.length);
    living.forEach((wr, s) => {
      S.id[s] = wr.id; S.ipX[s] = wr.ipX; S.ipY[s] = wr.ipY;
      let bx0 = wr.ipX, by0 = wr.ipY, bx1 = wr.ipX, by1 = wr.ipY;
      for (const c of io.cellSets.get(wr.id) ?? []) { const x = c % w.w, y = (c / w.w) | 0; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
      S.box[s * 4] = bx0; S.box[s * 4 + 1] = by0; S.box[s * 4 + 2] = bx1; S.box[s * 4 + 3] = by1;
      S.accum[s] = wr.accum; S.speed[s] = wr.speed;
      S.harmBy[s] = wr.lastHarm ? wr.lastHarm.by : -1; S.harmT[s] = wr.lastHarm ? wr.lastHarm.t : 0;
      S.caps[s] = capsOf(w.code, io.cellSets.get(wr.id) ?? []);
    });
    this.S = S;
    // Strips: whole tile columns, about as many bodies in each.
    const xs = Array.from(S.ipX).sort((a, b) => a - b), tws = io.tw;
    const cuts: number[] = [];
    for (let k = 1; k < K; k++) {
      let c = Math.round((xs[Math.floor((k * xs.length) / K)] ?? 0) / T);
      c = Math.max(c, (cuts.length ? cuts[cuts.length - 1] / T : 0) + 1);
      cuts.push(Math.min(c, tws - (K - k)) * T);
    }
    this.cuts = Int32Array.from(cuts);
    this.holder = new Int8Array(w.warriors.length * 2).fill(-1);
    const held: number[][] = Array.from({ length: K }, () => []);
    for (let s = 0; s < S.n; s++) { const k = stripOf(this.cuts, S.ipX[s]); this.holder[S.id[s]] = k; held[k].push(S.id[s]); }
    this.activeCount = io.activeTiles.length;
    // Every pair of workers gets a channel of its own.
    const peers: (MessagePort | null)[][] = Array.from({ length: K }, () => new Array<MessagePort | null>(K).fill(null));
    for (let a = 0; a < K; a++) for (let b = a + 1; b < K; b++) { const ch = new MessageChannel(); peers[a][b] = ch.port1; peers[b][a] = ch.port2; }
    const bytes = saveWorld(w, '');
    await this.all('loaded', (k) => ({ type: 'load', k, K, bytes, sab: this.sab, cuts: this.cuts, peers: peers[k], held: Int32Array.from(held[k]), barriers: 0 }),
      (k) => peers[k].filter((p): p is MessagePort => !!p));
    debug(`reseeded at t${w.t}: ${S.n} bodies, strips at ${cuts.join(', ')}`);
    this.needReseed = false;
    this.synced = true;
    this.dead = [];
  }

  close() { for (const x of this.workers) void x.terminate(); }
}

const threadsFromEnv = () => Number(process.env.ANDNOW_THREADS) || 4;
ENGINES.par = (w) => new ThreadEngine(w, threadsFromEnv());

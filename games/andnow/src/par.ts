// The parallel engine: one sim, its turns spread over worker threads, giving the same
// world as the serial engine bit for bit (check with `node dist/twin.mjs <start> --engine par`).
// Node only. See src/sim/schedule.ts for how a tick is cut up, src/sim/replica.ts for how
// the replicas stay in step, and docs/journal.md ("scaling one sim out") for the why.
//
// The main thread keeps a replica too (the one the caller sees, for checkpoints and
// stats): it plans each tick's turns, and every batch a worker sends goes through it,
// applied here and passed on to the others. That one hub keeps batches in an order
// everyone can apply them in.
import { Worker } from 'node:worker_threads';
import { ENGINES, Engine } from './sim/engine';
import { applyBatch, Batch, inside, mergeOutputs, relabel } from './sim/replica';
import { planTurns } from './sim/schedule';
import { saveWorld } from './sim/save';
import { CONFIG, World } from './sim/world';

const debug = process.env.PAR_DEBUG ? (...a: unknown[]) => console.error('[main]', ...a) : () => {};

export class ThreadEngine implements Engine {
  readonly name = 'par';
  private workers: Worker[] = [];
  private ready: Promise<unknown>;
  private onOk: (() => void) | null = null;
  private oks = 0;
  private turnPhase = -1;
  private base = 0;
  private births: number[] = [];
  private batches: Batch[] = [];
  private done = 0;
  private finish: ((e?: Error) => void) | null = null;
  private tombsReady = false;
  /** Per tick: levels (sync depth), plan ms, ms waiting on workers. For reports. */
  last = { levels: 0, plan: 0, turns: 0, upkeep: 0, serial: false };

  constructor(readonly world: World, readonly threads = 4) {
    const bytes = saveWorld(world, '');
    const url = new URL('./par-worker.mjs', import.meta.url);
    const ups: Promise<unknown>[] = [];
    for (let k = 0; k < threads; k++) {
      const w = new Worker(url, { workerData: { k, K: threads, bytes } });
      w.on('message', (m) => this.onMessage(k, m));
      w.on('exit', (c) => debug('worker', k, 'exit', c));
      w.on('error', (e) => { if (this.finish) this.finish(e); else throw e; });
      ups.push(new Promise((r) => w.once('message', r)));
      this.workers.push(w);
    }
    this.ready = Promise.all(ups);
  }

  private onMessage(from: number, m: { type: string; b?: Batch }) {
    if (m.type === 'ok') {
      const t = (m as { t?: number }).t;
      if (t !== this.world.t) throw new Error(`par: worker ${from} at t${t}, main at t${this.world.t}`);
      if (++this.oks === this.threads) this.onOk?.();
      return;
    }
    if (m.type !== 'batch') return;
    const b = m.b!;
    for (let k = 0; k < this.threads; k++) if (k !== from) this.workers[k].postMessage({ type: 'batch', b });
    applyBatch(this.world, b);
    this.batches.push(b);
    if (b.births.length) this.births = this.births.concat(b.births);
    if (!b.done || ++this.done < this.threads) return;
    // A phase is in.
    const batches = this.batches;
    this.batches = []; this.done = 0;
    if (b.phase === this.turnPhase) {
      const map = relabel(this.world, this.base, this.births);
      mergeOutputs(this.world, batches, map);
      this.births = [];
      this.mark = performance.now();
    } else {
      mergeOutputs(this.world, batches);
      this.finish?.();
    }
  }
  private mark = 0;

  /** The parallel tick needs a climb, no global caps, and every lineage's tombstone made. */
  private parallelOk() {
    const w = this.world;
    if (!CONFIG.climb || !CONFIG.endless || CONFIG.maxWarriors !== Infinity || CONFIG.reaperCap > 0) return false;
    if (!this.tombsReady) {
      const tombs = inside(w).tombstones;
      let all = true;
      for (const wr of w.living()) if (wr.gen > 0 && !tombs.has(wr.lineage)) return false;
      for (const wr of w.warriors) if (wr && wr.gen === 0 && !tombs.has(wr.id)) { all = false; break; }
      this.tombsReady = all;
    }
    return true;
  }

  async tick() {
    debug('tick start', this.world.t);
    await this.ready;
    const w = this.world;
    debug('ready');
    if (w.result.over) return;
    if (!this.parallelOk()) {
      this.last = { levels: 0, plan: 0, turns: 0, upkeep: 0, serial: true };
      this.oks = 0;
      debug('serial tick', w.t + 1);
      const ok = new Promise<void>((r) => { this.onOk = r; });
      for (const x of this.workers) x.postMessage({ type: 'serial' });
      w.tick();
      await ok;
      return;
    }
    debug('parallel tick', w.t + 1);
    for (const x of this.workers) x.postMessage({ type: 'begin' });
    if (!w.beginTick()) return;
    w.regrow();
    w.drift();
    const t0 = performance.now();
    const plan = planTurns(w, w.turnOrder(), this.threads);
    const t1 = performance.now();
    debug('planned', plan.n, 'levels', plan.levels, (t1 - t0).toFixed(1), 'ms');
    this.turnPhase = plan.phase; this.base = plan.base; this.births = [];
    const end = plan.slots[plan.slots.length - 1];
    for (let i = w.warriors.length; i < end; i++) w.warriors.push(null as never);
    const all = new Promise<void>((res, rej) => { this.finish = (e) => (e ? rej(e) : res()); });
    plan.shares.forEach((share, k) => this.workers[k].postMessage({ type: 'turns', phase: plan.phase, base: plan.base, slots: plan.slots, share }));
    await all;
    this.finish = null;
    const t2 = performance.now();
    this.last = { levels: plan.levels, plan: t1 - t0, turns: this.mark - t1, upkeep: t2 - this.mark, serial: false };
    debug('tick', w.t, 'levels', plan.levels, 'plan', (t1 - t0).toFixed(0), 'turns', (this.mark - t1).toFixed(0), 'upkeep', (t2 - this.mark).toFixed(0), 'ms');
    w.checkOver();
  }

  close() { for (const x of this.workers) void x.terminate(); }
}

const threadsFromEnv = () => Number(process.env.ANDNOW_THREADS) || 4;
ENGINES.par = (w) => new ThreadEngine(w, threadsFromEnv());

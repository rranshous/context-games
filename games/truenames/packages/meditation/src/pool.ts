// MeditationPool: hands small chunks of scry/name work to a set of workers.
// Chunked so tasks can be added, removed, reprioritized and throttled at any time.
import { auraField, cellsBelow, hexToBytes, type Spirit } from '@truenames/universe';
import type { WorkChunk, WorkerReply } from './protocol.ts';
import { fromWire } from './worker-body.ts';

export interface ScryTask {
  kind: 'scry';
  id: string;
  prefix: string;
  depth: number;
  /** Contiguous frontier: every index < doneUpTo is scanned. */
  doneUpTo: bigint;
  /** Stop when the frontier reaches this (default: whole layer). */
  stopAt: bigint;
  hits: number;
  label?: string;
}

export interface NameTask {
  kind: 'name';
  id: string;
  cell: string;
  aura: string; // hex pubkey
  best: number;
  hashes: number;
  label?: string;
}

export type Task = ScryTask | NameTask;

interface ScryState {
  next: bigint;
  /** Ranges whose chunk failed; served again before new work. */
  retry: [bigint, bigint][];
  done: Map<bigint, bigint>; // start -> count, completed out of order
}

interface NameState {
  auraField: string;
  cursor: bigint;
}

export interface PoolEvents {
  onSpirit?(s: Spirit, task: ScryTask): void;
  onScryProgress?(task: ScryTask): void;
  onScryDone?(task: ScryTask): void;
  onName?(task: NameTask, nonce: bigint, strength: number): void;
  onRate?(hashesPerSec: number): void;
}

const TARGET_MS = 120;

export class MeditationPool {
  private workers: Worker[] = [];
  private busy: boolean[] = [];
  private inFlight: (WorkChunk | null)[] = [];
  private active = 1;
  private tasks: Task[] = [];
  private scry = new Map<string, ScryState>();
  private names = new Map<string, NameState>();
  private sent = new Map<string, number>();
  private weights = new Map<string, number>();
  private perMs = { scry: 1, name: 1.5 }; // items per ms per worker, adapted
  private hashWindow: { t: number; h: number }[] = [];
  paused = false;
  /** Hash engine the workers reported ('wasm' or 'bigint'). */
  engine: string = '?';

  constructor(
    makeWorker: () => Worker,
    size: number,
    public events: PoolEvents = {},
    private now: () => number = () => performance.now(),
  ) {
    for (let i = 0; i < size; i++) {
      const w = makeWorker();
      w.onmessage = (e: MessageEvent<WorkerReply>) => this.onReply(i, e.data);
      // a crashed worker must not hold its slot or its chunk forever
      w.onerror = (e: ErrorEvent) => {
        console.error('[meditation] worker crashed', e.message);
        const lost = this.inFlight[i];
        this.onReply(i, { kind: 'error', message: e.message, ...(lost ? { chunk: lost } : {}) });
      };
      this.workers.push(w);
      this.busy.push(true); // until 'ready'
    }
    this.active = size;
  }

  get size() {
    return this.workers.length;
  }

  /** How many workers may run at once (budget control). */
  setActive(n: number) {
    this.active = Math.max(0, Math.min(this.workers.length, n));
    this.pump();
  }

  setPaused(p: boolean) {
    this.paused = p;
    this.pump();
  }

  getActive() {
    return this.active;
  }

  list(): readonly Task[] {
    return this.tasks;
  }

  /** Add a scry task. If one with this id is already running it is kept as is (use extendScry to widen it). */
  addScry(t: Omit<ScryTask, 'kind' | 'hits' | 'stopAt' | 'doneUpTo'> & { doneUpTo?: bigint; stopAt?: bigint; hits?: number }): ScryTask {
    const existing = this.get(t.id);
    if (existing?.kind === 'scry') return existing;
    this.remove(t.id);
    const total = cellsBelow(t.depth - t.prefix.length);
    const task: ScryTask = {
      kind: 'scry',
      hits: 0,
      ...t,
      doneUpTo: t.doneUpTo ?? 0n,
      stopAt: t.stopAt === undefined || t.stopAt > total ? total : t.stopAt,
    };
    this.tasks.push(task);
    this.sent.set(task.id, this.minSent());
    this.scry.set(task.id, { next: task.doneUpTo, done: new Map(), retry: [] });
    this.pump();
    return task;
  }

  /** Move a running scry task's stop point without disturbing chunks in flight. */
  extendScry(id: string, stopAt: bigint): ScryTask | undefined {
    const t = this.get(id);
    if (t?.kind !== 'scry') return undefined;
    const total = cellsBelow(t.depth - t.prefix.length);
    t.stopAt = stopAt > total ? total : stopAt;
    this.pump();
    return t;
  }

  addName(t: Omit<NameTask, 'kind' | 'hashes'> & { hashes?: number }): NameTask {
    this.remove(t.id);
    const task: NameTask = { kind: 'name', hashes: 0, ...t };
    this.tasks.push(task);
    this.sent.set(task.id, this.minSent());
    this.names.set(task.id, { auraField: auraField(hexToBytes(t.aura)).toString(), cursor: randomNonceStart() });
    this.pump();
    return task;
  }

  private minSent(): number {
    let m = Infinity;
    for (const t of this.tasks) m = Math.min(m, (this.sent.get(t.id) ?? 0) / this.weight(t.id));
    return isFinite(m) ? m : 0;
  }

  remove(id: string) {
    this.sent.delete(id);
    this.tasks = this.tasks.filter((t) => t.id !== id);
    this.scry.delete(id);
    this.names.delete(id);
  }

  get(id: string): Task | undefined {
    return this.tasks.find((t) => t.id === id);
  }

  /** Hashes per second over the last few seconds, all workers. */
  rate(): number {
    const now = this.now();
    this.hashWindow = this.hashWindow.filter((x) => now - x.t < 3000);
    const h = this.hashWindow.reduce((a, x) => a + x.h, 0);
    return h / 3;
  }

  terminate() {
    for (const w of this.workers) w.terminate();
    this.workers = [];
  }

  // ---------- scheduling ----------

  private pump() {
    if (this.paused) return;
    let running = this.busy.filter(Boolean).length;
    for (let i = 0; i < this.workers.length && running < this.active; i++) {
      if (this.busy[i]) continue;
      const chunk = this.nextChunk();
      if (!chunk) return;
      this.busy[i] = true;
      this.inFlight[i] = chunk;
      running++;
      this.workers[i]!.postMessage(chunk);
    }
  }

  /** Relative share of work for a task (default 1). */
  setWeight(id: string, w: number) {
    this.weights.set(id, Math.max(0.01, w));
  }

  weight(id: string) {
    return this.weights.get(id) ?? 1;
  }

  /** Weighted fair scheduling: the task with the least (work sent / weight) goes next. */
  private nextChunk(): WorkChunk | null {
    const order = [...this.tasks].sort((a, b) => (this.sent.get(a.id) ?? 0) / this.weight(a.id) - (this.sent.get(b.id) ?? 0) / this.weight(b.id));
    for (const task of order) {
      const chunk = this.chunkFor(task);
      if (chunk) {
        // charge in time units so scry and name chunks are comparable
        this.sent.set(task.id, (this.sent.get(task.id) ?? 0) + 1);
        return chunk;
      }
    }
    return null;
  }

  private chunkFor(task: Task): WorkChunk | null {
    if (task.kind === 'scry') {
      const st = this.scry.get(task.id)!;
      const again = st.retry.shift();
      if (again) {
        return { kind: 'scry', taskId: task.id, prefix: task.prefix, extra: task.depth - task.prefix.length, start: again[0].toString(), count: again[1].toString() };
      }
      if (st.next >= task.stopAt) return null;
      let count = BigInt(Math.max(16, Math.round(this.perMs.scry * TARGET_MS)));
      if (st.next + count > task.stopAt) count = task.stopAt - st.next;
      const start = st.next;
      st.next += count;
      return {
        kind: 'scry',
        taskId: task.id,
        prefix: task.prefix,
        extra: task.depth - task.prefix.length,
        start: start.toString(),
        count: count.toString(),
      };
    }
    const st = this.names.get(task.id)!;
    const count = Math.max(16, Math.round(this.perMs.name * TARGET_MS));
    const start = st.cursor;
    st.cursor += BigInt(count);
    return { kind: 'name', taskId: task.id, cell: task.cell, aura: st.auraField, startNonce: start.toString(), count, beat: task.best };
  }

  private onReply(i: number, m: WorkerReply) {
    this.busy[i] = false;
    this.inFlight[i] = null;
    if (m.kind === 'ready' && m.engine) this.engine = m.engine;
    if (m.kind === 'error') {
      console.error('[meditation]', m.message);
      // put a failed scry range back so the frontier can't stall on the gap
      if (m.chunk?.kind === 'scry') this.scry.get(m.chunk.taskId)?.retry.push([BigInt(m.chunk.start), BigInt(m.chunk.count)]);
    }
    if (m.kind === 'scried' || m.kind === 'named') {
      this.hashWindow.push({ t: this.now(), h: m.hashes });
      const items = m.kind === 'scried' ? Number(m.count) : m.count;
      const perMs = items / Math.max(1, m.ms);
      const k = m.kind === 'scried' ? 'scry' : 'name';
      this.perMs[k] = this.perMs[k] * 0.8 + perMs * 0.2;
    }
    if (m.kind === 'scried') {
      const task = this.get(m.taskId);
      const st = this.scry.get(m.taskId);
      if (task && task.kind === 'scry' && st) {
        for (const h of m.hits) {
          task.hits++;
          this.events.onSpirit?.(fromWire(h), task);
        }
        st.done.set(BigInt(m.start), BigInt(m.count));
        // advance the contiguous frontier over any completed range that touches it
        for (let moved = true; moved; ) {
          moved = false;
          for (const [start, count] of st.done) {
            const end = start + count;
            if (start <= task.doneUpTo) {
              st.done.delete(start);
              if (end > task.doneUpTo) { task.doneUpTo = end; moved = true; }
            }
          }
        }
        this.events.onScryProgress?.(task);
        if (task.doneUpTo >= task.stopAt) {
          this.remove(task.id);
          this.events.onScryDone?.(task);
        }
      }
    } else if (m.kind === 'named') {
      const task = this.get(m.taskId);
      if (task && task.kind === 'name') {
        task.hashes += m.hashes;
        if (m.best && m.best.strength > task.best) {
          task.best = m.best.strength;
          this.events.onName?.(task, BigInt(m.best.nonce), m.best.strength);
        }
      }
    }
    this.events.onRate?.(this.rate());
    this.pump();
  }
}

function randomNonceStart(): bigint {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return (BigInt(a[0]!) << 32n) | BigInt(a[1]!);
}

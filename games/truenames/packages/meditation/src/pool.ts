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
  private active = 1;
  private tasks: Task[] = [];
  private scry = new Map<string, ScryState>();
  private names = new Map<string, NameState>();
  private rr = 0;
  private perMs = { scry: 1, name: 1.5 }; // items per ms per worker, adapted
  private hashWindow: { t: number; h: number }[] = [];
  paused = false;

  constructor(
    makeWorker: () => Worker,
    size: number,
    public events: PoolEvents = {},
    private now: () => number = () => performance.now(),
  ) {
    for (let i = 0; i < size; i++) {
      const w = makeWorker();
      w.onmessage = (e: MessageEvent<WorkerReply>) => this.onReply(i, e.data);
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

  addScry(t: Omit<ScryTask, 'kind' | 'hits' | 'stopAt' | 'doneUpTo'> & { doneUpTo?: bigint; stopAt?: bigint; hits?: number }): ScryTask {
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
    this.scry.set(task.id, { next: task.doneUpTo, done: new Map() });
    this.pump();
    return task;
  }

  addName(t: Omit<NameTask, 'kind' | 'hashes'> & { hashes?: number }): NameTask {
    this.remove(t.id);
    const task: NameTask = { kind: 'name', hashes: 0, ...t };
    this.tasks.push(task);
    this.names.set(task.id, { auraField: auraField(hexToBytes(t.aura)).toString(), cursor: randomNonceStart() });
    this.pump();
    return task;
  }

  remove(id: string) {
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
      running++;
      this.workers[i]!.postMessage(chunk);
    }
  }

  private nextChunk(): WorkChunk | null {
    const n = this.tasks.length;
    for (let k = 0; k < n; k++) {
      const task = this.tasks[(this.rr + k) % n]!;
      const chunk = this.chunkFor(task);
      if (chunk) {
        this.rr = (this.rr + k + 1) % Math.max(1, n);
        return chunk;
      }
    }
    return null;
  }

  private chunkFor(task: Task): WorkChunk | null {
    if (task.kind === 'scry') {
      const st = this.scry.get(task.id)!;
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
    if (m.kind === 'error') console.error('[meditation]', m.message);
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
        let c: bigint | undefined;
        while ((c = st.done.get(task.doneUpTo)) !== undefined) {
          st.done.delete(task.doneUpTo);
          task.doneUpTo += c;
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

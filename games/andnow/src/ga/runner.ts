// Running work (src/work.ts: GA matches, matches, solo probes, dishes): local worker
// threads, with a Potluck farm (platforms/potluck) helping when it has capacity. Every
// andnow tool that runs many independent games uses this; the farm is on by default
// (http://localhost:7700, `--farm off` to skip) and never required.
//
// Each CLI bundle is both the main process and its own worker threads: call
// `serveWork()` when `!isMainThread`.
import { readFileSync } from 'node:fs';
import { parentPort, Worker } from 'node:worker_threads';
import { Potluck, runHybrid } from '../../../../platforms/potluck/client.mjs';
import { runWork, Work } from '../work';
import { Job, JobResult, toBatches } from './job';

export const DEFAULT_FARM = 'http://localhost:7700';

/** The --farm setting from argv: a URL, the default, or '' for `--farm off`. */
export function farmArg(args: string[]): string {
  const i = args.indexOf('--farm');
  const v = i >= 0 ? args[i + 1] : DEFAULT_FARM;
  return v === 'off' || v === 'none' ? '' : v;
}

/** Worker-thread side: run work items as they arrive. */
export function serveWork() {
  parentPort!.on('message', (w: Work) => parentPort!.postMessage(runWork(w)));
}

/** Local worker threads, each running one work item at a time. */
export class ThreadPool {
  private free: Worker[];
  private waiting: ((w: Worker) => void)[] = [];
  readonly size: number;
  constructor(n: number) {
    this.free = Array.from({ length: n }, () => new Worker(new URL(import.meta.url)));
    this.size = n;
  }
  async run<T>(work: Work): Promise<T> {
    const w = this.free.pop() ?? await new Promise<Worker>((r) => this.waiting.push(r));
    try {
      return await new Promise<T>((res) => { w.once('message', res); w.postMessage(work); });
    } finally {
      const next = this.waiting.shift();
      if (next) next(w); else this.free.push(w);
    }
  }
  close() { for (const w of [...this.free]) w.terminate(); }
}

/**
 * Runs a generation's jobs as batches on local threads, with a Potluck farm
 * (platforms/potluck) helping when it has capacity. The farm is never required: with no
 * browsers open, or no server, everything runs locally at full speed.
 */
export class Runner {
  private farm: Potluck | null = null;
  private task: string | null = null;
  private code = '';
  private farmDown = false;
  constructor(private threads: ThreadPool, private farmUrl: string, private batchSize = 24) {}
  async init() {
    if (!this.farmUrl) return;
    this.code = readFileSync(new URL('./farm-task.mjs', import.meta.url), 'utf8');
    this.farm = new Potluck(this.farmUrl);
    await this.register();
  }
  /** (Re-)register the task; a restarted server has forgotten it. Fails fast if the server is down. */
  private async register() {
    try {
      const wasUp = !this.farmDown && this.task !== null;
      this.task = await this.farm!.registerTask('andnow', this.code);
      if (!wasUp) console.log(`potluck: task ${this.task} registered at ${this.farmUrl}; open it on any machine to help`);
      this.farmDown = false;
    } catch {
      if (!this.farmDown) console.log(`potluck: ${this.farmUrl} not reachable; running locally (will keep trying)`);
      this.task = null;
      this.farmDown = true;
    }
  }
  lastStats = { local: 0, farm: 0, rerun: 0 };
  async run(jobs: Job[]): Promise<JobResult[]> { return (await this.runDetailed(jobs)).results; }
  /** GA jobs, batched; plus this call's split between local and farm (safe with concurrent calls). */
  async runDetailed(jobs: Job[]): Promise<{ results: JobResult[]; stats: { local: number; farm: number; rerun: number } }> {
    const { outputs, stats } = await this.runWorkDetailed<JobResult[]>(toBatches(jobs, this.batchSize).map((batch) => ({ kind: 'matches', batch })));
    this.lastStats = stats;
    return { results: outputs.flat(), stats };
  }
  /** Any work items, outputs in order. `leaseMs`: how long a farm browser may hold one (long for dishes). */
  async runWork<T>(items: Work[], leaseMs?: number): Promise<T[]> { return (await this.runWorkDetailed<T>(items, leaseMs)).outputs; }
  async runWorkDetailed<T>(items: Work[], leaseMs?: number): Promise<{ outputs: T[]; stats: { local: number; farm: number; rerun: number } }> {
    if (this.farm && this.farmDown) await this.register();
    const { outputs, stats } = await runHybrid({
      inputs: items,
      local: (w: Work) => this.threads.run<T>(w),
      concurrency: this.threads.size,
      farm: this.farmDown ? null : this.farm,
      task: this.task,
      leaseMs,
      onFarmError: (e: Error) => {
        console.log(`potluck: lost the farm (${e.message}); running locally (will keep trying)`);
        this.farmDown = true;
      },
    });
    return { outputs: outputs as T[], stats };
  }
  close() { this.threads.close(); }
}

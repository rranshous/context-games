// Running GA jobs: local worker threads, with a Potluck farm (platforms/potluck)
// helping when it has capacity. Shared by the search CLIs (evolve, map-elites).
//
// Each CLI bundle is both the main process and its own worker threads: call
// `serveBatches()` when `!isMainThread`.
import { readFileSync } from 'node:fs';
import { parentPort, Worker } from 'node:worker_threads';
import { Potluck, runHybrid } from '../../../../platforms/potluck/client.mjs';
import { Batch, Job, JobResult, runBatch, toBatches } from './job';

/** Worker-thread side: run batches as they arrive. */
export function serveBatches() {
  parentPort!.on('message', (batch: Batch) => parentPort!.postMessage(runBatch(batch)));
}

/** Local worker threads, each running one batch of jobs at a time. */
export class ThreadPool {
  private free: Worker[];
  private waiting: ((w: Worker) => void)[] = [];
  readonly size: number;
  constructor(n: number) {
    this.free = Array.from({ length: n }, () => new Worker(new URL(import.meta.url)));
    this.size = n;
  }
  async runBatch(batch: Batch): Promise<JobResult[]> {
    const w = this.free.pop() ?? await new Promise<Worker>((r) => this.waiting.push(r));
    try {
      return await new Promise<JobResult[]>((res) => { w.once('message', res); w.postMessage(batch); });
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
      this.task = await this.farm!.registerTask('andnow-matches', this.code);
      if (!wasUp) console.log(`potluck: task ${this.task} registered at ${this.farmUrl}; open it on any machine to help`);
      this.farmDown = false;
    } catch {
      if (!this.farmDown) console.log(`potluck: ${this.farmUrl} not reachable; running locally (will keep trying)`);
      this.task = null;
      this.farmDown = true;
    }
  }
  lastStats = { local: 0, farm: 0, rerun: 0 };
  async run(jobs: Job[]): Promise<JobResult[]> {
    if (this.farm && this.farmDown) await this.register();
    const { outputs, stats } = await runHybrid({
      inputs: toBatches(jobs, this.batchSize),
      local: (b) => this.threads.runBatch(b),
      concurrency: this.threads.size,
      farm: this.farmDown ? null : this.farm,
      task: this.task,
      onFarmError: (e) => {
        console.log(`potluck: lost the farm (${e.message}); running locally (will keep trying)`);
        this.farmDown = true;
      },
    });
    this.lastStats = stats;
    return outputs.flat();
  }
  close() { this.threads.close(); }
}

// Potluck client: for projects that want to farm work out. Works in Node 18+ and browsers.
//
//   import { Potluck, runHybrid } from '.../platforms/potluck/client.mjs';
//   const farm = await Potluck.connect('http://localhost:7700');      // null if unreachable
//   const task = farm && await farm.registerTask('my-task', taskModuleSource);
//   const { outputs, stats } = await runHybrid({
//     inputs, local: (input) => runLocally(input), concurrency: 8, farm, task,
//   });
//
// runHybrid never depends on the farm: local runners always work through the inputs; the
// farm only takes what it has verified capacity for right now, and anything still out at
// the farm when the local queue runs dry gets re-run locally (first result wins). A farm
// with no browsers open, a slow farm, or a server that goes away mid-run just means the
// run finishes on local compute.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Potluck {
  /** @param {string} url  e.g. http://localhost:7700 */
  constructor(url, { timeoutMs = 5000 } = {}) {
    this.url = url.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
  }

  /** A client if the server answers, else null. */
  static async connect(url, opts) {
    const p = new Potluck(url, opts);
    try { await p.status(); return p; } catch { return null; }
  }

  async req(method, path, body, timeoutMs = this.timeoutMs) {
    const r = await fetch(this.url + path, {
      method, headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
    });
    if (!r.ok) throw new Error(`potluck ${path}: ${r.status} ${await r.text()}`);
    return r.json();
  }

  /** Register a task module (browser-safe ESM exporting run(input), optionally canary()). Returns its id. */
  async registerTask(name, code) { return (await this.req('POST', '/api/tasks', { name, code })).id; }
  status() { return this.req('GET', '/api/status'); }
  /** Worker threads right now: live (seen recently), verified (passed this task's canary), leased (busy on it). */
  capacity(task) { return this.req('GET', `/api/capacity?task=${task}`); }
  async submit(task, inputs = [], leaseMs) { return (await this.req('POST', '/api/jobs', { task, inputs, leaseMs })).job; }
  async add(job, inputs) { return (await this.req('POST', `/api/jobs/${job}/add`, { inputs })).first; }
  /** Finished outputs since `cursor`: { done: [[index, output]...], cursor, remaining }. */
  poll(job, cursor = 0) { return this.req('GET', `/api/jobs/${job}?cursor=${cursor}`); }
  cancel(job) { return this.req('POST', `/api/jobs/${job}/cancel`); }
  /** Blocking: every input on the farm, nothing local. Only for when a farm is certain to have workers. */
  async run(task, inputs) { return (await this.req('POST', '/api/run', { task, inputs }, 0)).outputs; }
}

/**
 * Run `inputs` on local compute, with a Potluck farm helping when it can.
 *
 * @param {object} o
 * @param {any[]} o.inputs
 * @param {(input: any) => Promise<any>} o.local   run one input locally
 * @param {number} o.concurrency                    local runners (0 = farm only, which can block)
 * @param {Potluck|null} [o.farm]
 * @param {string|null} [o.task]                    task id on the farm (same work as `local`)
 * @param {number} [o.pollMs]
 * @param {(e: Error) => void} [o.onFarmError]      farm dropped for the rest of this run
 * @returns {Promise<{ outputs: any[], stats: { local: number, farm: number, rerun: number } }>}
 */
export async function runHybrid({ inputs, local, concurrency, farm = null, task = null, pollMs = 250, onFarmError }) {
  const n = inputs.length;
  const outputs = new Array(n);
  const finished = new Uint8Array(n);
  const stats = { local: 0, farm: 0, rerun: 0 };
  let left = n;
  let front = 0, back = n - 1;       // queued inputs: local takes the front, the farm the back
  const atFarm = new Set();          // input indices out at the farm, not finished
  const rerun = new Set();           // ...of those, ones a local runner is also running
  let farmOn = !!(farm && task);
  let allDone;
  const done = new Promise((r) => { allDone = r; });

  const complete = (i, out, where) => {
    if (finished[i]) return;
    finished[i] = 1;
    outputs[i] = out;
    atFarm.delete(i);
    stats[where]++;
    if (--left === 0) allDone();
  };
  if (n === 0) allDone();

  const nextLocal = () => {
    if (front <= back) return front++;
    // Nothing queued: also run whatever is still out at the farm.
    for (const i of atFarm) if (!finished[i] && !rerun.has(i)) { rerun.add(i); stats.rerun++; return i; }
    return -1;
  };

  const runner = async () => {
    for (let i = nextLocal(); i >= 0; i = nextLocal()) complete(i, await local(inputs[i]), 'local');
  };

  const feeder = async () => {
    let job = null, cursor = 0;
    const map = [];                  // farm job index -> input index
    while (left > 0 && farmOn) {
      try {
        const cap = await farm.capacity(task);
        // Keep each verified thread fed (~2 items each). With live but unverified threads,
        // offer one item so they run the canary; with no threads, send nothing.
        const target = cap.verified > 0 ? cap.verified * 2 : cap.live > 0 ? 1 : 0;
        const want = Math.min(target - atFarm.size, back - front + 1);
        if (want > 0) {
          // Taking from the queue and marking as out-at-the-farm happen together (no await
          // between), so a local runner can never see an input as neither queued nor
          // farmed, and stop while it's still owed.
          const idx = [];
          for (let k = 0; k < want; k++) { idx.push(back); atFarm.add(back--); }
          const batch = idx.map((i) => inputs[i]);
          let first;
          if (!job) { job = await farm.submit(task, batch); first = 0; } else first = await farm.add(job, batch);
          idx.forEach((i, k) => { map[first + k] = i; });
        }
        if (job) {
          const r = await farm.poll(job, cursor);
          cursor = r.cursor;
          for (const [fi, out] of r.done) complete(map[fi], out, 'farm');
        }
      } catch (e) {
        farmOn = false;              // the rest of this run is local (atFarm items get re-run)
        onFarmError?.(e);
        break;
      }
      if (left > 0) await sleep(pollMs);
    }
    if (job) farm.cancel(job).catch(() => {});
  };

  const runners = Array.from({ length: concurrency }, runner);
  const feeding = farmOn ? feeder() : Promise.resolve();
  if (concurrency > 0) {
    // Local runners alone always finish everything (they re-run farm stragglers), so the
    // run never waits on the farm.
    await Promise.all(runners);
    farmOn = false;
  } else {
    await Promise.race([done, feeding.then(() => { if (left > 0) throw new Error('farm stopped with work left and no local runners'); })]);
  }
  await done;
  return { outputs, stats };
}

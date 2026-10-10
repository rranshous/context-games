// Potluck: every machine brings what compute it has to the table.
//
// A zero-dependency work farm. This server holds a queue of work; any browser that opens
// its page becomes a worker (one Web Worker per core) and pulls work until the tab closes.
// Nothing to install on the workers.
//
//   node platforms/potluck/server.mjs [--port 7700]
//
// Concepts
//   task    A JS module (ESM, browser-safe) exporting `run(input) -> output` and optionally
//           `canary() -> { ok, detail }`. Identified by a hash of its code, so a changed
//           module is a new task and workers can never mix versions.
//   job     A list of inputs for one task. Each input is leased to a worker separately.
//
// API (JSON)
//   POST /api/tasks   { name, code }            -> { id }        register a task module
//   POST /api/run     { task, inputs, leaseMs? } -> { outputs }   blocks until all done
//   POST /api/lease   { worker, verified[] }    -> { item } | { verify: taskId } | { none }
//   POST /api/canary  { worker, task, ok, detail }
//   POST /api/result  { worker, job, index, output }
//   GET  /api/status                             -> workers, queue, jobs
//   GET  /tasks/<id>.mjs                         task module source
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.argv[process.argv.indexOf('--port') + 1]) || 7700;
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), 'public');
const LEASE_WAIT_MS = 20000;   // how long a lease request waits for work before returning { none }
const DEFAULT_LEASE_MS = 60000; // a leased item not returned by then goes back in the queue

/** @type {Map<string, { id: string, name: string, code: string }>} */
const tasks = new Map();
/** @type {Map<string, Job>} */
const jobs = new Map();
/** Items waiting to be leased: { job, index } */
const queue = [];
/** Lease requests waiting for work: { worker, verified:Set, resolve } */
const waiting = [];
/** @type {Map<string, WorkerInfo>} */
const workers = new Map();

let jobSerial = 0;

// ---------- work ----------

function enqueue(job) {
  for (let i = 0; i < job.inputs.length; i++) queue.push({ job: job.id, index: i });
  wakeWaiters();
}

/** Find work for a worker: an item of a task it has verified, or a task it should verify. */
function findWork(worker, verified) {
  const info = workers.get(worker);
  for (let k = 0; k < queue.length; k++) {
    const job = jobs.get(queue[k].job);
    if (!job) { queue.splice(k--, 1); continue; }
    if (info?.failed.has(job.task)) continue;
    if (!verified.has(job.task)) return { verify: job.task };
    const { index } = queue.splice(k, 1)[0];
    job.leases.set(index, { worker, until: Date.now() + job.leaseMs });
    return { item: { job: job.id, index, task: job.task, input: job.inputs[index] } };
  }
  return null;
}

function wakeWaiters() {
  for (let k = 0; k < waiting.length; k++) {
    const w = waiting[k];
    const work = findWork(w.worker, w.verified);
    if (work) { waiting.splice(k--, 1); w.resolve(work); }
  }
}

// Expired leases go back in the queue (the worker closed, slept, or is just slow; results
// are deterministic, so if both come back, the first one wins).
setInterval(() => {
  const now = Date.now();
  for (const job of jobs.values()) {
    for (const [index, lease] of job.leases) {
      if (lease.until < now && job.outputs[index] === undefined) {
        job.leases.delete(index);
        queue.unshift({ job: job.id, index });
      }
    }
  }
  wakeWaiters();
  for (const [id, w] of workers) if (now - w.lastSeen > 120000) workers.delete(id);
}, 2000);

function touch(worker, meta = {}) {
  let w = workers.get(worker);
  if (!w) {
    w = { id: worker, name: '', cores: 0, threads: 0, done: 0, failed: new Set(), passed: new Set(), recent: [], lastSeen: 0 };
    workers.set(worker, w);
  }
  Object.assign(w, meta, { lastSeen: Date.now() });
  return w;
}

// ---------- http ----------

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

const routes = {
  'POST /api/tasks': async (body) => {
    const id = createHash('sha256').update(body.code).digest('hex').slice(0, 16);
    if (!tasks.has(id)) {
      tasks.set(id, { id, name: body.name ?? id, code: body.code });
      console.log(`task registered: ${body.name ?? ''} ${id}`);
    }
    return { id };
  },

  'POST /api/run': async (body) => {
    if (!tasks.has(body.task)) throw Object.assign(new Error(`unknown task ${body.task}`), { code: 404 });
    const id = `j${++jobSerial}`;
    const job = {
      id, task: body.task, inputs: body.inputs, outputs: new Array(body.inputs.length), remaining: body.inputs.length,
      leases: new Map(), leaseMs: body.leaseMs ?? DEFAULT_LEASE_MS, started: Date.now(), done: null,
    };
    const finished = new Promise((resolve) => { job.done = resolve; });
    jobs.set(id, job);
    if (job.remaining === 0) job.done();
    enqueue(job);
    await finished;
    jobs.delete(id);
    return { outputs: job.outputs, ms: Date.now() - job.started };
  },

  'POST /api/lease': async (body) => {
    touch(body.worker, { name: body.name, cores: body.cores, threads: body.threads });
    const verified = new Set(body.verified ?? []);
    const work = findWork(body.worker, verified);
    if (work) return work;
    return new Promise((resolve) => {
      const entry = { worker: body.worker, verified, resolve };
      waiting.push(entry);
      setTimeout(() => {
        const k = waiting.indexOf(entry);
        if (k >= 0) { waiting.splice(k, 1); resolve({ none: true }); }
      }, LEASE_WAIT_MS);
    });
  },

  'POST /api/canary': async (body) => {
    const w = touch(body.worker);
    (body.ok ? w.passed : w.failed).add(body.task);
    console.log(`canary ${body.ok ? 'passed' : 'FAILED'} on ${w.name || body.worker} for ${tasks.get(body.task)?.name ?? body.task}${body.detail ? `: ${body.detail}` : ''}`);
    wakeWaiters();
    return {};
  },

  'POST /api/result': async (body) => {
    const w = touch(body.worker);
    const job = jobs.get(body.job);
    if (job && job.outputs[body.index] === undefined) {
      job.outputs[body.index] = body.output;
      job.leases.delete(body.index);
      w.done++;
      w.recent.push(Date.now());
      if (--job.remaining === 0) job.done();
    }
    return {};
  },

  'GET /api/status': async () => {
    const now = Date.now();
    return {
      queue: queue.length,
      jobs: [...jobs.values()].map((j) => ({ id: j.id, task: tasks.get(j.task)?.name, total: j.inputs.length, remaining: j.remaining, leased: j.leases.size })),
      tasks: [...tasks.values()].map((t) => ({ id: t.id, name: t.name })),
      workers: [...workers.values()].map((w) => {
        w.recent = w.recent.filter((t) => now - t < 30000);
        return {
          id: w.id, name: w.name, cores: w.cores, threads: w.threads, done: w.done, perMin: w.recent.length * 2,
          passed: [...w.passed].map((t) => tasks.get(t)?.name ?? t), failed: [...w.failed].map((t) => tasks.get(t)?.name ?? t),
          ago: Math.round((now - w.lastSeen) / 1000),
        };
      }),
    };
  },
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    const route = routes[`${req.method} ${url.pathname}`];
    if (route) return send(res, 200, await route(req.method === 'POST' ? await readJson(req) : {}));
    const task = url.pathname.match(/^\/tasks\/([0-9a-f]{16})\.mjs$/);
    if (task && tasks.has(task[1])) return send(res, 200, tasks.get(task[1]).code, 'text/javascript');
    const file = { '/': 'index.html', '/page.js': 'page.js', '/worker.js': 'worker.js' }[url.pathname];
    if (file) return send(res, 200, readFileSync(join(PUBLIC, file)), file.endsWith('.html') ? 'text/html' : 'text/javascript');
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, e.code === 404 ? 404 : 500, { error: String(e.message ?? e) });
  }
});
// Jobs can take a long time; don't let Node time out the waiting requests.
server.requestTimeout = 0;
server.headersTimeout = 0;
server.listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address);
  console.log(`potluck on port ${PORT}. Open on any machine to bring its compute:`);
  for (const ip of ['localhost', ...lan]) console.log(`  http://${ip}:${PORT}/`);
});

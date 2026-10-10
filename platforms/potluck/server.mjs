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
//   job     Inputs for one task. Each input is leased to a worker thread separately.
//           Jobs are non-blocking: submit, add more inputs, poll for finished outputs,
//           cancel. (Most clients use client.mjs, whose runHybrid() mixes local and farm
//           compute so a farm with no workers never blocks anything.)
//
// API (JSON)
//   POST /api/tasks              { name, code }        -> { id }
//   POST /api/jobs               { task, inputs?, leaseMs? } -> { job }
//   POST /api/jobs/<id>/add      { inputs }            -> { first }   index of the first added input
//   GET  /api/jobs/<id>?cursor=N                       -> { done: [[index, output], ...], cursor, remaining }
//   POST /api/jobs/<id>/cancel                         -> {}          drop queued inputs, forget the job
//   GET  /api/capacity?task=<id>                       -> { live, verified, leased }   worker threads right now
//   POST /api/run                { task, inputs }      -> { outputs, ms }   blocking convenience
//   POST /api/lease   (workers)  { worker, verified[] } -> { item } | { verify: taskId } | { none }   (never waits)
//   POST /api/canary  (workers)  { worker, task, ok, detail }
//   POST /api/result  (workers)  { worker, job, index, output }
//   GET  /api/status                                   -> workers, queue, jobs, tasks
//   GET  /tasks/<id>.mjs                               task module source
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.argv[process.argv.indexOf('--port') + 1]) || 7700;
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), 'public');
const DEFAULT_LEASE_MS = 60000;  // a leased item not returned by then goes back in the queue
const LIVE_MS = 10000;           // a worker thread seen this recently counts as capacity
const ABANDONED_MS = 300000;     // a job nobody has polled for this long is dropped

/** @type {Map<string, { id: string, name: string, code: string }>} */
const tasks = new Map();
/** @type {Map<string, any>} */
const jobs = new Map();
/** Items waiting to be leased: { job, index } */
const queue = [];
/** @type {Map<string, any>} */
const workers = new Map();

let jobSerial = 0;

// ---------- jobs ----------

function makeJob(task, leaseMs) {
  if (!tasks.has(task)) throw Object.assign(new Error(`unknown task ${task}`), { code: 404 });
  const job = {
    id: `j${++jobSerial}`, task, inputs: [], outputs: [], completions: [], leases: new Map(),
    leaseMs: leaseMs ?? DEFAULT_LEASE_MS, started: Date.now(), touched: Date.now(), onDone: null,
  };
  jobs.set(job.id, job);
  return job;
}

function addInputs(job, inputs) {
  const first = job.inputs.length;
  for (const input of inputs) {
    queue.push({ job: job.id, index: job.inputs.length });
    job.inputs.push(input);
    job.outputs.push(undefined);
  }
  return first;
}

const remaining = (job) => job.inputs.length - job.completions.length;

function getJob(id) {
  const job = jobs.get(id);
  if (!job) throw Object.assign(new Error(`unknown job ${id}`), { code: 404 });
  job.touched = Date.now();
  return job;
}

/** Find work for a worker: an item of a task it has verified, or a task it should verify. */
function findWork(worker, verified) {
  const info = workers.get(worker);
  for (let k = 0; k < queue.length; k++) {
    const job = jobs.get(queue[k].job);
    if (!job || job.outputs[queue[k].index] !== undefined) { queue.splice(k--, 1); continue; }
    if (info?.failed.has(job.task)) continue;
    if (!verified.has(job.task)) return { verify: job.task };
    const { index } = queue.splice(k, 1)[0];
    job.leases.set(index, { worker, until: Date.now() + job.leaseMs });
    return { item: { job: job.id, index, task: job.task, input: job.inputs[index] } };
  }
  return null;
}

setInterval(() => {
  const now = Date.now();
  for (const job of jobs.values()) {
    // Expired leases go back in the queue (the worker closed, slept, or is just slow;
    // results are deterministic, so if both come back, the first one wins).
    for (const [index, lease] of job.leases) {
      if (lease.until < now && job.outputs[index] === undefined) {
        job.leases.delete(index);
        queue.unshift({ job: job.id, index });
      }
    }
    if (!job.onDone && now - job.touched > ABANDONED_MS) jobs.delete(job.id);
  }
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

/** [method, path regex, handler(body, match, url)] */
const routes = [
  ['POST', /^\/api\/tasks$/, async (body) => {
    const id = createHash('sha256').update(body.code).digest('hex').slice(0, 16);
    if (!tasks.has(id)) {
      tasks.set(id, { id, name: body.name ?? id, code: body.code });
      console.log(`task registered: ${body.name ?? ''} ${id}`);
    }
    return { id };
  }],

  ['POST', /^\/api\/jobs$/, async (body) => {
    const job = makeJob(body.task, body.leaseMs);
    addInputs(job, body.inputs ?? []);
    return { job: job.id };
  }],

  ['POST', /^\/api\/jobs\/(j\d+)\/add$/, async (body, m) => ({ first: addInputs(getJob(m[1]), body.inputs ?? []) })],

  ['GET', /^\/api\/jobs\/(j\d+)$/, async (_b, m, url) => {
    const job = getJob(m[1]);
    const cursor = Number(url.searchParams.get('cursor')) || 0;
    const done = job.completions.slice(cursor).map((i) => [i, job.outputs[i]]);
    return { done, cursor: job.completions.length, remaining: remaining(job) };
  }],

  ['POST', /^\/api\/jobs\/(j\d+)\/cancel$/, async (_b, m) => {
    jobs.delete(m[1]); // queued items are dropped lazily by findWork
    return {};
  }],

  ['GET', /^\/api\/capacity$/, async (_b, _m, url) => {
    const task = url.searchParams.get('task');
    const now = Date.now();
    let live = 0, verified = 0, leased = 0;
    for (const w of workers.values()) {
      if (now - w.lastSeen > LIVE_MS || w.failed.has(task)) continue;
      live++;
      if (w.passed.has(task)) verified++;
    }
    for (const job of jobs.values()) if (job.task === task) leased += job.leases.size;
    return { live, verified, leased };
  }],

  ['POST', /^\/api\/run$/, async (body) => {
    const job = makeJob(body.task, body.leaseMs);
    const finished = new Promise((resolve) => { job.onDone = resolve; });
    addInputs(job, body.inputs ?? []);
    if (remaining(job) === 0) job.onDone();
    await finished;
    jobs.delete(job.id);
    return { outputs: job.outputs, ms: Date.now() - job.started };
  }],

  ['POST', /^\/api\/lease$/, async (body) => {
    touch(body.worker, { name: body.name, cores: body.cores, threads: body.threads });
    // Never hold the request open: a browser allows only ~6 connections per host, shared
    // by all of a page's worker threads, so parked lease requests would block the
    // threads' result posts. Idle threads poll with a short backoff instead.
    return findWork(body.worker, new Set(body.verified ?? [])) ?? { none: true };
  }],

  ['POST', /^\/api\/canary$/, async (body) => {
    const w = touch(body.worker);
    (body.ok ? w.passed : w.failed).add(body.task);
    console.log(`canary ${body.ok ? 'passed' : 'FAILED'} on ${w.name || body.worker} for ${tasks.get(body.task)?.name ?? body.task}${body.detail ? `: ${body.detail}` : ''}`);
    return {};
  }],

  ['POST', /^\/api\/result$/, async (body) => {
    const w = touch(body.worker);
    const job = jobs.get(body.job);
    if (job && job.outputs[body.index] === undefined) {
      job.outputs[body.index] = body.output;
      job.completions.push(body.index);
      job.leases.delete(body.index);
      w.done++;
      w.recent.push(Date.now());
      if (remaining(job) === 0) job.onDone?.();
    }
    return {};
  }],

  ['GET', /^\/api\/status$/, async () => {
    const now = Date.now();
    return {
      queue: queue.length,
      jobs: [...jobs.values()].map((j) => ({ id: j.id, task: tasks.get(j.task)?.name, total: j.inputs.length, remaining: remaining(j), leased: j.leases.size })),
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
  }],
];

const STATIC = { '/': 'index.html', '/page.js': 'page.js', '/worker.js': 'worker.js', '/client.mjs': '../client.mjs' };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    for (const [method, re, handler] of routes) {
      const m = req.method === method && url.pathname.match(re);
      if (m) return send(res, 200, await handler(method === 'POST' ? await readJson(req) : {}, m, url));
    }
    const task = url.pathname.match(/^\/tasks\/([0-9a-f]{16})\.mjs$/);
    if (task && tasks.has(task[1])) return send(res, 200, tasks.get(task[1]).code, 'text/javascript');
    const file = STATIC[url.pathname];
    if (file) return send(res, 200, readFileSync(join(PUBLIC, file)), file.endsWith('.html') ? 'text/html' : 'text/javascript');
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, e.code === 404 ? 404 : 500, { error: String(e.message ?? e) });
  }
});
// /api/run can take a long time; don't let Node time out waiting requests.
server.requestTimeout = 0;
server.headersTimeout = 0;
server.listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address);
  console.log(`potluck on port ${PORT}. Open on any machine to bring its compute:`);
  for (const ip of ['localhost', ...lan]) console.log(`  http://${ip}:${PORT}/`);
});

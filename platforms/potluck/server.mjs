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
//   POST /api/jobs               { task, inputs?, leaseMs?, label? } -> { job }   label: what the work is, for the page
//   POST /api/jobs/<id>/add      { inputs }            -> { first }   index of the first added input
//   GET  /api/jobs/<id>?cursor=N                       -> { done: [[index, output], ...], cursor, remaining }
//   POST /api/jobs/<id>/cancel                         -> {}          drop queued inputs, forget the job; threads running its items are stopped
//   POST /api/jobs/<id>/drop     { indices }           -> {}          the client no longer needs these items (it ran them itself): unqueue them, stop threads running them
//   GET  /api/capacity?task=<id>                       -> { live, verified, leased }   worker threads right now
//   POST /api/run                { task, inputs }      -> { outputs, ms }   blocking convenience
//   POST /api/lease   (workers)  { worker, verified[] } -> { item } | { verify: taskId } | { none }   (never waits)
//   POST /api/canary  (workers)  { worker, task, ok, detail }
//   POST /api/result  (workers)  { worker, job, index, output }
//   POST /api/heartbeat (pages)  { workers[], session, name, cores, threads, paused, abort } -> { drop: [{ worker, job, index }] }
//                                the page's main thread vouches for its worker threads, which can't talk while a long
//                                item runs; `drop` lists items nobody wants any more (job cancelled or gone, or the result
//                                already in), and a page that sent `abort: true` terminates those threads and starts fresh ones
//   GET  /api/status                                   -> now, workers, queue, jobs, tasks, finished
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
const FINISHED_KEEP = 40;        // recently finished items kept for the page
const SILENT_MS = 60000;         // a heartbeating page silent this long has closed or slept: its threads' leases go back in the queue

/** @type {Map<string, { id: string, name: string, code: string }>} */
const tasks = new Map();
/** @type {Map<string, any>} */
const jobs = new Map();
/** Items waiting to be leased: { job, index } */
const queue = [];
/** @type {Map<string, any>} */
const workers = new Map();
/** Recently finished items, newest last: { job, label, index, ms, at, worker, name } */
const finished = [];

let jobSerial = 0;

// ---------- jobs ----------

function makeJob(task, leaseMs, label) {
  if (!tasks.has(task)) throw Object.assign(new Error(`unknown task ${task}`), { code: 404 });
  const job = {
    id: `j${++jobSerial}`, task, label: label ?? '', inputs: [], outputs: [], completions: [], durations: [], leases: new Map(),
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
const jobLabel = (job) => job.label || tasks.get(job.task)?.name || job.task;

/** A worker thread counts as live if it was heard from recently. A thread deep in a long
 *  item can't talk (run() is synchronous), so its page heartbeats for it; a page from
 *  before heartbeats existed gets the benefit of the doubt until its lease runs out. */
function alive(w, now = Date.now()) {
  if (now - w.lastSeen <= LIVE_MS) return true;
  return !w.beats && w.current?.kind === 'item' && w.current.until > now;
}

function getJob(id) {
  const job = jobs.get(id);
  if (!job) throw Object.assign(new Error(`unknown job ${id}`), { code: 404 });
  job.touched = Date.now();
  return job;
}

/** Put a thread's leased items back in the queue (its page closed, slept, or reloaded). */
function dropLeases(workerId) {
  for (const job of jobs.values()) {
    for (const [index, lease] of job.leases) {
      if (lease.worker === workerId && job.outputs[index] === undefined) { job.leases.delete(index); queue.unshift({ job: job.id, index }); }
    }
  }
  const w = workers.get(workerId);
  if (w) w.current = null;
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
    const now = Date.now();
    job.leases.set(index, { worker, since: now, until: now + job.leaseMs });
    if (info) info.current = { kind: 'item', job: job.id, index, task: job.task, label: jobLabel(job), since: now, until: now + job.leaseMs };
    return { item: { job: job.id, index, task: job.task, input: job.inputs[index] } };
  }
  // Nothing queued it can take: still verify the task of any open job, so a thread that
  // joins while the farm's share is all leased out counts as verified capacity (the
  // client only queues more once it does).
  for (const job of jobs.values()) {
    if (!verified.has(job.task) && !info?.failed.has(job.task)) return { verify: job.task };
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
  for (const [id, w] of workers) {
    // Heartbeating pages vouch for their threads, so silence means the page is gone: don't
    // make a long item wait out its (hours-long) lease before someone else picks it up.
    if (w.beats && w.current && now - w.lastSeen > SILENT_MS) dropLeases(id);
    if (now - w.lastSeen > 120000 && !alive(w, now)) workers.delete(id);
  }
}, 2000);

function touch(worker, meta = {}) {
  let w = workers.get(worker);
  if (!w) {
    w = { id: worker, name: '', cores: 0, threads: 0, done: 0, failed: new Set(), passed: new Set(), recent: [], lastSeen: 0,
      current: null, last: null, beats: false, paused: false };
    workers.set(worker, w);
  }
  // Thread ids survive a page reload (or a threads change); a new session means the old
  // threads, and whatever they were running, are gone.
  if (meta.session && w.session && meta.session !== w.session) dropLeases(worker);
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
    const job = makeJob(body.task, body.leaseMs, body.label);
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

  ['POST', /^\/api\/jobs\/(j\d+)\/drop$/, async (body, m) => {
    // Mark as answered (null), so queued copies are skipped, a late result is ignored, and
    // the next heartbeat tells the page to stop any thread still running one.
    const job = getJob(m[1]);
    for (const i of body.indices ?? []) if (job.outputs[i] === undefined) { job.outputs[i] = null; job.leases.delete(i); }
    return {};
  }],

  ['GET', /^\/api\/capacity$/, async (_b, _m, url) => {
    const task = url.searchParams.get('task');
    const now = Date.now();
    let live = 0, verified = 0, leased = 0;
    for (const w of workers.values()) {
      if (!alive(w, now) || w.failed.has(task)) continue;
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
    touch(body.worker, { name: body.name, cores: body.cores, threads: body.threads, session: body.session });
    // Never hold the request open: a browser allows only ~6 connections per host, shared
    // by all of a page's worker threads, so parked lease requests would block the
    // threads' result posts. Idle threads poll with a short backoff instead.
    const w = workers.get(body.worker);
    const work = findWork(body.worker, new Set(body.verified ?? []));
    if (work?.verify) w.current = { kind: 'verify', task: work.verify, label: tasks.get(work.verify)?.name ?? work.verify, since: Date.now() };
    if (!work) w.current = null;
    return work ?? { none: true };
  }],

  ['POST', /^\/api\/heartbeat$/, async (body) => {
    const drop = [];
    const now = Date.now();
    for (const id of body.workers ?? []) {
      const w = touch(id, { name: body.name, cores: body.cores, threads: body.threads, paused: !!body.paused, beats: true, session: body.session });
      const c = w.current;
      if (c?.kind !== 'item') continue;
      const job = jobs.get(c.job);
      if (job && job.outputs[c.index] === undefined) continue;
      // Nobody wants this item any more, but run() is synchronous: only the page can stop
      // it, by terminating the thread. Pages from before aborting just keep running it.
      drop.push({ worker: id, job: c.job, index: c.index });
      if (body.abort) {
        finished.push({ job: c.job, label: c.label, index: c.index, ms: now - c.since, at: now, worker: id, name: w.name, aborted: job ? 'done elsewhere' : 'cancelled' });
        if (finished.length > FINISHED_KEEP) finished.shift();
        w.current = null;
      }
    }
    return { drop };
  }],

  ['POST', /^\/api\/canary$/, async (body) => {
    const w = touch(body.worker);
    w.current = null;
    (body.ok ? w.passed : w.failed).add(body.task);
    console.log(`canary ${body.ok ? 'passed' : 'FAILED'} on ${w.name || body.worker} for ${tasks.get(body.task)?.name ?? body.task}${body.detail ? `: ${body.detail}` : ''}`);
    return {};
  }],

  ['POST', /^\/api\/result$/, async (body) => {
    const w = touch(body.worker);
    const job = jobs.get(body.job);
    const now = Date.now();
    // How long this thread spent on it (its own lease start; the job's lease may have
    // expired and been handed to someone else meanwhile).
    const mine = w.current?.kind === 'item' && w.current.job === body.job && w.current.index === body.index ? w.current : null;
    const since = mine?.since ?? job?.leases.get(body.index)?.since;
    const ms = since ? now - since : null;
    w.current = null;
    if (ms !== null) w.last = { job: body.job, label: mine?.label ?? (job ? jobLabel(job) : ''), index: body.index, ms, at: now };
    if (job && job.outputs[body.index] === undefined) {
      if (ms !== null) {
        job.durations.push(ms);
        finished.push({ job: job.id, label: jobLabel(job), index: body.index, ms, at: now, worker: w.id, name: w.name });
        if (finished.length > FINISHED_KEEP) finished.shift();
      }
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
      now, // the page ticks elapsed times against this clock between polls
      queue: queue.length,
      jobs: [...jobs.values()].map((j) => {
        const d = j.durations, n = d.length;
        return {
          id: j.id, task: tasks.get(j.task)?.name, label: j.label, total: j.inputs.length, remaining: remaining(j), leased: j.leases.size,
          done: j.completions.length, queued: Math.max(0, remaining(j) - j.leases.size), started: j.started,
          durations: n ? { n, avgMs: Math.round(d.reduce((a, x) => a + x, 0) / n), minMs: Math.min(...d), maxMs: Math.max(...d) } : null,
          leases: [...j.leases].map(([index, l]) => ({ index, worker: l.worker, since: l.since, until: l.until })),
        };
      }),
      tasks: [...tasks.values()].map((t) => ({ id: t.id, name: t.name })),
      finished,
      workers: [...workers.values()].map((w) => {
        w.recent = w.recent.filter((t) => now - t < 30000);
        const live = alive(w, now);
        const c = live ? w.current : null;
        const job = c?.job ? jobs.get(c.job) : null;
        return {
          id: w.id, name: w.name, cores: w.cores, threads: w.threads, done: w.done, perMin: w.recent.length * 2, working: c?.label ?? '',
          passed: [...w.passed].map((t) => tasks.get(t)?.name ?? t), failed: [...w.failed].map((t) => tasks.get(t)?.name ?? t),
          ago: Math.round((now - w.lastSeen) / 1000), live,
          state: !c ? (w.paused ? 'paused' : 'idle') : c.kind === 'verify' ? 'verifying' : 'working',
          // stale: the item already has its result from elsewhere (or its job is gone); this thread can't stop mid-run
          current: c && { kind: c.kind, job: c.job, index: c.index, label: c.label, since: c.since, stale: c.kind === 'item' && (!job || job.outputs[c.index] !== undefined) },
          last: w.last,
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

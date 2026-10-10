# Potluck

Every machine brings what compute it has to the table.

A zero-install work farm. One machine runs the server; **any device that opens its page
in a browser becomes a worker** (one Web Worker per core) and pulls work until the tab
closes. No installs, no accounts, no dependencies.

```
node platforms/potluck/server.mjs [--port 7700]
```
Then open `http://<this machine>:7700/` on any device on the network. The page shows this
device (name, threads slider, pause) and the whole farm (devices, batches, rate, queue).

**The farm is never required.** Projects use `runHybrid()`, which always works through
the inputs on local compute and lets the farm take only what it has verified capacity for
right now. No browsers open, a slow device, or the server going away mid-run all just mean
the work finishes locally, with the same results.

## Using it from a project

1. **Write a task module**: a browser-safe ES module (no Node built-ins) exporting
   `run(input) → output` (sync or async) and, ideally, `canary() → { ok, detail }`, a quick
   self-test (e.g. replay a few known cases and compare results). Bundle it into one file.
   `input` and `output` must be JSON. Aim for ~0.1–1 s of compute per input (batch small
   work items together).
2. **Use the client** (`client.mjs`, Node 18+ or browser; types in `client.d.mts`):

```js
import { Potluck, runHybrid } from '../platforms/potluck/client.mjs';

const farm = new Potluck('http://localhost:7700');
let task = null;
try { task = await farm.registerTask('my-task', taskModuleSource); } catch { /* no farm: fine */ }

const { outputs, stats } = await runHybrid({
  inputs,                                   // any JSON values
  local: (input) => runOnMyThreads(input),  // the same work, done locally (returns a promise)
  concurrency: 8,                           // local runners
  farm, task,                               // farm optional
  onFarmError: (e) => console.log('farm dropped:', e.message),
});
// outputs[i] belongs to inputs[i]; stats = { local, farm, rerun }
```

How `runHybrid` splits the work:
- Inputs sit in one queue. Local runners take from the front; the farm takes from the
  back, but only up to ~3 per thread that has passed the task's canary (or a single probe
  input when threads are connected but haven't verified yet, so they run the canary).
- When the local queue is empty, local runners also run whatever is still out at the farm.
  First result wins. So local runners alone always finish the job.
- Any farm error (server down, timeout) drops the farm for the rest of that call.
- With `concurrency: 0` it's farm-only, which *can* block; `farm.run(task, inputs)` is the
  simple blocking form of that.

Your `local` and the task's `run` must compute the same thing, deterministically, for the
mixed results to make sense. The canary is how a device proves it does.

## The pattern

- **Task**: a module identified by a hash of its code, so a changed module is a new task
  and workers can never mix versions. Workers `import('/tasks/<id>.mjs')`; nothing to reload.
- **Canary**: before a worker thread takes work for a task it hasn't seen, it runs the
  task's canary. Fail → that thread never gets that task. Devices, browsers and engines
  prove themselves rather than being assumed identical.
- **Leases expire** (default 60 s) and go back in the queue, so closing a tab or sleeping a
  machine never loses work; duplicates are harmless (first result wins).
- **Work-stealing**: threads pull when free, so fast and slow devices (or a desktop that's
  busy with other things) take more or fewer items. No tuning.
- **No long-polling**: a browser allows ~6 connections per host, shared by all of a page's
  threads. Leases answer immediately and idle threads back off (≤1 s).

## API (JSON over HTTP)

| | | |
|---|---|---|
| `POST /api/tasks` | `{ name, code }` | → `{ id }` register a task module |
| `POST /api/jobs` | `{ task, inputs?, leaseMs? }` | → `{ job }` |
| `POST /api/jobs/<id>/add` | `{ inputs }` | → `{ first }` index of the first added input |
| `GET /api/jobs/<id>?cursor=N` | | → `{ done: [[index, output]…], cursor, remaining }` |
| `POST /api/jobs/<id>/cancel` | | drop the job's queued inputs |
| `GET /api/capacity?task=<id>` | | → `{ live, verified, leased }` worker threads right now |
| `POST /api/run` | `{ task, inputs }` | → `{ outputs, ms }` blocking, farm only |
| `POST /api/lease` | `{ worker, verified[], name, cores, threads }` | (workers) → `{ item }` / `{ verify }` / `{ none }` |
| `POST /api/canary` | `{ worker, task, ok, detail }` | (workers) |
| `POST /api/result` | `{ worker, job, index, output }` | (workers) |
| `GET /api/status` | | workers, queue, jobs, tasks |
| `GET /tasks/<id>.mjs`, `GET /client.mjs` | | task module source; the client library |

Jobs nobody polls for 5 minutes are dropped.

## Customers

- **andnow** (`games/andnow`): `node dist/evolve.mjs ... --farm http://localhost:7700`.
  Task = `dist/farm-task.mjs` (a batch of 24 GA matches per input; canary = 15 golden
  replays checked by full-state hash). Local runners = the evolver's worker threads.

## Not yet
- Always-on background service (for now: start it when you need it).
- Auth: anyone on the LAN can join or submit. Fine on a trusted home network.
- A headless Node worker that speaks the lease API (for machines without a browser open).

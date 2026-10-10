# Potluck

Every machine brings what compute it has to the table.

A zero-install work farm. One machine runs the server; **any device that opens its page
in a browser becomes a worker** (one Web Worker per core) and pulls work until the tab
closes. No installs, no accounts. Updating every worker is just the page fetching the
new task module.

```
node platforms/potluck/server.mjs [--port 7700]
```
Then open `http://<this machine>:7700/` on any device on the network. The page shows
this device (name, threads slider, pause) and the whole farm (devices, batches done,
rate, queue).

## The pattern

- **Task**: an ES module, browser-safe, exporting `run(input) → output` and optionally
  `canary() → { ok, detail }`. Registered by a client; identified by a hash of its code,
  so a changed module is a new task and workers can never mix versions.
- **Job**: a list of inputs for one task. The client posts it and waits; each input is
  leased to some worker thread separately; outputs come back in input order.
- **Canary**: before a worker thread takes work for a task it hasn't seen, it runs the
  task's canary (e.g. replay known cases and compare hashes). Fail → that thread never
  gets that task. Different devices, browsers and engines prove themselves rather than
  being assumed identical.
- **Leases expire** (default 60 s) and go back in the queue, so closing a tab, sleeping
  a machine, or a slow device never loses work. Results should be deterministic, so a
  duplicate result is harmless: the first one wins.
- **Work-stealing**: threads pull when free, so fast and slow devices (or a desktop
  that's busy with other things) just take more or fewer items. No tuning.

## API (JSON over HTTP)

| | | |
|---|---|---|
| `POST /api/tasks` | `{ name, code }` | → `{ id }` register a task module |
| `POST /api/run` | `{ task, inputs, leaseMs? }` | → `{ outputs, ms }` blocks until every input is done |
| `POST /api/lease` | `{ worker, verified[], name, cores, threads }` | → `{ item }` / `{ verify: taskId }` / `{ none }` (waits up to 20 s for work) |
| `POST /api/canary` | `{ worker, task, ok, detail }` | |
| `POST /api/result` | `{ worker, job, index, output }` | |
| `GET /api/status` | | workers, queue, jobs, tasks |
| `GET /tasks/<id>.mjs` | | the task module |

## Using it from a project

1. Build a browser-safe ES module exporting `run` (and ideally `canary`).
2. `POST /api/tasks` with its code, get the task id.
3. `POST /api/run` with the inputs; batch small work items together so each input is
   ~0.1–1 s of compute.

First customer: andnow's GA (`games/andnow`): `node dist/evolve.mjs ... --farm http://localhost:7700`
registers `dist/farm-task.mjs` (a batch of matches per input; canary = golden replays).

## Not yet
- Always-on background service (for now: start it when you need it).
- Auth: anyone on the LAN can join or submit. Fine on a trusted home network.
- A headless Node worker that speaks the same lease API (for machines without a browser open).

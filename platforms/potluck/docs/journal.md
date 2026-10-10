# Potluck journal

## 2026-10-09: born from andnow's GA
andnow's genetic search was CPU-bound on one desktop. Options discussed: Cloudflare
Workers (good fit, cheap, but needs an account round trip and has a 6-connection fan-out
limit per invocation), a sim server installed on the other home machines (a small
touchscreen PC, a sometimes-busy desktop). Robby's idea: **a local web server as the
orchestrator, and a web page as the worker**, so there's nothing to install anywhere,
and make it a named pattern other projects can use, maybe later a always-on service on
this machine that farms work out to any machine with the page open.

Name: Potluck (every machine brings what compute it has). Lives at `platforms/potluck/`.
Start it when needed; background service later.

v1 decisions:
- Zero dependencies: Node `http`, plain JS, no build step for the server or page.
- Plain HTTP with long-polling leases (Node has no built-in WebSocket server).
- Tasks identified by a hash of their code; workers import `/tasks/<id>.mjs`, so a new
  build is automatically a new task: no mixed versions, no reload needed.
- Canary per worker thread per task before leasing; failures shown on the page.
- Lease expiry + first-result-wins; outputs returned in input order.
- Worker page doubles as a dashboard (made with the touchscreen box in mind).

### First end-to-end test (andnow GA, this desktop's browser as the only worker)
- **Correct**: the same small evolution (`--pop 24 --gens 3 --rng 77`) run on local worker
  threads and through Potluck produced identical generation lines (fitness, records, kill
  and poison stats) and identical held-out results. Canaries passed on all 8 threads.
- **First version was ~20× slower** (22 s/gen vs 1.3 s). Cause: the browser's ~6 connections
  per host are shared by all of a page's worker threads, and leases were long-polls held
  for up to 20 s. Six parked leases took every connection, so the other threads' result
  posts queued behind them. Fix: `/api/lease` answers immediately (`{ none }` when idle)
  and idle threads back off up to ~1 s. After: the farm matched local threads on the same
  8 cores (gen 0 ~3.7 s including the canaries, then 0.7 s/gen vs local 0.65–1.0 s).
- Bonus: restarting the server while a page was open was harmless. The page's threads
  kept retrying, reconnected, and picked up work (they re-verified via canary).

### Generic + never exclusive (Robby: other projects should use it easily; GAs must not depend on a browser being open, and no capacity must never block)
- **Non-blocking job API** on the server: `POST /api/jobs`, `/add`, `GET /api/jobs/<id>?cursor`,
  `/cancel`, and `GET /api/capacity?task=` (live / verified / leased worker threads).
  `/api/run` stays as the blocking, farm-only convenience. Abandoned jobs dropped after 5 min.
- **`client.mjs`** (Node or browser, types in `client.d.mts`, also served at `/client.mjs`):
  `Potluck` (register, submit, add, poll, cancel, capacity, run) and **`runHybrid()`**:
  - one queue; local runners take the front, the farm the back, only up to ~2 items per
    verified thread (a single probe when threads are connected but unverified);
  - when the local queue is empty, local runners re-run whatever's still out at the farm
    (first result wins), so local runners alone always finish;
  - any farm error drops the farm for the rest of the call.
  - Race found while writing it: taking items for the farm and marking them as out at the
    farm must happen in the same synchronous step; with an `await` between, a local runner
    could see an item as neither queued nor farmed, stop, and the run would hang if the
    submit then failed.
- andnow's evolver now always goes through `runHybrid` (local worker threads as the local
  runner, batch at a time); `--farm` just adds the farm. It re-registers the task after a
  farm failure (a restarted server has forgotten it) and keeps trying each generation.

Tests (same args, diffed against a local-only run; all identical):
| | farm batches | |
|---|---|---|
| A. no `--farm` | — | refactored local path |
| B. `--farm`, server not running | 0 | full local speed |
| C. server up, no browser | 0 | full local speed |
| D. server + browser (same 8 cores) | 9–20 of ~50/gen | slower here only because the browser competes for the same cores |
| E. server killed after gen 1 | 27, 16, then 0 | finished locally |
| F. server started after gen 0 | 0, 0, then 1, 1 | re-registered and rejoined |

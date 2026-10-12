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

### First real farm: the living room machine
- Robby opened the page on the low-power living room machine ("calendar", 4 cores) and
  on this desktop's own browser ("lilg", 8 cores; Robby keeps it open as the admin panel,
  set to 4 threads).
- **Canaries passed on both** (15 replays identical): a different machine and browser runs
  the andnow sim bit-for-bit like this desktop's Node.
- Small run (pop 48): identical results, but *slower* with the farm (1.6 s vs 0.9–1.2 s
  per gen): with tiny generations the tail (waiting for, and locally re-running, batches
  out at slower devices) dominates.
- Real size (evo5 settings, pop 128, ~190 batches/gen): identical results; **7.2–8.2 s →
  5.2–7.7 s per generation (~25% faster)**, the farm doing 103–127 batches/gen (part of
  that was lilg's browser threads sharing this desktop's cores with the local threads).
- Threads slider now goes to **0 = watching only**, for a dashboard on the machine that
  runs the work itself.
- Clean comparison (lilg set to 0 threads, so only calendar helping; same args back to
  back, pop 128 × 4 gens at evo5 settings): local only 7.0–8.6 s/gen, **31 s total**; with
  the farm 5.1–6.1 s/gen, **23 s total (26% faster)**; calendar's 4 low-power cores did about
  a third of the batches (59–67 of 182–214). Results identical.
- Farm table now lists only threads seen in the last 10 s (it was showing lilg's stopped
  threads, which the server remembers for 2 minutes).

### Background tabs fall asleep
Pinky's PC and the living room PC dropped off the farm after a while; looking at the tab
again brought them back (and they picked up work again, as designed). Browsers freeze
background tabs: Edge "sleeping tabs" (inactivity-based, configurable), Chrome freezing in
Energy Saver (CPU-heavy tabs hidden + silent > 5 min). Lost capacity, never lost work.
- The page now holds an **IndexedDB connection** and a **Web Lock** for its lifetime: Chrome
  documents both as exemptions from freezing. IndexedDB works over plain http on the LAN;
  Web Locks (and the screen wake lock) need HTTPS or localhost, so they're feature-detected.
  Edge's sleeping-tab heuristics aren't documented; no promises there.
- Optional **keep the screen on** checkbox (Screen Wake Lock; where available).
- **Sleep detection**: a 5 s heartbeat; a gap > 30 s logs "this tab was asleep for N s".
- **A tip on the page** with the dependable fix for the browser it's running in: Edge →
  "Never put these sites to sleep", Chrome → "Always keep these sites active", add the farm's
  host:port.
- **Share of farm** column (user: "a percent of total work readout"): each device's share of
  what the farm is doing now (by rate) and of everything since the server started. Only the
  browser tabs count: the client's local work deliberately isn't reported (user: "Local
  doesn't need to report in its work"), so I dropped a job-total field I'd started on.

### Long items (andnow island dishes, 30–90 min each)
User: "these long run pieces of work aren't reflected in the potluck ui well." The page was
built for second-long batches: rate per minute, "working on" only shown when the rate was
non-zero. Worse, a thread busy for an hour never talks to the server (`run()` is
synchronous), so after 10 s it dropped off the farm table, after 2 min the server forgot it
(and its done count), and `/api/capacity` stopped counting it. `working` also stuck around
after the item finished (it showed a label with no jobs open).
- **Server tracks each thread's `current`** (item or canary, job, index, since), cleared on
  result/canary/none. Jobs keep each item's duration (lease start → result).
  `/api/status` adds `now`, per-worker `state` (working / verifying / idle / paused),
  `current` (with `stale` when the result already came from elsewhere: the thread can't be
  stopped), `last`, per-job `done`/`queued`/`started`/`durations`/`leases`, and a
  `finished` list. Old fields kept.
- **Page heartbeat**: the page's main thread posts `/api/heartbeat` every 4 s for its
  threads. A thread is live if heard from in 10 s; pages from before the heartbeat get the
  benefit of the doubt while their lease runs. Pages carry a `session` (new per thread
  restart): a reload, or 60 s of silence, hands that page's leased items back to the queue
  instead of waiting out andnow's 3 h dish lease.
- **Page redone** around "what's running and for how long": a headline (threads working,
  items done, next finish), a job card per job (done / running / waiting bar, typical item
  time, an estimate to go by handing queued items to whichever thread frees up first),
  thread tiles per device with a big live clock and a bar against the job's average
  ("longer than typical" past it, moving stripes before any item has finished),
  idle threads as small chips, recently finished items with durations. Scales the root
  font with the viewport for the TV/xbox helpers. Animations keep their phase across
  the 1 s re-render via a negative `animation-delay`.

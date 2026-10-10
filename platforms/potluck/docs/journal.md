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

# Qwestworld — Journal

## Session 1 — 2026-09-24 — "a window into another world"

### Origin
Wanted a game a local AI could live in on this CPU-bound desktop (i7-4770, 31 GB, no GPU). Brainstormed toward: mega-scale sim/RTS, civilization "the size of a wall", a world running at its own rate that you look into. First pass: continent RTS, almost no brains. A couple of kings are LLMs, everything below is hands.

### Architecture (sim ≠ view)
- `src/sim/` — daemon (`npm run sim`). World, court (kings), persistence, HTTP API on 0.0.0.0:4200 with CORS. No rendering, no static files.
- `src/view/` — viewer (`npm run view`, :4201). Static server + canvas client. Point it at any sim with `?sim=http://host:4200` or `SIM_URL=`.
- `src/cli/qw.ts` — terminal viewer (`npm run qw -- status|kings|chronicle|map|pause|resume`). Same API and powers as the browser viewer. This is also how Claude observes the sim.
- `src/shared/types.ts` — constants and API shapes.

API: `/api/meta`, `/api/terrain.bin` (terrain+height bytes), `/api/regions.bin` (Uint16 tile→settlement), `/api/state` (JSON), `/api/soldiers.bin` (tick, n, Uint16 x[], Uint16 y[] at 1/32 tile, Uint8 faction[]), `/api/health`, `POST /api/control {action: pause|resume}`.

### World
- 1024×576 tiles. Map is a pure function of the seed: warped fbm + ridges, quantile sea level, largest landmass is walkable. Only dynamic state is saved (`data/world.json`, every 2 min and on SIGTERM).
- 64 settlements (poisson-ish), 4 kingdoms from farthest-point capitals. Regions come from a multi-source walking-distance field, which gives terrain-following borders and adjacency.
- Soldiers are SoA typed arrays (cap 131k). Garrison or army. Each walks down the target settlement's distance field (Dial's algorithm, cached per settlement).
- Combat: 4×4 tile cells, per-faction counts; chance of falling ∝ enemy share × terrain defense. Foreign-land attrition.
- Sieges: enemy present and no defenders within ±2 cells → capture over ~18 hours. Contested towns don't recruit.
- Recruitment fills the garrison, then overflows into a host resting there.
- Orders travel by courier (45 tiles/day). March orders: obey (72–92% by loyalty), misread (marches on a neighbor), or ignore.

### Kings
- `KINGS=qwen,qwen,script,script` (default). Script kings: attack the weakest of the 3 nearest foes when ≥1.6× stronger; keep 2 hosts.
- Qwen kings: `/api/chat` with 4 tools (march, hold, muster, proclaim), a report in the user message, `/no_think`, `think:false`, `keep_alive:-1`, num_predict 400.
- If Ollama fails, the advisors (script) rule that council.

### Model findings
- qwen3:30b-a3b: 264s for one decision. 65s load, 12s prompt, 186s of reasoning leaked into content despite think:false.
- Advice from the local-ai session (measured on this box): qwen3:8b matches the 30B on tool tasks at ~1/5 the wall time. The 30B ignores think:false. Use terse tool descriptions, keep_alive -1, and a byte-identical system prompt + tools across kings with the per-king text last.
- qwen3:8b in the sim: ~800 prompt tokens, ~30 output tokens (clean tool call, no leak). Cold ~144s (with a browser rendering), warm 37–62s.

### Balance notes
- v0: total stalemate. Armies circled towns at radius ~11 tiles, never engaged garrisons, and attrition killed them. Fix: attackers crowd to radius 3 on foreign targets, and contested towns stop recruiting.
- "Destroyed near Grisreach" for every army was a bug (centroid reset to 0,0 before the obituary).
- POP_SCALE=3 → ~25k soldiers in year 1. Step cost ~2ms per 12k soldiers alone; ~9–40ms while Ollama saturates the CPU (sim runs at nice 19).
- Pacing: 12 tps, council every 45 days, grace 10 days. Two qwen kings at ~50s each mostly keep up.

### Knobs (env)
SEED, KINGS, KING_MODEL (qwen3:8b), OLLAMA_URL, TICKS_PER_SEC (12), COUNCIL_DAYS (45), GRACE_DAYS (10), PORT, HOST, DATA_DIR. Viewer: PORT (4201), SIM_URL.

### Watching the first kings (year 1–2)
Watched two qwen3:8b kings against two scripted kings.

- **Leobert (Zandun, "cautious and patient").** Gave two real orders ("Edvin → Barhaven"). Edvin ignored the second (the hands' disobedience roll). Leobert's next council was a threat, the most in-character line so far: *"General Edvin is to march on Barhaven, and if he disobeys, he shall be held accountable…"* After that, 12 councils of proclamations only, all near-identical ("I will not rashly send forth our hosts, but when the time is right…"). Meanwhile overflow recruitment ballooned Edvin's idle host to 8,028, the biggest army on the continent, doing nothing.
- **Edric (Grisreach, "ambitious and proud").** His only general, Merdric, died at Grisvale. For nine councils he kept ordering Merdric to march and never mustered, while shrinking from 12 towns to 4.
- **Diagnosis: the report shaped behavior more than the temperament did.** Edric's report echoed "Your last commands: march: no general named Merdric", which re-primed the dead man's name every council. An 8B model follows names it sees; it doesn't reason from absence ("You have no generals in the field").

### Fix 1: outcomes, not errors (continuity v1)
- Failed commands become in-fiction outcomes: *"You sent word to General Merdric, but no such general serves you. Merdric is destroyed near Grisvale."* (found by searching the chronicle for the general's fate).
- With no generals, the report adds: "A muster raises a new host from a garrison."
- A "reign so far" section (the last 8 in-fiction outcomes) replaced the raw last-commands echo.
- Added a `journal` tool (the king writes notes to himself, last 5 shown).
- Fixed general names repeating after a restart (NameGen's used set now persists and is also rebuilt from the chronicle).

**Result:** Edric broke his loop on the very next council (muster ×2, then orders for the new generals Halda and Edwyn). Leobert saw his own two identical proclamations side by side in "reign so far" and delivered the same speech a third time. Neither king ever used `journal`. An 8B model ignores an optional tool nobody asks for.

Later, while we weren't looking, Leobert woke up: he mustered, sent Edvin and Cynmir on campaigns, and won Thorncrag (24-day battle, 1,169 dead). He also won Grisgate *by accident*: Edvin misread the seal, marched on the wrong town, and took it. The hands' noise is producing history.

But Edric fell into a new loop: the identical "Halda → Dunstead | Edwyn → Marcrag" for 6 councils. Each council was stateless, so he couldn't see he was repeating himself.

### Fix 2: a rolling context window (continuity v2)
Decision (user's direction): drop the journal. The kings keep a rolling conversation of their last 5 councils (`KING_MEMORY`), where each user turn is the date plus the update on the realm.

**Tradeoff: prompt reading is the bottleneck on this CPU (~20 tok/s for qwen3:8b).** A full report is ~500–900 tokens, so five full reports would mean ~4 minutes of reading per council. So:
- **The current turn** gets the full report.
- **Older turns** are stored as a *brief*: date, settlements held, generals with size and location, and that council's news.
- **The king's own tool calls** stay verbatim as assistant messages. Their results come back as `tool` messages (the in-fiction outcome text).
- The system prompt now includes the king's identity. We lose the shared-prefix cache across kings, but with two kings alternating on one Ollama slot the cache was barely helping anyway.
- num_ctx 4096 → 8192.

Removed: the journal tool, the reign section in the report (reign is kept for viewers only).

Observability: `GET /api/kings/:id/context` returns exactly what a king would be sent right now, and `qw context a` prints it. This lets us (and Claude) read a king's mind-state directly.

**First results with memory (Year 4):**
- Edric broke the 6-council repetition on his first council with history: "Halda → Thornwick | Edwyn holds | muster at Dunstead | proclamation". That's the most varied council any qwen king has held.
- Leobert switched Edvin's target to Ashwall, adapting to where the misread had actually sent his general instead of insisting on Dunbarrow.

### Performance note
Council wall time has crept up: 37–62s warm at first, now 160–290s. Prompt size is similar (~900–1,150 tokens). The difference is CPU contention: viewers rendering 40k dots at 60fps in browsers on this box, plus the sim itself. **Viewing from another machine on the LAN is not just nicer, it frees this machine's CPU for the minds.**

### Next
- Watch the rolling window over many councils. Does memory produce plans that span councils?
- Idle-army problem: overflow recruiting grows resting hosts without bound. Consider upkeep or desertion for idle hosts (gives kings a reason to act).
- Try llama3.2:3b (independent calls, ~2.4× faster).
- Scale up: more realms, more soldiers, a bigger map for the wall.

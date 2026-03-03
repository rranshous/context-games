# Glint — Development Journal

## Concept
Baby squid survival in a bioluminescent coral reef. Dark but upbeat — a coming-of-age story in the deep. Core chase loop inspired by hot-pursuit (AI predators that learn your patterns), rendered in dark-rider style (Three.js, isometric, cel-shaded, pixelated).

## Session 1 — Scaffolding (2026-03-02)

### Decisions
- **New game**, not a hot-pursuit reskin — the theme diverges enough to warrant its own project
- **Name: Glint** — small flash of light in dark water. That's the baby squid.
- **Three.js + dark-rider rendering style**: orthographic isometric, cel-shaded MeshToonMaterial, 320×240 internal res with 3× pixelated upscale, FogExp2 for murky depth
- **TypeScript + esbuild** (same pattern as hot-pursuit/cognitive-climb), output to `dist/`
- **Gamepad support** from day one — target Xbox controller via browser for couch play
- **Vanilla platform** for dev: `http://localhost:3000/dev/glint/index.html`
- Keep scope small first: nail the core chase loop before adding growth/progression mechanics

### Built
- Project scaffold: package.json, tsconfig, esbuild config (with `--watch`)
- index.html: Three.js via CDN importmap, pixelated canvas
- src/main.ts: basic scene with:
  - Ocean floor + sand patches
  - Coral clusters (cylinders + branches, blue-purple hues)
  - Rocks (dodecahedrons), kelp (swaying cones)
  - Baby squid: blocky body, glowing eyes, tentacles, bioluminescent point light pulse
  - Scattered ambient bioluminescence
  - WASD/arrows + gamepad left stick input (isometric-corrected)
  - Camera follows squid

### Theme Mapping (from hot-pursuit)
| Hot Pursuit | Glint |
|---|---|
| Player (car) | Baby squid |
| Police cruisers | Predators (sharks, eels, etc.) |
| City grid | Coral reef labyrinth |
| Roads | Open water channels |
| Buildings | Coral formations |
| Alleys | Narrow crevices |
| Extraction point | Safe den |
| Sirens | Bioluminescent threat glow |
| Precincts | Life stages / deeper water |

### Next
- Visual check — does the scene look/feel right?
- Add predator(s) — start with a simple shark patrol
- Wire up chase detection + evasion loop

## Session 1b — Visual Polish (2026-03-02)

### Feedback & Fixes
- **Squid looked like a fish** → rebuilt: bulbous dome mantle, lateral eyes with pupils, side fins that flutter, 8 tentacles in a ring splaying outward. Reads as squid now.
- **Flat plane "fan coral"** → removed. Replaced with tube coral (cylinder clusters with glowing torus rims) and shelf coral (stacked tilted discs on a stem). No more mystery squares.
- **Coral looked like rocks** → 4 coral types now: branching (trunk + forking arms with glowing tips), brain (squashed icosahedron), tube (thin cylinders with glowing rims), shelf (stacked plates). Warm color palette: pinks, oranges, yellows alongside blues/purples.
- **Nothing moved passively** → added current sway: branching coral and tube coral gently sway (tracked in `swayItems[]`), kelp has bigger arcs, jellyfish drift in wider patterns, particles drift laterally too. Rocks stay still (they're rigid).
- **No collision yet** — intentional. Visual pass first.

### Architecture Notes
- Seeded RNG (`mulberry32(42)`) for deterministic reef layout across reloads
- `swayItems[]` array tracks all coral groups that should animate in the current
- Reef structure: `placeWall()` for boundary/interior walls, manual placement for anemone clusters and kelp groves
- All coral types return their group/mesh; wall placement dispatches randomly between types

### Dev Workflow
- `npm run watch` in background for continuous rebuild
- Commit aggressively for continuity across context windows
- Update this journal each commit

### Next
- Continue iterating visuals based on playtesting feel
- Add first predator (shark patrol)
- Wire up chase detection + evasion loop

## Session 1c — Procedural Map + Collision (2026-03-02)

### What Changed
- **Modular architecture**: split monolithic main.ts into 4 files:
  - `src/map.ts` — grid generation, tile types, collision helpers
  - `src/reef.ts` — renders grid tiles as Three.js coral meshes
  - `src/squid.ts` — player model, input, movement with collision
  - `src/main.ts` — wiring, camera, animation loop
- **Procedural map** (50×50 tiles, cellular automata):
  1. Random noise (42% wall fill)
  2. 5 iterations of smoothing (5+ neighbors → wall)
  3. Flood fill from center, fill disconnected pockets
  4. Identify crevices (1-tile passages with walls on opposite sides)
  5. Place kelp groves (circular clusters in open areas)
  6. Place dens (dead-end tiles with 3+ cardinal walls, warm glow)
- **5 tile types**: OPEN, WALL, CREVICE (squid fits, big predators won't), KELP (partial cover), DEN (safe zone with warm light)
- **Collision**: per-axis checks against 4 corners of collision box (radius 0.3). Slide along walls. `isPassable(map, x, z, isSmall)` — crevices only passable when `isSmall=true`.
- **Coordinate system**: `worldToTile()` / `tileToWorld()` convert between world coords and grid coords. Tile (0,0) is top-left, world (0,0) is center of map.
- **TILE_SIZE = 2** world units per tile. Map spans -50 to +50 world units.

### Architecture Notes
- `ReefMap` = `{ width, height, tiles[], playerSpawn, dens[] }`
- `buildReef()` returns `ReefScene` with `swayItems`, `kelpMeshes`, `anemones`, `denLights` for animation
- Shadow light follows player (so shadows work as you move through the large map)
- Particles now spread across full map area
- Seeded RNG everywhere — same seed = same map = deterministic

### Playtest Feedback (end of session 1)
- **Squid too slow** — base speed needs a bump, plus add a sprint button (Shift / gamepad trigger)
- **Walls too thick in places** — some coral walls are very dense; could thin them or reduce wall fill %
- **Open areas too boring** — large open chambers are just blank sea floor. Need visual interest: scattered small coral, sea stars, shells, sand ripples, maybe small fish. The open water should feel alive, not empty.
- **Large open areas are ok in principle** — just need decoration

### Next Session TODO
1. ~~**Speed**: bump base MOVE_SPEED from 4→6, add sprint (Shift/RT) at ~1.6× multiplier~~
2. ~~**Open area decoration**: scatter small props in OPEN tiles~~
3. **Wall thickness**: consider lowering wall fill from 42%→38% or adding an extra smoothing pass
4. **First predator** (shark patrol) — the real game loop
5. ~~**Consider minimap**~~ — decided against, not needed

## Session 2 — Visual Tuning + Alcove Design (2026-03-02)

### What Changed

**Speed & Sprint** (squid.ts)
- `MOVE_SPEED` 4 → 6
- Sprint at 1.6× via Shift key or gamepad RT (button index 7)

**Open Area Decoration** (reef.ts)
- 12% of OPEN tiles get a floor prop, 4 types:
  - Sea stars (35%) — 5-armed flat shapes, warm hues
  - Shells (25%) — small hemispheres
  - Sand ripples (20%) — torus arcs flush with floor
  - Coral nubs (20%) — small branches poking up
- First pass was invisible (too small + too dark). Scaled up ~2.5× and brightened colors.

**Wall Coral Scaled Up** (reef.ts)
- Branching: trunk 0.15→0.3 radius, 1.4–3.0 height, 3–6 branches spread wider
- Brain: radius 0.7–1.3 (was 0.4–0.9)
- Tube: tubes 0.06–0.12 radius (was 0.03–0.06), 0.8–2.6 height, wider spread
- Shelf: discs 0.5–1.0 radius (was 0.3–0.7), thicker stems
- Rocks: 0.4–0.9 (was 0.2–0.6), 25% chance (was 20%)
- Walls now feel like proper barriers, not scattered twigs

**Kelp Redesign** (reef.ts)
- Was: 1–2 rigid cones per tile
- Now: 4–7 fronds per tile, each built from 5–7 stacked segments with sinusoidal S-curve offsets
- Wider spread (1.4 units), varied thickness, color variation per frond
- Combined with existing sway animation = organic wavy kelp forest

**Map Edge Fix** (reef.ts)
- Floor plane was `mapSize + 20` — showed bare floor past border walls
- Now matches map bounds exactly. Edge fades to dark void via fog.

**Debug Hook** (main.ts)
- `window.__glint = { map, squid, tileToWorld, TILE_SIZE, MAP_W, MAP_H }` for runtime inspection

### Critical Discovery: Zero Hiding Spots

Runtime inspection revealed **0 dens and 0 crevices** on the current map (seed 42):
- OPEN: 1592, WALL: 835, KELP: 73, CREVICE: 0, DEN: 0
- The cellular automata smoothing produces blobby walls that never create dead-end tiles (3 cardinal wall neighbors) or 1-wide passages (walls on opposite sides only)
- This means the hide-flee-hide gameplay loop has nowhere to hide

### Alcove & Hiding Design

**Core gameplay loop**: hide → flee → hide. The squid spends most of its time hiding, with tense dashes between cover when predators aren't looking.

**Hiding spot types** (planned):
1. **Dens** — carved alcoves in wall edges (1–2 tiles deep). Safe zones: predators can't enter. Warm glow visual. Need to be actively carved by map gen since cellular automata won't produce them naturally.
2. **Crevices** — narrow 1-tile passages. Squid fits, large predators don't (already in `isPassable` via `isSmall` flag). Detection needs to be relaxed from current too-strict rule.
3. **Kelp cover** — soft concealment. Squid can hide among kelp fronds. Not impassable to predators, but breaks line of sight.

**Concealment mechanic**:
- When squid is in a hiding tile (DEN, CREVICE, or KELP), it enters concealed state
- **Visual cue**: squid dims its bioluminescent glow and shifts color (darker/muted), blending into surroundings
- Concealment is a **sensor-level** mechanic, not a rule — predators don't "respect" concealment as a game rule. Instead, the predator's chassis/sensors simply can't detect a concealed squid. This is consistent with the hot-pursuit embodiment model: the predator's sensing code determines what it can perceive, and a dim/hidden squid falls below its detection threshold.
- This means smarter predators could potentially learn to check known hiding spots, or develop better sensors — the concealment isn't absolute, it's a function of the predator's sensory capabilities vs the squid's stealth state.

**Map gen fix needed**: Add an alcove-carving step after cellular automata:
- Walk wall edges bordering open space
- Carve 1–2 tile pockets inward
- Mark carved tiles as DEN
- Target: ~15–20 alcoves spread across map so the squid is never more than a few seconds' sprint from cover
- Also relax crevice detection (2+ cardinal wall neighbors instead of strict opposite-sides rule)

### Next Session TODO
1. ~~**Alcove carving in map gen**~~ — done (session 3)
2. ~~**Relax crevice detection**~~ — done (session 3)
3. **Concealment state** — squid dims/recolors when in hiding tile
4. ~~**Den visuals**~~ — done (session 3)
5. **First predator** — after hiding works, add a shark patrol to test the loop

## Session 3 — Hiding Spots (2026-03-02)

### What Changed

**Alcove Carving** (map.ts, new step 4)
- Cellular automata never produced dead-ends or 1-wide passages — zero dens, zero crevices
- New algorithm walks all wall tiles bordering open space, looks inward (away from open) for a second wall tile
- If the inner tile has 3+ cardinal wall neighbors, it's a valid alcove candidate
- Candidates shuffled, then picked with ≥7 Manhattan distance spacing + ≥4 from spawn
- Entrance wall → OPEN, inner wall → DEN
- Result: **18 dens** spread across the full map (x: 1–46, z: 6–48)
- Two dens accessible only through crevices — extra cozy

**Relaxed Crevice Detection** (map.ts, step 5)
- Old rule: walls on strict opposite sides (N+S or E+W) and no walls on the other axis — never triggered
- New rule: any OPEN tile with 2+ cardinal wall neighbors becomes CREVICE
- Result: **129 crevices** (was 0) — corners, L-bends, and narrow passages all qualify

**Den Visuals Scaled Up** (reef.ts)
- Arch: 0.4 → 0.8 radius torus, thicker tube (0.25)
- Added flanking rocks (dodecahedrons) on each side of entrance
- Anemone: 6–10 tendrils (was 4–7), bigger with tilt variation
- Warm glow: intensity 1.5 → 2.0, range 5 → 7 — visible from a distance
- Everything in a Group so it moves/renders as one unit

**Tile Count Comparison** (seed 42)
| Tile | Session 2 | Session 3 |
|------|-----------|-----------|
| OPEN | 1592 | 1461 |
| WALL | 835 | 799 |
| CREVICE | 0 | 129 |
| KELP | 73 | 93 |
| DEN | 0 | 18 |

### Next
1. ~~**Concealment state**~~ — done (session 4)
2. ~~**First predator**~~ — done (session 4)
3. **Wall thickness** — still on the backlog, may not need it now that crevices exist

## Session 4 — Concealment + First Predator (2026-03-02)

### What Changed

**Concealment State** (squid.ts)
- When stationary on DEN, CREVICE, or KELP tiles, squid enters concealed state
- Visual: mantle/body lerp to dark blue-black (0x112233/0x0a1a28), glow drops from 2.5 → 0.3
- Smooth transitions via exponential lerp at 4/s — fades in gently, snaps out when moving
- `squid.concealed` boolean exposed for sensor queries
- Moving breaks concealment instantly (any input = visible again)

**Predator Architecture** (predator.ts — new file)
- **Soma/Chassis separation** — following hot-pursuit pattern:
  - **Chassis**: physical scaffold (speed, turn rate, collision radius, sensor range, isSmall)
  - **Soma**: experienced state (patrol/chase/search, waypoints, last-seen, timers)
- Each predator type provides its own `updateSoma` and `animate` hooks via closures
- Shared infrastructure: Bresenham tile-based LOS, sensor reads, steering + collision, waypoint picking
- Clean interfaces for adding future predator types (eel, barracuda, etc.)

**Shark Predator** (shark.ts — new file)
- First predator type: torpedo body, dorsal/tail/pectoral fins, red-orange threat eyes + glow
- Chassis: speed 3.5, chase 5.5, turn 2.0 rad/s, collision 0.5, sensor range 16, isSmall=false
- Soma state machine: PATROL → CHASE → SEARCH → PATROL
  - PATROL: random waypoints >10 world units apart, base speed
  - CHASE: beeline to squid, chase speed, update target per frame
  - SEARCH: lost LOS → investigate last-known position for 5 seconds
- Can't fit through crevices (isSmall=false) — squid's escape route
- Threat glow pulses with state: calm orange (patrol), angry red (chase), alert orange (search)
- Tail wag speed doubles during chase
- 3 sharks spawned per map, >15 tiles and >20 world units from player spawn

**Catch Mechanic** (main.ts)
- Distance check: shark collision radius (0.5) + squid radius (0.3) = 0.8 threshold
- On catch: squid respawns at spawn point, all predators reset to PATROL
- **Invulnerability**: 2 seconds after catch, squid can't be caught again
- **Sensor suppression**: during invuln, all predators receive blank sensor data — squid "invisible"
  - Forces chasers into SEARCH → PATROL, naturally scattering them instead of camping spawn

### Bugs Found & Fixed
- **Catch-every-frame**: without invulnerability, shark touching squid at spawn triggered catch 60×/sec, resetting all predator state each frame so nothing could move → added invuln timer
- **Spawn camping**: after catch, shark stayed near spawn and re-caught immediately → sensor suppression during invuln forces scatter
- **Shark near spawn**: RNG happened to produce a spawn that passed tile-distance check but was close in world coords → added world-distance validation (>20 units)

### Architecture Notes
- `predator.ts` is type-agnostic — adding a new predator type means creating a new file (like shark.ts) with: model builder, chassis config, soma behavior, animate function
- Sensor data struct (`SensorData`) is the interface between chassis sensors and soma decisions
- `updateSoma` and `animate` are closures that capture mesh refs — no fragile child indexing
- Concealment is sensor-level: `readSensors()` checks `squid.concealed` — predator chassis simply can't detect a concealed squid. No game rules needed.

### Visual Tuning
- Squid glow pulse amplitude 0.6 → 0.2 — was too dramatic, squid went visibly dark in open water. Now a subtle breathing effect (2.3–2.7 range).

### Next
1. **Self-modifying predator instincts** — paralleling hot-pursuit's soma/reflection architecture
2. **Ink cloud** — escape ability (Space/A button), brief smoke screen that blocks LOS for a few seconds
3. **Visual feedback on catch** — screen flash, maybe a brief freeze frame
4. **HUD** — minimal: lives or health, maybe a danger indicator when sharks are near
5. **Predator variety** — eel (fast, fits crevices, short attention) or anglerfish (slow, lure, wide detection)
6. **Sound design** — ambient ocean, heartbeat when chased, relief sigh when hidden

## Session 5 — Self-Modifying Predator Instincts (2026-03-02)

### Motivation
Session 4's shark had a hardcoded 3-state FSM (PATROL→CHASE→SEARCH). In hot-pursuit, police officers have editable JS code strings that Claude rewrites after each chase. This session brings the same self-modifying spirit to glint's predators, adapted for continuous underwater gameplay.

**Key divergences from hot-pursuit:**
- **Async reflection** — no game pause; predators reflect in background while patrolling after a failed hunt
- **Failure-driven** — only failed hunts trigger reflection (you learn from losing prey, not catching it)
- **Biological framing** — "instincts" and "stimuli" instead of "signal handlers" and "signals"
- **Free-form states** — predators can invent states beyond patrol/chase/search (e.g. `ambush`, `check_kelp`, `spiral_search`)
- **Text-only** — no bird's-eye replay image; text hunt summaries are enough for haiku
- **Memory writes during execution** — predators can jot spatial notes mid-hunt

### M1: Instinct Architecture (3 new files, 3 modified)

**`src/soma.ts`** — The predator mind
- `PredatorSoma` interface: id, species, nature (poetic identity), instinctCode (JS string), memory, huntHistory, lastReflectionTime, reflectionPending
- `createDefaultSharkSoma(id)` factory with default instinct code that reproduces the old PATROL/CHASE/SEARCH FSM

**`src/instinct-api.ts`** — The `me` object passed to instinct code
- Movement: `pursue()`, `patrol_to()`, `patrol_random()`, `hold()`
- Sensing: `check_los()`, `nearby_tiles(type)`, `distance_to()`
- State: `getLastKnown()`, `setLastKnown()`, `getTimeSinceLost()`, `getPosition()`
- Memory: `memory.read()`, `memory.write()`
- `PendingAction` queue — first action per tick wins

**`src/instinct-executor.ts`** — Compile + execute
- `compileInstinct(soma)` — AsyncFunction constructor, cached by soma.id + code comparison
- `executeStimulus(instinct, type, data, api)` — Promise.race with 50ms timeout
- `clearInstinctCache()` — called after reflection updates code

**`src/predator.ts`** — Restructured
- Renamed `Soma` → `PhysicalState` (runtime working memory)
- Added `dispatchStimulus()` — determines stimulus type (prey_detected > prey_lost > tick), creates API, compiles + executes instinct, applies actions
- Busy guard: `Set<string>` for async safety in rAF loop
- Synchronous fast-path for default (non-async) instinct code

**`src/shark.ts`** — Simplified
- Deleted `updateSharkSoma()` entirely
- Accepts optional `PredatorSoma` for loading saved/evolved somas
- String state comparisons with default fallthrough for custom states

### M2: Hunt Tracking

**`src/hunt-tracker.ts`** — Episode recorder
- `HuntTracker` class: startHunt/recordEvent/endHunt/isHunting/getCompletedHunts
- Event types: detected, pursuing (0.5s throttle), lost_los, prey_concealed, prey_revealed
- `buildTextSummary()` produces human-readable hunt replays for Claude
- `HuntSummary` includes outcome, duration, closest distance, concealment info

**`src/main.ts`** — Hunt integration
- Hunts start on first detection, record events on state transitions
- End as 'catch' on capture, 'lost' when predator returns to patrol
- Track `prevConcealed` and `prevState` per predator for transition detection

### M3: Reflection System

**`src/reflection.ts`** — Async predator learning via Claude
- 3 scaffold tools: `update_instinct`, `update_memory`, `recall_hunt`
- `buildSystemPrompt(soma)` — species identity, current instincts, memory, hunt history, reef knowledge, movement API reference
- `buildReflectionPrompt(huntSummary, huntCount)` — hunt replay, coaching on what to try
- `validateInstinctCode(code)` — forbidden patterns (eval, Function, import, fetch, window, document), signature check, syntax check, 10k char limit
- `reflectPredator()` — max 3 turns, haiku model, 2048 max tokens
- `shouldReflect()` — 60s cooldown (skip on first reflection), 2s min hunt duration

**`src/persistence.ts`** — Save/load to localStorage
- Keyed by map seed: `glint-predators-42`
- Load on startup, save after each reflection

**`src/main.ts`** — Reflection wiring
- `triggerReflection()` — records hunt history, fires reflectPredator async, saves on completion
- Load saved somas on startup, pass to createShark()
- Debug: `window.__glint` expanded with triggerReflection, readSensors, invulnTimer, resetSomas, saveSomas

### Bugs Found & Fixed
- **Cooldown blocking first reflection**: `shouldReflect()` had `gameTime - lastReflectionTime(0) < 60` which blocked all reflections in the first 60 seconds. Fixed: skip cooldown when `lastReflectionTime === 0` (never reflected).
- **Dynamic import in animation loop**: early version used `await import('./map.js')` in the hunt tracking section — created async dynamic import every frame. Fixed with static import.

### E2E Verification
- Manually created a 4s failed hunt, triggered reflection, waited for haiku response
- **Result**: shark-0's instinct code grew from 675 → 1553 chars
  - New behavior: after losing prey, checks `nearby_tiles('kelp')`, `nearby_tiles('den')`, `nearby_tiles('crevice')`, patrols to nearest hiding spot
  - Extended search time from 5s to 6s
- Memory updated: "Kelp around (3.0, 3.0) is a hiding spot..."
- Persistence confirmed: evolved instincts survive page reload

### File Summary
| File | Status |
|------|--------|
| `src/soma.ts` | NEW |
| `src/instinct-api.ts` | NEW |
| `src/instinct-executor.ts` | NEW |
| `src/hunt-tracker.ts` | NEW |
| `src/reflection.ts` | NEW |
| `src/persistence.ts` | NEW |
| `src/predator.ts` | MODIFIED |
| `src/shark.ts` | MODIFIED |
| `src/main.ts` | MODIFIED |

### Post-commit: Removed setState/getState

Decoupled the engine from magic state strings. The `prey_lost` stimulus was gated on `state === 'chase'` — a fragile coupling where the instinct code had to call `me.setState('chase')` for the engine to fire `prey_lost` next frame. Replaced with `wasPursuing` boolean: the engine tracks whether the instinct called `me.pursue()` last frame, which is what actually matters.

**Changes:**
- `PhysicalState.state` removed entirely, replaced with `wasPursuing: boolean`
- `getState()`/`setState()` removed from InstinctAPI
- `current_state` removed from StimulusData
- Animation reads physical signals (`wasPursuing`, `lostTime`, `lastSeenPos`) instead of string labels
- Hunt-end detection changed from state transition to `lostTime > 10s` timeout
- `lost_los` hunt event triggers when `wasPursuing` flips false (was pursuing, now isn't)
- Reflection system prompt updated — no more setState/getState docs
- Default instinct simplified: no state management, just `data.time_since_lost` for search timeout

### Design: Soma as Embodiment

Discussion about restructuring the predator soma to follow the cognitive-climb embodiment pattern: **the inference call IS the creature's body**. Every section of the soma is visible in the system prompt, and (most) sections are editable via named tools during reflection.

#### Core principle
The soma IS the predator's experienced self. Everything that goes into the inference call should be a named section of the soma. The engine provides a chassis (sensors, movement primitives, tile queries) and calls `on_tick` every frame. Everything else — stimulus classification, hunt journaling, behavioral response, state tracking — lives in soma code sections that the predator wrote (or inherited as defaults and then evolved).

#### Soma sections

**Editable sections** (reflection tools + runtime `me.<section>.read()`/`.write()`):
- `identity` — species, nature, hunting philosophy
- `on_tick` — per-frame code: reads sensors, tracks state, records events to journal, issues movement commands. This is the single code section the chassis compiles and calls. All current `dispatchStimulus()` logic (stimulus classification, `wasPursuing` tracking, `lostTime` management) moves here. The predator owns its own perception pipeline, not just its reactions.
- `memory` — persistent notes, spatial knowledge, prey behavior patterns
- `hunt_journal` — text log of hunt events, built up by `on_tick` code (code-driven, not template-driven), curated/summarized by reflection

**Read-only sections** (visible in system prompt, no edit tool):
- `reef_knowledge` — tile types, concealment rules, game physics
- `senses` — API reference for chassis primitives (`me.pursue()`, `me.nearby_tiles()`, etc.)

#### Key design decisions
- **on_tick is the only code section for now.** No separate `on_stimulus` — all behavior lives in `on_tick`. If we want evaluable sub-sections later (e.g. `me.on_stimulus.eval(type, data)`), we can add that, but start simple.
- **Section API at runtime:** `me.<section>.read()` and `me.<section>.write()` available inside `on_tick`. The predator can update memory mid-hunt, append to hunt_journal, even read its own code.
- **Code-driven collection:** The hunt journal is built by `on_tick` code, not by the game engine. The predator decides what events to log and how to format them. Reflection can curate/rewrite the journal.
- **State tracking moves into the soma.** `wasPursuing`, `lostTime`, `lastSeenPos` — these become state the soma manages itself via memory or variables, not engine-level `PhysicalState` fields. The predator can invent new tracking variables without engine changes.
- **Read-only for game mechanics.** `reef_knowledge` and `senses` describe reality — editing them doesn't change physics. Keep them immutable. The `memory` section exists for the predator to keep higher-level notes derived from these.
- **Reflection tools are named per section.** `edit_on_tick`, `edit_memory`, `edit_identity`, `edit_hunt_journal`. Named tools help the model use them consistently.

#### What the engine does (chassis)
Each frame: read raw sensors → compile soma's `on_tick` → call `on_tick(me, world)` where `world` has `{ squidDetected, squidPos, squidDist, dt, t }` → collect resulting movement action. That's it.

#### What the soma does (on_tick code)
Everything else: "Was I pursuing last frame? Yes, and now I can't see prey — log 'lost_los' to my hunt_journal, update lastSeenPos in memory, switch to searching nearby kelp." The predator owns its entire perception-action pipeline.

#### What shifts from current code
- `dispatchStimulus()` in predator.ts → becomes default `on_tick` code in the soma
- `PhysicalState` fields (`wasPursuing`, `lostTime`, `lastSeenPos`) → managed by soma code via `me.memory`
- Hunt tracking in main.ts → moves into soma's `on_tick` (journal writes)
- `buildSystemPrompt()` in reflection.ts → assembles all soma sections as XML tags
- Reflection scaffold tools → one per editable section instead of `update_instinct`/`update_memory`

### Next
1. ~~**Implement soma embodiment**~~ — done (session 6)
2. **Ink cloud** — escape ability (Space/A button), brief smoke screen that blocks LOS for a few seconds
3. **Visual feedback on catch** — screen flash, maybe a brief freeze frame
4. **HUD** — minimal: lives or health, maybe a danger indicator when sharks are near
5. **Predator variety** — eel (fast, fits crevices, short attention) or anglerfish (slow, lure, wide detection)
6. **Sound design** — ambient ocean, heartbeat when chased, relief sigh when hidden
7. **Inspector panel** — like hot-pursuit's soma inspector, show predator instinct code and memory live

## Session 6 — Soma Embodiment (2026-03-02)

### Motivation
Session 5 built self-modifying predator instincts, but the engine still owned too much: stimulus classification (`prey_detected`/`prey_lost`/`tick`), state tracking (`wasPursuing`, `lostTime`, `lastSeenPos`), and hunt event recording (HuntTracker). This session moves all of that into the soma's `on_tick` code so the predator owns its entire perception-action pipeline. The inference call IS the creature's body.

### What Changed

**PredatorSoma → named sections** (soma.ts)
- Old: `{ id, species, nature, instinctCode, memory, huntHistory[], ... }`
- New: `{ id, species, identity, on_tick, memory, hunt_journal, ... }`
- `identity` (was `nature`) — who I am, hunting philosophy
- `on_tick` (was `instinctCode`) — THE code, runs every frame with `(me, world)`
- `hunt_journal` (replaces `huntHistory[]`) — text log written by on_tick code, curated by reflection
- `HuntHistoryEntry` interface deleted

**Default on_tick merges engine + instinct** (soma.ts)
- Old: engine classifies stimulus type → calls `onStimulus(type, data, me)`
- New: `on_tick(me, world)` receives raw sensor data and does everything itself
- All working state lives in `me.memory` via string matching (no JSON, no hidden `me.state`)
- Includes minimal journal writes: logs detections and prey losses for bootstrapping reflection

**TickAPI replaces InstinctAPI** (instinct-api.ts)
- Deleted: `StimulusData`, `getLastKnown()`, `setLastKnown()`, `getTimeSinceLost()`
- Added: `WorldData` interface (`{ squidDetected, squidPos, squidDist, dt, t }`)
- Added: `me.hunt_journal.read()/write()`, `me.on_tick.read()`, `me.identity.read()`
- Journal write capped at 5000 chars (truncates from front)
- No hidden `me.state` — all working state goes through `me.memory` with string matching

**Engine simplified** (predator.ts)
- `dispatchStimulus()` → `runTick()`: no stimulus classification, no state tracking. Just: compile on_tick, build WorldData from raw sensors, create TickAPI, execute, apply action.
- `PhysicalState` shrunk: `{ waypoint, stuckTimer, lastActionType, timeSinceLastPursue }`
- Removed: `lastSeenPos`, `lostTime`, `wasPursuing` — managed by soma code via `me.memory`
- Animation hints derived from actions (`lastActionType`, `timeSinceLastPursue`), not soma internals

**Shark animation updated** (shark.ts)
- Old: `pursuing = pred.physical.wasPursuing`, `searching = ... && pred.physical.lostTime < 8`
- New: `pursuing = pred.physical.lastActionType === 'pursue'`, `searching = ... && pred.physical.timeSinceLastPursue < 8`

**Per-section reflection tools** (reflection.ts)
- Old: 3 tools (`update_instinct`, `update_memory`, `recall_hunt`)
- New: 4 tools (`edit_on_tick`, `edit_memory`, `edit_identity`, `edit_hunt_journal`)
- System prompt assembles all soma sections as XML tags
- `shouldReflect(soma, gameTime)` — no HuntSummary param; checks journal has content (>20 chars)
- `reflectPredator(soma, gameTime, endpoint)` — simplified signature
- Validation checks for `on_tick(me, world)` function signature

**HuntTracker deleted** (hunt-tracker.ts removed)
- All hunt tracking code removed from main.ts
- Journaling is now the on_tick code's responsibility

**Game loop simplified** (main.ts)
- Removed: HuntTracker, prevConcealed map, HUNT_GIVEUP_TIME, all hunt recording code
- Reflection trigger: every frame via `shouldReflect()` (timer-based, not event-driven)
- Catch reset: clears PhysicalState + runtime state for all predators

**Persistence simplified** (persistence.ts)
- No legacy migration — old localStorage is nuked manually
- Clean save/load of new PredatorSoma format

### E2E Verification
- Clean build, no TS errors
- Sharks patrol, chase, search, return to patrol — behavior identical to pre-refactor
- Animation: red glow (pursuing), orange (searching), dim (patrolling) — driven by action hints
- Catch + respawn + invulnerability working
- shark-2 reflected: `edit_on_tick` grew code from 1482 → 3213 chars, `edit_memory` recorded reef knowledge, `edit_hunt_journal` curated entries
- All 4 reflection tools exercised and working
- Persistence saves new format, migration path tested

### File Summary
| File | Action |
|------|--------|
| `src/soma.ts` | REWRITTEN |
| `src/instinct-api.ts` | REWRITTEN |
| `src/instinct-executor.ts` | MODIFIED |
| `src/predator.ts` | MODIFIED |
| `src/shark.ts` | MODIFIED |
| `src/reflection.ts` | REWRITTEN |
| `src/hunt-tracker.ts` | DELETED |
| `src/main.ts` | MODIFIED |
| `src/persistence.ts` | MODIFIED |

### Next
1. **Ink cloud** — escape ability (Space/A button), brief smoke screen that blocks LOS for a few seconds
2. **Visual feedback on catch** — screen flash, maybe a brief freeze frame
3. **HUD** — minimal: lives or health, maybe a danger indicator when sharks are near
4. **Predator variety** — eel (fast, fits crevices, short attention) or anglerfish (slow, lure, wide detection)
5. **Sound design** — ambient ocean, heartbeat when chased, relief sigh when hidden
6. ~~**Inspector panel**~~ — done (session 7)

## Session 7 — Shark Intel Panel (2026-03-02)

### Motivation
After 6 sessions of self-modifying predator instincts, there was no way to see what the sharks had learned without reading raw code in the browser console. Needed a human-friendly view of soma evolution.

### What Changed

**Inspector Panel** (index.html, inspector.ts — new file)
- Right-side panel (320px) alongside the game canvas, dark theme matching the game aesthetic
- Persistent panel with sticky "Shark Intel" header and REFRESH button
- On click: fires parallel haiku calls for all 3 sharks, comparing current soma to factory defaults
- Sharks still on defaults get an instant "Factory defaults — no reflections yet" (no API call)
- Changed sharks get a 3-5 sentence plain-English briefing of behavioral evolution
- Prompt includes current vs default `identity`, `on_tick`, `memory`, plus recent `hunt_journal` (last 2000 chars)
- System prompt frames haiku as a marine biologist observing simulated sharks

**Default Constants** (soma.ts)
- Extracted `DEFAULT_SHARK_IDENTITY` and `DEFAULT_SHARK_MEMORY` as named exports for comparison

**Layout** (index.html, main.ts)
- Canvas now appended to `#game-container` inside a `#game-wrapper` flex row
- Panel sits to the right of the canvas, seamless border

### File Summary
| File | Action |
|------|--------|
| `index.html` | MODIFIED — flex wrapper, panel HTML/CSS |
| `src/inspector.ts` | NEW — panel logic + haiku briefing |
| `src/soma.ts` | MODIFIED — export default constants |
| `src/main.ts` | MODIFIED — canvas in container, init inspector |

### Next
→ Session 8 (food & energy)

---

## Session 8 — Food & Energy Mechanic (2026-03-02)

### Motivation
Core loop was hide-flee-hide with nothing pulling the player *out* of safety. Added food/energy to create foraging pressure — you must leave hiding spots to eat, and sprinting burns energy fast.

### Design
- **Energy**: 0–100, starts at 100
  - Idle drain: 1/s (100s to empty standing still)
  - Moving drain: 2/s (50s)
  - Sprint drain: 5/s (20s)
  - At 0: sprint disabled, base speed drops to 60% (3.6 — barely outpaces patrol sharks at 3.5)
  - Resets to 100 on catch/respawn
- **Morsels**: 25 glowing gold-green orbs on OPEN/KELP tiles
  - Collect within 1.0 world unit, restores +20 energy (capped at 100)
  - Respawn at random valid tile after 10 seconds
  - Visual: sphere (0.12 radius) + halo + PointLight, bob + pulse animation
- **HUD**: HTML overlay, energy bar at bottom-center of canvas
  - TimeToPlay-Flat font for "ENERGY" label
  - Bar color shifts cyan → yellow → red as energy drops
  - Label glow color matches bar

### Built
- **`src/food.ts`** (NEW): `Morsel` type, `spawnMorsels()`, `updateMorsels()` (animation, collection, respawn)
- **`src/squid.ts`**: module-level energy state with `getEnergy()`, `addEnergy()`, `resetEnergy()`. Drain computed per-frame based on idle/move/sprint. Sprint blocked at 0. Speed formula: `MOVE_SPEED * (energy > 0 ? 1 : 0.6) * (sprinting ? SPRINT_MULT : 1)`
- **`index.html`**: `@font-face` for TimeToPlay-Flat (woff2), HUD overlay markup + CSS
- **`src/main.ts`**: food RNG (seed 31337), morsel spawning, collection in game loop, HUD bar update (width + color gradient), energy reset on catch, morsels + energy functions on `__glint` debug

### Key Decisions
- Energy is module-level state in squid.ts, not on the Squid interface (keeps interface visual-only)
- Depleted speed (3.6) barely outpaces patrolling sharks (3.5) and can't escape pursuing ones (5.5) — creates real tension
- Morsels use their own seeded RNG (31337) separate from map/shark RNGs
- HUD is HTML overlay (not Three.js) — lets us use the custom font cleanly

### File Summary
| File | Action |
|------|--------|
| `index.html` | MODIFIED — font-face, HUD markup/CSS, game-container position:relative |
| `src/food.ts` | NEW — morsel system (spawn, animate, collect, respawn) |
| `src/squid.ts` | MODIFIED — energy state, drain rates, speed modulation |
| `src/main.ts` | MODIFIED — food imports, morsel spawning, HUD update, energy reset on catch |

### Known Issues
- **Crevices are invisible**: `placeCreviceDetail()` in reef.ts only places a 50% chance tiny dark rock at y=-0.5. The mechanic works (squid fits through, sharks blocked) but there's zero visual distinction from open tiles. Player has no way to know where crevices are. Needs distinct visual treatment — narrow gap between rocks, glowing crack lines, or at minimum a different floor color.

## Session 9 — Random Respawn, Atmospheric Energy, Creep Concealment (2026-03-02)

### What Changed

**Random Den Respawn** (main.ts)
- On catch, `pickRespawnDen(rng)` selects a random den >15 tiles from all sharks
- Fallback: farthest den from nearest shark (when all dens are close to predators)
- Empty dens list falls back to `map.playerSpawn`
- Eliminates spawn camping — sharks scatter during invulnerability, player appears at a fresh location

**Atmospheric Energy Visual** (squid.ts, index.html)
- Removed HTML HUD entirely (#hud, #energy-bar, #energy-fill, #hud-label + CSS)
- Energy now modulates the squid's own bioluminescence:
  - Glow intensity: 2.5 (full) → 0.4 (depleted)
  - Glow range: 12 → 4
  - Mantle color: 0x44ccff → 0x1a3344 (dull teal)
  - Body color: 0x33bbee → 0x152a33
  - Eye emissive: 1.0 → 0.15
  - Tentacle sway: full → halved
  - Pulse amplitude: 0.2 → 0.05
- Concealment still overrides when hiding (dimmer than depleted)
- `_glowBase` tracked separately from displayed intensity — prevents pulse oscillation feeding back into the lerp and causing slow convergence or negative values
- `Squid.eyes[]` added to interface for eye emissive modulation (each eye gets its own material clone)

**Creep Concealment** (squid.ts)
- `_smoothedSpeed`: exponential smoothing of actual speed (from position delta, not input magnitude)
- `CREEP_THRESHOLD = 1.8` (~30% of base speed 6), `SMOOTH_RATE = 3`
- Concealment: `onHidingTile && _smoothedSpeed < CREEP_THRESHOLD`
- Enter kelp at speed → not concealed. Slow down → ~0.13s to cross threshold → concealment
- Emergent: wall-sliding in crevices keeps actual speed low, so crevice movement stays concealed

### Bugs Found & Fixed
- **Glow pulse feedback**: original code lerped `squid.glow.intensity` which included the previous frame's `sin(t)*pulseAmp`. This fed oscillation noise back into the lerp base, causing slow convergence and negative values. Fixed with separate `_glowBase` tracker.
- **Glow clamp**: `Math.max(0, ...)` on final intensity prevents negative values from pulse trough at low energy

### File Summary
| File | Action |
|------|--------|
| `index.html` | MODIFIED — removed HUD HTML/CSS |
| `src/squid.ts` | MODIFIED — energy visuals, creep concealment, eyes array |
| `src/main.ts` | MODIFIED — random respawn, removed HUD update code |

### Next
→ Session 10 (inspector deep-link + balance tuning)

---

## Session 10 — Inspector Deep-Link + Balance Tuning (2026-03-02)

### What Changed

**Inspector Deep-Link** (inspector.ts, index.html)
- Shark cards in overview now clickable → drills into detail view showing all 4 soma sections (identity, on_tick, memory, hunt_journal)
- Each section has evolved/default badge and proper formatting (green code block for on_tick, scrollable content areas)
- AI briefings now contain clickable `[[section]]` links (green, dotted underline) that jump directly to the referenced section in the detail view
- Clicking a deep-link: drills into shark → scrolls to section → 1.5s green highlight flash animation
- ← BACK button returns to overview with fresh scan
- Overview cards show "N evolved" badge (count of sections differing from defaults)
- Haiku system prompt instructs `[[on_tick]]`, `[[memory]]`, `[[identity]]`, `[[hunt_journal]]` markers; `linkifySections()` post-processes into clickable spans
- Event delegation handles both deep-links (soma-link spans) and card clicks (data-shark-id)

**Forgiving Concealment** (squid.ts)
- `CREEP_THRESHOLD` 1.8 → 3.5 (~58% of base speed) — can move at half speed and stay hidden in kelp/crevices/dens
- **Grace period**: 0.3s instant concealment when first entering any hiding tile. Diving into kelp at full sprint hides you immediately while you slow down.
- `_hideGraceTimer` resets on each hiding tile entry (tracked via `_wasOnHidingTile`). Ticks down per frame.
- Concealment formula: `onHidingTile && (_hideGraceTimer > 0 || _smoothedSpeed < CREEP_THRESHOLD)`

**Shark Sensor Range Halved** (shark.ts)
- `sensorRange` 16 → 8 world units (4 tiles instead of 8)
- Sharks were detecting from off-screen. Now you usually see the shark before it sees you.
- Chase speed (5.5) still outpaces base squid (6 at full energy, 3.6 depleted), so once spotted the threat is real — but you get fair warning.

### Playtesting Notes
- All 3 sharks independently evolved from blind chase-and-patrol into spatially-aware ambush hunters
- shark-0: systematic hide-checker, searches kelp/dens/crevices after prey loss, 10s search window, tracks hunt/kill counts
- shark-1: predictive ambush, camps at (1.0, 1.0) prey hotspot, treats quick prey-loss as confirmation of hiding
- shark-2: multi-stage search state machine, visits up to 6 hiding spots in distance order
- 7+ hunts, 0 kills across all sharks — concealment is effective, but reduced sensor range may shift the balance further

**Idle Patrol Journaling** (soma.ts)
- Default on_tick now writes patrol status every ~30s when no prey detected
- Entry format: `[t=60s] Patrolling at (12.3, -5.1), no prey sighted. 2 kelp nearby.`
- `lastlog` timestamp tracked in memory (parsed/written alongside pursuing/lost/lastknown)
- Ensures reflection has material even for sharks that never encounter prey
- Especially important after halving sensor range — sharks may patrol for minutes without detection
- Nearby kelp count included so reflection can assess patrol quality (near cover = smart, open water = wasteful)

### File Summary
| File | Action |
|------|--------|
| `index.html` | MODIFIED — detail view CSS, soma-link/highlight styles |
| `src/inspector.ts` | MODIFIED — detail view, deep-link click handling, linkifySections, briefing prompt |
| `src/squid.ts` | MODIFIED — creep threshold, grace period |
| `src/shark.ts` | MODIFIED — sensorRange 16→8 |
| `src/soma.ts` | MODIFIED — idle journal entries, lastlog tracking, default memory update |

### Design Discussion: Glow-Based Detection

Agreed to replace binary concealment with **glow-proportional detection range**:
- `effectiveRange = sensorRange × (_glowBase / FULL_GLOW_INTENSITY)`
- Full energy (glow 2.5): full 8-unit range
- Half energy (glow ~1.45): ~4.6 range
- Depleted (glow 0.4): ~1.3 range — nearly invisible
- Concealed in kelp (glow 0.3): ~0.96 range — effectively invisible
- **The visual IS the mechanic** — what you see is what the sharks see
- Removes binary `squid.concealed` check in `readSensors()`, replaces with continuous glow-scaled range
- Need to expose `_glowBase` from squid.ts (or add `getVisibility()` function)
- Grace period + creep threshold still control glow (which controls detection), so those mechanics compose naturally
- Energy management becomes core strategy: bright = visible from far, dim = stealthy

### Next
1. **Glow-based detection** — replace binary concealment with glow-proportional sensor range (designed above)
2. **Crevice visuals** — make crevices visually distinct (currently invisible)
3. **Ink cloud** — escape ability (Space/A), brief LOS-blocking smoke screen
4. **Visual feedback on catch** — screen flash, freeze frame
5. **Predator variety** — eel (fast, fits crevices) or anglerfish (slow, lure)
6. **Sound design** — ambient ocean, heartbeat chase, relief sigh hiding

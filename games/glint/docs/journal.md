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
- State: `getState()`, `setState()`, `getLastKnown()`, `setLastKnown()`, `getTimeSinceLost()`, `getPosition()`
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

### Next
1. **Ink cloud** — escape ability (Space/A button), brief smoke screen that blocks LOS for a few seconds
2. **Visual feedback on catch** — screen flash, maybe a brief freeze frame
3. **HUD** — minimal: lives or health, maybe a danger indicator when sharks are near
4. **Predator variety** — eel (fast, fits crevices, short attention) or anglerfish (slow, lure, wide detection)
5. **Sound design** — ambient ocean, heartbeat when chased, relief sigh when hidden
6. **Inspector panel** — like hot-pursuit's soma inspector, show predator instinct code and memory live

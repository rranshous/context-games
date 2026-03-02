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
1. **Alcove carving in map gen** — the critical blocker. No hiding spots = no game.
2. **Relax crevice detection** — more tiles qualify as crevices
3. **Concealment state** — squid dims/recolors when in hiding tile
4. **Den visuals** — scale up the current arch + anemone (currently tiny, never seen one in-game since none generate)
5. **First predator** — after hiding works, add a shark patrol to test the loop

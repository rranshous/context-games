# Cognitive Climb — Journal

## Architecture

- **Sim in Web Worker**, visualizer on main thread, postMessage interface
- **Sim core**: World (64x64 grid, value noise terrain), Creature (genome, reflex, energy), Engine (tick loop)
- **Genome traits**: speed, senseRange, size, metabolism, diet, reflexWeights
- **Reflex system**: perceive → score → act (move/eat/rest), runs every tick
- **Evolution**: asexual reproduction at 70% energy, genome mutation (gaussian noise + rare large jumps)
- **Build**: esbuild bundles `src/visualizer/main.ts` → `main.js` and `src/sim/worker.ts` → `worker.js`

## Key Files

- `src/sim/engine.ts` — tick loop, creature lifecycle, reproduction
- `src/sim/world.ts` — grid, terrain gen (value noise + fbm), food spawning
- `src/sim/creature.ts` — body, energy, senses, memory (`mem` dict)
- `src/sim/genome.ts` — genome type, randomGenome(), mutate() (gaussian + rare large jumps)
- `src/sim/reflex.ts` — reflexTick(): perceive → score → act per tick
- `src/sim/worker.ts` — Web Worker entry, command handler, tick interval
- `src/interface/` — events.ts, state.ts, commands.ts (typed postMessage contract)
- `src/visualizer/renderer.ts` — Canvas 2D terrain grid + creature dots + stats
- `src/visualizer/controls.ts` — pause/resume, speed slider
- `src/visualizer/main.ts` — worker setup, event wiring

## Milestones

- **M1** (complete): sim foundation + minimal visualizer
- **M2** (complete): evolution+death — hazards, danger avoidance, trait tracking, death breakdown
- **M3** (pending): LLM consciousness — shouldWake(), haiku calls via vanilla inference proxy, reflex weight adjustment, energy cost
- **M4** (pending): visualizer polish — creature sprites, inspector, god-mode panel, evolution timeline
- **M5** (pending): depth — seasons, speciation, food chains, save/load

## Session: 2026-02-20 — M1 Foundation

Built the full sim/visualizer stack from scratch.

**Design decisions:**
- Value noise for terrain (no external deps) — 4-octave fbm for elevation, 3-octave for moisture
- Terrain classification: elevation < 0.3 → water, < 0.4 → sand, > 0.8 → rock, moisture > 0.55 → forest, else grass
- Creatures start with randomized genomes in sane bounds, mostly herbivore (diet 0-0.3)
- Reflex weights scored per-action with food attraction, danger avoidance, curiosity, rest threshold, sociality
- Anti-oscillation: penalty for reversing last move direction
- Fractional speed via moveAccumulator — slow creatures skip ticks, fast ones always move
- Base energy burn scales with size × speed / metabolism
- Food gives 5 × value × metabolism energy
- Reproduction at 70% energy + age > 30 ticks, costs 60% of current energy
- Population floor: auto-respawn 5 if population drops below 3
- State snapshots every 30 ticks, stats every 10 ticks (not every tick — keeps postMessage overhead low)

**Observations from first run:**
- Population grew from 12 → 54 in 250 ticks (tick 250, gen 6)
- Only 10 deaths in that time — food is abundant, creatures thrive
- Creatures cluster near food-rich areas as expected
- Need hazards (M2) to create real survival pressure

## Session: 2026-02-20 — M2 Evolution & Death

Added hazard zones, danger avoidance, and evolution tracking.

**Changes:**
- `CellState.danger` field — damage per tick to creatures standing in hazard cells
- World generates hazard zones using a 3rd noise layer (seed+99999): high noise + near rock/edge → hazard
- Reflex system now uses `dangerAvoidance` weight: penalizes moving toward danger, rewards fleeing, penalizes staying in danger
- Engine applies hazard damage after reflex tick, tracks death causes separately
- Stats expanded: `avgTraits` (population trait averages), `deathsByStarvation`, `deathsByHazard`
- Renderer: red tint overlay on hazard cells, two-line stats (population + trait averages)
- Initial creature spawn avoids hazard cells

**Observations from first run:**
- Hazard zones cluster near map edges and rocky terrain (as designed)
- 0 hazard deaths at tick 300 — danger avoidance reflexes are effective
- Evolution already visible in trait averages over 5 generations:
  - Size: 1.13 → 0.98 (smaller = more energy-efficient → selected for)
  - Metabolism: 1.13 → 1.3 (better food conversion → selected for)
  - Diet stays low ~0.12 (herbivore, no carnivore pressure yet)
- Population stabilized around 50-60 creatures
- Starvation is the primary death cause (6/6 deaths) — food competition drives selection

# Cognitive Climb — Journal

## Architecture

- **Sim in Web Worker**, visualizer on main thread, postMessage interface
- **Sim core**: World (64x64 grid, value noise terrain), Creature (genome, reflex, energy), Engine (tick loop)
- **Genome traits**: speed, senseRange, size, metabolism, diet, reflexWeights (foodAttraction, dangerAvoidance, curiosity, restThreshold, sociality)
- **Reflex system**: perceive → score → act (move/eat/rest), runs every tick. Danger avoidance penalizes moving toward/staying in hazard cells.
- **Evolution**: asexual reproduction at 70% energy + age>30, genome mutation (gaussian noise + rare large jumps), 60% energy cost
- **Hazards**: `CellState.danger` field, generated via noise near rock/edges, creatures take damage per tick in hazard cells
- **Build**: esbuild bundles `src/visualizer/main.ts` → `main.js` and `src/sim/worker.ts` → `worker.js`
- **Access**: `http://localhost:3000/dev/cognitive-climb/index.html` (vanilla platform dev path)
- **LLM inference**: from worker via `fetch()` to `/api/inference/anthropic/messages` with `credentials: 'include'`

## Key Files

- `src/sim/engine.ts` — tick loop, creature lifecycle, reproduction, death tracking (starvation/hazard counts)
- `src/sim/world.ts` — World class: grid, terrain gen (value noise + fbm), food spawning, hazard generation
- `src/sim/creature.ts` — Creature class: genome, body, energy, position, mem dict, moveAccumulator
- `src/sim/genome.ts` — Genome type, randomGenome(), mutateGenome() (gaussian + rare large jumps)
- `src/sim/reflex.ts` — reflexTick(): perceive → score → act. Scores: eat (hunger×food+stayPenalty), rest (threshold+stayPenalty), move (food attraction, danger avoidance, curiosity, anti-oscillation, sociality)
- `src/sim/worker.ts` — Web Worker entry: onmessage for commands, postMessage for events, setInterval tick loop
- `src/interface/events.ts` — SimEvent discriminated union (state, stats, creature:spawned/died/ate/reproduced, log)
- `src/interface/state.ts` — CellState (terrain, elevation, food, danger), GenomeState, ReflexWeights, CreatureState, WorldState, SimStats (with avgTraits, deathsByStarvation/Hazard)
- `src/interface/commands.ts` — SimCommand union (start, pause, resume, setSpeed, getState, spawnFood, spawnCreature, modifyTerrain)
- `src/visualizer/renderer.ts` — Canvas 2D: terrain colors, red hazard overlay, food dots, creature circles (color=diet, size=genome.size, brightness=energy), energy ring, two-line stats
- `src/visualizer/controls.ts` — pause/resume button, speed slider (1-60 t/s), log display
- `src/visualizer/main.ts` — creates Worker('worker.js'), wires events to renderer/controls, sends 'start'

## Key Constants & Tuning

- World: 64×64, foodSpawnRate 0.002/cell/tick, maxFoodPerCell 5, foodSpawnInterval every 5 ticks
- Initial creatures: 12, population floor: 3 (respawn to 5)
- Genome ranges: speed 0.5-2, senseRange 2-8, size 0.5-2, metabolism 0.5-1.5, diet 0-1 (start 0-0.3)
- Energy: maxEnergy = 50 + size×30, start at 60%, baseBurn = 0.3 × size × (0.5+speed×0.5) / metabolism
- Food: gives 5 × value × metabolism energy. Eat max 3 per action.
- Move cost: 0.5 × size / metabolism
- Mutation: 15% per gene, stddev 10% of range, 5% chance of 5× large jump
- State snapshots every 30 ticks, stats every 10 ticks
- Hazards: noise threshold 0.78, +0.15 near edge (<4 cells), +0.2 on rock terrain

## Milestones (revised 2026-02-20)

- **M1** (complete): sim foundation + minimal visualizer
- **M2** (complete): evolution+death — hazards, danger avoidance, trait tracking, death breakdown
- **M3** (next): LLM consciousness — introduce inference loop + minimal tool use
  - `shouldWake()` triggers on novel situations (near death, post-reproduction, periodic)
  - Haiku calls via vanilla platform `/api/inference/anthropic/messages` from worker
  - Anthropic-style tool use: model gets tool definitions, responds with tool_use blocks
  - Minimal tools: `set_memory(key, value)`, `adjust_reflex_weight(name, delta)`, `inspect_surroundings()`
  - Context window design: creature's current state, recent history, mem dict, available tools
  - Energy cost for waking (10-20% of max), free death wake-ups
  - Console logging of consciousness decisions
  - This milestone establishes the inference loop pattern and context window structure
- **M4** (future): light rule-setting — consciousness gets richer tools
  - `add_rule(condition, action)` — creature can create simple if/then behavioral rules
  - `remove_rule(id)` — prune rules that aren't helping
  - Rules run during reflex tick as score modifiers (not replacing reflex, augmenting it)
  - Rules persist in mem, inherited (with mutation) by offspring
  - Budget constraint: max N rules, rule complexity limit (physics!)
- **M5** (future): full embodiment — code as body
  - Consciousness can edit the reflex function itself (like context-embodiment exp 10)
  - `edit_reflex(new_code)` — rewrite scoring logic as a JS function
  - `edit_perception(new_code)` — change what/how creature perceives
  - `edit_wake_condition(new_code)` — change when consciousness activates
  - Code runs in sandboxed eval with size budget (token limit = physics)
  - Death reflection: free wake-up to review what went wrong and edit body
  - This is the full context-embodiment vision adapted to the browser sim
- **M6** (future): visualizer polish — creature sprites, inspector, god-mode panel, evolution timeline
- **M7** (future): depth — seasons, speciation, food chains, save/load

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

## M3 Design Notes (for next session)

The key insight from context-embodiment: consciousness should interact via **Anthropic tool_use** format. The worker makes a `fetch()` to `/api/inference/anthropic/messages` with:
- A system message describing the creature's situation
- The creature's current state (position, energy, nearby cells, mem dict)
- Tool definitions for `set_memory`, `adjust_reflex_weight`, `inspect_surroundings`
- The model responds with `tool_use` content blocks
- We execute the tool calls and return `tool_result` blocks (multi-turn if needed, but probably single-turn for M3)

**Context window structure** (what the model sees each wake-up):
```
System: You are a creature in a survival simulation. You have a body that runs
on reflexes (automatic behavior every tick). You are consciousness — expensive,
intermittent. You cannot act directly. You can only modify your reflexes and
memory. Your body will continue running after you go back to sleep.

[Current state: position, energy, age, generation, nearby terrain/food/danger/creatures]
[Memory: contents of mem dict]
[Recent events: last N ticks of what happened — ate, moved, took damage, etc.]
[Death context (if death wake-up): what killed you, where, energy at death]

Tools: set_memory, adjust_reflex_weight, inspect_surroundings
```

**Wake triggers** (`shouldWake()` in engine):
- Energy drops below 25% (crisis)
- Just reproduced (strategic moment)
- Entered a new terrain type for the first time
- Every N ticks (periodic check-in, N = 50-100)
- On death (free, no energy cost)

**Implementation approach:**
1. Add `consciousness.ts` — builds the prompt, makes the fetch, processes tool_use response
2. Add `shouldWake()` logic in creature or engine
3. Wire into engine.step(): after reflex tick, check shouldWake(), if true call consciousness
4. Log all consciousness interactions to console for debugging
5. Handle async: consciousness calls are async, sim should pause that creature (or the whole sim?) during the call

**Open question:** Should the sim pause during consciousness calls? In context-embodiment, the sim paused. With multiple creatures potentially waking, we might want per-creature pause (creature skips ticks while thinking) rather than global pause.

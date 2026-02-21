# Cognitive Climb — Journal

## Architecture

- **Sim in Web Worker**, visualizer on main thread, postMessage interface
- **Sim core**: World (64x64 grid, value noise terrain), Creature (genome, reflex, energy), Engine (tick loop)
- **Genome traits**: speed, senseRange, size, metabolism, diet, wakeInterval, reflexWeights (foodAttraction, dangerAvoidance, curiosity, restThreshold, sociality)
- **Reflex system**: perceive → score → act (move/eat/rest), runs every tick. Danger avoidance penalizes moving toward/staying in hazard cells.
- **Evolution**: asexual reproduction at 70% energy + age>30, genome mutation (gaussian noise + rare large jumps), 60% energy cost
- **Hazards**: `CellState.danger` field, generated via noise near rock/edges, creatures take damage per tick in hazard cells
- **Build**: esbuild bundles `src/visualizer/main.ts` → `main.js` and `src/sim/worker.ts` → `worker.js`
- **Access**: `http://localhost:3000/dev/cognitive-climb/index.html` (vanilla platform dev path)
- **LLM inference**: from worker via `fetch()` to `/api/inference/anthropic/messages` with `credentials: 'include'`

## Key Files

- `src/sim/consciousness.ts` — ConsciousnessManager: wake triggers, message building, API calls, tool execution, queue, pause/resume
- `src/sim/engine.ts` — tick loop, creature lifecycle, reproduction, death tracking, consciousness integration (checkWake)
- `src/sim/world.ts` — World class: grid, terrain gen (value noise + fbm), food spawning, hazard generation
- `src/sim/creature.ts` — Creature class: genome, body, energy, position, mem dict, moveAccumulator, consciousness fields (thinking, lastWakeTick, terrainsSeen, recentEvents, justReproduced)
- `src/sim/genome.ts` — Genome type + wakeInterval, randomGenome(), mutateGenome() (gaussian + rare large jumps)
- `src/sim/reflex.ts` — reflexTick(): perceive → score → act. Exported perceive() + PerceivedCell for consciousness reuse. Scores: eat (hunger×food+stayPenalty), rest (threshold+stayPenalty), move (food attraction, danger avoidance, curiosity, anti-oscillation, sociality)
- `src/sim/worker.ts` — Web Worker entry: onmessage for commands, postMessage for events, setInterval tick loop, passes pause/resume callbacks to Engine
- `src/interface/events.ts` — SimEvent discriminated union (state, stats, creature:spawned/died/ate/reproduced/woke, log)
- `src/interface/state.ts` — CellState (terrain, elevation, food, danger), GenomeState (incl. wakeInterval), ReflexWeights, CreatureState (incl. thinking), WorldState, SimStats
- `src/interface/commands.ts` — SimCommand union (start, pause, resume, setSpeed, getState, spawnFood, spawnCreature, modifyTerrain, toggleConsciousness)
- `src/visualizer/renderer.ts` — Canvas 2D: terrain colors, red hazard overlay, food dots, creature circles (color=diet, size=genome.size, brightness=energy), energy ring, blue thinking glow, two-line stats
- `src/visualizer/controls.ts` — pause/resume button, speed slider (1-60 t/s), Brain ON/OFF toggle, log display
- `src/visualizer/main.ts` — creates Worker('worker.js'), wires events to renderer/controls, handles creature:woke logging, sends 'start'

## Key Constants & Tuning

- World: 64×64, foodSpawnRate 0.002/cell/tick, maxFoodPerCell 5, foodSpawnInterval every 5 ticks
- Initial creatures: 12, population floor: 3 (respawn to 5)
- Genome ranges: speed 0.5-2, senseRange 2-8, size 0.5-2, metabolism 0.5-1.5, diet 0-1 (start 0-0.3), wakeInterval 30-200
- Energy: maxEnergy = 50 + size×30, start at 60%, baseBurn = 0.3 × size × (0.5+speed×0.5) / metabolism
- Food: gives 5 × value × metabolism energy. Eat max 3 per action.
- Move cost: 0.5 × size / metabolism
- Mutation: 15% per gene, stddev 10% of range, 5% chance of 5× large jump
- State snapshots every 30 ticks, stats every 10 ticks
- Hazards: noise threshold 0.78, +0.15 near edge (<4 cells), +0.2 on rock terrain
- Consciousness: 15% maxEnergy per wake, max queue 10, crisis threshold 25% energy (20-tick cooldown), model claude-haiku-4-5-20251001, max_tokens 512

## Milestones (revised 2026-02-20)

- **M1** (complete): sim foundation + minimal visualizer
- **M2** (complete): evolution+death — hazards, danger avoidance, trait tracking, death breakdown
- **M3** (complete): LLM consciousness — inference loop, tool use, sim pause, genome-controlled wake interval
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

## Session: 2026-02-20 — M3 LLM Consciousness

Added consciousness system: creatures wake up intermittently and make haiku calls via the vanilla platform inference proxy.

**Architecture:**
- New file `src/sim/consciousness.ts` — ConsciousnessManager class: queue, pause/resume, API calls, tool execution
- Sim pauses globally during consciousness calls (clearInterval/setInterval). One creature thinks at a time; others queue.
- `wakeInterval` genome trait (30-200 ticks) controls periodic wake frequency — evolvable tradeoff
- Energy cost: 15% of maxEnergy per wake-up (free on death)
- Single-turn tool use: model gets one shot to produce text + tool_use blocks

**Wake triggers** (checked in engine after reflex tick):
- Crisis: energy < 25% (20-tick cooldown)
- Reproduced: one-tick flag after reproduction
- New terrain: first time entering a terrain type (tracked via creature.terrainsSeen Set)
- Periodic: genome.wakeInterval ticks since last wake
- Death: free wake-up for final reflection

**Tools:**
- `set_memory(key, value)` — write to creature.mem (max 20 entries, 200 chars each, protects internal lastDx/lastDy)
- `adjust_reflex_weight(name, delta)` — modify reflexWeights live, clamped 0-2
- `inspect_surroundings()` — detailed perception data (single-turn so result only logged; groundwork for M4 multi-turn)

**Context window:** system prompt + user message with: wake reason, creature state (position/energy/age/generation), current reflex weights, nearby summary (terrain/food/danger/creatures), memory dict, recent events buffer (15 max), death context if dying.

**Visualizer:** blue pulsing glow on thinking creatures, Brain ON/OFF toggle, console logging with [CONSCIOUSNESS] tag.

**Design decisions:**
- Global sim pause (not per-creature) — ensures consciousness decisions are always relevant, avoids stale context at high sim speeds
- Message snapshot at wake time — queued calls see the state that triggered them, not the state when they fire
- Queue max 10, oldest dropped if full
- Stagger periodic wakes via `lastWakeTick = -(id % wakeInterval)` so creatures don't all wake simultaneously

**Observations from first run:**
- All 5 wake reasons fire correctly: new_terrain, crisis, reproduced, death, periodic
- Creatures use tools contextually: writing terrain notes to memory, adjusting reflexes during crises
- Death reflections work: "I died from starvation..." with memory writes for future generations
- Heavy consciousness usage early on (many new_terrain triggers), settles down as creatures explore
- Sim at tick 30 is only ~15 seconds real time due to consciousness pauses — expected, not a problem
- Creature #4 wrote `set_memory("reproduction_strategy", ...)` after reproducing — emergent strategic behavior

**Known limitations (M3):**
- `inspect_surroundings` is useless in single-turn (result not sent back to model). Kept for M4 multi-turn.
- No memory inheritance yet — offspring start with empty mem dict
- Consciousness can be expensive at scale (50+ creatures all waking creates queue pressure)
- No visual indicator of what the creature decided (just log text)

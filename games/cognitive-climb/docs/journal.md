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
- `src/sim/rules.ts` — Rule type, RuleContext, evaluateCondition(), computeRuleModifiers(), mutateRules(), validateRule(), formatRule(). 9 conditions × 6 effects, max 5 rules/creature
- `src/sim/reflex.ts` — reflexTick(): perceive → score → applyRuleModifiers → act. Exported perceive() + PerceivedCell + ActionScore. Rule modifiers applied after base scoring, before sort
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
- **M4** (complete): light rule-setting — consciousness gets richer tools
  - `add_rule(condition, effect)` and `remove_rule(id)` consciousness tools
  - 9 condition types × 6 effect targets, modifier range -2 to +2
  - Rules run during reflex tick as score modifiers (augmenting, not replacing)
  - Rules stored in `creature.rules[]` (separate from mem), max 5 per creature
  - Inherited by offspring with mutation: 10% drop, 15% threshold/modifier noise, 5% spontaneous gain
  - Directional effects: flee_danger/seek_food/seek_company are per-direction, not flat
  - New file: `src/sim/rules.ts` — types, evaluation, mutation, validation, formatting
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

## Session: 2026-02-21 — M4 Light Rule-Setting

Added behavioral rule system: creatures create if/then rules via consciousness that modify reflex scores every tick.

**Architecture:**
- New file `src/sim/rules.ts` — all rule logic, zero coupling to Creature/World
- Rules stored in `creature.rules[]` (separate from mem) — need structured evaluation every tick
- 9 condition types: energy_below/above, danger_nearby/here, food_nearby/here, creatures_nearby_above/below, on_terrain
- 6 effect targets: eat, rest, flee_danger, seek_food, explore, seek_company
- Modifier range: -2 to +2 (additive to reflex scores)
- Budget: max 5 rules per creature (physics constraint)

**Reflex integration:**
- Rule modifiers applied after all base scores computed, before sort
- Hoisted dangerCells/foodCells/nearbyCreatures outside per-direction loop (perf + reuse)
- Directional effects: flee_danger penalizes moves toward danger, rewards leaving; seek_food boosts moves toward food cells; seek_company boosts moves toward creatures
- Flat effects: eat/rest get direct bonus, explore adds to all move scores

**Consciousness changes:**
- 2 new tools: `add_rule(condition, effect)` and `remove_rule(rule_id)`
- Updated system prompt highlights rules as "most powerful tool"
- Context message shows current rules section with IDs and human-readable format
- Robust validation handles haiku formatting mistakes (fallback for flat structures, action/target aliases)

**Inheritance:**
- Rules copied from parent to child during reproduction
- Mutation: 10% drop per rule, 15% threshold/modifier gaussian noise, 5% spontaneous random rule gain
- Separate from genome mutation — rules are Lamarckian (learned, not genetic)

**Design decisions:**
- Rules in `creature.rules[]` not `creature.mem` — need structured eval every tick, distinct mutation
- Effects are score modifiers, not action overrides — preserves reflex as foundation, rules tune it
- Closed-set conditions (enum, not arbitrary predicates) — keeps evaluation cheap, prevents nonsense
- No energy cost for rule evaluation — rules are "body physics" like reflexes, cost was paid when consciousness created them

**Observations from first run:**
- Creatures create 3-4 rules on their first wake-up — immediate strategic behavior
- Common patterns: `energy_below(0.3) → rest +1.5`, `danger_nearby → flee_danger +1.5`, `food_nearby → seek_food +0.8`, `energy_above(0.75) → explore +0.6`
- Haiku occasionally formats tool input wrong (undefined target) — robust validation catches and reports error
- After validation fix, all subsequent add_rule calls succeed
- Creature #2 added `energy_below(0.65) → eat +0.5` — interesting emergent threshold choice

**Known limitations (M4):**
- `inspect_surroundings` still single-turn (useless) — multi-turn consciousness is future work
- No visual indicator of how many rules a creature has
- No `remove_rule` usage observed yet — creatures don't prune rules (may need more generations)
- Memory still not inherited — only rules and genome pass to offspring
- Rule inheritance is Lamarckian but conditions/effects are fixed vocabulary — M5 will open this to code


## Session: 2026-02-21 — M5 Creature Inspector & Story Timeline

Swapped M5/M6 order: visualizer polish before full embodiment, so we have debugging tools for the complex code-as-body milestone.

**New files:**
- `src/visualizer/history.ts` — CreatureHistoryStore: accumulates per-creature timeline from worker events
- `src/visualizer/inspector.ts` — Inspector panel: right sidebar showing creature story

**Changes:**
- `src/interface/state.ts` — CreatureState expanded: `mem`, `recentEvents`, `ticksSinceAte`, `rules` always included (was optional)
- `src/interface/events.ts` — All creature events now carry `tick` field (was only on `creature:died`)
- `src/sim/creature.ts` — `toState()` includes mem (filtered lastDx/lastDy), recentEvents, ticksSinceAte, rules always
- `src/sim/engine.ts` — All emit calls include `tick: this.tick`
- `src/sim/consciousness.ts` — `creature:woke` event includes `tick: req.tick`
- `src/visualizer/renderer.ts` — Click-to-select (handleClick, selectCreature), yellow pulsing selection ring, `onSelectCreature` callback
- `src/visualizer/main.ts` — Wires history store + inspector + renderer selection, `window.__debug` API for testing
- `src/index.html` — Flex layout (#main-area), inspector panel container, full CSS for inspector/timeline

**Inspector panel features:**
- Header: creature ID, generation, age, parent (clickable link)
- Energy bar: color-coded (green/orange/red), percentage
- Genome: 6 traits with proportional bars and values
- Reflexes: 5 weights with purple bars (0-2 range)
- Rules: IF/THEN formatted with color-coded keywords
- Memory: key-value pairs
- Timeline: chronological story (newest first), color-coded by type:
  - Blue "Brain" entries: full thoughts + tool actions
  - Green "Ate" entries
  - Gold "Reproduced" entries with clickable child ID
  - Red "Died" entries
  - Born entries with clickable parent ID

**Design decisions:**
- Inspector is pure DOM (not canvas) — scrollable, selectable text, clickable links
- History store lives on main thread, accumulates from worker events — no new worker commands needed
- Dead creature histories retained (story doesn't end at death)
- Max 200 timeline entries per creature to bound memory
- Canvas resizes dynamically when inspector opens/closes
- `window.__debug` exposes creatures, history, select(), renderer for console debugging

**Observations:**
- Creatures establish 3-4 rules on first wake-up, then refine on crisis/periodic wakes
- Timeline clearly shows the consciousness decision-making process
- Tool actions in timeline make it easy to trace how rules/memory/reflexes changed and why
- State snapshots every 30 ticks means inspector data can lag slightly between updates

## Session: 2026-02-21 — M6 Design Discussion

Designed the full embodiment system through extended discussion. Key insight: the embodiment IS the inference call — not "tools that edit code" but the entire prompt (identity, sensors, onTick, tools, memory) split into named XML sections that the creature can edit.

**Design doc**: `docs/m6-embodiment.md` — complete specification for bootstrapping a fresh coding session.

**Key decisions:**
- 5 fixed sections: identity (text), sensors (JS), on_tick (JS), memory (JSON), tools (JSON+JS)
- Genome stays as immutable physics (speed, size, metabolism, senseRange, diet, wakeInterval, maxEmbodimentSize) — readable but not editable. The body matters.
- Rules system dropped — onTick replaces rules with arbitrary JS that adjusts reflex weights
- Reflex system stays as sim physics — genome base weights + adjustments from onTick/consciousness
- All functions get `me` and `world` APIs. `me.<section>.read()/.write()/.run()`. `world` is fog-of-war constrained by genome.senseRange
- Edit tools (one per section) live OUTSIDE embodiment — hardcoded by sim, always available
- `<tools>` section defines custom tools (Anthropic schema + JS executor). Starts with one example: `adjust_reflex`
- Memory NOT inherited — creates pressure to encode knowledge in code, not data
- Embodiment cloned wholesale on reproduction (Lamarckian), genome mutates (Darwinian)
- maxEmbodimentSize is a genome trait — intelligence-vs-efficiency tradeoff, evolves through selection
- Embodiment budget scales with age (young creatures = small capacity, maturity = full potential)
- Inherited embodiment exempt from budget — budget constrains growth, not inheritance
- No death wake-up — no lasting effect without memory inheritance
- Single-turn consciousness for M6; multi-turn is M7
- Observability: Playwright for live browser observation, structured debug dumps, rich console logging

## Milestones (revised 2026-02-21)

- **M1** (complete): sim foundation + minimal visualizer
- **M2** (complete): evolution+death — hazards, danger avoidance, trait tracking
- **M3** (complete): LLM consciousness — inference loop, tool use, sim pause
- **M4** (complete): light rule-setting — consciousness gets add_rule/remove_rule
- **M5** (complete): creature inspector — click-to-select, inspector panel, story timeline
- **M6** (next): full embodiment — see `docs/m6-embodiment.md` for complete design
- **M7** (future): multi-turn consciousness — tool results feed back to model
- **M8** (future): visualizer depth — population graphs, evolution timeline, god-mode panel
- **M9** (future): sim depth — seasons, speciation, food chains, save/load
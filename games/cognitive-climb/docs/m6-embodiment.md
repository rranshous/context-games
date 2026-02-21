# M6: Full Embodiment — Design Document

## Philosophy

The embodiment **is** the inference call. Everything sent to the model during a consciousness wake-up — perception processing, behavioral logic, tool definitions, identity text, working memory — constitutes the creature's body. The creature can edit any part of its own embodiment, including the section that defines its tools. There is no distinction between "code" and "prompt" and "data" — it's all sections of the embodiment.

The creature's physical hardware (speed, sense range, size, metabolism) lives in the **genome**, which is immutable and inherited with mutation. The embodiment is the **mind** — learned behavior, self-concept, and custom tools — cloned wholesale to offspring.

Two evolutionary channels operate simultaneously:
- **Darwinian**: genome mutates on reproduction (random, cheap)
- **Lamarckian**: embodiment is cloned from parent (conscious investment, inherited exactly)

## Sections

The embodiment consists of 5 fixed, named sections. Each is a string (JS code, JSON data, or plain text). During consciousness, sections are presented in XML-style tags so the model can see and correlate them.

| Section | Type | Inherited | Purpose |
|---------|------|-----------|---------|
| `identity` | text | yes | Self-narrative, goals, strategy notes |
| `sensors` | JS function | yes | Perception processing — reads world, writes to memory |
| `on_tick` | JS function | yes | Per-tick logic — calls sensors, adjusts reflexes, signals wake |
| `memory` | JSON (key-value) | **no** | Working state for one lifetime. Sensors and onTick write here |
| `tools` | JSON (schemas + JS) | yes | Custom tool definitions the creature creates for itself |

Memory is deliberately **not inherited**. This creates pressure for creatures to encode knowledge into code (onTick, sensors) rather than data. A creature that stores "forest has food" in memory loses that when it dies. A creature that encodes it in onTick passes it to all descendants.

## Genome

The genome encodes **physical traits** — the creature's body hardware. It is readable via `me.genome` but never editable. It mutates on reproduction via the existing gaussian noise system.

| Trait | Range | Purpose |
|-------|-------|---------|
| `speed` | 0.5–2 | Tiles per tick (fractional via moveAccumulator) |
| `senseRange` | 2–8 | Perception radius — constrains fog of war |
| `size` | 0.5–2 | Affects energy capacity, burn rate, rendering |
| `metabolism` | 0.5–1.5 | Energy efficiency multiplier |
| `diet` | 0–1 | 0=herbivore, 1=carnivore |
| `wakeInterval` | 30–200 | Default ticks between periodic wakes |
| `maxEmbodimentSize` | TBD | Maximum total embodiment size in characters |
| `reflexWeights` | (sub-object) | Base instinctual weights for the reflex system |

**Reflex weights** are part of the genome (base instincts). The onTick and consciousness can apply **adjustments** on top of the base weights. Effective weight = genome base + adjustment. This means the same embodiment code in different genome bodies produces different behavior — the body matters.

New trait: `maxEmbodimentSize` controls how large the creature's embodiment can grow. This is a genome trait that evolves through natural selection, creating a genuine **intelligence-vs-efficiency tradeoff**. Large embodiment = complex mind, but potentially at metabolic cost (TBD whether metabolism is affected or it's purely a capacity constraint).

## The `me` API

All functions in the embodiment (sensors, onTick, tool executors) receive `me` as their first argument. It provides access to the creature's embodiment, physical state, and reflex interface.

### Section access
```
me.identity.read()        → string (section content)
me.identity.write(str)    → void (replace section)
me.sensors.read()         → string
me.sensors.write(str)     → void
me.sensors.run()          → void (compile + execute the sensors function)
me.on_tick.read()         → string
me.on_tick.write(str)     → void
me.tools.read()           → string (JSON)
me.tools.write(str)       → void
```

### Memory (convenience methods)
```
me.memory.get(key)        → value
me.memory.set(key, value) → void
me.memory.read()          → object (full memory dict)
me.memory.write(str)      → void (replace entire section, JSON string)
```

### Reflex interface
```
me.reflex.adjust(name, delta)  → void (add to persistent adjustment)
me.reflex.set(name, value)     → void (set adjustment directly)
me.reflex.reset(name?)         → void (clear adjustment; all if no name)
me.reflex.get(name)            → { base, adjustment, effective }
```

### Read-only physical state
```
me.energy         → number (current energy)
me.maxEnergy      → number
me.position       → { x, y }
me.age            → number (ticks alive)
me.genome         → object (read-only genome traits)
me.events         → array (recent sim events since last onTick, read-only)
```

`me.events` is written by the engine before each onTick call. Contains structured events like `{ type: 'reproduced', childId }`, `{ type: 'new_terrain', terrain }`, `{ type: 'ate', value }`, `{ type: 'hazard_damage', amount }`. The default onTick uses these for wake decisions.

### Embodiment budget
```
me.embodimentSize     → number (current total chars across all sections)
me.maxEmbodimentSize  → number (genome.maxEmbodimentSize × ageScalar)
```

Writes that would exceed the budget fail silently or return false (TBD).

## The `world` API

All functions receive `world` as their second argument. It provides a **fog-of-war-constrained** view of the simulation. The creature cannot see beyond its genome's `senseRange` regardless of what code it writes — the data simply isn't provided.

```
world.nearby()         → array of { x, y, terrain, elevation, food, danger, creature? }
                         (cells within me.genome.senseRange, Manhattan distance)
world.currentCell()    → { terrain, elevation, food, danger }
world.tick             → number (current sim tick)
world.bounds           → { width, height }
```

The sim enforces fog of war at the API level. `world.nearby()` only returns cells within the creature's sense range. There is no way to see farther — the genome's `senseRange` is a hard physical limit on the creature's sensory apparatus.

## Execution Model

### Per-tick flow

```
1. Engine writes sim events to creature.events (reproduced, new_terrain, etc.)
2. onTick(me, world) runs
   - Default onTick calls me.sensors.run() first
   - Can adjust reflex weights via me.reflex.*
   - Can read/write memory
   - Returns { wake: true/false, reason?: string }
3. reflexTick() runs (genome-driven, uses base weights + adjustments)
   - perceive → score actions → pick best → execute
4. Engine handles movement, energy burn, hazard damage, death
5. If onTick returned { wake: true } → queue consciousness call
```

The reflex system is **sim-level physics** — hardcoded perceive-score-act driven by genome weights + adjustments. It runs every tick after onTick. The onTick influences reflexes by adjusting weights, but the reflex system makes the final decision about what the body actually does. Mind proposes, body disposes.

### Death

No death wake-up. Memory isn't inherited and the creature can't meaningfully edit its embodiment post-death, so a free consciousness call would produce no lasting effect. Death is logged by the engine for the inspector timeline (cause, age, energy context) — no LLM call needed.

### Consciousness flow (single-turn)

When onTick signals wake (or engine triggers death wake):

1. Sim pauses globally
2. Build inference call:
   - **System prompt**: minimal, hardcoded ("You are consciousness for a creature. Your embodiment is below. Edit sections to improve your survival. Make your wake-up count.")
   - **User message**: full embodiment in XML tags + current state + recent events + wake reason
   - **Tools**: 5 hardcoded edit tools + custom tools from `<tools>` section
3. Single API call (haiku, max_tokens 512)
4. Execute tool calls:
   - Edit tools → overwrite the named section (with budget check)
   - Custom tools → compile + execute the JS function from the tool definition
5. Sim resumes

This is **single-turn**: the model gets one shot to think + call tools. Tool results are not sent back. This works because edits are deterministic (the creature knows what it wrote) and custom tools are fire-and-forget (side effects only). Multi-turn consciousness is a future milestone.

## Consciousness & Tools

### Hardcoded edit tools (always available, outside embodiment)

These are provided by the sim in every consciousness call. The creature cannot remove or modify them. They are the inherent ability of consciousness to reshape the embodiment.

```
edit_identity(content: string)   → replace <identity> section
edit_sensors(content: string)    → replace <sensors> section
edit_on_tick(content: string)    → replace <on_tick> section
edit_memory(content: string)     → replace <memory> section (JSON string)
edit_tools(content: string)      → replace <tools> section (JSON string)
```

Each edit tool checks the embodiment size budget before applying. If the new content would exceed `me.maxEmbodimentSize`, the edit fails and the creature is told why.

### Custom tools (from `<tools>` section)

The `<tools>` section contains an array of tool definitions. Each definition has:
- `name`: tool name
- `description`: what it does (sent to model)
- `input_schema`: Anthropic tool schema (sent to model)
- `execute`: JS code string — executed when the model calls this tool

During consciousness, custom tools appear alongside the hardcoded edit tools. The model sees the tool definitions both in its `<tools>` section (as embodiment data) and as callable tools in the API response. This correlation is key — it teaches the creature how the tools section works and how to create new tools.

When the model calls a custom tool:
1. Look up the tool name in the current `<tools>` section
2. Compile the `execute` string as a JS function: `new Function('me', 'world', 'args', executeCode)`
3. Run it with `me`, `world`, and the tool call arguments
4. Return result string (for logging; not sent back to model in single-turn)

### Starter custom tool: `adjust_reflex`

The `<tools>` section starts with one example tool so creatures can see the pattern:

```json
[
  {
    "name": "adjust_reflex",
    "description": "Adjust a reflex weight that influences your body's instinctive behavior each tick. Weights: foodAttraction, dangerAvoidance, curiosity, restThreshold, sociality. Positive delta increases, negative decreases.",
    "input_schema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "enum": ["foodAttraction", "dangerAvoidance", "curiosity", "restThreshold", "sociality"]
        },
        "delta": {
          "type": "number",
          "description": "Amount to add to current weight adjustment"
        }
      },
      "required": ["name", "delta"]
    },
    "execute": "me.reflex.adjust(args.name, args.delta)"
  }
]
```

## Default Embodiment

New creatures (both initial spawn and offspring of non-embodiment parents during transition) start with a default embodiment that roughly reproduces M4 behavior.

### `<identity>`
```
I am a creature in a survival simulation. I eat food to gain energy, avoid hazard zones that damage me, and reproduce when I have enough energy. My body runs on reflexes between wake-ups. I can modify my own embodiment to improve my survival.
```

### `<sensors>`
```js
function sensors(me, world) {
  var nearby = world.nearby();
  var foodCount = 0, dangerCount = 0, creatureCount = 0, totalFood = 0;
  for (var i = 0; i < nearby.length; i++) {
    var cell = nearby[i];
    if (cell.food > 0) { foodCount++; totalFood += cell.food; }
    if (cell.danger > 0) dangerCount++;
    if (cell.creature) creatureCount++;
  }
  var cur = world.currentCell();
  me.memory.set('nearby_food', foodCount);
  me.memory.set('total_food', totalFood);
  me.memory.set('nearby_danger', dangerCount);
  me.memory.set('nearby_creatures', creatureCount);
  me.memory.set('energy_pct', me.energy / me.maxEnergy);
  me.memory.set('current_terrain', cur.terrain);
  me.memory.set('current_danger', cur.danger);
  me.memory.set('current_food', cur.food);
}
```

### `<on_tick>`
```js
function onTick(me, world) {
  me.sensors.run();
  var energy = me.memory.get('energy_pct');
  var danger = me.memory.get('nearby_danger');

  // Adjust reflexes based on situation
  me.reflex.reset();
  if (energy < 0.35) {
    me.reflex.adjust('foodAttraction', 0.4);
  }
  if (energy < 0.2) {
    me.reflex.adjust('restThreshold', 0.15);
  }
  if (danger > 0) {
    me.reflex.adjust('dangerAvoidance', 0.3);
  }

  // Wake conditions
  for (var i = 0; i < me.events.length; i++) {
    var e = me.events[i];
    if (e.type === 'reproduced') return { wake: true, reason: 'reproduced' };
    if (e.type === 'new_terrain') return { wake: true, reason: 'new_terrain' };
  }
  if (energy < 0.25) return { wake: true, reason: 'crisis' };

  // Periodic wake (track in memory)
  var lastWake = me.memory.get('last_wake_tick') || 0;
  if (world.tick - lastWake >= me.genome.wakeInterval) {
    return { wake: true, reason: 'periodic' };
  }

  return { wake: false };
}
```

### `<memory>`
```json
{}
```
(Empty — populated by sensors on first tick.)

### `<tools>`
See "Starter custom tool" above — contains the `adjust_reflex` tool definition.

## Reproduction & Evolution

### Genome inheritance (Darwinian)
Same as M2: gaussian mutation (15% per gene, 10% stddev, 5% large jump chance). The new `maxEmbodimentSize` trait mutates like any other gene.

### Embodiment inheritance (Lamarckian)
When a creature reproduces:
1. Child gets **mutated genome** (new body, possibly different physical traits)
2. Child gets **cloned embodiment** from parent — identity, sensors, onTick, tools copied exactly
3. Child's `<memory>` starts **empty** (not inherited)
4. Child's reflex adjustments start at zero (genome base weights only)

The child has the parent's mind in a new body. The same onTick code may behave differently because the genome (and thus reflex base weights, sense range, speed) is different. Over time, natural selection favors genomes that work well with inherited embodiment patterns — and embodiments that work well across varied genomes.

### Spontaneous spawn (population floor)
When population drops below threshold, new creatures spawn with default embodiment and random genome. These are "wild" creatures with no inherited culture.

## Size Budget

Total embodiment size = sum of all section contents in characters.

**Budget**: `genome.maxEmbodimentSize × ageScalar(age)`

The age scalar starts low and increases toward 1.0 as the creature ages, representing cognitive maturation. Exact curve TBD, but something like:

```
ageScalar(age) = min(1.0, 0.3 + 0.7 * (age / maturityAge))
```

Where `maturityAge` might be ~100 ticks. This means:
- At birth: ~30% of genetic potential (must be lean)
- At maturity: 100% of genetic potential (can be complex)

A young creature inherits its parent's full embodiment but **cannot expand it** until it ages. If the inherited embodiment exceeds the young creature's budget... TBD. Options:
- Allow it (inherited embodiment is exempt from budget, only new edits are constrained)
- Truncate sections (risky — could break code)
- Block edits that grow sections until budget allows

**Recommendation**: inherited embodiment is exempt. The budget only constrains edits that would grow the total size. This way successful embodiments propagate without loss, and the budget constrains growth, not inheritance.

## Sandboxing

All creature-authored JS code (sensors, onTick, tool executors) runs in the Web Worker context. Safety measures:

- **Compilation**: `new Function('me', 'world', 'args', code)` — no access to worker globals
- **Time limit**: TBD (e.g., 5ms per onTick call). Kill + revert to default if exceeded
- **No network**: `fetch`, `importScripts`, `postMessage` not passed through `me`/`world`
- **No self-reference**: `me` and `world` are proxied objects, not raw creature/sim references
- **Error handling**: if onTick throws, log the error, use default wake=false, creature continues on reflexes alone
- **Code validation**: basic checks before compilation (no `while(true)`, bounded length)

The `me` and `world` objects should be **proxied/sandboxed** so that creature code can only access the documented API surface. No reaching into internal sim state.

## Changes from M4

### Removed
- **Rules system** (`src/sim/rules.ts`): dropped entirely. Rules were a stepping stone to embodiment. The onTick function replaces rule-based reflex modification.
- **`add_rule` / `remove_rule` tools**: replaced by section edit tools
- **`set_memory` tool**: replaced by `edit_memory` + `me.memory.set()` in code
- **`adjust_reflex_weight` tool**: replaced by the custom `adjust_reflex` tool in the `<tools>` section (demonstrates the pattern)
- **`inspect_surroundings` tool**: was already non-functional in single-turn. Sensors replace this.
- **Hardcoded system prompt / user message format**: replaced by embodiment serialization
- **Hardcoded wake conditions in engine**: moved to onTick
- **Death wake-up**: removed (no lasting effect — memory not inherited, edits don't matter post-death)

### Added
- **Embodiment data structure** on Creature: sections dict, size tracking
- **Embodiment execution**: onTick runner, sensors runner, custom tool executor
- **`me` / `world` API**: sandboxed interface for creature code
- **Reflex adjustment system**: base (genome) + adjustments (onTick/consciousness)
- **`maxEmbodimentSize` genome trait**: evolves through natural selection
- **Section edit tools**: 5 hardcoded consciousness tools
- **Custom tool system**: creatures define their own tools in `<tools>` section
- **`me.events` buffer**: engine → onTick communication channel

### Preserved
- **Reflex system** (`src/sim/reflex.ts`): stays as sim physics, but rules integration removed. Uses genome weights + adjustments instead.
- **Genome + mutation** (`src/sim/genome.ts`): expanded with `maxEmbodimentSize` trait
- **Consciousness infrastructure** (`src/sim/consciousness.ts`): heavily rewritten but same pattern (queue, pause/resume, API calls). The message building and tool execution are completely different.
- **Engine tick loop** (`src/sim/engine.ts`): modified to run onTick before reflexTick, and pass events to creatures
- **Visualizer / inspector**: no changes needed (embodiment is internal to sim)

## Observability

A key goal of M6 is being able to **observe and discuss** what creatures are doing with their embodiments. Three modes of observation:

### 1. Live browser observation (Claude via Playwright)
Claude can navigate to the dev server, watch the sim run, click creatures in the inspector, read their embodiment sections, monitor console logs, and take screenshots. This enables real-time pair-debugging: "look at creature #12, why does its onTick keep waking it every tick?"

### 2. User recounting / pointing things out
The user describes what they saw ("creature #7 deleted its sensors and went blind") and we discuss. The inspector timeline already captures consciousness thoughts + tool actions, making it easy to recount the story.

### 3. Structured state dump
`window.__debug` already exposes creatures and history. Extend it with:
- `window.__debug.dumpEmbodiment(id)` — print a creature's full embodiment sections
- `window.__debug.dumpLineage(id)` — trace embodiment changes through a family tree
- `window.__debug.exportRun()` — serialize recent history (embodiment edits, births, deaths, consciousness events) as JSON that can be pasted into a conversation

Console logging should be rich enough to follow the embodiment story:
- `[EMBODIMENT]` tag for section edits (which creature, which section, size before/after)
- `[ONTICK]` tag for wake signals (creature, reason)
- `[TOOLS]` tag for custom tool execution (creature, tool name, args)

## Future: Multi-Turn Consciousness (M7)

Single-turn consciousness works for M6 because all tools are fire-and-forget (edits, reflex adjustments). Multi-turn would enable:
- Tool calls that **return data** the model reasons about
- Inspect-then-decide patterns (look at surroundings, then edit onTick)
- Multi-step tool chains (edit tools definition, then call the new tool)
- Richer custom tools that produce information, not just side effects

This is a natural next milestone once M6 is stable.

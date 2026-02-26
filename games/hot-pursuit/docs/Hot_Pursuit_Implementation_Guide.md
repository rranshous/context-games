# Hot Pursuit: Implementation Guide

*Created: February 25, 2026 | Last Updated: February 25, 2026 | Robby Ranshous*

*Bridges the Hot Pursuit design document to validated actant bootstrap patterns from brewhaha/finch experiments. Intended as development context for Claude Code in VS Code.*

---

## Purpose of This Document

The Hot Pursuit design document describes what we're building and why. This document describes how to build it — grounded in patterns that have been experimentally validated in actant work. Where the design doc's assumptions conflict with observed actant behavior, this guide calls it out and provides the corrected approach.

Read this alongside the design doc and the actant bootstrap guide. The design doc is the vision. The bootstrap guide is the proven infrastructure. This document is the map between them.

---

## Architecture Mapping: Bootstrap Patterns → Game Systems

### The Scaffold IS the Game Engine

The bootstrap guide defines a scaffold that provides inference, tool execution, persistence, rendering, and signal dispatch. In Hot Pursuit, the game engine serves this role. The mapping is direct:

| Bootstrap Scaffold | Hot Pursuit Game Engine |
|---|---|
| `me.thinkAbout(thought)` | Reflection-phase inference call — actant reasons about the chase replay |
| `me.display(html)` | Not used during chase. During reflection, renders to the strategy board UI |
| `me.memory.read/write()` | Read/write the actant's memory section (chase history, player model) |
| `me.identity.read/write()` | Read/write identity section — rarely modified but available |
| `me.callTool(name, args)` | During chase: execute chassis primitives. During reflection: call scaffold tools |
| `sendSignal(entity, type, data)` | Chase-mode events: `player_spotted`, `player_lost`, `ally_signal`, `tick` |
| `onSignal(type, data)` | The actant's tactical handlers — the switch statement IS the police AI |
| `maintainMemory(signal, response)` | Post-chase memory update — append observations from the just-completed run |
| Persistence via localStorage | Soma JSON saved to disk/DB after each reflection phase |

Do not invent new abstractions where the bootstrap patterns already provide validated ones. The `me` API shape works. Use it.

### The Context Window IS the Police Officer

Each police actant's complete state is a context window string. This string is the system prompt when the model runs inference during reflection. During the chase, the signal handler code extracted from this string executes directly in the game engine.

The context window for a police actant follows the bootstrap soma structure:

```xml
<identity>
name: Officer Mara Reeves
badge: HPD-003
nature: Reeves patrols the grid the way a hawk circles a field — patient,
  reading the terrain, waiting for the moment the prey commits to a direction.
  She doesn't chase. She arrives.
</identity>

<responsibility>
Capture the fugitive. Learn from every chase. Become harder to escape.
</responsibility>

<tools>
[
  {
    "name": "move_toward",
    "description": "Move one step toward a target position using pathfinding.",
    "input_schema": { "type": "object", "properties": { "target": { "type": "object" } } },
    "execute": "async ({ target }) => { return me.callTool('_engine_move', { target, mode: 'pathfind' }); }"
  },
  {
    "name": "check_line_of_sight",
    "description": "Look toward a position. Can you see what's there?",
    "input_schema": { "type": "object", "properties": { "target": { "type": "object" } } },
    "execute": "async ({ target }) => { return me.callTool('_engine_los', { target }); }"
  }
]
</tools>

<signal_handlers>
async function onSignal(type, data) {
  switch(type) {
    case 'tick': {
      // default: patrol randomly
      const directions = ['north','south','east','west'];
      const dir = directions[Math.floor(Math.random() * 4)];
      me.callTool('_engine_move_direction', { direction: dir });
      break;
    }
    case 'player_spotted': {
      // default: move toward player
      me.callTool('move_toward', { target: data.player_position });
      break;
    }
    case 'player_lost': {
      // default: go to last known position
      me.callTool('move_toward', { target: data.last_known_position });
      break;
    }
    case 'ally_signal': {
      // default: no-op
      break;
    }
  }
}
</signal_handlers>

<memory>
Officer Reeves has not yet pursued anyone. No chase history.
</memory>

<memory_maintainer>
async function maintainMemory(chase_replay, reflection_output) {
  const current = me.memory.read();
  const summary = await me.thinkAbout(
    'Here is your current memory:\\n' + current +
    '\\nHere is what just happened:\\n' + JSON.stringify(chase_replay.summary) +
    '\\nHere is what you concluded during reflection:\\n' + reflection_output +
    '\\nUpdate your memory. Keep it concise. Focus on patterns, not individual ticks.'
  );
  me.memory.write(summary);
}
</memory_maintainer>
```

---

## Critical Corrections to the Design Doc

### 1. Prose Gravity Will Fight the Core Mechanic

The entire game depends on actants crystallizing tactics into executable signal handler code. Experimental evidence shows models resist this aggressively. They will describe what they want to do in prose (memory, responsibility) rather than encoding it as code (signal_handlers).

**The design doc says**: "The model outputs an updated soma."

**What actually works**: Explicit imperative prompts naming the specific scaffold tool. The reflection phase must not say "update your tactical handlers." It must say:

> "You just completed chase #3. Here is the replay. Review it, then right now call `update_signal_handlers` and rewrite your `on_player_spotted` case to implement what you've learned. Then call `update_memory` to record what you changed and why."

This is the single highest-risk implementation detail. If the reflection prompts are too gentle, the actants will write beautiful prose analysis and change nothing about their actual behavior.

### 2. Identity Needs a Nature Analogy, Not Personality Adjectives

**The design doc says**: `personality_seed: aggressive/cautious/methodical`

**What actually works**: A single poetic line in the `nature:` field that connects the character to how it pursues. This shapes behavior more than any adjective list.

Examples for different officer archetypes:

- *"Voss moves through the grid like a current through wire — always taking the shortest path, never wasting a step, arriving before you've finished deciding where to run."*
- *"Okafor watches intersections the way a spider watches a web — still at the center, feeling for vibrations, knowing which thread to pull."*
- *"Tanaka doesn't pursue. Tanaka narrows. Every position Tanaka takes removes an option you thought you had."*

These will shape the actant's self-modification choices during reflection far more effectively than `personality_seed: methodical`.

### 3. Start with One Tool, Not the Full Chassis

**The design doc says**: Give all actants the complete primitive library from the start.

**What actually works**: Start with the minimum — `move_toward` and `check_line_of_sight`. Let actants discover additional capabilities through a `discover_tools` mechanism during reflection.

This maps to the bootstrap guide's principle: "Starting with 35 tools produces noise; starting with 1 produces focus."

Implementation: the scaffold maintains a registry of available chassis primitives. During reflection, the actant can call `discover_tools` to see what's available, then call `update_tools` to add primitives that fit its evolving tactical approach. A methodical officer might adopt `map_query` and `escape_routes_from` early. An aggressive officer might grab `move_to_intercept` first.

This produces individuation through tool selection — different actants build different capability surfaces based on what they think they need. That's more interesting than everyone starting with the same toolkit.

### 4. Orienting Tool Descriptions, Not Instructional

**Wrong**: `"Calculate intercept position given target position and velocity vector"`

**Right**: `"Move to where the suspect is going, not where they are"`

The model can see the code. The description tells it what the action *means*, not how it's implemented. This is especially important for tools the actant might discover during reflection — the description is what makes the actant want to adopt it.

### 5. Poke Thought as Perception, Not Directive

During reflection, the framing of the chase replay matters. Don't present it as a data dump.

**Wrong**: `"Analyze the following chase replay data and identify tactical improvements."`

**Right**: `"The chase is over. You're back at the precinct, replaying the night in your head. Here's what happened — every turn, every glimpse of the suspect, every moment you lost the trail. What do you see now that you couldn't see in the moment?"`

The model decides what to do with the perception. The prompt creates the conditions for good reasoning without dictating the output.

---

## The Two-Phase Execution Model

### Chase Mode: Handler Extraction and Execution

During a chase, the game engine does NOT run inference. It:

1. Loads each actant's soma JSON from storage
2. Extracts the `signal_handlers` section
3. Compiles the `onSignal` function using `AsyncFunction` (not `new Function` — the handlers may contain `await`)
4. Each game tick, fires `onSignal('tick', { own_position, known_state, map_state })` for each actant
5. When a player enters an actant's line of sight, fires `onSignal('player_spotted', { player_position, own_position, map_state })`
6. When the player leaves line of sight, fires `onSignal('player_lost', { last_known_position, own_position, map_state })`
7. Records all inputs and outputs as replay data

The `me.callTool` calls within handlers resolve to engine primitives — pathfinding, movement, map queries. These execute synchronously within the game tick (or with a budget of N milliseconds per actant per tick).

**Key gotcha from bootstrap guide**: `\\n` in template literals. Soma content stored as JS template literals will convert `\n` to real newlines. Code in signal handlers that contains string literals with `\n` must use `\\n`. This will bite you in memory writes and string construction inside handlers.

**Key gotcha from bootstrap guide**: Temporal confusion. If an actant modifies its soma during reflection and then gets another inference call in the same reflection phase, it sees its changes but has no record they were just made. The fix: always call `update_memory` alongside structural changes to record what changed and when.

### Reflection Mode: Structured Inference

After a chase completes:

1. Build a replay summary (not full tick-by-tick — see "How Much Replay Data" below)
2. For each actant, construct the inference call:
   - System prompt = the actant's full soma (context window IS the entity)
   - User message = the reflection prompt + replay summary
   - Available tools = scaffold tools (`update_signal_handlers`, `update_memory`, `update_tools`, `discover_tools`, optionally `share_debrief`)
3. Run inference. The model will reason about the chase, then (if prompted correctly) call scaffold tools to modify its own soma
4. Validate the updated signal handlers — only allowlisted chassis primitives, execution timeout, no state leakage
5. Persist the updated soma
6. Run `maintainMemory` to compress/curate the memory section
7. If communication is enabled, share debrief summaries between actants (as a second inference pass where each actant receives ally debriefs as input)

### How Much Replay Data

Full tick-by-tick for a 200-tick chase is too much context for useful reflection. Provide:

- **Summary stats**: duration, outcome, closest approach distance, number of times player was spotted/lost
- **Key moments**: A curated list of events — first sighting, losses of visual contact, near-captures, moments where the actant was clearly out of position. Annotated with tick number and positions
- **The player's path** (simplified — waypoints rather than every tick)
- **The actant's own path** (simplified, same way)
- **Ally positions at key moments** (if communication is enabled)

Let the actant request more detail if it needs it via a `query_replay` tool that can retrieve specific tick ranges.

---

## Scaffold Tools for Reflection Phase

These are the tools available to the actant during reflection inference. They follow the bootstrap guide's principle of per-section named tools.

```typescript
const scaffoldTools = [
  {
    name: "update_signal_handlers",
    description: "Rewrite how you respond during a chase. This is your actual behavior — the code that runs when you spot the suspect, lose them, or hear from an ally.",
    input_schema: {
      type: "object",
      properties: {
        handlers_code: {
          type: "string",
          description: "The full onSignal function"
        }
      },
      required: ["handlers_code"]
    }
  },
  {
    name: "update_memory",
    description: "Update what you remember. Your memory persists across chases.",
    input_schema: {
      type: "object",
      properties: {
        memory_content: { type: "string" }
      },
      required: ["memory_content"]
    }
  },
  {
    name: "discover_tools",
    description: "See what capabilities are available to you that you haven't adopted yet.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "update_tools",
    description: "Add new capabilities to your toolkit for future chases.",
    input_schema: {
      type: "object",
      properties: {
        tools_json: {
          type: "string",
          description: "Updated tools array as JSON"
        }
      },
      required: ["tools_json"]
    }
  },
  {
    name: "query_replay",
    description: "Look more closely at a specific moment in the chase. What happened between those ticks?",
    input_schema: {
      type: "object",
      properties: {
        start_tick: { type: "number" },
        end_tick: { type: "number" }
      },
      required: ["start_tick", "end_tick"]
    }
  },
  {
    name: "share_debrief",
    description: "Share what you observed with the other officers. They'll hear your observations, not your tactics.",
    input_schema: {
      type: "object",
      properties: {
        observations: { type: "string" }
      },
      required: ["observations"]
    }
  }
];
```

---

## Handler Validation

After the actant calls `update_signal_handlers`, the engine must validate before persisting.

**Allowlist enforcement**: Parse the handler code and verify all `me.callTool` calls reference either adopted tools from the actant's `tools` section or engine primitives prefixed with `_engine_`. Any unrecognized tool name → reject the update, keep the previous handlers, and log the attempt.

**Execution budget**: Wrap handler execution in a timeout. If `onSignal` doesn't return within N milliseconds (e.g., 50ms for a single tick), kill it and substitute the default handler for that signal type.

**State isolation**: The handler's scope includes `me` (the actant's own API) and the signal `data`. It cannot access the game engine's global state, other actants' somas, or the player's state beyond what's passed in the signal.

**No inference in chase mode**: The `me.thinkAbout()` function should throw or no-op during chase mode. If an actant tries to call inference inside a signal handler during a live chase, that's a boundary violation. The handler should be pure embodiment execution.

```typescript
function createChaseAPI(actant: ActantSoma, engine: GameEngine): MeAPI {
  return {
    callTool: (name, args) => {
      if (!actant.tools.find(t => t.name === name) && !name.startsWith('_engine_')) {
        throw new Error(`Tool not available: ${name}`);
      }
      return engine.executePrimitive(actant.id, name, args);
    },
    memory: {
      read: () => actant.memory,
      write: (_) => { throw new Error('Cannot write memory during chase'); }
    },
    thinkAbout: (_) => { throw new Error('No cognition during chase'); },
    display: (_) => { /* no-op during chase */ }
  };
}
```

---

## Communication Configurations

### Config A: No Communication

Actants reflect in isolation. No `share_debrief` tool available. Coordination emerges only from spatial observation during chases (seeing ally positions via `ally_positions()` primitive).

### Config B: Observation Sharing

After each actant reflects individually, run a second inference pass where each actant receives the other actants' debrief outputs. The debrief is observations only — what they saw, where the player went. Not their handler code or tactical reasoning.

```
Phase 1: Individual reflection → each actant produces debrief + handler updates
Phase 2: Debrief sharing → each actant receives allies' debriefs as a new signal
  onSignal('debrief', { ally_id, observations })
  The actant can update memory/handlers again based on shared observations
```

### Config C: Tactic Sharing

Same as Config B, but debriefs include the ally's updated signal handler code. The actant can read another officer's pursuit logic and adopt/adapt it.

### Config D: Live Radio

Chase-mode handlers include `broadcast` and `signal` primitives. An actant can emit `me.callTool('_engine_broadcast', { type: 'player_spotted', position: data.player_position })` inside its `player_spotted` handler, and other actants receive it as `onSignal('ally_signal', { ... })`.

---

## Bootstrap Sequence for the First Police Actant

Following the bootstrap guide's sequence, adapted for the game context:

1. **Write the identity first.** Name, badge, the nature analogy. Read it back. Does it feel like a cop you'd be nervous to have chasing you?

2. **Write responsibility.** "Capture the fugitive. Learn from every chase." One line. Orienting, not instructional.

3. **Pick one tool.** `move_toward`. The most basic pursuit primitive. The actant starts knowing how to chase and how to look. Everything else it discovers.

4. **Seed minimal memory.** `"Officer [Name] has not yet pursued anyone. No chase history."` Let the actant structure its own memory format after the first reflection.

5. **Default signal handlers.** The naive `player_spotted → move_toward(player)` pattern shown in the soma template above.

6. **Run it.** Play one chase against the naive handlers. Verify the game loop works, replay data captures correctly, the handlers execute without errors.

7. **Run the first reflection.** Feed the replay to the actant. Use the explicit imperative prompt. Watch whether it actually calls `update_signal_handlers` or just writes prose. If prose gravity wins, strengthen the prompt.

8. **Run a second chase.** Did the behavior change? Is the change in the direction the reflection suggested? This is the validation gate — if this cycle works, the core mechanic works.

---

## Development Phases (Revised)

### Phase 1: The Grid and the Loop

Build the game engine scaffold:

- Tile-based map (load from JSON tilemap)
- Player entity with keyboard input
- Police entity with hardcoded `move_toward` behavior (no soma yet)
- Line-of-sight calculation
- Win/lose detection
- Replay data capture
- Canvas rendering (simple top-down, colored squares are fine)

**Milestone**: Playable chase that produces a structured replay JSON.

### Phase 2: Soma Integration

Replace hardcoded police with the actant architecture:

- Soma data structure (the context window template above)
- `me` API for chase mode (with `thinkAbout` disabled)
- Signal dispatch: `tick`, `player_spotted`, `player_lost`
- Handler extraction and execution via `AsyncFunction`
- Handler validation (allowlist, timeout, state isolation)
- Soma persistence (save/load JSON)

**Milestone**: Police behavior is driven entirely by the `onSignal` function in their soma. Hand-editing the soma JSON changes their chase behavior.

### Phase 3: The Reflection Loop

Add inference-driven self-modification:

- Reflection manager: constructs inference call from soma + replay
- Scaffold tools: `update_signal_handlers`, `update_memory`, `update_tools`, `discover_tools`, `query_replay`
- Reflection prompt engineering (explicit imperatives, perception framing)
- Soma validation and persistence after reflection
- Memory maintainer execution
- The strategy board interstitial UI

**Milestone**: A police actant that plays chase #1 with naive handlers, reflects, and plays chase #2 with observably different behavior.

### Phase 4: Population and Communication

Scale from one actant to multiple, add communication:

- Multiple actant instances with different identity seeds
- Communication configurations A through D
- Debrief sharing pipeline
- Live radio primitives
- Tool discovery mechanism (actants start with minimal tools, discover rest)

**Milestone**: 3-4 actants evolving independently, with observable individuation in pursuit styles.

### Phase 5: Polish, Metrics, Spectating

- Retro visual style
- Strategy board with real actant observations
- Replay viewer with heatmaps
- Metrics capture (handler complexity, diversity, convergence)
- Multiple maps
- Player progression

---

## Open Questions (Updated)

- **Handler language**: Full JavaScript in `AsyncFunction` is the bootstrap guide's proven approach. A tactical DSL would be safer but unvalidated and limits emergent complexity. Recommendation: start with JavaScript + allowlist validation. Build the DSL only if sandboxing becomes unmanageable
- **Memory curation at scale**: After 20+ runs, memory needs compression. The bootstrap guide's `maintainMemory` pattern handles this — the actant curates its own memory via inference after each chase. But we should watch for memory drift where early observations get overwritten and the actant "forgets" hard-won lessons
- **Reflection prompt tuning**: The explicit imperative approach is validated for single tool calls. Reflection here requires multiple tool calls (update handlers + update memory + optionally share debrief). Sequencing matters. May need multi-turn reflection or a structured checklist prompt
- **`discover_tools` pacing**: If actants can discover all chassis primitives in one reflection, they might adopt everything at once (defeating the "one tool to start" principle). Consider revealing tools gradually — certain primitives only become discoverable after N chases, or after the actant demonstrates specific behaviors
- **Cross-platform hosting**: The design doc envisions this running in a browser. The bootstrap guide's scaffold pattern (ekokie) runs on a server with API endpoints. The game engine probably wants to be browser-side with the reflection manager calling an API. Architect the boundary early

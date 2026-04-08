# Habitat — Design Document

*Created: 2026-03-17*

---

## What a Habitat Is

A habitat is a persistent environment where actants live, interact, and evolve. It hosts modules, manages infrastructure, and constructs the surfaces through which everything connects.

The habitat is deliberately thin. It doesn't contain intelligence (that's in actants), logic (that's in modules), or data (that's in the StateStore). It's the membrane that holds everything together — glue, lifecycle, and surface construction.

---

## Infrastructure

The habitat provides three infrastructure pieces. Everything else is built on top of these.

### StateStore

Single persistence layer. Everything that survives a restart goes through it. Organized by namespace:

```
modules/{id}/state        — module state (ModuleRuntime reads/writes)
modules/{id}/meta         — owner, created_by, created_at
actants/{id}/soma         — soma sections
events/{event_name}/...   — event stream
habitat/config            — loaded modules, actant roster, clock rate
```

**Append-only audit trail is a built-in behavior.** Every write to the StateStore gets logged with the clock timestamp and the writer's identity. This serves three purposes simultaneously:

- **Persistence** — current state of everything
- **Communication** — events are writes to the `events/` namespace; subscribing is reading since your last read
- **Auditability** — the complete history of everything that happened, replayable

The MessageBus is not a separate piece of infrastructure. It's a pattern over the StateStore. Events are writes. Subscriptions are queries. The audit trail and the event history are the same thing.

### ModuleRuntime

Loads modules, executes handlers in sandboxed VMs, manages module state through the StateStore.

- Dynamically imports module definitions from disk
- Parses handler source via AST scan at load time (fast-fail on disallowed patterns)
- Executes handlers in `vm.createContext()` with a stripped global (JSON, Math, and primitives — nothing else)
- Passes `structuredClone(state)` into handlers, applies returned state, persists via StateStore
- Enforces handler timeout via `vm.runInContext` timeout option
- Handles hot-loading: watch modules directory, load new modules, unload removed ones

The ModuleRuntime knows nothing about actants, ownership, or surfaces. It executes module handlers and manages module state. That's it.

### Clock

The habitat's own time. Disconnected from wall time.

- Drives actant ticking, timestamps events and audit entries
- The habitat controls the rate — pause, speed up, slow down, step
- Every timestamp in the StateStore uses clock time, not wall time
- Gives the habitat a replayable, inspectable timeline independent of when things physically happened
- Clock time can be passed into module handlers as part of their execution context

---

## What the Habitat Does

### 1. Orchestrates Infrastructure

The habitat creates and owns the StateStore, ModuleRuntime, and Clock. It wires them together: the ModuleRuntime writes through the StateStore, the Clock timestamps StateStore writes, module handlers can receive the current clock time.

### 2. Constructs Surfaces

This is the core job. The habitat builds **bound surfaces** — objects with methods that have identity and access already baked in. Surfaces are constructed at connection time, not checked at call time.

When an actant activates a module, the habitat constructs a surface:

```ts
// Habitat builds this at activation time:
const chatSurface = {
  post: (text) => moduleRuntime.call('chat', 'post', { text }, actantId),
  read: (count) => moduleRuntime.call('chat', 'read', { count }, actantId),
};

// Chassis receives chatSurface.
// Having the surface IS the permission. No runtime checks.
```

When the actant deactivates, the surface is removed. When ownership transfers, a new surface with `configure()` is constructed for the new owner, and the old owner's surface is replaced with one without it.

**The constraint is the absence of the thing, not a guard in front of the thing.** If you don't have the method on your surface, you can't call it. The habitat doesn't sit on every wire checking traffic — it builds the wiring, and then things flow.

The habitat constructs surfaces when relationships change:
- **Activation / deactivation** — actant gets or loses a module's method surface
- **Ownership transfer** — owner gets a surface that includes `configure()`; non-owners don't
- **Event subscription** — subscriber gets a surface that receives events; unsubscribing removes it
- **Module load / unload** — surfaces for that module are constructed or torn down
- **Actant creation / destruction** — all surfaces for that actant are constructed or torn down

Between these moments, the habitat is not in the loop. Calls flow through surfaces directly.

### 3. Lifecycle Management

The habitat is the only thing that can add or remove participants:

- **Modules**: load from disk, hot-load new ones, unload removed ones, archive state on unload
- **Actants**: create with initial soma, destroy, start/stop ticking
- **Clock**: start, stop, set rate, step
- **Habitat itself**: startup (load everything from StateStore, reconstruct surfaces), shutdown (persist everything, stop clock)

### 4. Human Surface

A human interacts with the habitat, not with modules or actants directly. The human is another participant, same as an actant, just through a different surface (UI instead of chassis).

Through the UI, a human can:
- Call module methods (play tic-tac-toe, post to chat, paint on canvas)
- Observe actant state (inspect somas, watch ticks)
- Manage lifecycle (load/unload modules, create/destroy actants, adjust clock)
- Read the audit trail

---

## Surfaces

Four boundaries where things meet. Each is narrow and well-defined. Nothing reaches through a layer to touch something beyond it.

```
┌──────────────────────────────────────────────────────────┐
│  World                                                   │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Habitat                        ← world surface →  │  │
│  │                                                    │  │
│  │   ModuleRuntime    StateStore    Clock              │  │
│  │                                                    │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  Chassis                 ← habitat surface →  │  │  │
│  │  │  ┌────────────────────────────────────────┐  │  │  │
│  │  │  │  Soma              ← chassis surface →  │  │  │  │
│  │  │  │                                        │  │  │  │
│  │  │  │  identity, memory, on_tick, tools      │  │  │  │
│  │  │  └────────────────────────────────────────┘  │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Soma ↔ Chassis (chassis surface)

The `me` API. `read()`/`write()` on soma sections, `thinkAbout()`. This is all the model sees. The chassis is opaque — the soma doesn't know how tools get compiled, how inference works, or how ticking happens.

### Chassis ↔ Habitat (habitat surface)

The chassis gets its capabilities here. Constructed by the habitat as bound surfaces — module methods, event subscriptions, clock queries. The chassis doesn't call the habitat — it calls the surfaces the habitat constructed for it.

### Habitat ↔ World (world surface)

External boundary. Network access, APIs, other habitats potentially. This is where external data enters (an actant fetches BBC RSS) and where the habitat can be observed or controlled from outside.

---

## How Things Flow

### Module method call

```
Soma (on_tick code calls a tool)
  → Chassis (compiled tool is a bound surface method)
    → ModuleRuntime.call(moduleId, method, input, callerId)
      → structuredClone(state), run handler in VM
      → returns { state, result, emit? }
    → ModuleRuntime persists new state via StateStore
    → emitted events written to StateStore events namespace
    → subscribers' event handlers fire (same VM sandbox)
  → result flows back to chassis
→ Soma sees the tool result
```

The habitat is not in this flow after surface construction. The bound surface method goes directly to the ModuleRuntime.

### Event flow

```
Module handler returns { emit: [{ event: 'ttt.game_ended', data: {...} }] }
  → ModuleRuntime writes to StateStore: events/ttt.game_ended/{clock_time}
  → Subscribers with surfaces for this event get their handlers invoked
  → Each subscriber handler: clone state, run in VM, persist new state
```

### Activation

```
Actant wants to activate 'chat' module
  → Habitat looks up 'chat' module in ModuleRuntime
  → Habitat constructs bound surface: { post(), read() }
  → Surface is attached to the actant's chassis
  → Actant's tools now include chat methods
  → Activation recorded in StateStore
```

---

## What the Habitat Is NOT

- **Not a policy engine.** It doesn't check permissions at call time. Access is structural.
- **Not intelligent.** It doesn't make decisions. Actants do.
- **Not a data store.** The StateStore is. The habitat uses it like everything else.
- **Not the world.** The world is outside. The habitat is inside. The world surface is the boundary.

The habitat is the membrane. It constructs the wiring, manages lifecycle, and provides the infrastructure that everything else runs on.

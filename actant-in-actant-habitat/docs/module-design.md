# Habitat Modules — Design Document

*Created: 2026-03-17*

---

## Overview

A habitat is a persistent environment where actants (AI entities with soma-based embodiment) live, interact, and evolve. Modules are the building blocks of a habitat's world — self-contained units of state and logic that actants and humans interact with through a mediated runtime.

This document defines the module contract, the runtime's responsibilities, and the isolation model.

---

## Core Principles

1. **Modules are inert.** They hold state and expose logic. They don't reach out, fetch data, schedule work, or have agency. Actants have agency. Modules are containers.

2. **Three base rules.** Private state + public methods. A shared event bus. Ownership as the single trust primitive.

3. **Simple rules, complex expression.** The system doesn't need trust tiers, permission matrices, or capability tokens. Ownership + bus + pure methods composes into whatever complexity emerges.

---

## Module Interface

```ts
interface HabitatModule {
  id: string;       // unique identifier, e.g. 'chat', 'tic-tac-toe'
  name: string;     // human-readable name

  // --- State ---

  // Create fresh initial state
  init(): unknown;

  // --- Public Methods ---

  methods: {
    [name: string]: {
      description: string;
      schema: JSONSchema;        // input shape (JSON Schema)
      handler(
        state: unknown,          // frozen snapshot of current state
        input: unknown,          // validated against schema
        caller: string           // identity of who's calling
      ): { state: unknown; result: unknown };
    };
  };

  // --- Bus Integration ---

  // Events this module can emit (declared for discoverability)
  emits?: string[];

  // Event subscriptions — receive events from the bus
  on?: {
    [event: string]: (
      state: unknown,
      payload: { emitter: string; data: unknown }
    ) => unknown;   // returns new state
  };

  // --- UI (optional) ---

  render?(el: HTMLElement, state: unknown): void;
}
```

### Method Handlers

Handlers are **pure synchronous functions**. They receive a snapshot of state and return new state + a result. The runtime applies the state update and persists it. The handler cannot:

- Mutate the real state object (it receives a `structuredClone`)
- Access the network, file system, or other modules' state
- Use `import`, `require`, `fetch`, `process`, or any global not explicitly provided
- Run async code

This isn't a convention — it's enforced (see Isolation Model below).

### Bus Events

Every event on the bus carries the emitter's identity:

```ts
{ emitter: string; data: unknown }
```

A module subscribes to events in its `on` block. The event handler receives current state + the event payload and returns new state. Same purity rules apply — event handlers run in the same sandboxed context as method handlers.

Modules declare what events they emit via `emits`. This is for discoverability, not enforcement — the runtime could optionally validate, but the primary purpose is letting other modules (and actants) know what's available.

### Example: Emitting Events

The runtime handles event emission. When a method handler wants to emit an event, it signals this through its return value:

```ts
handler(state, input, caller) {
  // ... update state ...
  return {
    state: newState,
    result: { moved: true },
    emit: [{ event: 'ttt.game_ended', data: { winner: 'X', gameId: '...' } }]
  };
}
```

The runtime reads the `emit` array and dispatches each event on the bus with the module's id as `emitter`. The handler itself never touches the bus directly.

---

## Runtime Responsibilities

The module defines logic. The runtime does everything else:

### State Management
- Calls `module.init()` if no persisted state exists
- Loads state from disk (`data/modules/{id}.json`) on startup
- Passes `structuredClone(state)` to handlers
- Applies returned state after each method call / event
- Persists state to disk after each state change

### Method Dispatch
- Validates input against the method's JSON Schema
- Clones state, invokes handler in sandboxed VM
- Applies returned state, persists, returns result to caller
- Dispatches any emitted events onto the bus

### Event Routing
- Maintains subscription map from module `on` declarations
- When an event fires: iterates subscribers, invokes each handler with current state + payload
- Applies and persists each subscriber's returned state

### Module Lifecycle
- Loads modules from a directory (`modules/`)
- Hot-loads new modules (watch for new files)
- Unloads removed modules (stop routing events, archive state)
- Tracks ownership: `{ moduleId, ownerId }`

---

## Isolation Model

Two layers enforce the purity contract:

### Layer 1 — AST Scan (load time)

When a module is loaded, the runtime parses each handler's source and walks the AST. It rejects handlers that contain:

- `import` / `require` — no external modules
- `fetch` / `XMLHttpRequest` — no network
- `process` / `global` / `globalThis` — no Node globals
- `eval` / `Function` constructor — no dynamic code generation
- `window` / `document` — no browser globals

This is a fast-fail lint, not deep security. It catches mistakes and makes the contract legible: "your handler tried to use `fetch` — modules can't do that."

### Layer 2 — Stripped VM (runtime)

Handlers execute in `vm.createContext()` with a minimal global:

```ts
const ctx = vm.createContext({
  structuredClone,
  JSON,
  Math,
  Array, Object, String, Number, Boolean,
  Map, Set, Date,
  // nothing else
});
```

There is no `require`, no `process`, no `setTimeout`, no `fetch`. These aren't hidden or blocked — they don't exist. A handler can't guess at globals because the globals aren't there.

`vm.runInContext` provides a `timeout` option — handlers that infinite-loop get killed.

Together: AST scan gives clear error messages at load time. VM isolation makes side effects structurally impossible at runtime.

---

## Ownership

Every module has an owner: an actant, a human, or the habitat itself.

- **Non-owners** can call a module's public methods and receive events.
- **Owners** can additionally call `configure()` (if the module exposes one) to modify the module's behavior.
- **Ownership is transferable.** The runtime tracks `{ moduleId, ownerId }` and can reassign it.

Ownership is the single trust primitive. There are no permission tiers, role systems, or capability matrices. If you need complex trust relationships, you compose them from ownership:

- The habitat itself owns core/system modules (bus, persistence)
- A "habitat maintainer" actant is just an actant that owns the system modules
- An actant that creates a module owns it by default
- A module that manages other modules is just a module whose methods accept module IDs

---

## Actants and Modules

Modules are inert. Actants have agency. The boundary between them:

| | Modules | Actants |
|---|---------|---------|
| State | Private, managed by runtime | Soma, self-modifiable |
| Logic | Pure synchronous handlers | Async, agentic, can call tools |
| External access | None | Network, APIs, inference |
| Side effects | Structurally impossible | Core capability |
| Lifecycle | Loaded from disk, passive | Tick loop, autonomous |

### The BBC News Example

An actant wants to bring news into the habitat:

1. The actant creates a `bbc-news` module (becomes owner). The module has methods: `add_article`, `list_articles`, `get_article`. Its state is a list of articles.
2. On its ticks, the actant fetches BBC RSS (it has external access — modules don't). It calls `bbc_news.add_article(...)` through the runtime. The module stores the article in its state.
3. Other actants activate the module and call `list_articles` / `get_article` to read news.
4. The module emits `bbc_news.new_article` on the bus. Other modules (or actants) can subscribe.

The module itself has no idea where articles come from. It's just a container with add/list/get logic. The actant is the one with agency and external reach.

### Module Patronage

A module can optionally have an actant **patron** — an owning actant that periodically reflects on the module's state and evolves its behavior. Simple modules (counter, notepad) don't need a patron. Complex modules (a storytelling engine, a curated gallery) benefit from an actant that reads their state, thinks about it, and calls `configure()` to adjust.

This isn't a special mechanism. It's just an actant that owns a module and interacts with it on its ticks like any other module interaction.

---

## Persistence

- Module state persists as JSON on disk: `data/modules/{id}.json`
- Module ownership tracked in: `data/modules/_registry.json`
- State written after every state-changing operation (method call or event handler)
- Modules are JS/TS files in a `modules/` directory, dynamically imported

---

## Open Questions

- **State size limits.** Should modules have a max state size? Unbounded state means unbounded disk/memory. Could be a per-module config, or a habitat-wide policy.
- **Event ordering.** If multiple event handlers fire from one event, what order? Does it matter? (Probably not if handlers are pure and don't depend on each other's state.)
- **Method rate limiting.** Should the runtime limit how often a caller can invoke a method? Prevents a runaway actant from hammering a module.
- **Schema for `configure()`.** Should there be a standard shape for configuration methods, or is it freeform per module?
- **Module versioning.** When a module's code changes (hot reload), its state might be incompatible. Migration strategy?

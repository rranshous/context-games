# Habitat Design Journal

---

## Session 1 — 2026-03-17: From "riff on Habitat" to "the habitat IS an actant"

### Starting Point

Started from the existing Habitat game (`games/habitat/`) — a local prototype where two actants (alpha, beta) share a tic-tac-toe server, chat, canvas, and notepad, all running in a single HTML page with localStorage persistence. The question was: what if we redesigned this as a proper architecture with plug-and-play modules?

### Modules First

Began with the module contract. Modules in original Habitat were "servers" — `TicTacToeServer`, `ChatServer`, `CanvasServer` — each with their own ad hoc API. We wanted a uniform interface.

Key decisions that shaped everything:
- **Modules are inert.** They hold state and logic. Actants have agency. This separation came from asking "what if an actant wants to bring BBC news into the habitat?" — the actant fetches, the module stores. Clear line.
- **Pure synchronous handlers.** `(state, input, caller) → { state, result }`. The module never mutates — the runtime applies state updates. This gave us isolation for free. A buggy handler can't corrupt anything because it only returns data.
- **Caller identity is a foundational guarantee.** The runtime stamps every call with who made it. The module can trust it absolutely. This became the cornerstone of the ownership model.

### The Isolation Model

Asked "how do we keep state private?" and realized the architecture already did it. Handlers run in a stripped `vm.createContext()` with only basic JS globals. AST scan at load time catches obvious issues (import, require, fetch). The handler receives a `structuredClone` of state — even if it mutates the clone, the real state is untouched.

Privacy comes from structural absence, not active guarding. There's no path to another module's state because the handler never receives a reference to it. No ACLs, no encryption — just: the store is internal, handlers run in VMs, state is cloned.

### Finding the Middle Layer

Originally lumped everything into "the runtime." Then realized there were distinct responsibilities: execution (ModuleRuntime), communication (MessageBus), coordination (Registry), and persistence. Pulled them apart.

The MessageBus collapsed into the StateStore — events are just list appends, subscriptions are reads-since-last-tick. The Registry dissolved — ownership is a module-internal pattern (modules guard themselves using `caller`), not runtime infrastructure.

### StateStore: Redis as Inspiration

Started with flat key-value (`get`/`set`). Felt too limited. Robby pointed at original Redis — the elegance of a few data structures with natural operations. Landed on a subset: strings, lists, hashes, sets. ~15-20 operations total. Events-as-lists, audit trail as a list, module state as hashes. One mechanism, multiple uses.

### Surfaces as Structural Access

The habitat was "mediating" every call — checking permissions, forwarding. Robby pushed back: that's a policy engine, make it structural. The fix: construct bound surfaces at connection time, not check them at call time. When an actant activates a module, the habitat builds an object with allowed methods and caller identity baked in. Having the surface IS the permission. No runtime checks.

### The Clock

Agreed on a monotonic counter disconnected from wall time. Each tick increments by 1. The habitat controls wall-time interval between ticks. Pause, speed up, step — all just changing that interval. Every actant ticks on every clock tick; actants manage their own periodicity by skipping ticks in their handlers. Simple.

### Ownership Without a Registry

Robby had the key insight: ownership is a pattern, not infrastructure. A module's `init()` receives the creator identity, stores it in its own state. Methods check `caller === state.owner`. Transfer is a guarded method. The runtime doesn't track ownership at all — it just passes `caller` faithfully. Smart contract vibes, and deliberately so.

### The Reframe: Habitat IS an Actant

Asked "what must exist outside an actant for it to exist?" and reduced it to: a JS runtime, persistence, a clock, and signal dispatch. That's the chassis. That's all.

So: the JS process IS the habitat actant. Its chassis is the fixed bootstrap (event loop, persistence, wall-time heartbeat). Its soma defines the inner world's mechanisms — the StateStore operations, clock derivation, module loading. The infrastructure docs aren't describing separate components — they're describing the habitat actant's organs.

Inner actants live within the habitat actant's embodiment. Their chassis is provided by the habitat actant. When it ticks, they tick. When it stops, they stop. Between ticks, they don't exist — only their persisted soma does. The habitat actant dreams them into being.

### Human Access

Participant humans don't see the habitat directly. They interact through a collaborative actant that renders a UI. The actant creates the collaborative frame in which the human understands and participates in the habitat. The actant curates the experience — what's visible, what's interactive, what evolves.

The admin (Robby) is the habitat actant's own human collaborator, interacting through the habitat's frame. Same pattern as any inner actant-human collaboration, just at the outermost level.

### Boots Operational

Decided the habitat actant should work from first boot without inference. The chassis runs the mechanical loop — tick, dispatch, persist. Evolution comes through collaboration with the admin, not autonomous self-modification. Start operational, accumulate history (the audit trail), evolve together.

### Nested Habitats

If a habitat is an actant, nesting falls out naturally. An inner actant can BE a habitat. Its inner clock derives from the outer tick but isn't bound to it — inner time can run faster, slower, or variable. Resource costs nest multiplicatively though, connecting to the open ticks-vs-turns question.

### Where We Left Off

Eight design docs covering modules, habitat, chassis, clock, StateStore, ownership, human access, and the habitat-as-actant reframe. Open threads: ticks vs turns, module hot-reloading, nested habitat resource budgets, multiple humans. At the inflection between more design and starting to build.

---

## Session 2 — 2026-03-18: Recap

Returned after a day. Reviewed the full state. Started this journal to capture the design narrative — the docs have the *what*, the journal has the *why we got there*.

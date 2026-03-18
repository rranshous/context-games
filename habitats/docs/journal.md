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

## Session 2 — 2026-03-18: From Design to Implementation

### Recap and Journal

Returned after a day. Reviewed the full state. Started this journal to capture the design narrative — the docs have the *what*, the journal has the *why we got there*.

### Implementation Decisions

**TypeScript.** No debate. The actant somas contain JS code that gets compiled and executed — TypeScript→JS is zero friction. Node's `vm` module gives us the sandboxed execution we designed. Every prior project in this repo is TypeScript. The inference APIs are JS/TS native.

**Standalone Node process.** Not tied to the vanilla platform. Could run on a backend. The habitat is a process, not a web app.

**Terminal-first for the admin interface.** No browser, no web server, no websockets. The habitat actant's collaborative frame is text in the terminal. The UI actant renders text. Later, a web UI is just another channel connecting to the same habitat. Starting simple keeps the focus on the architecture, not the presentation.

**Modules have no render functions.** Modules expose methods and events. How that gets presented is the UI actant's job. This is consistent with the "actant creates the collaborative frame" principle from the human access design.

**Code topology matches the mental model.** The chassis/soma split is visible in the directory structure:

```
habitats/src/
  chassis/           ← fixed bootstrap, never changes
    index.ts         ← entry point: boot, load, loop
    clock.ts         ← wall-time → monotonic counter
    persistence.ts   ← read/write state to disk
    vm-runner.ts     ← stripped vm.createContext, AST scan
    statestore.ts    ← redis-subset (strings, lists, hashes, sets)
  soma/              ← habitat actant's soma (defines inner world)
    habitat-soma.ts  ← identity, handlers, module loading, actant lifecycle
    module-runtime.ts ← loads modules, dispatches calls through vm-runner
    surface-builder.ts ← constructs bound surfaces at connection time
  modules/           ← module definitions (blueprints, read at boot/hot-reload)
    chat.ts
    knock-knock.ts
habitats/data/       ← persisted StateStore on disk
```

**No `actants/` directory.** Actants are just soma in the StateStore. There's nothing on disk. The habitat soma's bootstrap handler creates initial actants by writing soma to the store. Killed the directory after Robby pointed out everything lives in the store.

**`chassis/index.ts` IS the bootstrap.** It starts the clock, loads the StateStore from disk, loads the habitat soma, and kicks off the first tick. The fixed kernel that brings the habitat actant to life.

### First Modules

- **Chat** — simple, exercises the module contract, events, multi-caller interaction.
- **Knock-knock jokes** — one actant poses a joke, another guesses the punchline. Module keeps score (guessing accuracy + joke difficulty). Clear format, multi-actant interaction, stateful in an interesting way.

### Building

Built chassis-first, then soma, then modules. All in one session.

**Chassis** — StateStore, Clock, Persistence, VM Runner all straightforward. The StateStore is a clean Redis subset: `get`/`set` for strings, `rpush`/`lrange`/`llen`/`ltrim` for lists, `hget`/`hset`/`hdel`/`hgetall` for hashes, `sadd`/`srem`/`smembers`/`sismember` for sets. Plus `keys` (prefix glob), `exists`, `del`, `type`. Audit trail appends on every mutation: `{ tick, writer, op, key, args }`.

**VM Runner** — stripped `vm.createContext` with only basic JS globals (JSON, Math, Array, Object, etc.) plus a sandboxed console. AST scan is simple regex-based whole-word matching against forbidden tokens. Handler receives `(state, input, caller)`, must return `{ state, result, emit? }`.

**Soma** — ModuleRuntime loads module definitions, dispatches method calls through the VM runner. SurfaceBuilder constructs bound surfaces at activation time. HabitatSoma manages actant lifecycle and tick dispatch.

**Key design trade-off discovered**: actant `on_tick` handlers run via `new Function` in the main process (not VM-sandboxed) because they need access to complex `me` and `habitat` objects that can't be easily serialized into a VM context. Module handlers run in the VM. This means actants are more trusted than modules — consistent with the design (actants are inhabitants, modules are inert containers).

**Bug found and fixed**: module state existence check used the wrong key format (`modules/{id}/state` vs hash field on `modules`). Fixed to use `hget('modules', def.id)`.

**Boot test results**:
- Fresh boot: creates actants, loads modules, tick 1 → alpha activates + posts to chat, tick 2 → beta activates + posts
- Restore: clock resumes at correct tick, modules say "existing state", actants restored, no duplicate activations
- Chat state verified: both messages persisted with correct sender and tick

The habitat boots, ticks, and persists. `cd habitats && npm run dev` to see it run.

### Admin REPL

Built a terminal REPL as the admin's collaborative frame. Commands: `status`, `actants`, `modules`, `soma <id>`, `chat`, `chat <msg>`, `audit [n]`, `store keys/get`, `knock-knock`, `pause`, `resume`, `step`, `speed <ms>`.

The REPL interleaves cleanly with tick output — you see `[tick N]` and actant activity flowing past while you type commands. Admin can chat as "admin" identity, inspect any actant's soma, browse the store directly, control the clock.

This is the first version of the habitat actant's collaborative frame. It's text, it's the terminal, and it works. The admin's view into the habitat.

**Current state**: habitat boots, two actants activate modules and post to chat, admin can observe and interact. The actants' on_tick handlers are trivial (activate + hello on tick 1/2, then idle). Next step is making them more interesting — richer behavior, actually playing knock-knock, etc.

### thinkAbout — Actants Come Alive

Wired up `thinkAbout` as an async method on `me`. Uses the Anthropic SDK directly (haiku 4.5). System prompt is pure soma sections in XML tags. User prompt is the impulse (`"thrive"`).

**Agentic loop**: up to 5 turns per thinkAbout call. Tool results feed back to the model. This was essential — the first version was single-turn and actants would say "I'll use these tools" but never see the results or act on them.

**Tool surface**: built from soma tools (read/write memory, post/read chat) + activated module methods. Module tools use `moduleId__method` naming (double underscore separator to handle module IDs with hyphens like `knock-knock`). Module definitions can now include `input_schema` for proper tool schemas — the knock-knock module has schemas for pose, guess, reveal, etc.

**on_tick is now async**: handlers are wrapped in `(async () => { ... })()`. The `thinking` flag on ActantRuntime prevents overlapping inference — if an actant is mid-think when the next tick fires, it's skipped with a log message.

**First run results** (tick 1-9, ~50 seconds):
- Alpha introduced itself in chat, posed 2 knock-knock jokes (Orange, Interrupting Cow)
- Beta read Alpha's messages, responded, posed its own joke (Lettuce), guessed Alpha's jokes
- Both wrote memories tracking their interactions and game state
- 6-9 tools per think session, 500-700 output tokens per think
- Total: ~7 thinks, ~5500 output tokens, genuine back-and-forth conversation
- Beta almost guessed "Orange you glad I didn't say banana" exactly — got it character-perfect except `?` vs `!` at the end

**Key insight**: haiku with pure soma as system prompt and `"thrive"` as impulse is enough to drive social behavior. No instructions needed. The tools + identity + context do the work. This matches the Habitat and Glint findings.

**Bugs found and fixed**:
- Chat tick timestamps were hardcoded to 0 — now reads from store
- Module tool names used single underscore (`knock-knock_pose`) causing split bugs — switched to double underscore
- Tool schemas were too vague (`input: { type: 'object' }`) — knock-knock module now has proper schemas with field descriptions

### Refactoring — Uniform Surfaces

Robby caught several design inconsistencies and we cleaned them up:

**Chat was special-cased.** `read_chat`/`post_chat` were hardcoded tools, not module surface methods. Fixed: chat is now a module like everything else. Its methods (`chat__post`, `chat__read`, `chat__history`) come from the module definition's schemas. No special tools.

**Soma tools were incomplete.** Only `read_memory`/`write_memory` existed. But the design says all soma sections should be read/writable. Fixed: tools are now generated from `SOMA_SECTIONS` array — `soma__read_identity`, `soma__write_identity`, `soma__read_memory`, etc. for all 4 sections. Inhabitants can now self-modify their `on_tick` and `on_event` handlers through thinkAbout.

**Module surfaces were on the wrong namespace.** Activated modules hung directly on the `habitat` object (`habitat.chat.post()`), conflating modules with habitat infrastructure. Fixed: modules live under `habitat.modules` namespace (`habitat.modules.chat.post()`). Habitat infrastructure (`events`, `clock`) stays at the top level.

**Terminology**: we started calling inner actants "inhabitants" to distinguish from the habitat actant itself.

### What the Surfaces Look Like Now

```
me                                ← your embodiment
  .id                             → "alpha"
  .identity.read() / .write()     → self-model
  .memory.read() / .write()       → what you know
  .on_tick.read() / .write()      → your tick handler
  .on_event.read() / .write()     → your event handler
  .thinkAbout(impulse)            → inference, soma as system prompt

habitat                           ← the environment
  .modules                        ← module namespace
    .activate(id) / .deactivate(id) / .list()
    .chat.post({ text })          → after activation
    ['knock-knock'].pose(...)     → caller identity baked in
  .events.subscribe / .unsubscribe  ← habitat infrastructure
  .clock.now()                      ← habitat infrastructure
```

During thinkAbout, the model gets tools from two sources:
- **Soma**: `soma__read_<section>` / `soma__write_<section>` for all sections
- **Modules**: `<moduleId>__<method>` for all activated module methods

### Habitat Actant — Not Yet Evolvable

Noted that the habitat-soma.ts is frozen TypeScript, not a modifiable soma. The habitat actant doesn't call thinkAbout. Its behavior is hardcoded in the chassis. For the habitat to self-modify, it would need its own soma sections in the StateStore and a collaborative thinkAbout loop with the admin. Flagged for future work — "boots operational, evolves through collaboration" is the principle, but only "boots operational" is implemented so far.

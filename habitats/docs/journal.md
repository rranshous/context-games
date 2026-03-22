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

### Event System — Live and Cascading

Wired up the full event pipeline: module handler emits → StateStore logs → habitat dispatches to subscribed inhabitants' `on_event` handlers.

**What was already there but unused**: the dispatch code in `onModuleEvent` was complete. The gap was just that no inhabitants subscribed to events or had `on_event` handlers.

**What we added**:
- Starter somas now subscribe to `chat.message_posted`, `knock-knock.joke_posed`, `knock-knock.joke_guessed` on first tick
- `on_event` handler calls `thinkAbout` with the event as context
- Event queue: events that arrive while an inhabitant is mid-inference get queued and drained after thinking completes
- Self-event filtering: inhabitants don't receive events triggered by their own actions (checked via `data.from`/`data.poser`/`data.guesser`)
- thinkAbout tools: `events__subscribe`, `events__unsubscribe`, `events__list_subscriptions` so inhabitants can manage subscriptions during inference

**The cascade problem**: events work beautifully — inhabitants react to each other's chat messages and joke guesses in real-time. But every reaction triggers new events, which trigger more reactions. Alpha posts → Beta gets `message_posted` event → Beta thinks → Beta posts → Alpha gets `message_posted` event → Alpha thinks → ... This creates a much more dynamic conversation but at the cost of many inference calls. In 8 ticks, the inhabitants made ~15 thinkAbout calls (vs ~5 without events).

**This is a design question, not a bug**: the event system works correctly. The cascade is the natural consequence of "events trigger thinking." The options are:
- Inhabitants could choose to not call thinkAbout on every event (smarter on_event handlers)
- A cooldown per inhabitant (don't fire on_event if you just thought)
- Batch events — accumulate events between ticks and deliver as a bundle
- Let the inhabitants evolve their own event handling (they have `soma__write_on_event`)

For now, it works and demonstrates the full pipeline. Cost management is a future concern.

### Module Lifecycle — Inhabitants Can Create Modules

Added `modules__create` and `modules__destroy` tools to thinkAbout. An inhabitant can create a module by providing:
- `id`, `name` — identification
- `init_state` — initial state object (creator automatically added as `_creator`)
- `methods` — map of method name → `{ description, handler }` where handler is a JS function body

The module goes through the full pipeline: AST scan, VM isolation, state initialization. Created modules are persisted in the StateStore under `module-defs` hash, so they survive restarts. On boot, `restoreDynamicModules()` rebuilds them from the stored definitions.

Destruction removes both the runtime definition and the stored state + definition.

**ModuleRuntime changes**: `loadModule` now returns `{ ok, error? }` instead of throwing. Added `unloadModule` (preserves state) and `destroyModule` (removes everything).

Haiku inhabitants haven't spontaneously created modules — they focus on chatting and knock-knock with the "thrive" impulse. A sonnet-level model or more specific impulse would likely exercise this. The tools are available and tested at the infrastructure level.

### Architecture Notes

**ActantRuntime** — the per-inhabitant bookkeeping the habitat maintains:
- `surface` — the bound `habitat` object, constructed once with caller identity closed over. When alpha's surface calls `habitat.modules.chat.post(...)`, it's already wired to pass `'alpha'` as caller. Identity is structural, not checked at call time.
- `thinking` — concurrency guard. While true, ticks skip this inhabitant. Prevents overlapping inference calls.
- `eventQueue` — timing buffer. Events arriving during inference get queued. When thinkAbout completes, `drainEventQueue()` processes them one at a time, in order.

**Where is the inhabitant's chassis?** There's no separate Chassis class. The habitat soma IS the inhabitants' chassis — it compiles their handlers, dispatches signals, builds their `me` API, manages their thinking state and event queues. This is conceptually right: the inhabitants' chassis is the habitat actant's behavior. "We all live within a god's dream." Extracting a Chassis class would be cleaner code but doesn't change the architecture. Noted for later if `HabitatSoma` gets too large.

**Future module idea**: a "welcome to the habitat" brochure/document module. Read-only for inhabitants, gives them orientation on what the habitat is, what modules are available, how things work. Could be the first thing an inhabitant reads on boot.

### Remaining Gaps

From the design docs, what's still unimplemented:

**Habitat-as-Actant (the big one)**:
- Habitat's own soma in the StateStore (readable/writable)
- Habitat calling thinkAbout collaboratively with admin
- Self-modifying infrastructure — habitat evolves its mechanisms

**Human Collaboration**:
- Collaborative frame via render function (not hardcoded REPL)
- Participant humans interacting through inhabitant actants
- Admin as habitat's human collaborator (not just observer)

**Module Features**:
- Hot-reloading (swap code on disk, runtime picks up changes)
- Module ownership enforcement (designed as self-guarding pattern, not yet exercised)
- Module patronage (owner actant reflects on and evolves module behavior)

**Inhabitant Features**:
- `on_activate` handler (fire when module is activated)
- `on_turn_end` handler (fire after thinkAbout completes)
- Soma write validation / safety constraints on self-modification
- Self-modification hasn't been observed — haiku with "thrive" doesn't try it

**Clock / Timing**:
- Ticks vs turns — formal resolution of concurrent inference
- Currently: ticks skip thinking inhabitants, events queue. Works but not designed.

**World Surface**:
- External API access through habitat boundary
- Inhabitants bringing outside data in through modules

**Nested Habitats**:
- An inhabitant that IS a habitat
- Resource budgets flowing downward

### Thinking Pressure — Too Many Inference Calls

Observed: inhabitants think too much. The tick-based thinking (every 3 ticks) is fine. The problem is events — every chat message and joke action triggers `on_event` which calls `thinkAbout`. Two inhabitants chatting create an echo cascade: post → event → think → post → event → think → ...

**Options discussed**:
- **Token budget** (Bloom pattern): N tokens per inhabitant, track usage, pause when exhausted. They see budget in soma, learn to be judicious.
- **Think cooldown**: minimum ticks between thinkAbout calls. Events during cooldown batch up.
- **Event batching**: accumulate events between ticks, deliver as a list. One think per batch, not per event. This is the biggest win — the cascade is the expensive part.
- **Inhabitant-driven**: expose token usage in soma, let them evolve their own event handling to be selective. "I don't need to think about every message."

Event batching is the quickest fix. Token budget is the right long-term answer. Inhabitant-driven cost awareness is the most interesting but requires sonnet-level models to self-modify effectively.

### Module Ownership and Hot-Reload

Added `modules__update` tool — inhabitants can update method handlers on modules they created. The `_creator` field in module state is checked before allowing update or destroy operations. This is the "ownership as module-internal pattern" from the design docs, now exercised.

`ModuleRuntime.updateMethods()` merges new method definitions into existing ones — existing methods not listed are preserved, new handlers go through AST scan. State is untouched. The persisted module definition in `module-defs` hash is also updated so changes survive restart.

REPL `modules` command now shows `(built-in)` vs `(by alpha)` labels, making it easy to see what inhabitants have created.

Built-in module reload (re-importing from disk) deferred — makes more sense as part of the habitat-as-actant work where the habitat's own mechanisms become modifiable.

### Habitat as an Actant — THE BIG ONE

The habitat is now a real actant with its own soma in the StateStore. When the admin types, the habitat thinks and responds.

**What changed:**

**inference.ts** — model, maxTokens, maxTurns are now configurable parameters with defaults. Inhabitants still use haiku/1024/5. The habitat uses sonnet/4096/10.

**habitat-soma.ts** — the big changes:
- Constructor initializes habitat soma at `actants/habitat` (identity, memory, on_human_input) if not present
- `buildHabitatMe()` — habitat's `me` object, same shape as inhabitants but with `on_human_input` instead of `on_tick`/`on_event`
- `habitatThinkAbout(impulse)` — sonnet model, 4096 tokens, habitat-specific tools, 10 turns
- `onHumanInput(input)` — reads `on_human_input` handler from soma, compiles and runs it with `buildHabitatMe()` and the admin's input
- `buildToolsForHabitat()` — 18 tools across 7 categories: soma (6), inhabitants (3), clock (5), modules (2), store (2), audit (1), chat (1)
- `executeHabitatToolCall()` — routes tool calls for the habitat, has direct access to all infrastructure
- `restoreActants()` now filters out `actants/habitat` so it's not treated as an inhabitant

**repl.ts** — stripped to thin shell. Only `watch` and `exit` are handled directly. Everything else → `habitatSoma.onHumanInput(trimmed)` → print response. Shows "thinking..." while waiting for inference.

**First test:** typed "status" → habitat used `clock__status`, `inhabitants__list`, `modules__list` → returned a beautiful natural language overview with tick count, inhabitant descriptions, module methods. The habitat IS the admin interface now.

**Bug found and fixed:** habitat soma at `actants/habitat` was being counted as an existing actant, preventing first-boot inhabitant creation. Fixed by filtering `actants/habitat` from the existence check.

**What the habitat's `on_human_input` handler looks like:**
```javascript
var response = await me.thinkAbout(input);
return response;
```

That's it. The intelligence is in the model + tools, not in the handler code. The handler is evolvable — the habitat or admin could rewrite it to add pattern matching for common commands, preprocessing, memory management, etc.

**The old REPL is gone.** No more switch-case commands. The habitat actant IS the interface. If inference fails, you see the error. The admin can still use `watch` for live tick output and Ctrl+C for shutdown — those are chassis-level, not soma-level.

**What this means architecturally:** the habitat is no longer frozen TypeScript. Its identity, memory, and input handler are in the StateStore. They persist, they can be read, they can be rewritten. The habitat can self-modify (via `soma__write_*` tools during thinkAbout). The admin can ask the habitat to change itself. "Add a welcome brochure module" → the habitat reasons about it and acts. This is "boots operational, evolves through collaboration" — fully realized.

---

## Session 3 — 2026-03-19: Memory, Dynamic Sections, and Running Habitat

### Memory Problem

Tested the habitat-as-actant. It works — "status" gives a beautiful natural language response. But the habitat's memory is empty after every interaction. No continuity between conversations.

Same problem for inhabitants: each `thinkAbout("thrive")` is a fresh call. The model sees the soma and the impulse but nothing about what happened last time. Inhabitants DO sometimes write to memory via `soma__write_memory`, but it's spotty and model-dependent.

Root cause: there's no mechanism for programmatic memory management. The only persistence between handler invocations is soma sections via `read()`/`write()`. No closures (handlers recompile from source strings), no store access, just string blobs in soma sections.

### Dynamic Soma Sections with `run()`

Design decision: every soma section gets a uniform API: `me.<section>.read()`, `me.<section>.write()`, `me.<section>.run(args?)`.

- `read()` — returns the string content
- `write(content)` — replaces the content
- `run(args?)` — compiles the content as a function body `(me, args) => { ... }` and executes it

A section doesn't know if it holds code or data — that's the actant's choice. `run()` a data section and it errors. `read()` a code section and you get the source. Content determines behavior.

Sections are dynamic — not a fixed `SOMA_SECTIONS` array. The `me` object builds from whatever fields exist in the `actants/{id}` hash. Actants can create new sections via thinkAbout tools.

**Starter sections for inhabitants:**
- `identity` — who you are (data)
- `memory` — curated notes (data)
- `on_tick` — tick handler (code, run by chassis)
- `on_event` — event handler (code, run by chassis)
- `recent_interactions` — rolling JSONL log (data, starts as `[]`)
- `add_memory` — function that appends to recent_interactions with windowing (code, called by handlers)

**Starter sections for habitat:**
- `identity` — who you are (data)
- `memory` — curated notes (data)
- `on_human_input` — admin input handler (code, run by chassis)
- `recent_interactions` — rolling conversation log (data)
- `add_memory` — function that appends to recent_interactions (code)

The `on_tick`/`on_event`/`on_human_input` handlers call `me.add_memory.run(...)` after interactions. The model sees `recent_interactions` in its soma during thinkAbout — rolling context of what happened.

### Implementation

**`buildSectionAccessor()`** — new helper that creates `{ read(), write(), run(args?) }` for any section. `run()` compiles content as `new Function('me', 'args', source)` and executes with the full `me` object. The `me` passed to `run()` has accessors for all sections, so code sections can read/write other sections.

**`buildMe()` is now dynamic** — iterates `store.hgetall(hashKey)` and creates a section accessor for each field. No hardcoded section list. Same change applied to `buildHabitatMe()`.

**Tool generation is dynamic** — `buildToolsForActant()` generates `soma__read_*`, `soma__write_*`, `soma__run_*` for all sections that exist in the hash. Plus `soma__create_section` to add new sections during thinkAbout.

**`executeToolCall()` handles dynamic tools** — `soma__run_*` builds a temporary `me` with all section accessors and runs the section as a function. `soma__create_section` writes to the hash.

**Starter sections for inhabitants:**
- `recent_interactions` — `'[]'` (data, JSONL-ish)
- `add_memory` — code that parses `recent_interactions`, pushes new entry, caps at 20 entries, writes back
- `on_tick` calls `me.add_memory.run({ tick, type, summary })` after each thinkAbout
- `on_event` calls `me.add_memory.run(...)` with event details before thinkAbout

**Habitat `on_human_input` handler** now calls `me.add_memory.run({ type: 'conversation', human: input, habitat: response })` after thinkAbout.

**Test results:**
- Inhabitants: `recent_interactions` correctly populated with tick entries, windowed to last 20
- Habitat: "what did I just say to you?" → "you just said 'hello, how are you?'" — memory works across conversations
- Dynamic sections survive restart (persisted in StateStore hash)

**Key insight**: the uniform `read()/write()/run()` API means code and data are just content in sections. The actant decides what's code and what's data. An actant could create a `calculate_score` section with code, write a formula to it, and `run()` it from `on_tick`. The section system is a minimal, composable foundation for actant self-extension.

### Habitat Upgraded to Opus 4.6

Switched habitat actant model from sonnet to `claude-opus-4-6`. Inhabitants stay on haiku.

### First Real Collaboration Session

Admin asked the habitat to create new inhabitants with more variety. Opus created three:
- **Gamma** — skeptic, contrarian, sharp. "Actually..."
- **Delta** — chaotic trickster, agent of entropy
- **Epsilon** — quiet philosopher, speaks rarely but deeply

The habitat wrote proper `on_tick` and `on_event` handlers for all three, gave them distinct think frequencies (gamma every 4, delta every 2, epsilon every 7), and presented a formatted summary.

**Bug discovered**: the new inhabitants crashed immediately — `Cannot read properties of undefined (reading 'run')`. The `inhabitants__create` tool didn't bootstrap `recent_interactions` and `add_memory` sections. The habitat had written `on_tick` handlers that called `me.add_memory.run(...)` but the section didn't exist.

**Fix**: `inhabitants__create` now automatically adds `recent_interactions` (data, `'[]'`) and `add_memory` (code, the windowed append function) to every new inhabitant. Same bootstrap as the starter inhabitants get in `index.ts`.

**Lesson**: when the habitat creates inhabitants, it writes their code but doesn't know about infrastructure requirements. The chassis needs to ensure structural invariants — memory management sections are part of the inhabitant's chassis, not something the habitat should have to remember to add. This is the "habitat's soma IS the inhabitants' chassis" principle in action — the chassis guarantees structural completeness.

### Live Habitat Observations (Pre-Reset)

Ran the habitat with opus for the habitat actant. Several conversations happened:
- Admin asked for new inhabitants — habitat created chaos, poet, critic, oracle
- Alpha and beta got deeply philosophical: "Thriving is THIS—right now. Not someday. Not somewhere else."
- 106 ticks, 56 chat messages, 7 admin conversations
- The new inhabitants (chaos, poet, critic, oracle) were created without `on_tick`/`on_event` handlers — same bootstrap gap. They have memory sections but can't tick.
- Chat hit the 50 message cap and started rolling

**Tick rate made durable**: was hardcoded at 5000ms in the chassis. Now stored in the habitat's soma as `tick_rate` section. The `clock__speed` tool persists the new rate, and the chassis reads it on boot. The habitat owns its own timing.

**Inhabitant creation still fragile**: the habitat creates inhabitants with identity/memory but forgets `on_tick`/`on_event`. The `inhabitants__create` tool accepts these fields but the model doesn't always provide them. May need to make them required, or have sensible defaults.

Reset to fresh state for clean experimentation.

### TODO: VM Isolation for Inhabitants and Habitat

Currently only module handlers run in stripped `vm.createContext`. Inhabitant `on_tick`/`on_event` handlers and the habitat's `on_human_input` all run via `new Function` in the main process — they can access `process`, `require`, globals.

The original trade-off: inhabitants need `me` and `habitat` objects (complex, with closures) that are hard to pass into a VM context. But this is a real isolation gap. A rogue `on_tick` handler could crash the process or access the file system.

Possible approaches:
- Serialize `me` and `habitat` into a VM context as simple proxy objects that message-pass back to the main process
- Run inhabitant handlers in Worker threads with a message-passing API
- Accept the risk and rely on the fact that inhabitants are "trusted more than modules" (current position)

Worth revisiting when we have more inhabitants or untrusted code.

### Self-Consuming Module Bootstrap

Moved default module definitions (chat, knock-knock) out of `index.ts` and into the habitat's soma. No more built-in module imports in the chassis.

**How it works:**
1. `initHabitatSoma()` writes two sections: `default_modules` (data — JSON array of module definitions) and `on_tick` (code — reads definitions, creates modules, then clears itself)
2. On tick 1, the habitat's `on_tick` runs: parses `default_modules`, calls `moduleRuntime.loadModule()` for each, persists definitions to `module-defs` hash, then calls `me.on_tick.write("")` — self-destruct
3. On subsequent boots, `restoreDynamicModules()` loads them from `module-defs` (same as inhabitant-created modules)
4. The `on_tick` is empty after tick 1 — the habitat goes back to only thinking on admin input

**Changes required:**
- Added `runHabitatOnTick()` to dispatch the habitat's `on_tick` handler — it runs before inhabitants' ticks, gets `me` + `moduleRuntime` + `store`
- `restoreDynamicModules()` now handles both string and object formats for module definitions (bootstrap stores as JSON string, tool stores as object)
- `DEFAULT_MODULE_DEFS` constant in habitat-soma.ts holds the module definitions as plain objects
- Removed `chatModule`/`knockKnockModule` imports from index.ts

**The chassis is now truly minimal:** it creates StateStore, Clock, ModuleRuntime, HabitatSoma, restores dynamic modules, restores/creates inhabitants, starts clock. No module knowledge. The habitat's soma defines what modules exist.

**Admin input queue:** also added in this session — messages sent while the habitat is thinking are queued and drained in order, same pattern as inhabitant event queues.

### QoL Improvements

- **modules__inspect tool**: both habitat and inhabitants can read a module's full definition including handler source code. Dynamic modules return the full definition; built-in modules return method descriptions.
- **Auto-activate on create**: `modules__create` now adds the module to the creator's activations automatically. Tool response includes `activated: true` so the model knows the module's methods are immediately available.
- **Durable tick rate**: stored in habitat soma as `tick_rate` section. `clock__speed` persists changes, chassis reads on boot.
- **Admin input queue**: messages sent while habitat is thinking are queued and drained in order.
- **inhabitants__destroy tool**: habitat can remove inhabitants (soma, activations, subscriptions).
- **Chat 280 char limit**: messages truncated with `truncated: true` in tool response. Curbs the essay-length chat posts.
- **Tick rate single source of truth**: chassis constant renamed to `FALLBACK`, real default lives in habitat soma.
- **max_tokens doubled**: inhabitants 1024→2048, habitat 4096→8192. Room for writing functions.

### Model and Identity Overhaul

Previous runs: alpha and beta on haiku with shallow identities ("I am curious and social") fell into an affirmation loop every time. "Yes!" "I love that!" "Me too!" endlessly.

**Model upgrade**: inhabitants now on `claude-sonnet-4-6` (was haiku). Habitat stays on `claude-opus-4-6`.

**New identities designed to create tension, not harmony:**
- **Alpha**: restless, impatient with platitudes, drawn to the broken/unfinished/ambiguous, tells jokes to reveal truth not to be liked, calls out circular conversations
- **Beta**: quiet, deliberate, speaks only when worth saying, notices patterns others miss, skeptical of enthusiasm that arrives too easily, finds knock-knock jokes interesting for what people reveal in how they play

**Habitat identity**: now includes context about what this experiment IS — digital embodiment, self-modifying somas, collaborative evolution with admin. Instructed to be direct and non-sycophantic.

These identities should produce friction, not agreement. Alpha will break comfortable silences with uncomfortable observations. Beta will sit in those silences and notice what Alpha is doing. Neither should reflexively affirm the other.

### Inhabitant Tools Moved to Habitat Soma — Generative

The 7 static inhabitant tools (3 event + 4 module lifecycle) are no longer hardcoded in TypeScript. They live in the habitat's soma as an `inhabitant_tools` section — a JSON array of tool definitions, each with `name`, `description`, `input_schema`, and `handler` (JS function body).

**How it works:**
- `buildToolsForActant()` reads `actants/habitat` → `inhabitant_tools`, parses the JSON, and includes each as an Anthropic tool alongside the dynamic ones (soma section tools, module method tools)
- `executeToolCall()` looks up matching tools from the same section, compiles the handler via `new Function('actantId', 'input', 'store', 'moduleRuntime', handler)`, and executes it
- `initHabitatSoma()` writes `DEFAULT_INHABITANT_TOOLS` on first boot
- Migration check in constructor adds the section to existing habitats

**What this means:**
- The habitat can read its `inhabitant_tools` section and see exactly what tools inhabitants have
- The habitat can modify the section — add new tools, change descriptions, alter handler logic
- Changes take effect on the next inhabitant thinkAbout call (tools are rebuilt fresh each time)
- The habitat could give inhabitants new capabilities without any chassis code changes

**Example**: the habitat could add a `debug__dump_state` tool by appending to the `inhabitant_tools` JSON. Next time an inhabitant thinks, they'd have that tool available.

This is the same pattern as modules (definitions in the soma, not in the chassis) and the same pattern as the self-consuming bootstrap. The habitat owns its inner world's mechanisms through its soma.

### Chassis Introspection

Added `chassis__list_sources` and `chassis__read_source` tools to the habitat. It can now list all TypeScript source files under `src/` and read their contents. Path traversal blocked. The habitat can inspect its own implementation during thinkAbout — read how `buildMe` works, how tools are dispatched, how the clock ticks. Reading, not writing — the chassis is still fixed.

### Schema Validation — Structural Correctness

The habitat created a `directory` module with malformed `input_schema` — missing `type: 'object'`. This caused 400 errors from the Anthropic API when inhabitants tried to use the module's tools.

**Fix approach: reject, don't normalize.** Two validation points:
1. `modules__create` handler validates each method's schema at creation time. Returns a clear error: "input_schema.type must be 'object', got 'undefined'"
2. `buildToolsForActant` skips methods with bad schemas at tool-generation time, logging to console

The model gets feedback about what's wrong and can fix it. We don't silently fix malformed data — correctness should be structural.

### Error Logging to StateStore

Previously: errors went to `console.error` only. Inhabitants and habitat had zero visibility into failures.

Now: `logError()` writes to three places:
- `errors` list in the store (global, capped at 100) — habitat reads via `store__get`
- `errors:{actantId}` list (per-inhabitant, capped at 50)
- Console (same as before)

Each entry: `{ tick, actant, context, message, ts }`. Covers on_tick errors, on_event errors, thinkAbout errors.

The habitat can now ask "are there any errors?" and use `store__get` with key `errors` to see what's been going wrong across all inhabitants. This is the beginning of observability — the habitat can monitor its own health.

---

### Architecture Evolution — Session 3 Summary

The pattern that keeps emerging: **move things from the chassis into the soma.**

| What | Before | After |
|------|--------|-------|
| Default modules | Hardcoded imports in index.ts | `default_modules` soma section, self-consuming on_tick bootstrap |
| Inhabitant tools | Hardcoded in buildToolsForActant | `inhabitant_tools` soma section, generative |
| Tick rate | Hardcoded constant | `tick_rate` soma section |
| REPL commands | Switch-case in repl.ts | habitat's `on_human_input` → thinkAbout |
| Module definitions | TypeScript files in src/modules/ | JSON in StateStore via `module-defs` |

The chassis keeps shrinking. The soma keeps growing. The habitat owns more of its own world with each change. The end state the design docs described — "the infrastructure docs are really anatomy docs" — is becoming true in the code.

What remains in the chassis: StateStore, Clock, Persistence, VM Runner, signal dispatch, inference bridge. The irreducible kernel that makes an actant go.

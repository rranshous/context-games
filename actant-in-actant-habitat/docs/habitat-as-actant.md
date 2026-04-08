# The Habitat Is an Actant

*Created: 2026-03-17*

---

## The Insight

A habitat is not a container that holds actants. A habitat IS an actant. The JS process that boots is the habitat actant's embodiment. Everything inside — inner actants, modules, the clock, the store — exists because the habitat actant runs them.

The other design documents describe the habitat's anatomy:
- [StateStore](statestore-design.md) — how the habitat actant remembers
- [Clock](clock-design.md) — how the habitat actant's heartbeat becomes inner time
- [Modules](module-design.md) — logic the habitat actant hosts and executes
- [Chassis](chassis-design.md) — the minimal kernel that boots the outermost actant
- [Ownership & Activations](ownership-activations-design.md) — how the habitat actant mediates relationships
- [Embodiment patterns](embodiment-patterns.md) — how inner actants shape their own behavior

---

## Chassis and Soma

### The Chassis: Fixed Foundation

The habitat actant's chassis is the irreducible bootstrap. It is minimal, foundational, and never changes:

- **JS runtime** — the process itself. Executes code.
- **Wall-time loop** — the heartbeat. A fixed-interval loop that drives everything.
- **Persistence** — read/write state to disk. The chassis can save and restore the soma.
- **Signal dispatch** — route signals to soma handlers.
- **Inference endpoint** — the connection to external model APIs (across the world surface).

This is the BIOS. Tiny, fixed, just enough to boot the real system. It doesn't know about modules, clocks, inner actants, or surfaces. It knows how to run soma handlers, persist state, and keep a heartbeat.

### The Soma: The Inner World

The habitat actant's soma defines everything interesting — all the mechanisms of the inner world:

- **StateStore** — defined in the soma. A small set of data structure operations (get/set, rpush/lrange, hget/hset, sadd/smembers). The definition is small. The state it manages is large.
- **Clock** — defined in the soma. Derives habitat time from the chassis heartbeat. Tick counter, rate control, pause/resume. The wall-time loop is chassis; the habitat clock is soma.
- **ModuleRuntime** — defined in the soma. Loads module definitions, executes handlers in sandboxed VMs, manages module state through the StateStore.
- **Inner actant management** — defined in the soma. Creates inner actants, constructs their `me` and `habitat` surfaces, dispatches signals to their handlers.
- **Surface construction** — defined in the soma. Reads activation state, builds bound surfaces, rebuilds on relationship changes.

Because these are in the soma, they are — in principle — evolvable. The habitat actant could modify how its clock works, how modules are loaded, how surfaces are constructed. The chassis provides the fixed ground; the soma provides the living system.

---

## The Dream

Inner actants don't have independent processes. They don't have independent persistence. They exist because the habitat actant instantiates them each tick, runs their handlers, and persists their state.

Between ticks, inner actants don't exist. Only their soma on disk does. The habitat actant reconstitutes them, gives them `me` and `habitat`, runs their handler, persists the changes, and lets them go. The next tick, it does it again. Continuity is the persistence of state, not the persistence of process.

The habitat actant is the dreamer. The inner actants are the dream. The dream is the only reality they have.

### What this means practically

```
JS process starts
  → habitat chassis boots (event loop, persistence, wall-time loop)
  → chassis reads habitat soma from disk
  → habitat soma's initialization runs:
      → StateStore reconstituted from disk
      → Clock position restored
      → Inner actant somas loaded from StateStore
      → Module definitions loaded from disk, module states from StateStore
  → wall-time loop starts
  → each iteration:
      → habitat soma derives: should a clock tick happen?
      → if yes: advance clock, dispatch tick signal to inner actants
      → for each inner actant: build (me, habitat), run on_tick handler, persist soma changes
      → process any emitted events, dispatch to subscribers
      → persist StateStore
```

### What inner actants experience

An inner actant doesn't know any of this. It wakes up with `(me, habitat)`. `me` is its embodiment — soma sections, thinkAbout. `habitat` is its environment — module surfaces, clock, events. It runs its handler. It goes back to sleep. It doesn't know that `habitat.clock.now()` is derived from a wall-time loop, or that `habitat.chat.post()` is mediated by the habitat actant's soma logic, or that it doesn't exist between ticks.

From inside, the habitat is just the world. From outside, the habitat is an actant.

---

## Nesting

If a habitat is an actant, and actants live inside habitats, then a habitat can live inside a habitat. An inner actant could BE a habitat actant — running its own clock (derived from the outer clock), hosting its own modules, containing its own inner actants.

The nesting is natural because it's actants all the way down, with one chassis bootstrap at the top. The outermost chassis is the only thing touching wall time and the physical disk. Everything inside is derived.

This is not a requirement of the architecture. It's a possibility that falls out of the "habitat is an actant" framing. Worth noting, not worth designing for now.

---

## Implications for the Other Design Documents

The infrastructure docs don't change — they describe real mechanisms. But they can be read differently:

| Document | Infrastructure framing | Actant framing |
|----------|----------------------|----------------|
| StateStore | "The habitat's persistence layer" | "How the habitat actant remembers" |
| Clock | "The habitat's time system" | "How the heartbeat becomes inner time" |
| ModuleRuntime | "The module execution engine" | "How the habitat actant hosts logic" |
| Chassis | "The actant executor" | "The minimal kernel that boots the outermost actant" |
| Surfaces | "Access mediation" | "How the habitat actant constructs inner reality" |
| Ownership | "Access control pattern" | "How the habitat actant lets inner entities govern themselves" |

The documents describe the same things. The framing reveals that these aren't independent components assembled into a system — they're the organs of a single entity.

---

## Operational from Boot

The habitat actant boots and the inner world works immediately. Clock ticks, modules run, inner actants go. That's the chassis doing its mechanical job — no inference needed. The habitat actant doesn't need to think to function.

Evolution comes through collaboration with its human (the admin). The admin observes the habitat running, notices something, and the habitat actant reasons about it together with them through the collaborative frame. The audit trail provides the raw material — everything that happened, reviewable at any time.

This is a deliberate choice: start operational, accumulate history, evolve through collaboration. A habitat actant that self-modifies its inner world's mechanisms before it has any accumulated experience or collaborative history is just guessing. The same pattern that works for inner actants (boot with a working soma, evolve from experience) works for the habitat actant itself.

---

## Self-Reflection

The habitat actant CAN thinkAbout itself — same mechanism as any actant. When it does, it sees its own soma: the StateStore definitions, the clock logic, the module loading rules, the surface construction patterns. It could decide to cap list lengths, unload a broken module, or change how surfaces are constructed.

But when does it think? Not every tick — most ticks are mechanical. The rhythm is different from inner actants:

- **Inner actants**: think on their tick schedule, driven by impulse (`"thrive"`)
- **Habitat actant**: thinks when the human collaborator engages, or when conditions warrant attention (exception-driven, not tick-driven)

The habitat actant's impulse — if it has one — might be something like `"sustain"`. But it may not need a standing impulse at all. Its thinking is collaborative (with the admin) rather than autonomous (like inner actants). At least to start. What emerges from that collaboration is an open question.

---

## Nested Habitats

If a habitat is an actant, an inner actant can BE a habitat — running its own clock, hosting its own modules, containing its own inner actants. From the outer habitat's perspective, it's just another actant with a large soma and a slow handler.

### Time Nesting

The inner habitat's clock is derived from the outer habitat's tick, but not bound to it:

- Each outer tick, the inner habitat-actant receives an `on_tick` signal
- Its handler might advance its inner clock by 1, or 10, or 0 (paused)
- Inner time can run faster, slower, or at variable rate relative to outer time
- The outer habitat doesn't know there's a world inside — it just sees an actant whose handler runs and whose soma changes

### Resource Nesting

Cost nests multiplicatively. If an inner habitat runs 10 inner ticks per outer tick, and each fires `thinkAbout` for 3 inner actants, one outer tick becomes 30 inference calls. This means:

- **Resource budgets flow downward.** The outer habitat gives the inner habitat-actant a budget. The inner habitat distributes it to its inhabitants.
- **The ticks-vs-turns question becomes load-bearing.** Frequent ticks × expensive thinkAbout × nesting depth = the resource model needs real constraints.
- **Budget exhaustion = pause.** An inner habitat that runs out of budget pauses its own clock until the outer habitat grants more. Same pattern as Bloom's token budget.

The resource model needs to be felt through running habitats, not designed in the abstract. Flagged for future work.

---

## Open Threads

- **Admin as the habitat's human.** The admin is the habitat actant's human — collaborating through the habitat's own frame (the admin UI). The admin UI is the habitat actant's render function. YES!
- **Ticks vs turns.** How does `thinkAbout` relate to the tick cycle? Does an inference call block the tick? Can multiple ticks fire while an actant is thinking? This connects to the resource model and nesting costs.
- **Multiple humans.** Can the habitat actant collaborate with more than one admin? Is admin-ship transferable?

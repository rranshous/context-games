# Chassis — Design Document

*Created: 2026-03-17*

---

## What the Chassis Is

The chassis is the simple executor beneath an actant. It receives signals, finds the matching handler in the soma, runs it, and persists changes. That's it.

The chassis doesn't know what's in the handlers. It doesn't care if a handler calls `thinkAbout()` or does raw computation or does nothing. The actant shapes its own behavior by writing handlers into its soma. The chassis just runs them.

---

## One Job

```
Signal arrives → chassis finds handler in soma → runs it with (me, habitat) → persists soma changes
```

The chassis matches signals to handlers. Handlers are named functions that live in the soma as sections:

| Handler | Signal | When |
|---------|--------|------|
| `on_tick` | clock tick | Every habitat clock tick |
| `on_event` | bus event | When a subscribed event fires |
| `on_turn_end` | turn complete | After an interaction turn finishes |
| `on_activate` | module activation | When the actant activates a module |

These are starting conventions, not a fixed set. An actant could write additional handlers. If a handler doesn't exist in the soma for a given signal, nothing happens — the signal is ignored.

Every handler receives the same two arguments:

```ts
handler(me, habitat)
```

---

## `me` and `habitat`

Two arguments. One points inward, one points outward.

### `me` — the embodiment

The `me` object is the actant's full embodiment — soma and chassis together. The handler doesn't need to know which parts are persistent state (soma) and which are runtime capabilities (chassis). It's all just *you*.

```ts
me.identity.read()           // read a soma section
me.identity.write(content)   // write a soma section
me.memory.read()
me.on_tick.read()
me.thinkAbout(prompt)        // fire an inference call (chassis capability)
```

Every soma section has `read()` / `write()`. `thinkAbout(prompt)` fires an inference call where the system prompt is the serialized soma and the user message is the prompt. It's part of `me` because it's the actant's ability to think — intrinsic to the embodiment, not something the environment provides.

The soma/chassis boundary is an implementation detail. From the handler's perspective, `me` is everything the actant can do as itself.

### `habitat` — the environment

The `habitat` object is the actant's view of the environment it lives in. It's assembled from bound surfaces the habitat constructed for this actant.

```ts
// Module surfaces (only for activated modules)
habitat.chat.post(text)
habitat.bbc_news.list()

// Infrastructure
habitat.clock.now()
habitat.clock.elapsed()

// Module and event management
habitat.modules.activate(moduleId)
habitat.modules.deactivate(moduleId)
habitat.modules.list()
habitat.events.subscribe(event)
habitat.events.emit(event, data)
```

The `habitat` object is not the Habitat itself. It's the actant's *view* of the habitat — only the surfaces it has access to. Different actants see different `habitat` objects depending on what modules they've activated.

Activation and subscription are habitat operations because they change the wiring — they ask the habitat to construct or tear down surfaces. After activation, the new module surface appears on the `habitat` object.

### No `world`

In this architecture, the "world" is what's *outside* the habitat. Actants live *inside*. If an actant wants to reach outside (fetch a URL, call an API), it does so through a module that provides external access. From the actant's perspective, everything it can do is in `me` or `habitat`.

```ts
// An actant's on_tick handler
async function(me, habitat) {
  const articles = habitat.bbc_news.list();     // module surface
  const now = habitat.clock.now();              // infrastructure
  const chat = habitat.chat.read(5);            // module surface

  if (articles.length > 0) {
    habitat.chat.post("New article: " + articles[0].title);
  }

  await me.thinkAbout("thrive");                // inference call
}
```

---

## What the Chassis Does

### 1. Receives signals

The habitat sends signals to the chassis: clock ticks, events, lifecycle notifications. The chassis doesn't generate signals — it only responds to them.

### 2. Finds the handler

The chassis looks in the soma for a section matching the signal. `on_tick` for clock ticks, `on_event` for bus events, etc. If the section exists and contains a function, run it. If not, ignore.

### 3. Compiles and runs the handler

Handler source lives in the soma as a string. The chassis compiles it (`new Function('return ' + source)()`) and calls it with `(me, habitat)`.

Compilation is cached by content hash — if the handler source hasn't changed since last run, reuse the compiled function.

### 4. Builds `me` and `habitat`

Before running a handler:
- **`me`**: constructed from the soma sections + chassis capabilities. `read()` / `write()` for sections. `thinkAbout()` wired to the inference system. The handler sees one unified object.
- **`habitat`**: assembled from the bound surfaces the habitat constructed for this actant at activation time. Module methods, clock, module management, events.

### 5. Persists changes

After a handler runs, the chassis persists any soma changes through the StateStore. The chassis doesn't batch or defer — every handler run that changes the soma results in a persist.

---

## Built-in Tools

The chassis may provide built-in tools as part of the `me` API — capabilities that are intrinsic to the embodiment rather than provided by the habitat or modules. These are tools the actant has simply by existing (e.g., scaffold tools like `edit_on_tick`, `edit_memory` for validated self-modification during `thinkAbout` calls).

The exact set of built-in tools is TBD. The key distinction: built-in tools are part of `me` (the embodiment), not part of `habitat` (the environment). They travel with the actant regardless of which modules are activated.

---

## What the Chassis Does NOT Do

- **Choose what to execute.** The soma decides. The chassis runs whatever handler matches the signal.
- **Decide when to reflect.** If the actant wants periodic reflection, it puts a `thinkAbout()` call in `on_tick`. If it wants reflection on events, it puts it in `on_event`. The chassis doesn't have a reflection concept.
- **Know about archetypes.** A "reflex body" is an actant that put fast JS in `on_tick` and a `thinkAbout` in `on_event`. A "thinking body" put `thinkAbout("thrive")` in `on_tick`. These are patterns that emerge from how actants write their handlers. The chassis runs them all the same way.
- **Enforce behavior.** The chassis doesn't validate what handlers do (beyond compilation). It doesn't cap handler size, limit thinkAbout calls, or impose behavioral rules. Those constraints, if needed, belong in the habitat or module layer.
- **Touch the world.** The chassis has no external access. It provides `me` (inward) and `habitat` (the environment). External reach comes through modules, not the chassis.

---

## Relationship to the Habitat

The chassis receives two things from the habitat:

1. **Signals** — clock ticks, events, lifecycle notifications
2. **Bound surfaces** — the module and infrastructure surfaces that become the `habitat` object

The chassis gives one thing back:

1. **State changes** — soma updates after handler execution, persisted through the StateStore

The chassis doesn't call the habitat. It uses the surfaces the habitat pre-constructed. After surface construction, the habitat is out of the loop for normal handler execution.

---

## Relationship to the Soma

The chassis is the soma's skeleton. The soma is what the model sees — identity, memory, handlers, tools. The chassis is what makes those things run — compilation, the `me` API, signal dispatch.

From the outside (the habitat), soma and chassis are the embodiment — one unit. From the inside (the handler), `me` is the embodiment — one object. The soma/chassis split only matters at the implementation level: what persists (soma) vs. what executes (chassis).

An actant can rewrite any part of its soma — including the handler functions. The chassis will compile and run the new version on the next signal. Self-modification is not a feature of the chassis; it's a consequence of the soma being writable and the chassis being dumb.

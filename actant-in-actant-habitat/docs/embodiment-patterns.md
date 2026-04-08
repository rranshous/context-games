# Embodiment Patterns — Full Reference

*Comprehensive guide to actant embodiment, drawn from cognitive-climb, glint, hot-pursuit, habitat, bloom, and tag-your-dead.*

---

## Core Principle

**The inference call IS the body.** Whether it's compiled JS running every frame or a full model call every 30 seconds, the actant's behavior emerges from its soma — not from engine rules or external instructions.

---

## Embodiment Structure

An embodiment has two layers:

**Soma** — the persistent document. Identity, memory, handler functions, tools. What the model sees. What persists between inference calls. What the actant can read and rewrite.

**Chassis** — the executor beneath. Compiles handler functions, builds the `me` API, dispatches signals, manages persistence. Opaque to the model.

From the handler's perspective, these are unified into `me` — one object that provides both soma access (`me.identity.read()`) and chassis capabilities (`me.thinkAbout()`). The handler doesn't need to know which is which.

Every handler receives `(me, habitat)`:
- **`me`** — the embodiment. Everything the actant can do as itself.
- **`habitat`** — the environment. Activated module surfaces, clock, events, module management.

---

## The Chassis: Signal → Handler → Persist

The chassis is a dumb dispatcher:

1. Signal arrives (clock tick, bus event, lifecycle notification)
2. Chassis finds the matching handler in the soma (`on_tick`, `on_event`, etc.)
3. Compiles the handler source, cached by content hash
4. Runs it with `(me, habitat)`
5. Persists any soma changes

The chassis doesn't choose what to execute, when to reflect, or how to behave. The soma decides all of that through its handler functions.

---

## Three Patterns

These are not chassis types or configuration options. They're patterns that emerge from how actants write their handler functions. The chassis runs them all identically.

### 1. Thinking Pattern

The actant's `on_tick` calls `me.thinkAbout("thrive")` — **every tick IS a full inference call**. Behavior emerges from the model reasoning over its soma and calling tools.

**Used in**: habitat

**How it works:**
1. Every tick, the chassis runs `on_tick(me, habitat)`
2. The handler gathers context from `habitat` (module surfaces), writes notes to `me.memory`, then calls `me.thinkAbout("thrive")`
3. `thinkAbout()` sends: system = serialized soma (no preamble), user = the prompt string, tools = compiled from soma
4. Model runs an agentic loop (up to 10 turns) — calling tools, reading state, acting
5. Self-modification happens inline: model calls `edit_identity`, `edit_on_tick`, etc.

**The `"thrive"` discovery:**
- `"What should I do?"` triggers assistant-mode passivity — model reports state instead of acting
- `"thrive"` has no conversational partner — model falls back to agency, immediately acts
- **Principle: with pure soma, the user prompt should be an impulse, not a message**

**When it shines**: social interaction, creative expression, strategic games. The actant needs to read context, reason about others, make judgment calls — not react at frame rate.

### 2. Reflex Pattern

The actant's `on_tick` is **compiled JavaScript** that runs every frame with no API cost. A separate handler (e.g. `on_event`) fires `thinkAbout` with a stronger model to rewrite the code itself.

**Used in**: cognitive-climb, glint, hot-pursuit, tag-your-dead

**How it works:**
1. Chassis runs `on_tick(me, habitat)` every frame
2. Handler is pure computation — reads sensors from `habitat`, sets actions on `me`
3. All working state lives in `me.memory` — written/read by the handler code itself
4. On event signal (death, timer, chase end), chassis runs `on_event(me, habitat)`
5. `on_event` calls `me.thinkAbout(...)` — model reads the full soma and rewrites handler code

**Execution safety (from prior projects):**
- Timeout: 50ms typical (frame skips gracefully on timeout)
- Forbidden: `eval`, `Function` constructor, `import()`, `fetch`, `window`, `document`
- Size budgets vary: 10KB-50KB character limits depending on context
- Compile error → no-op fallback; actant drifts until next reflection

**Reflection context varies:**
- **Minimal** (glint): system = raw soma sections, user = `"thrive"`. No instructions.
- **Rich** (tag-your-dead, hot-pursuit): system = soma + game docs + arena. User = death cause + stats + visual map.
- Principle: richer context = more guided evolution. Pure soma = actant owns its evolution.

**Key insight**: haiku can run compiled code but can't self-modify well. Sonnet with near-zero prompting outperforms haiku with heavy scaffolding for reflection.

### 3. Mounting Pattern

The actant runs in a **stateless loop** — soma is rebuilt from disk every turn. To work with external artifacts, the actant **mounts** them into its soma, extending its body to envelop files and directories.

**Used in**: bloom

**How it works:**
1. Every turn: chassis reads all soma sections from disk, reads all mounted files/dirs, assembles the embodiment
2. Handler dispatched based on signal (chat message or stage-based impulse: `"become"`, `"orient"`, `"build"`, `"thrive"`)
3. Model reasons and calls tools (up to 50 turns per dispatch)
4. Between dispatches everything resets — only disk state persists

**The mount pattern:**

| Tool | Effect |
|------|--------|
| `mount_file(path)` | File contents appear in soma every turn |
| `unmount_file(path)` | File leaves soma (stays on disk) |
| `mount_dir_listing(path)` | Directory listing in soma, re-scanned fresh each turn |
| `unmount_dir_listing(path)` | Listing leaves soma |

**Why mounting exists — the spinning problem:**
In a stateless loop, one-shot reads evaporate after one turn. `list_files()` returns a listing that's gone next turn. The actant re-queries, gets the same answer, re-queries — spinning. Mounting solves this: the answer persists in the soma until explicitly unmounted.

**Mount-before-edit gate:**
`replace_in_file` requires the target to be mounted. You can't edit what isn't part of your embodiment. `write_file` auto-mounts. **The actant extends itself to envelop what it's working on, then contracts when done.**

---

## Universal Patterns

These show up across all three patterns.

### Section API (`read/write`)

Every soma section is accessed through a uniform interface on `me`:
```
me.<section>.read()   → string
me.<section>.write(s) → void
```
Some sections may be read-only in certain contexts (e.g., can't rewrite `on_tick` mid-execution of `on_tick`).

Section counts vary by context:

| Context | Sections |
|---------|----------|
| cognitive-climb | identity, sensors, on_tick, memory, tools (5) |
| glint | identity, on_tick, memory, hunt_journal (4) |
| hot-pursuit | nature, responsibility, signalHandlers, memory, playerModel (5+) |
| habitat | gamer_handle, identity, on_tick, memory, custom_tools (5) |
| bloom | identity, responsibilities, tasks + things_noticed, recent_actions, custom_tools (6) |
| tag-your-dead | identity, on_tick, memory (3) |

### Scaffold Tools (`edit_*`)

During `thinkAbout` reflection, models use named tools to modify soma sections:
- `edit_on_tick(code)` / `update_signal_handlers(code, reasoning)`
- `edit_memory(content)` / `update_memory(content)`
- `edit_identity(content)`

Tools validate before applying: syntax checks, forbidden patterns, size limits. Failed edits return error messages — multi-turn reflection can retry.

### Pure Soma Prompt (`no-preamble`)

The system prompt for `thinkAbout` should be the serialized soma — nothing more. No "you are an actant" framing. The identity section carries that context if the actant chooses to write it there.

Exceptions exist: some contexts inject game mechanics docs into the reflection system prompt. This is a **designer lever** — more scaffolding = more guided evolution; less = more emergent.

### Impulse Prompt (`"thrive"`)

The user message to the model should be a single-word impulse, not a question:
- `"thrive"` — habitat, glint
- `"become"` / `"orient"` / `"build"` — bloom (stage-dependent)
- Questions like `"What should I do?"` trigger passivity

### Smart Reflection (`smart-reflect`)

Use cheap/free execution for per-frame decisions. Use the strongest available model for self-modification.

| Layer | Model | Cost | Purpose |
|-------|-------|------|---------|
| Per-frame code | none (compiled JS) | free | Reflexes, reactions |
| Instinct calls | haiku | cheap | Quick classification (if needed) |
| Reflection | sonnet | expensive | Self-modification, learning |
| Inspector/summaries | haiku | cheap | On-demand briefings for humans |

### Memory Styles (`mem-*`)

Three approaches to persistent actant memory:

**`mem-kv`** (cognitive-climb): JSON key-value. `me.memory.get(key)` / `.set(key, val)`. Structured but requires parsing.

**`mem-string`** (glint): Flat string with embedded markers. `pursuing:yes\nlost:3.2\nlastknown:12.5,-8.3`. Parsed by handler code via regex. Simple, fragile, fully visible.

**`mem-freeform`** (habitat, tag-your-dead, hot-pursuit): Plain text blob. Model writes whatever it wants. Habitat uses `---` as delimiter between actant notes and auto-injected state.

**`mem-none`** (bloom): Memory section deliberately removed. State persists through other mechanisms (files, tasks, mounted artifacts).

---

## Choosing & Combining

These patterns combine. The most common is **Reflex on_tick with a Thinking on_event** — compiled code handles frame-rate reactions while periodic inference calls handle strategic self-modification.

| Context | Pattern | Why |
|---------|---------|-----|
| Real-time, many actants | Reflex | Can't afford inference per frame per actant |
| Slow-paced social/creative | Thinking | Judgment matters more than speed |
| Operating on external artifacts | Mounting | Need persistent awareness of files/systems |
| Real-time + needs learning | Reflex + Thinking | Most real-time contexts land here |
| External artifacts + social | Mounting + Thinking | What bloom would look like in a habitat |

---

## Glossary

| Term | Meaning |
|------|---------|
| **Embodiment** | Soma + chassis together. What `me` represents to a handler. |
| **Soma** | The persistent document that defines an actant — sections of text, code, and data |
| **Section** | A named slot in the soma (identity, on_tick, memory, etc.) |
| **Chassis** | The executor beneath — compiles code, builds `me` API, dispatches signals, persists state |
| **Handler** | A named function in the soma that the chassis runs in response to a signal |
| **`me`** | The handler's view of the full embodiment — sections + capabilities, unified |
| **`habitat`** | The handler's view of the environment — module surfaces, clock, events |
| **Reflection** | A `thinkAbout` call where the actant reviews itself and rewrites its own soma |
| **Scaffold tool** | A named tool (e.g. `edit_on_tick`) that validates and applies changes to a soma section |
| **Impulse** | A single-word user prompt (`"thrive"`) that drives agency without implying a conversational partner |
| **Mount** | Extending the soma to include an external artifact (file, directory listing) |

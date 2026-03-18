# Embodiment — Quick Reference

*Shorthand for actant embodiments in habitats.*

---

## One Principle

The inference call IS the body. An actant's behavior emerges from what its soma contains — code, identity, memory, tools — not from external instructions.

---

## Embodiment = Soma + Chassis

- **Soma**: the persistent document. Identity, memory, handler functions, tools. What the model sees. Survives restarts.
- **Chassis**: the executor. Compiles handlers, builds the `me` API, dispatches signals. Opaque to the model.
- **`me`**: the handler's view of the whole embodiment. Sections + capabilities, unified. The handler doesn't know or care which parts are soma and which are chassis.

---

## Handlers, Not Archetypes

The chassis is a dumb signal dispatcher. The soma contains handler functions. What those handlers do defines the actant's behavioral style:

| Pattern | How | Example |
|---------|-----|---------|
| **Thinking** | `on_tick` calls `me.thinkAbout("thrive")` | Slow-paced, social, creative — judgment over speed |
| **Reflex** | `on_tick` is pure JS computation, `on_event` calls `thinkAbout` | Real-time, frame-rate — cheap loop + expensive reflection on events |
| **Mounting** | Handlers mount/unmount external artifacts into soma | Operating on files/repos — extend yourself to envelop what you work on |

These aren't chassis types. They're patterns that emerge from how actants write their handlers. The chassis runs them all the same way.

---

## Handler Signatures

Every handler receives the same two arguments:

```ts
handler(me, habitat)
```

- **`me`** — inward. Soma sections (`read`/`write`), `thinkAbout()`.
- **`habitat`** — outward. Activated module surfaces, clock, events, module management.

---

## Universal Patterns

| Pattern | Shorthand |
|---------|-----------|
| **Section API** | `me.<section>.read()` / `.write()` for all soma sections |
| **Scaffold Tools** | `edit_*` tools with validation during thinkAbout reflection |
| **Pure Soma Prompt** | System prompt = serialized soma. No preamble. |
| **Impulse Prompt** | User message is a single-word impulse (`"thrive"`), not a question |
| **Smart Reflection** | Free code loop for instinct, strongest model for self-modification |

---

## Memory Styles

- **`mem-kv`**: JSON key-value. `me.memory.get(key)` / `.set(key, val)`.
- **`mem-string`**: Flat string with markers, parsed by handler code via regex.
- **`mem-freeform`**: Plain text blob. Model writes whatever it wants.
- **`mem-none`**: No memory section. State persists through other mechanisms (files, tasks).

---

## Choosing a Pattern

- Need frame-rate reactions? → **Reflex** (JS in on_tick, thinkAbout in on_event)
- Need judgment and social awareness? → **Thinking** (thinkAbout in on_tick)
- Operating on external files/systems? → **Mounting** (mount/unmount in handlers)
- Hybrid: Reflex on_tick + Thinking on_event is the most common combo

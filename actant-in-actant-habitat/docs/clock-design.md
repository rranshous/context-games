# Clock — Design Document

*Created: 2026-03-17*

---

## What the Clock Is

The clock is the habitat's heartbeat. It's a monotonic counter that ticks forward, disconnected from wall time. Every tick advances the counter by 1. The habitat controls how fast ticks happen in real time.

The clock is the only source of forward motion in the habitat. Nothing happens unless the clock ticks (or an external signal arrives through the habitat's world surface).

---

## How It Works

```
Clock ticks → habitat receives tick signal → routes to each chassis → on_tick handlers fire
```

The clock is simple:

- **`now()`** — returns the current tick count (integer, starts at 0)
- **`tick()`** — advances the counter by 1, emits a tick signal
- **`rate`** — wall-time interval between ticks (configurable)

That's the whole interface. The clock doesn't know about actants, modules, handlers, or the StateStore. It counts and emits.

---

## Disconnected from Wall Time

The clock's tick count has no fixed relationship to real time. The habitat controls the mapping:

| Action | Effect |
|--------|--------|
| **Normal** | One tick per `rate` milliseconds of wall time |
| **Speed up** | Decrease `rate` — ticks happen faster in real time |
| **Slow down** | Increase `rate` — ticks happen slower |
| **Pause** | Stop ticking entirely. `now()` stays frozen. Nothing moves. |
| **Step** | Manually advance one tick. Useful for debugging / inspection. |

This means:
- The habitat can be paused while a human inspects state, reads the audit trail, or adjusts modules — without time passing inside
- The habitat can be sped up for testing or fast-forwarding through uninteresting periods
- Every timestamp in the StateStore is a tick count, making the full history replayable at any speed
- Two habitats running on the same machine can have completely different clock rates

---

## One Rate, One Signal

Every clock tick fires every actant's `on_tick` handler. There is one tick rate for the whole habitat. There are no per-actant tick intervals.

If an actant wants to tick less frequently, it manages that itself:

```ts
async function(me, habitat) {
  const tick = habitat.clock.now();
  if (tick % 10 !== 0) return;  // only act every 10th tick

  await me.thinkAbout("thrive");
}
```

This keeps the clock dead simple and puts periodicity in the actant's hands — where behavioral decisions belong.

---

## Clock and the StateStore

Every write to the StateStore gets stamped with the current tick count. This happens at the habitat level — the clock provides the timestamp, the habitat applies it when mediating state changes.

The result is a complete, ordered, replayable log:

```
tick 0:   habitat/config created
tick 1:   actants/alpha/soma initialized
tick 1:   actants/beta/soma initialized
tick 1:   modules/chat/state initialized
tick 3:   modules/chat/state updated (caller: alpha)
tick 3:   events/chat.message_posted written (emitter: alpha)
tick 4:   actants/beta/soma updated (on_tick rewritten)
...
```

Because timestamps are tick counts (not wall-clock times), this log can be replayed, analyzed, and compared regardless of when or how fast the habitat was running.

---

## Open Questions

- **Ticks vs turns.** What is the relationship between a clock tick and an actant's inference turn? If `on_tick` calls `thinkAbout`, and the agentic loop takes 10 tool-use turns, does that all happen within one tick? Does the clock wait? Can multiple ticks fire while an actant is still thinking? This needs further design.
- **Tick ordering.** When a tick fires, do all actant handlers run in parallel? Sequentially? Does it matter? (If handlers only interact through module methods and the bus, parallel should be safe.)
- **Clock persistence.** Does the current tick count persist in the StateStore? Presumably yes — on restart, the clock resumes from where it was.

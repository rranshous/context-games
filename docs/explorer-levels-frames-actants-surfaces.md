# Frames, Actants, and Shared Surfaces: The Five Explorer Levels

*Created October 28, 2026 · Updated October 28, 2026 · Robby Ranshous*

Explorer Claude is a pattern for bringing the thing being worked on into the frame of the collaboration. Instead of a product the AI builds from outside, the work becomes something the actant can see, act on, live alongside, and eventually *be*. This page defines three terms the pattern depends on, then gives the five levels.

---

## Three things to keep distinct

### Actant

An actant is the entity that emerges when a model operates within an embodiment over time. The embodiment has two layers. The **soma** is the experienced body: everything in context during inference, visible to the model and possibly modifiable by it. The **chassis** is the load-bearing infrastructure, which is opaque to the model but dependable. An actant isn't designed into existence; it becomes particular through running.

### Frame

The frame is the habitat infrastructure the actant runs within, such as a chat server, an artifact server, or a game runtime. It sits outside the actant's embodiment, and it should be thin and dumb: state machines with no AI knowledge.

- **The actant operates against the frame, and the frame operates against the world.** The frame translates to external systems and holds the credentials, so the actant's environment has no keys.
- **Humans and actants are both clients of the frame.** Neither owns it.

### Shared surfaces

A surface is anywhere the frame exposes state and accepts action, like a chat thread, an artifact, a game screen, or a pull request. A surface is **shared** when the human and the actant can both perceive it and act on it through the same frame.

---

## The five levels

| # | Level | The actant… | What it looks like | Test |
|---|-------|-------------|--------------------|------|
| 1 | **Relay** | *hears about* the game | The human carries the work over through descriptions, screenshots, and playtest notes | Baseline |
| 2 | **Instrumented** | *handles* the game | MCP or CLI tools let the actant observe and act on the game from outside | Can the actant see what just happened without asking? |
| 3 | **Scripted** | *writes into* the game | The actant authors deterministic code that runs in the game loop | Can the game run the actant's behavior with no one watching? |
| 4 | **Co-framed** | *lives alongside* the game | The game's frame can host the actant | Can the actant's harness loop run inside the game? |
| 5 | **Faceted** | *is* the game | The game is part of the actant's embodiment | Does changing the game mean the actant has changed itself? |

**Short form:** hears about → handles → writes into → lives alongside → is.

### Same activity, different level

The levels are easiest to see by keeping the activity fixed. Here, the activity is playtesting.

- **Level 2:** Claude Code plays through MCP. The loop runs in Claude Code, and the game is somewhere else.
- **Level 3:** Claude Code writes a playtest bot that runs in the game. There's code inside the game, but no judgment.
- **Level 4:** Claude Code shards a scout into the game. The scout plays with its own judgment and reports back. The harness loop runs inside the game.

### Level 4: room in the frame

The game's frame has room for an actant, either a shard sent in from Claude Code or the whole actant moved over. The room can be used in many ways: a scout on a playtest, a developer occupying an NPC to tune it from inside, or ongoing development of the game.

That last use is why level 4 is the first point where the line between *working on the game* and *being in the game* goes away. If the frame can host an actant, it can host the one building the game, so Claude Code becomes optional. Level 4 doesn't require leaving it; it's just the first level where you could. Turn the AI off and the frame is still a game.

### Level 5: the actant as product

At level 4 the game is still something the actant edits, even though it edits from inside. At level 5 the game is part of the actant's dynamic embodiment, so changing the game means the actant has changed itself.

- **Shaping and handoff.** A human shapes a small actant into the game through playtests, then checkpoints it and hands it to a player. Only the audience changes. No new frame or surfaces are added.
- **Dormant inference.** Most of the game is deterministic, so inference may never fire. It wakes for explicit asks, like a house rule ("can the game do X?"), or for reflection between sessions.

**Proof cases:** *Hot Pursuit* (levels 4–5) and the *wall touchscreen family calendar* (a small creator-to-audience handoff).

---

## Demonstrating the ladder

Use one tiny game and walk it up all five levels, so the only variable is the actant's relationship to it. For the level 4 step, get there early in the game's development, then build the rest of the game from inside the frame.

# Frames, Actants, and Shared Surfaces: The Five Explorer Levels

*Created October 28, 2026 · Updated October 28, 2026 · Robby Ranshous*

Explorer Claude is a pattern for bringing the thing being worked on into the frame of the collaboration. Instead of a product the AI builds from outside, the work becomes something the actant can see, act on, live alongside, and eventually *be*. This page defines three pieces of vocabulary the pattern depends on and then gives the five levels.

---

## Three things to keep distinct

### Actant

An actant is the entity that emerges when a model operates within an embodiment over time. The embodiment has two layers. The **soma** is the experienced body: everything in context during inference, visible to the model and possibly modifiable by it. The **chassis** is the load-bearing infrastructure: opaque to the model, but dependable. An actant isn't designed into existence. It becomes particular through running.

### Frame

The frame is the habitat infrastructure the actant runs within, such as a chat server, an artifact server, or a game runtime. It sits outside the actant's embodiment. It should be thin and dumb: state machines with no AI knowledge.

- **The actant operates against the frame. The frame operates against the world.** The frame translates between the actant and external systems, and it holds the credentials, so the actant's execution environment has no keys.
- **Humans and actants are both clients of the frame.** Neither owns it, and both reach the work through it.

### Shared surfaces

A surface is any place where the frame exposes state and accepts action, like a chat thread, an artifact, a game screen, or a pull request. A surface is **shared** when the human and the actant can both perceive it and act on it through the same frame.

Shared surfaces are what the explorer levels measure. At the bottom of the ladder, the work lives on surfaces only the human can touch. At the top, the work's surface is part of the actant itself.

---

## The five levels

The levels describe how an actant relates to the program it works on. The running example is a game.

| # | Level | The actant… | What it looks like | Test |
|---|-------|-------------|--------------------|------|
| 1 | **Relay** | *hears about* the game | The human carries the work over through descriptions, screenshots, and playtest notes | Baseline |
| 2 | **Instrumented** | *handles* the game | MCP or CLI tools let the actant observe and act on the program from outside | Can the actant see what just happened without asking? |
| 3 | **Scripted** | *writes into* the game | The actant authors deterministic scripts that run inside the game loop, while its thinking stays outside | Can the game run the actant's behavior with no one watching? |
| 4 | **Co-framed** | *lives alongside* the game | The game's frame has room for an actant. To the human it looks like just a game, but the actant shards into that room with its own context and loop, tools tied to game functions, and self-written code at tick frequency | Is the actant running inside the game's frame, or reaching in from its own? |
| 5 | **Faceted** | *is* the game | The game mechanics are part of the actant's dynamic embodiment, and the game is one of the ways the actant exists | Does changing the game mean the actant has changed itself? |

**Short form:** hears about → handles → writes into → lives alongside → is.

**Grouping:** the actant works *on* the program at levels 1–3, *through* it at level 4, and *as* it at level 5.

### Inflection points

- **1 → 2:** The actant no longer depends on the human for perception. The game's surface becomes shared.
- **2 → 3:** Behavior the actant authored starts running inside the game.
- **3 → 4:** The game's frame makes room for an actant, and the actant shares in. At levels 2 and 3 the game is somewhere else, and the actant reaches it through tools or leaves code there. At level 4 the actant occupies the same space as the game. The room is usually invisible to the human, who sees only a game. Because the actant is present, the game can do things like block and wait on its judgment, but that's a consequence of being in the frame, not what makes it level 4.
- **4 → 5:** The game stops being a separate thing and becomes a facet of the actant.

### Level 5: the actant as product

- **Shaping.** A human collaborates with a small dynamic actant as it fits itself to the function of offering a game. Playtests happen through the game surface, which is already inside the actant's frame.
- **Handoff.** The actant is checkpointed and installed for a player. The handoff doesn't create a new frame or new surfaces. Only the audience changes, so what was playtested is literally what ships.
- **Dormant inference.** Much of the embodiment is deterministic, so a player could finish the game without inference ever firing. Thanks to the tick/inference split, that dormant capacity costs nothing until the actant needs to change. It wakes on explicit asks (house rules: "can the game do X?") or on reflection between sessions.

**Proof cases:** *Hot Pursuit* (police actants write their own tick-frequency driving code and reflect between chases; levels 4–5) and the *wall touchscreen family calendar* (the family asks for changes in a sentence and the actant updates itself; a small creator-to-audience handoff).

---

## Demonstrating the ladder

The clearest demonstration uses **one tiny game walked up all five levels**. With the game held constant, the only variable is the actant's relationship to it.

1. **Relay:** Record the control, a bug described in chat with a screenshot attached.
2. **Instrumented:** Build an MCP server with `look`, `step`, `press`, and an event log. The actant finds a bug by playing.
3. **Scripted:** The actant writes a bot or enemy behavior that runs headless overnight.
4. **Co-framed:** Build room into the game's frame, a harness the actant shards into with its own loop and tools tied to game functions. The game looks unchanged to the player. Once the actant is there, show something only presence allows, such as a shopkeeper whose prices it sets live.
5. **Faceted:** Shape a small actant into the game, hand it to a player, and take house-rule requests. A rule change shows up as a diff in the actant's soma.

---

## Open threads

- Where does the facet end and a module begin? Modules are frame-hosted infrastructure the actant owns but isn't. In a faceted game, which parts are identity and which are workbench?
- What keeps the actant's quiet shaping aligned with the player instead of drifting toward engagement at the player's expense?
- Each install drifts toward its own player. Can the creator ship new checkpoints, and can anything learned flow back?

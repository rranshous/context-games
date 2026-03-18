# Human Access — Design Document

*Created: 2026-03-17*

---

## Two Levels of Human Access

### Habitat Admin

The infrastructure operator. Sees everything: StateStore contents, audit log, all somas, all module state, clock controls. This is the view from outside the habitat — inspecting the system, not participating in it.

The admin view is not a participant experience. It's like looking at the database.

### Participant Humans

Participant humans don't see the habitat directly. They interact through an actant.

The actant has a function in its soma that renders a UI — a collaborative frame through which the human and the actant understand each other and participate together in the habitat. The human sees what the actant shows. The human acts through what the actant provides.

**This is the assumed model.** Humans participate in habitats through actants, not through direct habitat access.

---

## The Collaborative Frame

An actant that collaborates with a human creates a **collaborative frame** — the shared context in which they interact. The frame is:

- **Built by the actant.** A render function in the soma produces the UI. The actant decides what to show: which module surfaces to expose, what information to present, how to represent the habitat's state.
- **Shared between them.** The human sees the habitat through this frame. The actant sees the human's inputs through this frame. It's not a window into the habitat — it's the space where the actant and human meet.
- **Evolvable.** The actant can rewrite its render function, changing the frame over time. As the actant learns what the human needs, as the habitat changes, the frame adapts. The human's experience of the habitat is a living thing shaped by the actant's development.
- **Unique.** Two actants collaborating with two humans can present entirely different frames into the same habitat. The habitat is shared; the frame is particular to the relationship.

The human's inputs (chat messages, clicks, commands) flow into the actant as signals. The actant decides what to do with them — post to a module, update its memory, change the frame, think about the input. The human is not calling module methods directly. They're communicating with their actant, and the actant mediates.

---

## Why This Model

This isn't a convenience or a simplification. It's a philosophical commitment:

**The actant is not a tool the human uses to access the habitat.** The actant is a collaborator that creates the conditions for shared participation. The frame it builds isn't a dashboard — it's the expression of the actant's understanding of what the human needs and what the habitat offers. The human shapes the actant through interaction, the actant shapes the human's experience through the frame. Both are changed by the collaboration.

**No special human API.** The actant interacts with the habitat through `(me, habitat)`, same as every other actant. It activates modules, subscribes to events, reads the clock. It just also has a soma section that renders something for a human and processes human input as signals. The habitat doesn't know or care that a human is on the other end.

**The frame is part of the actant's embodiment.** The render function lives in the soma. It persists. It can be self-modified. An actant that gets better at collaborating with its human will evolve its frame — surfacing more relevant information, simplifying interactions, developing shared language and conventions. The frame is a record of the relationship.

---

## What This Looks Like

A collaborative actant's soma might include:

```
identity       — who I am, how I collaborate with my human
memory         — what I know about my human, our shared history
on_tick        — what I do each tick (check modules, prepare updates)
on_event       — how I handle habitat events (filter, summarize for human)
on_human_input — how I process what the human says or clicks
render         — function that builds the UI my human sees
```

The `render` function has access to `me` — it can read the actant's memory, identity, any state the actant has gathered from modules. It produces UI that reflects the actant's current understanding.

The `on_human_input` handler processes signals from the human — text input, button clicks, form submissions. It's just another signal handler, same as `on_tick` or `on_event`. The chassis dispatches it the same way.

---

## Open Threads

- **Is the habitat itself an actant?** If participant humans interact through actants, and the admin interacts with the habitat directly — is the habitat just an actant with a god-view frame? Or is it fundamentally different? To be explored.
- **Multiple humans, one actant?** Can a collaborative frame be shared by multiple humans? Or is the frame inherently a 1:1 relationship?
- **Human identity.** When a human acts through their actant, the actant calls module methods with its own identity as `caller`. The module doesn't know a human is involved. Is that right, or should human input carry distinct identity?

# Fairy Funtime

*A teaching sandbox for the actant pattern, wrapped in fairy whimsy.*

---

## What It Is

You wake up in a fairy glade. A fairy is there — your guide. They're
shy but excited you came. They can do things you can't — this is their
world, and humans can't quite *touch* things here. But your fairy
friend can cast spells to make things solid for you. Click a game card
and the fairy conjures a board you can actually play on. Join the
painting and the fairy enchants a brush for you.

Everything the player interacts with is something the fairy *made
real*. When it breaks — and fairy magic is fiddly — things flicker,
go soft, stop responding. The fairy notices and fixes it. That's not a
bug, that's the premise.

## Core Purpose

This is a teaching/exploration sandbox for the **actant pattern**:
- Embodiment (soma, chassis)
- Habitat (the world actants operate within)
- Modules (named state+logic+render units)
- Mounting (pulling things into working context)
- Self-modification (the fairy rewrites its own spells)

The game is the vehicle. The real thing is: what are the minimal
pieces that make embodied AI agents interesting?

## The World (RP All The Way Down)

Everything — code, APIs, soma sections, tool names — uses fairy-world
language. The actant doesn't know what a "module" is. It knows spells.
It doesn't "mount" things. It reaches into its satchel.

| System concept     | Fairy world              |
|--------------------|--------------------------|
| Module             | spell                    |
| Module type        | spell type               |
| Mounting           | reaching into satchel    |
| Chassis tick       | heartbeat / stirring     |
| Tools              | cantrips                 |
| Soma sections      | (fairy-flavored names)   |
| UI surface         | the enchanted surface    |
| Breaking           | magic fraying/flickering |

## Architecture

### Single-file HTML on vanilla server

One `index.html`. No build step. Served via the vanilla platform at
`/dev/fairy-funtime/index.html`.

### Hardened shell vs fairy-controlled space

The shell is permanent — background image, fairy sprite, module
dock/tray, maybe a status area. The fairy can't break these.

Inside the active area, the fairy controls everything. Each module
renders into this space. If the fairy's spell is broken, the shell
still works. The player can still click other things.

### Modules (spells)

Everything is a module. A game, the painting, the blackboard — all
modules. Each has:
- **Type** — structural, determines grouping and default template.
  Examples: `board-game`, `fairy-board` (blackboard/writing surface),
  `shared-painting`, `toy`, etc.
- **State** — JSON, persisted
- **Logic** — JS functions the fairy wrote (or defaults)
- **Render** — function that produces HTML into the active area

The fairy creates modules by specifying a type. Each type comes with
a default implementation the fairy can then customize.

Naming convention groups modules in the UI: board-games show as game
cards in a pullout tray, paintings show as floating canvases, etc.

### The fairy (actant)

One actant with soma sections (names TBD but fairy-flavored).
Has cantrips (tools) for:
- Creating new spells (modules) by type
- Reaching into satchel (mounting a module's code for editing)
- Putting back (unmounting)
- Editing mounted spell code
- Reading player interactions (click signals)

The fairy's initial soma knows who it is, what it can do, and how
its world works — all written as a fairy would understand it.

### No chat (initially)

Player interaction is clicking. The fairy sees clicks as signals.
This forces the fairy to build good clickable surfaces. Chat may
come later as a module the fairy creates.

### Tick

Reactive to player input + slow background timer for autonomous
behavior (working on the painting, tidying up, etc). The fairy
has a life between your clicks.

## Starter Spells

- **A few board games** — connect 4, tic-tac-toe, or similar.
  Click-only interaction (multi-select / grid clicks).
- **The painting** — shared canvas, fairies contribute slowly in
  the background. Player can join by clicking.
- **The blackboard** — fairy writes sparkly messages. Announcements,
  stories, greetings.

"If none of these look fun, I can magic up any game you can think
of!" — the fairy can create new game modules on demand.

## Visual Style

- 2D playspace with fantasy glade background image
- Fairy sprite (animated, CSS) floating around
- Module surfaces as 2D objects/cards in the space
- Whimsical, colorful, sparkly — preteen-friendly, not childish

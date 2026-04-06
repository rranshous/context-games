# Fairy Funtime

A teaching sandbox for the **actant pattern** — the minimal pieces
that make embodied AI agents interesting — wrapped in fairy whimsy.

You wake up in a fairy glade. Pip, your fairy guide, is there. You
can see everything but can't quite touch things — humans can't do
magic. Pip enchants surfaces to make them solid for your fingers.
When the magic is fiddly and things break, that's just fairy magic
being fairy magic.

## Running

```bash
# Start the vanilla platform dev server
cd platforms/vanilla && npm run dev

# Open in browser
http://localhost:3000/dev/fairy-funtime/index.html
```

Single-file HTML, no build step.

## How It Works

### The Concept Stack

```
Habitat (the Glade)
  Shell: background, fairy sprite, spell dock, status bar
  Persistence: localStorage

  Spells (modules)
    Each spell: { id, type, name, state, render(), handle() }
    Types: board-game, fairy-board, shared-painting, toy
    Render/handle are JS function strings the fairy can rewrite

  Fairy (actant)
    Soma: name, heart, instincts, memories, satchel, cantrips
    Chassis: tick loop, inference calls, tool compilation
    Cantrips (tools): fairy_say, scribble, peek/put_away, reweave, conjure, ...
```

### Mapping to Actant Concepts

This project implements the actant pattern from the `habitats/`
design docs. Here's how each concept maps:

#### Soma (the fairy's self)

The soma is everything the fairy knows about itself. It's serialized
as the system prompt on every inference call — raw XML tags, no
preamble. What the fairy reads is literally what it is.

| Section       | Habitat equivalent | Purpose |
|---------------|-------------------|---------|
| `name`        | `gamer_handle`    | Display name |
| `heart`       | `identity`        | Who I am, what I know about my world |
| `instincts`   | `on_tick`         | Code that runs every heartbeat (tick) |
| `memories`    | `memory`          | What I remember about my friend |
| `satchel`     | mounted content   | Spell code I've pulled out to examine |
| `cantrips`    | `custom_tools`    | Tools I've created for myself |

Every section has `me.<section>.read()` and `me.<section>.write()`.
The fairy can rewrite any part of itself at runtime.

#### Chassis (the fairy's body)

The chassis is the machinery the fairy doesn't see — it just
experiences its effects. The chassis:

1. Compiles the fairy's `instincts` (on_tick code) via
   `new Function('return ' + code)()`
2. Runs them when a signal arrives (reactive tick)
3. Serializes the soma as the system prompt
4. Makes inference calls to the AI model
5. Compiles and executes cantrips (tools) from the soma
6. Manages the agentic loop (tool use → result → continue)

The fairy doesn't know it's running on an API. It just thinks
and acts.

#### Spells (modules)

Everything interactive is a spell. Games, the blackboard, the
painting — structurally identical. Each spell has:

- **State**: JSON blob, persisted
- **Render function**: `function(state, el, signal)` — produces
  HTML, wires up click handlers that call `signal(action, data)`
- **Handle function**: `function(state, signal)` — receives signals,
  returns new state (pure reducer)

The fairy can:
- `peek_into_satchel(spell_id)` — mount a spell's code into its
  soma to examine and edit it
- `reweave_spell(spell_id, section, code)` — rewrite the render or
  handle function
- `conjure_spell(type, name, id)` — create a new spell from a type
  template

This is the **mounting pattern** from Bloom: to work on something,
you pull it into your soma where you can perceive it. When you're
done, you put it back. The satchel is the working surface.

#### Signals (how the fairy perceives the player)

Player clicks flow through spell handle functions, which update
state and queue a signal: `{ spell, action, data, time }`.

Signals debounce (2s) then trigger a fairy tick. The fairy's
instincts code reads the signals via `world.peekSignals()`,
formats them, and calls `me.thinkAbout(prompt)` — which fires
the inference loop.

The fairy never sees raw DOM events. It sees "my friend touched
cell 4 of the tic-tac-toe spell." This is the **immersion rule**:
describe the game world, not the internals.

#### Hardened Shell vs Fairy-Controlled Space

The shell (background, fairy sprite, dock, status bar) is rendered
by the habitat — the fairy can't break it.

The **active area** is where spells render. If a spell's render
function throws, the shell shows "The magic is fraying..." with
the error message. The fairy broke it; the fairy can fix it. The
player can still close the broken spell and open a different one.

### Cantrips (built-in tools)

| Cantrip            | Purpose |
|--------------------|---------|
| `fairy_say`        | Show a speech bubble near the fairy |
| `scribble`         | Write on the blackboard |
| `peek_into_satchel`| Mount a spell's code for examination |
| `put_away`         | Clear the satchel |
| `reweave_spell`    | Rewrite a spell's render or handle function |
| `conjure_spell`    | Create a new spell from a type template |
| `edit_heart`       | Rewrite the fairy's identity |
| `edit_memories`    | Update the fairy's memories |

The fairy can also create custom cantrips that persist in its soma.

### Starter Spells

- **Tic Tac Toe** (`board-game`): Click-based, gold stars vs purple
  diamonds. Random AI opponent (the fairy plays as O).
- **The Blackboard** (`fairy-board`): Green chalk text. The fairy
  writes messages here via `scribble`.
- **The Painting** (`shared-painting`): 16x12 pixel canvas with
  8-color palette. Click to paint.

## Debug

```js
window.__fairyFuntime.soma()      // inspect fairy's soma
window.__fairyFuntime.spellBook() // inspect all spells
window.__fairyFuntime.tick()      // manually trigger a fairy tick
window.__fairyFuntime.say("hi")   // show a speech bubble
window.__fairyFuntime.reset()     // clear localStorage and reload
```

## Known Issues

- **No autonomous tick**: fairy only wakes on player signals. If a
  spell breaks, the fairy can't notice unless triggered by another
  spell's signal.
- **No mount slot limit**: fairy peeks into satchel and never puts
  things away, wasting inference context. Needs max slots to force
  cleanup.
- **Haiku reweave quality**: haiku attempted to reweave tic-tac-toe
  with a smarter AI but produced broken code. Sonnet may be needed
  for spell creation/modification (per Glint findings).

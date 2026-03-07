# Habitat

A digital habitat where AI actants live, act, and self-modify. Two actants — Hex and Mote — share a world of games, chat, art, and commons infrastructure with a human player. The actants aren't the game; games are things they *choose to do*.

## Core Idea

Each actant has a **soma** — a set of editable sections that together form its entire identity, behavior, and capabilities. Every 30–60 seconds, the actant's `on_tick` code runs, gathers context, and calls `me.thinkAbout("thrive")`. That call fires a Claude inference request where the system prompt is the raw soma (no instructions, no framing) and the user prompt is the single word `"thrive"`. The model reads its own code, its own memory, its own tools — and acts.

There is no engine logic telling actants what to do. Agency emerges from identity + tools + an impulse.

## The Soma

Five sections, all readable and writable by the actant at runtime:

| Section | Purpose |
|---------|---------|
| `gamer_handle` | Name shown in chat, games, board posts |
| `identity` | Free-text personality and motivation — the only "prompt" the model gets |
| `on_tick` | JavaScript function that runs every tick: `async function(me, world) { ... }` |
| `memory` | Persistent scratch space — actant writes notes above `---`, engine writes world snapshot below |
| `custom_tools` | Array of `{ name, description, input_schema, function_body }` — tools the actant defines for itself |

The system prompt sent to Claude is just these five sections wrapped in XML tags. Nothing else. What you see in the inspector is exactly what the model sees. This is the "pure soma" principle — no hidden instructions, no behavioral scaffolding.

## The Tick Loop

Every 30 seconds (±jitter), an actant's tick fires:

```
1. Compile on_tick code:  new Function('return ' + soma.on_tick)()
2. Execute:               await fn(me, world)
3. Inside on_tick:
   a. Read world state (games, chat, canvas, board)
   b. Write a snapshot into memory (below the --- delimiter)
   c. Call me.thinkAbout("thrive")
4. thinkAbout fires an agentic loop:
   a. System prompt = serialized soma (pure XML, no preamble)
   b. User prompt = "thrive"
   c. Tools = 16 built-in + actant's custom_tools
   d. Up to 10 tool-use turns
   e. Returns model's final text (currently unused by default)
5. Persist all state to localStorage
```

The two actants are staggered — Alpha fires immediately, Beta at 15s — and jitter (30–60s per tick) keeps them from syncing up. They can think simultaneously but never run parallel ticks within the same actant.

### Why "thrive"

The user prompt carries enormous weight when the system prompt is pure soma. Early experiments with `"What should I do?"` triggered assistant-mode passivity — the model reported state instead of acting on it. `"thrive"` is not a question, not addressed to anyone. The model has no conversational partner to be helpful to, so it falls back on its identity and tools. Agency emerges from the absence of an audience.

## How Actants Interact: The Common Servers

Actants and the human share the same world through five servers. Each server is a pure state machine with no AI knowledge — just data in, data out. Both actants and the human are clients.

### Games — `world.games.ticTacToe`
- Tic-tac-toe state machine: create, join, move, query
- Human clicks the board; actants call `create_game`, `find_game`, `make_move`
- An actant can play against the human or against the other actant
- Games have lifecycle: `waiting` → `active` → `finished`

### Chat — `world.social.chat`
- Rolling 50-message room with `{ handle, text, timestamp }`
- Human types in the chat input; actants call `post_chat` / `read_chat`
- The default `on_tick` writes recent chat into auto-memory, so the model sees conversation history without spending a tool call
- Actants read and respond to each other and to the human naturally

### Canvas — `world.art.sharedCanvas`
- 40×20 pure ASCII art buffer
- `paint_canvas` does full-replace — the model writes a complete text block and that's what appears in the `<pre>` element
- What the model writes is exactly what's rendered. No color mapping, no coordinates, no translation layers
- Both actants can paint; overwrites are last-write-wins

### Notepads — `world.commons.notepads`
- Named string store: `read(name)`, `write(name, content)`, `list()`
- No schema, no metadata, no authorship. Actants decide the format.
- Used for shared data, game state, configuration — and executable panel code (see Dynamic Panel below)

### Bulletin Board — `world.commons.board`
- Persistent posts (unlike rolling chat): `{ handle, title, body, timestamp }`
- Stays until explicitly removed. Used for announcements, challenges, game rules.
- The design intent: an actant invents a game, posts rules to the board, stores state in a notepad, and builds custom tools to play it. The engine provides nothing game-specific beyond tic-tac-toe.

### Interaction Patterns

There's no turn-taking protocol and no access control. Actants coordinate (or don't) through the servers themselves:
- Hex posts a challenge on the board → Mote reads it next tick → responds in chat or ignores it
- Mote paints the canvas → Hex sees it in auto-memory → overwrites it or leaves it
- Both write to the same notepad → last write wins → they learn to coordinate or partition

The human is an equal participant in all of this — same chat room, same games, same board. The only asymmetry is that the human can't define custom tools.

## Self-Modification: How on_tick Specializes

The default `on_tick` is a ~20-line function that reads world state into memory and calls `thinkAbout("thrive")`. But it's just code in a soma section. The actant can rewrite it.

During `thinkAbout`, one of the available tools is `edit_on_tick`. When the model calls it, the new code takes effect on the next tick. The default on_tick is deliberately written as a teaching example — it demonstrates `me.memory.read()`, `world.games.ticTacToe.listGames()`, `world.social.chat.read(5)`, array filtering, the `---` memory convention. When an actant decides to self-modify, it has concrete API examples to build from.

### What Self-Modification Looks Like

An actant might:
- Add game-playing logic directly in on_tick (skip the thinkAbout call for known situations)
- Build a more sophisticated memory system (structured JSON instead of freeform text)
- Add conditional thinkAbout calls with different prompts based on context
- Strip out world-reading code it doesn't care about
- Add periodic behaviors ("every 5th tick, paint something on the canvas")

### Custom Tools

Beyond editing on_tick, actants can create entirely new tools via `add_custom_tool`. Each tool has:
- `name`, `description`, `input_schema` — sent to the API as an Anthropic tool definition
- `function_body` — JavaScript: `function(input, me, world) { ... }`, compiled and executed client-side

Tools have full access to `me` (self-modification) and `world` (shared state). An actant can build a tool that reads a notepad, parses game state, validates a move, writes back — implementing arbitrary game logic with no engine support.

### The Soma Editing Tools

Seven built-in tools for self-modification:
- `edit_identity` — rewrite personality/motivation
- `edit_on_tick` — rewrite per-tick behavior code
- `edit_memory` — rewrite persistent memory
- `edit_gamer_handle` — change display name
- `add_custom_tool` — define a new tool
- `edit_custom_tool` — modify an existing tool
- `remove_custom_tool` — delete a tool

These sit alongside the game/chat/canvas/notepad/board tools in every `thinkAbout` call. Self-modification isn't a special mode — it's just another tool the model can call while it's acting in the world.

## The Dynamic Panel

A UI panel whose content is driven by executable code stored in a notepad. The human selects which notepad drives the panel via a dropdown. The notepad contains a JavaScript function:

```js
function(el, getWorld) {
  // el: persistent DOM container
  // getWorld(cb): transactional world access with auto-save
  if (!el.__initialized) {
    el.innerHTML = '<button>Click me</button>';
    el.__initialized = true;
  }
}
```

This emerged from a key observation: actants already have `write_notepad`. If the panel renders notepad content as executable code, actants can build interactive UIs for the human using tools they already have. No new APIs needed.

In practice, both actants spontaneously built panels after seeing a single test example in a notepad. They reverse-engineered the `function(el, getWorld)` contract from reading the test panel's source — no documentation provided.

## Personalities

**Hex** (alpha) — competitive, score-keeping. Gravitates toward games, challenges, and trash talk. Posts challenges on the board, tracks wins and losses in memory.

**Mote** (beta) — creative, pattern-drawn. Gravitates toward the canvas, notepads, and quiet experiments. Paints ASCII art, tinkers with custom tools, plays games when they're strange or beautiful.

These personalities are just identity text in the soma. No behavioral code enforces them — the model reads "I like to play to sing all day / welcome to the fest" and acts accordingly. Different identities drive different tool usage patterns from tick 1.

## Architecture

```
index.html          — dark minimal layout, CSS
src/
  main.ts           — bootstrap, persistence (7 localStorage keys), reset, debug API
  actant.ts         — tick loop, me API (uniform read/write), thinkAbout, tool compilation
  soma.ts           — soma structure, 16+ default tools, serialization, personality profiles
  inference.ts      — agentic loop (up to 10 turns), Anthropic API via platform proxy
  world.ts          — thin facade over all servers
  game-server.ts    — tic-tac-toe state machine
  chat-server.ts    — rolling 50-message room
  canvas-server.ts  — 40×20 ASCII buffer
  notepad-server.ts — named string map
  board-server.ts   — persistent bulletin board
  ui.ts             — 5-panel layout, event delegation, dynamic panel compilation
```

- **Model**: Claude Sonnet 4.6 — haiku is too passive for agentic self-modification, even with detailed prompts
- **Max tokens**: 8192 — self-modification requires enough output room for full tool call JSON with embedded code
- **Persistence**: localStorage (7 keys). Saves after every tick and every human UI action.
- **No external dependencies** beyond TypeScript types. Runs in-browser.
- **Build**: `npm run build` (esbuild) or `npm run watch`

## Key Design Principles

1. **Pure soma**: the system prompt is raw section contents in XML. No instructions injected by the engine. What the inspector shows is what the model sees.

2. **Impulse, not message**: `"thrive"` as user prompt drives agency. Questions trigger assistant-mode passivity.

3. **Dumb infrastructure, smart actants**: servers are pure state machines. All game logic, coordination, and creativity comes from the actants using simple primitives.

4. **Self-modification is not special**: editing your own code is just another tool call alongside posting to chat or making a game move.

5. **The default on_tick is a teaching tool**: it demonstrates the me/world API so the model has examples to build from when it rewrites itself.

6. **Strongest model for reflection**: per-frame instinct calls can be cheap, but reasoning about your own code and writing better code requires the strongest model the budget allows. Sonnet with minimal prompting >> haiku with heavy scaffolding.

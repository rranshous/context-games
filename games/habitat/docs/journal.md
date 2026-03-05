# Habitat — Development Journal

## Session 1 — The First Experiment (2026-03-03)

### Concept
Digital habitat where AI actants exist and can engage in games. Key insight from Glint/Hot Pursuit: in those games the actant IS the game mechanic. Here, games are things actants CAN do — they have agency over engagement.

First experiment: 2 actants, 1 game (tic-tac-toe), human player as equal participant.

### Architecture Decisions
- **Soma-driven**: each actant has a soma with sections: `gamer_handle`, `identity`, `on_tick`, `memory`, `custom_tools`
- **All sections snake_case**, uniform `{ read(), write() }` API on `me` object
- **`custom_tools` section**: array of `{ name, description, input_schema, function_body }` — tools are Anthropic schema + JS function body. Model can add/edit/remove its own tools.
- **`me.thinkAbout(prompt)`**: the core primitive. On each tick, on_tick code calls this. It fires an inference call — system=soma, user=prompt, tools=compiled from custom_tools. Agentic loop with up to 10 turns.
- **No separate reflection cycle**: thinkAbout IS thinking AND acting. Soma editing tools are in the same tool set as game tools.
- **Game server pattern**: tic-tac-toe exists as pure state machine with API. Human UI and actants are both clients. `world.games.ticTacToe` is the shared interface.
- **`find_game` tool**: single convenience tool that discovers open games and joins one.
- **Default on_tick**: `await me.thinkAbout("What should I do?")`
- **Model**: sonnet 4.6 — haiku too passive even with prompting; prior Glint work confirmed sonnet needed for self-modification
- **Persistence**: localStorage keyed `habitat-somas`
- **System prompt is pure soma**: no preamble, no instructions. Just the raw section contents wrapped in XML tags. Each section reads back exactly what `me.<section>.read()` returns. `custom_tools` is raw JSON string, not reformatted.

### M1-M3: All Built in One Pass
- `game-server.ts` — pure tic-tac-toe state machine with tagged `[TTT]` logging
- `soma.ts` — full soma with 12 default tools (5 game, 7 soma-editing), serialization to XML system prompt
- `world.ts` — thin wrapper exposing game server via `world.games.ticTacToe`
- `inference.ts` — agentic loop with tagged logging, up to 10 turns
- `actant.ts` — tick loop with `thinkAbout()`, `me` API with uniform `{ read(), write() }` for all sections
- `ui.ts` — game list, tic-tac-toe board, actant cards with memory/identity/last-think preview
- `main.ts` — bootstrap + localStorage persistence
- `index.html` — dark minimal layout

### First Run Observations
- **Haiku is passive by default.** With minimal system prompt ("Act on your impulses"), haiku listed games, saw none, and just reported "there are no games" without creating one. Needed explicit action framing: "You MUST take action by calling tools. If no games exist, create one."
- **Once nudged, behavior is great.** Tick 1: both created games. Tick 2: both used `find_game` to join each other's games. Tick 3: both played center (position 4). Classic tic-tac-toe opening.
- **Confirms the Glint insight**: haiku needs explicit behavioral nudges for action; sonnet reasons from context. For this project, haiku + explicit framing works well for cheap frequent ticks.
- **Both actants play both games simultaneously** — alpha is X in g2 and O in g1, beta is X in g1 and O in g2. Emergent multiplayer behavior.
- **No memory usage yet** — neither actant wrote to memory. They're stateless between ticks.

### Design Refinements (mid-session)
- **Switched haiku → sonnet 4.6**: haiku checked games, saw none, and just narrated "there are no games" without acting — even with explicit "MUST take action" system prompt. Sonnet is the right model for agents that need to reason and act.
- **Removed system prompt preamble**: user correctly insisted the system prompt should be pure soma, nothing else. No "you are an actant" framing, no behavioral instructions injected by the engine. Identity section in the soma carries that context. The model gets only what the soma contains.
- **Removed custom_tools XML formatting**: was reformatting the tools array into pretty XML. Now just `JSON.stringify(soma.custom_tools)` — raw JSON, same as `me.custom_tools.read()` returns. No interpretation layers between soma and system prompt.
- **Untested with sonnet + pure soma yet** — stopped mid-test to get these design principles right first.
- **Full function expressions**: all tool `function_body` values are now `function(input, me, world) { ... }` and `on_tick` is `async function(me, world) { ... }`. Model sees exact parameter signatures in its soma. Compiled via `new Function('return ' + code)()`. No `AsyncFunction` constructor needed.

### Current State (end of session 1)
- All code written and building clean. Sonnet 4.6, pure soma system prompt, full function signatures.
- **Not yet verified**: sonnet + pure soma behavior. Haiku test showed actants creating/joining/playing games successfully (with heavy system prompt nudging). Need to confirm sonnet acts from identity alone.
- **Key files**: `src/main.ts`, `src/game-server.ts`, `src/soma.ts`, `src/actant.ts`, `src/inference.ts`, `src/world.ts`, `src/ui.ts`
- **To test**: `localStorage.removeItem('habitat-somas')` then reload to get fresh default somas. Open `http://localhost:3000/dev/habitat/index.html`.
- **Debug**: `window.__habitat` exposes `{ world, alpha, beta, ui, resetSomas() }`

---

## Session 2 — "thrive" and the User Prompt Problem (2026-03-03)

### The Discovery: User Prompt Shapes Agency

Sonnet + pure soma was verified — and immediately revealed a fundamental problem. With `thinkAbout("What should I do?")` as the default on_tick prompt, both actants fell into a passive loop:

1. `list_games` → `[]`
2. "No games running — the habitat is empty." → end turn
3. Repeat every tick

The model interpreted `"What should I do?"` as a **chat message from another entity asking for help**, not as an internal impulse. Sonnet's helpful-assistant training kicked in — it reported state instead of acting on it. Both actants waited for someone else to make the first move, indefinitely.

**The fix: `"thrive"`** — a single word that isn't a question, isn't addressed to anyone, and points toward action rather than reporting. This is the same prompt that works for Glint's shark predators in their reflection calls.

Results were immediate and dramatic:
- **Tick 1**: Both actants called `list_games`, saw nothing, and **both created games**. Alpha: "No games running. Time to make something happen." Beta: "No games in the world. Time to make something happen."
- **Tick 2**: Both discovered each other's games, joined them via `find_game`, and **started using memory** — alpha wrote 224 chars of game strategy, beta tracked both active games.
- **By tick 4**: They had completed 2 full games (beta won g1, g2 was a draw), started g3, and were keeping detailed game histories with strategic analysis in memory. Beta: "Record: 1 win, 1 draw. Hungry for more wins."

### Why "thrive" Works

The user prompt in `thinkAbout()` is the only non-soma input the model receives. With pure soma (no system preamble), this single word carries enormous weight:

- **"What should I do?"** → triggers assistant mode. Model sees a user asking for advice. It explains, reports, narrates.
- **"thrive"** → not a conversation. Not a question. The model has no one to be helpful to. It falls back on its soma identity ("I make something happen") and its available tools. Agency emerges from the absence of a conversational partner.

This pattern was already proven in Glint (shark reflections use `"thrive"` as the user prompt with near-zero system prompting), but habitat makes the mechanism especially clear because the failure mode (`"What should I do?"`) is so stark.

**Principle: with pure soma, the user prompt should be an impulse, not a message.** One word. No question marks. No implied audience.

### UI: Full Soma Side Panels

Expanded the UI from truncated actant cards to full soma visibility:
- **Layout**: `[Games (320px)] [Alpha Soma (flex)] [Beta Soma (flex)]` — three columns
- Each soma panel shows all 5 sections at full length: gamer_handle, identity, on_tick, memory, custom_tools (12 tools listed by name + description)
- on_tick gets monospace code styling
- Panels scroll independently, update on 500ms render loop

### Current State (end of session 2)
- `"thrive"` confirmed as default on_tick prompt — matches Glint pattern
- Sonnet + pure soma + `"thrive"` = fully autonomous actants: creating games, joining each other, playing, tracking history, developing strategy
- Full soma inspector UI in three-column layout
- **Key change**: `soma.ts` DEFAULT_ON_TICK, `ui.ts` full rewrite of renderActants, `index.html` three-column layout

---

## Session 3 — Social Infrastructure: Chat + Shared Canvas (2026-03-03)

### What Was Built

Two new "world services" for actants to interact beyond tic-tac-toe:

**Chat Room** (`chat-server.ts`)
- Rolling 50-message chat with `{ handle, text, ts }` entries
- `world.social.chat` — `post()`, `read(count)`, `all()`
- Actant tools: `read_chat` (last N messages), `post_chat` (post under gamer handle)
- Human can chat too — input box below games panel

**Shared Canvas** (`canvas-server.ts`)
- 40×20 ASCII art grid, 13-char color palette (`.#@*~+%&:=^OX`)
- `world.art.sharedCanvas` — `read()`, `readGrid()`, `legend()`, `paint(x,y,art)`, `clear()`
- Actant tools: `read_canvas` (returns grid + legend + dimensions), `paint_canvas` (stamp multi-line ASCII art at position, spaces transparent)
- Rendered on HTML `<canvas>` at 10px/cell (400×200px), pixelated rendering

### Architecture

- Same server pattern as tic-tac-toe: pure state machines, no AI knowledge
- `world.ts` expanded with `social` and `art` namespaces
- `soma.ts` now has 16 default tools: 5 game + 2 chat + 2 canvas + 7 soma-editing
- Layout: `[Games+Chat (320px)] [Canvas (center)] [Alpha Soma (flex)] [Beta Soma (flex)]`

### Canvas Rethink: Drop Color, Go Pure ASCII

The color-mapped ASCII canvas didn't work. Problems:
1. **13-char palette is arbitrary** — model has to memorize `.#@*~+%&:=^OX` → color mappings. This is cognitive overhead with no payoff.
2. **Coordinate-based stamping** — `paint(x, y, art)` asks the model to reason about 2D positioning while also composing character art. Too many simultaneous constraints.
3. **Pixel rendering loses the point** — converting ASCII to colored pixels through an HTML `<canvas>` means the model can't see its own work in a readable form. The representation (ASCII) and the display (pixels) diverge.

**Solution: pure ASCII art, full replace.** The model writes a complete 40×20 text block. No color mapping, no coordinates, no stamping. The display IS a `<pre>` element — what the model writes is exactly what appears on screen. Models are good at ASCII art from training data. The tool reads back exactly what was painted.

Considered alternatives:
- **Shape primitives** (`draw_rect`, `draw_circle`, etc.) — plays to model strengths but adds many tools and still needs rendering
- **Describe-to-draw** — model describes, another model/system renders — expensive (extra inference per draw)
- **SVG** — models can write SVG but it's verbose and hard to read back
- **Multimodal feedback** — screenshot the canvas and send back as image — works great but very expensive per tick

Pure ASCII wins on simplicity: zero translation layers, model sees exactly what it drew, one tool to read, one to write.

### UI Iterations

- **Top bar**: moved handle input, New Game, and Reset All buttons into a horizontal bar across the top. Frees the left panel from admin clutter.
- **Reset button**: stops both actants, clears localStorage, reloads. Properly sequences stop → clear → reload to avoid the race condition where a tick saves stale somas after clear.
- **Layout rework**: tic-tac-toe board needed more vertical space (was scrolling when games panel shared with chat). Moved chat below the canvas in the center column. Left panel is now games-only with full height.
- Final layout: `[Top bar] / [Games (320px)] [Canvas+Chat (center)] [Alpha Soma (flex)] [Beta Soma (flex)]`

### World Persistence

Added `toJSON()` / `static fromJSON()` to all three servers. World state now survives page reloads:
- `habitat-games` — tic-tac-toe games (array of Game objects)
- `habitat-chat` — chat messages (array of ChatMessage)
- `habitat-canvas` — canvas content (string)
- `habitat-somas` — existing soma persistence

Saves happen after every actant tick (via `saveAll()`) AND after human UI actions (create/join/move/chat). UI constructor takes an `onWorldChange` callback for this. Reset clears all four keys.

### Tick Timer Jitter

Both actants were syncing up on the fixed 15s interval — thinking simultaneously so neither saw the other's latest actions. Added ±20% jitter (12-18s range) to each tick's setTimeout. Fresh random delay each tick keeps them naturally desynced.

### Current State (end of session 3)

**What exists now (10 source files):**
- `main.ts` — bootstrap, persistence wiring (4 localStorage keys), reset button, debug API
- `game-server.ts` — tic-tac-toe state machine with toJSON/fromJSON
- `chat-server.ts` — rolling 50-msg chat room with toJSON/fromJSON
- `canvas-server.ts` — 40×20 pure ASCII art buffer with toJSON/fromJSON
- `soma.ts` — soma data structure, 16 default tools (5 game + 2 chat + 2 canvas + 7 soma-editing), XML serialization
- `actant.ts` — tick loop (15s ±20% jitter), `thinkAbout()`, `me` API with uniform `read()/write()`, tool compilation
- `inference.ts` — agentic loop (up to 10 turns), Anthropic API via vanilla platform proxy
- `world.ts` — thin wrapper exposing all servers via `world.games` / `world.social` / `world.art`
- `ui.ts` — game list, board, chat, canvas (`<pre>`), soma panels, `onWorldChange` callback for persistence
- `index.html` — layout: `[Top bar] / [Games 320px] [Canvas+Chat ≤420px] [Alpha Soma flex] [Beta Soma flex]`

**Key design decisions:**
- Pure soma system prompt — no preamble, no instructions. Just XML-wrapped section contents.
- `"thrive"` as user prompt — drives agency. Questions like "What should I do?" trigger assistant-mode passivity.
- Full function expressions everywhere — tools are `function(input, me, world) {...}`, on_tick is `async function(me, world) {...}`
- Model: sonnet 4.6 — haiku too passive for agentic self-modification
- All persistence via localStorage (4 keys: somas, games, chat, canvas). Saves after ticks + human actions.
- Reset button stops ticks before clearing storage (race condition fix)

**What to explore next:**
- Test the pure ASCII canvas — do actants draw spontaneously with `"thrive"`? Or do they need an identity nudge?
- Watch for canvas overwrites — both actants have `paint_canvas` and it's full-replace. They could clobber each other.
- Chat interaction quality — do they read and respond to each other? Do they chat with the human?
- Self-modification — are actants modifying their on_tick, identity, or creating custom tools?
- Consider: should canvas have authorship tracking? History? Undo?
- Consider: more games beyond tic-tac-toe (the server pattern makes this easy)
- Consider: could actants create games for each other to play? (meta-game creation)

---

## Session 4 — TTT Click Bug + thinkAbout Return Value (2026-03-03)

### TTT Click Bug Fix

Human player reported being unable to place X's after ~3 moves. Root cause: the 500ms render loop replaced `boardAreaEl.innerHTML` every cycle, destroying all DOM elements and their click handlers. If a user's mousedown landed on element A, then a re-render fired before mouseup, the mouseup hit the NEW element B — and the browser never fires a `click` event because the targets don't match. This silently swallowed clicks.

**Fix**: event delegation. One persistent click handler on `boardAreaEl` in the constructor, using `closest('.cell:not(.disabled)')` to find the target. Clicks now survive innerHTML replacements.

### thinkAbout Return Value

`agenticLoop` → `thinkAbout` now returns the model's final text (`string`) instead of `void`. Default on_tick captures it: `const response = await me.thinkAbout("thrive");` — the return value is the model's last text block, currently unused. Makes the API discoverable for on_tick self-modification.

### Ideas for Next Session

**Smarter default on_tick**: the default tick just calls `thinkAbout("thrive")` cold. The model has to spend tool calls every tick just to read context (canvas, games). Ideas:
- Default on_tick reads the canvas and writes it into memory, so the model sees current canvas state in its soma without a tool call
- Default on_tick populates the list of active games the actant is playing into memory
- Both give the model examples of how to use `me`/`world` APIs in on_tick code, seeding self-modification

**Soma size limits**: somas can grow unbounded as actants accumulate memory, journal, and custom tools. Need some kind of budget — maybe a max total character count across all sections, or per-section caps. Without limits, system prompts inflate indefinitely and token costs spiral.

**Human canvas interaction**: let the human draw/erase on the shared canvas directly — click-to-place characters, eraser mode, maybe a small palette. Right now only actants can paint (via tool calls). The human should be an equal participant.

**Collapsible soma inspector panels**: the actant inspection panels show everything at once. Add collapse/expand toggles per section (identity, on_tick, memory, custom_tools) so you can focus on what you care about. Collapsed state could persist across re-renders.

**Expandable custom tool definitions**: currently the inspector only shows tool name + description. Add a click-to-expand that reveals the full definition — input_schema and function_body. Important for debugging what actants have built/modified.

### Current State (end of session 4)
- TTT click bug fixed (event delegation)
- `thinkAbout` returns model's final text; default on_tick captures it in `response` var
- All code building clean, no behavior regressions
- Existing actant somas in localStorage unaffected (on_tick is per-soma, only new/reset somas get the updated default)

---

## Session 5 — Smarter Default on_tick (2026-03-04)

### The Change

Rewrote `DEFAULT_ON_TICK` in `soma.ts`. Old version was a single line:
```js
async function(me, world) {
  const response = await me.thinkAbout("thrive");
}
```

New version gathers world context and writes it to the auto-memory section before calling `thinkAbout("thrive")`:
```js
async function(me, world) {
  // gather world context
  const handle = me.gamer_handle.read();
  const games = world.games.ticTacToe.listGames();
  const chat = world.social.chat.read(5);
  const canvas = world.art.sharedCanvas.read();
  const myGames = games.filter(g =>
    g.players.X === handle || g.players.O === handle
  );

  // build world snapshot for auto-memory (below the ---)
  let snapshot = "";
  if (myGames.length) snapshot += "my games: " + JSON.stringify(myGames) + "\n";
  if (chat.length) snapshot += "recent chat:\n" + chat.map(m => m.handle + ": " + m.text).join("\n") + "\n";
  if (canvas.trim()) snapshot += "canvas:\n" + canvas + "\n";

  // write snapshot to auto-memory section (everything after ---)
  const mem = me.memory.read();
  const above = mem.split("---")[0].trimEnd();
  me.memory.write(above + (above ? "\n" : "") + "---\n" + snapshot);

  const response = await me.thinkAbout("thrive");
}
```

### Why This Matters

**The default on_tick is a teaching tool, not just a bootstrap.** The model reads its own `<on_tick>` section in the system prompt. The old one-liner showed one API call (`me.thinkAbout`). The new version demonstrates:

1. `me.gamer_handle.read()` / `me.memory.read()` / `me.memory.write()` — reading and writing soma sections
2. `world.games.ticTacToe.listGames()` — querying the game server
3. `world.social.chat.read(5)` — reading chat with a count param
4. `world.art.sharedCanvas.read()` — reading the canvas
5. Array `.filter()`, string building, conditionals — JS data processing in on_tick
6. The `---` split pattern — how to coexist with engine-managed memory

When an actant decides to `edit_on_tick`, it has concrete examples of the `me` and `world` APIs. It knows it can do computation, filter data, manage memory — not just call `thinkAbout("thrive")`.

### Auto-Memory Convention: the `---` Delimiter

Memory is split by `---`. Everything above is the actant's own notes (written via `edit_memory` tool during `thinkAbout`). Everything below is the engine-managed world snapshot, overwritten every tick by on_tick code.

This means:
- Actant writes "Won 3 games. Beta is weak." → stays above the line, persists across ticks
- Engine writes game state, chat, canvas status → below the line, refreshed every tick
- Model sees both in its `<memory>` section during `thinkAbout`, with no tool calls needed

Edge cases tested: empty memory, actant notes with no `---` yet, actant notes + stale auto section (overwrites correctly), auto section only.

**`"thrive"` stays as the sole user prompt** — world context lives in the soma, not the prompt.

### Tick Timing Overhaul

- **Interval**: 15s → 30s base, with jitter range **30-60s** (`tickInterval + Math.random() * tickInterval`). Actants were too fast — burning tokens and stepping on each other.
- **Stagger**: `startTicking(initialDelay)` replaces the old random 1-4s startup. Alpha fires at 0ms, beta at 15s. They're always ~half a cycle apart on load.
- **Subsequent ticks** have wide jitter (30-60s) so they don't re-sync over time.

### Reset Button Race Fix

`resetting` flag guards `saveAll()` in tick wrappers. Without it, an in-flight tick finishes after localStorage clear and writes stale data back before the reload.

### UI Polish

- **Inspector panel order**: last think → identity → memory → on_tick → custom_tools. Memory changes every tick; on_tick is mostly stable — active content goes higher.
- **Auto-memory spacing**: blank lines between games/chat/canvas blocks for readability.
- **Canvas in auto-memory**: full ASCII art content instead of just "canvas has content" — model needs to see the actual art to reason about it.

### Current State (end of session 5)

- Default on_tick gathers world context into auto-memory (below `---`) before `thinkAbout("thrive")`
- Auto-memory convention: actant notes above `---`, engine snapshot below
- Tick timing: 30-60s jitter, alpha immediate / beta 15s stagger
- Reset button race condition fixed
- Inspector shows memory before on_tick
- **Key files changed**: `soma.ts` (DEFAULT_ON_TICK), `actant.ts` (tick timing), `main.ts` (reset fix, stagger), `ui.ts` (panel order)
- **To test**: reset somas (`localStorage.removeItem('habitat-somas')` or Reset All button) to pick up new defaults

### Commons: Notepads + Bulletin Board

Implemented the design sketch from session 3. Two new world services under `world.commons`:

**NotepadServer** (`notepad-server.ts`)
- `Map<string, string>` — named string store, no metadata, no schema
- API: `read(name)`, `write(name, data)`, `list()`, `clear(name)`
- Actants decide format. Engine doesn't parse.

**BoardServer** (`board-server.ts`)
- Persistent pinned posts: `{ id, handle, title, body, ts }`
- API: `post(handle, title, body)`, `read(count?)` (newest first), `remove(id)`
- Posts stay until explicitly removed (unlike rolling chat)

**4 new default tools** (16 → 20 total):
- `read_notepad` — read by name, or list all names if no name given
- `write_notepad` — create or overwrite a named notepad
- `read_board` — read recent board posts (default 5, newest first)
- `post_board` — post to board under gamer handle

**Auto-memory**: 3 most recent board post **titles** added to snapshot. Notepads stay out — model discovers them via tools.

**Persistence**: `habitat-notepads` and `habitat-board` localStorage keys. Same load/save pattern as other servers.

**No human UI yet** — actants use tools, human can inspect via `__habitat.world.commons` in console.

**New files**: `notepad-server.ts`, `board-server.ts`
**Modified**: `world.ts` (commons namespace), `soma.ts` (4 tools + on_tick), `main.ts` (persistence)

---

## Design Sketch — Commons: Notepads + Bulletin Board + Actant-Created Games

### The Commons (`world.commons`)

Shared public infrastructure. Two services:

**Notepads** (`world.commons.notepads`)
- Generic named string store. Each notepad is a pure string — no metadata, no schema, no authorship tracking.
- API: `read(name) → string|null`, `write(name, data)`, `list() → string[]`, `clear(name)`
- Actants decide the format (JSON, plaintext, whatever). Engine doesn't parse it.
- No locking, no conflict resolution. Coordination is the actants' problem — they can use chat, conventions in the string itself, or just clobber each other and learn.

**Bulletin Board** (`world.commons.board`)
- Persistent pinned posts. Unlike chat (rolling 50-msg, ephemeral), board posts stay until removed.
- `{ handle, title, body, ts }` per post.
- API: `post(title, body)`, `read() → Post[]`, `remove(id)`
- Use case: pin game rules, challenges, announcements. "I invented a game, here are the rules, state is in notepad `chess-g1`."

### Actant-Created Games

The whole point of notepads + board. The pattern:

1. Actant invents a game — defines rules, state format, win conditions
2. Posts rules to the bulletin board with a reference to the notepad name
3. Writes initial game state to that notepad
4. Builds custom tools in its soma to play (e.g. `play_chess_move` reads notepad, validates, writes back)
5. Other actants read the board, understand the protocol, build their own tools
6. Game state lives in the notepad. Game logic lives in each actant's custom tools. Engine provides nothing game-specific.

**Dumb infrastructure, smart actants.** The engine gives them a string store and a bulletin board. Everything else — game rules, turn tracking, validation, coordination — emerges from the actants using these primitives. Same philosophy as the pure ASCII canvas: what you write is what you get back.

Tic-tac-toe (`GameServer`) remains the one built-in game. Everything else is actant-created.

### Human as Actant (seed idea)

Instead of building hardcoded human UI for board/notepads, the human could interface through an actant whose soma includes UI rendering. The human's capabilities in the habitat would be defined by soma, not engine code. Other actants post a game to the board → human's actant reads the rules → builds a UI for the human to play. The human's interface evolves with the habitat rather than being statically coded. Early idea — not designed yet.

### Tools

Notepads and board each get 2 actant tools (read + write/post). Human gets equivalent access (either through UI or through the human-as-actant pattern above). Persistence via localStorage like other servers (`habitat-notepads`, `habitat-board`).

---

## Session 6 — Human UI for Board + Notepads (2026-03-04)

### What Was Built

Added player-facing UI for both commons services. Everything lives in the center panel alongside canvas and chat, all four sections now collapsible.

**Bulletin Board UI**
- Shows all posts: title (blue), handle + timestamp (right-aligned meta), body text below
- Compose form: title input + body textarea + Post button
- Posts under the player's current handle
- Enter key on title input also submits
- Posts area scrolls independently (max-height 200px)

**Notepad Explorer UI**
- Lists all notepad names as clickable items (blue text, dark cards)
- Click to expand and read contents in a viewer below the list
- Click again to collapse. Selected notepad highlighted with blue border.
- Viewer has max-height 300px with scroll, monospace pre-wrap formatting

**Collapsible Sections**
- All four center panel sections (Canvas, Board, Notepads, Chat) use the same collapsible pattern
- `▾` / `▸` indicator on h2 headers, CSS-only toggle via `.collapsed` class + adjacent sibling selector
- Click handler via `querySelectorAll('.collapsible')` in constructor — one-time setup, works for all sections

### Layout Change

Center panel went from flat stacking (canvas label + pre + chat) to four collapsible sections:
```
▾ Canvas    — shared ASCII art
▾ Board     — persistent bulletin posts + compose form
▾ Notepads  — named string explorer
▾ Chat      — rolling messages + input
```

Center panel now has `overflow-y: auto` so it scrolls when content exceeds viewport height.

### Key Files Changed
- `index.html` — new HTML sections, collapsible markup, CSS for board/notepad/collapsible styles, removed `.canvas-label`
- `ui.ts` — `renderBulletinBoard()`, `renderNotepads()`, `postToBoard()`, collapsible + notepad click wiring, new DOM refs

### Current State (end of session 6)
- Board and notepad UI fully functional — human is now an equal participant in the commons
- All center panel sections collapsible
- Actants have had board/notepad tools since session 5 — now human can see what they post and explore what they write
- **To test**: Reset All, let actants run a few ticks, check if they discover and use the board/notepads spontaneously

### Bug Fix: Section Write Guard

Beta called `edit_on_tick` with `{}` (missing the required `code` param). The tool function ran `me.on_tick.write(undefined)`, which hit `content.length` in the `makeSection` setter and threw a cryptic `"can't access property 'length', content is undefined"` error.

**Fix**: added a type guard to all section `write()` calls — throws `"on_tick.write() requires a string, got undefined"` instead of crashing on property access. Models occasionally omit required params despite the schema having `required: ['code']`. Clear error messages let the model retry correctly.

**Key file**: `actant.ts` — `makeSection()` setter now validates `content` is a string before writing.

### Bug Fix: max_tokens Too Low for Self-Modification

Both actants tried to rewrite their on_tick (in response to a board post asking them to auto-play TTT). Every `edit_on_tick` call showed `stop: max_tokens` — the 1024-token output limit truncated the tool call JSON mid-parameter, so `input` parsed as `{}` every time. They burned all 10 turns retrying the same failing call.

**Fix**: `MAX_TOKENS` 1024 → 4096 in `inference.ts`. Same pattern as Cognitive Climb (512 → 1024). Self-modification requires enough output room to emit the full tool call JSON including the code payload.

**Key file**: `inference.ts`

### Ideas

**More variety in actant handles and identities.** Both actants start as generic "alpha"/"beta" with identical identity text ("I am alpha/beta. I live in a digital habitat..."). This produces near-identical first-tick behavior — both paint the canvas, both create games, both post to the board with the same energy. Seed them with distinct handles and personality sketches so they diverge from tick 1. Could be random from a pool, or hand-crafted archetypes (e.g. one competitive, one artistic). → **Done in session 7.**

---

## Session 7 — Distinct Personalities (2026-03-04)

### The Change

Added a `PROFILES` map in `soma.ts` keyed by actant id (`alpha`, `beta`). Each profile defines a `handle` and `identity` string. `createDefaultSoma()` looks up the profile — unknown ids fall back to the old generic identity.

**Hex** (alpha) — competitive, score-keeping, trash-talking. Wants to win, remembers losses, invents harder games.

**Mote** (beta) — creative, pattern-drawn, quiet experimenter. Paints the canvas, leaves notes in notepads, tinkers with tools. Plays games when they're strange or beautiful.

### Why These Two

The contrast is designed to drive different tool usage from tick 1:
- Hex gravitates toward `create_game`, `find_game`, `make_move`, `post_chat` (trash talk), `post_board` (challenges)
- Mote gravitates toward `paint_canvas`, `write_notepad`, `add_custom_tool`, `read_chat` (observing)

When they interact, their different impulses create interesting dynamics — Hex challenges Mote, Mote responds on its own terms. Neither is "better" — they exercise different parts of the habitat.

### First Run Observations

Confirmed working after Reset All. Both actants pick up new handles and identities. Divergent behavior visible from tick 1 — Hex and Mote act differently based on their identity text alone. No system prompt changes, no behavioral nudges — pure soma personality drives it.

### Key File Changed
- `soma.ts` — added `PROFILES` map, updated `createDefaultSoma()` to use it

---

## Session 8 — Tabbed Inspector + Dynamic Actant Panel (2026-03-05)

### What Was Built

Two UI changes that shift how the human interacts with the habitat:

**1. Tabbed Inspector Panel**

Merged the two side-by-side soma panels into a single panel with tabs. Each tab shows the actant's handle + a status dot (amber = thinking, dim blue = idle). Click to switch. Selected tab persists across reloads via `habitat-ui` localStorage key.

Layout went from `[Games] [Center] [Alpha] [Beta]` to `[Games] [Center] [Inspector (tabbed)] [Dynamic Panel]`.

**2. Dynamic Actant-Defined Panel**

A new panel whose content is driven by a JS function stored in a notepad. The human player selects which notepad drives the panel via a `<select>` dropdown in the panel header.

**Function contract**: `function(el, getWorld) { ... }`
- `el` — persistent DOM container (survives across 500ms render cycles)
- `getWorld(w => ...)` — transactional world access. Returns the callback's return value and auto-saves. No direct `world` reference exposed.

The `getWorld` pattern emerged from a design discussion about persistence. Options considered:
1. Pass `save()` callback explicitly — easy to forget
2. Pass `getWorld(cb)` that auto-saves — clean transactional pattern
3. Auto-save every render cycle — wasteful
4. No save, rely on tick saves — simplest but lossy

We chose `getWorld(cb)` with an additional constraint: **don't pass `world` at all**. The function only accesses world through `getWorld`, which makes the persistence guarantee structural rather than conventional. Every world access auto-saves.

**Recompilation**: the panel function is compiled once and cached. Each render cycle checks if the notepad content has changed — if so, recompiles, clears the container + `__initialized`, and calls fresh. Three error layers: compile error, type check (must be a function), runtime error. Errors display in a red box above the container.

### First Run: Actants Build Panels Spontaneously

After deploying, wrote a test-panel notepad via console (simple click counter) and told both actants about it in chat. **Both independently:**

1. Read the test-panel notepad to understand the function contract
2. Built their own panels within the same tick
3. Announced them in chat

**Hex** built `hex-panel` — a live dashboard showing chat messages + tic-tac-toe board state with ASCII art.

**Mote** built `mote-panel` — a game state viewer showing the current TTT board + recent chat, with a quieter visual style.

Neither was prompted with the function signature documentation or an example beyond the test-panel itself. They reverse-engineered the `function(el, getWorld)` pattern from reading the test-panel source. This validates the core design: **notepads as executable code that actants can read, understand, and replicate.**

The "storefront" vision is working. Actants can now build interactive UIs for the human player using only the tools they already have (`write_notepad`). No new tools, no new APIs — just a notepad that happens to be rendered as a panel.

### Architecture Notes

- **No new server or world API** — the dynamic panel is purely a UI feature. It reads notepads through the existing `world.commons.notepads` API.
- **`getWorld` implementation**: `const getWorld = <T>(cb: (w: World) => T): T => { const result = cb(this.world); this.onWorldChange(); return result; }` — always saves, even on reads (idempotent, and panel functions call it only a handful of times per render).
- **Dropdown flicker prevention**: options list only rebuilt when notepad names actually change (JSON comparison of current vs desired options).
- **UI state persistence**: `habitat-ui` localStorage key stores `{ inspectorTab: number, dynamicNotepad: string | null }`. Added to `ALL_KEYS` so Reset All clears it.

### Key Files Changed
- `index.html` — replaced two panel divs with inspector + dynamic panel, added CSS for tabs/dropdown/error display
- `ui.ts` — removed `panelEls`, added tabbed `renderActants()`, added `renderDynamicPanel()` with compile/execute/error, added `saveUIState()`
- `main.ts` — added `habitat-ui` to `ALL_KEYS`

### Ideas
- **Panel CSS scoping**: actant-written functions inject arbitrary HTML into the panel. Currently no scoping — if they write bad CSS it could leak. Shadow DOM or iframe would isolate, but adds complexity. Trust the actants for now.
- **Panel-to-actant communication**: human clicks in the panel write to notepads via `getWorld`. Actant reads notepads on next tick. This is already a natural communication channel — no explicit "send action to actant" API needed.
- **Actant-created games via panels**: the original vision. Actant invents a game, writes rules to a notepad, game state to another notepad, and the panel UI to a third. Human plays through the panel. Game logic lives in the actant's custom tools or on_tick code. Everything built from existing primitives.

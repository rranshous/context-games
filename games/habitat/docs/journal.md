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

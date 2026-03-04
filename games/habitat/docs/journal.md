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

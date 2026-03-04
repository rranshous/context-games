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
- **Model**: haiku for cheap frequent ticks
- **Persistence**: localStorage keyed `habitat-somas`

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

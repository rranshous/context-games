# Hot Pursuit — Development Journal

## 2026-02-26 — Phase 1 Kickoff

### Decisions Made
- **Stack**: Vite + TypeScript, consistent with other games in the workspace
- **Hosting**: Vanilla platform (dev mode at `/dev/hot-pursuit/`). `.env` configured with Anthropic API key for future Phase 3 reflection
- **Movement model**: Smooth sub-tile movement (not tile-snapping). Player feels nimble. Map is tile-based for collision/pathfinding but entities move in continuous space
- **Input**: WASD + arrow keys (no mouse — laptop play)
- **JSON logging**: All game events logged to console as structured JSON so full console can be copy-pasted for analysis
- **Map**: Hand-built ~30x25 city grid with streets, alleys, dead ends, plazas, extraction points. Small enough to iterate, complex enough for interesting chases
- **Rendering**: Top-down retro pixel style on HTML5 Canvas. Camera follows player

### Phase 1 Scope (from design doc)
- Tile-based city map with walls, alleys, intersections
- Player movement and input
- Static police units running hardcoded "move toward player" logic
- Win/lose detection (reach extraction point OR survive timer / get cornered)
- Replay data capture
- Basic top-down rendering
- **Milestone**: Playable chase that produces structured replay data

### Architecture
```
src/
  main.ts       — entry point, game loop orchestration
  types.ts      — shared types and interfaces
  map.ts        — tile map, city layout, pathfinding (A*)
  player.ts     — player entity, input handling
  police.ts     — police entities, naive AI
  los.ts        — line of sight raycasting
  renderer.ts   — canvas rendering (map, entities, fog, HUD)
  replay.ts     — replay data capture + JSON console logging
  game.ts       — game state manager (chase lifecycle)
```

### Notes
- Smooth movement means collision detection against tile boundaries, not tile-occupancy checks
- Police use A* pathfinding on tile grid, but move smoothly between tiles
- Player is slightly faster than police base speed — escape must always be possible via smart pathing
- LOS uses raycasting against wall tiles — police don't have omniscient knowledge
- Extraction points marked on map — player wins by reaching one
- Timer-based alternative win condition (survive N seconds) for variety

### Phase 1 Complete ✅
Committed as `3f205ae`. All systems working:
- Chase is playable, feels responsive
- Police patrol → pursue → search state machine working
- JSON logging dumps to console (copy-paste ready for analysis)
- Replay capture produces full structured data on chase end
- Retro visual style looks good, minimap helps with spatial awareness
- Player confirmed it's "working well"

### What's Next — Phase 2: Soma Integration
Replace hardcoded police AI with the actant architecture:
- Soma data structure (context window template from impl guide)
- `me` API for chase mode (with `thinkAbout` disabled)
- Signal dispatch: tick, player_spotted, player_lost
- Handler extraction and execution via AsyncFunction
- Handler validation (allowlist, timeout, state isolation)
- Soma persistence (save/load JSON)

## 2026-02-26 — Phase 2: Soma Integration

### What Changed
Police are now driven by somas instead of hardcoded logic. The same chase behavior runs, but now it's executing JavaScript from the soma's `signalHandlers` string via AsyncFunction.

### New Files
- `src/soma.ts` — Soma data structure, default templates with nature analogies (Voss/Okafor/Tanaka/Reeves), default naive signal handlers, discoverable tools registry
- `src/chassis.ts` — The `me` API (ChassisAPI). Provides tool calling with allowlist enforcement, position/state getters, read-only memory. `thinkAbout()` throws during chase mode.
- `src/handler-executor.ts` — Compiles soma signal handler code via AsyncFunction, executes with timeout protection (50ms budget), caches compiled handlers
- `src/soma-police.ts` — Soma-driven police update loop. Checks LOS → determines signal type → fires handler → applies queued actions to entity
- `src/persistence.ts` — Save/load somas to localStorage, chase history recording, export for debugging

### Key Architecture Decisions
- **Signal dispatch**: on each tick, the engine determines the appropriate signal (tick / player_spotted / player_lost) and fires the handler. The handler queues actions via `me.callTool()`, and the engine applies them afterward.
- **Handler → PendingAction pattern**: Handlers don't move the entity directly. They call `me.callTool('move_toward', {target})` which pushes a `PendingAction`. The engine then executes the action. This keeps handlers sandboxed.
- **Allowlist enforcement**: Every `me.callTool()` call is validated against a whitelist. Unadopted tools are rejected. Violations are logged as JSON.
- **Handler caching**: Compiled AsyncFunction is cached per actant ID + code hash. Only recompiled when the handler code changes (which happens during reflection in Phase 3).
- **Soma persistence**: somas save to localStorage after each chase. Chase history is appended per-soma. This means if you edit a soma's JSON in devtools, it persists.

### Milestone Validation
✅ Police behavior is entirely driven by handlers read from soma  
✅ The handlers execute the same naive behavior as Phase 1 (move_toward on spotted, patrol on tick)  
✅ Handler violations (bad tool calls, memory writes, thinkAbout) are caught and logged  
✅ Somas persist across page reloads  
✅ Manually editing soma JSON in localStorage would change behavior  

### What's Next — Phase 3: The Reflection Loop
- Reflection manager: feed replay + soma to Claude API after each chase
- Scaffold tools: update_signal_handlers, update_memory, update_tools, discover_tools, query_replay
- Explicit imperative reflection prompts (fight prose gravity)
- Soma validation after reflection
- Memory maintainer execution
- Strategy board interstitial UI

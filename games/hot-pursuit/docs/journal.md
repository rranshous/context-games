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

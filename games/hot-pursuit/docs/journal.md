# Hot Pursuit — Development Journal

## Dev Setup
- **Build**: `cd games/hot-pursuit && npm run build` (esbuild, single bundle)
- **Watch**: `cd games/hot-pursuit && npm run watch` (rebuilds on save, refresh browser)
- **Game URL**: `http://localhost:3000/dev/hot-pursuit/index.html` (vanilla platform)
- Vanilla platform handles API proxy at `/api/inference/anthropic/messages`

## 2026-02-26 — Phase 1 Kickoff

### Decisions Made
- **Stack**: esbuild + TypeScript (switched from Vite — see 2026-03-01 entry)
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

## 2026-03-01 — Build Tooling + Vision Reflection

### Switched from Vite to esbuild
Vite's dev server couldn't be served through the vanilla platform's static `/dev/` route (browser can't load `.ts` directly). Replaced with esbuild to match cognitive-climb's pattern:
- `esbuild.config.mjs`: single entry `src/main.ts` → `main.js` in game root
- `npm run watch` for dev iteration (rebuild on save, manual browser refresh)
- Deleted `vite.config.ts` — vanilla platform handles the API proxy now
- The Vite Anthropic proxy plugin was only needed when running Vite's own dev server; vanilla's `/api/inference/anthropic/messages` route does the same thing

### Bird's-Eye Chase Map for Reflection
Added vision support to the reflection system. Each officer now receives a rendered bird's-eye map image alongside their text prompt.

**New file: `src/chase-map-renderer.ts`**
- Off-screen canvas at 4px/tile (160×120px)
- Tile grid with game color palette
- Player path (green polyline) + officer path (colored by state: purple=patrol, red=pursuing, orange=searching)
- Numbered markers for key moments
- Sent as base64 PNG in an `image` content block

**Reflection prompt trimmed**: removed verbose per-moment coordinates (the image shows spatial context now). Kept stats, timing, and state breakdowns as text.

**Per-officer map shown during reflection UI**: while each officer is reflecting, their specific chase map (their path + player path) is displayed on screen — doubles as a debugging view.

### Improved Strategy Board / Debrief UI
- **Full reasoning**: removed all `.slice()` truncation — officer responses render in full
- **Markdown rendering**: lightweight regex-based converter handles headers, bold, italic, lists, code blocks
- **Soma changes section**: each officer card now shows what they actually changed:
  - Signal handlers updated (with collapsible code preview)
  - Memory updated (with collapsible preview)
  - Tools adopted (listed by name)
- **Wider layout**: `max-width` increased from 560px to 900px for readability
- `StrategyBoardData` extended with `memoryUpdated`, `toolsAdopted`, `handlerCodePreview` fields

### Debugging & Polish Notes
- Officer paths on chase map were always rendering correctly — initial confusion was just looking at wrong area of the tiny 160×120 image
- Brightened state colors for visibility: patrol `#aa99ff`, pursuing `#ff4444`, searching `#ffcc33`
- Added waypoint dots (1.5px radius circles) at each officer waypoint so path is visible even when segments are short
- Full opacity + 2.5px line width for officer paths
- Added build tag to bottom-right corner of screen (`b.XXXXXX` timestamp) for verifying builds are fresh
- Debug log `_hp: 'chase_map_render'` left in chase-map-renderer.ts — can remove when no longer needed

### Current State
- All features working: chase map image sent to AI, displayed per-officer during reflection, full debrief with markdown rendering and soma change details
- esbuild watch running for dev iteration

## 2026-03-01 — Session 2: Parallel Reflection + UI Polish

### Parallel Reflection
- All 4 officers now reflect simultaneously via `Promise.all` instead of serial loop
- Cuts reflection wait time to ~1/4 (limited by slowest officer, not sum of all)
- `reflectAllActants()` in `reflection.ts` uses `somas.map(async ...)` + `Promise.all`

### 2×2 Chase Map Grid
- During reflection, all 4 officer chase maps display simultaneously in a 2×2 CSS grid
- Each card shows: officer name, status indicator (⟳ waiting → ⟳ reflecting → ✓ complete / ✗ failed), their chase map image
- Card border turns green on completion — nice visual feedback
- Replaced the old single-map-that-rotates approach

### Chase Map Renderer Changes
- Player path now uses same bold style as officer path: 2.5px lineWidth, full opacity, waypoint dots (was thinner 1.5px at 0.7 alpha)
- Officer path unchanged: per-segment state coloring (purple=patrol, red=pursuing, orange=searching) + waypoint dots

### Viewport + Layout
- Viewport bumped from 640×480 to 960×640 for more room
- Reflection overlay switched from `display: flex; justify-content: center` to `display: block` — fixed classic flexbox overflow bug where first officer card was cut off (content above scroll origin)
- Map images: `width: 100%; max-height: 260px; object-fit: contain` — scales up from native 160×120 while fitting viewport
- Removed "ONE WEEK LATER..." header from reflection screen to reclaim vertical space
- Minor remaining issue: slight scroll still needed on reflection screen, likely padding — not urgent

### What's Next
- Chase map legend — officers don't understand buildings block LOS (see session below)
- Phase 4: Communication experiments — debrief sharing, live radio primitives, broadcast dispatch to ally_signal handlers (currently broadcast is a logged no-op in chassis.ts)
- Tool discovery pacing — currently all 7 discoverable tools available from first reflection, design doc suggests gradual reveal
- Observe officer evolution across multiple runs — are they actually improving?

## 2026-03-01 — Session 3: Live Reflection UI + Reset Button

### Unified Live Reflection View
Replaced the two-phase reflection UI (waiting grid → strategy board hard cut) with a single unified view where officer cards progressively fill with content as each API turn completes.

**How it works:**
- `TurnUpdate` interface added to `reflection.ts` — carries per-turn text + tool call results
- `reflectActant()` now accepts `onTurnUpdate` callback, fired after each API response
- Each officer card starts with chase map + "thinking..." status
- As turns complete (~3-5s each), reasoning text and tool call badges append to the card
- Tool badges are color-coded: green (handlers), blue (memory), orange (tools adopted), gray (discover/replay)
- Collapsible `<details>` for handler code and memory previews
- When all officers finish, "PRESS SPACE TO BEGIN NEXT CHASE" fades in at bottom
- No more hard cut — the debrief IS the strategy board in its final state

**Removed:**
- `showStrategyBoard()` method and `StrategyBoardData` interface — no longer needed
- `buildStrategyBoardData()` function
- Old strategy board CSS (`.strategy-officers`, `.strategy-officer`, etc.)

### Reset Button
- Small "RESET" button in the HUD bar (top-right, next to timer)
- Confirm dialog → `resetSomas()` → `location.reload()`
- Unobtrusive: transparent background, gray text, red on hover

### Observation: Officers Don't Understand LOS
After playing several runs, the officers are confused about why they lose the suspect. They write search patterns that assume they can "look harder" near the player's last position, but they don't understand that **buildings block line of sight**. The chase map image doesn't have a legend explaining what the tiles mean.

**Fix needed**: Add a legend to the chase map (or to the reflection prompt) explaining:
- Dark squares = buildings (block LOS)
- Gray = roads/alleys (passable, LOS clear)
- Green squares = extraction points
- Officer paths are colored by state (purple=patrol, red=pursuing, orange=searching)
- Player path is green

This should help officers reason about WHY they lost the suspect (cut behind a building) instead of just WHERE.

### Future Idea: Player Powers
In a larger progression system, the player could unlock abilities like invisibility, speed bursts, or decoys. The officers would have to figure out what's happening — "the suspect just vanished" — and adapt their handlers. This creates a natural difficulty curve where the player gets powers but the officers get smarter. Not pursuing now, but it's a compelling direction for the game's evolution loop.

### Chase Map Legend + LOS Explanation
Added a legend row below the chase map image with color swatches: Building (impassable, blocks LOS), Road (passable), Alley (passable), Suspect path, Pursuing, Searching, Patrol. Updated the reflection prompt to explicitly explain that buildings are impassable and block LOS, roads/alleys are passable and clear, and losing the suspect is almost always because they broke LOS behind a building.

### What's Next
- Phase 4: Communication experiments
- Tool discovery pacing
- Observe officer evolution across multiple runs — especially whether LOS understanding improves tactics

## 2026-03-01 — Session 4: Fairness + Visual Improvements

### Randomized Extraction Points
Extraction points were hardcoded at fixed map positions — player could memorize them and beeline every time. Now randomized each chase:
- Removed hardcoded `3` tiles from `CITY_LAYOUT` (replaced with road)
- `TileMap.randomizeExtractionPoints()` picks 3 road tiles along map edges (within 2 tiles of border)
- Minimum 15-tile Manhattan distance between points for good spread
- Called at the start of every `startChase()`

### Constrained Player Viewport
Player could see ~40×27 tiles (nearly the whole 40×30 map) — extraction points were trivially visible. Halved the internal render resolution from 960×640 to 480×320 (showing ~20×13 tiles). Canvas CSS-scaled 2× to maintain display size. Player now sees roughly half the map width and under half the height — must explore to find exits.

### Chase Map Fidelity Improvements
- Scale doubled: 4px/tile → 8px/tile (320×240 image, up from 160×120)
- Legend font 7px → 10px, swatches 6×6 → 8×8, legend height 36 → 48px
- Fixed: "Patrol" legend entry was clipped off canvas (4th row exceeded `legendH`)
- Shortened labels: "Building (blocks LOS)", "Road", "Alley" instead of verbose versions
- Reordered: officer states grouped together (Patrol, Pursuing, Searching)
- Path line widths and waypoint dot radii scaled proportionally

### What's Next
- Phase 4: Communication experiments
- Tool discovery pacing
- Observe officer evolution across multiple runs
- Consider hiding extraction points from minimap for additional challenge

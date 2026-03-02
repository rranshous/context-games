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

### Minimap Removed
Minimap showed the full map including extraction points and police positions — completely undermined the constrained viewport. Removed the `drawMinimap()` call from the render loop. Method left in code as dead code in case a fog-of-war minimap is wanted later.

### Player Feedback
Confirmed: the combination of randomized exits + constrained viewport + no minimap makes chases noticeably more engaging. Player can no longer autopilot to memorized exits.

### Randomized Police Spawns
Police were always at the same 4 corners — predictable. Now `TileMap.randomizePoliceSpawns()` picks 4 road/sidewalk tiles each chase:
- Minimum 12-tile Manhattan distance from player spawn (center)
- Minimum 8-tile distance between officers (spread out)
- Called in `startChase()` before police entity creation

### Sensing Constraints in Reflection Prompt
Officers were fantasizing about "expanding their scanning range" — they had no idea their vision is a narrow 8-tile, 60° forward cone. Added explicit sensing limits section to the reflection prompt:
- 8-tile range, 60° half-angle cone (forward only)
- Slower than the suspect (95 vs 120 px/s) — can't just chase, must predict/trap
- Extraction points are randomized on edges each chase
- Sensing range is fixed — cannot be improved, must work within it
- Tells them about `me.getFacing()` so they can reason about facing direction

### Known Issue: Choppiness from Unbounded Handlers
Game can get choppy — likely caused by officer signal handlers growing unconstrained. Currently handlers run with a 50ms timeout but there's no limit on handler code size or complexity. Officers can write arbitrarily complex logic that runs every tick for all 4 officers. Consider:
- Max handler code length (chars) enforced at `update_signal_handlers` time
- Tick budget per officer (skip handler execution if frame budget exceeded)
- Profiling which handlers are slow

### What's Next
- Phase 4: Communication experiments
- Tool discovery pacing
- Observe officer evolution across multiple runs
- Handler performance limits (see choppiness issue above)

## 2026-03-01 — Session 5: Ally Paths, Directional Arrows, Tool Simplification

### Ally Paths on Chase Map
Each officer's chase map now shows where their teammates were during the chase. Previously officers only saw their own path + the suspect's path — no team awareness.

- All ally paths drawn in muted cyan (`#55aacc`), thinner lines (2px), 60% opacity
- Each ally's start position labeled with their name in white
- Drawn underneath the reflecting officer's own path (layering: tiles → player → allies → officer → markers)
- New "Ally paths" legend entry
- Reflection prompt updated to explain ally paths and suggest spotting coverage gaps
- Ally waypoints extracted from `replay.actantPaths` in `reflectAllActants()`, simplified every 10th tick

### Directional Arrows on Paths
Replaced waypoint dots with directional arrowheads (chevron shape) to show travel direction. Previously paths with doublebacks were ambiguous.

- `drawArrow()` helper draws a filled chevron rotated to match travel direction
- `waypointAngle()` computes direction from prev→current waypoint (next→current for first point)
- Size: 5px for player/officer, 4px for allies
- Applied to all three path types (player, officer, ally)

### Removed Tool Discovery/Adoption
Tool pacing (discover_tools + adopt_tools) removed entirely. All 9 tools now available from the start:
- `move_toward`, `check_line_of_sight`, `move_to_intercept`, `hold_position`, `map_query`, `escape_routes_from`, `ally_positions`, `distance_to`, `broadcast`
- Removed `discover_tools` and `adopt_tools` scaffold tools from reflection
- Removed `DISCOVERABLE_TOOLS` export from soma.ts — merged into single `ALL_TOOLS` array
- Reflection prompt step 4 (discover/adopt) removed
- Renderer badge code for adopt/discover cleaned up

### Data Efficiency Review
Confirmed that officer reflection prompts are efficient — they receive:
1. Stats (outcome, duration, state breakdown)
2. Key moments (numbered list)
3. Chase map image (320×240 PNG with paths, arrows, allies, legend)
4. Map/sensing explanation text

Raw waypoint data stays in the console replay log (debug only), never sent to the AI. The `query_replay` tool can pull specific tick ranges on-demand.

### Future Idea: Police Chief Multiplayer
A second player could act as police chief during debriefing — giving direction and comments to officers between chases. Officers would receive the chief's input as additional context during reflection. Creates an asymmetric multiplayer experience: fugitive vs. chief, with AI officers as the chief's team.

### What's Next
- **Phase 4: Communication** — the main remaining feature phase
  - Config A: None (current) → B: Observation sharing → C: Tactic sharing → D: Live radio
  - `broadcast()` already exists as a no-op in chassis.ts, needs wiring
  - `ally_signal` handler case exists in default handlers (currently no-op)
- Handler performance limits (choppiness from unbounded handler complexity)
- Observe officer evolution across multiple runs

## 2026-03-01 — Session 6: Viewport Zoom + Handler Pileup Fix

### Tighter Viewport
Player could still see too much of the map (~20×13 tiles) making it easy to spot and avoid cops. Reduced internal render resolution from 480×320 to 320×240 (showing ~13×10 tiles). CSS scale bumped from 2× to 3× (960×720 display). Aspect ratio changed from 3:2 to 4:3.

- `DEFAULT_CONFIG.viewportWidth`: 480 → 320
- `DEFAULT_CONFIG.viewportHeight`: 320 → 240
- CSS canvas: `960px × 640px` → `960px × 720px`

Player now sees roughly one third of the map. Cops appear with less warning, extraction points require more exploration.

### Handler Pileup Prevention
Identified root cause of choppiness: `updateSomaPolice()` is async but called without `await` in the game loop. If a handler takes longer than one tick (~16.7ms), the next tick fires a new handler on top of the still-running one. `Promise.race` with the 50ms timeout doesn't cancel the losing promise — slow handlers just pile up indefinitely.

**Fix**: Per-officer busy flag via `busyOfficers` Set in `soma-police.ts`. Before executing a handler, check if the officer is already mid-execution. If busy, skip handler dispatch and just continue moving along the current path (`moveAlongPath`). Flag cleared in a `finally` block after handler completes.

This is a soft degradation — officers with complex handlers react a bit slower (miss some signals) but the game stays smooth. No handlers pile up.

### Handler Code Length Limit (Infrastructure Only)
Added `MAX_HANDLER_CODE_LENGTH` validation in `reflection.ts` `validateHandlerCode()`. Currently set to 50,000 chars (effectively uncapped) — infrastructure is in place to tighten later when we observe how large handlers actually grow. The validation rejects with a clear error message telling the AI to write more concise code.

### Haiku Debrief Summaries
The reflection cards were dominated by verbose multi-turn reasoning text that wasn't useful to watch. Replaced with a haiku summarization pass:

- **During reflection**: cards now show only tool badges (handlers updated, memory updated, replay queries) as they come in. Verbose reasoning text is suppressed.
- **After reflection completes**: quick haiku call per officer summarizes their full reasoning into 2-3 punchy bullet points.
- **Card layout**: summary at top, tool badges in middle, collapsible "full reasoning" at bottom for anyone who wants the detail.

New function: `summarizeReflection()` in `reflection.ts`. Uses `claude-haiku-4-5-20251001`, 256 max tokens. Fires via `onSummary` callback from `reflectAllActants` → `renderer.setReflectionSummary()`.

Made `tools` parameter optional in `callAnthropicAPI()` — summary call doesn't need scaffold tools.

### Stationary Officer Fix
Officers were staying in one spot but claiming they had patrol routes. Root cause: the reflection prompt gave no data about how far the officer actually moved, so they had no way to realize their handlers weren't producing movement commands.

**Fix**:
- Added `distanceTraveled` to `officerSummary` in `replay-summarizer.ts` — cumulative pixel distance from path waypoints.
- Reflection prompt now shows officer distance vs suspect distance.
- **If officer traveled < 200px**: bold warning in prompt that their handler is probably not producing movement for all signal types, telling them to check every switch case.

### Future Idea: Soma-Owned Map Rendering
What if the chase map rendering logic (or something similar) lived in the soma so officers could modify it? They could annotate the map, add their own markers, or change what they focus on. Creates another axis of self-modification alongside handler code and memory. Not pursuing now but an interesting direction for deeper embodiment.

### Debrief Cards: Summary Only
After testing, removed tool call badges from debrief cards entirely. Cards now show:
1. Chase map image
2. Haiku summary (2-3 bullet points)
3. Collapsible "full reasoning" at bottom

`appendTurnContent()` is now a no-op — all live content suppressed. Only `setReflectionSummary()` adds content after each officer finishes.

### Session 6 Summary of All Changes
1. **Viewport**: 480×320 → 320×240 internal (3x CSS to 960×720). ~13×10 tiles visible.
2. **Handler pileup**: `busyOfficers` Set prevents async handler stacking.
3. **Code length limit**: `MAX_HANDLER_CODE_LENGTH = 50000` in `validateHandlerCode()` (infrastructure, effectively uncapped).
4. **Haiku summaries**: Post-reflection haiku call per officer → 2-3 bullet summary on card.
5. **Distance tracking**: `officerSummary.distanceTraveled` in replay-summarizer. Warning if <200px.
6. **UI cleanup**: No tool badges, no reasoning text shown live. Summary-only cards.

### Architecture Notes for Next Session
- `reflection.ts`: `callAnthropicAPI()` now has optional `tools` param. `summarizeReflection()` uses haiku.
- `renderer.ts`: `appendTurnContent()` is a no-op. `setReflectionSummary()` is the only content method.
- `soma-police.ts`: `busyOfficers` Set wraps `updateSomaPolice()` in try/finally.
- `replay-summarizer.ts`: `officerSummary` has `distanceTraveled` field.
- CSS in `index.html`: `.reflection-summary`, `.reflection-full-reasoning`, `.reflection-reasoning-content` classes added. Old `.reflection-text-chunk` styles removed.

### What's Next
- **Phase 4: Communication** — the main remaining feature phase
  - Config A: None (current) → B: Observation sharing → C: Tactic sharing → D: Live radio
  - `broadcast()` already exists as a no-op in chassis.ts, needs wiring
  - `ally_signal` handler case exists in default handlers (currently no-op)
- Tighten handler code length limit once we observe growth patterns
- Observe officer evolution across multiple runs — especially whether distance warning helps stationary officers

## 2026-03-02 — Session 7: Phase 4 Communication

### Live Radio Dispatch
Wired the `broadcast()` tool from no-op to full dispatch. When an officer calls `me.callTool('broadcast', {signalType, data})` during a chase, the message is queued and delivered to all other officers on the next tick as an `ally_signal`.

**Architecture:**
- `RadioMessage` interface added to `types.ts`: `{ from, fromName, signalType, data, tick }`
- `game.ts` maintains a double-buffered queue: `pendingBroadcasts` (current tick's output) and `currentRadio` (previous tick's output, now being consumed)
- `onBroadcast` callback threaded through `createChaseChassisAPI()` → `executeSignal()` → `updateSomaPolice()`
- Each officer receives only messages from OTHER officers (self-messages filtered out)
- One-tick delay prevents infinite broadcast loops (natural radio latency)

**Signal Priority Chain** — only one signal fires per tick per officer:
1. `player_spotted` / `player_lost` (direct observation — always takes priority)
2. `ally_signal` (radio intel — fires instead of tick when radio arrives)
3. `tick` (idle patrol — lowest priority)

This means an officer who receives radio intel while patrolling will respond to the radio (their `ally_signal` case runs), not just continue patrolling. But if they're already tracking the suspect directly, they ignore radio (direct observation trumps secondhand intel).

### Default Handler Upgrade
- `player_spotted` case now broadcasts sighting: `me.callTool('broadcast', {signalType: 'player_spotted', data: {position: data.player_position}})`
- `ally_signal` case upgraded from no-op to: if ally reports `player_spotted`, move toward reported position
- Officers coordinate from the first chase — no reflection needed to learn basic radio

### Reflection Prompt Updates
- Handler signal documentation now shows priority order
- Added radio communication section explaining:
  - How to use `broadcast()` in any signal handler
  - How `ally_signal` delivers ally broadcasts
  - One-tick radio delay
  - Coordination strategies (share sightings, chokepoint calls, directional warnings)
  - Reminder that ally_signal case MUST produce movement or officer stands still
- Added `broadcast()`, `ally_positions()`, `distance_to()` to the available actions list

### Debrief Sharing Pipeline
After individual reflection completes, a second mini-reflection pass runs:
1. Each officer receives all allies' observations, handler code, and memory
2. They can call `update_signal_handlers` and `update_memory` to absorb useful tactics
3. Max 2 turns per officer (vs 5 for individual reflection)
4. All 4 officers share in parallel
5. UI shows "sharing intel..." status during debrief pass

**New functions in `reflection.ts`:**
- `buildDebriefContext()`: assembles ally observations (reasoning, handler code preview, memory)
- `runDebriefSharing()`: runs the second reflection pass per officer
- Handler code previews truncated to 800 chars, reasoning to 1500 chars, memory to 500 chars

### Renderer Updates
- Added `'sharing'` status to `updateReflectionProgress()` — shows "sharing intel..." on cards

### Future Ideas
- **Player vision cone**: Currently the player sees everything in their viewport (full rectangular area), while officers have a narrow 8-tile 60° forward cone. Would a player vision cone be more fair? Probably less fun as a game, but could be a "hard mode" toggle.
- **Radio noise/jamming**: Officers could learn to flood radio with false sightings, or the game could add radio jamming as a player power.

### Session 7 Summary
1. **Live radio**: `broadcast()` → `ally_signal` dispatch with one-tick delay
2. **Signal priority**: observation > radio > tick
3. **Default broadcast**: officers radio sightings from first chase
4. **Default ally response**: move toward ally-reported position
5. **Debrief sharing**: second reflection pass with ally intel exchange
6. **Reflection prompt**: radio docs, priority order, coordination guidance

### Architecture Notes for Next Session
- `types.ts`: `RadioMessage` interface
- `chassis.ts`: `onBroadcast` callback in `createChaseChassisAPI()`, broadcast case pushes to queue
- `handler-executor.ts`: `onBroadcast` param threaded through `executeSignal()`
- `soma-police.ts`: `radioMessages` + `onBroadcast` params in `updateSomaPolice()`, ally_signal in priority chain
- `game.ts`: double-buffered `pendingBroadcasts`/`currentRadio` arrays, `onBroadcast` closure, per-officer radio filtering
- `reflection.ts`: `buildDebriefContext()`, `runDebriefSharing()`, debrief pass after individual reflection
- `renderer.ts`: `'sharing'` status case

### Debrief Card Summaries (follow-up)
Replaced static "Updated tactics after reviewing ally intel" text on reflection cards with proper haiku-summarized bullet points from each officer's debrief reasoning.

**Changes:**
- `runDebriefSharing()` now captures reasoning text from the debrief API response (was discarding it)
- New `summarizeDebriefSharing()` function: haiku call producing 1-2 bullet points focused on what was adopted from allies
- New `setDebriefSummary()` renderer method: appends debrief summary AFTER existing individual summary, visually distinct
  - Blue-tinted text (`#99ccff`), "from allies:" label in small caps, separated by top border
  - Collapsible "debrief reasoning" section at bottom
- New `onDebriefSummary` callback in `reflectAllActants()` signature, routed to `renderer.setDebriefSummary()` in game.ts
- CSS: `.reflection-debrief-summary` and `.debrief-label` classes in `index.html`

**Card layout is now:**
1. Individual summary (white/gray) — what they learned from their own analysis
2. Debrief summary (blue, "from allies:") — what they picked up from ally intel
3. Collapsible full reasoning sections for both passes

### What's Next
- Play multiple chases and observe radio + debrief sharing in action
- Watch how officers evolve their ally_signal handlers across reflections
- Tighten handler code length limit once growth patterns observed
- Consider handler execution profiling if choppiness returns
- Potential: "police chief" mode where a second player directs officers during debrief

## 2026-03-02 — Session 8: Soma Inspector Panel

### Soma Inspector Side Panel
Added a side panel to the right of the game canvas for inspecting individual officer somas. Panel starts empty — no API calls at startup. After reflection completes, each debrief card gets an "inspect" button. Click it to view that officer's full soma in the side panel.

**Interaction flow:**
1. Chase runs → debrief overlay shows officer cards
2. After reflection + debrief sharing finishes, "inspect" button appears on each card header
3. Click "inspect" → side panel populates with that officer's soma
4. Haiku summary fires on-demand (only for the officer you're looking at)
5. Press SPACE → panel clears, next chase starts

**What the inspector shows (single officer):**
1. Name + badge + full nature text (not truncated — room for one officer)
2. **Behavior** — AI-generated plain-English summary (haiku call, fires on click)
3. **Memory** — full officer memory, scrollable (150px max-height)
4. **Chase History** — structured run-by-run results
5. **Handler code** — open by default (`<details open>`), 300px max-height

**Key design decisions:**
- One officer at a time, not all 4 — less clutter, more detail
- Summaries on-demand only — no startup API calls, no background generation
- Inspector button only appears after reflection is done (not during)
- Panel clears on next chase start (`clearSomaPanel()`)
- Active inspect button highlighted amber to show which officer is selected

**Files changed:**
- `index.html`: `.inspect-btn` CSS, increased `.soma-card-memory` max-height to 150px, `.soma-card-code` max-height to 300px
- `reflection.ts`: `summarizeHandlerBehavior()` (unchanged from initial version)
- `renderer.ts`: replaced `updateSomaPanel()`/`updateSomaPanelSummary()` with `addInspectButtons()`, `showSomaInspector()`, `updateSomaInspectorSummary()`, `clearSomaPanel()`
- `game.ts`: removed `handlerSummaries` Map + `generateHandlerSummaries()`, wired inspect click handler after reflection completes

### What's Next
- Play multiple chases and observe officer evolution via the inspector
- Watch how handler code grows and behavior summaries change across reflections
- Tighten handler code length limit once growth patterns observed
- Consider handler execution profiling if choppiness returns
- Potential: "police chief" mode where a second player directs officers during debrief

## 2026-03-01 — Session 9: Debrief Phase Titles

### Dynamic Debrief Header
The debrief overlay title was a static "DEBRIEF" during both reflection phases. Now it updates to reflect what's actually happening:
- **"DEBRIEF — REVIEWING TAPE"** during Phase 1 (individual reflection — officers analyzing their own chase replay)
- **"DEBRIEF — SHARING NOTES"** during Phase 2 (debrief sharing — officers exchanging intel with allies)

Title element given `id="reflection-phase-title"` for dynamic updates. Phase transition detected in `updateReflectionProgress()` when status changes to `'sharing'`.

### Soma Inspector: Radio-Aware Behavior Summaries
The `summarizeHandlerBehavior()` haiku call now explicitly asks about radio usage — how officers broadcast intel and respond to `ally_signal` messages. Also includes officer memory (truncated to 500 chars) as context, since radio strategy often lives there. Max tokens bumped 384 → 512 to give room for the extra detail.

### Files Changed
- `renderer.ts`: added id to title element, initial text "REVIEWING TAPE", updates to "SHARING NOTES" on sharing status
- `reflection.ts`: `summarizeHandlerBehavior()` system prompt + user message updated for radio awareness, includes soma.memory, max_tokens 384→512

### Squad Overview Button
Added a "squad overview" button that appears next to the debrief title after reflection completes. Clicking it fires a single haiku call that inspects all 4 somas and produces an overall tactical assessment — team coordination, radio usage, coverage gaps, emergent strategies. Result displayed in the soma side panel.

**New function: `summarizeSquadOverview()`** in `reflection.ts`:
- Sends all 4 officers' natures, memory snippets (300 chars), and handler code (1500 chars) to haiku
- System prompt asks for team-level analysis: coordination, radio patterns, gaps, emergent strategies
- References officers by name for specificity
- 768 max tokens

**Renderer additions:**
- `addOverviewButton(onOverview)`: places button inline with the debrief title, same `.inspect-btn` style
- `showSquadOverview()`: shows "generating overview..." in soma panel
- `updateSquadOverview(summary)`: patches in the markdown-rendered result

**Wired in `game.ts`** right after per-officer inspect buttons. Clicking deselects any active officer inspect button (shared `.inspect-btn.active` class).

### Files Changed
- `reflection.ts`: added `summarizeSquadOverview()`, updated `summarizeHandlerBehavior()` (radio + memory)
- `renderer.ts`: added `addOverviewButton()`, `showSquadOverview()`, `updateSquadOverview()`, debrief phase titles
- `game.ts`: import + wiring for squad overview button

### Wave Changes Button
Added a "wave changes" button alongside the squad overview button. Summarizes what changed across the squad after the latest reflection — what each officer learned, adapted, or adopted from allies. Focuses on the delta, not the current state.

**New function: `summarizeWaveChanges()`** in `reflection.ts`:
- Takes both individual `ReflectionResult[]` and debrief results
- Per officer: change flags, individual reasoning (1000 chars), debrief reasoning (600 chars)
- No handler code — reasoning text is the source of truth for what changed
- 1536 max tokens

**Return type change**: `reflectAllActants()` now returns `{ results, debriefResults }` instead of just `results`. The debrief result type also now includes `reasoning` (was already tracked internally, just not in the type signature).

**Renderer**: `addWaveChangesButton()`, `showWaveChanges()`, `updateWaveChanges()` — same pattern as squad overview.

### Tuning
- Reflection model upgraded from `claude-sonnet-4-20250514` to `claude-sonnet-4-6` (same cost, newer)
- Squad overview `max_tokens` bumped 768 → 1536 (was getting cut off)
- Wave changes prompt rewritten: was breaking down per-officer (redundant with individual inspect). Now synthesizes cross-squad themes — tactical shifts, ideas spreading between officers, new discoveries, coordination changes. Reads like a squad changelog.

### What's Next — Difficulty Scaling + Visual Overhaul

**Core problem**: Even as officers improve significantly, the player can still win most chases because the map is small (~30×25) and there are only 4 cops. The map geometry makes extraction points too reachable — smart play beats smart AI at this scale.

**Difficulty scaling ideas** (need to decide on approach):
- **Promotion / new city**: After N successful escapes, the player "moves up" to a larger city with more officers. Frames difficulty as narrative progression. Question: do the existing officers carry over (with their evolved somas), or do you face fresh cops in the new precinct? Carrying them over rewards the AI's learning; fresh cops create a reset but with harder geometry.
- **Expanding the current map**: Grow the grid and add officers incrementally. Simpler technically but less narratively satisfying. Would the existing somas still make sense on a different layout?
- **Officer count scaling**: Even on the current map, 5-6 officers would be significantly harder. Could add rookies (fresh somas) alongside veterans.
- **Map variety**: Multiple map layouts (downtown grid, highway, suburbs) with different tactical challenges. Officers would need to adapt to new geometry.

**Visual overhaul — early GTA driving game**:
- Replace abstract squares with actual car sprites (player getaway car, police cruisers)
- Top-down driving feel: acceleration, turning, momentum (not instant WASD movement)
- Road markings, building textures, sidewalks
- Potentially changes the whole movement model from walk-speed to vehicle-speed, which affects chase dynamics, LOS distances, map scale, and officer sensing ranges
- This is a big shift — probably its own phase. The AI/soma system stays the same but everything around it changes.

**Open questions**:
- Do we scale difficulty first (keep current visuals) or overhaul visuals first (keep current difficulty)?
- If we go driving model, does the map need to be much larger to feel right at car speeds?
- How do we handle the transition for existing somas when the map changes?

### Session 9 Summary
1. **Dynamic debrief titles**: "REVIEWING TAPE" → "SHARING NOTES" as phases progress
2. **Radio-aware inspector summaries**: behavior summaries now highlight broadcast/ally_signal coordination, include officer memory
3. **Squad overview button**: full-team tactical assessment (haiku, on-demand)
4. **Wave changes button**: cross-squad changelog — tactical shifts, idea spreading, new discoveries (haiku, on-demand)
5. **Reflection model**: upgraded to `claude-sonnet-4-6`
6. All summary buttons appear in debrief header after reflection completes, results show in soma side panel

## Session 10 Plan: Difficulty Scaling + Coordinate Normalization

Plan file: `~/.claude/plans/scalable-yawning-garden.md`

### The Problem
Officers learn tactics against a fixed 40×30 map with 4 cops. Even as they get smarter, the small map is easily beatable. Difficulty needs to scale. But officers "think" in raw pixel coordinates (0 → 960 on x-axis), which bakes map-specific positions into their handlers, memory, and broadcasts. If the map changes, their learned spatial knowledge breaks.

### Part 1: Coordinate Normalization

**System: Tile-based, center-origin.**
- `{x: 0, y: 0}` = map center
- Units = tiles (not pixels)
- On 40×30 map: ranges from `{x: -20, y: -15}` to `{x: 20, y: 15}`
- Distances map directly to game mechanics (LOS = 8 tiles, not 192px)

**Why this approach:**
- Tiles are the natural game unit (LOS, buildings, patrol all tile-based)
- Center origin means learned positions near center are portable across maps
- Officers can reason: "suspect was 12 tiles away" (relatable to their 8-tile LOS)
- Relative positions between entities work across any map

**Conversion boundary** — all conversions happen at the edge between engine (pixels) and handler world (tile-center):
- `soma-police.ts`: convert signal data positions (own_position, player_position, last_known_position) to tile-center before passing to handlers
- `chassis.ts`: convert tool args IN (move_toward target, etc.) from tile-center back to pixels; convert tool results OUT (ally_positions, escape_routes, distance_to) to tile-center
- `map_state` changes from `{cols, rows, tileSize}` to `{halfWidth, halfHeight}` (half-extents in tiles)
- Broadcast data flows naturally — handlers receive tile-center, put it in broadcasts, allies receive tile-center
- `distance_to()` returns tile units instead of pixels

**Soma reset required**: existing handlers/memory contain pixel coordinates. Add `soma.version = 2` for future migrations.

New file: `src/coords.ts` — `toTileCenter()`, `fromTileCenter()`, `distInTiles()`

### Part 2: Precinct Progression System

Track total escapes. After thresholds, player gets "promoted" to harder precinct. One-way — no demotion. Existing officers keep evolved somas; new officers join as rookies.

| Precinct | Escapes | Officers | Extractions | Police Speed | LOS | Timer |
|----------|---------|----------|-------------|-------------|-----|-------|
| 1 (Patrol) | 0 | 4 | 3 | 95 | 8 | 90s |
| 2 (Alert) | 3 | 5 | 3 | 100 | 8 | 80s |
| 3 (Pursuit) | 7 | 6 | 2 | 105 | 9 | 70s |
| 4 (Manhunt) | 12 | 7 | 2 | 108 | 10 | 60s |
| 5 (Lockdown) | 18 | 8 | 2 | 112 | 10 | 55s |

Player speed stays at 120. Gap narrows but player always has the edge.

**4 new officer templates** (expanding from 4 to 8):
- **Mori** — "reads a chase the way a river reads a valley — always finding the path of least resistance, always flowing toward the lowest point where things collect."
- **Briggs** — "works a grid like a combine works a field — systematic, relentless, covering every row until there's nowhere left to hide."
- **Jain** — "doesn't watch the suspect. Jain watches the exits. The chase is already decided — it's just a question of which door closes last."
- **Kowalski** — "moves through alleys the way a wolf moves through brush — low, quiet, always on the scent, appearing where you forgot to look."

**Persistence**: `hot-pursuit-progress` in localStorage — totalEscapes, currentPrecinct.

### Implementation Order
1. Coordinate conversion layer (`coords.ts`, wire into `soma-police.ts` + `chassis.ts`)
2. Soma versioning + auto-reset on version mismatch
3. Precinct config system (`types.ts` definitions, `persistence.ts` progress, `game.ts` application)
4. New officer templates in `soma.ts`
5. Promotion flow (check threshold after escape, interstitial, new officers spawn)
6. Update reflection prompts (explain tile-center coords, tile-unit distances)
7. HUD + visual feedback (precinct name, escape count, promotion overlay)

### Files Touched
- **New**: `src/coords.ts`
- **Modified**: `types.ts`, `soma.ts`, `soma-police.ts`, `chassis.ts`, `game.ts`, `persistence.ts`, `reflection.ts`, `replay-summarizer.ts`, `renderer.ts`, `index.html`

## 2026-03-01 — Session 10: Tile-Center Coords + Precinct Progression

### What Was Built
Implemented the full Session 10 plan: coordinate normalization and precinct progression system.

### Part 1: Tile-Center Coordinate System

**New file: `src/coords.ts`** — `toTileCenter()`, `fromTileCenter()`, `distInTiles()`

All positions that handlers see are now in tile-center coords:
- `{x: 0, y: 0}` = map center, units = tiles
- On the 40×30 map: ranges from `{x: -20, y: -15}` to `{x: 20, y: 15}`
- Conversion boundary is clean: `soma-police.ts` converts signal data OUT, `chassis.ts` converts tool args IN and results OUT
- `map_state` is now `{halfWidth, halfHeight}` (not `{cols, rows, tileSize}`)
- `distance_to()` returns tile units
- Broadcast data flows naturally (handlers put tile-center into broadcasts, allies receive tile-center)
- All distances in replay summaries converted to tiles

**Decision: No soma versioning.** User preference — just clear localStorage manually when format changes. Keeps the code simpler.

### Part 2: Precinct Progression

5 precinct levels with scaling difficulty:

| Precinct | Escapes | Officers | Extractions | Speed | LOS | Timer |
|----------|---------|----------|-------------|-------|-----|-------|
| Patrol | 0 | 4 | 3 | 95 | 8 | 90s |
| Alert | 3 | 5 | 3 | 100 | 8 | 80s |
| Pursuit | 7 | 6 | 2 | 105 | 9 | 70s |
| Manhunt | 12 | 7 | 2 | 108 | 10 | 60s |
| Lockdown | 18 | 8 | 2 | 112 | 10 | 55s |

**New types**: `PrecinctConfig`, `PRECINCT_CONFIGS`, `PlayerProgress` in `types.ts`

**4 new officer templates** (Mori, Briggs, Jain, Kowalski) — expanding roster from 4 to 8. Each has a nature analogy. New officers join as rookies when the precinct promotes; existing officers keep their evolved somas.

**Progress persistence**: `hot-pursuit-progress` key in localStorage stores `{totalEscapes, currentPrecinct}`. Reset button clears both progress and somas.

**Promotion flow in `game.ts`**:
- After each escape, increment totalEscapes, check if threshold crossed
- If promoted: apply new precinct config (speed, LOS, timer), load additional somas, show promotion overlay
- `startChase()` uses `precinct.officerCount` and `precinct.extractionCount`

**HUD**: precinct name + escape count shown between run number and timer.

**Promotion overlay**: "PRECINCT ALERT ELEVATED" with precinct name, officer count, 3.5s fade animation.

### Reflection Prompt Updates
- Explains tile-center coordinate system (center-origin, tile units, map bounds)
- All distances in tile units (closest approach, distance traveled, etc.)
- LOS range pulled from dynamic config (not hardcoded 8)
- Signal data documentation updated: `map_state = {halfWidth, halfHeight}`
- Config threaded through `reflectActant()` → `reflectAllActants()`

### What's Next
- Clear localStorage and playtest the full precinct progression
- Watch how officers handle the new coordinate system in their first reflection
- Check that promotion triggers correctly at escape thresholds
- Verify new officers (Mori, Briggs, Jain, Kowalski) spawn with correct defaults
- Consider: larger maps at higher precincts? Current map may feel crowded with 7-8 officers
- GTA-style visual overhaul still on the table for a future session

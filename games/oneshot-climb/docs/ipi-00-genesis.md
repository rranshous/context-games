# IPI Pass 00: Genesis

## Overview

Foundational pass - prove the core mechanic works: **inference generates code that changes the running game**.

Not trying to make a "good game" yet. Embracing chaos to find what's interesting.

## Related Docs

- [game-feel.md](game-feel.md) - target audience, pace, references
- [art-style.md](art-style.md) - Paper Pixels aesthetic, sprite format, palette
- [forge-mechanic.md](forge-mechanic.md) - the defend/create loop
- [code-injection.md](code-injection.md) - inference, parsing, safety

## Scope

**The minimal frame:**
- Single screen (not scrolling yet)
- Platforms to jump between
- Player character with movement + jump
- One forge on a platform
- Xbox controller support (Gamepad API)

**The core loop:**
1. Player activates forge
2. Inference runs (defend phase or just wait for now)
3. Item appears with generated code + sprite
4. Player picks up item
5. Item's code executes, changing the game world
6. Repeat - each item builds on the last

**No predetermined content:**
- No default enemies
- No default hazards
- No default abilities beyond move/jump
- Everything interesting comes from forged items

**The journal:**
- Each item has a prose description
- Descriptions accumulate as context for next generation
- Inference sees what came before, can build throughlines
- AI creates its own narrative/mechanical progression

**Win condition:**
- For now: item code can call `world.win()` to trigger win
- Chaos is fine - we're experimenting

## Goals

- [ ] Game frame: canvas, game loop, platforms, basic rendering
- [ ] Player: movement, jump, collision with platforms, Xbox controller input
- [ ] Forge: object in world, player can interact (button press when near)
- [ ] Inference integration: call vanilla platform API on forge activation
- [ ] Item generation: parse response, create item with sprite + code
- [ ] Code injection: compile and execute item hooks safely
- [ ] Journal: accumulate item descriptions, feed to next prompt
- [ ] World API: what items can do (spawn entities, modify player, win, etc.)

## Non-goals (for this pass)

- Side-scrolling / multiple rooms
- Enemy AI (items create whatever they create)
- Balancing
- Polish / juice
- Multiple forges
- Defend phase (can add later)

## Technical Notes

### Controller Input (Primary - No Keyboard/Mouse)

**Target: Xbox controller in browser, playing on TV**

The game should be fully playable with controller only. No mouse, no keyboard required.

```javascript
// Gamepad API - Xbox controller mapping
const gamepad = navigator.getGamepads()[0];
if (gamepad) {
  // Movement
  const leftStickX = gamepad.axes[0];  // -1 to 1
  const leftStickY = gamepad.axes[1];  // -1 to 1

  // Buttons (Xbox layout)
  const A = gamepad.buttons[0].pressed;  // Jump
  const B = gamepad.buttons[1].pressed;  // Cancel/Back?
  const X = gamepad.buttons[2].pressed;  // Interact (forge)
  const Y = gamepad.buttons[3].pressed;  // ?

  // Triggers/bumpers if needed later
  const LB = gamepad.buttons[4].pressed;
  const RB = gamepad.buttons[5].pressed;
}
```

**Control scheme:**
- Left stick: Move left/right
- A button: Jump
- X button: Interact with forge / Pick up item
- Start: Pause? (later)

**No menus requiring mouse** - all UI navigable with controller.

### World API (exposed to item code)
```javascript
world = {
  player: { x, y, health, ... },
  entities: [],
  spawn(type, x, y, behavior) { ... },
  win() { ... },
  // TBD: what else?
}
```

### Journal in prompt
```
## Previous Items (newest first)
1. "Flame Aura" - Surrounds player with fire, damages nearby entities
2. "Angry Slime" - Spawned a green blob that bounces and hurts on contact

Create the next item. Build on what exists.
```

## Milestones

### M1: Static Frame ✅
- [x] HTML5 canvas setup
- [x] Game loop (requestAnimationFrame)
- [x] Draw platforms (static rectangles for now)
- [x] Draw player (sprite from palette)
- [x] Draw forge (sprite from palette)

### M2: Player Movement ✅
- [x] Keyboard input (arrows/WASD)
- [x] Xbox controller input (Gamepad API)
- [x] Horizontal movement
- [x] Jump with gravity
- [x] Platform collision (stand on platforms)

### M3: Forge Interaction ✅
- [x] Detect player near forge
- [x] Show interaction prompt
- [x] Button press triggers forge activation
- [x] Placeholder "forging" state with progress bar
- [x] "Ready" state with collect prompt
- [x] Full idle → forging → ready → idle cycle

### M4: Inference Integration ✅
- [x] Call vanilla platform API (Haiku model)
- [x] Construct generation prompt with world API docs
- [x] Parse pure JS response (not JSON)
- [x] Handle failures gracefully ("creation unstable")

### M5: Code Injection ✅
- [x] Compile item hooks from strings
- [x] Execute onPickup when player touches item
- [x] Try/catch wrapper for safety
- [x] Basic forbidden pattern check
- [x] Item detail panel (left of game area)
  - Short description (journal-style prose)
  - Technical description (what actually happens)
  - Item sprite preview
- [x] Player health bar and damage system

### M6: The Loop
- [x] Forge produces item after inference
- [x] Item appears in world with generated sprite
- [x] Player picks up item, code runs
- [ ] Journal tracks item descriptions
- [ ] Next forge uses journal in prompt

## Progress

*Status: M1-M5 mostly complete. Health system working. Ready to test enemy spawning and implement item detail panel.*

---

## Session Notes

### 2026-02-01: Initial Implementation

**M1 & M2 Complete:**
- Created `index.html` with full game frame
- Paper Pixels palette implemented (12 colors)
- ASCII sprite renderer working at 4x scale
- Player sprite (8x12), forge sprite (16x16), platform tiles
- Full physics: gravity, jumping, platform collision
- Xbox controller support (Gamepad API) + keyboard fallback
- Jump tuned: velocity -550, gravity 1200 for snappy feel

**Tools Created:**
- `tools/sprite-editor.html` - Paper Pixels sprite editor
  - Full palette with keyboard shortcuts
  - Draw/Erase/Fill/Pick tools
  - Live preview at 1x/2x/4x/8x
  - Playwright automation API for Claude collaboration
  - See `tools/README.md` for usage

**Infrastructure:**
- `package.json` and `build.sh` for deployment
- `.mcp.json` added to repo root for Playwright MCP

**Sprite Editor Workflow:**
- Created Playwright MCP integration for collaborative sprite editing
- Workflow: Claude loads sprite → User edits in browser → Claude reads result
- Successfully used to redesign player sprite (blue character with yellow eyes)

**Next:**
- Complete M3: forge activation triggers inference

### 2026-02-01: M3 Complete

**Forge Interaction Implemented:**
- Added forge state machine: `idle` → `forging` → `ready` → `idle`
- Forging state shows pulsing yellow glow + progress bar (2 second duration)
- Ready state shows sparkle effect + "[E] Collect!" prompt
- Player can activate forge with E/X when nearby
- Full interaction loop working

**Testing Setup:**
- Vanilla platform should be running (`cd platforms/vanilla && npm run dev`)
- Use Playwright MCP to test at `http://localhost:3000` (or `http://localhost:8765` for local dev server)
- Keyboard events need `code: 'KeyE'` format for proper detection

**Next:**
- M4: Inference integration (user wants Haiku model)

### 2026-02-01: M4 Complete - Inference Integration

**Inference Pipeline Working:**
- Added `generateItem()` function that calls vanilla platform API
- Using `claude-haiku-4-5-20251001` for fast gameplay inference
- Prompt includes world API docs, palette, constraints, example
- Journal context fed to prompt for narrative continuity

**Code Injection Working:**
- AI returns pure JavaScript (not JSON) - cleaner, no escaping issues
- Two-pass execution: validate/capture metadata first, execute effects at pickup
- Forbidden pattern check (window, document, fetch, eval, etc.)
- Try/catch wrapper for safety

**World API Implemented:**
- `world.defineEntity(name, def)` - create entity types with sprites
- `world.spawn(type, x, y)` - spawn entities
- `world.onUpdate(callback)` - per-frame logic
- `world.onPlayerHit(callback)` - damage handlers
- `world.damageNearby(x, y, radius, amount)` - area damage
- `world.win()` - trigger win condition

**Player API Implemented:**
- `player.x, player.y` - position (read-only)
- `player.addSpeed(multiplier)` - affects movement
- `player.addJumpPower(amount)` - affects jump height
- `player.heal/damage(amount)` - placeholders

**First Generated Item - "Chronosphere":**
- Teal orb sprite
- +15% speed, +25 jump power
- Spawns 8 pink "echo" entities in circle every 8 seconds
- Heals player when hit during slow time
- All effects working correctly!

**Next:**
- M5: Polish code injection (timeout protection, better error handling)
- M6: Complete the loop (journal, multiple forges, win condition)

### 2026-02-01: World API Discovery Session

**Methodology:**
- Used Playwright to automate forge interactions
- Generated 5+ items and analyzed what the model tried to do
- Documented patterns in model output to inform API design

**Items Generated:**

1. **Chrono Shard** - Time slow effect with visual particles
2. **Singularity Core** - Gravity pull toward player
3. **Void Echo** - Spawns hostile phantom duplicates behind player
4. **Causality Rupture** - Rewind effect with collapse damage
5. **Temporal Anchor** - Time freeze zones that trap enemies

**What the Model Consistently Tries to Do:**

| Pattern | Example Code | Status |
|---------|--------------|--------|
| Read entity position | `entity.x`, `entity.y` | ❌ Not exposed |
| Write entity position | `entity.x += force * dt` | ❌ Not exposed |
| Read/write velocity | `entity.vx *= 0.85` | ❌ Entities have no velocity |
| Check entity type | `entity.type === "phantom"` | ❌ Not exposed |
| Modify entity health | `entity.health -= 12` | ❌ No health system |
| Add custom properties | `enemy.frozen = true` | ❌ Not supported |
| Create hostile entities | `friendly: false` | ✅ Works! |
| Use `world.damageNearby()` | | ✅ Works |
| Use `player.addSpeed()` | | ✅ Works |
| Track with `setTimeout` | | ⚠️ Works but uncontrolled |

**Specific Patterns Observed:**

1. **Orbital/Following Entities**
   - Model wants entities that orbit the player
   - Needs to update entity positions each frame
   - Example: Prism of Fracture tried to make shards orbit

2. **Enemy Slowing/Freezing**
   - Very common pattern: slow or stop enemy movement
   - Tries to modify `vx`/`vy` directly
   - Example: Chrono Shard, Temporal Anchor

3. **Movement-Triggered Spawning**
   - Spawn entities based on player movement distance
   - Tracks `lastSpawnX/Y` and spawns when delta exceeds threshold
   - Example: Void Echo spawns phantoms in player's wake

4. **Distance-Based Effects**
   - Constantly calculates distance: `Math.sqrt(dx*dx + dy*dy)`
   - Applies effects when within radius
   - Example: Singularity Core pulls enemies closer

5. **Damage/Health Manipulation**
   - Expects entities to have health that can be modified
   - Tries direct assignment: `entity.health -= amount`
   - Example: Causality Rupture deals 12 damage to nearby entities

6. **Hostile Entity Creation**
   - Model correctly uses `friendly: false` to create enemies
   - Void Echo created phantoms that damage the player!
   - Damage system works - saw "Player hit by phantom for 2" spam

**API Improvements Needed:**

```javascript
// Entities need these properties:
entity.x, entity.y       // Position (read/write)
entity.vx, entity.vy     // Velocity (read/write)
entity.type              // What kind of entity (read)
entity.health            // Health points (read/write)

// Entity movement should be automatic:
// Each frame: entity.x += entity.vx * dt

// Nice to have:
world.getEntitiesOfType(type)
world.getEntitiesInRadius(x, y, radius)
entity.id                // Unique identifier for tracking
```

**Console Spam Issues:**
- `world.damageNearby()` logs every call - floods console
- `world.onPlayerHit()` fires every frame when touching enemy
- Need to throttle or debounce these for sanity

**Next Steps:**
- Implement entity position/velocity properties
- Add entity movement to update loop
- Expose `entity.type` for type checking
- Consider entity health system

### 2026-02-01: Explorer Claude - Autonomous Playtesting Agent

**Concept:**
User proposed embedding a "Claude" into the game that can autonomously play, observe item generation, and report API findings - essentially farming out API refinement work to sub-agents that don't pollute the main conversation context.

**Implementation Complete:**
Added Explorer Claude panel to `index.html` (lines ~29-170 CSS, ~152-179 HTML, ~1270-1430 JS)

**Components Built:**

1. **Explorer Panel UI** (collapsible sidebar)
   - Status display (running/idle/error)
   - Real-time game state: player position, forge state, items, entities
   - API observations list (successes/failures)
   - Log console
   - Run/Stop controls

2. **Programmatic Player Control**
   - `explorerInput` object overrides keyboard/gamepad when running
   - Actions: move left/right, jump, interact
   - Async action execution with timing

3. **Observation Hooks**
   - `createInstrumentedProxy()` wraps World and Player APIs
   - Catches undefined property access (API misses)
   - Logs successful API method calls
   - Reports saved to `window.explorerReport`

4. **Exploration Loop**
   - Heuristic-based decision making (no inference needed for simple navigation)
   - State machine: move to forge → activate → wait → collect item → repeat
   - Handles item spawning above player (jumps to collect)

**Test Results (first run):**
- ✅ 14 items collected autonomously
- ✅ 100 entities spawned by item effects
- ✅ API observations working (world.spawn, defineEntity, onUpdate, damageNearby, player.heal, player.addSpeed)
- ✅ Report generation working
- ⚠️ 0 API misses detected - Haiku stays within documented API

**Key Finding:**
Haiku generates code that respects the documented API. No attempts to use undocumented properties like `entity.vx` or `world.getEntitiesInRadius()`. This suggests:
1. The prompt/examples are effective at constraining behavior
2. To discover API gaps, we may need to explicitly encourage experimentation
3. Or generate many more items to find edge cases

**Items Generated During Test:**
- Prism Shard (shield, heal)
- Gravity Well (orbit entities)
- Chrono Fracture (echo spawns, speed boost)
- Void Mirror (reflection, player hit callback)
- Resonance Tuner (harmonic waves)
- Catalyst Bloom (decay waves)
- Parasitic Vine (vine tendrils, heal on damage)
- Chronos Shard (slow fields, speed boost)
- Resonance Tuning Fork (echo spawns)
- Echoing Recursion (clone spawns, speed boost)
- Prism of Convergence (prism clones, convergence pulses)
- Fracture Cascade (shockwaves, fractured echoes)

**Code Locations:**
- Explorer CSS: `index.html` lines 29-170
- Explorer HTML: `index.html` lines 152-179
- Explorer JS: `index.html` lines 1270-1430
- Instrumented Proxy: `index.html` lines 1060-1100
- Modified collectItem: `index.html` lines 1103-1135
- Modified getInput: `index.html` lines 610-660

**Future Improvements:**
1. Use inference for smarter action decisions (currently heuristic)
2. Add "experimental mode" that encourages Haiku to try unsupported patterns
3. Parallel explorers with different prompts
4. Longer runs (50+ items) to find statistical API gaps
5. Direct entity observation hooks (not just API calls)

**Usage:**
1. Open game at `http://localhost:3000/dev/oneshot-climb/index.html`
2. Click arrow button on right edge to expand Explorer panel
3. Click "Run (10 forges)" to start
4. Watch observations and log
5. Report saved to `window.explorerReport` when stopped

### 2026-02-01: Explorer Code Analysis + API Refinement Session

**Explorer Improvements Made:**
- Added static code pattern analyzer (`API_PATTERNS` array, `analyzeGeneratedCode()`)
- Explorer now captures generated code for each item
- Report shows patterns the model tried to use (not just runtime misses)
- `window.explorerReport.generatedItems` contains all raw code for inspection

**10-Item Run Patterns Detected:**
```
world.entities (direct): 4x
entity.x (read): 3x
entity.y (read): 3x
entity.x (write): 1x
entity.y (write): 1x
forEach entities: 1x
setTimeout: 1x
```

**Critical Finding: Model IS Creating Enemies**
The model uses `friendly: false` to create hostile entities. Example from "Entropy Catalyst":
```javascript
world.defineEntity("void_rift", {
  damage: 8,
  lifetime: 1.5,
  friendly: false  // <-- THIS MAKES IT AN ENEMY
});
```
But enemies just sit there - no movement, no AI, no pursuit.

**What Model Tries To Do With Entities (from generated code):**

1. **Pull/push entities** (Singularity Siphon, Quantum Anchor):
   ```javascript
   e.vx = Math.cos(angle) * 200;  // FAILS - vx not exposed
   e.vy = Math.sin(angle) * 200;
   ```

2. **Teleport entities** (Quantum Anchor):
   ```javascript
   entity.x = player.x + offset;  // FAILS - x not writable from item code
   entity.y = player.y + offset;
   ```

3. **Kill entities** (Singularity Siphon):
   ```javascript
   e.health = 0;  // FAILS - health not exposed
   ```

4. **Query entities** (Paradox Engine, Convergence Core):
   ```javascript
   world.entities.filter(e => e.type === "rift")  // WORKS (direct access)
   world.entities.filter(e => !e.friendly)        // WORKS
   ```

5. **Check entity type**:
   ```javascript
   e.sprite.includes('w')  // Hacky workaround since e.type not exposed
   ```

**API Gaps To Fill (Priority Order):**

| Feature | What Model Tries | Current State | Priority |
|---------|------------------|---------------|----------|
| `entity.vx/vy` | Set velocity to move entities | Not exposed | HIGH |
| `entity.x/y` write | Teleport/reposition entities | Not writable | HIGH |
| `entity.health` | Damage/kill entities | Not exposed | MEDIUM |
| `entity.type` | Check what kind of entity | Not exposed | MEDIUM |
| Auto-movement | Entities should move by vx/vy each frame | Not implemented | HIGH |

**Enemy AI Patterns Model Wants:**
- Enemies that chase player
- Enemies that patrol/wander
- Enemies that can be pushed/pulled
- Enemies that can be killed

**Next Session TODO:**
1. Expose `entity.x`, `entity.y` as read/write
2. Add `entity.vx`, `entity.vy` velocity properties
3. Update `updateWorld()` to apply velocity: `entity.x += entity.vx * dt`
4. Expose `entity.type` for type checking
5. Add `entity.health` and death when health <= 0
6. Consider `world.removeEntity(entity)` or `entity.destroy()`

**Code Locations:**
- Pattern analyzer: `index.html` lines ~582-640
- Explorer object: `index.html` lines ~1437-1760
- Entity update loop: `index.html` lines ~1150-1190 (needs velocity integration)

---

## Quick Start for Next Session

**The Big Picture:**
This is a roguelike where items are generated by AI inference. The item code can call a World API to affect the game. We're iteratively discovering what the World API needs by watching what the AI *tries* to do.

**Current Status: ✅ Core loop working + Item panel done!**
- Items generate with mixed effects (good + bad tradeoffs)
- Enemies spawn and chase player
- Player health system working (damage, heal, i-frames)
- Entity death system working (health → 0 = removed)
- Item detail panel shows sprite, description, and parsed effects

**What Works:**
- `world.spawn()`, `world.defineEntity()`, `world.removeEntity()`
- `world.getEntitiesInRadius()`, `world.getEntitiesOfType()`
- `world.damageNearby()`, `world.onUpdate()`, `world.onPlayerHit()`
- `player.heal()`, `player.damage()`, `player.addSpeed()`, `player.addJumpPower()`
- Entity velocity (`e.vx`, `e.vy`) and health (`e.health`)
- Item panel (left side): sprite preview, description, color-coded effects
- Death = instant respawn at full HP (keeps items/buffs, just resets health)

**Status:** Exploration phase - seeing what the game wants to be.

**To Test:**
1. `cd platforms/vanilla && npm run dev`
2. Open `http://localhost:3000/dev/oneshot-climb/index.html`
3. Use Explorer Claude (right panel) or play manually
4. Check `window.explorerReport` for generated item analysis

**Key Files:**
- `games/oneshot-climb/index.html` - entire game in one file
- `games/oneshot-climb/docs/ipi-00-genesis.md` - this doc, session notes

**Key Code Locations:**
- Item prompt: `buildItemPrompt()` around line ~630
- World API: `world` object around line ~1150
- Player API: `playerAPI` object around line ~1240
- Explorer Claude: lines ~1550-1800

### 2026-02-01: Entity Movement & Health System

**API Improvements Implemented:**

1. **Entity Velocity** (`entity.vx`, `entity.vy`)
   - Entities now have velocity properties initialized in `world.spawn()`
   - Velocity is applied each frame in `updateWorld()`
   - Non-flying hostile entities have half-gravity for floatier feel
   - Entities are kept on screen with simple bounds checking

2. **Entity Health & Death**
   - Entities have `health` property (default 10)
   - Entities are removed when `health <= 0`
   - `world.damageNearby()` now properly damages entities

3. **New World Methods**
   - `world.removeEntity(entity)` - explicitly remove an entity
   - `world.getEntitiesInRadius(x, y, radius)` - find nearby entities
   - `world.getEntitiesOfType(type)` - find entities by type

4. **Entity Definition Options**
   - `flying: true` - entity ignores gravity
   - `health: N` - initial health points
   - `vx: N, vy: N` - initial velocity

5. **Updated Prompt Example**
   - Changed from simple fire trail to "Gravity Well" example
   - Demonstrates orbiting entities, `getEntitiesOfType()`, `getEntitiesInRadius()`
   - Shows entity velocity manipulation for gravity pull effect

**Explorer Run Results (10 items):**

Items Generated:
1. Chronosphere - time slow, spawn echoes
2. Temporal Anchor - freeze enemies between anchors
3. Causality Breach - spawn vengeful echoes of enemies
4. Entropy Engine - enemies decay and crumble
5. Paradox Mirror - reflect attacks back
6. Nexus Convergence - temporal rifts pull enemies
7. Chrono Cascade - time shards slow causality
8. Void Anchor - inverted gravity zones
9. Resonance Prism - attacks splinter into shards
10. Entropy Bloom - corrupted flowers spread chaos

**Code Patterns Detected:**
```
world.getEntities*(): 13x    ✅ New API heavily used!
world.removeEntity(): 3x     ✅ New API used
forEach entities: 4x         ✅ Iteration working
entity.x (read): 1x          ✅ Position readable
entity.y (read): 1x          ✅ Position readable
entity.type: 1x              ✅ Type checking works
```

**Runtime API Misses: 0** - The new API is comprehensive!

**Observations:**
- New query methods (`getEntitiesInRadius`, `getEntitiesOfType`) are heavily used
- Model now uses `world.removeEntity()` for cleanup
- Entity position and type access working correctly
- Enemies now move via velocity - no longer stationary blobs!
- Player damage spam visible (85 entities, many hostile)

**Next Steps for M5/M6:**
1. **Update prompt to encourage enemy spawning** (see "Immediate Problem" above)
   - Items can be good, bad, or mixed - need variety
   - Enemy patterns: single, horde, drip, triggered
2. Implement player health bar and death/respawn
3. Add entity-to-entity collision (not just player)
4. Consider `entity.destroy()` as alias for `world.removeEntity(entity)`
5. Add entity knockback on hit

### 2026-02-01: Enemy Variety & Health System

**Prompt Updates for Item Variety:**
- Added explicit instructions: 30% pure good, 30% pure bad, 40% mixed
- Added second example "Cursed Totem" showing hostile entity spawning
- Prompt now includes enemy count with hints ("⚠️ NO ENEMIES!")

**Player Health System Implemented:**
- Health bar in top-left corner (green → yellow → red)
- 0.5s invincibility frames after damage (player flickers)
- `playerAPI.damage()` and `playerAPI.heal()` now work
- Hostile entity collision triggers damage

**Explorer Run Results (10 items):**

| Item | Type | Effect |
|------|------|--------|
| Volatile Core | MIXED | Speed + spawns persistent hunter |
| Temporal Fracture | MIXED | Slow time + spawns glitchy anomalies |
| Parasitic Bloom | MIXED | Heal + spawns aggressive growths |
| Void Anchor | MIXED | Slows enemies + drains YOUR health |
| Echoing Reflection | MIXED | Mirror ally + can turn against you |
| Sanctuary Pulse | GOOD | Healing wave + damages ALL hostiles |
| Fractured Mirror | MIXED | Multiple copies + weakens you |

**Key Validations:**
- ✅ Enemies spawning from items (hunters, anomalies, growths)
- ✅ Enemies damaging player (health went 100 → 0 multiple times!)
- ✅ Positive items killing enemies ("Entity died: anomaly")
- ✅ Health system working (heal/damage cycle visible)
- ✅ Mixed items are the default - exactly what we wanted!

**Minor Issue:**
- TypeError spam at line 1382 - item code tries to write to read-only props
- Error is caught and logged, game continues - not blocking

**Next Steps:**
1. ~~Item detail panel (icon + short + technical description)~~ ✅ DONE
2. Player death/respawn (currently stays dead)
3. Maybe reduce enemy damage or add healing items more frequently

### 2026-02-01: Item Detail Panel

**Implementation Complete:**
Added left-side panel that shows details of the last collected item.

**Components:**
1. **CSS** (lines ~202-340): Panel styling matching Explorer panel aesthetic
2. **HTML** (lines ~358-382): Collapsible panel structure
3. **JavaScript** (`itemPanel` object, lines ~1836-2000):
   - `init()` - Set up panel toggle
   - `parseEffects(code)` - Analyze item code for technical effects
   - `renderSprite(sprite)` - Draw sprite to canvas at 8x scale
   - `update(item)` - Update panel with new item data

**Effect Detection:**
The panel parses generated item code to detect:
- `player.addSpeed()` → "+X% speed" (green/red based on sign)
- `player.addJumpPower()` → "+X jump power" (green/red)
- `player.heal()` → "Heals X HP" (green)
- `player.damage()` → "Deals X damage to you" (red)
- `world.defineEntity()` + `world.spawn()` → "Spawns friendly/hostile X" (green/red)
- `world.damageNearby()` → "Damages nearby enemies" (green)
- `world.onUpdate()` → "Has ongoing effects" (neutral)
- `world.onPlayerHit()` → "Triggers on taking damage" (neutral)
- `world.win()` → "Can win the game!" (green)

**Features:**
- Auto-expands when item is collected
- Color-coded effects (good=green, bad=red, neutral=blue)
- Sprite rendered at 8x scale for visibility
- Shows prose description from AI

**Code Locations:**
- Item panel CSS: `index.html` lines ~202-340
- Item panel HTML: `index.html` lines ~358-382
- itemPanel object: `index.html` lines ~1836-2000
- collectItem hook: `index.html` line ~1510

**Test Results:**
Items tested during 10-forge Explorer run:
- Volatile Catalyst: +30% speed, +40 jump, spawns hostile reactor
- Temporal Echo: spawns echo entities
- Symbiotic Parasite: +30% speed, +30 jump, deals 8 damage, spawns parasite
- Chronosphere Fracture: heals 15 HP, spawns rifts
- Void Siphon: spawns hostile voidling, has ongoing effects

### 2026-02-01: Simple Death/Respawn

Player now respawns at full health when HP hits 0. Simple reset to keep exploration going - no game over, no position reset, just health restored. Real death mechanics can come later once we know what the game is.

**Next Steps:**
- Continue exploring gameplay possibilities
- See what interesting item combinations emerge
- Figure out what this game wants to be

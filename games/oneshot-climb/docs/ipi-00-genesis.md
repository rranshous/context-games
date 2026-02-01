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

### M5: Code Injection
- [ ] Compile item hooks from strings
- [ ] Execute onPickup when player touches item
- [ ] Try/catch wrapper for safety
- [ ] Basic forbidden pattern check

### M6: The Loop
- [ ] Forge produces item after inference
- [ ] Item appears in world with generated sprite
- [ ] Player picks up item, code runs
- [ ] Journal tracks item descriptions
- [ ] Next forge uses journal in prompt
- [ ] World can be won via API

## Progress

*Status: M1-M4 complete, ready for M5 (code injection polish) and M6 (the loop)*

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

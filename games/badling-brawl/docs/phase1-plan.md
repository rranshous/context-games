# Badling Brawl - Phase 1: Foundation

## Goal
Build the core game loop: one duck, enemies, auto-attack, eggs, health, death/restart.

## Tech Approach
- **Pure vanilla** - HTML5 Canvas, no external libraries
- **Single HTML file** - fits vanilla platform pattern
- **Modular code** - clean separation for future refactoring
- **Keyboard controls first** - gamepad in Phase 2

## Development & Testing
- **Dev URL**: `http://localhost:3000/dev/badling-brawl/index.html`
- **Use Playwright** to visually verify each milestone before committing
- **Commit after each milestone** passes verification

## MVP Features

### Player (Duck)
- Rendered as simple shape (circle/sprite placeholder)
- 8-directional movement (WASD or arrow keys)
- Health bar (starts at 100)
- Takes damage on enemy collision
- Death state → restart option

### Weapons (Auto-fire)
- **Peck** - short range, fast attack, single target
  - Range: ~50px
  - Damage: 10
  - Cooldown: 0.3s
  - Auto-targets nearest enemy in range
- **Quack Blast** - medium range cone, knockback (add in later milestone)

### Enemies
- **Fox** - medium speed, moves toward player
  - Health: 30
  - Damage on contact: 10
  - Speed: moderate
- Spawn from screen edges
- Drop eggs on death

### Economy
- Eggs drop from dead enemies
- Walk over eggs to collect
- Egg counter displayed on screen
- (Shop comes in Phase 3)

### Waves
- Timed waves (~45 seconds)
- Wave counter displayed
- Enemies spawn in increasing numbers
- Brief pause between waves (3 sec)

### UI
- Health bar
- Egg counter
- Wave counter
- Game over screen with restart button

## Implementation Milestones

### M1: Game Loop & Player ✅
- [x] HTML/Canvas setup
- [x] Game loop (requestAnimationFrame)
- [x] Player rendering (colored circle)
- [x] Keyboard input (WASD)
- [x] Player movement with bounds

### M2: Sprites (Timeboxed) ✅
- [x] Investigate sprite pack layout
- [x] Load and render duck sprite
- [x] Basic sprite animation (if feasible)
- [ ] ~~Skip if too complex, revisit later~~ (worked!)

### M3: Enemies ✅
- [x] Fox entity (using cat sprites)
- [x] Spawn system (from edges)
- [x] Movement toward player
- [x] Collision detection (player-enemy)
- [x] Player takes damage

### M4: Combat ✅
- [x] Peck attack (auto-fire)
- [x] Enemy takes damage
- [x] Enemy death
- [x] Egg drop on death
- [x] Egg collection
- [x] Visual attack feedback (yellow beam from bill + impact burst)

### M5: Game State ✅
- [x] Health system & death
- [x] Game over screen
- [x] Restart functionality

### M6: Wave Progression
- [ ] Wave timer
- [ ] Wave counter
- [ ] Increasing enemy count per wave
- [ ] Brief pause between waves

### M7: Polish & Balance
- [ ] UI elements (health bar, counters)
- [ ] Basic balance tuning
- [ ] Visual feedback (damage flash, etc.)

## Code Structure (Modules)

```
// Logical separation within single HTML file:

// === CONSTANTS ===
// Game settings, colors, sizes

// === STATE ===
// Player, enemies, eggs, wave, gameState

// === INPUT ===
// Keyboard handling

// === ENTITIES ===
// Player, Enemy, Egg, Projectile classes/factories

// === SYSTEMS ===
// Movement, Combat, Collision, Spawning, Wave

// === RENDERING ===
// Draw functions for all entities

// === GAME LOOP ===
// Update + render cycle

// === INIT ===
// Setup and start
```

## Definition of Done
- [ ] Player can move around the arena
- [ ] Foxes spawn and chase player
- [ ] Peck auto-attacks nearby enemies
- [ ] Enemies die and drop eggs
- [ ] Player collects eggs (counter increments)
- [ ] Player can die (game over screen)
- [ ] Waves progress with increasing difficulty
- [ ] Game can be restarted
- [ ] Runs smoothly at 60fps

## Open Questions
- ~~Arena size?~~ → Fullscreen/responsive
- ~~Art style direction?~~ → Cartoony (Robby exploring sprite packs)

---

*Status: Plan Complete*
*Next: Implementation*

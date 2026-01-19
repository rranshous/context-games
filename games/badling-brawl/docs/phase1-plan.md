# Badling Brawl - Phase 1: Foundation

## Goal
Build the core game loop: one duck, enemies, auto-attack, eggs, health, death/restart.

## Tech Approach
- **Pure vanilla** - HTML5 Canvas, no external libraries
- **Single HTML file** - fits vanilla platform pattern
- **Modular code** - clean separation for future refactoring
- **Keyboard controls first** - gamepad in Phase 2

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

### M1: Game Loop & Player
- [ ] HTML/Canvas setup
- [ ] Game loop (requestAnimationFrame)
- [ ] Player rendering (colored circle)
- [ ] Keyboard input (WASD)
- [ ] Player movement with bounds

### M2: Sprites (Timeboxed)
- [ ] Investigate sprite pack layout
- [ ] Load and render duck sprite
- [ ] Basic sprite animation (if feasible)
- [ ] Skip if too complex, revisit later

### M3: Enemies
- [ ] Fox entity
- [ ] Spawn system (from edges)
- [ ] Movement toward player
- [ ] Collision detection (player-enemy)
- [ ] Player takes damage

### M4: Combat
- [ ] Peck attack (auto-fire)
- [ ] Enemy takes damage
- [ ] Enemy death
- [ ] Egg drop on death
- [ ] Egg collection

### M5: Game State
- [ ] Health system & death
- [ ] Game over screen
- [ ] Restart functionality

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

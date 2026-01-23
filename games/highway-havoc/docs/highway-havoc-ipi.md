# Highway Havoc - IPI Documentation

## Introduce

**Highway Havoc** is a cooperative 2-player HTML5 game where players work together to survive an endless highway filled with enemies and obstacles.

**Core Concept:**
- **Player 1 (Driver):** Controls vehicle movement, must stay on road and dodge obstacles
- **Player 2 (Gunner):** Aims turret and shoots enemies
- **Goal:** Survive as long as possible, rack up high scores
- **Style:** Top-down pixel art, GTA 1/2 inspired vehicles

**Tech Stack:**
- Vite + TypeScript + Canvas
- Gamepad API for Xbox controller support
- Single HTML file for itch.io deployment

**Testing Challenges:**
- Gamepad input requires manual testing
- 2-player cooperative mechanics need both controllers
- Will focus on automated tests for collision, rendering, and game logic
- Visual inspection for canvas output and gameplay feel

## Plan

### Milestone 1: Project Setup + Canvas + Gamepad Input
**Goal:** Basic game loop running with gamepad detection and input handling.

**Tasks:**
- [ ] Project directory structure created
- [ ] Vite + TypeScript setup working
- [ ] Canvas rendering basic road and placeholder text
- [ ] Gamepad API integration - detect connected controllers
- [ ] Basic input polling for both players
- [ ] Game loop (update/render) established

**Acceptance Criteria:**
- Game loads in browser without errors
- Canvas shows basic road visualization
- Console logs show connected gamepads
- Input values logged for both players

**Testing:**
- Automated: Canvas rendering, game loop timing
- Manual: Gamepad connection detection

---

### Milestone 2: Scrolling Road + Player Vehicle Movement
**Goal:** Endless scrolling road with player vehicle that responds to driver input.

**Tasks:**
- [ ] Road scrolling system (continuous generation)
- [ ] Player vehicle sprite rendering (top-down)
- [ ] Driver controls: left stick steering, vehicle physics
- [ ] Road boundaries and off-road penalties
- [ ] Basic vehicle movement constraints

**Acceptance Criteria:**
- Road scrolls continuously downward
- Vehicle moves left/right with gamepad input
- Vehicle stays within road bounds
- Visual feedback for off-road areas

**Testing:**
- Automated: Vehicle position bounds, road generation
- Manual: Steering responsiveness, visual road scrolling

---

### Milestone 3: Gunner Turret Aiming + Shooting
**Goal:** Second player can aim turret and fire projectiles.

**Tasks:**
- [ ] Turret sprite attached to vehicle
- [ ] Gunner controls: right stick aiming (360°)
- [ ] Projectile system (bullets from turret)
- [ ] Basic shooting mechanics and ammo display
- [ ] Visual feedback for shooting

**Acceptance Criteria:**
- Turret rotates with right stick input
- Bullets fire in aimed direction
- Ammo counter updates in UI
- Shooting has visual/audio feedback

**Testing:**
- Automated: Projectile trajectory calculations
- Manual: Aiming precision, shooting feel

---

### Milestone 4: Basic Enemies
**Goal:** Enemy vehicles spawn and move toward players.

**Tasks:**
- [ ] Enemy vehicle sprites and spawning system
- [ ] Basic enemy AI (approach player, simple patterns)
- [ ] Enemy collision detection
- [ ] Enemy destruction when shot
- [ ] Score system for destroyed enemies

**Acceptance Criteria:**
- Enemies spawn periodically
- Enemies move toward player vehicle
- Bullets destroy enemies on contact
- Score increases with enemy kills

**Testing:**
- Automated: Enemy spawning rates, collision detection
- Manual: Enemy AI behavior, destruction feedback

---

### Milestone 5: Obstacles + Collision
**Goal:** Road obstacles that both players must avoid/destroy.

**Tasks:**
- [ ] Obstacle sprites (mines, barriers, potholes)
- [ ] Obstacle spawning on road
- [ ] Collision detection for vehicle vs obstacles
- [ ] Damage/health system
- [ ] Some obstacles destroyable by shooting

**Acceptance Criteria:**
- Obstacles appear randomly on road
- Vehicle takes damage from collisions
- Health bar updates and shows damage
- Some obstacles can be shot to clear path

**Testing:**
- Automated: Collision detection accuracy, health calculations
- Manual: Damage feedback, obstacle avoidance

---

### Milestone 6: Upgrades + Pickups
**Goal:** Collectible items that upgrade vehicle and weapons.

**Tasks:**
- [ ] Pickup sprites and spawning
- [ ] Collection mechanics (drive over pickups)
- [ ] Upgrade system (weapon types, armor, speed)
- [ ] Temporary power-ups
- [ ] UI feedback for active upgrades

**Acceptance Criteria:**
- Pickups spawn on road periodically
- Vehicle collects pickups on contact
- Upgrades apply immediately (faster shooting, more health, etc.)
- Visual indicators for active upgrades

**Testing:**
- Automated: Pickup spawning, upgrade application
- Manual: Upgrade effectiveness, visual feedback

---

### Milestone 7: Scoring + Game Over + Polish ✅ COMPLETED
**Goal:** Complete game experience with scoring, game over, and polish.

**Tasks:**
- [x] Score calculation (enemies, distance, pickups)
- [x] Game over screen when health reaches zero
- [x] High score persistence (localStorage)
- [x] Start screen and instructions
- [x] Performance optimizations
- [x] Visual polish and UI improvements

**Acceptance Criteria:**
- [x] Game ends when health depletes
- [x] Score displayed and saved
- [x] Start screen with controls explanation
- [x] Smooth 60fps performance
- [x] Professional presentation

**Testing:**
- [x] Automated: Score calculations, localStorage persistence
- [x] Manual: Full playthrough, visual polish, performance

## Implement

All milestones completed! Highway Havoc is ready for playtesting.

**Final Game Features:**
- ✅ Complete cooperative 2-player gameplay
- ✅ Gamepad support for Xbox controllers
- ✅ Endless scrolling highway with procedural generation
- ✅ Enemy AI and collision systems
- ✅ Upgrade and power-up systems
- ✅ Health/damage mechanics
- ✅ Scoring and high score persistence
- ✅ Professional UI and game states (menu, playing, game over)
- ✅ Performance optimized for 60fps gameplay

**Ready for Distribution:**
- Build with `npm run build:itch` for itch.io
- All assets included
- Cross-platform HTML5 compatibility
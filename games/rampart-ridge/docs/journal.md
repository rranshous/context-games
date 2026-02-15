# Rampart Ridge — Build Journal

## Session 1: M1 Visual Foundation + Tower Hopping (2026-02-09)

### What we built

The first playable slice — isometric cel-shaded valley with 6 tower pads, cursor navigation, and gamepad-driven tower hopping. Single self-contained `index.html`.

### Rendering pipeline (from dark-rider)

Copied the exact Three.js recipe from dark-rider:
- Render at 320x240, CSS upscale 3x with `image-rendering: pixelated`
- Orthographic isometric camera (frustum=14, position 18,22,18)
- 3-step toon gradient via `MeshToonMaterial` + `DataTexture`
- `BasicShadowMap` for hard pixel shadows, `FogExp2` for depth

Adapted the palette from green/nature to sci-fi frontier: dusty browns (`#3a3530`), metallic grays (`#5a5a6a`), energy teal (`#00ffcc`).

### Valley layout

6 tower pads in a 2x3 grid flanking a metal path. Canyon walls on both sides (box geometry with metal reinforcement strips). Energy gate at the bottom (glowing translucent barrier between two pillars). Spawn zone marker at the top. Ground has 40 random dust patches for texture.

### Cursor system

Grid-snapping navigation between the 6 pads. Visual indicator is a glowing torus ring that pulses with `sin(time)`. Gamepad d-pad and left stick (with threshold deadzone) both work. A-button hops in/out of towers.

### Key decision: Window API for Playwright testing

Exposed `window.gameState` (read) and `window.injectInput(playerIdx, action)` (write) for automated testing. `injectInput` returns a Promise that resolves after 2 `requestAnimationFrame` callbacks, ensuring the game loop has processed the input before the test reads state. This pattern lets Claude playtest via Playwright MCP tools after each milestone.

### Key decision: Input cooldown bypass for testing

Added 200ms cooldown between inputs to prevent accidental double-presses on gamepad. But `injectInput` resets the cooldown to 0 before queuing, so Playwright can fire inputs as fast as needed.

### Visual iteration

Initial scene was too dark — bumped ambient light, brightened ground/wall colors, increased sun intensity. The isometric cel-shaded look matched dark-rider immediately thanks to the shared rendering recipe.

---

## Session 2: M2 Combat Loop (2026-02-09)

### What we built

Enemies walk down the path, towers shoot them, gate takes damage. Complete wave system with scoring.

### Enemy system

4 enemy types with distinct silhouettes: drone (hovering hex box + red eye), scout (wedge cone), walker (bulky box on 4 legs), heavy mech (big body + shoulder guns + legs). Each has unique stats (HP, speed, damage, score). Drones and scouts get a `sin()` hover bob.

### Tower combat

Each tower type has genuinely different mechanics:
- **Laser**: Continuous beam (DPS * dt), renders as a thin oriented cylinder that flashes for ~3 frames
- **Missile**: Projectile with travel time, splash damage on impact, 1.0s cooldown
- **Shield**: Applies `slowFactor` to all enemies in range each frame (resets to 1 each frame, shield re-applies)
- **EMP**: Single-use stun (`stunTimer`) on all enemies in range, then 8s cooldown

### Key decision: Fire as hold-state

Fire is hold-based (hold RT / hold F), not press-based. This means the player must actively maintain fire — you can't just tap and walk away. This reinforces the "you ARE the tower" feeling. Implemented via `player.firing` boolean that's set from gamepad RT pressure / keyboard F state each frame.

### Wave system

6 hand-designed wave definitions with increasing difficulty (drones only → mixed → scout swarm → boss). Waves spawn enemies from a shuffled queue at the defined rate. Wave completes when all spawned and all dead.

### Death effects

Particle burst on kill — 6 small cubes launched in a ring with random upward velocity, subject to gravity, fading over 0.5s. Color matches the enemy type.

### Playwright verification

Tested full combat loop: hop into laser, start wave, fire at enemies, verify HP drops, verify kills give score, verify wave completion. All via `browser_evaluate` + `window.injectInput`.

---

## Session 3: M3 Build Phase + Economy (2026-02-09)

### What we built

Credits from kills, tower placement on empty pads, tower selling, build timer between waves.

### Key decision: Start with empty pads + 2 starters

Changed from 6 pre-built towers to 6 empty pads with only 2 starter towers (laser + missile). This gives the player agency from wave 1 — enough firepower to survive, but 4 empty pads to fill strategically.

### Tower pad refactoring

Split the monolithic `createTowerPad` into separate concerns:
- `createTowerPad(pos, index)` — creates the hexagonal platform base (always present)
- `buildTowerMeshes(towerType)` — creates a sub-group of tower meshes
- `buildTowerOn(towerData, towerType)` — attaches meshes + sets tower state
- `sellTower(towerData)` — removes meshes, evicts occupant, returns 50% refund

The `towerMeshGroup` sub-group pattern lets us add/remove tower meshes without touching the platform base.

### Build mode

Player enters build mode by pressing X/B on an empty pad. HUD shows the selected tower type and cost. Pressing X/B again cycles through types. A/Space confirms purchase (if affordable). Q/Escape cancels. Moving the cursor also cancels.

### Economy

- Credits = score (earned from kills, mirroring score value)
- Starting credits: 150 (enough for 2-3 towers)
- Tower costs: laser=50, shield=60, missile=75, emp=80
- Sell refund: 50% of cost
- Shared pool across all players

### Build timer

15 seconds between waves. Timer counts down in HUD. Auto-starts next wave when timer expires. START button skips the timer.

---

## Session 4: M4 Multiplayer (2026-02-10)

### What we built

4-player couch co-op with independent cursors, gamepad assignment, and gamepad-only HUD.

### Per-player cursors

Replaced per-tower-pad cursor rings with standalone per-player cursor meshes. Each player gets a torus ring in their color (P1=cyan, P2=red, P3=green, P4=yellow) with slightly different radii (1.4 + i*0.08) so they stack visually when multiple players are on the same pad.

### Gamepad assignment

Gamepads are assigned to player slots on connect (first available slot). On disconnect, the player is evicted from any occupied tower and deactivated (except P1 who stays active for keyboard fallback).

### HUD overhaul

Removed keyboard control references from the bottom hint bar (gamepad-only: D-PAD, A, X, B, RT, START). Added per-player status lines showing each active player's name, color, and current state (tower name, build menu, firing indicator).

### Key decision: `window.activatePlayer(idx)`

Added convenience function so Playwright can activate player slots without needing a real gamepad connect event. Essential for testing multiplayer scenarios.

### Playwright verification

Tested 2-player concurrent play: P1 in laser firing, P2 navigating and building. Verified both players' state updates independently, both can occupy different towers simultaneously.

---

## Session 5: M5 Polish (2026-02-11)

### What we built

Visual effects, game over state, restart, and difficulty scaling for endless play.

### Shield dome effect

Wireframe hemisphere (`SphereGeometry` with `wireframe: true`) appears when a shield tower is occupied and firing. Green emissive material, slowly rotating, opacity pulsing with `sin(time)`. Removed from scene when player stops firing or hops out. Managed via `tower.shieldDome` property — created on demand, cleaned up in a post-combat sweep.

### EMP pulse ring

Expanding torus ring on EMP discharge. Starts small, scales up to the EMP range over 0.6s while fading out. Purple emissive material. Replaced the old `spawnDeathEffect` call for EMP with `spawnEmpPulse`. Array-based lifecycle management (same pattern as death effects).

### Screen shake

Camera offset randomization on impact events. Intensity decays by 0.85x per frame. Triggered at different intensities:
- Gate hit by normal enemy: 0.6
- Gate hit by heavy: 1.5
- Heavy mech killed: 1.0
- EMP discharge: 0.4

Camera position resets to `cameraBasePos` when shake decays below 0.01.

### Game over + restart

Gate HP reaching 0 sets `gamePhase = 'gameover'`. Game systems (spawning, movement, combat) freeze, but visual effects (particles, pulses) keep updating. HUD shows red "GAME OVER". START button triggers `restartGame()` which clears all entities (enemies, projectiles, beams, effects, domes), resets towers to 2 starters, resets all state variables, and returns to idle.

### Difficulty scaling

Waves beyond the 6 defined ones reuse wave 6's composition but scale up:
- Extra enemies: +4 per scale step (`floor((scale-1) * 4)`)
- HP multiplier: 1.3x per step beyond wave 6
- Wave 7 = 1.3x, wave 8 = 1.6x, wave 9 = 1.9x, etc.

The `scale` variable was already computed in `beginNextWave` but unused. Now it drives both enemy count inflation and per-enemy HP scaling (applied at spawn time).

### Debug helper

Added `window.setGateHP(hp)` for testing game over without playing through waves. The `gateHP` variable is module-scoped, so this was the only way to reach it from Playwright.

### Playwright verification

Tested all effects in-browser:
- Shield dome: built shield tower, hopped in, fired — wireframe hemisphere visible in screenshot
- EMP pulse: built EMP, started wave, fired — enemies stunned (blinking)
- Game over: set gate HP to 3, let enemy through — "GAME OVER" in HUD, phase confirmed
- Restart: pressed START — full reset verified (idle, wave 0, gate 100%, 150 credits)
- Difficulty: skipped to wave 8 — scout HP=13 (normally 8), walker HP=96 (normally 60) = 1.6x correct

### Keyboard focus issue discovered

During manual playtesting, keyboard input appeared unresponsive. Root cause: the canvas doesn't auto-focus on page load, so key events don't reach the game until the user clicks the canvas. Not a code bug — standard browser behavior for canvas-based games. The game works correctly once focused.

---

## Session 6: Unmanned Auto-Fire + Aiming Overhaul (2026-02-15)

### What we built

Towers now auto-fire when no player is hopped in, with weaker stats. Hopping in gives manual control with boosted stats and directional aiming. This changed the core feel — you're no longer the only thing keeping towers alive, you're the boost that makes them deadly.

### Key decision: Towers always active

Previously towers only fired when occupied. Now every built tower auto-targets and fires on its own using `TOWER_STATS_UNMANNED` — reduced DPS, longer cooldowns, weaker effects. Hopping in switches to `TOWER_STATS` (the original values). The tension shifts from "which tower do I need to activate" to "which tower benefits most from my boost right now."

### TOWER_STATS_UNMANNED

| Stat | Manned | Unmanned |
|------|--------|----------|
| Laser DPS | 20 | 10 |
| Missile cooldown | 1.0s | 2.5s |
| Shield slow | 0.3 | 0.85 |
| EMP cooldown | 8s | 16s |

### Barrel rotation and aiming

Added `barrelMesh` pivot groups for laser and missile towers so barrels visually rotate toward targets. Two rotation speeds: manned (12) rotates quickly to follow player aim, unmanned (4) tracks sluggishly toward the auto-targeted enemy. The `aimDirection` and `_targetAimDirection` properties track current vs desired angle.

### Directional aiming for manned towers

New `findEnemyInCone()` function — manned laser and missile towers prioritize enemies within a 45-degree cone of the player's aim direction, falling back to closest-enemy if the cone is empty. This rewards good aim when piloting.

### Visual distinction: manned vs unmanned

- Laser beams render darker red (`0x993333`) when unmanned vs bright red (`0xff3333`) manned
- Shield domes are dimmer when unmanned (opacity 0.08 vs 0.15, smaller pulse)
- EMP screen shake is weaker unmanned (0.2 vs 0.4)
- Occupied indicator light pulses brighter/faster for manned towers vs dim pulse for unmanned active towers

### Other changes

- HUD controls updated to `[D-PAD] Move/Aim` reflecting the aiming mechanic
- `sellTower` now properly cleans up shield domes and resets barrel/aim state
- Shield slow uses `Math.min(e.slowFactor, stats.slowAmount)` so multiple shields don't over-stack
- EMP only discharges when enemies are actually in range (no wasted pulses on empty field)

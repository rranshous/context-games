# Rampart Ridge

A sci-fi tower defense game with active tower-hopping gameplay for up to 4 couch co-op players on gamepads.

## Platform

Uses the **vanilla platform** for hosting. No AI inference needed — pure gameplay.

- Dev server: `cd platforms/vanilla && npm run dev`
- Game URL: `http://localhost:3000/dev/rampart-ridge/index.html`

## The Vibe

**Inspiration:** Classic tower defense meets couch co-op action. Instead of passively watching towers shoot, you hop INTO towers and fire them yourself. The tension comes from deciding which tower needs you right now.

**Visual style:** Three.js isometric with cel-shading + low-res pixelated rendering (320x240 at 3x CSS upscale). Matches the dark-rider rendering recipe — toon gradient materials, BasicShadowMap, FogExp2. Sci-fi frontier palette: dusty terrain, metallic structures, energy glows.

**Target:** Gamepad-first couch co-op. 1-4 players on gamepads, keyboard fallback on P1 only.

## Core Concept

A canyon valley with 6 tower pads flanking a central path. Enemies spawn at the top and march toward your Energy Gate at the bottom. You hop between towers to activate them — they only fire when you're inside and holding the trigger.

### The Loop

1. **BUILD** — Place towers on empty pads with earned credits
2. **WAVE** — Enemies march. Hop between towers, fire the right one at the right time
3. **Survive** — Don't let the gate reach 0 HP
4. Repeat, scaling endlessly

### Tower Types

| Tower | Cost | Ability |
|-------|------|---------|
| Laser Turret (red) | 50 | Continuous beam, high single-target DPS |
| Missile Pod (blue) | 75 | Lock-on projectiles, area splash damage |
| Shield Generator (green) | 60 | Slows all enemies in range while active |
| EMP Pylon (purple) | 80 | Single-use area stun blast (long cooldown) |

### Enemy Types

| Enemy | Behavior |
|-------|----------|
| Drone | Basic, moderate speed, low HP |
| Scout | Fast, low HP, comes in swarms |
| Armored Walker | Slow, high HP, resistant |
| Heavy Mech | Boss-tier, high HP, big gate damage |

## Controls

### Gamepad (all players)
- **D-pad / Left stick**: Move cursor between tower pads
- **A button**: Hop in/out of tower
- **X button**: Build (on empty pad) / cycle tower type
- **B button**: Cancel build / sell tower
- **RT (hold)**: Fire tower ability
- **START**: Begin wave / restart after game over

### Keyboard (P1 only)
- **WASD / Arrows**: Move cursor
- **Space**: Hop in/out / confirm build
- **B**: Build / cycle tower type
- **Q / Escape**: Cancel build / sell
- **F / E (hold)**: Fire
- **Enter**: Begin wave / restart

## Multiplayer

Up to 4 players, each with their own colored cursor (cyan, red, green, yellow). Multiple players can occupy different towers simultaneously. Credits are shared. Players join when gamepads connect.

## Key Design Decisions

- **Single HTML file**: Entire game in one file, aligned with platform pattern
- **Fixed camera**: Whole valley visible at once — essential for multiplayer (everyone sees everything)
- **Grid-based navigation**: Cursor snaps between 6 tower pads, not free roaming — fast and intuitive on gamepad
- **Towers need a pilot**: The core mechanic. Towers don't auto-fire. You ARE the tower defense.
- **Shared economy**: All players spend from one credit pool — encourages communication

## Window API (for Playwright testing)

```javascript
window.gameState          // Read full game state
window.injectInput(idx, action)  // Simulate input (returns Promise)
window.startWave()        // Trigger next wave
window.skipToWave(n)      // Jump to wave N
window.setGateHP(hp)      // Set gate HP (debug)
window.activatePlayer(idx) // Activate a player slot
```

Actions: `'up'`, `'down'`, `'left'`, `'right'`, `'hop'`, `'fire'`, `'fire-stop'`, `'startwave'`, `'build'`, `'cancel'`

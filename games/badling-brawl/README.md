# Badling Brawl 🦆⚔️

A chaotic local co-op survival game where ducks defend their nest from waves of cats and dogs!

## Play

Open `index.html` in a browser, or serve locally:
```bash
python3 -m http.server 8080
# then visit http://localhost:8080
```

## Controls

### Join the Game
- **Keyboard**: Press any direction key (WASD or Arrows) to join
- **Gamepad**: Press any button or move stick to join
- First input device = P1, second = P2

### Movement
- **Keyboard**: WASD or Arrow keys
- **Gamepad**: Left stick or D-pad

### Actions
- **Attack**: Automatic! Ducks peck nearby enemies
- **Interact with Nest**: E key / A button (when near nest in home base)
- **Powers**: Auto-activate when enemies in range (once unlocked)

## Gameplay

### Objective
Survive waves of enemies! Collect eggs from defeated enemies and deposit them at the Attack Nest to unlock powerful abilities.

### The Home Base
- Safe zone in the center - enemies can't enter
- Contains the Attack Nest for upgrading powers
- Return here to heal up and deposit eggs

### Surge & Lull Rhythm
- **Surge** (45s): Heavy enemy spawns - fight hard!
- **Lull** (15s): Light spawns - time to recover and upgrade

### Powers (Attack Nest)
Deposit eggs to unlock abilities:
| Power | Cost | Effect |
|-------|------|--------|
| Quack Blast | 10 | Cone attack with knockback |
| Wing Slap | 25 | 360° spin attack |
| Egg Bomb | 45 | (Coming soon) |
| Feather Storm | 70 | (Coming soon) |

### Death & Respawn
- When you die, you leave the game temporarily
- Wait for respawn timer (difficulty × 3 seconds)
- Press direction to rejoin - but you lose all powers and eggs!
- Game over when ALL players are dead simultaneously

## Multiplayer

- **2 players** supported (3-player coming soon!)
- P1: White duck (top-left UI)
- P2: Yellow duck (top-right UI)
- Enemies chase the nearest player
- Shared Attack Nest - first to claim gets the power!

## Credits

- Duck sprites: Pixel art duck assets
- Enemy sprites: Street Animal Pixel Art pack
- Tileset: Grass Island tileset

---

*Made with vanilla JavaScript and HTML5 Canvas*

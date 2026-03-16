# Dungeon Valet — Journal

## Session 1 — 2026-03-16: Zero-Shot Build

### Origin
User was browsing their itch.io asset library (127 assets — 59 fonts, 42 sprite packs, 16 characters, etc). I pitched 3 game concepts combining the most absurdly contrasting assets. "Dungeon Valet" won: a valet parking attendant working in a demonic dungeon, parking sports cars between lava pits for eyeball and slime customers.

### Assets Used
All downloaded from user's itch.io purchases, converted to base64 and embedded:
- **Demonic Dungeon** (VEXED) — 16x16 tileset: walls, floors, doors, hero knight sprite
- **Demonic Dungeon Magma Maze** (VEXED) — 16x16 lava tiles (4-frame animation)
- **Demonic Dungeon Monsters** (VEXED) — skeleton guards (decorative, 3-frame animation)
- **2D Top Down 180 Pixel Art Vehicles** (Arludus) — 10 cars (3 F1 racers + 7 sedans/coupes)
- **Eyeball character** (Brysia) — 18x16, idle + walk animations (3 frames each)
- **Slime character** (Brysia) — 18x12, idle (4 frames) + jump (6 frames) animations
- **Skulls 'N Bones font** (VEXED) — TTF, used for all text

### Architecture
Single-file HTML game (704KB), canvas-based, 640x480 at 2x tile scale. All assets embedded as data URIs. No external dependencies.

### Game Design
- **Core loop**: Cars arrive at dungeon entrance with demon customers (eyeball/slime). Walk to car (WASD), hop in (SPACE), drive to parking spot, park (SPACE in spot).
- **Wave system**: Wave 1 = 3 cars, escalates to 8. Patience starts at 45s, decreases each wave. Lava pits multiply each wave.
- **Physics**: Momentum-based driving with 600 accel, friction 3, 260px/s cap. Cars drift and bounce off walls.
- **Hazards**: Driving into lava destroys car (screen shake, fire effect, lose heart). Customer patience expiring = customer leaves (lose heart). 3 hearts total.
- **Scoring**: 10 x wave multiplier per park. Speed bonus +5 x wave for >70% patience remaining.
- **Visual polish**: Golden arrow player indicator, car glow when driving, green spot highlight when parkable, patience bars (green->red with flash), floating tip text, screen shake on crashes, animated lava glow, bobbing customers, skeleton guard sentries.

### Playtesting (Playwright)
Automated playtesting via browser. Key findings and fixes:
1. **Patience too short** (30s) — bumped to 45s wave 1, -3/wave, min 18s
2. **Player too small** — drew knight at 1.5x with golden bobbing arrow indicator
3. **Player too far from entrance** — moved start to H/3 instead of H/2+40
4. **Parking detection too tight** — widened from spot.w/2 to full spot.w from center
5. **Wave never ended if customers left** — added `checkWaveComplete()` that counts destroyed cars
6. **Car speed felt sluggish** — bumped player to 200px/s, car to 260px/s
7. **No feedback when near parkable spot** — added green glow highlight on spots in range

### Flavor Text
Wave intros cycle through: "THE DARK LORD NEEDS MORE PARKING", "ANOTHER SATISFIED DEMON CUSTOMER", "WELCOME TO HELL'S PARKING LOT", etc. Game over: "YOU'RE FIRED! (INTO THE LAVA PIT)"

### Published
Vanilla platform: `http://localhost:3000/games/1773628624175/`

# Tag You're Dead — Development Journal

## Session 1 — Initial Build (2026-03-14)

### What we built
Desert demolition derby tag game. Player + 5 AI cars in a desert arena. One car is "it" — ram someone to pass the tag. Timer ticks down while you're "it". Run out? You're out. Last car alive wins.

### Architecture
- TypeScript + esbuild (same pattern as glint/hot-pursuit)
- HTML5 Canvas 2D, 960x720, pixelated rendering
- Sprite assets from raceon's mini-pixel-pack-2 (symlinked)
- Vanilla platform dev server: `http://localhost:3000/dev/tag-your-dead/index.html`

### Source files (10 files)
| File | Purpose |
|------|---------|
| `main.ts` | Entry point |
| `game.ts` | Game loop, phase management, rendering |
| `car.ts` | Vehicle physics, tag mechanics |
| `arena.ts` | Procedural desert arena with obstacles |
| `camera.ts` | Smooth-follow camera |
| `input.ts` | Keyboard input (arrows/WASD) |
| `sprites.ts` | Car + terrain sprite rendering |
| `soma.ts` | AI car embodiment (identity, on_tick, memory) |
| `reflection.ts` | Between-round reflection (sonnet) + trash talk (haiku) |
| `effects.ts` | Dust, sparks, explosions, tire tracks, screen shake |

### Game phases
Title → Countdown (3s) → Playing → Round Over → Reflecting → next round

### AI system
5 personalities with distinct driving styles:
- **Viper** (blue): Strike fast, dodge at edges
- **Bruiser** (green): Straight charge, zigzag escape
- **Ghost** (yellow): Center orbiter, patient herder
- **Rattler** (police): Interceptor, cuts off escape routes
- **Dust Devil** (NPC gray): Chaotic, unpredictable

Each has a soma with `identity`, `on_tick` (driving code), `memory`. On_tick runs every frame with `(me, world)` API — same pattern as wheelman/glint/hot-pursuit.

### Reflection
- **Strategic** (sonnet): scaffold tools `edit_on_tick`, `edit_memory`, `edit_identity`
- **Trash talk** (haiku): 1-2 sentence in-character post-round chatter
- All AI cars reflect in parallel between rounds
- Somas persisted to localStorage (`tag-your-dead-somas`)

### Bugs fixed during session
1. **Sprite paths**: double `mini-pixel-pack-2` in URL — fixed path construction
2. **clearFrame timing**: `justPressed` was cleared before `update()` checked it — moved `clearFrame()` to end of loop
3. **Tag stall**: when "it" car gets eliminated, nobody inherits the tag. Fixed: random alive car becomes "it" on elimination
4. **HUD after death**: "YOU'RE IT!" persisted after player elimination because `isIt` wasn't cleared. Fixed: clear `isIt` on death
5. **Camera after death**: camera stayed on dead player. Fixed: follow first alive car when player is dead

### Balance tuning
- Arena: 3000x2200 → 2000x1500 (tighter = more action, less chasing into void)
- Obstacles: reduced proportionally (40→25 rocks, 25→15 cacti, 12→8 barrels)
- Tag distance: 24 → 30px (slightly more forgiving)

### What works
- Full game loop: title → play → round over → (reflection) → next round
- Tag mechanics: tag transfer, immunity, elimination, "it" reassignment
- AI driving: all 5 personalities execute on_tick code, chase/evade appropriately
- Visual: sprites, name labels, IT indicator ring, immunity shimmer, dust, sparks, explosions
- HUD: alive count, round number, player status, minimap
- Round results screen with placements and tag stats
- Career stats persist across rounds on title screen

### What's next
- Playtest with actual keyboard input
- Verify reflection actually improves AI driving (need to trigger space after round over)
- Car-to-car collision physics (currently cars pass through each other, only tagging on proximity)
- Sound effects?
- More arena variety?

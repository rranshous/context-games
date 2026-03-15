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

### Current state (end of session 1)
- Game is fully playable at `http://localhost:3000/dev/tag-your-dead/index.html`
- AI cars chase/evade but mostly timeout rather than actively tagging each other — they need tighter pursuit logic or a smaller arena still
- Reflection system is wired up but hasn't been tested end-to-end yet (need to press space on round-over screen to trigger it)
- No car-to-car collision physics — cars pass through each other, only tagging on proximity check
- The `me` API exposes: `x, y, angle, speed, isIt, itTimer, immuneTimer, alive, steer(dir), accelerate(amt), brake(amt), distanceTo(x,y), angleTo(x,y), memory.read()/write(), identity.read(), on_tick.read()`
- The `world` API exposes: `time, arenaWidth, arenaHeight, otherCars[{id,x,y,angle,speed,isIt,alive,immuneTimer}], obstacles[{x,y,radius,type}]`
- localStorage key: `tag-your-dead-somas` — `resetSomas()` via `window.__tagYourDead.resetSomas()`

### What's next
- Trigger reflection after a round and verify AI code actually changes
- Sound effects
- More arena variety (different seeds, maybe hazards like moving obstacles)

---

## Session 2 — HP & Damage System (2026-03-14)

### Design change: everyone deals damage
Replaced binary tag-only mechanic with a full damage system. Every car can ram every other car for damage, but being "it" gives 3x damage output — makes "it" a double-edged sword (powerful but on a timer).

### What changed

**HP & Damage (config.ts, car.ts, types.ts)**
- Every car has 100 HP. Eliminated at 0 HP or IT timer expiry.
- Damage formula: `speed × 0.15 × (isIt ? 3 : 1)`. Max-speed "it" ram = 90 damage (devastating). Normal max-speed hit = 30 damage.
- Per-pair collision cooldown (0.3s) prevents repeated damage from same contact.
- 1 second invulnerability grace period after any hit — `immuneTimer` reused for this.
- Cars that are immune skip collision checks entirely (no damage, no tag transfer, no bump).

**Car-to-car collision physics (car.ts)**
- Cars now physically collide — bump apart on contact, speed reduced by 30%.
- Collision bumps clamped to arena bounds (no pushing through walls).
- Tag transfer uses pre-bump speed for the `MIN_SPEED_TO_TAG` check (was broken when checked after speed reduction).
- `CollisionResult` struct returned to game.ts for effects (sparks, shake, console log).

**Reverse gear & steering fix (car.ts)**
- Holding brake at zero speed now reverses (half acceleration, 40% max speed cap).
- Steering always works (min 30% turn rate at standstill). Inverts when reversing.
- Wall bounces: hitting arena edges at speed reverses you slightly (`speed *= -0.3`) instead of trapping.

**AI personalities rewritten (soma.ts)**
- All 5 default on_tick scripts now HP-aware: target low-HP cars, play cautious when hurt, use "it" aggressively for 3x damage.
- Identities updated to reference the damage system.

**Reflection updated (reflection.ts)**
- Reflection prompt explains HP/damage/3x multiplier mechanics.
- Tool descriptions include `hp` in API documentation.
- Round results include `damageDealt` and `damageTaken` stats.

**Visual (game.ts)**
- HP bars above every car (green → yellow → red).
- Player HP in top-left HUD.
- Round results show DMG dealt/taken.
- Title screen instructions updated for damage mechanic.
- Reflection screen: "PIT STOP — drivers healing up and planning for slaughter"

**Soma API additions**
- `me.hp` — own hit points
- `world.otherCars[].hp` — other cars' HP (for targeting weakened enemies)
- `RoundResult.damageDealt` / `RoundResult.damageTaken`

### Config values
| Setting | Value | Notes |
|---------|-------|-------|
| MAX_HP | 100 | |
| COLLISION_DISTANCE | 28px | Car-to-car collision check |
| DAMAGE_FACTOR | 0.15 | speed × factor = base damage |
| IT_DAMAGE_MULTIPLIER | 3 | "it" cars deal 3x |
| COLLISION_COOLDOWN | 0.3s | Per-pair cooldown |
| HIT_GRACE_PERIOD | 1.0s | Invulnerability after any hit |
| BUMP_FORCE | 20px | Push-apart distance |
| BUMP_SPEED_TRANSFER | 0.3 | 30% speed reduction on bump |
| Max reverse speed | 40% of MAX_SPEED | |

### Current state (end of session 2)
- Game plays as demolition derby — everyone ramming everyone, "it" car is feared
- Tag transfers on "it" car contact (if moving fast enough)
- Cars bounce off each other and walls, can reverse out of corners
- 1s invulnerability after each hit prevents stunlock
- The `me` API exposes: `x, y, angle, speed, hp, isIt, itTimer, immuneTimer, alive, steer(dir), accelerate(amt), brake(amt), distanceTo(x,y), angleTo(x,y), memory.read()/write(), identity.read(), on_tick.read()`
- The `world` API exposes: `time, arenaWidth, arenaHeight, otherCars[{id,x,y,angle,speed,hp,isIt,alive,immuneTimer}], obstacles[{x,y,radius,type}]`
- **Must reset somas** after update: `window.__tagYourDead.resetSomas()` (old somas don't know about HP)

### What's next
- Playtest and tune damage numbers (might need adjustment)
- Test reflection end-to-end — verify AI adapts to damage meta
- Sound effects (hit impacts, engine rev, explosion)
- Obstacle damage (hitting rocks/barrels at speed should hurt)
- More arena variety

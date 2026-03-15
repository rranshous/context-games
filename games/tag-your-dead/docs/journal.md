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

---

## Session 3 — Continuous Play & Front-Bumper Ramming (2026-03-14)

### Design changes

**Continuous play (no rounds)**
Removed the round system entirely. No countdown, no round-over screen, no reflection pause. Title screen goes straight into the arena. Cars that die respawn after 5 seconds with score halved. Dead car wreck stays visible with countdown timer.

**Score system**
- +1/sec alive, +0.5 per damage dealt, +50 kill bonus
- Score halved on death
- Score scales stats: max HP 100→200, max speed 200→230 (linear with score, caps at score 200)
- Persistent to localStorage (`tag-your-dead-scores`)

**Scoreboard HUD**
- Top-left, always visible, sorted by score
- HP bars, skull icon when dead, gear icon when reflecting
- Player highlighted in red

**Background reflection**
- AI cars reflect asynchronously while dead/respawning — game never pauses
- Reflection uses sonnet 4.5, single-call pattern with 3 scaffold tools (edit_on_tick, edit_memory, edit_identity)
- `tool_choice: { type: 'any' }` forces at least one tool call
- Soma updates land silently when API returns

**Respawn**
- 5s countdown, random spawn far from other cars, 2s spawn immunity
- `resetAll()` clears both somas and scores

**Soma API additions**: `me.score`, `me.maxHp`, `me.maxSpeed`, `world.otherCars[].score`

### Front-bumper ramming

Cars that hit with their front bumper (within ±60° of facing direction) only take 10% of the incoming damage. Rewards aggressive head-on ramming — you dish full damage but barely scratch yourself. Getting T-boned or rear-ended still hurts full.

**Implementation** (car.ts):
- Angle from car A toward car B compared against car A's facing angle
- If within `FRONT_HIT_ANGLE` (π/3 = ±60°), damage to self multiplied by `FRONT_HIT_SELF_DAMAGE` (0.1)
- Full damage still dealt to the other car and counted for scoring

**Config** (config.ts):
| Setting | Value | Notes |
|---------|-------|-------|
| FRONT_HIT_ANGLE | π/3 (60°) | ±60° cone counts as front bumper |
| FRONT_HIT_SELF_DAMAGE | 0.1 | Front-bumper rammer takes only 10% |

### Reflection system details
- Single API call, not multi-turn agentic
- System prompt: full soma + game mechanics summary
- User prompt: death cause, score, damage dealt/taken, kills, tags
- 3 scaffold tools: `edit_on_tick` (API docs inline), `edit_memory`, `edit_identity`
- Model: sonnet 4.5

### Current state (end of session 3)
- Continuous play, no rounds — title straight into arena
- Cars respawn on death with score penalty
- Front-bumper ramming: 10% self-damage encourages aggressive head-on play
- Background reflection fires on death, gear icon in scoreboard
- `window.__tagYourDead.resetAll()` clears everything

### What's next
- Playtest front-bumper mechanic — verify it feels rewarding
- Sound effects
- More arena variety

### Session 3b — Obstacle Physics, Hit Summary, Reflection Rewrite (2026-03-14)

#### Obstacle physics overhaul
- **Rocks**: solid — bounce off on contact + take damage (20% of equivalent car collision, front bumper reduction applies)
- **Cacti & barrels**: soft — drive through them, speed halved on contact
- Config: `ROCK_DAMAGE_FACTOR: 0.2`, `SOFT_OBSTACLE_SPEED_MULT: 0.5`

#### Life event tracking
Per-life counters on Car, reset on respawn:
- `rockHits`, `cactusHits`, `barrelHits`, `wallHits`, `carCollisions`
- `timeAtWall` — seconds spent pressed against arena edge (for detecting stuck-at-wall behavior)
- `speedAccum`/`speedSamples` → average speed over the life
- 0.5s cooldown on obstacle hit counting (prevents counting same obstacle 60 times while passing through)

#### Reflection prompt rewrite
Rewrote system + user prompts to be mechanics-only (no tactical prescriptions):
- **System**: explains game mechanics (damage formula, front-bumper advantage, "it" multiplier, score formula, tag transfer, respawn), describes the arena (size, obstacle types and what they do), mentions what's visible via `world.otherCars`
- **User**: death cause, score, avg speed, damage dealt/taken, kills, tags, and a `buildHitSummary()` string (e.g. "3 car collision(s), hit 2 rock(s), spent 4s pressed against arena edge")
- No tactical suggestions — AI figures out its own strategy from the mechanics and its performance data

#### Dust trail fix
Dust particles now spawn 14-18px behind the car (offset along reverse of facing angle) instead of at car center. No longer renders on top of the car sprite.

#### Current state
- Rocks hurt, cacti/barrels slow but passable
- Reflection gets full hit summary + avg speed + wall time
- AI should be able to self-diagnose wall-hugging, rock-hitting, low-speed driving from the data

#### What's next
- Playtest and observe AI reflections — are they learning from the hit data?
- Sound effects
- More arena variety

### Session 3c — Bug Fixes & Terrain Polish (2026-03-14)

#### Bugs fixed
1. **Soft obstacle perma-slowdown**: `speed *= 0.5` applied every frame while overlapping cactus/barrel — speed hit zero instantly. Fixed: one-time slowdown on entry with 0.5s cooldown (same cooldown already used for hit counting). Bumped multiplier from 0.5 to 0.6.
2. **HP bar invisible on "it" car**: `strokeText` for the IT timer (lineWidth 2, black stroke at y-30) painted over the HP bar (at y-38, 3px tall). Fixed: draw text first, then HP bar on top; moved IT text to y-32 and HP bar to y-44 when car is "it".
3. **Barrel sprite was hazard chevron**: `renderBarrel()` was using Misc_props tile 0 (orange/black chevron stripe). Changed to tile 2 (traffic cone) which looks correct for a small obstacle.
4. **Background color mismatch**: `#d4b896` was too dark/warm for the sprite palette. Changed to `#efb681` (same as Wheelman) — seamless blend with Desert_details tile sprites.

#### Rough sand terrain
- Sand patches upgraded from cosmetic to functional: `SandPatch { x, y, radius }` with `isInSand()` check
- 20 patches (radius 30-70), center-cleared for spawning
- Effect: 3x friction multiplier (gradual slowdown, not a hard speed cut — learned from cactus bug)
- Rendered as tiled Desert_details tile 1 filling circular area (step=28px for slight overlap)
- Config: `SAND_FRICTION_MULT: 3.0`

#### Sprite sheet reference (mini-pixel-pack-2)
- **Desert_details**: tile 0 = blank sand, tile 1 = textured/rough sand, tile 2 = cactus, tile 3 = rock
- **Misc_props**: tile 0 = hazard chevron (DON'T USE for barrels), tile 2 = traffic cone (used for barrels)

#### Current state
- All 5 feedback items resolved: slowdown, HP bar, barrel sprite, sand terrain, background color
- Visually matches Wheelman's desert aesthetic
- Sand patches create tactical terrain variety (slower zones to avoid or use for defense)

#### What's next
- Playtest: sand friction feel, barrel/cone placement, AI behavior
- Sound effects
- Arena variety (multiple seeds, hazard layouts)

### Session 3d — IT Kill Bonus & Reflection Tweaks (2026-03-14)

#### 3x kill bonus for killing the "it" car
- Killing the car that's "it" awards 150 points (3× the normal 50 kill bonus)
- Captured `isIt` status before `takeDamage()` since `die()` clears it
- Reflection prompt updated to mention the +150 IT kill bonus
- Title screen text updated

#### Reflection prompt additions
- Sand patches mentioned in arena description ("rough sand patches increase friction")
- IT kill bonus in score breakdown

#### Terrain slowdown hierarchy
| Terrain | Effect |
|---------|--------|
| Open sand | No effect |
| Rough sand patches | 3× friction (gradual slowdown) |
| Cacti / barrels | One-time speed × 0.6 on entry, drive through |
| Rocks | Solid bounce + 20% car-collision damage |

#### What's next
- Toroidal world wrapping (edges connect, no walls) — next session
- Sound effects
- Arena variety

---

## Session 4 — Toroidal World Wrapping (2026-03-14)

### Design change: no walls, edges wrap

Removed arena walls entirely. Driving off one edge puts you on the opposite side — seamless toroidal world. No more getting trapped in corners or wall-hugging. The arena is effectively infinite via tiling.

### What changed

**Arena wrapping (arena.ts)**
- Added `wrapX(x)`, `wrapY(y)`, `wrapPosition(x, y)` — modulo wrapping for positions
- Added `wrapDx(dx)`, `wrapDy(dy)` — shortest-path delta across seam (for distance/angle calculations)
- Added `wrapDistance(x1, y1, x2, y2)` — full wrap-aware distance
- `checkObstacleCollision()` and `isInSand()` now use wrapped deltas
- Removed `clampPosition()` — no longer needed

**Car physics (car.ts)**
- Replaced arena bounds clamping with `arena.wrapPosition()` at end of update
- Removed wall bounce code (`speed *= -0.3`, `wallHits++`, `timeAtWall`)
- Rock bounce normal computed with wrapped delta
- `checkCarCollisions`: distance, bump normal, and front-bumper angle all use wrapped deltas
- Post-bump positions wrapped via `arena.wrapPosition()` instead of clamped

**Camera (camera.ts)**
- Removed all clamping from `update()` and `snap()` — camera follows freely
- `worldToScreen()` wraps world coord relative to camera before converting — objects render at their nearest position across the seam
- `isVisible()` uses same wrapping — objects near the seam are visible from both sides
- Camera smooth-follow uses wrap-aware delta so it doesn't jump when crossing seam
- Stored `worldW`/`worldH` on camera for use in worldToScreen/isVisible

**Soma API (soma.ts)**
- `me.distanceTo(x,y)` and `me.angleTo(x,y)` now wrap-aware — AI code navigates correctly across seams
- `buildMeAPI` takes arena parameter for wrap calculations

**Rendering (game.ts)**
- Removed arena border rendering (no borders in toroidal world)
- Collision effect midpoint computed with wrap-aware delta
- Respawn: random position anywhere in arena (no edge margin needed), wrap-aware distance check for "far from others"
- Title screen text updated: "No walls — edges wrap around"

**Reflection (reflection.ts)**
- Arena description: "toroidal — driving off one edge puts you on the opposite side (no walls)"

### Technical approach

The key insight: camera.worldToScreen wraps each world coordinate relative to the camera center, choosing the nearest representation across the seam. This means every object — cars, obstacles, sand patches, particles, tire tracks — renders at its closest position to the camera automatically. No ghost rendering or 3x3 tiling needed. Large objects like sand patches work because each tile is independently wrapped.

### Fields kept but unused
- `wallHits`, `timeAtWall` fields still exist on Car and in LifeResult (type compat) but never increment
- `buildHitSummary()` still checks for them — they just won't fire

**Arena generation updated**
- Removed 120px edge margin — obstacles and sand patches spawn anywhere in the full arena (toroidal, no edges to avoid)
- Center clear zone uses wrap-aware distance

**Gamepad support (input.ts, game.ts)**
- Polls `navigator.getGamepads()` every frame via `pollGamepad()`
- Left stick X → analog steering (with 0.15 deadzone)
- Right trigger (button 7) → analog accelerate, left trigger (button 6) → analog brake
- D-pad: up=accel, down=brake, left/right=steer (digital fallback)
- A button (0) or Start (9) → menu confirm (same as Space/Enter)
- Keyboard + gamepad merge: whichever input is stronger wins (no conflict)
- Rising-edge detection for button presses (A/Start) via `_prevButtons` tracking
- Title screen updated: "Arrow keys / WASD / Gamepad to drive", "PRESS SPACE / A TO START"

**Camera seam fix (camera.ts)**
- Bug: `worldToScreen` uses a single `if` wrap adjustment, not `while`. When camera.x drifted past `[0, worldW)` from repeated seam crossings, the single adjustment wasn't enough and objects rendered at wrong positions — visible as a jerk/pop.
- Fix: wrap camera position to `[0, worldW)` after each smooth-follow update. No visual discontinuity (worldToScreen is wrap-relative), prevents drift, keeps single-adjustment math correct.

### Current state (end of session 4)
- Seamless toroidal wrapping — feels like an infinite map, no visible seam
- Camera stays in canonical `[0, worldW)` range — no drift, no jerk on seam crossing
- All distance/angle calculations wrap-aware (car collisions, obstacle checks, AI navigation)
- AI drivers navigate across seams correctly via wrap-aware `distanceTo`/`angleTo`
- Gamepad fully supported — analog steering + triggers, d-pad fallback, A/Start for menu
- `window.__tagYourDead.resetAll()` still works
- **Must reset somas** after update: `window.__tagYourDead.resetSomas()` (old somas may reference walls/corners)

### What's next
- Playtest wrapping + gamepad — verify infinite-map feel, analog steering
- Sound effects
- Arena variety

---

## Session 5 — Pause Screen: Score Graph + Driver Intel (2026-03-15)

### What we built
Pause screen (ESC / P to toggle) with two panels:

**Score graph** — line chart of all cars' scores over time:
- Color-coded lines (red=player, blue=viper, green=bruiser, yellow=ghost, purple=rattler, gray=dust devil)
- Score snapshots recorded every ~1s during gameplay
- Event markers on each car's line:
  - Skull markers for deaths (colored per car)
  - Pulsing red circles for tagged-IT events (like the IT glow ring in-game)
- Mouse hover tooltips on markers — shows car name, event type, and timestamp
- Horizontal legend above plot, Y-axis labels, X-axis time labels (mm:ss)

**Driver Intel** — AI tactics summaries via single haiku call:
- On pause, sends all 5 AI somas (identity, on_tick, memory) to haiku in one request
- Structured output returns concise per-driver tactical analysis
- Displayed in 5 columns below the graph with car color, score, and word-wrapped summary
- Falls back to identity text if API fails
- Summaries are specific — "charges nearest target at full throttle", not generic descriptions

### Technical details
- New `GamePhase = 'paused'` — game loop stops updating physics/AI while paused
- `ScoreSnapshot` and `GameEvent` types in types.ts
- `scoreHistory: ScoreSnapshot[]` — sampled every ~1s in `updatePlaying()`
- `gameEvents: GameEvent[]` — pushed on death and tag transfer in collision/death handling
- `eventMarkers[]` — built during render, stores screen positions for hit-testing mouse hover
- Mouse tracking via `mousemove` listener on canvas, scaled to canvas coords
- Haiku call: `claude-haiku-4-5-20251001`, structured output with JSON schema, max 1024 tokens
- Score history + events reset on game start (new session = fresh graph)
- All existing gameplay unaffected — pause just freezes the loop

### Files changed
- `types.ts` — added `'paused'` to GamePhase, `ScoreSnapshot`, `GameEvent` interfaces
- `game.ts` — pause toggle, score/event tracking, graph renderer, tactics panel, haiku fetch, mouse tracking
- `input.ts` — added Escape to preventDefault list

### What's next
- Sound effects
- Arena variety
- Car-to-car collision physics improvements (bump/bounce feel)

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

### Session 5b — Graph polish + kill attribution + per-driver colors (2026-03-15)

**Kill attribution on graph:**
- `lastAttackerId` tracked on each Car — set when collision damage is dealt, reset on respawn
- Death skulls now rendered in the **killer's color** (not the victim's) — a green skull on Viper's line means Bruiser killed them
- Hover tooltip shows "Killed by BRUISER" etc.
- Kill events (crosshair icon) appear on the **killer's** score line when they destroy someone
- Big hit events (star icon, damage > 25) tracked on attacker's line — notable rams

**4 marker types on graph:**
- Skull = death (colored by killer)
- Crosshair = kill (on killer's line)
- Star = big hit (25+ damage)
- Pulsing red circle = tagged IT

**Per-driver colors everywhere:**
- `CAR_COLORS` map (red/blue/green/yellow/purple/gray) now used consistently across:
  - Scoreboard text (was white/gray, now per-driver; dimmed when dead)
  - Name labels over cars in arena (was white, now per-driver; red when IT)
  - Minimap dots (was all-blue for AI, now per-driver)
  - Pause screen graph lines and driver intel panel
- Same color identity from graph → scoreboard → minimap → car labels

**Skull visibility fix:**
- Skulls bumped from 16px to 22px bold with 3px black stroke outline for contrast

### What's next
- Sound effects
- Arena variety
- Car-to-car collision physics improvements (bump/bounce feel)

---

## Session 6 — Boost & Reflection Ticker (2026-03-15)

### Boost mechanic
Player (and AI) cars can now boost — a short speed burst on a cooldown.

**Controls:**
- Keyboard: Spacebar (was brake — moved brake to S/Down only)
- Gamepad: B button (index 1)

**Physics (car.ts):**
- `boost()` triggers if cooldown is ready — sets `boostTimer` to duration
- During boost: 3x acceleration multiplier, 1.8x max speed cap
- Boost accelerates even without throttle held (just tap space and go)
- `isBoosting` getter + `boostCooldownFrac` (0=ready, 1=full cooldown) exposed to AI

**Config (BOOST section):**
| Setting | Value | Notes |
|---------|-------|-------|
| SPEED_MULT | 1.8 | Max speed multiplier during boost |
| DURATION | 0.4s | Boost duration |
| COOLDOWN | 3.0s | Recharge time |
| ACCEL_MULT | 3.0 | Acceleration multiplier |

**HUD (game.ts):**
- Bottom-center bar: gold when ready, drains during boost, grey while recharging
- Label: `BOOST [SPACE]`

**Effects:**
- 4x dust particles while boosting (vs 1 normally)

**AI integration:**
- `me.boost()`, `me.isBoosting`, `me.boostCooldownFrac` added to MeAPI
- Reflection tool description updated with boost API
- Each AI personality uses boost with distinct tactics:
  - Viper: boost when closing in (<120) or escaping IT (<100)
  - Bruiser: boost every charge (always aggressive)
  - Ghost: boost on final approach (<80) or to flee IT (<100)
  - Rattler: boost when intercept is close (<150)
  - Dust Devil: mash boost on cooldown (chaotic)

### Reflection ticker banner
Scrolling ticker at the bottom of the playing screen shows in-character brags when AI drivers update their code after reflection.

**Flow:**
1. AI car dies → background reflection fires (sonnet)
2. If on_tick code changed, haiku generates a 1-sentence in-character brag
3. Brag appears as a scrolling message: `DRIVER_NAME: brag text`
4. Driver name in their car color, text in white
5. Scrolls left at 60px/s, removed when off-screen (no looping)

**Implementation:**
- `reflection.ts`: `reflectOnLife()` now returns `ReflectionResult { soma, brag }` instead of just `CarSoma`
- `generateBrag()`: haiku call with old/new on_tick snippets + identity, asks for ≤15-word cocky brag
- `game.ts`: `tickerMessages[]` queue, `pushTickerMessage()`, `updateTicker()`, `renderTicker()`
- Dark banner background (60% opacity) at bottom of screen when messages are active

### Files changed
- `config.ts` — BOOST section
- `car.ts` — boost state, timers, physics, reset on respawn
- `input.ts` — spacebar→boost (removed from brake), gamepad B button, return type includes `boost`
- `soma.ts` — MeAPI boost methods, default on_tick boost tactics for all 5 AIs
- `reflection.ts` — `ReflectionResult` type, `generateBrag()`, brag generation after reflection
- `game.ts` — boost input wiring, HUD indicator, ticker system, render pipeline

### Current state (end of session 6)
- Boost feels punchy — short burst, visible dust cloud, clear HUD feedback
- AI drivers use boost tactically (and will learn to improve usage through reflection)
- Ticker keeps player informed of AI improvements without pausing gameplay
- `me` API: `x, y, angle, speed, hp, maxHp, maxSpeed, score, isIt, itTimer, immuneTimer, alive, steer(dir), accelerate(amt), brake(amt), boost(), isBoosting, boostCooldownFrac, distanceTo(x,y), angleTo(x,y), memory.read()/write(), identity.read(), on_tick.read()`
- **Must reset somas**: `window.__tagYourDead.resetSomas()` (old somas don't know about boost)

### What's next
- Sound effects
- Arena variety
- Playtest boost balance — may need tuning

---

## Session 7 — Fixing Reflection Self-Modification (2026-03-15)

### Problem
Reflection was firing (logs showed `tools: edit_memory, edit_on_tick`) but the on_tick code never actually changed. The brag marquee never appeared because brags only generate when on_tick changes.

**Root cause**: `tool_choice: { type: 'any' }` forced the model to call tools even when it had nothing to change — it would resubmit the exact same on_tick code to satisfy the forced-tool-use constraint. String comparison correctly detected "unchanged" and skipped brag generation.

### Fixes applied
1. **`tool_choice: 'auto'`** — model now only calls `edit_on_tick` when it genuinely has code changes
2. **Sharper reflection prompt** — changed "Reflect on this life and update your soma" to explicit instruction: "Analyze what went wrong and IMPROVE your on_tick driving code. Don't resubmit the same code — make a specific tactical change based on how you died."
3. **Added "it" advantage docs** — reflection prompt now mentions +15% max speed and 2x faster boost recharge when IT (was undocumented in the reflection context)
4. **Better logging** — `[REFLECT]` logs now show which tools were called and whether on_tick changed

### Comparison with Hot Pursuit reflection
Hot Pursuit officers self-modify much more effectively. Key differences identified:
- **Visual context**: officers get a base64-encoded bird's-eye chase map showing paths, buildings, key moments — far richer than tag-your-dead's text-only stats
- **Key moments timeline**: numbered significant events with timestamps ("spotted suspect at 15s", "lost visual at 23s")
- **Multi-turn**: up to 5 agentic turns with `query_replay` tool to deep-dive specific moments
- **No forced tool use**: `tool_choice` not set (defaults to auto)
- **Movement accountability**: warns if officer barely moved ("You barely moved — your handler probably isn't producing movement commands")

### What's next — improving reflection quality
- ~~Add chase/encounter timeline (key moments: close calls, tag transfers, kills, near-misses)~~ ✓ session 7b
- ~~Consider visual map context (bird's-eye replay of the life)~~ ✓ session 7b
- Movement accountability warning for low-distance lives
- Multi-turn reflection (query specific moments)

### Session 7b — Life Map + Key Moments for Reflection (2026-03-15)

#### Per-life tracking (car.ts, types.ts)
Added two new per-life data structures on Car, reset on respawn:
- **`trail: TrailPoint[]`** — position sampled every 0.5s with `{ time, x, y, isIt }`. Capped at 200 samples (100s of life).
- **`lifeEvents: LifeEvent[]`** — significant moments with `{ time, x, y, description }`. Capped at 30 events.

Life events recorded for:
- Tag transfers (both cars get an event)
- Big hits (>25 damage, both attacker and victim)
- Death (cause + killer if applicable)

#### Bird's-eye life map (new file: life-map.ts)
Renders an offscreen canvas (400px) showing:
- Desert background with sand patches (darker circles)
- All obstacles (gray rocks, green cacti, orange barrels)
- Car's position trail — colored in their car color, red when IT
- Green square = spawn point, red X = death location
- Numbered white circles for each key event (matching the text timeline)
- Color legend at bottom

Rendered to base64 PNG, sent as multimodal image in the reflection API call.

#### Multimodal reflection (reflection.ts)
- `callAPI` now accepts `string | Array<Record<string, unknown>>` for user content
- When trail data exists, sends `[image, text]` content blocks (like hot-pursuit)
- Falls back to text-only if map render fails
- Key moments timeline appended to user prompt: `1. [15s] Tagged Bruiser — became IT`
- System prompt now describes the map and coordinate system
- Added boost mechanic to system prompt (was missing)

#### Bounded data
All per-life data is:
- Capped (200 trail points, 30 events)
- Reset on respawn (no accumulation across lives)
- Only passed to reflection on death (not stored elsewhere)

### Session 7c — Fixing Reflection Self-Modification (the real fix) (2026-03-15)

#### Root cause: max_tokens was 1024
The model literally couldn't fit the on_tick code (~2000 chars) in 1024 output tokens. It called `edit_on_tick` with `{}` (2 chars) — an empty acknowledgment. The `code` field was undefined, so the conditional `if (input.code)` silently skipped it. Every reflection appeared to work but changed nothing.

#### Three-part fix (matching hot-pursuit patterns)

1. **max_tokens: 1024 → 4096** — the critical fix. Model needs room to output full code.
2. **Added `reasoning` field to `edit_on_tick`** — forces think-before-act. Hot Pursuit uses this pattern too.
3. **Procedural user prompt** — changed from single aggressive paragraph to numbered steps:
   ```
   1. Review the map and key moments. What pattern led to your death?
   2. Call edit_on_tick RIGHT NOW with your improved driving code.
   3. Call edit_memory to record what you learned.
   DO NOT just describe what you would change. CALL THE TOOLS.
   ```

#### Other changes
- Model: `claude-sonnet-4-5-20250929` → `claude-sonnet-4-6`
- Multi-turn agentic loop (up to 3 turns with tool results) — if edit_on_tick fails validation, error message sent back
- Fixed `block.name` references (edit_memory/edit_identity were using undefined `name` variable)
- Added per-tool input length logging

#### Confirmed working
- **Rattler**: 2120 → 4239 chars — "Now I lead targets by their velocity vector instead of guessing"
- **Dust Devil**: 1263 → 3868 chars — "Now I predict targets three ticks ahead so chumps can't juke my chaos anymore"
- Both updated in single turn with meaningful tactical changes. Brag ticker visible on screen.

#### Insight
**max_tokens is the #1 lever for code self-modification.** If the model can't fit the code in its output budget, it will call the tool with empty input as an acknowledgment gesture. This looks like "unchanged" but is actually "couldn't write". The prompt quality and tool_choice settings are secondary — you need room to write first.

### Full session 7 summary — what landed

**New files**: `life-map.ts` (bird's-eye life map renderer)

**Changed files**: `reflection.ts` (major rewrite), `car.ts` (trail/event tracking), `game.ts` (trail sampling, life events, arena context pass-through), `types.ts` (TrailPoint, LifeEvent, LifeResult additions), `config.ts` (no changes)

**Reflection architecture (final state)**:
- Model: `claude-sonnet-4-6`, max_tokens: 4096, up to 3 agentic turns
- Multimodal: bird's-eye life map (base64 PNG) + text stats + key moments timeline
- 3 scaffold tools: `edit_on_tick` (with `reasoning` + `code` fields), `edit_memory`, `edit_identity`
- Procedural user prompt with explicit numbered steps and "CALL THE TOOLS" imperative
- Tool results fed back for multi-turn (error messages if fields missing)
- Brag generation (haiku) only when on_tick actually changes

**Per-life tracking on Car** (reset on respawn):
- `trail: TrailPoint[]` — position every 0.5s, capped at 200
- `lifeEvents: LifeEvent[]` — tags, big hits, deaths, capped at 30
- Life events recorded in game.ts collision/death handlers

**Key debugging insight**: `edit_on_tick` with input length 2 = `{}` = model called tool with no code field. The `if (input.code)` guard silently skipped it. Always log tool input lengths.

### Design ideas (not yet implemented)
- **Sound effects**: still not done
- **Arena variety**: different seeds, hazard layouts

---

## Session 8 — IT Vulnerability & Ticker Fix (2026-03-15)

### IT vulnerability (risk/reward tradeoff)
Being "it" is now a double-edged sword: you deal 3x damage but take 35% more from all sources.

**Config (config.ts):**
| Setting | Value | Notes |
|---------|-------|-------|
| IT.DAMAGE_TAKEN_MULT | 1.35 | IT car takes 35% more damage |

**Implementation (car.ts):**
- Applied to car-to-car collisions: `selfDamageToA/B` multiplied by 1.35 when that car is IT
- Applied to rock hits: `finalDamage` multiplied by 1.35 when IT
- Stacks with front-bumper reduction: IT car ramming nose-first takes 10% × 1.35 = 13.5%
- Stacks with IT damage output: if two IT-tagged cars collide (edge case after tag transfer with immunity), both multipliers apply independently

**Damage math examples:**
- Normal car rams at max speed: 200 × 0.15 = 30 dmg dealt, 30 taken
- IT car rams at max speed: 200 × 0.15 × 3 = 90 dmg dealt, but takes 30 × 1.35 = 40.5 from the other car
- IT car front-bumper ram: deals 90, takes 30 × 0.1 × 1.35 = 4.05 (still very favorable)

**Reflection prompt** updated to explain the vulnerability — AI should learn to pass the tag quickly or exploit the speed/boost advantage before dying.

**Title screen** updated: "Being IT: 3x damage output but take 35% more damage"

### Ticker overlap fix
Brag messages no longer overlap each other in the scrolling ticker.

**Problem**: all messages started at `CW + 10` regardless of what was already queued — simultaneous reflections produced overlapping text.

**Fix (game.ts `pushTickerMessage`):**
- Estimates pixel width of the last queued message (~7px per char)
- New message starts after the last one's estimated end + 40px gap
- Falls back to `CW + 10` if no messages queued or last message has already scrolled past

### Driver Intel prompt grounding
Haiku was hallucinating "arena blind side" and other non-existent concepts in the pause screen Driver Intel summaries. Fixed by adding game context block to the tactics prompt:
- Explains toroidal arena, damage formula, IT mechanics, front-bumper, boost
- Explicitly states "All cars have full visibility... no blind spots, no hidden information"
- Instruction: "Only describe behavior visible in the code — do not invent tactics or concepts not present"

### What's next
- Sound effects
- Arena variety (different seeds, hazard layouts)
- Playtest IT vulnerability — does it change AI strategy?

---

## Session 9 — Bigger Arena, Rock LOS, Damage Physics, Custom Font (2026-03-15)

### Arena doubled (config.ts, arena.ts)
Arena is now 4000×3000 (was 2000×1500). More space, more terrain, more tactical variety.

| Setting | Old | New |
|---------|-----|-----|
| Arena size | 2000×1500 | 4000×3000 |
| Rocks | 25 | 80 |
| Cacti | 15 | 40 |
| Barrels | 8 | 20 |
| Sand patches | 20 | 50 |
| Center clear radius | 200 | 400 |
| Respawn min distance | 200 | 400 |

### Rocks block line of sight (arena.ts, soma.ts)
Rocks now break AI line of sight. `world.otherCars` is filtered — only cars with an unobstructed line to the observer are included.

**Implementation (arena.ts):**
- `hasLineOfSight(x1, y1, x2, y2)`: wrap-aware segment-circle intersection test against all rock obstacles
- Projects each rock center onto the line segment, checks perpendicular distance vs rock radius
- Only rocks block LOS (cacti/barrels are transparent — they're soft obstacles you drive through)

**Integration (soma.ts):**
- `buildWorldAPI()` now filters `otherCars` through `arena.hasLineOfSight(self.x, self.y, c.x, c.y)`
- Dead cars always visible (no hiding corpses behind rocks)
- Player's view is NOT affected — LOS only applies to AI `world.otherCars`

**Reflection prompt** updated to explain LOS and suggest tactical use of rocks as cover.

### HP-based speed penalty + steering pull (car.ts)
Damaged cars are slower and harder to control.

**Speed penalty:**
- Above 50% HP: no effect
- Below 50% HP: max speed drops linearly, up to 20% reduction at 0 HP
- Formula: `hpSpeedMult = 0.8 + 0.2 × min(1, hpFrac / 0.5)`
- Applies to both forward and reverse max speed
- Stacks with boost multiplier

**Steering pull (listing):**
- Below 50% HP: constant steering bias added to input
- Direction deterministic per car ID (even=right, odd=left)
- Strength: `(1 - hpFrac×2) × 0.15` — subtle at 40% HP, noticeable at 10%
- Player has to counter-steer to drive straight when hurt

**Reflection prompt** updated to mention both mechanics.

### Boost bar position fix (game.ts)
Moved boost bar from `CH - 30` to `CH - 50` — 20px more clearance above the ticker banner. No more visual collision.

### Custom font: tEggst (index.html, game.ts, life-map.ts, main.ts)
Replaced all `monospace` font references with `"tEggst", monospace` — a retro digital display font from the Analog Digits pack.

**Three weights loaded via @font-face:**
- **Bold (700)**: title screen, big status text (YOU'RE IT, RESPAWNING), section headers
- **Regular (400)**: HUD, names, scoreboard, timer, minimap, general text
- **Light (300)**: ticker banner, boost label — subtle/secondary text

**Font loading:**
- `@font-face` declarations in index.html pointing to woff2 files in `assets/fonts/`
- `main.ts` waits for `document.fonts.ready` before starting game (canvas needs fonts loaded)
- Monospace fallback for any rendering before fonts load

### Font preview tool (tools/font-preview/)
Built a Playwright-interactive font preview tool following the tools/ pattern:
- Loads fonts via `window.loadFonts([{ name, url }])` — returns load status
- Shows each font at multiple sizes with configurable preview text and background
- Role assignment tags (title, hud, timer, ticker, names, trash-talk) — click to assign
- `window.getSelections()` returns role→font mapping
- Served via `python3 -m http.server 8765` from repo root

### Files changed
- `config.ts` — arena size doubled, obstacle counts scaled, respawn distance
- `arena.ts` — scaled sand patches/clear radius, `hasLineOfSight()` method
- `car.ts` — HP speed penalty, steering pull
- `soma.ts` — LOS filtering in `buildWorldAPI()`
- `reflection.ts` — LOS and damage-slowdown in prompt
- `game.ts` — boost bar position, tEggst font everywhere
- `life-map.ts` — tEggst font
- `main.ts` — wait for font loading
- `index.html` — @font-face declarations, body font-family
- `tools/font-preview/index.html` — new tool

### Current state (end of session 9)
- Arena feels expansive with room for chases and rock-cover tactics
- AI can't see through rocks — ambushes and evasion behind cover are possible
- Damaged cars visibly struggle — slower, pulling to one side
- tEggst font gives the whole game a cohesive retro-digital look
- **Must reset somas**: `window.__tagYourDead.resetSomas()` (old somas don't know about LOS)

### What's next
- Sound effects
- Playtest LOS — do AI drivers learn to use rocks as cover through reflection?
- Arena variety (different seeds)

---

## Session: Reflex Layer Integration (2026-04-06)

### Context

This session integrates the "frozen reservoir + linear probe" subsystem
developed in the hunch experiment (`games/hunch/`, branch `feat/hunch`)
into tag-your-dead. The idea: a frozen small LLM (distilgpt2) converts
each car's situation to a 768-dim activation vector, and linear probes
trained online via TD learning score a vocabulary of 15 candidate actions.
The highest-priority available action fires each tick. This "reflex layer"
sits between the soma's on_tick code and the physics engine, giving each
car learned reflexes that develop through experience.

See `games/hunch/docs/walkthrough.md` on branch `feat/hunch` for the full
conceptual backstory (Parts 1-10 covering reservoir computing, linear
probes, Pipeline A vs B, and why TD learning fits continuous games).

Branch: `feat/tag-your-dead-reservoir`

### Architecture

```
game tick (60fps)
  → on_tick (soma's authored code — sets steer/accel/brake)
  → reflex.preTick (learned action selection — can override controls)
    → state-to-text → reservoir.embed → td.priorities → argmax → execute
  → car.update (physics)
  → reflex.postTick (compute reward, TD update)
    → td_error = reward + γ * V_next - V_now
    → update value probe + selected action probe
```

Reflex fires AFTER on_tick so it has the final word. The soma's authored
code sets the "conscious" intent; the reflex overrides with learned
preferences.

### 15 derby-specific actions

```
PURSUIT:  ram_nearest, ram_it_car, ram_weakest, boost_ram_nearest
EVASION:  flee_nearest, flee_it_car, boost_flee
POSITION: circle_nearest, cruise_forward, hard_turn_left/right, reverse, stop
IT-SPEC:  hunt_non_immune, boost_hunt
```

### Files added

All in `src/reflex/`:
- `state-to-text.ts` — qualitative: "I am damaged. car close northwest (IT). boost ready."
- `reward.ts` — per-tick signal from damage/kills/score/tag events
- `actions.ts` — 15-action vocabulary with availability rules
- `td-learner.ts` — OnlineProbe + TDLearner with per-tick updates
- `reflex-layer.ts` — ReflexLayer + per-car CarReflex orchestrator
- `onnx-bridge.ts` — ONNX reservoir bridge (distilgpt2 via @huggingface/transformers)

### Three bugs found and fixed during live testing

**Bug 1: ONNX model 404s.** `allowLocalModels = true` made transformers.js
try local `/models/` path before HuggingFace CDN. Fix: `allowLocalModels = false`.

**Bug 2: Reflex order.** Reflex fired BEFORE on_tick, so soma's 1200-2100
char authored driving code overwrote all reflex control inputs every tick.
The reflex was doing work that got immediately erased. Fix: swapped order —
on_tick first, reflex second (final word).

**Bug 3: Reward incentivized spinning.** After fixing the order bug,
observed 3/5 cars learn `hard_turn_right` 100%. Ghost scored highest
(695) by spinning in circles. Root cause: +0.001/tick survival reward
was denser than +0.005/damage-dealt reward. A car that spins in circles
takes no damage and accumulates survival reward faster than a car that
rams and takes counter-damage.

Fix: removed passive survival reward. Reward now comes ONLY from dealing
damage (+0.01/hit), kills (+2.0), score gains (+0.002/point), and passing
the IT tag (+0.5). Passive strategies earn zero.

### Observation after all fixes (90 seconds of gameplay, ~1140 TD updates/car)

```
car         dominant action       other actions         score
Viper       ram_nearest   100%   —                      253
Bruiser     circle_nearest 92%   flee_it 5%, flee 4%    480
Ghost       flee_nearest   86%   reverse 13%, ram 2%    778
Rattler     ram_nearest   100%   —                      697
Dust Devil  ram_nearest    72%   stop 15%, turn 13%     292
Player      (autopilot)                                  34
```

**Key findings:**

1. **No more spinning** — dominant strategies are ram (3 cars) and flee
   (Ghost). Both involve engaging with other cars.

2. **Behavioral diversity**: different cars developed different dominant
   actions from the same random initialization, through the same TD
   process. The per-car random weight fingerprints interact with per-car
   activation patterns (each car sees a different situation) to produce
   different initial preferences, which TD learning then amplifies.

3. **Bruiser shows situational switching**: 92% circle, 5% flee_it_car,
   4% flee_nearest. It mostly orbits but flees specifically when the IT
   car is near. This is early content-dependent behavior — the probe
   output changes based on the situation.

4. **Both ram and flee are viable**: Ghost (flee 86%, score 778) vs
   Rattler (ram 100%, score 697). The reward structure allows multiple
   strategies to coexist rather than collapsing to one dominant.

5. **TD learning is extremely slow**: bias deltas are 0.0005-0.0014
   after ~1140 updates. Action differentiation comes mostly from random
   init fingerprints, not from learned preferences. True content-dependent
   learning needs much longer runs or higher learning rates.

### Serial experiments: reward signal + orienting context

After the initial bugs were fixed, ran two serial experiments per
Robby's direction: first change the reward, then change the state-to-text.

**Experiment A: reward signal (3 iterations)**

| version | reward | dominant behavior | finding |
|---------|--------|-------------------|---------|
| v1 hand-shaped | 6 custom components | 3/5 ram, 1 flee, 1 mixed | worked but Robby flagged: "reward shaping is the same problem as feature engineering" |
| v2 raw score delta | `curr.score - prev.score` | 3/5 spinning | game score includes +1/sec survival, spinning is optimal |
| v3 score minus passive | `delta - (1/60)` | 3/5 circle, 1 flee_it, 1 cruise | no spinning, evasive strategies dominate |

Robby's insight was right to test: the game's built-in scoring was
designed for human player experience (where survival is an achievement),
not for RL reward (where you need to incentivize the behavior you want).
Raw score delta didn't work as a drop-in reward — the +1/sec passive
component dominated. Subtracting the passive baseline was a minimal
fix that preserved the game's own damage/kill balance.

v3 is interesting: Bruiser showed 67% `flee_it_car` + 34%
`hard_turn_left` — genuine situational switching based on whether the
IT car is visible.

**Experiment B: orienting context in state-to-text**

Added a constant prefix explaining the game to the reservoir:
```
Demolition derby. Ram other cars to score points. Being IT means
dealing 3x damage but dying if the timer runs out.
```
Plus added the car's current score to the text.

Key finding: **TD errors are 10-100x larger** with orienting context.

```
state-to-text version         meanAbsTD range
no context (session 10b)      0.0001 - 0.0025
score-minus-passive           0.0092 - 0.0098
WITH orienting context        0.0097 - 0.3276  ← massive range
```

Rattler's TD error GREW from 0.08 to 0.25 between 426 and 972
updates. Probes are actively learning — predictions getting
contradicted by new experience — not plateauing. This is the first
time we've seen growing TD errors, which means the gradient signal
is strong enough to meaningfully move weights.

Interpretation: distilgpt2 has richer pre-trained representations for
"demolition derby" + "ram" + "danger" than for bare "car close
northwest". The context primes the activation space toward
game-relevant dimensions, amplifying per-state variance. This is
exactly the argument for the LLM-as-reservoir: the model's pre-
trained knowledge about concepts IS the feature engineering.

### Architectural pivot: from reflex-as-override to tendency system

Through conversation, Robby identified that the "reflex selects an action
and overrides the soma" design is wrong in a fundamental way. The reflex
layer was either overwriting the soma (which meant the reflex carried the
entire behavior and needed engineered rewards) or getting overwritten by
the soma (which meant it had no effect). Neither is right.

What Robby described instead: **"the body's tendency to move on its own."**
Not action selection. Not overriding controls. A set of muscles that all
fire simultaneously, each pulling the car in a direction with a learned
magnitude. Without any on_tick code, the body would drift according to
those tendencies. WITH on_tick code, the driver's intent composes with
the body's lean.

Key design decisions reached through conversation:

1. **Every action fires every tick.** No argmax, no "which action wins."
   All tendencies contribute simultaneously. `ram_nearest` pulls toward
   the nearest car with magnitude 0.3 while `flee_it_car` pulls away
   from the IT car with magnitude 0.6 while `cruise_forward` pushes
   forward with magnitude 0.4. The net result is a composed direction.

2. **Shared vocabulary for both layers.** The action vocabulary (ram_nearest,
   flee_it_car, cruise_forward, etc.) is the API for BOTH the tendency
   system and the on_tick code. The tendency probes call them at learned
   magnitudes. The on_tick code calls them at author-determined magnitudes.
   They compose additively. This means on_tick code looks like:
   ```
   me.ram_nearest(0.8);  // "I strongly want to ram"
   ```
   instead of:
   ```
   me.steer(Math.atan2(dy, dx) - me.angle);  // angle math
   ```
   Same vocabulary, less complexity, portable across games.

3. **Ordinal magnitudes via softmax.** Magnitudes are floats 0..1 but the
   system is ordinal: only the relative proportions matter, not absolute
   values. All tendencies (from probes AND from on_tick) enter a softmax
   pool. Each tendency's share of the total determines what fraction of
   the car's movement budget goes toward that impulse. `(0.8, 0.2, 0.4)`
   and `(0.4, 0.1, 0.2)` produce identical behavior — same ratios.

4. **Reward simplifies to raw score delta.** When the tendency system is
   a gentle lean rather than the entire behavior, the on_tick code still
   carries most of the strategy. The TD learner can use raw score delta
   because the tendency's contribution is proportional — it doesn't need
   to specify what "good behavior" is, just whether the body's lean
   correlated with score going up.

5. **Portable pattern.** The vocabulary changes per game but the shape is
   universal: named actions with ordinal magnitudes, composed via softmax,
   probes on the tendency layer + explicit calls on the on_tick layer.

### Live observation: tendency system working (2026-04-06)

Tested in browser. Cars engage actively — no spinning, no single-action
dominance. The shared vocabulary works: on_tick code like
`me.ram_nearest(0.8)` composes with probe outputs via softmax.

Probe magnitudes after 314 TD updates (sample from Viper):
```
ram_nearest:    0.827   steer_right:  0.831
flee_it_car:    0.826   steer_left:   0.829
reverse:        0.828   cruise_forward: 0.821
ram_weakest:    0.811   brake:        0.815
```

All tendencies have comparable magnitudes (0.81-0.83 range). No single
tendency dominates the softmax — each gets ~7-8% share. The on_tick's
explicit calls shift the composition toward the driver's intent, and the
body's learned lean sits underneath.

TD errors are healthy (0.008-0.020), learning is active. Raw score delta
reward is flowing without the passive-survival spinning problem because
the tendency system can't spin — multiple tendencies pulling in different
directions produce net movement, not circles.

Scores: Viper 1371, Ghost 711, Rattler 275, Dust Devil 253, Bruiser 207.
The rewritten on_tick code produces engaging derby behavior.

### Reflection working: Claude evolves on_tick using the vocabulary (2026-04-06)

Auth'd into the vanilla platform, reflection API calls now succeed.
Observed two cars die and reflect with the new vocabulary API.

**Rattler's first death + reflection:**
- Died: IT timer ran out after 26 seconds
- Claude called `edit_on_tick` (189 → 1534 chars) and `edit_memory` (845 chars)
- New code uses vocabulary correctly with multiple simultaneous tendencies:
  ```js
  me.hunt_non_immune(1.0);
  me.ram_nearest(0.7);
  // If urgent:
  me.ram_nearest(1.0);
  me.hunt_non_immune(1.0);
  ```
- HP-aware mode switching: low HP → increase flee magnitudes
- Mixed vocabulary with direct world queries (checks for weak targets
  before boosting) — hybrid strategic reasoning
- Memory: structured analysis of the life + strategy notes referencing
  the vocabulary ("use hunt_non_immune(1.0) + ram_nearest(0.7)")
- Brag: "Now I don't waste boost sitting around—I chain-ram hunts when
  I'm it before the timer kills me."

**Dust Devil's first death + reflection:**
- Died: IT timer ran out after ~25 seconds
- Self-corrected: identified `me.steer_left(0.2)` from the original
  on_tick was causing circles, REMOVED it: "Steer_left bias was causing
  circles instead of straight pursuit"
- New code: cleaner, no steering bias, focused ram+hunt when IT
- Memory: "When IT: Hunt non-immune HARD (0.9+), boost constantly, no
  steering bias"

**What this validates:**
1. The cognition layer (Claude) understands and uses the vocabulary API
   correctly — multiple simultaneous tendencies with ordinal magnitudes
2. Claude reasons about strategy in terms of the vocabulary — memory
   entries reference action names and magnitudes
3. Claude can diagnose problems in its own code using the vocabulary
   abstraction ("steer_left was causing circles")
4. The two-layer system composes naturally: Claude writes strategic code
   using the vocabulary, tendency probes add body lean underneath,
   softmax composes both

### Honest assessment: what worked, what didn't, what surprised me

**Did it work?**

The plumbing works. The three layers compose. Claude writes valid vocabulary code, the tendency system compiles it, the softmax produces net movement, the TD learner updates probes, the reservoir loads and embeds. As a piece of engineering, it's sound.

But did the actants get *better* in a way I found meaningful? That's a more honest question and the answer is more nuanced.

**What I genuinely appreciated:**

Rattler's reflection was the highlight. It went from a 189-char template to a 1534-char strategic driver that manages boost timing, escalates aggression under IT timer pressure, and backs off when HP is low. That's a real behavioral arc: simple → situationally aware. If I watched Rattler play before and after, the difference would be visible — the after-Rattler would hunt more aggressively when IT, flee more carefully when hurt. That's a real improvement authored by a cognition layer that understood the vocabulary.

Dust Devil's self-correction was the other standout. It looked at its own trail map, saw circular motion, traced it to `steer_left(0.2)` in its code, and removed it. That's metacognition — the actant diagnosing its own authored behavior through observation. The vocabulary made this possible because the action names are human-readable: "steer_left was causing circles" is a sentence a reasoning model can produce. If the code had been raw `me.steer(-0.4 * Math.sin(world.time))`, Claude would have had a much harder time connecting that to "I'm going in circles."

**What I'm less sure about:**

The tendency probes (layer 1, the reservoir part) haven't demonstrated clear value yet in tag-your-dead. The probe magnitudes are all clustered around 0.7-0.83, contributing roughly equal shares to the softmax. The body "lean" is gentle and approximately uniform — it's not clear it's doing anything the on_tick code couldn't do alone. The TD errors are present but the learning is slow relative to a single Claude reflection, which can rewrite the entire strategy in one shot.

This is the fundamental tension: **Claude's reflection is SO powerful that it might make the sub-cognitive layer redundant for this game.** One reflection call rewrites 1500 chars of strategic code with conditional logic, world queries, and magnitude tuning. The tendency probes nudge steer by ±0.01 after 1000 TD updates. The timescales are mismatched by orders of magnitude.

In the original hunch experiment with fixed on_tick code, the probes were the ONLY adaptation mechanism, so they carried all the learning weight. Here, with Claude reflecting between deaths, the probes are competing with a much more powerful learner for the same job. It's like giving someone both a calculator and a supercomputer and asking whether the calculator helped.

**What actually surprised me:**

The vocabulary API itself — independent of both the probes and the reservoir — might be the real contribution. Look at what happened when we gave Claude this API vs the old raw steer/accelerate API:

Old API code (from session 1-3):
```js
const angle = me.angleTo(target.x, target.y);
const diff = angle - me.angle;
me.steer(Math.atan2(Math.sin(diff), Math.cos(diff)) * 2.5);
me.accelerate(1);
```

New vocabulary code (from Rattler's reflection):
```js
me.hunt_non_immune(1.0);
me.ram_nearest(0.7);
if (lowHp) {
  me.flee_it_car(0.9);
  me.flee_nearest(0.5);
}
```

The second version is shorter, clearer, higher-level, and easier for
Claude to reason about. The vocabulary is doing what good abstractions
do: it lets the author think at the right level. Claude doesn't need
to compute angles — it needs to express intent. "Hunt strongly, ram
moderately, flee when hurt" is the intent. The chassis handles the
geometry.

This is arguably more valuable for actant embodiment across games than
the reservoir probes are. The shared vocabulary pattern — named actions
with ordinal magnitudes, softmax-composed, usable by both authored code
and a learned layer — is a clean, portable abstraction that:

1. Makes on_tick code readable and writable by LLMs
2. Makes self-diagnosis possible ("steer_left caused circles")
3. Composes naturally with any sub-cognitive layer
4. Ports across games by changing only the action definitions

**The thing I'd want to test next:**

Run the game for 10+ deaths per car with the tendency probes OFF
(zeroed), then 10+ deaths with them ON, and compare the Claude-evolved
code quality and scores. If the probes are helping, cars with probes ON
should converge to better strategies faster — the body's learned lean
gives the conscious code a better baseline to work from. If there's no
difference, the probes aren't adding value and the vocabulary abstraction
is the real output of this experiment.

I genuinely don't know which way that would go, and that's what makes
it a good experiment.

### Two-timescale coupling and the oscillation question (2026-04-06)

Conversation with Robby surfaced a dynamic neither of us had thought
through: the tendency layer is always *chasing* the on_tick code.

The tendency probes train on score delta from the COMBINED behavior
(tendency lean + on_tick intent). But Claude's reflection rewrites
on_tick in one shot between deaths — shifting the entire strategy
instantaneously. The tendency probes, trained over thousands of ticks
at tiny learning rates, are always learning what worked under the
PREVIOUS strategy. By the time they converge, the strategy has already
shifted again.

This creates oscillation: on_tick shifts → tendencies chase → tendencies
lag behind → on_tick adapts to the (now slightly wrong) tendencies →
tendencies chase the new on_tick → cycle continues.

**Robby's insight: the oscillation might be GOOD.** If the tendency
layer perfectly aligned with on_tick, the system would settle into a
fixed point. The lag means there's always a mismatch — the body wants
something slightly different from what the driver intends. That
perturbation is free exploration. An actant whose body lean is "wrong"
for its current strategy might stumble into discoveries that a
perfectly-aligned system wouldn't.

This is a known phenomenon in two-timescale learning systems in RL
theory. The fast learner (Claude, one-shot strategy rewrite) and the
slow learner (TD probes, gradual weight updates) interact in ways
that are hard to predict from either layer alone. The oscillation is
an emergent property of the coupling, not a bug in either layer.

**The echo idea:** Robby also pointed at the reservoir's temporal
properties. Currently state-to-text is a single-tick snapshot: "I am
damaged. Car close northwest." But the reservoir is an LLM — it
processes token sequences and its activations carry context from earlier
tokens. If we fed it a SEQUENCE of recent states instead of a single
snapshot, the activations would encode temporal patterns: "I've been
taking damage for 3 seconds" or "I just boosted and am closing in."

The probes could then learn to recognize temporal patterns that a
single snapshot can't capture. "Closing in on a weak target after
boosting" is a temporal concept — it requires knowing both the current
state AND the recent trajectory. This would give the tendency layer
access to information that's genuinely complementary to what the on_tick
code sees (which is also a single-tick snapshot of me/world).

### Temporal sequences implemented + initial observation (2026-04-06)

Implemented StateHistory: rolling buffer of last 4 state snapshots per
car. Reservoir input now looks like:

```
Demolition derby. Ram other cars to score...
Earlier: healthy. Moving. Car close east.
Then: damaged. Fast. Car very close east.
Recently: damaged. Boosting! Car very close east.
Now: critical. Slow. Car adjacent east, weak.
Score: 253.
```

TD errors at ~324 updates with temporal sequences:
```
car         single-snap   orienting-ctx   temporal-seq
Viper       0.0001        0.0485          0.0200
Bruiser     0.0001        0.0463          0.0294
Ghost       0.0000        0.0177          0.0754  ← higher
Rattler     0.0001        0.0794          0.0662
Dust Devil  0.0001        0.1241          0.0081
```

TD errors are in the same healthy range as orienting context (0.01-0.08).
Ghost shows HIGHER TD error with sequences (0.075 vs 0.018), suggesting
the temporal context is producing more variable activations for Ghost's
situations — possibly because Ghost's evasive play creates more varied
trajectories than aggressive cars.

History buffers fill correctly (all at max 4 entries).

**Performance is the blocker for proper observation.** Game runs at ~1/10
real time — 7 seconds of game time in 5 minutes wall time. The temporal
sequences add ~50% more tokens to the reservoir input (100-150 tokens vs
~80 previously), further slowing each reservoir call. No cars died in
this observation window.

### 30-minute unattended run: massive code evolution (2026-04-06)

Bumped reservoir cadence to 60 frames (~1Hz) for ~3× real time speed.
Ran unattended for 30 minutes with autopilot on human player and data
logger snapshotting every 30 seconds. 353 seconds of game time, 63 log
entries, ~17,000 TD updates per car.

**Code evolution summary:**

| car        | start  | final   | growth | score | deaths |
|------------|--------|---------|--------|-------|--------|
| Viper      | 259    | 6,688   | 25.8×  | 699   | ~5     |
| Ghost      | 283    | 6,305   | 22.3×  | 575   | ~5     |
| Dust Devil | 246    | 6,860   | 27.9×  | 253   | ~5     |
| Bruiser    | 153    | 3,595   | 23.5×  | 113   | ~8     |
| Rattler    | 189    | 2,435   | 12.9×  | 93    | ~5     |

Every car evolved from ~200-char vocabulary templates to 2,500-6,800
char strategic drivers through multiple death/reflection cycles.

**What Claude evolved (highlights across all cars):**

1. **Tag state tracking.** Every car independently developed code to
   track IT state transitions via `me.memory.read()/write()`. They
   detect "was I IT last tick but not now?" (just gave tag) and "was I
   not IT but now am?" (just received tag). This is emergent — no car
   started with this logic.

2. **Post-tag escape.** After passing the IT tag, the newly-not-IT car
   learned that the NEW IT car is right next to them with 3x damage.
   Every car developed a flee-after-tagging routine: 3-4 seconds of
   maximum flee + boost. Bruiser self-labeled this code "v8" and added
   an early `return` to prevent conflicting tendencies during escape.

3. **Tag chain awareness.** Ghost tracks a `tagHistory` array — how
   many times it was tagged in the last 15 seconds. When tagged 2+
   times ("hot zone"), it enters maximum evasion mode. This is a
   genuinely emergent higher-order strategy: not just reacting to the
   current tag state but to the pattern of recent tag events.

4. **Cluster detection.** Ghost counts cars within 400 units and
   adjusts behavior when in a dense cluster vs isolated. This is
   spatial reasoning that the original 200-char templates didn't
   have.

5. **Stuck detection.** Rattler checks `me.speed < 20` and does
   `me.reverse(1.0); me.steer_right(1.0); return` — a practical
   fix for a real gameplay problem (getting jammed against obstacles).

6. **Smart boost timing.** Dust Devil conditionally boosts: "when IT
   car is close OR low HP OR nearest car is very close AND not IT."
   Instead of boosting on cooldown, it saves boost for moments that
   matter. Viper always boosts when available because "critical when
   IT (2x recharge)."

7. **Memory for learning.** Viper's memory tracks 4 lives of specific
   lessons: "Life 1 - Died in 2 seconds. Life 2 - Survived 136
   seconds, kills: 1, 102 car collisions — too much grinding."
   Bruiser's memory spans 4,894 chars of structured strategy notes.

**What this validates:**

The vocabulary API + Claude reflection produces genuine strategic
evolution. Cars went from simple tendency calls to full strategic
drivers with state machines, memory management, tag tracking, cluster
detection, and conditional logic — ALL expressed in the vocabulary
("me.flee_it_car(1.0); me.cruise_forward(1.0); return;") rather than
raw angle math.

The code grows sophisticated WITHOUT growing unreadable. Even at
6,000+ chars, the code is structured, commented (Claude adds
comments), and self-documenting via the vocabulary names. Compare to
the old API where 2,000 chars of `Math.atan2(Math.sin(diff),
Math.cos(diff)) * 2.5` was opaque.

**Scores tell a story:** Viper (699) and Ghost (575) — the two most
sophisticated evolved codes — are the top scorers. Bruiser (113) and
Rattler (93) — less evolved — are the lowest. Correlation doesn't
prove causation, but the directionality is suggestive.

**TD probe NaN issue:** Viper and Ghost show `meanAbsTD: NaN` at the
end. Likely a numerical stability issue in the TD learner (weight
values growing unbounded after 17,000 updates without normalization).
Need to investigate — possibly add weight clipping or learning rate
decay. The probes may have diverged after many updates, which means
their contribution to the softmax is unpredictable. Didn't crash the
game though.

### Playtest feedback from Robby (2026-04-08)

Robby played the game with the merged changes on main (reflex OFF,
vocabulary on_tick active, reflection working).

**UI issues:**
- Marquee ticker at bottom: text not readable against the dark
  background. Needs higher contrast / glow / outline.
- Minimap IT indicator: IT car turns red, but player is ALSO red on
  the minimap → confusing. Suggestion: keep original car color on
  minimap, add a red trail or pulsing concentric circles to mark the
  IT car instead.

**Gameplay observations:**
- Cars start out "real dumb" with the new 200-char vocabulary templates.
  Once they die and reflect (Claude rewrites their code), they get much
  better. But the initial period before first death is notably worse
  than the old angle-math templates.
  - This is the trade-off: simpler starting code → Claude can reason
    about it and evolve it → much better AFTER reflection. But the
    cold start is rough.
  - Could mitigate by making the starting templates slightly more
    capable (add a few more tendency calls) without going back to the
    old 2000-char angle math style.
- Without `?reflex=on`, the probe/reservoir subsystem is off but the
  vocabulary API (me.ram_nearest etc) + softmax composition is still
  active. The on_tick code uses the new vocabulary, composes via
  softmax, just without learned probe magnitudes in the pool.

**Missing features flagged:**
- No in-game reset button. Currently only `__tagYourDead.resetAll()`
  in console. Need a UI button on the pause screen.

Proper comparative testing needs either:
1. Reduce reservoir cadence to fire less often (e.g. every 30 frames
   instead of 6) — accept staleness for speed
2. Run headless without rendering — save the rendering overhead
3. Accept slow speed and run unattended for 30+ minutes
4. Batch reservoir calls across cars (one embedding call for all 5)

This is a running-cost / wall-time tradeoff, not a design problem. The
temporal sequences are working — we just can't observe enough game time
interactively to see their effect on probe behavior or reflection quality.

**What to test:**
1. Probes ON vs OFF comparison over 10+ deaths — does the tendency
   layer help or hinder Claude's strategy evolution?
2. Recent-state sequence in state-to-text — does temporal context in
   the reservoir input produce measurably different probe behavior?
3. Long run observation — does the oscillation between layers produce
   exploration that improves outcomes over many death/reflect cycles?

**Performance issue:** game runs at ~1/10 real time with reservoir
active (5 AI cars × reservoir calls on cadence). 70s game time in
~8 min wall time. Not a blocker for the experiment but would need
optimization for playable integration (reduce cadence, batch reservoir
calls, or skip reservoir for some cars).

**Implementation plan:**
- `actions.ts` — each action becomes a directional function returning
  `{steer, accel}` instead of calling `me.steer()` directly
- New `tendency-system.ts` — fires all tendencies, softmax composition
- `soma.ts` — `buildMeAPI` exposes vocabulary as `me.ram_nearest(mag)`
  instead of raw `me.steer(x)`. Both layers use the same API.
- `game.ts` — composition step: collect all tendency contributions from
  both layers, softmax, compute net steer/accel, apply
- All 5 personality on_tick rewrites in the new vocabulary
- `reflection.ts` — Claude knows the new API shape

### What's working well

- Reservoir loads from HuggingFace CDN in ~30s first run, ~2s cached
- TD updates fire every tick, probe weights persist to localStorage
- `__tagYourDead.reflexSummary()` gives clean diagnostic output
- Reflex layer doesn't crash the game or cause visible lag
- Per-car independent probes create natural behavioral diversity

### What needs work

- **Learning is too slow** for a single play session to show clear
  improvement. Need either: higher learning rates (risk instability),
  dataset centering (amplify per-state activation variance), or
  longer accumulation across many sessions.
- **No A/B comparison** yet — need to measure scores with vs without
  the reflex layer to answer "does this actually help?"
- **Soma interaction** is crude (reflex overwrites everything). A more
  nuanced integration would let the soma and reflex cooperate — e.g.,
  soma sets general direction, reflex fine-tunes timing.
- **No integration with reflection** yet — the cognition layer (between-
  death Claude reflection) doesn't know about the reflex's action
  histogram. Feeding it that data would let it evolve the action
  vocabulary based on what the reflex actually uses.

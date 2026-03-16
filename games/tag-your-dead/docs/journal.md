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

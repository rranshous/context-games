# Wheelman — Journal

## Session 1 — 2026-03-09

### What happened
Built the entire M1 from scratch in one session. Wheelman is a driving sim where the player is the boss watching from a drone — the driver is an actant (soma-based AI) that writes its own driving code and learns from your live radio feedback.

### Key decisions
- **Desert setting with raceon visuals** — not city. Raceon's pixel art is good, lean into it. Procedural desert 8000×6000 (3.3× bigger than raceon's 2400×1800).
- **Driver is the actant, player is the coach** — inversion of hot-pursuit (where player drove). You watch and yell.
- **Live audio feedback** — Web Speech API, speech-to-text streams into `world.radio` during runs. Not a thoughtful post-run review; you're screaming "LEFT LEFT LEFT" while they drive into rocks.
- **Fast run→reflect→run loop** — 60s max runs, immediate reflection, after-action screen, then next run. No menus.
- **Opus 4.6 for reflection** — best model for the actant's thinking. Haiku for change summaries (plain english recap for the player).
- **Drone narrative** — top-down camera explained as boss's drone feed. "Be glad you still have a job."

### Architecture
12 source files, TypeScript + esbuild (same scaffold as hot-pursuit/glint):

| File | Purpose |
|------|---------|
| `types.ts` | Position, DriverSoma, RunRecording, Objective |
| `config.ts` | World 8000×6000, vehicle physics, desert gen params |
| `desert-world.ts` | Procedural desert — oases, rocks, cacti, roads, avoidance grid |
| `vehicle.ts` | Raceon-style physics, soma-driven (steer/accelerate/brake) |
| `camera.ts` | Smooth-follow, world bounds clamping |
| `soma.ts` | Driver soma — on_tick compilation, me/world API, persistence |
| `speech.ts` | Web Speech API wrapper, auto-restart, transcript |
| `run-recorder.ts` | Records path, radio, events per run |
| `run-map-renderer.ts` | Bird's-eye PNG of run for reflection |
| `reflection.ts` | Opus 4.6 multi-turn reflection + haiku change summary |
| `game.ts` | Main game loop — title → run → reflect → after-action |
| `main.ts` | Entry point |

### Driver soma sections
- `identity` — who they are, motivation ("prove I'm better than a drone")
- `on_tick` — THE CODE, runs every frame, compiled via `new Function()`
- `memory` — map knowledge, patterns, boss preferences
- `boss_radio` — live transcript, cleared each run

### on_tick API
- `me.steer(dir)`, `me.accelerate(amt)`, `me.brake(amt)` — vehicle controls
- `me.position`, `me.speed`, `me.angle` — current state
- `me.memory.read()/write()`, `me.identity.read()`, `me.on_tick.read()` — soma access
- `world.radio` — boss's words
- `world.objective` — current target
- `world.pursuers` — enemies (empty in M1)
- `world.terrain(x,y)`, `world.distanceTo(pos)`, `world.angleTo(pos)` — world queries

### Reflection scaffold tools
- `edit_on_tick` — rewrite driving code (syntax validated)
- `edit_memory` — update memory
- `edit_identity` — update identity (rare)

### After-action screen
- Bird's-eye map: driver path (green), terrain features, events (numbered), legend
- Stats: duration, distance, objective proximity
- Boss radio transcript
- Reflection reasoning (streams in)
- Change summary (plain english, haiku-generated)
- "PRESS SPACE FOR NEXT RUN"

### Testing
- Title screen renders: "WHEELMAN" with subtitle and mic status
- Run works: driver drives toward objective using default on_tick, terrain renders, HUD shows timer/speed/run count
- First run: DELIVERED in 21.2s, 3831px distance
- After-action screen: map renders correctly, stats display, layout good
- Reflection: 401 from vanilla platform (Playwright not authenticated) — will work in real browser

### Bugs fixed
- **Space key not working in Playwright**: changed from press-held model to queue-based (`spaceQueued` flag set on keydown, consumed in next update frame)
- **Speech spam**: `not-allowed` error from Playwright (no mic) caused infinite retry loop. Added early bail on `not-allowed` error.

### Playtesting notes
- User confirmed: watching improvement across runs is the hook. It works.
- No mic on test machine — need text input fallback for radio (type-to-yell)
- Visual polish needed — currently colored shapes, not sprites. Should use raceon's actual sprite sheets.
- Needs enemies to create real pressure / interesting driving decisions

### Future ideas (from user)
- **Multiple drivers**: train them individually, frustrating to re-teach the same lessons = emotional investment
- **Later rounds = multiple drivers at once**: once trained up, promote to "the big time" — coordinated multi-car missions
- This creates a management sim layer on top of the driving sim — you're running a crew

### What's next (M2)
- Enemies! Patrol vehicles with chase behavior
- Driver sensor data (world.pursuers populated)
- Run ends if caught
- Pursuers on bird's-eye map
- Escalating difficulty across runs
- Text input fallback for radio (no mic machines)
- Sprite rendering (use raceon's actual pixel art instead of colored shapes)

---

## Session 2 — 2026-03-09

### What happened
Built M2: soma-driven pursuers. Not simple patrol AI — full actant cops with their own somas, signal handlers, reflection, and inter-unit radio. Ported the hot-pursuit officer pattern.

### Key decisions
- **Pursuers are actants, not config-driven AI** — each cop has their own soma (identity, on_tick signal handler, memory, chase history). They reflect after each run using sonnet-4-6, learn the driver's patterns, and evolve their pursuit code. Hot-pursuit proved this creates genuinely interesting emergent behavior.
- **Signal-based execution** — same as hot-pursuit. Each frame, highest-priority signal fires: `driver_spotted` > `driver_lost` > `ally_signal` > `tick`. Handlers are `onSignal(type, data, me)`.
- **Inter-pursuer radio** — `me.broadcast()` queues messages, delivered next frame with one-tick delay (double-buffered). Cops can coordinate sightings and respond to ally intel.
- **Composite map** — after-action map shows ALL paths: driver (green) + each pursuer in distinct color (red/orange/purple/pink), labeled by name. You see the whole chase at a glance.
- **Escalation** — run 1-2: 1 cop, run 3-4: 2, run 5-6: 3, run 7+: 4 (cap). Gradual pressure increase.
- **Driver + pursuers reflect in parallel** — both sides learn simultaneously after each run. The arms race begins.
- **Pursuer reflection uses sonnet-4-6** — not haiku. Hot-pursuit/glint proved stronger models >> heavy prompting with weak models for self-modification. Haiku generates plain-english summaries for the player.
- **Debrief phase** — after individual reflection, pursuers share observations and can adopt ally tactics. Same hot-pursuit pattern.

### New files
| File | Purpose |
|------|---------|
| `pursuer-soma.ts` | Soma structure, 4 named templates (Viper/Hound/Hawk/Rattler), persistence |
| `pursuer.ts` | Pursuer entity — vehicle physics, signal dispatch, me/world API |
| `pursuer-reflection.ts` | Per-pursuer sonnet reflection + debrief + haiku summaries |

### Modified files
- `types.ts` — `PursuerSoma`, `PursuerSignal`, `PursuerMode`, `PursuerBroadcast`, `pursuerRadioLog` in RunRecording
- `config.ts` — `PURSUER` constants (speeds, ranges, timeout), `ESCALATION` table
- `run-recorder.ts` — `recordPursuerRadio()` method
- `run-map-renderer.ts` — composite map with pursuer paths, names, distinct colors, updated legend
- `game.ts` — pursuer spawning, per-frame update loop, radio buffer swap, catch detection, parallel reflection, after-action UI with "PURSUIT DIVISION" section

### Pursuer templates
| Name | Style |
|------|-------|
| Viper | Ambush predator — waits near objective, strikes on approach |
| Hound | Relentless tracker — never breaks pursuit, wears driver down |
| Hawk | Wide-range scout — broad patrols, spots from distance, calls it in |
| Rattler | Chokepoint blocker — studies terrain, cuts off escape routes |

### Pursuer soma sections
- `identity` — who they are, style ("I am Viper. I don't chase — I predict.")
- `on_tick` — `onSignal(type, data, me)` — THE CODE
- `memory` — driver patterns, terrain knowledge, coordination lessons
- `chaseHistory` — structured run outcomes

### Signal handler API
- Signals: `driver_spotted`, `driver_lost`, `ally_signal`, `tick`
- `me.steer()/.accelerate()/.brake()` — same vehicle physics as driver
- `me.distanceTo()/.angleTo()` — spatial helpers
- `me.broadcast({type, position, data})` — radio allies
- `me.memory.read()/.write()`, `me.identity.read()`, `me.on_tick.read()`

### Reflection
- **Model**: sonnet-4-6 (individual + debrief), haiku for summaries
- **3 scaffold tools**: `edit_on_tick`, `edit_memory`, `edit_identity`
- **Max 5 turns** per pursuer, multi-turn conversation
- **Debrief**: after individual reflection, each pursuer reviews ally changes, can adopt tactics
- **Input**: run summary + composite map PNG + inter-pursuer radio log + current soma
- **Validation**: same forbidden patterns as driver (no eval, fetch, window, etc.)

### After-action UI
- **LEFT**: composite map — driver path (green) + each pursuer path (colored, labeled by name)
- **RIGHT (scrollable)**:
  - Outcome + stats
  - Boss radio transcript
  - Driver reflection + change summary
  - Blue separator: **PURSUIT DIVISION**
  - Each pursuer: name (colored) → change summary → debrief summary → token usage
  - Scroll hint at bottom

### HUD additions
- Pursuer count in top bar ("3 COPS")
- Proximity warnings: red for pursuing (!!) + gold for nearby (?), shows name + distance
- Pursuers rendered as blue rectangles (patrol) / red rectangles (pursuing) with name labels

### Persistence
- `wheelman-soma` — driver soma (unchanged)
- `wheelman-pursuers` — all pursuer somas, saved after each run's reflection

### Future ideas (from user)
- **Different models per cop** — use OpenRouter to give each cop a different model (sonnet, haiku, grok, etc). See how different models chase differently. Would need per-pursuer model config in soma or template.

### What's next
- Playtest! See how the arms race develops
- Text input fallback for radio
- Sprite rendering
- Consider per-cop model diversity via OpenRouter

---

## Session 3 — 2026-03-09

### What happened
Two batches of changes in one session:

**Batch 1 (pre-test):** Vague objectives + sprite system + reset. These were coded but untested at the start of the session.

**Batch 2 (post-test):** Visual overhaul — after seeing the game running, the visuals were clearly not up to raceon's standard. Overhauled the entire rendering pipeline.

### Batch 1: Vague objectives + sprites + reset

#### Vague objective system
- Driver no longer gets exact GPS coordinates to the objective
- Instead gets compass direction (`north`, `southeast`, etc.) and rough distance category (`far`, `medium`, `close`, `very close`, `right here`)
- Forces the driver to rely on the boss's radio for precise guidance — the boss can see the objective on the drone feed
- `getCompassDirection()` and `getDistanceCategory()` in soma.ts
- Default on_tick updated to use `dirAngles` lookup table for compass-to-angle conversion
- Reflection prompt updated to explain the vague system and emphasize "the boss is your GPS"

#### Sprite rendering (initial)
- New `sprites.ts` — loads raceon's mini-pixel-pack-2 sprite sheets
- Assets symlinked from `games/raceon/resources/assets/mini-pixel-pack-2`
- Cars, desert details, rocks, cacti all sprite-rendered with shape fallbacks
- Initially used 8-directional frame lookup (choppy)

#### Reset
- `R` key on title screen resets all somas (driver + pursuers)
- "R = reset all somas" hint text on title screen

### Batch 2: Visual overhaul — "learn from raceon"

#### Car rotation fix
- **Before**: 8-directional frame lookup from sprite sheet (choppy, 45° steps)
- **After**: Canvas rotation of frame 0 (smooth, like raceon). `ctx.rotate(angle + π/2)` — sprite faces up, world angle 0 = east
- Scale: 1.8× (slightly larger than raceon's 1.5, fits wheelman's wider camera)

#### Effects system (`effects.ts` — new file)
Ported raceon's three effect systems:

| System | Details |
|--------|---------|
| **Dust particles** | Sandy puffs behind fast-moving vehicles (>80 px/s). Max 200, ejected behind at spread angle, gravity + friction, RGBA fade-out |
| **Tire tracks** | Dual left/right marks (5px offset perpendicular to angle). 6×3px rectangles. Player = brown, pursuer = blue-gray. Max 600, 4-6s life. Speed threshold 30+ |
| **Screen shake** | Intensity + duration, decays linearly. Triggered on collisions (proportional to impact speed, capped at 8px). Applied as camera offset before world render, HUD unaffected |

Also added collision-specific particles:
- `spawnCollisionParticles()` — brown/debris burst on rock hits
- `spawnWaterSplash()` — blue splash on water entry

#### Render pipeline (updated)
```
1. Screen shake offset (ctx.translate)
2. Desert world (sand, textured sand, roads, water oases, rocks, cacti)
3. Tire tracks (behind vehicles)
4. Objective marker
5. Pursuers
6. Player vehicle
7. Dust/collision particles (on top)
8. ctx.restore() (end shake)
9. HUD (unshaken)
```

#### Water oases improved
- Added muddy/sandy border ring (20px, `#8a7a55`) — like raceon's textured sand transition
- Dark water edge
- Water highlight shimmer (semi-transparent lighter circle, offset for depth)

#### Rock variants
- Rocks now use 2 sprite variants (position-hashed) instead of always the same tile

### Files changed
| File | Change |
|------|--------|
| `sprites.ts` | **Rewritten** — canvas rotation instead of 8-dir frames, 1.8× scale, rock variants, also loads road + props sheets |
| `effects.ts` | **New** — particles, tire tracks, screen shake |
| `vehicle.ts` | Spawns dust + tire tracks during physics update, collision particles + screen shake on impact |
| `pursuer.ts` | Spawns tire tracks + dust (only when pursuing) |
| `game.ts` | Imports effects, updates particles/tracks each frame, render pipeline reordered with shake + effects, clears effects on run start |
| `desert-world.ts` | Better water oases (muddy border + shimmer), rock variants |
| `soma.ts` | Vague objective (compass + distance), helper functions |
| `reflection.ts` | Updated prompts for vague objective system |
| `main.ts` | Loads sprites on startup |

### Testing
- Sprites load correctly from raceon symlink
- Car rotation smooth — no more choppy 8-direction snapping
- Tire tracks visible behind both player and pursuer vehicles
- Dust particles kick up at speed, fade naturally
- Water oases look much better with muddy border
- After-action screen + composite map still work
- Reflection hits 401 in Playwright (expected, not authenticated)
- Driver still delivers with default vague-objective code (~23s)

### Playtesting notes
- Visual quality now comparable to raceon — cars rotate smoothly, effects add life
- The dust + tracks make speed feel tangible
- Screen shake on rock collision gives satisfying feedback
- Vague objective system means default on_tick is less precise — driver has to learn from radio

### Batch 3: Color palette + tile-based rendering

#### Root cause: color mismatch
- Sprite tile backgrounds are `rgb(239, 182, 129)` = `#efb681` (warm peach sand)
- Our sand base was `#c2b280` (greenish khaki) — completely different!
- This caused visible square borders around every sprite tile

#### Sand base color fix
- Changed base sand from `#c2b280` → `#efb681` to match sprite tile backgrounds
- Updated ALL terrain colors to harmonize: textured sand, roads, water borders, grove patches
- Updated map renderer (`run-map-renderer.ts`) to match new palette

#### Sprite index fix
- **Was wrong**: cactus used tiles 0-2 (but tile 0=blank sand, 1=textured sand, only 2=cactus)
- **Was wrong**: rock used tiles 3-4 (but tile 4 is empty/transparent)
- **Fixed**: cactus always tile 2, rock always tile 3 — the correct sprites from the sheet
- Desert details sheet is only 64×16 (4 tiles), not 128×16 (8)

#### Tiled terrain (like raceon)
- **Textured sand patches**: replaced solid color circles with tiled sprite rendering using tile 1 (brown specs)
- **Water oases**: replaced smooth gradient circles with tiled water sprite (`Highway_water_color`) + textured sand border ring
- **Cacti**: removed ground patch circles — sprites blend naturally on matching background
- Loaded `Highway_water_color (16 x 16).png` as water tile sprite

#### Assets
- Replaced symlink with actual copy of `mini-pixel-pack-2` from raceon

#### Dust trail fix
- Spawn point offset 14px behind car center (was spawning at center → "coming from sunroof")
- Render order: particles render BEFORE vehicles (ground level), not after

---

## Session 4 — Flow & Playability

**Goal**: Fix the biggest pain points before playtesting — reflection takes forever, no situational awareness of chasers, no way to test without a mic.

### Reflection speedup
- **Driver reflection**: switched from opus-4-6 to sonnet-4-6, reduced max turns 5→3, dropped separate haiku summary call (inline string instead). Should be dramatically faster.
- **Pursuer reflection**: now runs in **background during the next run**. Driver reflection stays blocking (you want to see updated behavior immediately). Pursuers improve silently — changes apply when API calls finish, compile cache auto-clears.
- After-action screen shows "reflecting in background..." for pursuers if results aren't in yet. Subtle "cops reflecting..." HUD indicator during runs.

### Minimap
- Top-right corner during runs. Shows full world bounds with:
  - Green dot: driver
  - Colored dots: pursuers (red when in pursuit, labeled with name)
  - Gold diamond: objective
  - Blue patches: oases (terrain hint)
  - Faint rectangle: current camera viewport
- Exposed `oases` getter from `DesertWorld` (was private `waterOases`).

### Text radio input
- Press **T** during runs to open text input bar at bottom of screen.
- Type a message, **Enter** to send (injected into radio transcript same as speech), **Escape** to cancel.
- Works alongside mic or as sole input when Speech API unavailable.
- `SpeechInput.injectText()` method for programmatic radio injection.
- Title screen updated to mention T key.

### Architecture notes
- Patrol waypoints: engine generates 4-6 random positions, delivers current one in `tick` signal data. The *default* on_tick code drives toward them, but cops can rewrite this during reflection — waypoints are a suggestion, behavior is soma-owned.
- Pursuers don't know objective location (asked, confirmed). Purely reactive: patrol → spot → chase → radio allies. Could be interesting to give them objective intel later as a difficulty escalation.

### Pause-while-typing
- Game simulation freezes when text input is open (T key). Timer stops, vehicles stop. Screen dims.
- Makes text input actually usable — you're not racing the clock while typing.

### Bug fix
- `replace_all` renamed `waterOases_` → `waterOases__` inside the getter (double underscore). Classic footgun.

### Playtesting observations
- Text input works end-to-end: T → type → Enter → message appears in radio transcript at bottom, driver reads from `world.radio`
- Minimap is immediately useful — you can see cops converging before they're on screen
- 401 errors from API (not logged into dev server during test) but flow is correct — reflection completes, after-action shows, space advances

### Session 5 idea: Debrief Scene
**Core insight**: The raw reflection text (AI reasoning about code changes) breaks immersion. The player is the **boss** — they don't care about code. They want to feel like they're grilling a peon who screwed up.

**Vision**: After-action becomes a **debrief scene**. The driver sits across from you at a desk, explaining themselves in character. "Sorry boss, I got turned around near those rocks... next time I'll stick to the roads when I hear you say go east." The reflection still happens (soma updates), but what the player *sees* is the driver's in-character response to the run.

This could be a separate short API call (haiku?) with a character prompt: "You just finished a run for the boss. The boss said [radio transcript]. You [outcome]. Explain yourself. Be specific about what went wrong and what you'll do differently. Stay in character — you're a driver trying to keep your job."

The current reflection streaming text and technical change summary would be replaced by this debrief dialogue. The actual soma modifications still happen silently.

### What's next
- **Session 5**: Debrief scene — in-character driver response replaces technical reflection output
- **Playtest** with auth'd dev server — see actual reflection + arms race
- Consider per-cop model diversity via OpenRouter
- Road rendering could use sprite tiles from Desert_road sheet
- Maybe give pursuers objective location at higher escalation tiers

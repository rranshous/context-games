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

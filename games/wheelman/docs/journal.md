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

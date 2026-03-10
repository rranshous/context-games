# Wheelman

You're the boss. You have a drone. You have a driver. The driver is an actant — a soma that writes its own driving code. You watch from above and scream into the radio. The driver listens, reflects, rewrites, and goes again.

The implicit threat: *we're working on getting the drone to pilot the car. be glad you still have a job.*

## Setting

Desert. Raceon's visual style — pixel art, top-down, canvas rendering. Sand, oases, rocks, cacti, canyons. But bigger: 8000×6000 minimum. Procedural terrain with natural corridors, chokepoints, and route variety.

Missions are point A to point B. Deliver the package. Evade the heat. Get to the drop. The desert has natural routes — canyon passes, open stretches, rocky narrows. Route choice matters.

## Core Loop

The loop is tight. No menus, no downtime.

1. **Run** (30-60 seconds) — driver executes on_tick every frame, navigating terrain and evading pursuers. You watch the drone feed and yell into the mic.
2. **After-Action** — the run ends (delivered, caught, crashed). You see:
   - Bird's-eye map of the run (route traced, key moments marked)
   - Your radio transcript (everything you said)
   - Driver's reflection streaming in real-time (watching them think)
   - AI-generated summary of what they changed and why (plain english, no code)
3. **Next run** — immediately. Harder enemies, new route, see if they learned.

Run → reflect → run → reflect. The game IS watching them get better.

## The Driver (Soma)

Hot-pursuit style soma architecture. Four sections:

| Section | Purpose |
|---------|---------|
| `identity` | Who they are, driving style, motivation. "I am a wheelman. The boss is watching. I need to prove I'm better than a drone." |
| `on_tick` | THE CODE. Runs every frame. Steering, evasion, route planning. Compiled via `new Function()`. |
| `memory` | What they remember: map knowledge, cop patterns, past mistakes, boss preferences. |
| `boss_radio` | Your words, transcribed live via Web Speech API. Cleared each run, fed into reflection. |

### on_tick API

The driver's code receives `(me, world)`:

**me:**
- `me.position` — current {x, y}
- `me.speed` — current speed
- `me.angle` — current heading
- `me.steer(direction)` — turn left/right (-1 to 1)
- `me.accelerate(amount)` — gas (0 to 1)
- `me.brake(amount)` — brake (0 to 1)
- `me.memory.read()` / `me.memory.write(text)`
- `me.identity.read()`
- `me.on_tick.read()`

**world:**
- `world.radio` — current boss radio transcript (live, accumulating)
- `world.pursuers` — array of {position, speed, angle} for nearby enemies
- `world.objective` — {position, type} for current target
- `world.terrain` — terrain query at position (sand, rock, water, cactus)
- `world.distanceTo(pos)` — distance helper
- `world.angleTo(pos)` — angle helper
- `world.mapBounds` — {width, height}

### Reflection

After each run. Model: **claude-opus-4-6**. Best model, best learning.

**Input to reflection:**
- Bird's-eye PNG map of the run (route traced, pursuers shown)
- Run summary: duration, outcome, distance covered, times spotted, route taken
- Boss radio transcript (everything you yelled, timestamped)
- Current on_tick code
- Current memory
- Current identity

**Scaffold tools (hot-pursuit proven):**
- `edit_on_tick` — rewrite driving code
- `edit_memory` — update memory
- `edit_identity` — rare, but the driver can evolve personality

**After-action screen shows:**
- The bird's-eye map
- Your radio transcript
- The model's reasoning streaming (watching them think)
- AI summary of changes: "Added canyon-hugging logic after boss said to use cover. Now checks for rock formations within sensor range and routes toward them when pursued." (opus-generated, plain english)

## Live Audio Feedback

Web Speech API (SpeechRecognition). Chrome-only is fine.

- Mic button to start/stop (or always-on during runs)
- Speech-to-text streams into `world.radio` in real-time
- Driver's on_tick can read radio at any time
- Transcript saved for reflection input
- Timestamped so reflection knows when you said what relative to events

This is the gritty reality. You're not writing a thoughtful review. You're screaming "LEFT LEFT LEFT" while they drive into a rock.

## Enemies (Pursuers)

Start simple. Escalate.

**Wave 1:** Patrol vehicles on fixed routes. Spot the driver, give chase. Raceon-style AI (escaping behavior inverted to chasing). No soma — just config-driven behaviors.

**Wave 2:** Faster pursuers, basic coordination (radio each other).

**Wave 3:** Roadblocks at chokepoints. Pre-positioned based on objective location.

**Later:** Pursuers get their own somas. The arms race begins. (Hot-pursuit proved this works beautifully.)

## Map Generation

Procedural desert, 8000×6000 pixels. Raceon's terrain types but structured:

- **Open desert** — fast, exposed
- **Canyon passes** — narrow, covered, slower
- **Rock formations** — hard cover, must navigate around
- **Oasis clusters** — water obstacles, terrain friction
- **Cactus groves** — friction zones, partial cover
- **Settlements** — small clusters of structures, mission endpoints

Natural corridors emerge from terrain placement. Multiple routes between any two points. The driver discovers preferred routes over time.

## Visual Style

Raceon's pixel art. Same sprite approach:
- 16×16 base tiles, 2× scale
- Car sprites with rotation
- Desert terrain tiles (sand, textured sand, water, rock, cactus)
- Camera follows the driver's car (drone POV)
- Dust trails, tire tracks, particle effects on collision

## Tech Stack

- TypeScript + esbuild (hot-pursuit/glint pattern)
- HTML5 Canvas rendering
- Web Speech API for mic input
- Vanilla platform for dev server (`/dev/wheelman/index.html`)
- No external runtime dependencies
- localStorage for soma persistence

## Milestones

### M1: Driver Drives
- Project scaffold (esbuild, TypeScript)
- Desert world generation (bigger than raceon, procedural)
- Vehicle physics (ported from raceon)
- Driver soma with default on_tick (basic: drive toward objective)
- Camera following driver
- Objective marker (point B)
- Run ends when driver reaches objective or time runs out
- Web Speech API capturing → world.radio
- After-action screen: map + transcript + reflection + change summary
- Back-to-back runs (space to continue)

### M2: Enemies
- Patrol vehicles with chase behavior
- Driver sensor data (world.pursuers)
- Run ends if caught
- Pursuers on the bird's-eye map
- Escalating difficulty across runs

### M3: The Arms Race
- Pursuers get somas
- Both sides reflect and evolve
- The game gets interesting

### M4: Polish
- Mission variety (delivery, escape, border run)
- Settlements and mission endpoints
- Score/progression tracking
- Sound effects

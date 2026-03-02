# Glint — Development Journal

## Concept
Baby squid survival in a bioluminescent coral reef. Dark but upbeat — a coming-of-age story in the deep. Core chase loop inspired by hot-pursuit (AI predators that learn your patterns), rendered in dark-rider style (Three.js, isometric, cel-shaded, pixelated).

## Session 1 — Scaffolding (2026-03-02)

### Decisions
- **New game**, not a hot-pursuit reskin — the theme diverges enough to warrant its own project
- **Name: Glint** — small flash of light in dark water. That's the baby squid.
- **Three.js + dark-rider rendering style**: orthographic isometric, cel-shaded MeshToonMaterial, 320×240 internal res with 3× pixelated upscale, FogExp2 for murky depth
- **TypeScript + esbuild** (same pattern as hot-pursuit/cognitive-climb), output to `dist/`
- **Gamepad support** from day one — target Xbox controller via browser for couch play
- **Vanilla platform** for dev: `http://localhost:3000/dev/glint/index.html`
- Keep scope small first: nail the core chase loop before adding growth/progression mechanics

### Built
- Project scaffold: package.json, tsconfig, esbuild config (with `--watch`)
- index.html: Three.js via CDN importmap, pixelated canvas
- src/main.ts: basic scene with:
  - Ocean floor + sand patches
  - Coral clusters (cylinders + branches, blue-purple hues)
  - Rocks (dodecahedrons), kelp (swaying cones)
  - Baby squid: blocky body, glowing eyes, tentacles, bioluminescent point light pulse
  - Scattered ambient bioluminescence
  - WASD/arrows + gamepad left stick input (isometric-corrected)
  - Camera follows squid

### Theme Mapping (from hot-pursuit)
| Hot Pursuit | Glint |
|---|---|
| Player (car) | Baby squid |
| Police cruisers | Predators (sharks, eels, etc.) |
| City grid | Coral reef labyrinth |
| Roads | Open water channels |
| Buildings | Coral formations |
| Alleys | Narrow crevices |
| Extraction point | Safe den |
| Sirens | Bioluminescent threat glow |
| Precincts | Life stages / deeper water |

### Next
- Visual check — does the scene look/feel right?
- Add predator(s) — start with a simple shark patrol
- Wire up chase detection + evasion loop

## Session 1b — Visual Polish (2026-03-02)

### Feedback & Fixes
- **Squid looked like a fish** → rebuilt: bulbous dome mantle, lateral eyes with pupils, side fins that flutter, 8 tentacles in a ring splaying outward. Reads as squid now.
- **Flat plane "fan coral"** → removed. Replaced with tube coral (cylinder clusters with glowing torus rims) and shelf coral (stacked tilted discs on a stem). No more mystery squares.
- **Coral looked like rocks** → 4 coral types now: branching (trunk + forking arms with glowing tips), brain (squashed icosahedron), tube (thin cylinders with glowing rims), shelf (stacked plates). Warm color palette: pinks, oranges, yellows alongside blues/purples.
- **Nothing moved passively** → added current sway: branching coral and tube coral gently sway (tracked in `swayItems[]`), kelp has bigger arcs, jellyfish drift in wider patterns, particles drift laterally too. Rocks stay still (they're rigid).
- **No collision yet** — intentional. Visual pass first.

### Architecture Notes
- Seeded RNG (`mulberry32(42)`) for deterministic reef layout across reloads
- `swayItems[]` array tracks all coral groups that should animate in the current
- Reef structure: `placeWall()` for boundary/interior walls, manual placement for anemone clusters and kelp groves
- All coral types return their group/mesh; wall placement dispatches randomly between types

### Dev Workflow
- `npm run watch` in background for continuous rebuild
- Commit aggressively for continuity across context windows
- Update this journal each commit

### Next
- Continue iterating visuals based on playtesting feel
- Add first predator (shark patrol)
- Wire up chase detection + evasion loop

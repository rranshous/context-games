# Dark Rider

An isometric cel-shaded exploration demo inspired by [Sokpop's Wild-9](https://sokpop.co/). A dark hooded rider on horseback navigates a forest path as day turns to night and back again.

## Visual Style

The goal was to replicate Wild-9's distinctive look in a single HTML file using Three.js:

- **Isometric projection** — `OrthographicCamera` positioned at equal X/Y/Z gives a true isometric view with no perspective distortion
- **Cel-shading** — `MeshToonMaterial` with a 3-step gradient texture (dark/mid/light bands) on all objects
- **Pixelation** — Renders at 320x240, CSS-upscaled 3x with `image-rendering: pixelated` for that crunchy low-res look
- **Hard shadows** — `BasicShadowMap` produces crisp pixel-perfect shadow edges that match the aesthetic
- **Distance fog** — `FogExp2` blends distant objects into the sky color

## What's In The Scene

- **Dark Rider** — Blocky horse + hooded rider built from box/cone/cylinder primitives. Legs animate when moving, body bobs gently
- **Forest** — 20 pine trees (stacked cone foliage on cylinder trunks) scattered along a dirt path
- **Rocks** — 12 dodecahedron rocks in varying sizes
- **Ground detail** — 60 color-variation patches + ~100 grass tuft clusters break up the flat ground
- **Day/night cycle** — Sun orbits over 5 minutes. Sky, fog, and lighting blend through day, sunset, night, and dawn phases

## How It Works

Everything runs in a single `index.html` (~400 lines) with no build step. Three.js is loaded from CDN via import map.

**World scrolling**: The rider stays at the origin while the world moves around it — trees, rocks, ground, and path all shift by the inverse of the player's accumulated movement offset. This creates an infinite-scroll feel.

**Collisions**: Circle-based. Each tree trunk and rock registers a collider `{x, z, radius}` at creation time. Each frame, the proposed player position is checked against all colliders. If overlapping, the position is resolved to exactly the collider boundary — no velocity-based push-out (which causes jitter), just direct position clamping.

**Day/night**: A single `sunY = sin(angle)` value drives everything — sun position, sky color blending, fog density, light intensity/color, and ambient shifts. When `sunY > 0` it's day, when `sunY < 0` it's night, with smooth transitions at the boundaries.

## Controls

- **WASD** or **Arrow Keys** — Move the rider
- The rider automatically faces the direction of movement

## Running It

Served via the vanilla platform dev server:

```
cd platforms/vanilla && npm run dev
```

Then visit: `http://localhost:3000/dev/dark-rider/index.html`

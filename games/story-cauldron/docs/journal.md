# Story Cauldron — Build Journal

## Session 1: M1 Opening Scene (2026-02-08)

### What we built

Static opening scene for the beach — first-person POV, sunset, red mailbox, three choice buttons. Single self-contained `index.html` served on the vanilla platform.

### Key decision: Hybrid rendering approach

Started with a fully smooth canvas-rendered mailbox (gradients, arcs, bezier curves). It looked nice but raised the question: how will AI generate foreground objects at runtime?

**The idea:** Split the visual system into two layers:
- **Background**: Smooth canvas rendering — gradients, curves, atmospheric effects. Pre-built per scene. Sky, ocean, sand, palm trees, clouds, vignette, lighting washes.
- **Foreground objects**: Pixel-art sprites using the oneshot-climb method — ASCII character grids mapped to a color palette, rendered as scaled blocks. Chunky, low-res, but charming.

**Why this works:**
- AI can generate sprites at runtime — just output a character grid and a palette mapping
- The aesthetic contrast (smooth bg + pixelated fg) is actually charming, not jarring
- Backgrounds set the mood/atmosphere, sprites populate the world
- Sprites are cheap to define, easy to validate, consistent in style
- Same `drawSprite(sprite, palette, x, y, scale)` function handles everything

**What we tried first:** Fully vector-drawn mailbox with arcs, gradients, highlights. Looked polished but wasn't the right approach for dynamic content.

### Visual iteration (background)

Went through several rounds refining the scene:

1. **V1**: Basic colored rectangles. Sky gradient, flat ocean, flat sand. Mailbox too small and overlapping the sun.
2. **V2**: Pushed horizon up, enlarged mailbox, moved it into sand foreground. Added feather-pattern palm fronds (stem + leaflets instead of thin strokes). Better but sand area still flat.
3. **V3**: Added wispy sunset clouds lit from below, foam/surf lines at waterline, sand wind ripple texture, golden hour light wash, vignette for focus. Scene started feeling atmospheric.
4. **V4 (hybrid)**: Replaced vector mailbox with pixel-art sprite. The contrast clicked — it feels intentional and playful.

### Sprite system

Ported from oneshot-climb. Key elements:

- `SPRITE_PALETTE` — object mapping single characters to hex colors, `.` = transparent
- Sprites defined as arrays of strings (one string per row)
- `drawSprite(sprite, palette, x, y, scale)` — iterates grid, draws filled rects
- Current mailbox: 14x24 pixels at 6x scale = 84x144 screen pixels
- Shadow still rendered smooth (it's part of the background layer)

### Scene data structure

Scenes are defined as plain objects — this is the shape AI will eventually generate:

```javascript
{
    sky: { colors: [...] },
    sun: { x, y, radius, glowRadius },
    ocean: { y, height, deepColor, shallowColor },
    sand: { y, color, wetColor, darkColor },
    palms: [{ x, trunkHeight, lean, scale }],
    mailbox: { x, groundY, spriteScale },
    narration: "...",
    choices: ["...", "...", "..."]
}
```

### Technical details

- Canvas: 1120x520, rounded corners, warm glow box-shadow
- Layout: flexbox column — canvas (flex:1), narration (fixed), choices (fixed)
- Font: Georgia serif for storybook warmth
- Dark bg (#0a0a1a), projector-friendly
- Text/buttons fade in with CSS animations (0.5s and 2.5s delays)
- Tested at 1920x1080 (projector sim) — scales well

### What's next

- M2: Scene transitions — click a choice, loading state, hardcoded second scene
- Open question: Should palm trees also become sprites? Or stay as background elements?
- Open question: How much of the scene description should AI control? Just objects + narration? Or also background params?

---

## Session 2: M2 Scene Transition (2026-02-08)

### What we built

Click any choice → smooth overlay transition → a completely different scene renders. Proves the render-transition-render loop works end to end.

### The second scene: Twilight Forest Path

Wanted something visually unmistakable from the beach. Went with a nighttime forest trail:

- Deep blue/purple starfield sky (vs. warm sunset)
- Green forest ground with a dirt path, grass tufts, and leaf debris (vs. golden sand + ocean)
- Fireflies drifting through the scene with soft radial glows
- Pixel-art signpost sprite at a fork in the path (two signs on a wooden post)
- Dense palm trees framing both sides (they're tropical island palms, but in a jungle context they work)
- Cool moonlit atmospheric wash + stronger vignette (vs. warm golden hour)

The contrast really sells it — beach feels warm and open, forest feels cool and enclosed.

### Key decision: Data-driven conditional renderer

Rather than writing a separate render function per scene type, `renderScene` now checks which properties exist on the scene object and draws accordingly:

```javascript
if (scene.sky) drawSky(scene.sky);
if (scene.stars) drawStars();
if (scene.ocean) drawOcean(scene.ocean);
if (scene.sand) drawSand(scene.sand);
if (scene.ground) drawForestGround(scene.ground);
if (scene.fireflies) drawFireflies();
// ... etc
```

This means scenes are fully defined by their data. A scene with `ocean` gets water; one with `ground` gets a forest floor. Same renderer, different output. This is the shape AI will generate into.

### Scene data structure (updated)

New optional fields added:

```javascript
{
    sky: { colors: [...], height: 0.50 },  // height is now configurable
    stars: true,                             // optional starfield
    ground: { y, color, wetColor, darkColor }, // alternative to sand
    fireflies: true,                         // optional glowing particles
    signpost: { x, groundY, spriteScale },   // new sprite type
    ambience: 'cool',                        // 'cool' = moonlit, default = warm
    // ... plus all existing fields (sun, ocean, sand, palms, mailbox)
}
```

### Transition system

Overlay-based approach — clean and foolproof:

1. Click choice → buttons dim + disable
2. Full-screen overlay (matches body bg `#0a0a1a`) fades in over 0.8s
3. "The story unfolds..." text pulses while overlay is opaque
4. Behind the overlay, new scene renders on canvas + narration/choices update
5. Overlay fades out to reveal the new scene

CSS animations for narration/choices are retriggered on subsequent scenes with shorter delays (0.1s and 1.0s vs. the initial 0.5s and 2.5s) — returning players don't need the slow build-up.

### Renderer changes

- `drawSky`: Now accepts `sky.height` (default 0.45) and fills full canvas — ground layers paint over
- `drawPalm`: Accepts `groundY` parameter instead of hardcoded 0.53 sand line
- New: `drawStars()` — deterministic scatter of 80 stars with varying size/opacity
- New: `drawForestGround()` — earth-tone gradient, centered dirt path, grass tufts, leaf debris
- New: `drawFireflies()` — 20 particles with radial glow halos + bright core dots
- New: `drawSignpostSprite()` — pixel-art signpost (11x18, reuses existing palette)
- Ambience system: `'cool'` → blue moonlit wash, default → golden hour wash. Vignette strength varies.

### What's next

- M3: AI generation — call Haiku via vanilla platform API, have it generate scene data + narration
- The data-driven renderer is ready for AI output — just need to define the prompt and parse the response
- Open question: How strict should the scene schema be? Loose (AI picks what to include) or templated (always sky + ground + sprite)?

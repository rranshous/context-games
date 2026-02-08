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

### Key decision: Named background presets

Initially built a data-driven conditional renderer where scenes carried all their rendering parameters (sky colors, ground colors, palm positions, etc.) and `renderScene` checked which properties existed. This worked but raised a problem: when AI generates scenes later, it would need to produce gradient hex values and precise rendering parameters — fragile and hard to validate.

**Better approach: named backgrounds as a catalog.**

Each background is a self-contained function in a `BACKGROUNDS` collection. All rendering details (sky, ground, palms, atmospheric effects, vignette) are baked in. Scenes just reference a background by name:

```javascript
const BACKGROUNDS = {
    'sunset-beach': function() {
        drawSky({ colors: [...] });
        drawClouds();
        drawSun({ ... });
        drawOcean({ ... });
        drawSand({ ... });
        // palms, warm wash, vignette — all hardcoded
    },
    'twilight-forest': function() {
        drawSky({ colors: [...], height: 0.50 });
        drawStars();
        drawForestGround({ ... });
        // palms, fireflies, cool wash, vignette — all hardcoded
    },
};
```

**Why this is better:**
- AI just picks a name: `background: 'sunset-beach'` — no gradient tuning
- Each background is visually polished by hand, not generated
- Easy to grow the catalog — add new backgrounds without touching the renderer or scene schema
- Later we can add parameterization if needed, but the simple version works now

### Scene data structure (updated)

Scenes are now very lean — just a background name, optional foreground sprites, narration, and choices:

```javascript
{
    background: 'sunset-beach',              // picks from BACKGROUNDS catalog
    mailbox: { x, groundY, spriteScale },    // optional foreground sprite
    narration: "...",
    choices: ["...", "...", "..."]
}
```

The draw utilities (`drawSky`, `drawOcean`, `drawSand`, `drawPalm`, `drawStars`, `drawForestGround`, `drawFireflies`) still exist as helpers — the background functions compose them internally.

### Transition system

Overlay-based approach — clean and foolproof:

1. Click choice → buttons dim + disable
2. Full-screen overlay (matches body bg `#0a0a1a`) fades in over 0.8s
3. "The story unfolds..." text pulses while overlay is opaque
4. Behind the overlay, new scene renders on canvas + narration/choices update
5. Overlay fades out to reveal the new scene

CSS animations for narration/choices are retriggered on subsequent scenes with shorter delays (0.1s and 1.0s vs. the initial 0.5s and 2.5s) — returning players don't need the slow build-up.

### Sprite discipline: keep them self-contained

Sprite draw functions originally snuck smooth canvas ellipses underneath as shadows — mixing background-layer rendering into what should be a pure pixel-art layer. Removed those. Sprites are now strictly `drawSprite()` calls: position the grid, render the pixels, nothing else. This keeps the two-layer contract clean (smooth backgrounds, pixelated foreground) and means sprites stay portable — any sprite works on any background without assumptions about what's underneath.

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
- AI picks a background name from the catalog + generates narration + choices + optional sprite placement
- Open question: Should AI be able to define new sprites inline (character grids), or only place pre-built ones?

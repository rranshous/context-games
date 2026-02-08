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

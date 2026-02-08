# IPI-00: First Bubble

The first story bubbles up from the cauldron.

## Goal

Prove the core loop: **scene displays → choice made → AI generates next scene → new scene displays**

## Related Docs

- [idea.md](idea.md) - concept, vibe, inspiration
- [vanilla-platform.md](../../oneshot-climb/docs/vanilla-platform.md) - inference API reference

## Scope

**The minimal frame:**
- Single HTML file
- Scene display area (text + visual placeholder)
- Choice buttons (2-3 options)
- Click to select (no voice yet)

**The core loop:**
1. Opening scene displays with narration
2. 2-3 choices appear below
3. Player clicks a choice
4. Loading state while AI generates
5. New scene displays
6. New choices appear
7. Repeat

**Opening scene:**
- Wake up on a beach (first-person POV - you see the beach, not yourself)
- Something whimsical/out-of-place (red mailbox in the sand)
- Letter inside welcomes you
- Hints at "The Caretaker" who set this up

**Visual approach (simple for now):**
- First-person perspective (what YOU see)
- Colored rectangles for sky/sand/water
- Simple text-based scene descriptions
- Can upgrade to sprites later

## Non-Goals (for this pass)

- Voice input
- Sprite library / pixel art
- Inventory system
- Story persistence / save-load
- Custom player input ("say your own")
- Sound effects / music
- Multiple story branches rejoining

## Technical Notes

### Vanilla Platform

Game runs on the vanilla platform which proxies AI requests:
- Dev server: `cd platforms/vanilla && npm run dev`
- Access game: `http://localhost:3000/dev/story-cauldron/index.html`
- Inference: `/api/inference/anthropic/messages`
- Model: `claude-haiku-4-5-20251001` (fast, cheap)


## Milestones

### M1: Static Scene Display
- [x] HTML/CSS layout (scene area + choice buttons)
- [x] Hardcoded opening scene displays
- [x] Choices are clickable (no action yet)
- [x] Projector-friendly styling (dark bg, big text)
- [x] Hybrid rendering: smooth backgrounds + pixel-art sprite foreground objects

### M2: Scene Transition
- [x] Click choice → loading state
- [x] Hardcoded second scene appears - scene background is different than the first scene
- [x] Proves the render-transition-render flow

### M3: AI Generation
- [x] Call vanilla platform API (Haiku)
- [x] Send story context + choice
- [x] Parse response JSON (structured output via `output_config`)
- [x] Render generated scene
- [x] Handle errors gracefully

### M4: The Loop
- [ ] Story context accumulates
- [ ] Multiple transitions work
- [ ] Story maintains some coherence
- [ ] Can play through 5+ scenes

## Success Criteria

- [x] Open the game, see opening scene
- [x] Click a choice, see a new AI-generated scene
- [x] Click again, story builds on previous choice
- [ ] Play for 5 minutes without it breaking
- [ ] At least one moment that makes us smile

---

## Session Notes

See [journal.md](journal.md) for detailed build log, decisions, and tradeoffs.

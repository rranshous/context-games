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

### Scene Data Structure

```javascript
const scene = {
  id: "beach_start",
  narration: "You wake up on a warm sandy beach...",
  visual: {
    background: "beach",
    elements: ["mailbox", "palm_tree"]
  },
  choices: [
    { text: "Open the mailbox", leadsTo: "generated" },
    { text: "Look around the beach", leadsTo: "generated" },
    { text: "Walk toward the forest", leadsTo: "generated" }
  ]
};
```

### AI Generation Prompt (rough sketch)

```
You are the Caretaker, guiding a family through a whimsical island adventure.

Story so far:
{accumulated_story}

The player chose: "{choice}"

Generate the next scene. Return JSON:
{
  "narration": "2-3 sentences describing what happens",
  "visual": {
    "background": "beach|forest|cave|etc",
    "elements": ["object1", "object2"]
  },
  "choices": [
    { "text": "Choice 1" },
    { "text": "Choice 2" },
    { "text": "Choice 3" }
  ]
}

Keep it playful and family-friendly. Build on what came before.
Introduce small surprises and callbacks to earlier moments.
```

### Story Context

Accumulate a running summary:
```javascript
const storyContext = [
  "Woke up on beach, found mailbox with welcome letter from The Caretaker",
  "Opened mailbox, found a brass key and note saying 'for the treehouse'",
  "Walked into forest, discovered an ancient treehouse"
];
```

Feed last N entries to prompt (avoid context overflow).

## Milestones

### M1: Static Scene Display
- [ ] HTML/CSS layout (scene area + choice buttons)
- [ ] Hardcoded opening scene displays
- [ ] Choices are clickable (no action yet)
- [ ] Projector-friendly styling (dark bg, big text)

### M2: Scene Transition
- [ ] Click choice → loading state
- [ ] Hardcoded second scene appears
- [ ] Proves the render-transition-render flow

### M3: AI Generation
- [ ] Call vanilla platform API (Haiku)
- [ ] Send story context + choice
- [ ] Parse response JSON
- [ ] Render generated scene
- [ ] Handle errors gracefully

### M4: The Loop
- [ ] Story context accumulates
- [ ] Multiple transitions work
- [ ] Story maintains some coherence
- [ ] Can play through 5+ scenes

## Success Criteria

- [x] Open the game, see opening scene
- [ ] Click a choice, see a new AI-generated scene
- [ ] Click again, story builds on previous choice
- [ ] Play for 5 minutes without it breaking
- [ ] At least one moment that makes us smile

---

## Session Notes

*To be filled in as we build...*

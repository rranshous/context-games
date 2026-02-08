# Story Cauldron

A choose-your-own-adventure game where AI generates the story and visuals as you play.

## Platform

Uses the **vanilla platform** for hosting and inference.

- Platform docs: [platforms/vanilla/docs/idea.md](../../../platforms/vanilla/docs/idea.md)
- Inference API reference: [games/oneshot-climb/docs/vanilla-platform.md](../../oneshot-climb/docs/vanilla-platform.md)

## The Vibe

**Inspiration:** The Secret Island of Dr. Quandary (1992) - that feeling of waking up somewhere mysterious, exploring with a candle, discovering weird and wonderful things. Nostalgic, kid-friendly adventure with a sense of wonder.

**Tone:** Playful, slightly silly, surprising. Not dark or scary. The kind of game a family plays together on a Sunday, shouting out choices and laughing at where the story goes.

**Target:** Family play on a projector. Kids and adults together. Voice input so everyone can participate.

## Core Concept

1. **Scene displays** - narration text + visual composition
2. **Choices appear** - 2-3 preset options + "or say your own..."
3. **Family chooses** - click or voice input
4. **AI generates** - next scene based on choice + story so far
5. **Story builds** - continuity maintained, callbacks to earlier moments

The magic: AI can take the story anywhere. Kids say unexpected things. The story becomes uniquely yours.

## Perspective

**First-person POV** - you see the world through your own eyes (like Dr. Quandary). No player avatar on screen. The visuals show what YOU are looking at.

This is more immersive and simpler - no hero sprite needed, just scene visuals.

## Opening

You wake up on a beach. Palm trees, gentle waves, warm sun. But something's odd - there's a bright red mailbox standing in the sand. Inside it: a letter addressed to YOU (the player's name).

"Welcome to the Island! Your adventure begins now. - The Caretaker"

Who is The Caretaker? Friendly? Mysterious? That unfolds as you play. But we're not going for dark mystery - more like a whimsical game-master who's set up this adventure for your enjoyment.

## Visual Style

**Technique:** ASCII-art sprite rendering (from oneshot-climb)
- AI generates sprite definitions as character grids
- Rendered to canvas at scaled resolution
- See `games/oneshot-climb/index.html` for implementation reference

**Tooling:**
- Sprite editor pattern from oneshot-climb: `games/oneshot-climb/tools/sprite-editor.html`
- Playwright-interactive tool guide: [tools/README.md](../../../tools/README.md)
- May want similar tool for scene composition or palette exploration

**Aesthetic:** TBD - not Paper Pixels
- Story Cauldron should have its own visual identity
- Warmer? More storybook? Watercolor-ish palette?
- Could explore during M1 or defer to later IPI

**Sprite library approach:**
- Pre-built sprites for consistency (objects, backgrounds, characters you meet)
- No player sprite needed (first-person POV)
- AI can reference existing sprites by name
- AI can also generate new sprites on the fly when needed

## Future Ideas (not for first IPI)

- Voice input via Web Speech API
- Character customization at start
- Inventory system (pick up items, use them later)
- Story branches that reconnect
- Save/load story progress

## Why "Story Cauldron"?

The stories bubble up from the cauldron of AI + player choices + accumulated context. Each playthrough is a unique brew.

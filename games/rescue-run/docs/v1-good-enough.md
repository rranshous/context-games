# v1.0 "Good Enough" - Embodiment-First UI

## The Problem

Current gameplay loop is frustrating:
- Hit refresh to stop and change tools
- Lose level selection on refresh
- Tool editor modal covers the screen (blocks seeing game)
- Embodiment controls feel like afterthoughts
- Have to hunt for things

## The Vision

**Lean into "embodiment" as the core activity.**

The UI should present embodiment editing as the PRIMARY interaction, with the simulation/gameplay as the RESULT you watch.

## Layout: Game Left, Embodiment Right

```
+------------------+----------------------------------------+
| GAME COLUMN      | EMBODIMENT / CONTROLS COLUMNS          |
| (fixed width)    | (fills remaining space)                |
+------------------+----------------------------------------+
|                  |                                        |
| [Game Canvas]    | [System Prompt - editable textarea]    |
|                  |                                        |
| [Legend]         | [Tools Panel]                          |
|   🟩 Grass       |   scan() [edit] [on/off]               |
|   ⬜ Road        |   move() [edit] [on/off]               |
|   🧍 Person      |   pickup() [edit] [on/off]             |
|   🏠 Safe Zone   |   dropoff() [edit] [on/off]            |
|                  |   [+ Add Tool]                         |
| [Level Select]   |                                        |
|   L1 L2 L3...    | [AI Log / Run Controls]                |
|                  |   [▶️ Run] [⏹️ Stop] [🔄 Reset]         |
| [Game Status]    |   [turn log scrolls here]              |
|   Ready (50 turns)|                                       |
|                  | [Review Panel - when run completes]    |
+------------------+----------------------------------------+
```

**Key principles:**
- Game column is fixed width - always fits the largest board
- Everything else fills the remaining space in columns to the right
- No modals - tool editing is inline/expandable
- All embodiment controls always visible

## Minimum Scope for v1.0

### Must Have
- [x] New layout: game left, embodiment right *(DONE - 4-column layout)*
- [x] No modal for tool editing (inline expand or side panel) *(DONE - inline accordion)*
- [x] Tool toggle on/off *(DONE)*
- [x] Add new tools button *(DONE)*
- [x] Editable system prompt (NO default - start empty) *(PARTIAL - editable but has default)*
- [x] Persist level selection on refresh *(DONE)*
- [x] Clean stop/reset without refresh needed *(DONE)*
- [x] Persist tool edits in localStorage *(DONE)*
- [x] Interactive tool call history (hover/click to see full JSON input/output) *(DONE - expandable)*
- [x] Personal best tracking per level *(DONE)*

### Nice to Have (if easy)
- [ ] Better visual feedback during run

### NOT in v1.0
- Context visualization
- AI assistant for tool writing  
- Optimal path / par calculation
- Token metrics
- Mobile support
- Pretty styling (functional > beautiful)
- ~~Level 0: pure basics~~ (SCRAPPED - existing levels sufficient for testing)
- ~~URL routing / deep linking~~ (SCRAPPED - not needed for v1)

### Scrapped Features (v0.8 IPI cancelled)
The v0.8 IPI proposed Level 0 (tutorial) and URL routing. Decision: **scrapped**.
- Level 0 adds complexity without clear value - existing levels work fine
- URL routing is nice-to-have but not essential for core experience

## Success Criteria

"I can sit down, tweak embodiment, run, observe, tweak again—without frustration or page refreshes. The loop feels smooth."

**Status: ESSENTIALLY COMPLETE** - All major features implemented. Only minor tweak remaining (empty default prompt) if desired.

## Technical Notes

- Game canvas size varies by level (L1 is 8x8, L7 is 20x18)
- Left column width should accommodate largest level
- Could use CSS grid or flexbox
- Tool editing: accordion expand? Or always-visible code blocks?

## Open Questions

1. Tool editing UI - accordion expand in place, or fixed panel with selected tool?
2. How much vertical scroll is acceptable?
3. System prompt - how big should the textarea be?

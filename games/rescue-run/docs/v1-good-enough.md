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

```
+--------------------------------------------------+
|  EMBODIMENT                    |   SIMULATION    |
|  (what you craft)              |   (what happens)|
+--------------------------------------------------+
|  [System Prompt]               |                 |
|  [Tools Panel]                 |   [Game Canvas] |
|  - scan() [edit] [toggle]      |                 |
|  - move() [edit] [toggle]      |   [AI Log]      |
|  - pickup() [edit] [toggle]    |                 |
|  - [+ Add Tool]                |   [Status]      |
|  [Context Viz?]                |                 |
+--------------------------------------------------+
```

Everything on the table:
- **System prompt** - editable, always visible
- **Tools** - add/edit/toggle, inline or side panel (NOT modal)
- **Context visualization** - see what the AI sees
- **Simulation** - game canvas + AI log + controls

## Key Changes

### 1. No More Modal for Tool Editing
- Inline expansion or side-by-side
- See game while editing
- Edit doesn't interrupt flow

### 2. Persist State Across Refresh
- Save level selection
- Save tool edits
- Maybe: auto-save on change

### 3. Tool Toggle
- Quick on/off without deleting
- Experiment easily

### 4. Add New Tools
- Not just edit existing
- Player-defined tools

### 5. Editable System Prompt
- Full control over AI's base instructions
- Part of the embodiment

### 6. Better Run/Stop/Reset Flow
- Stop shouldn't require refresh
- Clear state management
- Easy restart with current embodiment

## NOT in v1.0 (Future)

- AI assistant for collaborative play (AI helps edit tools)
- Optimal path calculation / par
- Personal best tracking
- Token burn metrics
- Interactive tool call history
- Context window visualization

## Success Criteria

"I can sit down, tweak embodiment, run, observe, tweak again—without frustration or page refreshes. The loop feels smooth."

## UI Layout Options

### Option A: Left/Right Split
```
[Embodiment Panel 40%] | [Game + Log 60%]
```

### Option B: Top/Bottom
```
[Game Canvas + Controls]
--------------------------
[Embodiment: Prompt | Tools | Context]
```

### Option C: Tabs + Persistent Game
```
[Game always visible in corner]
[Main area: tab between Prompt / Tools / Log / Review]
```

## Notes

- Mobile can wait
- Polish can wait
- Core loop must be smooth

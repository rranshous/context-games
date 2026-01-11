# IPI: v0.2 Tool Editor

## Goal

Add the core gameplay mechanic: **players design the tools** the AI uses. Introduce a standard library layer that separates game internals from player-designed tools.

---

## Introduce

**What we're building:** A tool editor UI where players write/modify the tools available to the AI. The AI gets a minimal prompt and must rely on the tools the player provides.

**Architecture:**

```
┌─────────────────────────────────────────────┐
│  AI (Claude Haiku)                          │
│  - Minimal system prompt                    │
│  - Only knows: "rescue the person"          │
│  - Uses player-defined tools                │
└─────────────────┬───────────────────────────┘
                  │ calls tools
                  ▼
┌─────────────────────────────────────────────┐
│  Player-Designed Tools                      │
│  - scan(), move(), pickup(), dropoff()      │
│  - Player writes name, description, impl    │
│  - Implementation uses stdlib functions     │
└─────────────────┬───────────────────────────┘
                  │ uses
                  ▼
┌─────────────────────────────────────────────┐
│  Standard Library (stdlib)                  │
│  - getCarPosition() → {x, y}                │
│  - getCarDirection() → string               │
│  - moveCarOneStep(dir) → {success, error}   │
│  - getTileAt(x, y) → {type, passable}       │
│  - getPersonPosition() → {x, y} | null      │
│  - isPersonInCar() → boolean                │
│  - pickupPerson() → {success, error}        │
│  - dropoffPerson() → {success, error}       │
│  - getSafeZonePosition() → {x, y}           │
│  - getGridSize() → {width, height}          │
└─────────────────────────────────────────────┘
```

**Key insight:** The stdlib is the "physics engine" - fixed, reliable primitives. Tools are the "interface layer" - how the AI perceives and acts. Poor tool design = confused/stuck AI.

**System prompt change:** Remove all the helpful context. Just:
> "You are controlling a rescue vehicle. Your goal is to rescue the person and bring them to the safe zone. Use your available tools."

---

## Plan

### Milestone 1: Extract Standard Library ✅
- [x] Create `stdlib` object with all low-level functions
- [x] Refactor existing tool functions to use stdlib
- [x] Ensure stdlib functions are pure/predictable
- [x] Document stdlib API (for players to reference)
- [x] **Verify via Playwright:** stdlib functions work correctly

### Milestone 2: Tool Definition Format ✅
- [x] Define tool data structure:
  ```js
  {
    name: "scan",
    description: "...", // AI sees this
    parameters: [...],  // JSON schema
    implementation: "..." // JS code using stdlib
  }
  ```
- [x] Tool implementation runs in sandboxed context with stdlib access
- [x] Convert existing hardcoded tools to this format
- [x] Validate tool implementations don't break
- [x] **Verify via Playwright:** AI completes rescue with new tool format

### Milestone 3: Simplified UI + Tool Editor ✅
- [x] Remove manual controls (move buttons, scan button, etc.)
- [x] Remove game log panel (AI log is sufficient)
- [x] Add "Edit Tools" button/panel
- [x] List current tools with edit buttons
- [x] Edit form: name, description, parameters, implementation (JS)
- [x] Save/load tool definitions (localStorage)
- [x] "Reset to defaults" button
- [x] **Verify via Playwright:** Can edit a tool and run AI with modified tool

### Milestone 4: Minimal System Prompt ✅
- [x] Strip system prompt to bare minimum
- [x] Remove map info, coordinates, strategy hints
- [x] AI must discover through tools
- [x] **Verify via Playwright:** AI can still complete with good default tools (35 turns)
- [x] **Verify via Playwright:** AI struggles with intentionally bad tools (failed at 50 turns)

### Milestone 5: Review Mode
- [ ] After AI run, show "Review" panel
- [ ] Display tool call history with results
- [ ] Show which tools were never used
- [ ] **Verify via Playwright:** Review panel shows meaningful feedback

### Milestone 6: Polish (Optional)
- [ ] Syntax highlighting for JS implementation editor
- [ ] Better error messages for invalid tool implementations
- [ ] Highlight where AI got stuck/confused (repeated failures, loops)
- [ ] Add "hints" system for struggling players

---

## Implement

*Progress tracked below as we work through milestones.*

### Status: Milestone 4 Complete

---

## Notes

### Stdlib Functions (Draft)

**Position/State:**
- `stdlib.getCarPosition()` → `{x: number, y: number}`
- `stdlib.getCarDirection()` → `"north" | "south" | "east" | "west"`
- `stdlib.getPersonPosition()` → `{x: number, y: number} | null` (null if rescued)
- `stdlib.getSafeZonePosition()` → `{x: number, y: number}`
- `stdlib.isPersonInCar()` → `boolean`
- `stdlib.isPersonRescued()` → `boolean`

**Map:**
- `stdlib.getTileAt(x, y)` → `{type: string, passable: boolean}`
- `stdlib.getGridSize()` → `{width: number, height: number}`
- `stdlib.isValidPosition(x, y)` → `boolean`

**Actions:**
- `stdlib.moveCarOneStep(direction)` → `{success: boolean, error?: string}`
- `stdlib.pickupPerson()` → `{success: boolean, error?: string}`
- `stdlib.dropoffPerson()` → `{success: boolean, error?: string}`

### Example Tool Implementations

**Good scan tool:**
```js
// Returns comprehensive surroundings info
const pos = stdlib.getCarPosition();
const dirs = ['north', 'south', 'east', 'west'];
const offsets = {north: [0,-1], south: [0,1], east: [1,0], west: [-1,0]};
const surroundings = {};
for (const dir of dirs) {
  const [dx, dy] = offsets[dir];
  const tile = stdlib.getTileAt(pos.x + dx, pos.y + dy);
  surroundings[dir] = tile;
}
return {
  position: pos,
  direction: stdlib.getCarDirection(),
  personInCar: stdlib.isPersonInCar(),
  surroundings
};
```

**Bad scan tool (too vague):**
```js
// Just returns position - AI won't know what's around it
return stdlib.getCarPosition();
```

### Teaching Moments to Enable

1. **Missing info:** Tool doesn't return enough data → AI makes blind moves
2. **Wrong abstraction:** Low-level tools force AI to do too much work
3. **Missing tool:** No way to check something → AI assumes/guesses
4. **Confusing description:** AI misunderstands tool purpose
5. **Over-helpful:** Doing too much in one tool hides learning

### UI Sketch

```
┌─────────────────────────────────────────────────────────┐
│ 🚗 Rescue Run                                           │
├─────────────────────┬───────────────────────────────────┤
│                     │ Status: Ready                     │
│                     │ [▶️ Run AI]  [🔄 Reset]            │
│    [Game Canvas]    ├───────────────────────────────────┤
│                     │ 🔧 Tools           [Edit Tools]   │
│                     │ • scan()                          │
│                     │ • move(direction)                 │
│                     │ • pickup()                        │
│                     │ • dropoff()                       │
│                     ├───────────────────────────────────┤
│                     │ 🤖 AI Log                         │
│                     │ [Turn 1] scan() → ...             │
│                     │ [Turn 2] move("east") → OK        │
└─────────────────────┴───────────────────────────────────┘
```

After run completes → Review panel:
```
┌─────────────────────────────────────────────────────────┐
│ 📊 Review                                    [Close]    │
├─────────────────────────────────────────────────────────┤
│ Result: ✅ SUCCESS (23 turns)                           │
│                                                         │
│ Tool Usage:                                             │
│ • scan() - called 5 times                               │
│ • move() - called 16 times (2 failures)                 │
│ • pickup() - called 1 time                              │
│ • dropoff() - called 1 time                             │
│                                                         │
│ ⚠️ Observations:                                        │
│ • AI hit obstacles twice before scanning                │
│ • Consider: add obstacle info to scan result?           │
│                                                         │
│              [Edit Tools]  [Run Again]                  │
└─────────────────────────────────────────────────────────┘
```

Tool Editor Modal:
```
┌─────────────────────────────────────────────────────────┐
│ Edit Tool: scan                                    [X]  │
├─────────────────────────────────────────────────────────┤
│ Name: [scan                    ]                        │
│                                                         │
│ Description (AI sees this):                             │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Look around and return information about your       │ │
│ │ current position and surroundings.                  │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Parameters: (none for this tool)                        │
│                                                         │
│ Implementation (JavaScript using stdlib.*):             │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ const pos = stdlib.getCarPosition();                │ │
│ │ const dir = stdlib.getCarDirection();               │ │
│ │ // ... more code ...                                │ │
│ │ return { position: pos, direction: dir };           │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Stdlib Reference: [Show/Hide]                           │
│                                                         │
│              [Cancel]  [Save Tool]                      │
└─────────────────────────────────────────────────────────┘
```

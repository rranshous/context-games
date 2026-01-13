# IPI: v0.7 UI Layout & Personal Best

## Goal

Implement the new two-column layout (game left, embodiment right) and add personal best tracking.

---

## Introduce

**What we're building:** The "embodiment-first" layout where game is a fixed-width left column and all controls/editing fill the right side.

**Target Layout:**
```
+------------------+----------------------------------------+
| GAME COLUMN      | EMBODIMENT / CONTROLS                  |
| (fixed width)    | (fills remaining space)                |
+------------------+----------------------------------------+
| [Game Canvas]    | [System Prompt]                        |
| [Legend]         | [Tools Panel]                          |
| [Level Select]   | [AI Log / Run Controls]                |
| [Game Status]    | [Review Panel]                         |
+------------------+----------------------------------------+
```

**Key principles:**
- Game column fixed width (accommodate largest level: 18x16)
- No modals - everything inline/visible
- All embodiment controls always visible

---

## Plan

### Milestone 1: Two-Column Layout
- [ ] CSS grid or flexbox for main layout
- [ ] Game column: fixed width for largest level
- [ ] Right column: fills remaining space
- [ ] Responsive within right column
- [ ] **Verify with Playwright:** Load game, check layout structure, resize window

### Milestone 2: Game Column Components
- [ ] Game canvas at top
- [ ] Legend below canvas
- [ ] Level selector (L1-L7 buttons)
- [ ] Game status (turn count, state)
- [ ] **Verify with Playwright:** Check all game column elements present and positioned

### Milestone 3: Embodiment Column Components
- [ ] System prompt textarea (from 0.5)
- [ ] Tools panel with expand/toggle (from 0.5)
- [ ] Run controls: Run, Stop, Reset buttons
- [ ] AI log / call history (from 0.6)
- [ ] **Verify with Playwright:** Check all embodiment elements present

### Milestone 4: Clean Stop/Reset
- [ ] Stop button halts current run mid-game
- [ ] Reset button restores level to initial state
- [ ] No page refresh needed
- [ ] **Verify with Playwright:** Start run, click Stop, verify halted. Click Reset, verify initial state.

### Milestone 5: Level Selection Persistence
- [ ] Persist selected level to localStorage
- [ ] Load last level on page refresh
- [ ] **Verify with Playwright:** Select L5, refresh, verify L5 still selected

### Milestone 6: Personal Best Tracking
- [ ] Track best turn count per level
- [ ] Store in localStorage
- [ ] Display on level selector or status area
- [ ] Update when run completes with better score
- [ ] **Verify with Playwright:** Complete level, check best recorded. Complete again with fewer turns, verify updated.

---

## Implement

_To be filled in as work progresses_

---

## Testing Notes

**Dev Server:** Use `http://localhost:3000/dev/rescue-run/index.html` for testing - refresh to pick up changes without re-uploading.

**Use Playwright to verify each milestone:**
- Check layout and component positioning
- Test interactions (level select, stop, reset)
- Verify localStorage persistence
- Test personal best tracking with multiple runs

---

## Notes

_Space for implementation discoveries_

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

**IMPORTANT - Claude must verify with Playwright:**
Each milestone has a "Verify with Playwright" step. Claude MUST actually run Playwright to verify the feature works before marking the milestone complete. Do not skip verification - run the tests, check the results, then mark complete.

**Use Playwright to verify each milestone:**
- Check layout and component positioning
- Test interactions (level select, stop, reset)
- Verify localStorage persistence
- Test personal best tracking with multiple runs

---

## Notes

_Space for implementation discoveries_

---

## UI Space Optimization (In Progress)

### Current State (Jan 2026)
- Using 3-column layout: Game | Tools | AI Control
- After running AI, Review Panel + Tool Call History appear in right column
- Problem: AI log takes too much vertical space, pushing Review panel down/off screen

### Completed Changes
1. ✅ Reduced gaps and padding throughout (6px → 4px, 8px → 6px)
2. ✅ Shrunk font sizes for log entries (0.7rem → 0.65rem)
3. ✅ Added `max-height: 150px` and `flex-shrink: 0` to `#ai-log` - caps the AI log height
4. ✅ Made columns use `min-height: 0` for proper flex shrinking

### Goals
Users need to debug runs and edit tools. Key visibility needs:
- See tool call history (inputs/outputs for each turn)
- See tool definitions and edit them
- See the game state
- All without collapsing/expanding sections

### Approach (No Collapsibles)
1. **Fixed heights for scrollable regions** - AI log capped at 150px, Review panel gets remaining space
2. **Compact rendering** - Smaller fonts, tighter spacing
3. **Review panel scrolls as a whole** - Contains story, stats, and call history
4. **Tool Call History stays visible** - Shows all calls with expandable details per item

### Next Steps
1. Make Review panel itself scrollable (overflow-y: auto) 
2. Shrink Tool Call History items - use single-line compact format
3. Test with Playwright after changes
4. Consider: split AI column into two rows (log top, review bottom) with explicit heights

### CSS Structure Reference
```
.ai-column
  └── .game-panel (flex: 1, overflow: hidden)
       └── .ai-panel (flex: 1, overflow: hidden)
            ├── #ai-status
            ├── .ai-controls (Run/Stop buttons)
            ├── #ai-log (max-height: 150px, overflow-y: auto)
            └── #review-panel (needs overflow-y: auto, flex: 1)
                 ├── review-result
                 ├── review-hints
                 ├── review-stats (story + tool counts)
                 ├── review-actions (Edit/Run/Next buttons)
                 └── call-history-section
                      └── call-history-list (max-height: 200px)
```

### Dev URL
`http://localhost:3000/dev/rescue-run/index.html`

### Progress Update (Session 1)

**Changes made:**
1. ✅ AI log capped at 150px max-height
2. ✅ Review panel now has `flex: 1` and `overflow-y: auto` - scrolls to show all content
3. ✅ Overall more compact spacing

**Current result:** Layout works well - AI log stays small, Review panel fills remaining space and scrolls. Tool Call History visible and scrollable within Review panel.

**Still to consider for future sessions:**
- Tool Call History items could be more compact (currently shows full JSON for each)
- Could use smaller font for JSON output display
- Consider making Tool Call History items start collapsed and expand on click

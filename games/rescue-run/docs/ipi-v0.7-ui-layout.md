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

---

## UI Refinement Analysis (Session 2)

### Current Problems (from screenshot review)

1. **AI Log dominates during AND after runs** - The AI log (max-height: 150px) shows every turn's thinking/tool calls. After the run completes, this log becomes less relevant but still takes prime real estate.

2. **Tool Call History is too verbose** - Each call shows full INPUT/OUTPUT JSON in scrollable boxes. For 27 turns, this creates massive vertical scrolling. Users can't quickly scan what happened.

3. **Story line is overwhelming** - The call sequence string (scan → move(south) → move(east) → ...) for 27 calls is one long horizontal scroll or wrapped mess.

4. **Review panel fights for space** - After a run, the Review panel appears but has to compete with the AI log above it.

5. **No clear "mode" distinction** - During a run vs. after a run are different user needs, but the UI doesn't adapt.

### User Needs by Mode

**During Run:**
- See AI thinking in real-time (what tool is being called, results)
- See game canvas updating
- Be able to stop

**After Run:**
- See outcome (success/fail, turns taken, best score)
- Understand what went wrong (if failed) or what could be optimized
- Quickly review tool calls without digging through verbose JSON
- Edit tools based on learnings
- Run again / proceed to next level

### Proposed UI Changes

#### Option A: Mode-Based Layout (Recommended)

The AI column switches modes based on run state:

**During Run Mode:**
```
+------------------+
| AI Control       |
| [Ready/Running]  |
| [Run] [Stop]     |
+------------------+
| Live Log         |
| (full height)    |
| scrolling...     |
+------------------+
```

**After Run Mode (Review):**
```
+------------------+
| Result Banner    |
| ✅ SUCCESS! 27t  |
| (best: 19)       |
+------------------+
| Quick Stats      |
| scan: 8  move:15 |
| pickup:1 drop:1  |
+------------------+
| Call Timeline    |
| T1 scan      [+] |
| T2 move(S)   [+] |
| T3 move(E)   [+] |
| ... compact list |
+------------------+
| [Edit] [Run] [→] |
+------------------+
```

Key changes:
- **AI log disappears** after run completes (it's in the history anyway)
- **Call Timeline** replaces verbose history - one line per call, expand for details
- **Quick Stats** shows tool usage at a glance
- **Result Banner** is prominent with best score

#### Option B: Tabbed Interface

Keep everything but use tabs:
- Tab 1: "Live" - AI log during run
- Tab 2: "Review" - Results + compact history after run
- Auto-switch tabs based on state

#### Option C: Collapsible Sections with Smart Defaults

Keep current layout but:
- AI Log auto-collapses to 2-3 lines after run ends
- Call History items start collapsed, show only: `T1 scan() → OK`
- Expand on click to see full JSON

### Recommendation: Option A

Mode-based layout is cleanest because:
1. Reduces cognitive load - shows what's relevant NOW
2. Maximizes space for the relevant content
3. No tabs to click or sections to manage
4. Clear visual distinction between states

### Implementation Goals for This Session

1. [ ] Create "Review Mode" layout that replaces AI log after run completes
2. [ ] Compact Call Timeline - one row per call: `T# | tool(args) | result indicator`
3. [ ] Expandable call details on click
4. [ ] Quick Stats bar showing tool usage counts
5. [ ] "Show Log" button if user wants to see full AI log after run
6. [ ] Ensure smooth transition between modes

### Questions for Robby

1. Does the mode-based approach make sense, or do you prefer always-visible sections?
   - **Decision:** Mode-based approach ✅ - also prevents tool editing during runs

2. For the compact timeline, what's the right level of detail per row?
   - **Decision:** TBD - will prototype and iterate

3. Should the full AI log be accessible after the run (hidden toggle) or is the call timeline sufficient?
   - **Decision:** Hide it for now, see if users miss it

---

## Implementation Plan

### Phase 1: Mode Infrastructure ✅
- [x] Add run state tracking: `idle` | `running` | `reviewing`
- [x] Tools column: disable editing during `running` state
- [x] AI column: switch content based on state

### Phase 2: Running Mode UI ✅
- [x] AI log gets full column height during run
- [x] Clean, focused view: status + log + stop button
- [x] No review panel visible

### Phase 3: Review Mode UI ✅
- [x] Result banner (success/fail, turns, best score)
- [x] Quick stats bar (tool usage counts)
- [x] Compact call timeline (one row per call)
- [x] Expandable details on click
- [x] Action buttons: Edit Tools, Run Again, Next Level

### Phase 4: Compact Timeline Design ✅
- [x] Each row: turn number, tool name - enough context to know what to expand
- [x] Click to expand: show full input/output JSON
- [x] Visual indicators: success (green), failure (red)
- [x] Scrollable list

---

## Implementation Log

### Session 2 - Phase 1: Mode Infrastructure ✅

**Completed:**
- Added `uiMode` state: 'idle' | 'running' | 'reviewing'
- Created `setUiMode(mode)` function that:
  - Sets `data-ui-mode` attribute on body
  - Adds/removes `.disabled` class on tools column
  - Disables all inputs in tools column during 'running' mode
  - Controls AI log vs review panel visibility
- Added CSS for `.tools-column.disabled` (opacity + pointer-events)
- Integrated into `runAI()`, `resetGame()`, and review panel buttons
- Verified with browser: mode switching works correctly

### Session 2 - Phase 2: Review Mode UI ✅

**Completed:**
- AI log is hidden when in review mode (Review panel takes full height)
- AI log visible in idle mode (shows last run's history for reference)
- Verified mode transitions work: running → reviewing → idle

### Session 2 - Phase 3: Compact Call Timeline ✅

**Completed:**
- Tool Call History items now collapsed by default
- Each row shows just: `T# | tool(direction)` with ▶ expand indicator
- Click to expand reveals full Input/Output JSON
- Removed max-height constraint, list fills available space
- Tighter 2px gap between items

**Screenshot results:**
- All 18 calls visible at once in compact view
- Expanding a call shows full JSON with Copy buttons
- Much cleaner than the previous verbose layout

### Session 2 - Summary

**Before:**
- AI log always visible, taking 150px
- Tool Call History items showed full JSON by default
- Reviewing was cramped, lots of scrolling

**After:**
- Mode-based UI: idle | running | reviewing
- Tools disabled during runs (can't edit mid-run)
- AI log hidden in review mode
- Compact timeline: click to expand individual calls
- Much better use of space

### Next Steps
- [ ] Consider clearing AI log when switching to idle (currently shows last run)
- [ ] Add visual distinction for failed calls in timeline
- [ ] Test on harder levels to see how UI scales

---

## Session 2 - Issue: Column Width Imbalance

**Problem identified from screenshot:**
- AI column (right) is HUGE - dominates the screen
- Tools column (middle) is cramped:
  - Code editor shows only ~5 lines of tool implementation
  - System prompt textarea is tiny
- Users need to EDIT code in the tools column - it needs more space!

**Old grid:** `grid-template-columns: auto minmax(260px, 360px) 1fr`
- Game column: auto (fits canvas)
- Tools column: 260-360px (too small!)
- AI column: 1fr (takes ALL remaining space)

**Fix applied:**
- New grid: `auto 1fr minmax(300px, 450px)`
- Tools column now gets `1fr` (flexible, fills space)
- AI column constrained to 300-450px
- Code editor height increased: 120px → 200px
- System prompt rows increased: 4 → 6

**Result:**
- Code editor now shows ~14 lines (was ~5)
- System prompt shows full text
- Description field is readable
- AI/Review panel is compact but functional

---

## Session 2 - Idea: Four-Column Layout?

**Observation:** Middle column (Tools) is still very wide. Could benefit from splitting.

**Current 3-column:**
```
| Game | System Prompt + Tools | AI Control/Review |
| auto |         1fr           |    300-450px      |
```

**Proposed 4-column:**
```
| Game | System Prompt | Tools      | AI Control/Review |
| auto |   250-350px   |    1fr     |     300-450px     |
```

**Benefits:**
- System Prompt gets its own dedicated column (fixed width, always visible)
- Tools column still gets flexible space for code editing
- Better vertical space usage - System Prompt isn't competing with Tools
- Each panel has clearer purpose

**Alternative 4-column:**
```
| Game | Tools (editing) | Tool Call History | Review/Stats |
| auto |      1fr        |     300px        |    250px     |
```
- Separates "editing" from "debugging/analysis"
- Tool Call History gets dedicated space
- Review stats always visible

**Considerations:**
- At what screen width does 4 columns become too cramped?
- Mobile/tablet responsiveness?
- Which elements are "always visible" vs "contextual"?

**Decision:** Implementing Option A with game controls consolidated

**Final 4-column layout:**
```
| Game + Controls | System Prompt | Tools      | Review        |
| auto            |   250-350px   |    1fr     |   300-450px   |
```

**Changes:**
1. Run/Stop buttons move to Game column (with Reset Level)
2. System Prompt gets own column
3. Tools column for code editing (flexible width)
4. AI/Review column for run results

**Workflow:** edit → run → review → edit → run
- Edit in Tools column
- Run button in Game column (always visible)
- Review results in rightmost column
- Back to editing

**Min width:** Not a concern for now (large screen user)

---

## Session 2 - Implementing 4-Column Layout

_Work completed in previous session - 4-column layout is live_

---

## Session 3 - Button Placement Fix

### Issue Identified
The "Edit Tools", "Run Again", and "Next Level" buttons are currently in the **rightmost AI/Review column** (inside `#review-panel`). These are action buttons that should be in the **Game column** alongside the other game controls (Run AI, Stop, Reset Level).

**Current placement:**
```
| Game (controls) | Prompt | Tools | Review (has action buttons) |
```

**Desired placement:**
```
| Game (ALL action buttons) | Prompt | Tools | Review (results only) |
```

### Why This Matters
- "Run Again" is a game control - belongs with "Run AI"
- "Next Level" is a game control - belongs with level selector
- "Edit Tools" focuses the tools column - could stay in review OR move to game
- Having controls in one place reduces eye/mouse travel

### Plan
1. [x] Move "Edit Tools", "Run Again", "Next Level" buttons from `#review-panel` to Game column
2. [x] Create a new `#post-run-actions` div inside Controls panel
3. [x] Update `updateAiColumnForMode()` to show/hide post-run actions
4. [x] Test with Playwright to verify functionality

### Implementation ✅

**Changes made:**

1. **HTML** - Added `#post-run-actions` div inside the Controls panel (game-column):
   - Contains Edit Tools, Run Again, Next Level buttons
   - Hidden by default (`display: none`)
   - Separated from main controls with a border-top

2. **HTML** - Removed `<div class="review-actions">` from `#review-panel`:
   - Review panel now only shows results + stats + call history

3. **JS** - Updated `updateAiColumnForMode()`:
   - `running` mode: hide post-run-actions
   - `reviewing` mode: show post-run-actions
   - `idle` mode: hide post-run-actions

**Verified with Playwright:**
- ✅ Page loads with buttons hidden
- ✅ During AI run, buttons stay hidden
- ✅ After run completes, buttons appear in game column under Controls
- ✅ "Edit Tools" button works (switches to idle mode, expands tool editor)
- ✅ "Next Level" button visible on success

### Result
Controls are now consolidated in the Game column - better UX with all actions in one place.

---

## Session 3 - AI Log Height Fix

### Issue
The AI log (running log of AI thoughts/actions) in the Review column was capped at `max-height: 150px` even though it has an entire vertical column to itself. This wasted screen space.

### Fix
Removed the height constraints from `#ai-log` CSS:
- Removed `max-height: 150px`
- Removed `flex-shrink: 0`
- Added `min-height: 0` (allows proper flex behavior)

The inline style already had `flex: 1` which now correctly fills the column.

### Verified
Screenshot confirms the AI log now fills the entire column height.

---

## Session 3 - Multiple Tool Editors Open

### Issue
In the Tools panel, clicking a tool to expand it for editing would collapse any other expanded tools. Users may want to edit or reference multiple tools simultaneously.

### Fix
Modified `toggleToolExpand(index)` function:
- Removed the "collapse all" logic that closed other tools
- Each tool now toggles independently (click to open, click again to close)

### Verified
Screenshot confirms both `scan()` and `move()` can be expanded at the same time.
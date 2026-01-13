# IPI: v0.6 Interactive Call History

## Goal

Add interactive tool call history to aid in tool creation and debugging, plus minor enhancements.

---

## Introduce

**What we're building:** A log of AI tool calls that's interactive - hover/click to see full JSON input/output for each call.

**Why:** When creating/debugging tools, you need to see:
- What the AI asked for
- What the tool returned
- The full context, not just truncated summaries

**Current state:** Turn log exists but doesn't show full tool call details.

---

## Plan

### Milestone 1: Capture Tool Calls
- [x] Intercept/log each tool call with full input args and output
- [x] Store in memory for current run
- [x] Include timestamp and turn number
- [x] **Verify with Playwright:** Run game, check call history populated

### Milestone 2: Display Call History
- [x] Show tool calls in AI Log panel (or dedicated section)
- [x] Each call shows: tool name, turn, summary
- [x] Collapsed by default
- [x] **Verify with Playwright:** Run game, see tool calls listed

### Milestone 3: Interactive Detail View
- [x] Click/hover on call to expand full JSON
- [x] Input args (what AI passed)
- [x] Output (what tool returned)
- [x] Pretty-printed JSON
- [x] **Verify with Playwright:** Click tool call, verify JSON displayed correctly

### Milestone 4: Copy to Clipboard
- [x] Add copy button for input/output JSON
- [x] Easy to grab for debugging
- [x] **Verify with Playwright:** Click copy, verify clipboard contents

---

## Implement

### Changes Made:

1. **Enhanced aiState** (`index.html` ~line 1634):
   - Added `toolCallHistory` array to store full call details
   - Added `currentTurn` to track turn number during execution

2. **Enhanced trackToolCall()** (`index.html` ~line 1651):
   - Now stores complete input/output JSON with turn and timestamp
   - Uses JSON.parse(JSON.stringify()) to deep clone and avoid reference issues

3. **New CSS Styles** (`index.html` ~line 670):
   - `.call-history-section` - Container for the call history feature
   - `.call-history-header` - Clickable header to show/hide
   - `.call-history-list` - Scrollable list container
   - `.call-history-item` - Individual call entry with success/failure border
   - `.call-history-detail` - Expandable JSON detail view
   - `.call-history-copy-btn` - Copy button styling

4. **New HTML** (`index.html` ~line 897):
   - Added call history section inside review panel
   - Collapsible header with toggle
   - List container for call entries

5. **New JavaScript Functions** (`index.html` ~line 2320):
   - `toggleCallHistory()` - Show/hide the call history list
   - `renderCallHistory()` - Build HTML for all tool calls
   - `toggleCallHistoryItem()` - Expand/collapse individual calls
   - `summarizeJson()` - Create compact summary for preview
   - `formatJson()` - Pretty-print JSON with escaping
   - `copyCallJson()` - Copy input/output to clipboard

6. **Updated version** to v0.6

---

## Testing Notes

**Dev Server:** Use `http://localhost:3000/dev/rescue-run/index.html` for testing - refresh to pick up changes without re-uploading.

**IMPORTANT - Claude must verify with Playwright:**
Each milestone has a "Verify with Playwright" step. Claude MUST actually run Playwright to verify the feature works before marking the milestone complete. Do not skip verification - run the tests, check the results, then mark complete.

**Manual Testing Steps:**
1. Run a game with AI
2. After completion, review panel appears
3. Click "🔍 Tool Call History" header to expand
4. See list of all tool calls with turn numbers
5. Click any call to expand and see full JSON
6. Click copy buttons to copy input/output to clipboard

---

## Notes

- Call history is cleared when running a new game (via `resetToolStats()`)
- History persists during review until next run
- JSON is deep-cloned to avoid reference issues
- Scrollable list for long runs (max-height: 300px)

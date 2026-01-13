# IPI: v0.6 Interactive Call History

## Goal

Add tool call history to aid in tool creation and debugging, plus prompt transparency.

---

## Introduce

**What we're building:** A log of AI tool calls with full JSON input/output visible for debugging.

**Why:** When creating/debugging tools, you need to see:
- What the AI asked for (input args)
- What the tool returned (output)
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
- [x] Show tool calls in Review panel
- [x] Each call shows: tool name, turn, input summary
- [x] **Always visible** - no collapse/expand
- [x] **Verify with Playwright:** Run game, see tool calls listed

### Milestone 3: Full Detail View  
- [x] Show full JSON for each call (input and output)
- [x] Pretty-printed JSON
- [x] **Always visible** - no collapse/expand on individual items
- [x] **Verify with Playwright:** Verify JSON displayed for all calls

### Milestone 4: Copy to Clipboard
- [x] Add copy button for input/output JSON
- [x] Easy to grab for debugging
- [x] **Verify with Playwright:** Click copy, verify clipboard contents

### Milestone 5: Prompt Transparency
- [x] User's system prompt is the ONLY prompt sent to AI
- [x] No hidden default system prompt
- [x] Default prompt value shown in textarea (editable)
- [x] First user message is just "BEGIN" (minimal)
- [x] Label says "This is the only prompt sent to the AI"
- [x] **Verify with Playwright:** Check prompt textarea has default, AI still works

### Milestone 6: UX Fixes
- [x] Review panel close button (×) isolated from header text
- [x] Clicking "📊 Review" header doesn't accidentally close panel
- [x] **Verify with Playwright:** Click header, panel stays open

---

## Implementation Notes

### Changes Made:

1. **Enhanced aiState** - Added toolCallHistory array and currentTurn tracking

2. **Enhanced trackToolCall()** - Stores complete input/output JSON with turn/timestamp

3. **CSS Styles**:
   - .call-history-section - Container for call history
   - .call-history-list - Scrollable list (max-height: 300px)
   - .call-history-item - Individual call with success/failure border
   - .call-history-detail - Always visible (display: block)

4. **HTML Structure** - Call history in review panel, no toggle/collapse UI

5. **JavaScript Functions**:
   - renderCallHistory() - Build HTML for all tool calls
   - summarizeJson() - Compact summary for header
   - formatJson() - Pretty-print JSON
   - copyCallJson() - Copy to clipboard

6. **System Prompt Changes**:
   - buildSystemPrompt() returns user's prompt directly
   - DEFAULT_SYSTEM_PROMPT constant for default value
   - loadSystemPrompt() sets default if nothing saved
   - First message changed to just "BEGIN"

7. **Review Panel Header Fix** - Header and close button in separate flex container

---

## Decisions Made

1. **No collapse/expand** - Call history and individual call details always visible. Simpler for debugging.

2. **Prompt transparency** - User sees and controls the only prompt. No hidden instructions.

3. **Default in textarea** - Default system prompt shown in textarea, not hidden.

---

## Testing Notes

**Dev Server:** http://localhost:3000/dev/rescue-run/index.html

**IMPORTANT - Claude must verify with Playwright:**
Each milestone has a "Verify with Playwright" step. Claude MUST actually run Playwright before marking complete.

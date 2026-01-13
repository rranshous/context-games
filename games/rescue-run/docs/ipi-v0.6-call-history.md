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
- [ ] Intercept/log each tool call with full input args and output
- [ ] Store in memory for current run
- [ ] Include timestamp and turn number
- [ ] **Verify with Playwright:** Run game, check call history populated

### Milestone 2: Display Call History
- [ ] Show tool calls in AI Log panel (or dedicated section)
- [ ] Each call shows: tool name, turn, summary
- [ ] Collapsed by default
- [ ] **Verify with Playwright:** Run game, see tool calls listed

### Milestone 3: Interactive Detail View
- [ ] Click/hover on call to expand full JSON
- [ ] Input args (what AI passed)
- [ ] Output (what tool returned)
- [ ] Pretty-printed JSON
- [ ] **Verify with Playwright:** Click tool call, verify JSON displayed correctly

### Milestone 4: Copy to Clipboard
- [ ] Add copy button for input/output JSON
- [ ] Easy to grab for debugging
- [ ] **Verify with Playwright:** Click copy, verify clipboard contents

---

## Implement

_To be filled in as work progresses_

---

## Testing Notes

**Use Playwright to verify each milestone:**
- Run a game with multiple tool calls
- Inspect the call history UI
- Verify JSON content matches actual calls
- Test copy functionality

---

## Notes

_Space for implementation discoveries_

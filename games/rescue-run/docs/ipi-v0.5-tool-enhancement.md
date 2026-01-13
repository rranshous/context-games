# IPI: v0.5 Tool Enhancement & System Prompt

## Goal

Improve tool editing UX and add editable system prompt to support the embodiment-first design.

---

## Introduce

**What we're building:** Enhanced tool editing with inline expand (no modal), tool toggle on/off, add new tool button, and an editable system prompt textarea.

**Why:** The current modal-based tool editor blocks the game view. We want embodiment editing to feel like the PRIMARY activity, always visible alongside the game.

**Key Changes:**
- No modal for tool editing - inline expand or side panel
- Tool toggle on/off (without deleting)
- Add new tools button
- Editable system prompt (NO default - starts empty)
- Persist tool edits in localStorage

---

## Plan

### Milestone 1: Remove Tool Modal
- [ ] Replace modal with inline expandable tool editor
- [ ] Tool shows collapsed with name/description
- [ ] Click to expand and show code editor
- [ ] Save happens on blur or explicit button
- [ ] **Verify with Playwright:** Open game, click tool to expand, edit code, confirm changes save

### Milestone 2: Tool Toggle
- [ ] Add on/off toggle per tool
- [ ] Toggled-off tools not sent to AI
- [ ] Visual indicator for off state
- [ ] **Verify with Playwright:** Toggle tool off, run game, confirm tool not in AI's available tools

### Milestone 3: Add New Tool
- [ ] Add Tool button in tools panel
- [ ] Creates new tool with placeholder name/code
- [ ] Expands immediately for editing
- [ ] **Verify with Playwright:** Click Add Tool, enter name/code, save, confirm tool appears

### Milestone 4: Editable System Prompt
- [ ] Add system prompt textarea above tools panel
- [ ] Starts empty (no default prompt)
- [ ] Persisted to localStorage
- [ ] System prompt prepended to AI context
- [ ] **Verify with Playwright:** Enter system prompt, run game, check AI receives it

### Milestone 5: LocalStorage Persistence
- [ ] Persist all tool edits (code, enabled state)
- [ ] Persist system prompt
- [ ] Load on page refresh
- [ ] **Verify with Playwright:** Edit tool, refresh page, confirm edit persisted

---

## Implement

_To be filled in as work progresses_

---

## Testing Notes

**Use Playwright to verify each milestone:**
- Navigate to game
- Perform the user action (expand tool, toggle, add, etc.)
- Assert expected state change (DOM, localStorage, AI context)

---

## Notes

_Space for implementation discoveries_

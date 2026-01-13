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

### Milestone 1: Remove Tool Modal ✅
- [x] Replace modal with inline expandable tool editor
- [x] Tool shows collapsed with name/description
- [x] Click to expand and show code editor
- [x] Save happens on blur or explicit button
- [x] **Verified:** Inline expand/collapse works, CodeMirror initializes lazily

### Milestone 2: Tool Toggle ✅
- [x] Add on/off toggle per tool
- [x] Toggled-off tools not sent to AI
- [x] Visual indicator for off state (opacity + strikethrough)
- [x] **Verified:** Toggle works, disabled tools filtered from getClaudeTools()

### Milestone 3: Add New Tool ✅
- [x] Add Tool button in tools panel
- [x] Creates new tool with placeholder name/code
- [x] Expands immediately for editing
- [x] **Verified:** New tools appear and expand automatically

### Milestone 4: Editable System Prompt ✅
- [x] Add system prompt textarea above tools panel
- [x] Starts empty (no default prompt)
- [x] Persisted to localStorage
- [x] System prompt prepended to AI context
- [x] **Verified:** System prompt panel visible and saves

### Milestone 5: LocalStorage Persistence ✅
- [x] Persist all tool edits (code, enabled state)
- [x] Persist system prompt
- [x] Load on page refresh
- [x] **Verified:** All state persists across refresh

---

## Implement

**Commits:**
1. M1: Replace modal with inline tool editor
2. M2: Add tool toggle on/off
3. M3: Add new tool button  
4. M4: Add editable system prompt
5. Final: Version bump to v0.5

---

## Testing Notes

**Use Playwright to verify each milestone:**
- Navigate to game
- Perform the user action (expand tool, toggle, add, etc.)
- Assert expected state change (DOM, localStorage, AI context)

---

## Notes

_Space for implementation discoveries_

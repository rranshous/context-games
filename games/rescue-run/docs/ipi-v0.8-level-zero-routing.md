# IPI: v0.8 Level Zero & URL Routing

## Goal

Add Level 0 (pure basics tutorial) and URL parameter support for deep linking to specific game states.

---

## Introduce

**What we're building:**
1. **Level 0:** A minimal level with no obstacles - just test that tools work at all
2. **URL routing:** Query params to load directly to specific level, tool config, etc.

**Why Level 0:** New users need a "zero friction" start. No maze, no obstacles - just: can the AI scan, move, pickup, dropoff? If tools are broken, debug here first.

**Why URL routing:** Aids debugging, sharing, testing. Jump directly to `?level=5` or `?level=0&debug=true`.

---

## Plan

### Milestone 1: Level 0 Design
- [ ] Design minimal level (maybe 5x5 or 6x6)
- [ ] Straight path: start → person → safe zone
- [ ] No obstacles, no dead ends
- [ ] Turn limit: generous (30+)
- [ ] **Verify with Playwright:** Load L0, run with basic tools, complete easily

### Milestone 2: Add Level 0 to Game
- [ ] Insert L0 at beginning of level list
- [ ] Update level selector (L0, L1, L2... L7)
- [ ] L0 selected by default for new users (no localStorage)
- [ ] **Verify with Playwright:** Fresh load (clear localStorage), verify L0 selected

### Milestone 3: URL Parameter - Level
- [ ] Support `?level=X` query param
- [ ] Load specified level on page load
- [ ] Override localStorage selection
- [ ] **Verify with Playwright:** Navigate to `?level=5`, verify L5 loads

### Milestone 4: URL Parameter - Debug Mode
- [ ] Support `?debug=true` param
- [ ] Enable verbose logging or extra debug UI
- [ ] **Verify with Playwright:** Navigate with debug param, verify debug mode active

### Milestone 5: URL Updates on State Change
- [ ] Update URL when level changes (history.replaceState)
- [ ] Shareable URLs reflect current state
- [ ] **Verify with Playwright:** Select L3, check URL updated

---

## Implement

_To be filled in as work progresses_

---

## Testing Notes

**Dev Server:** Use `http://localhost:3000/dev/rescue-run/index.html` for testing - refresh to pick up changes without re-uploading.

**Use Playwright to verify each milestone:**
- Test Level 0 completion with basic tools
- Navigate with various URL params
- Verify deep linking works correctly
- Test URL updates on user actions

---

## Level 0 Design Sketch

```
6x6 grid, turn limit: 30

🟩🟩🟩🟩🟩🟩
🟩⬜⬜⬜⬜🟩
🟩🚗➡️🧍➡️🏠
🟩⬜⬜⬜⬜🟩
🟩🟩🟩🟩🟩🟩
🟩🟩🟩🟩🟩🟩

Start: (1,2)
Person: (3,2)  
Safe Zone: (5,2)

One straight road. Perfect for testing scan → move → pickup → move → dropoff cycle.
```

---

## Notes

_Space for implementation discoveries_

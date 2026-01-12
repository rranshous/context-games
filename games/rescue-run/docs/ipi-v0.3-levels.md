# IPI: v0.3 Level Progression

## Goal

Add multiple levels with increasing complexity. Degrade default tools so players must iterate and improve them to progress.

---

## Introduce

**What we're building:** A level system where each level is larger/more complex, requiring better tools to complete within the turn limit.

**Core Loop:**
1. Player attempts level with current tools
2. AI times out (exceeds turn limit) or succeeds
3. On failure: Review shows what went wrong → Player improves tools
4. On success: Unlock next level (harder)

**Key Design Decisions:**

1. **Degraded defaults** - Starting tools are minimal. They *barely* work on L1.
2. **Turn limit is the constraint** - Failure = exceeding turn limit
3. **Progressive tool improvement** - Each level pushes players to improve specific tools
4. **ASCII level format** - Human-readable level definitions

**ASCII Format:**
```
Level 1: Tutorial
Turns: 50

========
=C.....=
=.====.=
=.=##=.=
=.=##=.=
=.....P=
=S====.=
========

Legend:
  = = grass (impassable)
  . = road (passable)
  # = building (impassable)
  C = car start (on road)
  P = person (on road)
  S = safe zone (on road)
```

**Degraded Default Tools:**

Current "good" scan returns surroundings info. Degraded scan just returns position:
```js
// Degraded scan - just position, no surroundings
const pos = stdlib.getCarPosition();
return { 
    current_position: pos,
    person_in_car: stdlib.isPersonInCar()
};
```

This forces the AI to move blindly and hit walls. Works (slowly) on small maps, fails on larger ones.

---

## Plan

### Milestone 1: ASCII Level Format
- [ ] Define level format (ASCII grid + metadata)
- [ ] Create level parser (ASCII string → game state)
- [ ] Convert current hardcoded map to ASCII format (Level 1)
- [ ] Level loads and renders correctly
- [ ] **Verify via Playwright:** Game plays identically with parsed level

### Milestone 2: Level Selection UI
- [ ] Simple level picker (Level 1 button only initially)
- [ ] Show current level name/turn limit
- [ ] Reset game state when switching levels
- [ ] Persist completed levels (localStorage)
- [ ] **Verify via Playwright:** Can select Level 1, game loads correctly

### Milestone 3: Degraded Default Tools
- [ ] Create degraded scan (position only, no surroundings)
- [ ] Keep move, pickup, dropoff as-is (they're already minimal)
- [ ] Update DEFAULT_TOOLS with degraded versions
- [ ] Tune turn limit so L1 *barely* succeeds with degraded tools
- [ ] **Verify via Playwright:** AI completes L1 but inefficiently (near turn limit)

### Milestone 4: Level 2 - Bigger Map
- [ ] Design Level 2 ASCII map (larger, longer path)
- [ ] Add Level 2 to level selector
- [ ] Confirm degraded tools timeout on L2
- [ ] Document what tool improvement is needed (scan surroundings)
- [ ] **Verify via Playwright:** Degraded tools fail L2, improved scan succeeds

### Milestone 5: Polish
- [ ] Level complete celebration/feedback
- [ ] "Next Level" button on success
- [ ] Show turn limit in UI during play
- [ ] Hints reference level-specific tool improvements
- [ ] **Verify via Playwright:** Full flow L1 → L2 works

---

## Implement

*Progress tracked as we work through milestones.*

### Status: Not Started

---

## Notes

### Level Ideas

**Level 1: Tutorial**
- Small map (current ~8x8)
- Simple path
- Turn limit: ~50
- Degraded tools should *barely* finish

**Level 2: The Long Road**
- Larger map (~15x12)
- Longer winding path
- Turn limit: ~75
- Needs: scan that shows surroundings (passable directions)

**Level 3: TBD**
- Even larger
- Multiple routes? Dead ends?
- We'll discover what tool improvement is needed

### Degraded Tools Spec

**scan() - Degraded:**
```js
// Only returns position and cargo status
// AI has NO info about surroundings - must move blindly
const pos = stdlib.getCarPosition();
return { 
    current_position: pos,
    person_in_car: stdlib.isPersonInCar()
};
```

**move(), pickup(), dropoff():**
Keep as-is. They're already minimal - just execute the action.

### Future: Endless Mode (v0.4?)

Take your tuned tool library into procedural maps:
- Each rescue gives +X turns
- See how long you can go
- Leaderboard potential

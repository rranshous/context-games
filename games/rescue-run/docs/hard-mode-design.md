# Hard Mode Design

## Core Problem

Current levels are pure pathfinding puzzles. BFS solves them trivially. A "write a solver" tool makes the AI's job zero.

**Goal:** Design levels that require *reasoning*, not just computation.

---

## Design Principle

**The rules aren't given, they must be discovered.**

Code needs explicit rules to optimize against. LLMs can:
- Hypothesize from observations
- Recognize patterns
- Transfer knowledge across attempts
- Reason about consequences before acting

---

## Mechanic Categories

### 1. Traps with Learnable Patterns

**New elements:**
- `T` = trap (looks like road, costs extra turns or damages car)
- `!` = warning sign (environmental signal)

**How it works:**
- Traps aren't visually distinct from roads in raw data
- But patterns exist: traps near warning signs, traps in dead-ends, traps in "too easy" paths
- AI must learn: "road next to `!` = probably trap"

**Why it's hard for code:**
- Pattern is semantic, not structural
- Requires generalization across levels

---

### 2. Hidden Rules

**How it works:**
- Level looks normal but has a secret constraint
- Tool returns failure/penalty but doesn't explain why
- AI must hypothesize and test

**Example rules:**
- "Can only turn right"
- "North moves cost double"
- "Can't backtrack (revisit cells)"
- "Must alternate directions (N/S/E/W)"
- "Every 5th move must be west"

**Why it's hard for code:**
- Rule space is infinite
- Requires abductive reasoning
- Must test hypotheses efficiently

---

### 3. Sequence/State Puzzles

**New elements:**
- `^` = pressure plate
- `D` = door (blocked until triggered)
- `1-9` = numbered plates/doors (plate 1 controls door 1, etc.)

**How it works:**
- Step on plate → state changes elsewhere
- Must figure out: which plate opens which door? What order?

**Why it's hard for code:**
- State space explodes
- Cause-effect relationships must be inferred
- May require multiple attempts to map the system

---

### 4. Conditional Passability

**How it works:**
- Roads that only open under conditions:
  - "After picking up person"
  - "After visiting cell X"
  - "Only on odd-numbered turns"
  - "Only while carrying nothing"

**Why it's hard for code:**
- Conditions aren't labeled
- Must correlate state changes with actions
- Requires temporal reasoning

---

### 5. Irreversible Actions (Soft-Lock Potential)

**New elements:**
- `>` `<` `v` `^` = one-way passages
- `~` = crumbling road (passable once, then becomes impassable)
- `K` = key, `L` = locked door (key consumed on use)

**Mechanics:**
- **One-way doors:** Pass through but can't return
- **Limited-use plates:** Pressure plate only triggers once
- **Destructible paths:** Road crumbles after crossing
- **Key consumption:** Keys are single-use, wrong door = wasted
- **Order-dependent chains:** Plate A opens door B, but plate C closes B permanently

**Why it's hard for code:**
- Exploration is dangerous (can doom yourself)
- Must reason about consequences before acting
- BFS/DFS can soft-lock the level
- Requires strategic planning, not just pathfinding

---

## What This Demands from the AI

1. **Hypothesis formation** - "Maybe I can only turn right?"
2. **Pattern recognition** - "Warning signs seem to indicate traps"
3. **Consequence prediction** - "If I step here, that door might close forever"
4. **Soft-lock detection** - "I'm stuck. Need to restart with new knowledge"
5. **Cross-attempt learning** - "Last time X happened, this time I'll try Y"
6. **Strategic caution** - "I shouldn't explore blindly, I might doom myself"

---

## Implementation Notes

### Level Format Extensions

```
Legend additions:
  T : trap (hidden cost/damage)
  ! : warning sign
  ^ : pressure plate
  D : door (closed)
  O : door (open) 
  > : one-way east
  < : one-way west
  v : one-way south
  A : one-way north (up arrow)
  ~ : crumbling road
  K : key
  L : locked door
  1-9 : numbered triggers/doors
```

### State Tracking

Levels need additional metadata:
```javascript
{
  name: "Trap Alley",
  turns: 50,
  map: `...`,
  // New fields:
  hiddenRule: "no-backtrack", // or null
  triggers: {
    "^1": { toggles: ["D1"] },
    "^2": { toggles: ["D1", "D2"], oneShot: true }
  },
  traps: [
    { x: 3, y: 4, penalty: 5 }
  ]
}
```

### Tool Feedback

Tools should return:
- Success/failure
- Observable state changes
- NOT the hidden rule
- Enough info to form hypotheses

---

## Level Progression Ideas

1. **Intro to traps** - Obvious pattern (trap always after warning)
2. **Hidden rule: right turns only** - Simple rule, easy to discover
3. **Basic sequence** - One plate, one door, clear causation
4. **One-way maze** - Must plan route, can't backtrack
5. **Multi-step sequence** - Multiple plates, order matters
6. **Trap + sequence combo** - Plates might trigger traps
7. **Soft-lock possible** - Wrong order = restart
8. **Complex hidden rule** - Harder to discover constraint
9. **Full chaos** - All mechanics combined

---

## Open Questions

- [ ] How does the AI "restart" a level? New tool? Automatic on soft-lock?
- [ ] How is cross-attempt knowledge preserved? Tool state? Conversation history?
- [ ] Should hidden rules be hinted at in level names?
- [ ] How do we balance "hard" vs "unfair"?
- [ ] Scoring: penalize restarts? Reward efficient discovery?

---

## Connection to Tool Philosophy

From the tool philosophy doc:

> "Create an embodiment that leans toward success."

Hard mode inverts this: the *level* leans toward failure. The AI must:
1. Recognize the hostile environment
2. Adapt its approach (caution over speed)
3. Build tools that account for uncertainty
4. Learn across failures

This tests whether the AI can *reshape its embodiment* in response to a changed problem.

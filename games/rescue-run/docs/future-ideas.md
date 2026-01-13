# Rescue Run - Future Ideas

## Level Design

### Level 0: Pure Basics
**Idea:** Super simple level with NO obstacles. Just open space + person + safe zone.

**Purpose:**
- Test that tools work at all
- Learn the core loop: scan → move → pickup → move → dropoff
- Zero navigation complexity
- Perfect for first-time players or debugging tools

**Example map (6x6):**
```
======
=C...=
=....=
=....=
=..P.=
=S...=
======
```

Par: ~8 turns (move to person, pickup, move to safe zone, dropoff)

---

## UI Improvements

### Turn Limit Always Visible ✅ DONE
**Issue:** Turn count only showed after starting run.
**Fix:** Show "Ready (X turns)" in AI status before and after runs.

---

## Tool Management

### Toggle Tools On/Off
**Idea:** Let players enable/disable individual tools for experimentation.

**Use cases:**
- "Can I beat this with just scan + move?"
- Test if a tool is actually helping or hurting
- Challenge runs with limited toolset

**UI:** Checkbox next to each tool in the Tools panel

### Add Custom Tools
**Idea:** Let players create entirely new tools, not just edit existing ones.

**Use cases:**
- "What if I had a 'pathfind' tool?"
- Experiment with different tool designs
- Share tool configurations

**Considerations:**
- Need tool name, description, parameters, implementation
- Validate implementation syntax
- Maybe tool templates to start from?

### AI Coding Assistant for Tools
**Idea:** Built-in AI helper for writing tool implementations.

**Why:**
- Lower barrier to entry for non-coders
- Practice AI collaboration
- "Help me make scan show distance to person"

**Implementation options:**
- Chat interface in tool editor
- "Suggest improvement" button
- Explain what current code does

---

## Optimal Path & Scoring

### 1. Pre-calculated Optimal Paths
**Idea:** Calculate the mathematically optimal path for each level ahead of time.

**Implementation:**
- BFS/A* pathfinding to find shortest path: start → person → safe zone
- Store optimal turn count per level
- Show "Par" like golf: "Level 4 Par: 24 turns"

**Display options:**
- Show par before starting level
- Show delta after completion: "Completed in 27 turns (Par +3)"
- Maybe show optimal path ghost/overlay after completion?

### 2. Personal Best Tracking
**Idea:** Track and display user's best runs per level.

**Data to store (per user, per level):**
- Best turn count
- Date achieved
- Maybe: tool configuration used?

**Display:**
- "Your Best: 27 turns" on level select
- After run: "New Personal Best!" or "3 turns off your best"
- Leaderboard potential (later)

### 3. Running Average Score
**Idea:** Track rolling average performance, golf-style.

**Metrics:**
- Last N runs average
- Overall average per level
- "Handicap" style rating?

**Display:**
- "Avg: 32 turns (last 5 runs)"
- Trend indicator: improving ↑ or declining ↓

### 4. Token Burn Tracking (Future)
**Idea:** Track API token usage as part of score.

**Why:**
- Efficient tool design = fewer tokens needed
- Verbose tools work but cost more
- Creates optimization pressure beyond just turns

**Scoring:**
- Primary: Turn count
- Secondary: Token usage
- Combined score formula TBD

---

## Implementation Priority

1. **Optimal path calculation** - Adds "par" context to scores
2. **Personal best per level** - Simple, high impact
3. **Token tracking** - Needs proxy changes
4. **Running averages** - Nice to have

---

## Notes

- Golf metaphor works well: low score = good
- Could have "achievements" for under-par completions
- Leaderboards could be fun but need auth/storage infrastructure

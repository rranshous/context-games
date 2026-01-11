# IPI: v0.1 Demo Level

## Goal

Create a minimal playable demo with hardcoded tools and a single objective. Prove the core loop works before adding the tool editor.

---

## Introduce

**What we're building:** A top-down rescue game where an AI-controlled car uses predefined tools to rescue one person and reach a safe zone.

**How it works:** Claude (Haiku) controls the drone/car by calling tools we define. We implement a standard agentic tool-use loop per [Claude's tool use docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use):
1. Send game state + available tools to Claude
2. Claude responds with a tool call
3. We execute the tool, update game state
4. Repeat until win/lose condition

**Scope:**
- Single HTML file
- Hardcoded map (small grid)
- Hardcoded tools (scan, move, pickup, dropoff)
- One rescue target, one safe zone
- Win condition: person rescued and delivered to safe zone
- Simple UI buttons to manually test tools (before AI runs)

**Not in scope (yet):**
- Tool editor UI
- Multiple levels
- Hazards/obstacles
- Scoring/leaderboards
- Local model support (Ollama)

---

## Plan

### Milestone 1: Static Map Rendering ✅
- [x] Create HTML file with canvas
- [x] Define simple tile grid (roads, grass, buildings)
- [x] Render car sprite at start position
- [x] Render person icon at rescue location
- [x] Render safe zone marker
- [x] Assets copied locally to `assets/` folder

### Milestone 2: Game State & Tool Functions ✅
- [x] Game state object (car position, car direction, person location, person picked up, etc.)
- [x] Implement tool functions:
  - `scan()` - returns what's visible around the car
  - `move(direction)` - moves car one tile in direction
  - `pickup()` - picks up person if on same tile
  - `dropoff()` - drops person if at safe zone
- [x] Simple UI buttons to trigger each tool manually
- [x] Visual feedback when tools execute

### Milestone 3: Win/Lose Detection ✅
- [x] Detect win: person delivered to safe zone
- [x] Display win message
- [x] Reset/restart button

### Milestone 4: AI Integration (Claude Haiku)
- [ ] Define tools in Claude tool format (name, description, input_schema)
- [ ] System prompt: describe scenario, goal, current state
- [ ] Agentic loop:
  - Send state → Claude picks tool → execute → update state → repeat
- [ ] Use `claude-haiku-4-5-20251001` model
- [ ] Display AI's tool calls in a log panel
- [ ] Watch AI complete (or fail) the rescue

### Milestone 5: Deploy to Vanilla Platform
- [ ] Add auth check on load
- [ ] Use vanilla platform inference endpoints
- [ ] Reference: [game-making-guide.md](../../../platforms/vanilla/docs/game-making-guide.md)
- [ ] Test on vanilla platform
- [ ] Basic error handling (auth fail, API errors, token limits)

---

## Implement

*Progress tracked below as we work through milestones.*

### Status: Milestone 3 Complete

---

## Notes

- Assets: 16x16 sprites from mini-pixel-pack-2 (now in `assets/`)
- Grid size: 8x8 to start
- Model: `claude-haiku-4-5-20251001` (fast, cheap)
- Tool format follows Claude API spec with `tools` array
- Reference CarSprite.ts from raceon for sprite rendering approach

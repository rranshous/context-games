# Explorer Claude

Autonomous playtesting agent that can play the game, observe item generation, and report API findings.

## Purpose

Explorer Claude exists to:
1. Autonomously test the game loop (forge → item → collect → repeat)
2. Observe what code patterns the AI item generator tries to use
3. Detect API misses (undefined property access attempts)
4. Generate reports to guide World API refinement

This lets us "farm out" API discovery to sub-agents without polluting the main conversation context.

## Architecture

### Components

1. **Explorer Panel UI** (collapsible sidebar on right)
   - Status display (running/idle/error)
   - Real-time game state: player position, forge state, items, entities
   - API observations list (successes/failures/patterns)
   - Log console
   - Run/Stop controls

2. **Programmatic Player Control**
   - `explorerInput` object overrides keyboard/gamepad when running
   - Actions: move left/right, jump, interact
   - Async action execution with timing

3. **Observation Hooks**
   - `createInstrumentedProxy()` wraps World and Player APIs
   - Catches undefined property access (API misses)
   - Logs successful API method calls
   - Reports saved to `window.explorerReport`

4. **Exploration Loop**
   - Heuristic-based decision making (no inference needed for simple navigation)
   - State machine: move to forge → activate → wait → collect item → repeat
   - Handles item spawning above player (jumps to collect)

### Code Locations (in index.html)

| Component | Location |
|-----------|----------|
| Explorer CSS | lines ~50-170 |
| Explorer HTML | lines ~152-179 |
| Explorer object | lines ~2500-2830 |
| Instrumented Proxy | `createInstrumentedProxy()` |
| Pattern analyzer | `analyzeGeneratedCode()` |
| explorerInput | global object for input override |

## Usage

### Manual (Browser)

1. Open game at `http://localhost:3000/dev/oneshot-climb/index.html`
2. Click arrow button on right edge to expand Explorer panel
3. Click "Run (10 forges)" to start
4. Watch observations and log
5. Report saved to `window.explorerReport` when stopped

### From Playwright (Claude)

```javascript
// Start explorer
await page.click('#btn-run');

// Wait for completion
await page.waitForFunction(() =>
  window.explorer && window.explorer.completedForges >= 10,
  { timeout: 120000 }
);

// Get report
const report = await page.evaluate(() => window.explorerReport);
console.log(report);
```

### Accessing Generated Items

After a run, inspect generated code:

```javascript
// In browser console
window.explorerReport.generatedItems.forEach(item => {
  console.log(`=== ${item.name} ===`);
  console.log(item.code);
});
```

## Decision Logic

The explorer uses simple heuristics (no inference):

```
1. If item spawned → move toward and collect it
   - If not horizontally aligned → move left/right
   - If item above and on ground → jump

2. If forge idle and near it → activate
3. If forge idle and not near → move toward it
4. If forge forging/ready → wait
```

This is sufficient for basic exploration. Can upgrade to inference-based decisions for smarter navigation.

## Report Format

After stopping, `window.explorerReport` contains:

```javascript
{
  generatedItems: [
    { name: "Chrono Shard", description: "...", code: "..." },
    // ...
  ],
  codePatterns: {
    "world.getEntities*()": 13,
    "entity.x (read)": 5,
    "forEach entities": 4,
    // ...
  },
  apiMisses: {
    "entity.freeze": 2,
    "world.teleport": 1,
    // ...
  },
  observations: [
    { type: "success", message: "Used: world.spawn()", time: 1706... },
    { type: "pattern", message: "entity.x (read): 3x", time: 1706... },
    // ...
  ]
}
```

## Pattern Detection

The explorer analyzes generated item code for these patterns:

| Pattern | What it Indicates |
|---------|-------------------|
| `world.entities` (direct) | Model accessing entity array directly |
| `entity.x/y` (read) | Model reading entity position |
| `entity.x/y` (write) | Model trying to move entities |
| `entity.vx/vy` | Model trying to set velocity |
| `entity.type` | Model checking entity type |
| `entity.health` | Model manipulating health |
| `forEach entities` | Model iterating entities |
| `setTimeout` | Model using timers |
| `world.getEntities*()` | Model using query methods |
| `world.removeEntity()` | Model cleaning up entities |

## Key Findings (Historical)

From early exploration runs:

1. **Haiku stays within documented API** - very few runtime misses when prompt is well-documented
2. **Model heavily uses new query methods** - `getEntitiesInRadius`, `getEntitiesOfType` are popular
3. **Enemy spawning works** - `friendly: false` creates hostile entities
4. **Movement patterns wanted** - model tries to make entities orbit, chase, patrol

## Future Improvements

1. **Inference-based decisions** - use AI for smarter navigation
2. **Experimental mode** - prompt that encourages trying unsupported patterns
3. **Parallel explorers** - multiple runs with different prompts
4. **Longer runs** - 50+ items to find statistical API gaps
5. **Entity observation hooks** - track entity behavior not just API calls

## Integration with Claude Code

When using Playwright MCP, Claude can:

1. Start the explorer programmatically
2. Wait for completion
3. Extract and analyze the report
4. Make targeted API improvements based on findings
5. Re-run to verify improvements

This creates a feedback loop: explore → analyze → improve → verify.

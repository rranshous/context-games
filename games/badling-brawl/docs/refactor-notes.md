# Refactor Notes

Ideas and improvements to address in future refactoring sessions.

## Data Structures

### Ring Buffer for Timed Events
- Use a ring/circular buffer for things that trigger in the future
- Could simplify cooldown management, spawn timers, effect durations
- Single update pass instead of scattered timer decrements

## Code Organization

### DRY Pass
- Consolidate duplicate patterns
- Extract common calculations (distance, angle, etc.) to helpers
- Unify similar loops (effect updates, enemy iteration)

### Implementation Discoverability
- Group related code together so AI can easily find relevant pieces
- Current structure: Constants → Sprites → State → Input → Systems → Rendering → Game Loop → Init
- Consider: Group by feature instead? (e.g., all combat code together)

### Separation of Concerns
- Split rendering from logic updates
- Consider entity-component pattern for enemies/players
- Separate UI from game state

## Potential Refactors

### Entity System
```
entity = { x, y, health, ... }
components = { renderable, movable, damageable, ... }
```

### Event System
```
events.emit('enemy.died', enemy)
events.on('enemy.died', dropEgg)
events.on('enemy.died', addScore)
```

### Timer/Scheduler
```
scheduler.after(2.0, () => fireQuackBlast())
scheduler.every(1.5, () => fireWingSlap())
```

---

*Last updated: Phase 2*

# Refactor Notes

Ideas and improvements to address in future refactoring sessions.

## Dev Mode / Test Harness

### Goal
Enable faster AI feedback cycles without burning tokens on screenshots.

### Approach: Throwaway Level Configs
Instead of runtime toggles, just create level preset files that configure starting state. Simpler code, easier to reason about.

```javascript
// levels/test-quack-blast.js
const LEVEL = {
  name: 'Test Quack Blast',
  player: { x: 400, y: 300, eggs: 0, powers: ['quackBlast'] },
  enemies: [
    { type: 'cat', x: 500, y: 300 },
    { type: 'cat', x: 450, y: 250 },
  ],
  spawning: false,
  homeBase: false,
  nest: false
};

// levels/test-nest-deposit.js  
const LEVEL = {
  name: 'Test Nest Deposit',
  player: { x: 400, y: 300, eggs: 15, powers: [] },
  enemies: [],
  spawning: false,
  homeBase: true,
  nest: { eggs: 5 }  // Nest starts with 5
};

// levels/dogs-only-surge.js
const LEVEL = {
  name: 'Dogs Only',
  player: { x: 400, y: 300, eggs: 0, powers: [] },
  enemies: [],
  spawning: { types: ['dog'], rate: 1.0 },
  homeBase: true,
  nest: true
};
```

Load via URL param: `index.html?level=test-quack-blast`

### Console Logging
Verbose logging on code paths - observe without screenshots:
```javascript
log.combat('Peck hit enemy', { damage: 15, enemyHealth: enemy.health });
log.power('Quack Blast fired', { angle, enemiesHit: 3 });
log.nest('Deposited eggs', { amount: 10, nestTotal: 25 });
log.spawn('Enemy spawned', { type: 'dog', position: {x, y} });

// Periodic state summary
[STATE] t=45s | enemies=12 | eggs=5 | health=75 | powers=[quackBlast]
```

### Benefits for AI Dev
- Can "observe" game state via console logs instead of screenshots
- Test specific features in isolation
- Reproduce scenarios quickly
- Step through combinations systematically
- Throwaway levels = no cleanup needed, just delete when done

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

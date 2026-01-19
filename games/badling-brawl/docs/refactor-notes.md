# Refactor Notes

Ideas and improvements to address in future refactoring sessions.

## Dev Mode / Test Harness

### Goal
Enable faster AI feedback cycles without burning tokens on screenshots.

### Features
- **Feature Toggles**: Enable/disable individual game elements
  ```javascript
  const DEV = {
    enemies: { cats: true, dogs: false },
    powers: { quackBlast: true, wingSlap: false },
    spawning: false,  // Manual spawn only
    homeBase: true,
    nest: true,
    startEggs: 50,    // Start with eggs for testing
    invincible: true  // Player can't die
  };
  ```

- **Console Logging**: Verbose logging on code paths
  ```javascript
  log.combat('Peck hit enemy', { damage: 15, enemyHealth: enemy.health });
  log.power('Quack Blast fired', { angle, enemiesHit: 3 });
  log.nest('Deposited eggs', { amount: 10, nestTotal: 25 });
  log.spawn('Enemy spawned', { type: 'dog', position: {x, y} });
  ```

- **Dev Console Commands** (via browser console)
  ```javascript
  dev.spawnEnemy('cat')
  dev.giveEggs(50)
  dev.unlockPower('quackBlast')
  dev.setPhase('lull')
  dev.killAllEnemies()
  ```

- **State Snapshots**: Log game state periodically
  ```javascript
  // Every 5 seconds, log summary
  [STATE] t=45s | enemies=12 | eggs=5 | health=75 | powers=[quackBlast]
  ```

### Benefits for AI Dev
- Can "observe" game state via console logs instead of screenshots
- Test specific features in isolation
- Reproduce scenarios quickly
- Step through combinations systematically

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

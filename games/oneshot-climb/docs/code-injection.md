# Code Injection & Inference

## The Big Idea

AI generates actual game code at runtime. Not predefined components shuffled around - **new code that has never existed before**.

Each forged item is:
- Written by inference during gameplay
- Injected into the running game
- Unique to this run (ephemeral, not persisted)

## Why This Is Different

**Traditional roguelite items:**
```
Item pool → Random selection → Apply predefined stats/behaviors
```

**Oneshot Climb:**
```
Forge activation → Inference generates JS → Execute → Novel effects on the world
```

The item's behavior is *authored* at runtime. Two players will never have the same item.

## Technical Architecture

### Inference Call

Using vanilla platform's inference proxy:

```javascript
const response = await fetch('/api/inference/anthropic/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    messages: [{ role: 'user', content: ITEM_GENERATION_PROMPT }],
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1500
  })
});
```

### Output Format: Pure JavaScript

The AI returns **pure JavaScript**, not JSON. The code uses the provided APIs to:
1. Register the item (name, description, sprite)
2. Apply effects to the game world

This approach:
- Eliminates JSON parsing/escaping issues
- Lets the AI write natural, expressive code
- Makes the "contract" the API itself

### The Prompt

The generation prompt provides:
1. **Item API** - how to register the item and define its appearance
2. **World API** - what effects the item can have on the game
3. **Current game state** - journal of previous items, player status
4. **Constraints** - what's forbidden

Example prompt structure:
```
You are generating a unique item for a roguelite game. Return ONLY JavaScript code.
When the player picks up your item it should cause a change to the world. Giving the player new powers? spawning entities? changing stats or physics? Be creative!

## Item Registration API

Call registerItem() exactly once to define your item, which the player will pickup:

  registerItem({
    name: "Item Name",           // short, evocative name
    description: "What it does", // prose description for the journal
    sprite: `
      ..kkkk..
      .kwwwwk.
      kwwwwwwk
      kwwwwwwk
      .kwwwwk.
      ..kkkk..
      ........
      ........
    `,  // 8x8 grid using palette below. will be used to represent the item w/in the game world and in the journal

    onPickup() {
      // Effects go here - runs when player collects the item
    }
  });

## Sprite Palette (8x8 grid)
Use ONLY these characters:
  . = transparent
  k = outline/dark brown
  w = warm white/highlight
  g = muted green
  b = soft blue
  r = soft red
  o = orange
  y = yellow
  p = pink
  t = teal

## Player API (available in onPickup)

  player.heal(amount)
  player.damage(amount)
  player.addSpeed(multiplier)
  player.addJumpPower(amount)

## World API (available in onPickup)

  // Define new entity types (must define before spawning!)
  world.defineEntity("typename", {
    sprite: `...8x8...`,
    // other properties like damage, lifetime, etc.
  });

  world.spawn("typename", x, y, options)  // spawn defined entity
  world.onUpdate(callback)                // register per-frame logic: fn(dt)
  world.onPlayerHit(callback)             // when player takes damage
  world.damageNearby(x, y, radius, amount)
  world.entities                          // current entities array
  world.win()                             // trigger win

## Current State
- Player health: ${player.health}/${player.maxHealth}
- Items collected: ${journal.length}

## Previous Items (for narrative continuity)
${journal.map(j => `- "${j.name}": ${j.description}`).join('\n')}

## Constraints
- No infinite loops
- No DOM/window/document access
- No fetch/XMLHttpRequest
- Keep it under 40 lines

## Example

registerItem({
  name: "Ember Heart",
  description: "A smoldering core that leaves fire in your wake",
  sprite: `
    ...rr...
    ..roor..
    .roooor.
    .roooor.
    ..roor..
    ...rr...
    ........
    ........
  `,

  onPickup() {
    // Define what "fire" looks like
    world.defineEntity("fire", {
      sprite: `
        ...rr...
        ..royr..
        .royyor.
        ..royr..
        ...rr...
        ........
        ........
        ........
      `,
      damage: 3,
      lifetime: 2
    });

    // Drop fire as player moves
    world.onUpdate((dt) => {
      if (Math.random() < 0.1) {
        world.spawn("fire", player.x, player.y + 20);
      }
    });
  }
});
```

### Validation

Before execution, scan the raw code for forbidden patterns:

```javascript
function validateItemCode(code) {
  const FORBIDDEN = [
    'window', 'document', 'eval', 'Function',
    'fetch', 'XMLHttpRequest', 'import',
    'while(true)', 'for(;;)'
  ];

  for (const pattern of FORBIDDEN) {
    if (code.includes(pattern)) {
      throw new Error(`Forbidden pattern: ${pattern}`);
    }
  }

  return true;
}
```

### Code Execution

Execute the generated JS with the game APIs in scope:

```javascript
function executeItemCode(code, gameAPI) {
  const { player, world, registerItem } = gameAPI;

  // Create execution context with only allowed APIs
  const execute = new Function(
    'player', 'world', 'registerItem',
    code
  );

  // Run the generated code
  execute(player, world, registerItem);
}
```

The `registerItem` function captures the item definition (but doesn't run `onPickup` yet):

```javascript
function createItemRegistry() {
  let registeredItem = null;

  const registerItem = (def) => {
    if (registeredItem) throw new Error('registerItem called twice');

    // Validate required fields
    if (!def.name || !def.description || !def.sprite) {
      throw new Error('Missing required item fields');
    }

    // Validate sprite format (8x8)
    validateSprite(def.sprite);

    registeredItem = {
      name: def.name,
      description: def.description,
      sprite: parseSprite(def.sprite),
      onPickup: def.onPickup || (() => {})  // store for later
    };
  };

  return { registerItem, getItem: () => registeredItem };
}
```

When player collects the item:

```javascript
function collectItem(item, gameAPI) {
  // Add to journal
  gameAPI.journal.push({
    name: item.name,
    description: item.description
  });

  // Now run the pickup effects
  try {
    item.onPickup();
  } catch (e) {
    console.warn('onPickup error:', e);
    // Item still collected, effects just don't work
  }
}
```

### Safety Measures

**Minimal for now** (can tighten later):

1. **Try/catch wrapper** - bad code doesn't crash the game
```javascript
function safeExecute(code, gameAPI) {
  try {
    executeItemCode(code, gameAPI);
    return { success: true };
  } catch (e) {
    console.warn('Item code error:', e);
    return { success: false, error: e.message };
  }
}
```

2. **Timeout protection** - prevent infinite loops in registered callbacks
```javascript
function wrapWithTimeout(fn, maxMs = 100) {
  return (...args) => {
    const start = performance.now();
    const result = fn(...args);
    if (performance.now() - start > maxMs) {
      console.warn('Callback took too long, disabling');
      return null;
    }
    return result;
  };
}
```

3. **Forbidden patterns** - block obvious bad stuff (see Validation above)

4. **Limited API surface** - only expose what's needed
- Generated code gets `player`, `world`, `registerItem`
- These are curated interfaces, not raw game internals
- No access to DOM, network, or other browser APIs

## The World API

This is what the generated code can interact with. TBD as we implement.

### Item Registration (required)

```javascript
registerItem({
  name: string,        // displayed to player
  description: string, // added to journal
  sprite: string,      // 8x8 ASCII art using palette

  onPickup() {
    // Called when player collects the item
    // All effects should be registered here
  }
})
```

### Player API (available inside onPickup)

```javascript
player.x, player.y           // position (read-only)
player.health                // current health
player.maxHealth             // max health
player.heal(amount)          // restore health
player.damage(amount)        // take damage
player.addSpeed(multiplier)  // modify movement speed
player.addJumpPower(amount)  // modify jump height
```

### World API (available inside onPickup)

```javascript
// Entity types - must define before spawning
world.defineEntity(name, {
  sprite: string,      // 8x8 ASCII art
  damage?: number,     // damage on contact (optional)
  lifetime?: number,   // seconds before despawn (optional)
  // ... other properties TBD
})

world.spawn(type, x, y, options)     // spawn a defined entity type
world.onUpdate(fn)                   // register frame callback: fn(dt)
world.onPlayerHit(fn)                // when player takes damage: fn(amount, source)
world.damageNearby(x, y, radius, amount)  // area damage
world.entities                       // array of current entities
world.win()                          // trigger win condition
```

### Execution Model

1. **Forge completes** → AI code executes, `registerItem()` captures item definition
2. **Item appears** → Item sprite rendered at forge, waiting for pickup
3. **Player collects** → `onPickup()` runs, effects become active

This separation means:
- Item is visible before its effects activate
- Player chooses when to commit to the item's effects
- Bad `onPickup` code doesn't prevent item from appearing

*Note: This API will evolve as we implement M4-M6.*

## Failure Handling

When things go wrong:

| Failure | User Sees | Technical |
|---------|-----------|-----------|
| Inference timeout | "Creation unstable" | Forge fizzles, no item |
| Forbidden pattern | "Creation unstable" | Validation rejects code |
| Missing registerItem | "Creation unstable" | No item registered |
| Runtime error | "Creation unstable" | Try/catch catches, forge fizzles |
| Callback errors | Item works partially | Individual callbacks fail silently |
| Infinite loop | Item disabled | Timeout triggers, callback removed |

Players never see stack traces or error messages. Failures are world events.

## Open Questions

- Should items have "power budgets" to constrain generation?
- Can inference see/reference other players' past items for inspiration?
- How detailed should game state in prompt be? (affects token usage)
- Streaming: can we show partial item info as it generates?
- Should there be item "categories" that constrain generation?
- How to handle items that register callbacks but never call registerItem?

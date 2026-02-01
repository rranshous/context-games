# Code Injection & Inference

## The Big Idea

AI generates actual game code at runtime. Not predefined components shuffled around - **new code that has never existed before**.

Each ability is:
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
Forge activation → Inference generates code → Parse & execute → Novel behavior
```

The item's behavior is *authored* at runtime. Two players will never have the same ability.

## Technical Architecture

### Inference Call

Using vanilla platform's inference proxy:

```javascript
const response = await fetch('/api/inference/anthropic/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    messages: [{ role: 'user', content: ABILITY_GENERATION_PROMPT }],
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1500
  })
});
```

### The Prompt

The generation prompt must include:
1. **API documentation** - what hooks/methods the ability can use
2. **Current game state** - player stats, existing abilities, maybe theme hints
3. **Constraints** - what's allowed, what's not
4. **Output format** - exact JSON structure expected

Example prompt structure:
```
You are generating a unique ability for a roguelite game.

## Available API
- player.damage(amount) - deal damage to player
- player.heal(amount) - heal player
- player.addBuff(name, duration, effect) - temporary buff
- world.spawnProjectile(x, y, dx, dy, damage) - create projectile
- world.enemies - array of current enemies
- world.nearestEnemy(x, y) - get closest enemy
[... full API docs ...]

## Current State
- Player health: 80/100
- Existing abilities: ["Double Jump", "Fire Trail"]
- Wave: 3

## Constraints
- No infinite loops
- No direct DOM manipulation
- No accessing window/document
- Max 50 lines of code

## Sprite Palette
Use ONLY these characters in your sprite:
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

## Output Format
Return ONLY valid JSON:
{
  "name": "Ability Name",
  "description": "What it does",
  "sprite": [
    "..rrr..",
    ".rooor.",
    "..rrr..",
    // 10x10 grid using palette characters only
  ],
  "hooks": {
    "onActivate": "function code as string",
    "onUpdate": "function code as string (optional)",
    "onHit": "function code as string (optional)"
  }
}
```

### Parsing & Validation

```javascript
function parseAbility(responseText) {
  // 1. Extract JSON from response
  const json = extractJSON(responseText);

  // 2. Validate structure
  if (!json.name || !json.hooks?.onActivate) {
    throw new Error('Invalid ability structure');
  }

  // 3. Validate sprite format (see art-style.md)
  validateSprite(json.sprite, json.palette);

  // 4. Basic code safety check
  if (containsForbiddenPatterns(json.hooks)) {
    throw new Error('Forbidden code pattern');
  }

  return json;
}
```

### Code Execution

Convert string code to callable functions:

```javascript
function compileAbility(abilityDef, gameAPI) {
  const ability = {
    name: abilityDef.name,
    description: abilityDef.description,
    sprite: renderSprite(abilityDef.sprite, abilityDef.palette),
  };

  // Compile hooks with sandboxed API access
  for (const [hookName, code] of Object.entries(abilityDef.hooks)) {
    if (code) {
      ability[hookName] = new Function('player', 'world', 'ability', code);
    }
  }

  return ability;
}
```

### Safety Measures

**Minimal for now** (can tighten later):

1. **Try/catch wrapper** - bad code doesn't crash the game
```javascript
function safeCall(fn, ...args) {
  try {
    return fn(...args);
  } catch (e) {
    console.warn('Ability error:', e);
    return null;
  }
}
```

2. **Timeout protection** - prevent infinite loops
```javascript
// Run ability code with timeout
const result = await Promise.race([
  new Promise(resolve => resolve(ability.onUpdate(player, world))),
  new Promise((_, reject) => setTimeout(() => reject('timeout'), 100))
]);
```

3. **Forbidden patterns** - block obvious bad stuff
```javascript
const FORBIDDEN = [
  'window.', 'document.', 'eval(', 'Function(',
  'while(true)', 'for(;;)', 'fetch(', 'XMLHttpRequest'
];
```

4. **Limited API surface** - only expose what's needed
- Generated code gets `player`, `world`, `ability` objects
- These are curated interfaces, not raw game internals

## The Ability API

See `ability-api.md` for full specification.

Core hooks:
- `onActivate(player, world, ability)` - when ability is first gained
- `onUpdate(player, world, ability, dt)` - every frame (optional)
- `onAttack(player, world, ability, target)` - when player attacks
- `onHit(player, world, ability, damage, source)` - when player takes damage
- `onKill(player, world, ability, enemy)` - when player kills enemy

## Failure Handling

When things go wrong:

| Failure | User Sees | Technical |
|---------|-----------|-----------|
| Inference timeout | "Creation unstable" | Forge fizzles |
| Invalid JSON | "Creation unstable" | Parse error caught |
| Bad code structure | "Creation unstable" | Validation fails |
| Runtime error | Ability just doesn't work | Try/catch swallows |
| Infinite loop | Ability disabled | Timeout triggers |

Players never see stack traces or error messages. Failures are world events.

## Open Questions

- Should abilities have "power budgets" to constrain generation?
- Can inference see/reference other players' past abilities for inspiration?
- How detailed should game state in prompt be? (affects token usage)
- Streaming: can we show partial ability info as it generates?
- Should there be ability "categories" that constrain generation?

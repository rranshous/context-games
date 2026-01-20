# Refactoring Recommendations for Phase 4 Powers

## Executive Summary

The current codebase is a **2083-line single HTML file** with all game logic inline. While this works for the current 2 powers, adding 15+ new powers (many with complex behaviors like projectiles, zones, and status effects) will become fragile and unmaintainable without structural changes.

**Key Concerns:**
1. No power abstraction - each power is hardcoded with its own variables, functions, and update logic
2. No entity system - projectiles, effects, and zones would need individual implementations
3. No status effect system - armor, speed boosts, invulnerability need manual tracking
4. Global state scattered throughout - makes testing and debugging difficult

---

## Priority 1: Power System Architecture (Critical)

### Current Problem
Powers are implemented as scattered pieces:
- Constants at top (`QUACK_BLAST_DAMAGE`, `WING_SLAP_COOLDOWN`, etc.)
- Player state flags (`p.powers.quackBlast`, `p.quackBlastTimer`)
- Fire functions (`fireQuackBlast()`, `fireWingSlap()`)
- Effect arrays (`quackBlastEffects[]`, `wingSlapEffects[]`)
- Render functions (`drawQuackBlastEffects()`, `drawWingSlapEffects()`)

For 15 powers, this becomes 75+ scattered elements.

### Recommended Solution: Power Registry

```javascript
// Power definition system
const PowerRegistry = {
    quackBlast: {
        name: 'Quack Blast',
        nest: 'attack',
        cost: 10,
        cooldown: 2.0,
        execute: (player) => { /* damage logic */ },
        canFire: (player, enemies) => { /* targeting check */ },
        createEffect: (player) => ({ /* visual effect data */ }),
        drawEffect: (effect, ctx) => { /* render logic */ }
    },
    duckShield: {
        name: 'Duck Shield',
        nest: 'defense',
        cost: 20,
        cooldown: 10.0,
        duration: 3.0,
        execute: (player) => { 
            applyStatusEffect(player, 'invulnerable', 3.0);
        },
        // ... etc
    }
};

// Generic cooldown tracking per player
player.powerCooldowns = {}; // { quackBlast: 0, duckShield: 2.5, ... }
```

**Benefits:**
- Add new power = add one object to registry
- Consistent structure for all powers
- Easy to balance (all stats in one place)
- Enables data-driven power unlocking for nests

---

## Priority 2: Entity/Projectile System (Critical for Phase 4)

### Current Problem
No projectile system exists. Powers like Egg Bomb, Ricochet Shot, Homing Egg, and Feather Storm all need projectiles with different behaviors.

### Recommended Solution: Generic Entity System

```javascript
const entities = []; // Unified array for projectiles, zones, decoys

// Entity types with behaviors
const EntityBehaviors = {
    projectile: {
        update: (entity, dt) => {
            entity.x += entity.vx * dt;
            entity.y += entity.vy * dt;
            entity.lifetime -= dt;
        },
        onHit: (entity, target) => { /* damage, destroy */ }
    },
    homing: {
        update: (entity, dt) => {
            const target = findNearestEnemy(entity);
            if (target) {
                // Smooth turn toward target
                const angle = Math.atan2(target.y - entity.y, target.x - entity.x);
                entity.vx = lerp(entity.vx, Math.cos(angle) * entity.speed, 0.1);
                entity.vy = lerp(entity.vy, Math.sin(angle) * entity.speed, 0.1);
            }
        }
    },
    ricochet: {
        onHit: (entity, target) => {
            entity.bounces--;
            if (entity.bounces > 0) {
                const nextTarget = findNearestEnemyExcluding(entity, [target]);
                if (nextTarget) redirectTo(entity, nextTarget);
            }
        }
    },
    zone: {
        update: (entity, dt) => {
            entity.lifetime -= dt;
            // Apply effect to entities inside
            for (const player of getPlayersInRadius(entity)) {
                applyEffect(player, entity.effect);
            }
        }
    }
};

// Generic entity factory
function createEntity(type, config) {
    return {
        type,
        x: config.x,
        y: config.y,
        vx: config.vx || 0,
        vy: config.vy || 0,
        lifetime: config.lifetime,
        owner: config.owner,
        damage: config.damage,
        ...config
    };
}
```

**Powers this enables:**
- Egg Bomb (projectile → explosion zone)
- Feather Storm (8 projectiles)
- Homing Egg (homing projectile)
- Ricochet Shot (ricochet projectile)
- Egg Sniper / Piercing Quack (piercing projectile)
- Healing Pond (zone entity)
- Bread Crumbs (slow zone)
- Decoy Duck (entity that enemies target)

---

## Priority 3: Status Effect System (Critical for Defense/Utility Powers)

### Current Problem
No way to track temporary buffs/debuffs on players or enemies.

### Recommended Solution: Status Effect Manager

```javascript
// Status effects on entities
player.statusEffects = []; // { type, duration, data }

const StatusEffects = {
    invulnerable: {
        onApply: (entity) => { entity.invulnerable = true; },
        onRemove: (entity) => { entity.invulnerable = false; },
        onDamage: (entity, damage) => 0 // Negate all damage
    },
    featherArmor: {
        onDamage: (entity, damage) => damage * 0.5 // 50% reduction
    },
    speedBoost: {
        onApply: (entity) => { entity.speed *= 2; },
        onRemove: (entity) => { entity.speed /= 2; }
    },
    eggMagnet: {
        onUpdate: (entity, dt) => {
            // Pull nearby eggs toward player
            for (const egg of eggs) {
                const dist = distance(entity, egg);
                if (dist < MAGNET_RADIUS) {
                    moveToward(egg, entity, MAGNET_STRENGTH * dt);
                }
            }
        }
    }
};

function updateStatusEffects(entity, dt) {
    for (let i = entity.statusEffects.length - 1; i >= 0; i--) {
        const effect = entity.statusEffects[i];
        effect.duration -= dt;
        
        if (StatusEffects[effect.type].onUpdate) {
            StatusEffects[effect.type].onUpdate(entity, dt);
        }
        
        if (effect.duration <= 0) {
            StatusEffects[effect.type].onRemove?.(entity);
            entity.statusEffects.splice(i, 1);
        }
    }
}
```

**Powers this enables:**
- Duck Shield (invulnerable)
- Feather Armor (damage reduction)
- Speed Waddle (speed boost)
- Nest Magnet (egg attraction)
- Bread Crumbs (enemy slow - apply to enemies)

---

## Priority 4: Nest System Refactor

### Current Problem
Only `attackNest` exists with hardcoded power array. Phase 4 needs 5 different nests.

### Recommended Solution: Data-Driven Nest System

```javascript
const NEST_TYPES = {
    attack: {
        name: 'Attack Nest',
        powers: ['quackBlast', 'wingSlap', 'eggBomb', 'featherStorm'],
        color: '#e74c3c'
    },
    defense: {
        name: 'Defense Nest',
        powers: ['duckShield', 'decoyDuck', 'featherArmor', 'healingPond'],
        color: '#3498db'
    },
    sniper: {
        name: 'Sniper Nest',
        powers: ['eggSniper', 'ricochetShot', 'piercingQuack', 'homingEgg'],
        color: '#9b59b6'
    },
    utility: {
        name: 'Utility Nest',
        powers: ['speedWaddle', 'nestMagnet', 'breadCrumbs'],
        color: '#2ecc71'
    },
    healing: {
        name: 'Healing Nest',
        powers: [], // Special case: eggs = HP
        color: '#f1c40f',
        isHealing: true
    }
};

// Runtime nest instances (positioned in world)
const nests = [
    { type: 'attack', x: 0, y: 0, eggs: 0, level: 0, claimed: [] },
    { type: 'defense', x: 0, y: 0, eggs: 0, level: 0, claimed: [] },
    // ... etc
];

// Generic nest interaction
function handleNestInteraction(player, nest) {
    const nestDef = NEST_TYPES[nest.type];
    
    if (nestDef.isHealing) {
        // Healing nest: instant exchange
        if (player.eggs > 0 && player.health < player.maxHealth) {
            player.eggs--;
            player.health = Math.min(player.maxHealth, player.health + 2);
        }
        return;
    }
    
    const nextPowerKey = nestDef.powers[nest.level];
    if (!nextPowerKey) return; // Maxed out
    
    const power = PowerRegistry[nextPowerKey];
    // ... claim or deposit logic
}
```

---

## Priority 5: File Organization

### Constraint: Vanilla Platform
The game is hosted on the **vanilla platform** which serves single HTML files directly. No build step, no module bundling. This means we **must keep everything in one file** for deployment.

### Recommended Approach: Well-Organized Single File

Keep the single `index.html` but reorganize with **clear section markers** and **object-based encapsulation**:

```javascript
// ============================================================
// SECTION: POWER REGISTRY
// ============================================================
const PowerRegistry = { ... };

// ============================================================
// SECTION: ENTITY SYSTEM  
// ============================================================
const EntityBehaviors = { ... };
const entities = [];
function updateEntities(dt) { ... }

// ============================================================
// SECTION: STATUS EFFECTS
// ============================================================
const StatusEffects = { ... };
function applyStatusEffect(entity, type, duration) { ... }
function updateStatusEffects(entity, dt) { ... }

// ============================================================
// SECTION: NEST SYSTEM
// ============================================================
const NEST_TYPES = { ... };
const nests = [];
function handleNestInteraction(player, nest) { ... }
```

**Benefits:**
- No build step required
- Deploys directly to vanilla platform
- Clear sections make navigation easier
- Object patterns provide encapsulation without modules

---

## Migration Strategy

### Phase A: Minimal Refactor (Before Adding Powers)
1. Extract power system into registry pattern
2. Add generic entity array for projectiles
3. Add status effect system
4. Refactor nest to support multiple types

**Estimated effort: 4-6 hours**

### Phase B: Add Powers Incrementally
With the systems in place, each power becomes:
1. Add entry to `PowerRegistry`
2. Implement `execute()` function
3. Add visual effect if needed

**Estimated effort per power: 30-60 minutes**

---

## Specific Code Smells to Address

### 1. Hardcoded Effect Arrays
```javascript
// CURRENT (fragile)
const quackBlastEffects = [];
const wingSlapEffects = [];
// ... need new array for each power

// BETTER
const visualEffects = []; // All effects in one array with type field
```

### 2. Scattered Cooldown Management
```javascript
// CURRENT (fragile)
p.quackBlastTimer -= dt;
p.wingSlapTimer -= dt;
// ... need new timer for each power

// BETTER
for (const [power, cooldown] of Object.entries(p.cooldowns)) {
    if (cooldown > 0) p.cooldowns[power] -= dt;
}
```

### 3. Manual Power Checks
```javascript
// CURRENT (fragile)
if (p.powers.quackBlast && p.quackBlastTimer <= 0) { ... }
if (p.powers.wingSlap && p.wingSlapTimer <= 0) { ... }

// BETTER
for (const powerKey of Object.keys(p.powers)) {
    if (p.powers[powerKey] && p.cooldowns[powerKey] <= 0) {
        PowerRegistry[powerKey].execute(p);
        p.cooldowns[powerKey] = PowerRegistry[powerKey].cooldown;
    }
}
```

### 4. No Damage Pipeline
```javascript
// CURRENT (no hooks for armor/invulnerability)
p.health -= enemy.damage;

// BETTER
function dealDamage(target, amount, source) {
    // Apply status effect modifiers
    for (const effect of target.statusEffects) {
        const modifier = StatusEffects[effect.type].onDamage;
        if (modifier) amount = modifier(target, amount);
    }
    if (amount > 0) target.health -= amount;
}
```

---

## Risk Assessment

| Area | Risk Without Refactor | Risk With Refactor |
|------|----------------------|-------------------|
| Adding 15 powers | HIGH - spaghetti code | LOW - systematic |
| Debugging powers | HIGH - scattered state | LOW - centralized |
| Balancing powers | MEDIUM - hunt for constants | LOW - registry |
| Status effects | HIGH - no system exists | LOW - unified system |
| Projectiles | HIGH - manual per-power | LOW - entity system |
| 5 Nest types | MEDIUM - copy/paste risk | LOW - data-driven |

---

## Recommended Next Steps

1. **Agree on scope** - Full modular refactor vs. minimal systems?
2. **Add PowerRegistry first** - Migrate existing 2 powers
3. **Add Entity system** - Start with simple projectile (Egg Bomb)
4. **Add StatusEffect system** - Start with Duck Shield
5. **Refactor Nests** - Generalize to 5 types
6. **Implement powers** - One milestone at a time

---

*Document created: 2026-01-19*
*For: Badling Brawl Phase 4 Planning*

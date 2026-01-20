# Phase 4: 3 Players & More Powers

## Overview
Expand to 3-player co-op and implement many new attack powers with variety (offensive, defensive, ranged, utility).

## Context for AI
- **Multiplayer foundation**: Already supports dynamic player join via input devices
- **Power system**: Two powers implemented (Quack Blast, Wing Slap), expand significantly
- **Commits**: Commit after each complete milestone

## Milestones

### M1: Third Player Support
- [x] Add P3 player slot
- [x] P3 uses mallard_male sprites (green head)
- [x] UI layout: P1 top-left, P2 top-right, P3 bottom-left
- [x] Test with keyboard + 2 gamepads

**Progress:**
- 3rd player support is live! P3 joins as green mallard duck, UI confirmed via screenshot. All join prompts and spawn positions work for 3 players.

### M2: Egg Bomb Power (Offensive - Area)
- [ ] Throwable egg projectile in facing direction
- [ ] Explodes on enemy contact OR after 2 seconds
- [ ] Area damage to all enemies in blast radius
- [ ] Visual: egg arc trajectory, explosion effect
- [ ] Cost: 45 eggs, Cooldown: 4s

### M3: Feather Storm Power (Offensive - Multi)
- [ ] Rapid 360° feather projectiles (8 feathers spiral outward)
- [ ] Each feather damages enemies it passes through
- [ ] Visual: swirling feather burst
- [ ] Cost: 70 eggs, Cooldown: 6s

### M4: Defensive Powers
- [ ] **Duck Shield**: Temporary invulnerability bubble (3s), can still move
  - Cost: 20 eggs, Cooldown: 10s
- [ ] **Decoy Duck**: Spawn a fake duck that enemies chase for 5s
  - Cost: 30 eggs, Cooldown: 8s
- [ ] **Feather Armor**: Reduce incoming damage by 50% for 6s
  - Cost: 45 eggs, Cooldown: 15s
- [ ] **Healing Pond**: Create a zone that heals ducks standing in it
  - Cost: 60 eggs, Cooldown: 20s

### M5: Ranged/Sniper Powers  
- [ ] **Egg Sniper**: Long range single-target high damage shot
  - Cost: 15 eggs, Cooldown: 3s
- [ ] **Ricochet Shot**: Egg bounces between up to 3 enemies
  - Cost: 30 eggs, Cooldown: 4s
- [ ] **Piercing Quack**: Quack that passes through all enemies in a line
  - Cost: 45 eggs, Cooldown: 5s
- [ ] **Homing Egg**: Slow but auto-targets nearest enemy, high damage
  - Cost: 60 eggs, Cooldown: 6s

### M6: Utility Powers
- [ ] **Nest Magnet**: Auto-collect eggs in large radius for 5s
  - Cost: 25 eggs, Cooldown: 12s
- [ ] **Speed Waddle**: Massive speed boost for 3s
  - Cost: 15 eggs, Cooldown: 8s

### M7: Healing Nest (Special)
- [ ] No powers - purely for HP recovery
- [ ] Deposit 1 egg → gain +2 HP (instant)
- [ ] Can overheal? (TBD - maybe cap at max HP)
- [ ] Strategic choice: spend eggs on powers or heal up

### M8: Multiple Nests / Power Lines
- [ ] Each nest offers a themed "line" of powers
- [ ] Players can collect ALL powers (no limit)
- [ ] Nest types (5 total):
  - **Attack Nest**: Quack Blast → Wing Slap → Egg Bomb → Feather Storm
  - **Defense Nest**: Duck Shield → Decoy Duck → Feather Armor → Healing Pond
  - **Sniper Nest**: Egg Sniper → Ricochet Shot → Piercing Quack → Homing Egg
  - **Utility Nest**: Speed Waddle → Nest Magnet → Bread Crumbs
  - **Healing Nest**: No powers, 1 egg = +2 HP
- [ ] Position nests around the home base
- [ ] Each nest has its own egg pool (except Healing which consumes instantly)

### M9: Polish & Balance
- [ ] Balance power costs and cooldowns
- [ ] Test 3-player gameplay flow
- [ ] Update game over screen for 3 players

## Power Summary Table
| Power | Nest | Cost | Cooldown | Effect |
|-------|------|------|----------|--------|
| Quack Blast | Attack | 10 | 2s | Cone damage + knockback |
| Wing Slap | Attack | 25 | 1.5s | 360° close range |
| Egg Bomb | Attack | 45 | 4s | Thrown explosive |
| Feather Storm | Attack | 70 | 6s | 8 projectiles spiral |
| Duck Shield | Defense | 20 | 10s | 3s invulnerability |
| Decoy Duck | Defense | 30 | 8s | Distract enemies 5s |
| Feather Armor | Defense | 45 | 15s | 50% damage reduction 6s |
| Healing Pond | Defense | 60 | 20s | Healing zone |
| Speed Waddle | Utility | 15 | 8s | Speed boost 3s |
| Nest Magnet | Utility | 25 | 12s | Auto-collect eggs 5s |
| Bread Crumbs | Utility | 40 | 5s | Slow zone |
| Egg Sniper | Sniper | 15 | 3s | Long range shot |
| Ricochet Shot | Sniper | 30 | 4s | Bounces 3 enemies |
| Piercing Quack | Sniper | 45 | 5s | Line damage |
| Homing Egg | Sniper | 60 | 6s | Auto-target high damage |

## Open Questions
- None currently

## Nest Placement
- All nests are **inside** the home base
- Positions TBD - will verify with screenshot

## Power Claiming Rules
- **Shared egg pool**: Any duck can deposit eggs to any nest
- **Unlock threshold**: When nest has enough eggs, next power unlocks
- **First-come claim**: Only ONE duck can claim each unlocked power
- **No take-backs**: Once claimed, power belongs to that duck
- Creates strategy: deposit for team vs. save eggs to claim yourself

## Power Lines (Nests)
| Nest | Powers (in order) | Theme |
|------|-------------------|-------|
| Attack | Quack Blast → Wing Slap → Egg Bomb → Feather Storm | Direct damage |
| Defense | Duck Shield → Decoy Duck → Feather Armor → Healing Pond | Survivability |
| Sniper | Egg Sniper → Ricochet Shot → Piercing Quack → Homing Egg | Long range |
| Utility | Speed Waddle → Nest Magnet → Bread Crumbs | Movement/control |
| Healing | (no powers) - 1 egg = +2 HP | Recovery |

## Assets Available
- **Duck sprites**: white, yellow, mallard_female, mallard_male
- P1 = white, P2 = yellow, P3 = mallard_male (green head)

---

*Status: Not Started*

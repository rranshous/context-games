# Phase 4: 3 Players & More Powers

## Overview
Expand to 3-player co-op and implement many new attack powers with variety (offensive, defensive, ranged, utility).

## Context for AI
- **Multiplayer foundation**: Already supports dynamic player join via input devices
- **Power system**: Two powers implemented (Quack Blast, Wing Slap), expand significantly
- **Commits**: Commit after each complete milestone

## Milestones

### M1: Third Player Support
- [ ] Add P3 player slot
- [ ] P3 uses mallard_male sprites (green head)
- [ ] UI layout: P1 top-left, P2 top-right, P3 bottom-left
- [ ] Test with keyboard + 2 gamepads

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
  - Cost: 30 eggs, Cooldown: 10s
- [ ] **Decoy Duck**: Spawn a fake duck that enemies chase for 5s
  - Cost: 20 eggs, Cooldown: 8s

### M5: Ranged Powers  
- [ ] **Bread Crumb Trail**: Drop crumbs that slow enemies who walk over them
  - Cost: 15 eggs, Cooldown: 5s
- [ ] **Egg Sniper**: Long range single-target high damage shot
  - Cost: 35 eggs, Cooldown: 3s

### M6: Utility Powers
- [ ] **Nest Magnet**: Auto-collect eggs in large radius for 5s
  - Cost: 25 eggs, Cooldown: 12s
- [ ] **Speed Waddle**: Massive speed boost for 3s
  - Cost: 15 eggs, Cooldown: 8s

### M7: Multiple Nests / Power Lines
- [ ] Each nest offers a themed "line" of powers
- [ ] Players can collect ALL powers (no limit)
- [ ] Nest types:
  - **Attack Nest** (existing): Quack Blast → Wing Slap → Egg Bomb → Feather Storm
  - **Defense Nest**: Duck Shield → Decoy Duck
  - **Utility Nest**: Speed Waddle → Nest Magnet → Bread Crumbs
  - **Sniper Nest**: Egg Sniper (single powerful ranged)
- [ ] Position nests around the home base
- [ ] Each nest has its own egg pool (deposit to unlock that line)

### M8: Polish & Balance
- [ ] Balance power costs and cooldowns
- [ ] Test 3-player gameplay flow
- [ ] Update game over screen for 3 players

## Power Summary Table
| Power | Type | Cost | Cooldown | Effect |
|-------|------|------|----------|--------|
| Quack Blast | Offensive-Cone | 10 | 2s | Cone damage + knockback |
| Wing Slap | Offensive-Melee | 25 | 1.5s | 360° close range |
| Egg Bomb | Offensive-Area | 45 | 4s | Thrown explosive |
| Feather Storm | Offensive-Multi | 70 | 6s | 8 projectiles spiral |
| Duck Shield | Defensive | 30 | 10s | 3s invulnerability |
| Decoy Duck | Defensive | 20 | 8s | Distract enemies 5s |
| Bread Crumbs | Control | 15 | 5s | Slow zone |
| Egg Sniper | Ranged | 35 | 3s | Long range snipe |
| Nest Magnet | Utility | 25 | 12s | Auto-collect eggs |
| Speed Waddle | Utility | 15 | 8s | Speed boost 3s |

## Open Questions
- Nest positions: corners of home base? Or scattered around map?
- Do all nests share one egg pool, or separate pools per nest?

## Power Lines (Nests)
| Nest | Powers (in order) | Theme |
|------|-------------------|-------|
| Attack | Quack Blast → Wing Slap → Egg Bomb → Feather Storm | Direct damage |
| Defense | Duck Shield → Decoy Duck | Survivability |
| Utility | Speed Waddle → Nest Magnet → Bread Crumbs | Movement/control |
| Sniper | Egg Sniper | Long range |

## Assets Available
- **Duck sprites**: white, yellow, mallard_female, mallard_male
- P1 = white, P2 = yellow, P3 = mallard_male (green head)

---

*Status: Not Started*

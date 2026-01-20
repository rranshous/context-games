# Phase 4: 3 Players & More Powers

## Overview
Expand to 3-player co-op and implement the remaining two attack powers (Egg Bomb, Feather Storm).

## Context for AI
- **Multiplayer foundation**: Already supports dynamic player join via input devices
- **Power system**: Two powers implemented (Quack Blast, Wing Slap), two placeholders remain
- **Commits**: Commit after each complete milestone

## Milestones

### M1: Third Player Support
- [ ] Add P3 player slot
- [ ] Third duck color/sprite (need to check available assets)
- [ ] UI layout for 3 players (P1 left, P3 center-bottom?, P2 right)
- [ ] Test with keyboard + 2 gamepads

### M2: Egg Bomb Power
- [ ] Design: Throwable egg that explodes on impact or after delay
- [ ] Area damage to enemies
- [ ] Visual effects (explosion, egg projectile)
- [ ] Cooldown and balance

### M3: Feather Storm Power
- [ ] Design: Temporary invulnerability + damage aura?
- [ ] Or: Rapid multi-hit attack in all directions?
- [ ] Visual effects (swirling feathers)
- [ ] Cooldown and balance

### M4: Polish & Balance
- [ ] Balance power costs (currently 10, 25, 45, 70)
- [ ] Balance cooldowns
- [ ] Test 3-player gameplay flow
- [ ] Update game over screen for 3 players

## Open Questions
- Egg Bomb: Thrown projectile or placed trap?
- Feather Storm: Defensive or offensive ability?
- Should powers be shared (one player unlocks for all) or individual?

## Assets Available
- **Duck sprites**: white, yellow, mallard_female, mallard_male
- P1 = white, P2 = yellow, P3 = mallard_male (green head)

---

*Status: Not Started*

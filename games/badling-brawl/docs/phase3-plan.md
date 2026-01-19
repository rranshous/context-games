# Phase 3: Multiplayer & Controller Support

## Overview
Add local multiplayer with Xbox controller support. Backend is already running.

## Context for AI
- **Backend**: Already running (no setup needed)
- **Testing**: Use Playwright to confirm milestones
- **Commits**: Commit after each complete milestone

## References
- [MDN Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API) - Core API for controller support

## Milestones

### M1: Controller Input Detection
- [ ] Detect connected Xbox controllers
- [ ] Map controller inputs to game actions
- [ ] Support both keyboard and controller simultaneously

### M2: Second Player
- [ ] Player 2 spawn and state
- [ ] Independent movement for P2
- [ ] Visual distinction between players

### M3: Shared Combat
- [ ] Both players can attack enemies
- [ ] Shared enemy pool
- [ ] Death/respawn for individual players

### M4: Shared Nest Economy
- [ ] Both players can deposit eggs
- [ ] Claim mechanic (first to interact)
- [ ] Powers are per-player

### M5: Polish
- [ ] Controller vibration on hits
- [ ] Split UI for both players
- [ ] Player indicators/labels

## Open Questions
- Revive mechanic for downed players?
- Shared health pool or individual?
- Can players damage each other?

---

*Status: Not Started*

# Badling Brawl - Introduction

## Overview
A couch co-op roguelite survivor game where players control ducks defending their farm from waves of predators. Inspired by Brotato, designed for 1-3 players with Xbox controllers.

## Origin
- Robby, his girlfriend, and stepson enjoy playing Brotato together on Xbox
- They live on a small farm with ducks
- Wanted a custom survivor game with a personal theme they could play together on a computer with Xbox controllers

## Theme
- **Setting**: A farm (land-based, water levels later)
- **Players**: Ducks (a group of ducks on land = "badling")
- **Enemies**: Farm predators - foxes, hawks, raccoons, weasels, etc.
- **Currency**: Eggs

## Core Concept
- Top-down arena survival
- Auto-attacking weapons (peck, quack blast)
- Waves of enemies
- Collect eggs, buy upgrades between waves
- Roguelite progression

## Target Platform
- HTML5 (Canvas)
- Vanilla platform (`/dev/badling-brawl/`)
- Xbox controller support via Gamepad API
- 1-3 players (expandable)

## Name
**Badling Brawl** (working title)

---

*Status: Introduction Complete*
*Next: Planning Phase*

---

## Session Notes - Phase 2 M2 (Home Base) - Jan 2026

### Current Work
Implementing M2: Home Base from `phase2-plan.md`

### Current Goal (Simplified)
**Simplify the boundary system:**
- Ducks can enter/exit home base from anywhere on the boundary (no entrance restrictions)
- Enemies cannot enter home base at all (blocked at boundary)
- Remove entrance/exit concept for now (may add back later)
- Get simple boundary collision working reliably first

### Problem Being Solved
The entrance-based collision was too complex and enemies were clipping through the boundary. Screenshot showed cats inside the red dotted debug line. Simplifying to: ducks free to cross, enemies blocked.

### Completed Changes
1. **Removed fallback rendering** - sprites must load, no colored circle fallbacks
2. **Home Base visual border** - rocks on bottom, water on top, alternating water/rocks on sides
3. **Tileset integration** - using `tileset - grass island v2.png` with TILE_DEFS:
   - tree, water, largeRock, largeRock2, mediumRock, bridgeH, bridgeV, etc.
4. **Bridge sprites** - using tileset bridges at entrances (vertical for top, horizontal for sides)
5. **No camping** - ducks cannot attack while inside home base

### TODO (Next Steps)
1. Simplify `isInsideHomeBase()` - remove buffer, just check rectangle bounds
2. Remove `isInEntrance()` function and all references
3. Simplify enemy collision - just block if inside home base rect
4. Remove duck boundary restrictions - free movement everywhere
5. Test that enemies stay fully outside the debug red line
6. Once working, tune visual border to match collision boundary

### Debug Features
- Red dotted line showing home base boundary rectangle (keep for testing)

### Key Code Locations
- `HOME_BASE` const: defines zone dimensions (remove entrances array)
- `isInsideHomeBase(x, y, radius)`: simplify to just rectangle check
- `drawHomeBase()`: renders border, bridges, debug line
- `updateCombat()`: has home base attack blocking (keep)
- `updatePlayer()`: remove entrance-only crossing logic
- `updateEnemies()`: simplify to just home base rect collision

### Design Decisions
- Entrances/bridges are visual only for now, not collision gates
- Ducks can cross boundary anywhere
- Enemies blocked at boundary everywhere
- Will revisit entrance restrictions later if needed


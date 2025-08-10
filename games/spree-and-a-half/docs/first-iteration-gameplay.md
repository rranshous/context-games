# First Iteration Gameplay Design

**Project:** Spree-and-a-Half  
**Phase:** Exploratory Gameplay Design  
**Date:** August 10, 2025  
**Status:** 🧪 Experimental - This is exploratory work to define our first playable iteration

## Core Gameplay Vision - Iteration 1

### Setting & Style
- **Perspective:** 2D Side-scroller  
- **Environment:** Single map/level with platforms  
- **Visual Style:** Based on available sprite sheets (swords, characters, backgrounds)  
- **Scope:** Focus on core swarm mechanics rather than multiple levels

### Player Progression
- **Start:** Single sword under player control  
- **Growth Mechanic:** Defeat enemies to collect additional swords  
- **Swarm Building:** Gradually build up from 1 → 5 → 10+ swords  
- **Visual Feedback:** Swarm becomes more impressive and powerful as it grows

### Combat System
- **Swarm-Based Combat:** All combat revolves around controlling the swarm collectively  
- **Enemy Types:**
  - **Pack Enemies:** Groups of smaller enemies that require swarm coordination  
  - **Single Strong Enemies:** Tough opponents that need concentrated swarm attacks  
  - **Mixed Encounters:** Combination of both for tactical variety

### Controls (To Experiment With)
- **Mouse:** Primary swarm direction/target (attractor point)  
- **Keyboard Modifiers:** 
  - Formation tightness (compact vs spread)
  - Attack mode (aggressive rush vs defensive positioning)  
  - Movement style (flowing vs direct)

### Level Design Elements
- **Platforms:** Vertical navigation challenges for the swarm  
- **Chokepoints:** Areas that force swarm reformation  
- **Open Areas:** Spaces where full swarm tactics can be used  
- **Enemy Spawn Points:** Strategic placement for interesting encounters

## Technical Milestones - First Iteration

### Phase 1: Single Sword Foundation ✅ COMPLETE
- [x] Basic side-scrolling environment with platforms
- [x] Single sword that follows mouse cursor
- [x] Simple collision detection (sword vs platforms)
- [x] Basic swarm flocking behavior (boids algorithm)
- [x] Multiple swords following mouse with basic flocking
- [x] Swarm physics (avoiding platform collisions)

### Phase 2: Sprite Rendering System
- [ ] Create sprite sheet loading and clipping system
- [ ] Extract individual sword sprites from composite images
- [ ] Load and display single sword sprite from sheet
- [ ] Replace simple shapes with actual sword sprites
- [ ] Sprite rotation based on movement direction

### Phase 3: Basic Enemy System
- [ ] Simple enemy entity class
- [ ] Basic enemy spawning system
- [ ] Enemy AI (simple movement patterns)
- [ ] Enemy rendering with sprite graphics

### Phase 4: Combat Foundation
- [ ] Sword-vs-enemy collision detection
- [ ] Enemy elimination mechanics
- [ ] Basic damage/health system for enemies

### Phase 5: Sword Collection & Drops
- [ ] Sword drop system when enemies are defeated
- [ ] Pickup mechanics for new swords
- [ ] Visual feedback for sword collection
- [ ] Swarm growth through combat

### Phase 6: Sword Variety & Types
- [ ] Multiple sword types from different drops
- [ ] Visual variety for different swords in swarm
- [ ] Different sword behaviors/stats (optional)

### Phase 7: Enhanced Swarm Controls
- [ ] Formation controls (keyboard modifiers)
- [ ] Attack mode vs defensive positioning
- [ ] Swarm responsiveness tuning
- [ ] Formation behavior refinements

### Phase 8: Polish & Feel
- [ ] Satisfying visual feedback for swarm movement
- [ ] Combat impact effects
- [ ] Performance optimization for larger swarms
- [ ] Sound integration (if time permits)

## Key Questions to Answer Through Play

1. **Swarm Size:** What feels like the right number of swords? (5, 10, 20?)
2. **Control Responsiveness:** How directly should the swarm follow the mouse?
3. **Combat Pacing:** Should sword collection be frequent or more strategic?
4. **Formation Behavior:** What formation controls feel most useful?
5. **Platform Navigation:** How should the swarm handle vertical movement?

## Success Criteria

**Minimum Viable Experience:**
- Player can control a growing swarm of swords
- Combat feels satisfying and swarm-based
- Sword collection creates meaningful progression
- Basic side-scrolling platformer movement works

**Stretch Goals:**
- Multiple enemy types with different swarm tactics required
- Advanced formation controls that feel intuitive
- Visual polish that makes the swarm feel alive and responsive

---

*Note: This is exploratory design work. We expect to iterate and change these ideas based on what feels fun during development.*

# Spree-and-a-Half

**Swarm-controlled sword game exploring collective behavior and emergent gameplay**

## Concept
Control a swarm of swords using keyboard and mouse input. Instead of managing a single character, you command an entire flock that moves, attacks, and responds as a collective entity.

## Status
🎯 **Status:** Phase 1 Complete - Working prototype with boids flocking  
🎮 **Published:** Not yet  
🤖 **AI:** None planned initially  
✨ **Unique:** Swarm control mechanics, collective sword behavior, experimental input schemes

## Vision
- **Collective Control:** Manage a swarm rather than individual units
- **Emergent Behavior:** Swords that exhibit flocking and coordinated movement
- **Experimental Controls:** Discover interesting ways to influence swarm behavior
- **Visual Impact:** Coordinated sword swarms creating satisfying visual patterns

## Assets Available
- Custom sword graphics for swarm entities
- NPC character art
- Background environmental assets
- Additional game elements

## Technical Approach
- **Architecture:** Simulation ↔ Presentation ↔ Input separation (Dark Hall pattern)
- **Tech Stack:** HTML5 Canvas + TypeScript + Vite
- **Core System:** Boids-based flocking with player influence layers

## Current Focus
Phase 1 Complete! Working prototype with natural swarm behavior. Ready for refinement and Phase 2 enhancements.

## What's Working Now
- **Boids flocking algorithm** creates natural swarm movement
- **Mouse control** directs swarm smoothly and responsively  
- **Dynamic swarm growth** via click-to-add mechanics
- **Platform collision detection** keeps swords above ground
- **Side-scrolling camera** follows swarm center
- **Debug visualization** shows boids influence radii

## Controls
- **Mouse:** Direct swarm movement
- **Click:** Add single sword to swarm
- **Space:** Add 3 swords at once
- **Ctrl+D:** Toggle debug mode

## Ready for Enhancement
- Replace simple shapes with actual sword sprites
- Add formation controls and keyboard modifiers
- Implement combat mechanics and enemy systems

---

*Created: August 10, 2025*

# Spree-and-a-Half: Swarm Control Sword Game

**Working Title:** Spree-and-a-Half  
**Core Concept:** Control a swarm/flock of swords using keyboard and mouse  
**Date Started:** August 10, 2025

## Initial Vision

### The Hook
- **Collective Control:** Instead of controlling a single character, you control an entire swarm of swords
- **Emergent Behavior:** The swarm should feel alive - swords that move, flow, and attack in coordinated patterns
- **Experimental Controls:** Focus on discovering interesting control schemes for swarm behavior

### Visual Assets Available
- **Player Graphics:** Really cool sword graphics (multiple variations?)
- **NPCs:** Character graphics for enemies/interactions
- **Backgrounds:** Environmental assets
- **Other Elements:** Additional game assets

## Core Questions to Explore

### Control Schemes
1. **Mouse Influence:** Does the mouse act as an attractor? Repeller? Leader sword?
2. **Keyboard Modifiers:** How do different keys change swarm behavior?
   - Formation control (tight cluster vs spread out)
   - Aggression levels (defensive vs attacking)
   - Movement patterns (flowing vs rigid)
3. **Swarm Dynamics:** 
   - Do swords follow flocking rules (separation, alignment, cohesion)?
   - Can individual swords break away and return?
   - How does the swarm respond to obstacles and enemies?

### Gameplay Mechanics
1. **Combat:** How does a sword swarm attack?
   - Individual sword strikes vs coordinated attacks
   - Area denial through positioning
   - Overwhelm enemies through numbers
2. **Objectives:** What does the player try to achieve?
   - Territory control?
   - Enemy elimination?
   - Resource gathering?
   - Puzzle solving through swarm coordination?

### Technical Approach
- **Architecture:** Follow Dark Hall pattern (Simulation ↔ Presentation ↔ Input)
- **Tech Stack:** HTML5 Canvas + TypeScript + Vite
- **Swarm AI:** Boids algorithm as starting point, with player influence layers

## Initial Experiment Goals

1. **Basic Swarm Movement:** Get a group of swords following mouse cursor
2. **Flocking Behavior:** Implement basic separation, alignment, cohesion
3. **Player Influence:** Test different ways keyboard can modify swarm behavior
4. **Visual Polish:** Make the sword swarm look and feel satisfying to control

## Next Steps

- [ ] Set up basic project structure (package.json, vite config, etc.)
- [ ] Create initial HTML + Canvas setup
- [ ] Implement basic swarm entity system
- [ ] Experiment with mouse-following behavior
- [ ] Document control experiments and findings

---

*This follows the Introduce phase of our IPI pattern. Next we'll move to detailed planning.*

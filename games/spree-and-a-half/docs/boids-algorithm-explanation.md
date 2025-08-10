# Boids Algorithm Explanation

**Context:** Technical foundation for swarm behavior in Spree-and-a-Half  
**Date:** August 10, 2025

## What is the Boids Algorithm?

The **Boids algorithm** was created by Craig Reynolds in 1986 to simulate flocking behavior of birds, fish schools, and other group animals. "Boids" = "bird-oids" (bird-like objects).

It creates emergent flocking behavior from just **3 simple rules** applied to each individual:

## The Three Core Rules

### 1. **Separation** (Avoid Crowding)
- Each sword tries to avoid getting too close to its neighbors
- Prevents swords from clustering into a single point
- Creates natural spacing within the swarm

```
If other swords are too close → steer away from them
```

### 2. **Alignment** (Follow the Crowd)
- Each sword tries to match the direction of nearby swords
- Creates coordinated movement patterns
- Makes the swarm flow together naturally

```
Look at nearby swords → try to move in their average direction
```

### 3. **Cohesion** (Stay with the Group)
- Each sword is attracted toward the center of nearby swords
- Prevents the swarm from spreading out too far
- Keeps the group together as a unit

```
Find the center of nearby swords → steer toward it
```

## How This Applies to Our Sword Swarm

### Player Influence Layer
On top of the basic boids rules, we add:
- **Mouse Attraction:** All swords are drawn toward the mouse cursor
- **Keyboard Modifiers:** Keys can strengthen/weaken different rules
  - `SHIFT` = Tighter formation (stronger cohesion)
  - `SPACE` = Spread out (stronger separation)
  - `CTRL` = Attack mode (reduced cohesion, more direct mouse following)

### Practical Implementation
```typescript
class Sword {
  applyBoids() {
    let separation = this.separate(); // Avoid crowding
    let alignment = this.align();     // Match neighbors
    let cohesion = this.cohere();     // Move toward center
    let mouseAttraction = this.seekMouse(); // Follow player input
    
    // Combine all forces
    this.velocity.add(separation);
    this.velocity.add(alignment);
    this.velocity.add(cohesion);
    this.velocity.add(mouseAttraction);
  }
}
```

## Why Boids Works Perfectly for Us

1. **Emergent Beauty:** Complex, organic-looking movement from simple rules
2. **Player Control:** The mouse can act as a "leader" that influences the whole flock
3. **Scalable:** Works with 5 swords or 50 swords
4. **Collision Friendly:** Natural spacing helps avoid platform collision issues
5. **Combat Ready:** Swarm can naturally surround and attack enemies

## Visual Examples in Nature
- **Starling murmurations:** Thousands of birds creating flowing, shifting patterns
- **Fish schools:** Coordinated movement that confuses predators
- **Insect swarms:** Collective movement toward food sources

## Customization for Gameplay
We can tune the algorithm by adjusting:
- **Range:** How far each sword "sees" its neighbors
- **Force Strength:** How strongly each rule influences movement
- **Speed:** How fast the swarm responds to changes
- **Player Override:** How much mouse input overrides natural flocking

---

*The beauty of boids is that realistic, lifelike group behavior emerges automatically from these simple rules - perfect for making our sword swarm feel alive and responsive!*

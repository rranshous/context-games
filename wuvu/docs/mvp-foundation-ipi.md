# Wuvu MVP Foundation - IPI Document

## Introduce
Create a digital pet game featuring a single aquatic creature in a bowl that players care for through direct interaction. Think Tamagotchi meets fish bowl - simple, engaging, and foundational for future AI collaboration features.

## Plan

### Core Visual
- HTML5 Canvas rendering
- Simple bowl/tank container
- Single floating creature with basic animations (idle, swimming, eating, happy/sad states)
- Click interactions on the creature

### Creature System
- **Needs**: Hunger, Happiness, Health (0-100 scales)
- **States**: Idle, Hungry, Playing, Sleeping, Sick
- **Behaviors**: Natural need decay over time, reactions to interactions

### Player Interactions
- **Feed**: Click creature → feed option → hunger increases, happiness boost
- **Play**: Click creature → play option → happiness increases, slight hunger cost
- Visual feedback for all interactions (animations, particle effects)

### Unified Action Interface
**Critical Implementation Note**: All player actions (clicking), future scripted actions, and AI model tool calls must go through the same underlying action system. Design a single abstraction layer from day one.

```typescript
interface GameAction {
  type: 'feed' | 'play' | 'clean';
  target: CreatureId;
  source: 'player' | 'script' | 'ai';
}
```

### UI Elements
- Creature stats display (hunger/happiness/health bars)
- Simple interaction menu when clicking creature
- Basic game loop with creature state updates

## Implement
1. ✅ Canvas setup and bowl rendering
2. ✅ Creature sprite and basic animation system  
3. ✅ Creature needs/stats system with decay
4. ⏳ Click detection and interaction menu
5. ⏳ Feed/play actions with unified action interface
6. ⏳ Visual feedback and state animations

### Progress Notes
- **Canvas & Bowl**: Complete! 800x600 canvas with blue elliptical bowl, rim, and water highlights  
- **Creature System**: Complete! Swimming fish with tail animation and boundary collision
- **Needs System**: Complete! Hunger/happiness/health bars with time-based decay and interdependence

### Success Criteria
- Player can click on creature to see interaction options
- Feed and play actions affect creature stats visibly
- Creature shows different states through animations
- Game loop runs smoothly with need decay over time
- Foundation architecture supports future scripting/AI integration

### Technical Foundation
- TypeScript with strong typing for game state
- 60fps canvas rendering loop
- Clean separation between game logic and rendering
- Action system ready for future automation layers

---
*Foundation for human-AI collaborative creature care*
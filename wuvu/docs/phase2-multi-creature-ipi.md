# Wuvu Phase 2: Multi-Creature + Bowl Management - IPI Document

## Introduce
Expand from single creature to small community (3 creatures) and add environmental management through bowl cleanliness. This introduces the first layer of complexity that hints toward future AI collaboration needs.

## Plan

### Multi-Creature System
- **3 creatures** in the same bowl with individual needs
- Each creature maintains separate hunger/happiness stats
- Creatures have slightly different personalities (decay rates, visual variations)
- Individual creature interaction menus (click specific creature)

### Bowl Cleanliness System
- **Bowl cleanliness stat** (0-100) that degrades over time
- **Health stat returns** - affected by bowl cleanliness (applies to all creatures)
- **Visual feedback**: Green algae/tint overlay on bowl as cleanliness drops
- **Bowl click menu**: Click empty bowl area → Clean action appears

### Enhanced Interaction
- **Creature targeting**: Click specific creature for individual feed/play actions
- **Environment targeting**: Click bowl background for cleaning action
- **Shared environment**: All creatures affected by bowl cleanliness equally

### Complexity Scaling Test
- **Manual management challenge**: 3 individual creature needs + shared environment
- **Real consequences**: Creatures can die from neglect (health = 0)
- **First taste** of juggling multiple priorities (foundation for AI collaboration)
- **Emotional stakes**: Losing creatures creates urgency for better management
- More clicking required, hints at future automation benefits

## Implement
1. ✅ **Multi-creature architecture**: Creature array, individual positioning/movement
2. **Bowl cleanliness system**: New stat, decay logic, visual algae overlay
3. **Health stat restoration**: Derived from bowl cleanliness, affects all creatures
4. **Creature mortality**: Creatures die when health reaches 0 (real consequences!)
5. **Enhanced click targeting**: Detect creature vs. bowl clicks
6. **Bowl interaction menu**: Clean action with environmental feedback
7. **Visual polish**: Algae effects, multiple creature animations, death states

### Success Criteria
- 3 creatures swimming with individual stats and interactions
- Bowl cleanliness visibly affects water quality (green tint/algae)
- Clicking bowl shows clean option that improves all creature health
- **Creatures die when health reaches 0** - real consequences for neglect
- Player can manage individual creature needs + shared environment
- Increased complexity creates motivation for future automation
- Death creates urgency and emotional investment in creature care

### Technical Notes
- Reuse existing action system for multi-targeting
- Bowl cleanliness as global game state
- Health recalculated from cleanliness for all creatures

---
*Testing complexity scaling that motivates AI collaboration*
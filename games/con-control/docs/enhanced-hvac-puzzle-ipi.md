# Enhanced HVAC Puzzle System - IPI

**Phase**: 🟡 **Introduce** 
- **Introduce**: 🚧 In Progress
- **Plan**: ⏳ Pending
- **Implement**: ⏳ Pending

## **Introduce**

### **Problem Statement**
The current HVAC system in con-control is too simplistic and breaks the puzzle progression flow:

1. **Single Action Solution**: AI just calls `hvac_control` with `power_cycle` → instant success
2. **No Discovery Phase**: Unlike the power puzzle, there's no research/exploration required
3. **Missing Challenge**: The step from power restoration to door opening lacks meaningful complexity
4. **Breaks Pattern**: Power puzzle has Discovery→Research→Experimentation→Solution, HVAC doesn't

### **Current HVAC Flow**
```
Power Online → hvac_control tool unlocks → AI calls power_cycle → Done
```

### **Target HVAC Flow** 
```
Power Online → atmospheric_sensors unlocks → Discovery: Hull breaches found
            ↓
Research: Read AtmosphereGuardian manual → Learn breach repair procedures  
            ↓
Experimentation: Try different repair sequences → Some fail, some work
            ↓
Solution: Correct breach repair order + atmospheric rebalancing → Success
```

### **Design Goals**
- **Maintain Discovery Pattern**: AI must explore and research to understand the problem
- **Multi-Stage Complexity**: Multiple tools and steps required, not single action
- **Failure States**: Wrong sequences should have consequences (like power feedback loops)
- **Research Rewards**: Reading documentation should provide critical information
- **Linear Progression**: Clear power→HVAC→door dependency chain

### **User Experience Impact**
- **Current**: "That was too easy, AI figured it out immediately"  
- **Target**: "Watching Claude work through the atmospheric restoration was fascinating"

## **Scope & Constraints**

### **In Scope**
- New atmospheric diagnostic tools
- Multi-stage hull breach repair system
- Enhanced atmospheric rebalancing procedures
- New ship documentation for AtmosphereGuardian 3000™
- Failure states and safety lockouts
- Integration with existing power→door progression

### **Out of Scope** 
- Changes to power puzzle system (working well)
- Door opening mechanics (working well)
- UI/UX changes (focus on backend puzzle logic)
- New ship systems beyond atmospheric

### **Technical Constraints**
- Must integrate with existing game state management
- Must follow established tool progression pattern
- Must maintain save/restart functionality
- Must not break existing power puzzle flow

---

*Next: Plan phase will detail the specific tool implementations, documentation content, and integration approach.*

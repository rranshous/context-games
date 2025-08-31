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
Power Online → atmospheric_sensors + email_access unlocks → Discovery: Atmosphere issues found
            ↓
Research: Read email chains about captain's atmospheric complaints → Learn trial/error process  
            ↓
Experimentation: Try different atmospheric settings → Some fail, some work, some cause cascading failures
            ↓
Solution: Correct atmospheric configuration based on email evidence → Success
```

### **Design Goals**
- **Maintain Discovery Pattern**: AI must explore and research to understand the problem
- **Email-Based Research**: Power restoration unlocks ship email access with atmospheric complaints
- **Narrative Puzzle**: Reconstruct captain's atmospheric preferences from scattered email evidence
- **Multi-Stage Complexity**: Multiple atmospheric parameters requiring careful tuning
- **Failure States**: Wrong configurations trigger cascading failures (potentially affecting power!)
- **Signal/Noise Challenge**: Later milestone adds email noise to make discovery harder
- **Research Rewards**: Reading email chains provides critical configuration clues

### **User Experience Impact**
- **Current**: "That was too easy, AI figured it out immediately"  
- **Target**: "Watching Claude work through the atmospheric restoration was fascinating"

## **Scope & Constraints**

### **In Scope**
- New atmospheric diagnostic tools
- Email access system unlocked by power restoration
- Email chain narrative about captain's atmospheric complaints
- Multi-parameter atmospheric tuning system (temperature, humidity, pressure, etc.)
- Cascading failure states that can affect power systems
- Integration with existing power→door progression

**Future Milestones**:
- **Signal/Noise Enhancement**: Add non-critical emails to dilute signal
- **Email Fragmentation**: Break up critical email chains across different folders/dates
- **Cascading Failure System**: Wrong atmospheric configs trigger power disconnection

### **Out of Scope** 
- Changes to power puzzle system (working well)
- Door opening mechanics (working well)  
- UI/UX changes (focus on backend puzzle logic)
- Full email system overhaul (just atmospheric-related emails initially)

### **Technical Constraints**
- Must integrate with existing game state management
- Must follow established tool progression pattern
- Must maintain save/restart functionality
- Must not break existing power puzzle flow

---

*Next: Plan phase will detail the specific tool implementations, documentation content, and integration approach.*

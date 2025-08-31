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

## **Implementation Milestones**

### **Milestone 1: Add Email Chain Documentation**
**Goal**: Just add the captain atmospheric complaints email chain to ship files
- Create `/crew_communications/emails/` directory in ship file system
- Write 3-4 email chain between captain, chief engineer, and atmospheric tech
- Include back-and-forth about temperature, humidity, pressure adjustments  
- Make emails discoverable via existing `file_storage` tool
- **No game mechanics changes** - purely additive content

### **Milestone 2: Rename hvac_control to atmospheric_control**
**Goal**: Simple tool rename for better consistency
- Rename `hvac_control` tool to `atmospheric_control`
- Update tool description to match new name
- **No functionality changes** - pure rename
- Existing `power_cycle` action still works exactly the same

### **Milestone 3: Add Fine-Tuning Actions to atmospheric_control** 
**Goal**: Expand tool capabilities while keeping existing puzzle working
- Add new actions: `set_temperature`, `set_humidity`, `set_pressure`
- Add parameters for specific values (e.g., temperature: 22.5, humidity: 58%)
- **Keep `power_cycle` action** - still solves puzzle as before
- New actions available but not required yet

### **Milestone 4: Change Puzzle Mechanics to Require Email-Based Settings**
**Goal**: Make email research necessary instead of simple power_cycle
- Remove `power_cycle` as automatic solution
- Require specific temperature/humidity/pressure values from email chain
- Add atmospheric sensors that show current vs target values
- Puzzle now requires reading emails to find the captain's final preferences

### **Milestone 5: Add Atmospheric Failure States**
**Goal**: Wrong settings have consequences
- Add warnings for dangerous configurations
- Implement temporary lockouts for extreme settings
- Add oxygen consumption penalties
- Multiple failure modes but still recoverable

### **Milestone 6: Add Cascading Power Failure**
**Goal**: Extreme errors affect power system
- Specific dangerous combinations disconnect power grid
- Player must re-solve both power AND atmospheric puzzles
- Creates high-stakes experimentation

---

*Next: Plan phase will detail the specific tool implementations, email content examples, and technical integration approach.*

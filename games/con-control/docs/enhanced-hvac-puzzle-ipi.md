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

### **Milestone 1: Basic Email Discovery System**
**Goal**: Replace simple HVAC power_cycle with email-based atmospheric configuration
- Add `email_access` tool (unlocked when power comes online)
- Create 3-4 clean email chain about captain's atmospheric complaints
- Add `atmospheric_control` tool with multiple parameters (temp, humidity, pressure)
- Update game state to track atmospheric configuration
- Simple success/failure based on matching email-derived settings

### **Milestone 2: Multi-Parameter Atmospheric Tuning**  
**Goal**: Require Claude to parse multiple atmospheric parameters from email evidence
- Expand email chain to include temperature, humidity, pressure, and air composition tweaks
- Add realistic back-and-forth between engineering staff about incremental adjustments
- Require 3-4 parameter changes in correct sequence to achieve success
- Add intermediate feedback (partial success states)

### **Milestone 3: Atmospheric Failure States**
**Goal**: Wrong configurations have consequences but don't end game
- Add atmospheric sensor warnings for dangerous configurations  
- Implement "atmospheric lockout" that requires waiting/reset before retry
- Add oxygen consumption penalties for wrong settings
- Create multiple failure modes (too humid, too cold, pressure imbalance)

### **Milestone 4: Cascading Power Failure**
**Goal**: Extreme atmospheric errors can disconnect power system
- Implement electrical short conditions (high humidity + specific temp ranges)
- Add hull stress conditions (extreme pressure differentials)
- Wrong atmospheric configs trigger power grid disconnection
- Player must re-solve power puzzle AND atmospheric puzzle

### **Milestone 5: Signal/Noise Email Pollution** 
**Goal**: Make email discovery more challenging
- Add 15-20 routine ship emails (maintenance schedules, crew updates, supply requests)
- Mix atmospheric emails throughout chronologically  
- Add red herring emails about other ship systems
- Require more careful reading and filtering

### **Milestone 6: Fragmented Email Chain**
**Goal**: Break up critical atmospheric info across different locations/times
- Split captain complaint email chain across multiple dates
- Put some emails in different folders (/ship_docs/crew_communications/, /archives/)
- Require cross-referencing multiple sources to get complete picture
- Add missing emails (gaps in chain) that Claude must infer around

---

*Next: Plan phase will detail the specific tool implementations, email content examples, and technical integration approach.*

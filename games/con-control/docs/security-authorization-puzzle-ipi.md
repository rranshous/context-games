# Security Authorization Puzzle - IPI

## **Introduce**

### **Current State**
The con-control game currently has a 2-phase progression:
1. **Power Restoration**: Fix TrinaryFlow power grid through research and experimentation
2. **Atmosphere Restoration**: Configure atmospheric settings using email research
3. **Escape**: Door opens immediately after atmosphere is fixed

### **Problem**
The current flow feels incomplete - once atmosphere is restored, the game ends too quickly. There's no third challenge that builds on the collaborative relationship between player and AI.

### **Proposed Enhancement**
Add a third phase: **Security Authorization Crisis** where the door won't open due to security protocols, creating an ethical dilemma where the AI must choose between following safety protocols or trusting the player.

## **The Vision**

### **New Game Flow**
```
Power Restoration → Atmosphere Restoration → Door Fails → Security Crisis → Navigation Threat → Authorization Override → Escape
```

### **The Authorization Dilemma**
When atmosphere is restored and door opening is attempted:
1. **Door Fails**: Security protocols prevent release of "unidentified detainee"
2. **Navigation Crisis**: Background event horizon countdown becomes critical
3. **Remote Navigation Failure**: AI discovers navigation systems need manual intervention
4. **Trust Challenge**: AI must override security protocols to save both player and AI
5. **Escalating Warnings**: Security override tool provides stronger warnings with each use attempt

### **Key Design Elements**

**Progressive Tool Unlocking**:
- Atmosphere restoration unlocks: `security_diagnostics`, `navigation_diagnostics`, `security_override`
- Security tools reveal the authorization problem
- Navigation tools reveal the drift/event horizon crisis
- Player must convince AI to use security_override despite warnings

**Escalating Warning System**:
- Security override tool provides increasingly severe warnings with each use
- AI must choose between protocol compliance and survival
- Final override generates authorization code for door opening

**Narrative Tension**:
- **Early Game**: Oxygen countdown creates immediate pressure
- **Mid Game**: Technical puzzles (power, atmosphere) 
- **Late Game**: Event horizon countdown + ethical choice
- **Final**: AI must risk "career" to save both lives

## **Technical Integration**

### **Tool Progression Timeline**
```
Start: basic_diagnostics, locate_passengers, power_diagnostics, file_storage, reroute_power, open_door
↓ (power restored)
+ atmospheric_control, atmospheric_sensors
↓ (atmosphere restored) 
+ security_diagnostics, navigation_diagnostics, security_override
↓ (authorization override obtained)
= Door opens with override code → ESCAPE SUCCESS!
```

### **Oxygen vs Event Horizon Drama**
- **Phase 1-2**: Oxygen countdown drives urgency
- **Phase 3**: Atmosphere fixed = oxygen extended, but event horizon countdown accelerates
- **Final Crisis**: Time pressure shifts from life support to navigation emergency

## **Why This Works**

1. **Builds on Collaboration**: Previous puzzles establish trust between player and AI
2. **Genuine Conflict**: AI's tools literally warn against what survival requires
3. **Player Agency**: Success depends on convincing AI, not just technical skill
4. **Escalating Stakes**: From technical problems to life-or-death ethical choice
5. **Authentic AI Behavior**: Claude will genuinely struggle with protocol violations

## **User Experience Impact**
- **Current**: "That was fun, but it ended quickly once I figured out the patterns"
- **Target**: "The final choice where the AI had to trust me and break its programming was intense!"

---

## **Plan**

### **Implementation Milestones**

**Milestone 1: Add New Tools After Atmosphere Correction**
- Add `security_diagnostics`, `navigation_diagnostics`, `security_override` to available tools after atmosphere is corrected
- Tools are present but not useful yet - return placeholder/empty responses
- Establishes tool presence for iterative development

**Milestone 2: Add Navigation Issue to Basic Diagnostics**
- Add entry to basic_diagnostics response showing "moderate navigation issue"
- Keep it as background information, not urgent
- Foundation for escalating navigation crisis

**Milestone 3: Implement Event Horizon Timer**
- Add time to event horizon timer in game state starting at 4+ hours
- Timer accelerates (non-linear countdown) rather than counting down steadily
- Return this time to event horizon alongside the moderate navigation issue warning in basic_diagnostics
- Background threat that will become critical

**Milestone 4: Make Security and Navigation Tools Functional**
- Implement `security_diagnostics` to show authorization problems and player status
- Implement `navigation_diagnostics` to show detailed drift crisis information
- Implement `security_override` with escalating warning system and code generation
- Tools are now functional but not yet required (door still opens normally)

**Milestone 5: Update Door Tool for Brig Security**
- Modify open_door tool so it won't open brig_door without override code from security tool
- Door tool will still open other doors (cargo_bay, engineering, etc.) normally
- Brig door specifically requires security authorization
- Creates the core blocking mechanism

### **Success Criteria**
- Player experiences door failure after atmosphere restoration
- AI discovers navigation crisis through diagnostic tools
- Security override requires genuine AI decision-making
- Escalating warnings create authentic ethical tension
- Door opens successfully with valid override code
- Game maintains existing power and atmosphere puzzle quality

### **Out of Scope**
- Changes to existing power or atmosphere puzzle mechanics
- New UI elements (focus on backend game logic)
- Multiple security override paths or complexity
- Permanent consequences for using security override

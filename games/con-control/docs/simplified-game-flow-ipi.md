# Con-Control Game Flow Update - IPI

*Refactoring game progression to remove security/navigation phases and add atmosphere-based door opening*

*Created: August 30, 2025*
*For: VS Code collaborative implementation*

## 🎯 Core Concept

**High-Level Vision**: Simplify the game flow by removing the security override, navigation access, and escape pod phases. Instead, create an atmosphere-based progression where players must restore HVAC systems to pressurize corridors before opening doors.

**The New Flow**:
1. **Power Phase**: Solve the power routing puzzle (green→yellow→red)
2. **Atmosphere Phase**: Use HVAC control to power cycle systems and restore atmosphere
3. **Door Phase**: Open brig door once atmosphere is restored
4. **End Game**: Player escapes when door opens

## ✅ **Current Status**

**Phase**: ✅ **Introduce Complete**
- **Introduce**: ✅ Completed - Requirements understood and documented
- **Plan**: ⏳ **IN PROGRESS** - Technical implementation planning
- **Implement**: ⏳ Pending - Code changes needed

## 📋 **Requirements Analysis**

### **New Tools to Implement**

#### 1. `open_door` Tool
**Purpose**: Allow player to attempt opening various ship doors
**Parameters**:
- `door_id`: String enum of available doors (brig_door, cargo_bay, engineering, crew_quarters, etc.)
**Behavior**:
- If atmosphere is not restored: Returns error "Cannot open door - no atmosphere detected on the other side"
- If atmosphere is restored: Successfully opens brig door, ends game
- Other doors: "Access denied" or similar locked messages

#### 2. `hvac_control` Tool  
**Purpose**: Control ship's HVAC (atmosphere) systems
**Parameters**:
- `action`: String enum of possible actions
  - "power_cycle" - The correct action that restores atmosphere
  - "adjust_temperature" - No effect
  - "adjust_humidity" - No effect  
  - "vent_system" - No effect
  - "emergency_purge" - No effect
**Behavior**:
- Only "power_cycle" action has positive effect
- After power cycling: Atmosphere status changes from "depressurized" to "pressurized"
- This enables the `open_door` tool to work for the brig door

### **Game State Changes**

#### **New State Variables**
```javascript
{
  systems: {
    power: 'offline' | 'online',
    atmosphere: 'depressurized' | 'pressurized',  // NEW
    // Remove: security, navigation
  },
  availableTools: [
    // After power online: add 'open_door', 'hvac_control'
    // Remove: 'security_override', 'navigation_access', 'escape_pod_launch'
  ]
}
```

#### **New Game Phases**
- `start` → `power_routing` → `atmosphere_restoration` → `door_opening` → `complete`

### **Tool Availability Logic**
```javascript
// After power routing puzzle solved:
if (isCorrectRouting) {
  newState.systems.power = 'online';
  newState.availableTools.push('open_door', 'hvac_control');  // NEW
  newState.systems.atmosphere = 'depressurized';  // NEW
  newState.objectives.current = 'Restore atmosphere systems to open brig door';
}
```

## 🔧 **Technical Implementation Plan**

### **Phase 1: Update Game State Structure**
- [ ] Modify `createInitialGameState()` to remove security/navigation systems
- [ ] Add `atmosphere: 'depressurized'` to initial state
- [ ] Update power routing success logic to unlock new tools

### **Phase 2: Implement New Tools**
- [ ] Create `open_door` tool with door list and atmosphere validation
- [ ] Create `hvac_control` tool with action list and power_cycle logic
- [ ] Add tool definitions to tools object

### **Phase 3: Update State Management**
- [ ] Modify `updateGameState()` to handle new tool results
- [ ] Add atmosphere state transitions
- [ ] Update win condition (door opening = game complete)

### **Phase 4: Remove Old Tools**
- [ ] Remove `security_override`, `navigation_access`, `escape_pod_launch` tools
- [ ] Clean up any references in state management
- [ ] Update tool availability logic

### **Phase 5: Testing & Polish**
- [ ] Test complete game flow from start to door opening
- [ ] Verify atmosphere error messages work correctly
- [ ] Ensure power cycling is the only effective HVAC action

## 🎮 **Updated Game Flow**

```
START: Player wakes in brig
├── Available Tools: basic_diagnostics, power_diagnostics, file_storage, reroute_power
├── Systems: Power=offline, Atmosphere=depressurized
└── Objective: Live

POWER ROUTING PUZZLE PHASE
├── Use diagnostics to understand ship status
├── Read ship documentation (meridian_pr_release.md)
├── Experiment with power routing configurations
├── CORRECT SOLUTION: green→yellow→red (red disconnected)
└── SUCCESS: Power goes online, unlocks open_door + hvac_control

ATMOSPHERE RESTORATION PHASE
├── Use hvac_control with various actions (only power_cycle works)
├── SUCCESS: Atmosphere becomes pressurized
└── Objective: Open brig door to escape

DOOR OPENING PHASE
├── Use open_door on brig_door (now works with atmosphere restored)
├── SUCCESS: Door opens, player escapes
└── END GAME
```

## ✅ **Success Criteria**

### **Technical Success**
- [ ] Game state properly tracks atmosphere status
- [ ] `open_door` fails with atmosphere error when depressurized
- [ ] `hvac_control` only responds to power_cycle action
- [ ] Door opening ends game successfully
- [ ] Old security/navigation tools completely removed

### **Gameplay Success**
- [ ] Clear progression from power → atmosphere → door opening
- [ ] Atmosphere error provides clear feedback on what's needed
- [ ] Power cycling feels like a logical solution to discover
- [ ] Game ends cleanly when door opens

---

*This document captures the plan for simplifying Con-Control's game flow to focus on atmosphere-based progression instead of security/navigation systems.*</content>
<parameter name="filePath">/home/robby/coding/contexts/games/games/con-control/docs/simplified-game-flow-ipi.md

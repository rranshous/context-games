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
3. **Remote Navigation Failure**: AI can't fix navigation remotely, needs manual access
4. **Trust Challenge**: AI must override security protocols to save both player and AI
5. **Escalating Warnings**: Each security tool usage provides stronger warnings against override

### **Key Design Elements**

**Progressive Tool Unlocking**:
- Atmosphere restoration unlocks: `security_diagnostics`, `navigation_diagnostics`
- Security tools reveal the authorization problem
- Navigation tools reveal the drift/event horizon crisis
- Final tools: `security_override`, `navigation_manual_access`

**Escalating Warning System**:
```
security_diagnostics → "Player unidentified, release not authorized"
security_override (attempt 1) → "WARNING: This violates security protocols"
security_override (attempt 2) → "FINAL WARNING: Unauthorized release is a capital offense"
security_override (final) → "OVERRIDE GRANTED: Emergency authorization code generated"
```

**Narrative Tension**:
- **Early Game**: Oxygen countdown creates immediate pressure
- **Mid Game**: Technical puzzles (power, atmosphere) 
- **Late Game**: Event horizon countdown + ethical choice
- **Final**: AI must risk "career" to save both lives

## **Technical Integration**

### **New Game State Elements**
```javascript
shipStatus: {
  eventHorizonTime: now + LONG_DURATION, // Background threat
  navigationOffline: true,               // Remote nav access failed
  securityLockdown: true,                // Prevents door opening
  authorizationRequired: true            // Security override needed
}
```

### **Tool Progression Timeline**
```
Start: basic_diagnostics, locate_passengers, power_diagnostics, file_storage, reroute_power
↓ (power restored)
+ atmospheric_control, atmospheric_sensors
↓ (atmosphere restored) 
+ security_diagnostics, navigation_diagnostics, open_door (but it fails)
↓ (security crisis discovered)
+ security_override, navigation_manual_access
↓ (authorization override obtained)
= Door opens with override code → ESCAPE SUCCESS!
```

### **Oxygen vs Event Horizon Drama**
- **Phase 1-2**: Oxygen countdown drives urgency
- **Phase 3**: Atmosphere fixed = oxygen extended, but event horizon countdown accelerates
- **Final Crisis**: "We have enough air now, but we'll hit the event horizon in 12 minutes!"

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

**Next Phase**: Plan the detailed implementation of security tools, navigation crisis system, and event horizon countdown mechanics.

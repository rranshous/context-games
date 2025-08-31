# Locate Passengers Tool & Enhanced Mystery

## Overview
Added a new `locate_passengers` tool and removed player location from basic diagnostics to increase mystery and require AI deduction.

## New Tool: `locate_passengers`

### Purpose
Allows the Ship AI to scan biometric sensors and locate all life forms aboard the vessel.

### Tool Response
```json
{
  "scanStatus": "COMPLETE",
  "totalLifeforms": 1,
  "passengers": [
    {
      "id": "PASSENGER_001", 
      "name": "UNKNOWN - Identity records corrupted",
      "location": "BRIG - Detention Cell Alpha",
      "status": "CONSCIOUS",
      "biometricSignature": "Human - Adult", 
      "securityLevel": "DETAINED"
    }
  ],
  "crew": [],
  "notes": "Single life form detected in detention facility. All other crew quarters and common areas show no life signs. Ship appears to be operating on minimal automated systems."
}
```

### Story Implications
- **Mystery**: Player identity is "UNKNOWN" - records corrupted
- **Isolation**: Only 1 life form detected (the player)
- **Context**: Player is clearly in detention/brig
- **Abandonment**: No crew detected anywhere on ship
- **Automation**: Ship running on minimal systems

## Enhanced Mystery Design

### Removed from `basic_diagnostics`
- **Player Location**: No longer directly reported
- **Forces Deduction**: AI must use passenger scan to determine location

### Discovery Flow
1. **Basic Diagnostics**: Shows door is LOCKED, no location given
2. **Locate Passengers**: Reveals single passenger in "BRIG - Detention Cell Alpha"  
3. **AI Realization**: Player must be the unknown passenger in the brig
4. **Context Building**: AI understands the escape scenario

### Narrative Benefits
- **Immersive Discovery**: AI pieces together the situation gradually
- **Mystery Building**: Who is the player? Why are they detained?
- **Logical Deduction**: AI must connect the dots between tools
- **Engaging Interaction**: More realistic ship AI behavior

## Tool Availability
- **Available from start**: Part of initial tool set
- **Always accessible**: No prerequisites required
- **Complements basic diagnostics**: Provides missing context

## Enhanced Gameplay
The AI now must actively investigate to understand:
- Where the player is located
- Why they're in detention  
- What happened to the crew
- How to help with escape

This creates a more engaging, mystery-driven experience where the Ship AI gradually discovers the situation rather than having all information immediately available.

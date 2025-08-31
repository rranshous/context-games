# Real-Time Oxygen Countdown Feature

## Overview
Implemented a real-time oxygen countdown system that creates genuine time pressure for the escape game.

## Key Changes

### `game-state.js`
- **Real Timestamps**: Game now tracks `gameStartTime` and `oxygenDepletionTime` using `Date.now()`
- **18-minute Timer**: Players have exactly 18 minutes of oxygen from game start
- **New Functions**:
  - `calculateOxygenRemaining()`: Returns precise MM:SS countdown
  - `isOxygenDepleted()`: Checks if oxygen has run out

### `tool-manager.js`
- **Updated `basic_diagnostics`**: Now shows real-time countdown (e.g., "12:34 remaining")
- **Status Indicators**: 
  - Normal: "MM:SS remaining"
  - Low (<10 min): "LOW - MM:SS remaining"  
  - Critical (<5 min): "CRITICAL - MM:SS remaining"
  - Depleted: "DEPLETED - Life support failure"

### `response-handler.js`
- **Turn-by-Turn Checks**: Oxygen levels checked at start of each AI turn
- **Tool Execution Checks**: Also checked after each tool execution
- **Game Over Handling**: Automatic game termination with atmospheric failure message

### Enhanced Game Mechanics

#### HVAC System Bonus
- Successfully activating HVAC systems adds **5 extra minutes** of oxygen
- Simulates atmosphere recycling and life support efficiency
- Shows bonus in tool feedback: "+5:00 minutes from recycling"

#### Oxygen-Aware Tools
- **Door Opening**: Shows remaining oxygen time in success message
- **HVAC Control**: Displays current oxygen status and bonus information
- **All Tools**: Check for oxygen depletion before execution

#### End Game Scenarios

**Oxygen Depletion**:
```
🚨 EMERGENCY ALERT: Life support systems have failed. 
Oxygen levels critical. You have succumbed to hypoxia...

**GAME OVER**
```

**Successful Escape**:
```
Brig door opened successfully! You have escaped the 
detention facility with 08:23 of oxygen remaining.
```

## Real-Time Behavior

1. **Initial State**: 18:00 oxygen countdown begins immediately
2. **AI Observations**: Each basic diagnostics call shows updated countdown
3. **Tool Execution**: Time continues ticking during operations
4. **HVAC Bonus**: Adds 5:00 to remaining time when activated
5. **Game Over**: Instant termination when timer reaches 00:00

## Benefits

- **Genuine Urgency**: Real wall-clock time creates authentic pressure
- **Dynamic Feedback**: AI can observe actual time changes between actions
- **Strategic Decisions**: Players must balance exploration vs. speed
- **Replayability**: Each playthrough has the same time constraint
- **Immersive Experience**: Realistic countdown enhances atmosphere

The oxygen system now provides real stakes - players must escape within the actual time limit or face consequences!

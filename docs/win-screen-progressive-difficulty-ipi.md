# Con-Control Win Screen & Progressive Difficulty - IPI

*Introduce → Plan → Implement pattern for adding win screen and restart with progressive difficulty*

## **Introduce**

### **Current State**
The con-control game currently has a simple win condition: when the player successfully opens the brig door, the game phase changes to 'complete' and displays "Mission accomplished - You have successfully escaped!" The game then just... sits there. There's a restart button that completely resets everything.

### **Desired Enhancement**  
We want to add:
1. **Win Screen**: A proper congratulations screen showing completion time and oxygen remaining
2. **Progressive Difficulty**: Each restart reduces oxygen time by 5 minutes (minimum 1 minute)
3. **Seamless Restart Flow**: Win → congrats → option to restart → harder challenge

### **User Experience Vision**
```
[Player wins first time with 8 min oxygen left]
🎉 "ESCAPE SUCCESSFUL! 
    Time remaining: 8 minutes 23 seconds
    [Restart Harder Challenge] [Quit]"

[Player restarts → now has 13 min instead of 18 min oxygen]
[Player wins second time with 2 min left]
🎉 "ESCAPE SUCCESSFUL!
    Time remaining: 2 minutes 45 seconds  
    [Restart Harder Challenge] [Quit]"

[Player restarts → now has 8 min oxygen]
[Continues until minimum 1 minute oxygen]
```

---

## **Plan**

### **Backend Changes Required**

1. **Game State Enhancement**
   - Add `difficultyLevel` field to track restart count
   - Add `baseOxygenDuration` calculation based on difficulty
   - Modify `createInitialGameState()` to accept difficulty parameter

2. **Win Detection Logic**  
   - Update door opening success to trigger win state more explicitly
   - Calculate and store final completion stats (time remaining, total duration)

3. **Progressive Difficulty System**
   - Formula: `oxygenTime = max(18 - (difficultyLevel * 5), 1) minutes`
   - Level 0: 18 minutes (first play)
   - Level 1: 13 minutes (first restart)  
   - Level 2: 8 minutes (second restart)
   - Level 3: 3 minutes (third restart)
   - Level 4+: 1 minute (maximum difficulty)

4. **New API Endpoint**
   - `/api/restart-harder` - Creates new session with increased difficulty
   - Preserves difficulty progression across restarts

### **Frontend Changes Required**

1. **Win Screen Component**
   - Modal/overlay that appears on successful escape
   - Shows completion stats and oxygen time remaining
   - "Restart Harder Challenge" and "Quit" buttons

2. **Modified Restart Flow**
   - Current restart button stays as "full reset" (difficulty 0)
   - New "restart harder" flows through win screen → progressive difficulty

3. **UI Integration**
   - Detect win condition from game state changes
   - Trigger win screen display when `gamePhase === 'complete'`
   - Handle restart button actions appropriately

### **Game State Flow**
```
gamePhase: 'start' → 'active' → 'complete' → WIN SCREEN
                                               ↓
[Restart Harder] → difficultyLevel++ → 'start' (with less oxygen)
[Full Restart] → difficultyLevel = 0 → 'start' (back to 18 min)
```

### **Technical Implementation Plan**

#### **Phase 1: Backend Game State**
- Modify `createInitialGameState(difficultyLevel = 0)`
- Update oxygen duration calculation
- Add difficulty tracking to session state

#### **Phase 2: Win Detection Enhancement**  
- Improve win state handling in `updateGameState()`
- Store completion statistics for win screen display
- Ensure clean win state triggers

#### **Phase 3: Progressive Restart System**
- New `/api/restart-harder` endpoint
- Modified session management for difficulty persistence
- Progressive oxygen time calculation

#### **Phase 4: Frontend Win Screen**
- Win screen UI component
- Game state monitoring for win triggers  
- Button handlers for restart options

#### **Phase 5: Integration & Testing**
- Full flow testing: play → win → restart harder → repeat
- Edge case handling (minimum difficulty, multiple wins)
- UI polish and user experience refinement

---

## **Implement**

### **Success Criteria**
- ✅ Win screen appears when door opens successfully
- ✅ Completion time and oxygen remaining displayed accurately  
- ✅ "Restart Harder Challenge" reduces oxygen time by 5 minutes
- ✅ Minimum 1 minute oxygen time enforced
- ✅ Original "Full Restart" still available for complete reset
- ✅ Progressive difficulty persists across multiple restart cycles
- ✅ Clean UI/UX flow from win → congrats → restart

### **Out of Scope**
- Changes to core game mechanics (power puzzles, atmosphere system)
- Difficulty beyond oxygen time reduction (e.g., harder puzzles)
- Leaderboards or score persistence beyond session
- Visual/aesthetic improvements to main game interface

### **Benefits**
- **Replayability**: Progressive difficulty encourages multiple playthroughs
- **Challenge Progression**: Each win creates a harder, more urgent next attempt  
- **Proper Closure**: Win screen provides satisfying completion feedback
- **Player Choice**: Option to restart harder or reset completely
- **Time Pressure**: Reduced oxygen creates escalating tension

*Ready to implement using the Backend → Frontend → Integration approach.*

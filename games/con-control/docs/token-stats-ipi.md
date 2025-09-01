# Token Statistics Enhancement - IPI

## Introduce

The con-control game currently tracks basic completion metrics (oxygen remaining, mission time, difficulty level) on the winning screen. We want to extend this to include token usage statistics to encourage players to optimize their communication efficiency with the Ship AI.

### Current State
- Win screen shows: oxygen time, total mission time, difficulty level
- No tracking of AI conversation efficiency metrics

### Desired Enhancement
Add communication efficiency metrics to the existing optimization framework:
- **Total Token Count**: Complete conversation token usage (input + output)
- **User Input Character Count**: Total characters in user messages (precise measurement)
- **Efficiency Score**: Multi-dimensional rating incorporating time, oxygen, and communication efficiency

This creates a rich optimization puzzle where players can pursue different strategies:
- Speed runs (minimize time)
- Oxygen conservation (careful resource management)  
- Token efficiency (precise communication)
- Balanced optimization (best overall score)

### Player Optimization Goals
1. **Speed**: Complete escape in minimal time
2. **Oxygen Efficiency**: Maximize remaining oxygen (time pressure management)
3. **Token Efficiency**: Complete escape with lowest total token count
4. **Communication Precision**: Minimize user input character count (be concise, strategic)
5. **Multi-objective Optimization**: Balance all metrics for overall efficiency

## Plan

### Phase 1: Token Tracking Implementation
1. **Add communication tracking to game state**
   - Track total tokens (input + output)
   - Track user input character count (precise measurement)
   - Works seamlessly with both voice and text input

2. **Integrate with existing cost tracking**
   - Leverage existing cost display system
   - Extend session tracking to include token counts

### Phase 2: Win Screen Enhancement
1. **Add new stat displays**
   - Total Token Count
   - User Input Character Count

### Phase 3: Efficiency Score
1. **Compute overall efficiency rating**
   - Multi-dimensional score incorporating time, oxygen, tokens, and character count
   - Display efficiency score on win screen

## Implement

### Technical Changes Required

#### 1. Game State Extensions
- Add `totalTokens` and `userInputCharCount` to game tracking
- Integrate with existing cost calculation system
- Character counting works for both voice transcription and text input

#### 2. Win Screen Updates
- Add communication statistics to win stats display alongside existing metrics
- Ensure stats are prominently displayed and easy to read

#### 3. Efficiency Score Calculation
- Develop algorithm to combine time, oxygen, tokens, and character metrics
- Display overall efficiency score on win screen
- Balance scoring to make all optimization strategies viable

### Success Criteria
- [ ] **Phase 1**: Total tokens and user character count accurately tracked throughout game
- [ ] **Phase 2**: Win screen displays all metrics clearly: time, oxygen, tokens, character count
- [ ] **Phase 2**: New stats integrate seamlessly with existing win screen layout
- [ ] **Phase 3**: Efficiency score algorithm balances all metrics meaningfully
- [ ] **Phase 3**: Overall efficiency score encourages multiple optimization strategies

### Future Considerations
- Real-time token/character counters during gameplay
- Achievement system for efficiency milestones
- Comparative stats across multiple playthroughs
- Difficulty scaling based on token limits

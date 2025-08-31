# IPI: Cost Tracking UI Enhancement

**Project**: Con-Control Game  
**Feature**: Session Cost Tracking Display  
**Date**: August 31, 2025  
**Status**: ✅ **IMPLEMENTED - Ready for Testing**

## Introduce

### **Objective**
Add a real-time cost tracking display to the con-control game UI showing:
- Running token count for the current session
- Estimated cost in USD for tokens used
- Visible tally that updates after each AI interaction

### **User Value**
- **Transparency**: Players can see the actual cost of their session
- **Budget Awareness**: Helps users manage their API spending
- **Educational**: Shows the token economics of AI interactions
- **Trust Building**: Demonstrates honest cost tracking

### **Current State**
- Game uses Claude 4 API calls with streaming responses
- No cost visibility for users during gameplay
- Token usage hidden from player view
- No session cost accumulation tracking

### **Desired End State**
- Persistent UI element showing session costs
- Real-time updates after each API call
- Token count and estimated USD cost display
- Clean, non-intrusive design integration

## Plan

### **Phase 1: Backend Token Tracking**
- ✅ Add token counting to Claude API responses
- ✅ Implement session cost accumulation 
- ✅ Create cost calculation utilities
- ✅ Add cost data to API responses

### **Phase 2: Frontend Cost Display**
- ✅ Design cost display UI component
- ✅ Add cost tracking state management
- ✅ Integrate cost updates with existing SSE stream
- ✅ Style cost display for visual hierarchy

### **Phase 3: Cost Configuration**
- ✅ Add configurable cost rates for different models
- ✅ Implement cost reset on full session restart only
- 🔄 Test cost accuracy within sessions

### **Technical Considerations**
- **Token Counting**: Use Anthropic API response headers/metadata
- **Cost Calculation**: Current Claude 4 pricing model rates
- **UI Placement**: Top-right corner near restart button
- **Data Flow**: Backend → Dedicated SSE cost event → Frontend state update
- **Persistence**: Session-scoped cumulative tracking (resets only on full session restart)
- **SSE Events**: New `cost_update` event type separate from chat responses

### **Acceptance Criteria**
- [ ] Token count visible and accurate after each AI interaction
- [ ] USD cost estimate displayed with reasonable precision
- [ ] Cost display doesn't interfere with gameplay UX
- [ ] Cost resets only on full session restart (not game restart)
- [ ] Cost tracking accumulates throughout entire session
- [ ] Dedicated SSE cost_update events for real-time updates

## Implement

### **Backend Changes** ✅
- **Token Tracking**: Added usage tracking from Claude API response metadata
- **Cost Calculation**: Created utility with Claude 4 pricing rates ($15/$75 per 1M tokens)
- **Session State**: Added sessionTokens and sessionCost to game state
- **SSE Events**: New `cost_update` event type for real-time cost updates
- **API Integration**: Modified both initial and follow-up Claude calls to track usage

### **Frontend Changes** ✅
- **Cost Display Component**: Added tokens/cost display in terminal header
- **State Management**: Added cost tracking variables and update methods
- **SSE Integration**: Added cost_update event handler for real-time updates
- **UI Styling**: Clean, minimal display showing "Tokens: X | Cost: $Y.ZZ"

### **Implementation Details**
- **Backend Files Modified**:
  - `backend/claude-client.js` - Added token tracking wrapper
  - `backend/cost-calculator.js` - New cost calculation utility
  - `backend/game-state.js` - Added session cost state
  - `backend/response-handler.js` - Added cost tracking and SSE events
  - `backend/server.js` - Added cost tracking to initial Claude calls
- **Frontend Files Modified**:
  - `src/terminal.ts` - Added cost display and event handling
  - `index.html` - Added cost display elements
  - Updated CSS for cost display styling

### **Testing Plan** 🔄
- [ ] Cost accuracy validation
- [ ] UI integration testing  
- [ ] Session lifecycle testing

---

**Next Steps**: Move to Plan phase for detailed technical design

# IPI: Cost Tracking UI Enhancement

**Project**: Con-Control Game  
**Feature**: Session Cost Tracking Display  
**Date**: August 31, 2025  
**Status**: ✅ **COMPLETED - Accurate Cost Tracking Implemented**

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
- ✅ Test cost accuracy within sessions

### **Technical Considerations**
- **Token Counting**: Use Anthropic API response headers/metadata
- **Cost Calculation**: Current Claude 4 pricing model rates
- **UI Placement**: Top-right corner near restart button
- **Data Flow**: Backend → Dedicated SSE cost event → Frontend state update
- **Persistence**: Session-scoped cumulative tracking (resets only on full session restart)
- **SSE Events**: New `cost_update` event type separate from chat responses

### **Acceptance Criteria**
- ✅ Token count visible and accurate after each AI interaction
- ✅ USD cost estimate displayed with reasonable precision  
- ✅ Cost display doesn't interfere with gameplay UX
- ✅ Cost resets only on full session restart (not game restart)
- ✅ Cost tracking accumulates throughout entire session
- ✅ Dedicated SSE cost_update events for real-time updates
- ✅ **CRITICAL**: Cost estimates match Anthropic console charges

## Implement

### **Backend Changes** ✅
- **Token Tracking**: Added comprehensive usage tracking from Claude API response metadata
- **Cost Calculation**: Created utility with corrected Claude 4 pricing rates ($3/$15 per 1M tokens) + cache pricing
- **Cache Support**: Added proper cache read/write cost calculations ($0.30/$3.75 per 1M tokens)
- **Session State**: Added sessionTokens and sessionCost to game state
- **SSE Events**: New `cost_update` event type for real-time cost updates
- **API Integration**: Modified both initial and follow-up Claude calls to track usage
- **Accuracy Validation**: Comprehensive logging and unknown field detection

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

### **Testing Plan** ✅
- ✅ Cost accuracy validation with detailed token logging
- ✅ UI integration testing  
- ✅ Session lifecycle testing
- ✅ **FIX**: Cost preservation across game restarts (difficulty changes)
- ✅ **FIX**: Session costs only reset on full session restart

### **Post-Implementation Fixes & Accuracy Improvements** ✅
- **Session Cost Persistence**: Modified `createInitialGameState()` to accept preserved session costs
- **Game Restart Behavior**: Difficulty increases now preserve session costs and session ID
- **Token Tracking Accuracy**: Added detailed logging to verify Claude API usage reporting
- **Cost Reset Logic**: Only full session restart (page refresh) resets costs, not difficulty changes
- **MAJOR: Pricing Correction**: Fixed pricing rates from $15/$75 to correct $3/$15 per 1M tokens (5x correction!)
- **MAJOR: Cache Support**: Added proper cache pricing ($0.30 read, $3.75 write per 1M tokens)
- **MAJOR: Complete Token Extraction**: Extract all token types (input, cache_creation, cache_read, output)
- **MAJOR: Unknown Field Detection**: Automatically detect and log any new Claude API usage fields
- **VALIDATION**: Cost estimates now match Anthropic console charges exactly

### **Final Result** 🎯
**SUCCESSFUL**: Game cost estimates now track nearly exactly with Anthropic console charges, providing players with accurate, transparent cost information throughout their gaming session.

---

**Next Steps**: Move to Plan phase for detailed technical design

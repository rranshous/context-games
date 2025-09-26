# Wuvu Phase 3A: AI Assist Agent - IPI Document

## Introduce
Implement the first **AI Agent** - the "AI Assist Agent" that silently helps manage creature care. This introduces **agents as a core concept** and establishes the foundation for user-defined agents in future phases.

## Plan

### AI Assist Agent System
- **Agent toggle button** - "AI Assist Agent: ON/OFF" 
- **Agent status indicator** - clear visual when agent is active vs. dormant
- **Agent prompt visibility** - let players see/understand the agent's instructions
- **No configuration** - hardcoded behavior for this first agent (future: user-defined agents)
- **Player maintains control** - can override or disable agent at any time

### Agent Action Integration  
- **Same action interface** - Agent uses `executeAction()` with `source: 'ai-assist-agent'`
- **Agent observes game state** - creature stats, bowl cleanliness, time pressure
- **Agent takes actions** - feed, play, clean through unified system
- **Token budget system** - limit agent LLM calls to control costs

### Agent Loop & Tool Integration
- **Small input context** - current game state summary (creature stats, cleanliness)
- **Tool-based actions** - Agent calls `executeAction` tool directly (no text parsing)
- **Ollama local inference** - Using ollama-js SDK with tool support
- **Token burn management** - fixed update frequency (every 15-20 seconds)
- **Agent transparency** - players can see what actions the agent takes and why
- **Tool definition**: `executeAction({type: 'feed'|'play'|'clean', target: string})`

### Basic Automation Patterns
- **Silent autopilot** - AI takes routine maintenance actions without communication
- **Simple rules** - Feed when hunger < 20, clean when cleanliness < 30
- **No coordination** - AI and player work independently (may duplicate efforts)
- **Pure background help** - Like "auto-save" but for creature care

**Note: This is intentionally basic** - no AI-human communication, suggestions, or negotiation. Just automated assistance to test the technical foundation.

## Implement
1. **Agent system foundation** - Agent base class, registration, lifecycle management
2. **AI Assist Agent implementation** - Hardcoded first agent with creature care prompt
3. **Ollama integration** - ollama-js SDK with tool support for local inference
4. **Tool definition** - Wire `executeAction` function as ollama tool
5. **Game state serialization** - Convert current state to compact agent-readable format
6. **Agent decision loop** - Periodic agent evaluation (fixed intervals, not configurable yet)
7. **Agent UI controls** - Toggle switch, agent status indicator, prompt viewer
8. **Tool execution** - Agent calls `executeAction` tool directly, same validation as player actions

### Success Criteria
- **Agent concept established** - players understand they're working with an "AI Assist Agent"
- Agent can successfully feed/play/clean creatures using same action system  
- Token usage stays within reasonable bounds (max burn rate > necessary rate)
- Players can enable/disable agent seamlessly with toggle button
- **Agent transparency** - players can see what the agent does (actions taken, reasoning)
- Agent demonstrates helpful background behavior (feeds hungry creatures, cleans dirty bowl)
- Agent actions show in same feedback system as player actions (`source: 'ai-assist-agent'`)
- **Architecture ready** for future user-defined agents with custom prompts/behaviors

### Technical Notes
- **Tool-first design** - `executeAction` exposed as ollama tool, not text parsing
- **Local inference** - ollama running locally, no external API costs
- **Same validation** - Agent tool calls go through identical `executeAction({type, target, source: 'ai-assist-agent'})` system
- **Clean architecture** - Agent gets game state, calls tools, no response parsing needed
- **Example tool call**: `executeAction({type: 'feed', target: 'creature2'})`

---
*Phase 3A: Establish agent architecture with first hardcoded AI Assist Agent*
*Future phases: user-defined agents, agent-to-agent communication, collaborative agents*
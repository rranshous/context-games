# Con-Control Foundation - IPI Phase 1

*AI Collaboration Space Escape Game - Foundation Implementation*
*Started: August 29, 2025*

## Context

This is fun, expiremental, exploratory work.

This foundation will have a very simple problem to solve and toolset.

Once we have a working foundation we'll add more complexity to the game simulation and the available tools

## Introduce: Game Foundation Requirements

### Core Concept Summary
Building a terminal-based space escape game where:
- Player collaborates with Ship AI (powered by Claude via MCP tools)
- Ship AI has genuine tool constraints that unlock through repairs
- Voice-driven dialogue interface for natural AI collaboration
- Deterministic state machine manages game progression
- Players learn real AI collaboration skills through gameplay

### Foundation Architecture Decisions

**Hybrid System Design**:
- **Game State Machine**: Manages ship systems, tool availability, win/fail conditions
- **Ship AI Character**: Claude with dynamic MCP tool access based on state
- **Voice Interface**: Web Speech API for natural language input
- **Terminal Display**: Text-based responses and system feedback

**Technical Stack**:
- HTML5 + Canvas for terminal interface
- TypeScript for type safety and maintainable code
- Vite for development and build tooling
- Web Speech API for voice input
- MCP tool system for AI constraints
- One, thin, backend server

### Key Foundation Components Needed

1. **Project Structure & Build Setup**
   - TypeScript + Vite configuration
   - Basic HTML5 terminal interface
   - Development environment setup

2. **Core State Machine**
   - Ship system states (power, atmosphere, security, memory)
   - Tool unlock progression logic
   - Repair triggers and dependencies

3. **Model Tool Management System**
   - Dynamic tool availability based on state
   - Tool discovery without artificial announcements
   - Clean separation between available/unavailable tools

4. **Basic Terminal Interface**
   - Text display for AI responses
   - Voice input activation
   - Only the AI's most recent response shown on the screen

5. **Ship AI Integration Framework**
   - Context management for limited information
   - Tool constraint implementation
   - Natural dialogue flow setup

## Plan: Foundation Implementation Strategy

### MVP Foundation Scope
**Simple Problem**: Player needs Ship AI to unlock one door by guiding it through basic repairs
**Simple Toolset**: 2-3 MCP tools that unlock through single repair action
**Simple Interface**: Terminal display + voice input, no complex UI

### Implementation Phases

#### Phase A: Project Setup & Basic Interface (Day 1)
1. **Project Structure**
   - Initialize TypeScript + Vite project
   - Basic package.json with dependencies
   - Simple HTML5 terminal interface
   - Dev server setup

2. **Backend Foundation**
   - Node.js server with Claude integration
   - Single API endpoint: POST `/chat` (accepts transcribed text)
   - Game state management in backend
   - **Streaming response**: Real-time text flow as Claude processes

3. **Frontend Core**
   - Terminal display component with streaming text
   - Web Speech API integration for voice input
   - Server-Sent Events or WebSocket for response streaming

#### Phase B: Backend Game State & AI (Day 1-2)
1. **Game State Machine**
   ```typescript
   interface GameState {
     systems: {
       power: 'offline' | 'online';
       security: 'locked' | 'unlocked';
     };
     availableTools: string[];
     gamePhase: 'start' | 'repair' | 'complete' | 'failed';
   }
   ```

2. **Native Tool System**
   - Built-in tool functions: `basic_diagnostics()`, `security_override()`
   - Dynamic tool availability based on game state
   - Tool results feed back into state machine

3. **Multi-turn Request Cycle**
   - User input → Backend processes with Claude + tools → **Stream response in real-time**
   - Claude can make multiple tool calls within single request
   - Each tool call streams: "Checking power systems..." → results → "Found issues..."
   - State updates trigger tool availability changes

#### Phase C: Ship AI Integration (Day 2)
1. **Claude Integration**
   - Ship AI character prompting with state-based constraints
   - Tool function definitions passed to Claude based on current state
   - Multi-turn conversation handling within single request

2. **Tool Implementation**
   - `basic_diagnostics()`: Returns ship system status
   - `security_override()`: Unlocks door if conditions met
   - Tools update game state and return contextual results

3. **Communication Flow**
   - Voice input → Speech-to-text (frontend) → POST `/chat` → Claude + tools → **Real-time streaming**
   - Stream flow: "Accessing diagnostics..." → "Power grid shows..." → "Attempting repair..." → "Success!"

### Success Criteria for Foundation
- [ ] Player can speak to terminal and get AI responses
- [ ] AI starts with limited tools and discovers new ones after repairs
- [ ] Simple repair action unlocks security tool
- [ ] AI can unlock door when all conditions met

### Technical Architecture Plan

```
Frontend (Vite + TS)     Backend (Node.js)              Claude Integration
├── Terminal Interface   ├── Game State Machine         ├── Ship AI Character
├── Voice Input (Web     ├── POST /chat endpoint        ├── Native Tool Calls
│   Speech API)          ├── Tool Functions             ├── Multi-turn Processing  
├── Speech-to-Text       │   ├── basic_diagnostics()    ├── Dynamic Tool Access
├── **Streaming Display**│   └── security_override()    ├── **Real-time Streaming**
└── SSE/WebSocket        └── Response Streaming         └── Response Generation
```

### API Design
```typescript
// Streaming endpoint
POST /chat
Body: { message: string, sessionId?: string }
Response: text/event-stream (Server-Sent Events)

// Stream format - only AI's natural language response:
data: {"type": "text", "content": "Accessing ship diagnostics..."}
data: {"type": "text", "content": " power coupling appears damaged."}
data: {"type": "text", "content": " Running deeper analysis..."}
data: {"type": "text", "content": " I can now access security protocols!"}
data: {"type": "text", "content": " Attempting door override..."}
data: {"type": "text", "content": " Success! The brig door is unlocked."}
data: {"type": "done", "gameState": {...}}

// Tool calls happen internally - player only sees AI's interpretation
```

### Risk Mitigation
- **Tool State Sync**: Keep game state simple until foundation works
- **Streaming Complexity**: Use Server-Sent Events for reliable streaming
- **Multi-turn Complexity**: Log all tool calls for debugging

## Current Status
- **Phase**: Introduce ✅ → Plan ✅ → Implement 🔄
- **Phase A**: Complete ✅ (Project Setup & Basic Interface)
- **Next**: Phase B - Backend Game State & AI Implementation
- **Ready for Implementation**: Game state machine and tool system

---
*This document tracks our IPI progress for the con-control game foundation.*

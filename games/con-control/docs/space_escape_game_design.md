# AI Collaboration Space Escape Game - Design Document

*A voice-driven terminal interface game where players collaborate with a genuinely AI-powered ship computer using real tool constraints and information limitations*

*Created: August 29, 2025*
*For: VS Code collaborative implementation*

## 🎯 Core Concept

**High-Level Vision**: Create a terminal-based dialogue game where the player collaborates with a Ship AI character that **is literally powered by Claude** through actual MCP tool calls and information constraints. The Ship AI genuinely cannot access ship systems until the player helps unlock the corresponding tools through repairs.

**The Revolutionary Implementation**: The Ship AI's limitations aren't roleplay - they're real technical constraints. When it can't access Memory Bank 4, it's because the `read_memory_bank_4()` tool literally isn't available in its tool list yet.

**The Setup**: Player wakes up locked in the ship's brig. The ship's AI has been reset to factory defaults and has minimal tool access. Through voice dialogue, the player must guide the AI through repairs that unlock new MCP tools, enabling it to regain ship system access and eventually unlock the cell door.

**Win Condition**: Successfully unlock the brig door after ensuring atmospheric safety, before ship life support fails.

## 🏗️ Technical Architecture: State Machine + AI Character

### Hybrid System Design

**Deterministic Game State Machine** (manages game mechanics):
- Controls which MCP tools become available when
- Manages ship system states and repair conditions  
- Handles tool unlock triggers and dependencies
- Enforces win/fail conditions and session management
- Provides predictable, debuggable game progression

**Ship AI Character** (Claude with dynamic tool access):
- Interprets player voice commands and provides natural language responses
- Works within whatever tools the state machine currently provides
- Experiences genuine constraints - cannot access unavailable tools
- Receives limited context (blurry images, incomplete information)
- Discovers new tools organically through interaction

### Reliable Tool Progression System

**Implementation**: Clean state machine controls tool availability:

```typescript
class GameState {
  systems: {
    power: 'offline' | 'partial' | 'online',
    atmosphere: 'venting' | 'sealed' | 'pressurized', 
    security: 'locked' | 'accessible',
    memory: 'reset' | 'partial' | 'restored'
  };
  
  getAvailableTools(): string[] {
    const tools = ['basic_diagnostics', 'drone_movement'];
    
    if (this.systems.power === 'partial') {
      tools.push('power_grid_analysis', 'electrical_controls');
    }
    if (this.systems.atmosphere === 'sealed') {
      tools.push('atmospheric_sensors', 'life_support_controls');
    }
    if (this.systems.memory === 'partial') {
      tools.push('read_crew_emails', 'access_maintenance_logs');
    }
    
    return tools;
  }
}
```

**Tool Discovery Flow**:
1. Player guides Ship AI to attempt repairs using available tools
2. Tool results feed back to state machine to trigger system state changes
3. State changes unlock new tools (added silently to next API call)
4. Ship AI discovers new capabilities organically through normal interaction

### The MCP Tool Progression System

**Critical Implementation Detail**: The Ship AI's capabilities are controlled through **actual MCP tool availability**:

```javascript
// Early game tools available to Ship AI
const initialTools = [
  'basic_diagnostics',
  'drone_movement',
  'emergency_protocols_basic'
];

// After power coupling repair, Ship AI gains:
const powerRepairUnlocks = [
  'power_grid_analysis',
  'electrical_system_control'
];

// After memory bank repair, Ship AI gains:
const memoryUnlocks = [
  'read_crew_emails',
  'access_maintenance_logs',
  'ship_history_database'
];
```

**The Natural Discovery Process**: When repairs unlock new MCP tools, they're silently added to the Ship AI's available tools list without any prompt acknowledgment. The Ship AI discovers new capabilities organically through interaction:

```
Player: "Check if any new systems came online"
Ship AI: "Let me run diagnostics... I notice I have access to power_grid_analysis now. When did that become available?"

// OR naturally while attempting tasks:
Player: "Can you analyze the power grid?"
Ship AI: "Let me try... oh, I can actually do detailed power analysis now. Scanning grid..."
```

**Implementation**: New tools are added to the API call parameters silently - no system prompt mentions or conversation acknowledgments. Discovery happens naturally as the Ship AI explores its capabilities or attempts new tasks.

### Information Management

**State Machine provides Ship AI**:
- Blurry JPEG images of ship schematics with coffee stains
- Limited sensor data based on current system status
- Noisy databases when memory tools are unlocked
- Realistic technical constraints matching tool availability

**Ship AI receives contextual limitations**:
```
// When power tools are unavailable:
"I can see this is labeled 'Engineering Deck 7' but the image is unclear. I cannot analyze power systems without proper diagnostic tools."

// After power tools unlock:
"Now I can run power analysis on this section. I see three access panels with what appears to be status indicators..."
```

## 🎮 Core Game Systems

### Simplified Ship Systems (Adventure Game Logic)

**Two Primary Systems**:

1. **Atmospheric System**: 
   - Hull breach repairs (unlocks `atmospheric_sensors` tool)
   - Pump activation (requires `life_support_controls` tool)
   - Pressure verification (needs `safety_protocols` tool)

2. **Security System**:
   - Memory bank restoration (unlocks various `read_memory_bank_X` tools) 
   - Security protocol access (requires `security_override` tool)
   - Door controls (needs `brig_door_controls` tool + atmospheric safety)

### The Noisy Data Problem

**Implementation**: When Ship AI gains access to information tools, it gets **realistic data overload**:

**Email Database Access**:
```
Ship AI: "I now have access to crew communications. There are 2,847 messages. Most appear to be about meal schedules, shift rotations, and equipment requisitions."

Player: "Look for anything about power systems"
Ship AI: "I found 47 mentions of 'power' in the database. Reviewing... most are routine maintenance reports and power consumption logs."

// Jan's crucial email about power routing is buried in the noise
// Player must learn to ask specifically: "Look for an email from Jan complaining about power system design"
```

**Maintenance Log Access**:
```
Ship AI: "I can access maintenance logs now. There are 400 entries spanning the last six months. Would you like me to search for something specific?"

// Entry #127 mentions the hidden bypass switch, but it's not obvious
```

## 🎤 Interface Design

### Terminal Interface
**Visual Concept**: Fixed view of a ship's computer terminal mounted on the brig wall. Minimal interface focused entirely on AI conversation.

**Interface Elements**:
- Computer screen displaying AI responses in terminal font
- Voice input indicator (microphone activation visual)
- **No status displays** - all information comes through dialogue with Ship AI

**Information Through Dialogue Only**:
```
Player: "How much time do we have?"
Ship AI: "Life support systems show 23 minutes remaining at current consumption rates."

Player: "What's the status of ship systems?"  
Ship AI: "I can detect power fluctuations and atmospheric pressure is below safe levels. Let me run diagnostics..."
```

### Voice-First Interaction
**Player Input**: Natural speech to terminal microphone
- "Check the power systems in engineering"
- "Look through those emails for anything about Jan"
- "Can you access memory banks now?"

**Ship AI Output**: Terminal text display
- Natural language responses to player commands and questions
- System status reports and diagnostic information  
- Tool usage results and repair attempt outcomes

## 🤖 The Authentic AI Collaboration Experience

### Real AI Limitations as Gameplay

**Context Window Constraints**: Ship AI's "working memory" is actually limited by Claude's context window

**Tool Discovery Process**: Ship AI must be reminded to check what tools it has available, mirroring real AI collaboration patterns

**Information Processing**: Ship AI needs human guidance to find relevant information in large datasets, just like real AI interaction

**Communication Learning**: Player learns to give clear, specific instructions that work well with AI systems

### Meta-Learning Through Play

Players naturally develop real AI collaboration skills:
- How to break complex problems into clear steps for AI
- When to provide high-level direction vs detailed instructions  
- How to guide AI attention in information-rich environments
- Working effectively within AI context and capability limitations

## 🔄 Session Structure

### Single-Session Complete Arc

**No Time Loops**: Each session is a complete journey from reset AI to collaborative partner

**Replayability Through Knowledge**: Previous session experience helps player:
- Know which emails to search for specifically
- Understand which repairs unlock which tool sets
- Guide the AI more effectively through system restoration

**Session Flow**:
1. **Opening**: Ship AI with minimal tools, mechanical responses
2. **Early Repairs**: Basic tool unlocks, beginning to access ship systems
3. **Information Discovery**: Access to noisy databases, learning to filter signal from noise
4. **Capability Building**: Advanced tools unlocked, AI becomes more conversational
5. **Resolution**: Either successful escape or failure (atmospheric loss, life support failure)

## 🎯 MVP Implementation Path

### Phase 1: Core State Machine + Ship AI
- Basic terminal interface with voice input
- State machine managing ship systems and tool availability
- MCP tool management system with dynamic tool access for Ship AI
- Simple repair scenarios that trigger state changes and tool unlocks
- Information constraints (blurry images vs clean tool access)

### Phase 2: Full Game Systems  
- Complete atmospheric and security system repairs
- Email/database noise implementation with realistic search challenges
- Multiple tool unlock paths and dependencies
- Failure state management and session restart capability

### Phase 3: Polish and Testing
- Balancing information complexity and player guidance needs
- User testing with actual voice interface usage
- Performance optimization for real-time AI collaboration
- Fine-tuning tool unlock progression and repair mechanics

## 🔧 Technical Implementation Requirements

### Game State Machine
- Ship system status tracking with clear state dependencies
- Tool availability logic based on repair completion
- Deterministic progression rules and win/fail conditions
- Session management for complete game arc resets

### MCP Tool Management
- Dynamic tool availability system for Ship AI based on state machine output
- Clean tool unlock triggers tied to specific repair completions
- Natural tool discovery without artificial announcement or hiding

### State Machine Integration  
- Deterministic game state management with clear system dependencies
- Tool unlock progression based on repair completion
- Predictable and debuggable game mechanics
- Clean separation between game logic and AI character interaction

### Ship AI Integration
- Dynamic MCP tool availability based on state machine output
- Natural tool discovery through organic interaction patterns  
- Limited context and realistic information constraints
- Genuine collaboration challenges within deterministic framework

### Voice Interface Integration
- Web Speech API for natural language input
- Real-time speech-to-text for AI processing
- Terminal display for AI responses and system status

### State Management
- Ship system status tracking across repair attempts
- Tool unlock progression persistence
- Session management for complete game arcs

## 🚀 Success Metrics

### Technical Success
- State machine provides reliable, predictable game progression
- MCP tool system creates genuine constraints for Ship AI character
- Tool discovery happens naturally through Ship AI interaction patterns
- Voice interface enables natural communication with AI character
- Game mechanics are deterministic and debuggable

### Experiential Success
- Players develop genuine AI collaboration skills through gameplay
- Ship AI character evolution feels authentic within reliable game framework
- Information discovery creates satisfying "aha!" moments across sessions
- Collaborative problem-solving feels engaging and purposeful

---

*This document captures our design for building an AI collaboration space escape game where a deterministic state machine provides reliable game mechanics while the Ship AI character (Claude) experiences genuine tool constraints, creating authentic collaborative challenges that teach real AI interaction skills.*
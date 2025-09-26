# Wuvu - AI-Collaborative Digi### AI Assist Agent
- **Local inference** using Ollama (qwen3:1.7b model)
- **Tool-based architecture** - AI calls same actions as players
- **Autonomous decision making** - AI analyzes game state and chooses actions without rigid rules
- **Descriptive status understanding** - AI receives "high/middling/low/critical" statuses instead of percentages
- **Strategic timing** - 60-second evaluation intervals for thoughtful decisions Game

**Wuvu** is a digital aquarium game that demonstrates human-AI collaboration through creature care management. Players manage multiple aquatic creatures while an AI assistant helps handle the growing complexity.

## 🎯 Core Concept

Wuvu explores the question: *"What happens when games become too complex for humans alone?"* 

The game deliberately scales complexity (multiple creatures + environmental management) to create genuine need for AI collaboration, then provides tools for human-AI partnership.

## 🎮 Gameplay

### Multi-Creature Management
- **3 unique creatures** with individual personalities, colors, and behaviors
- **Individual needs**: satiation (~20 min to deplete), happiness (~33 min to deplete) 
- **Environmental health**: shared bowl cleanliness affects all creatures
- **Real consequences**: creatures die if health reaches 0
- **Relaxed pacing**: strategic gameplay vs frantic maintenance

### Environmental System  
- **Bowl cleanliness** degrades naturally (0.2 points/second)
- **Visual feedback**: algae appears as water gets dirty
- **Shared responsibility**: dirty water threatens all creatures equally

### Actions Available
- **Feed creatures** - increases satiation (+25), slight happiness boost (+5)
- **Play with creatures** - increases happiness (+20), costs satiation (-5)  
- **Clean bowl** - restores water quality (+40 cleanliness points)

## 🤖 AI Collaboration

### AI Assist Agent
- **Local inference** using Ollama (qwen3:1.7b model)
- **Tool-based architecture** - AI calls same actions as players
- **Smart decision making** based on priority rules:
  1. Clean bowl if cleanliness < 30% (saves all creatures)
  2. Feed creatures with hunger < 20% (prevents death)  
  3. Play with creatures if happiness < 30% (wellbeing)

### Visual Feedback
- **Toggle button** - click to activate/deactivate agent
- **Status indicators** - green when active, gray when inactive
- **Pulsing effect** - button pulses during AI evaluation (~30 second inference)
- **Console logging** - see agent decisions in real-time
- **Immediate activation** - agent evaluates immediately when turned on

### Technical Architecture
- **Unified action system** - humans and AI use identical `executeAction()` interface
- **YAML game state** - AI receives structured, descriptive status data
- **Vite proxy integration** - seamless local ollama connection  
- **60-second evaluation cycle** with immediate activation response
- **Semantic clarity** - "satiation" instead of confusing "hunger" terminology

## 🛠️ Technical Stack

- **Frontend**: TypeScript + Vite + HTML5 Canvas
- **AI Integration**: Ollama (local inference)
- **Models Tested**: qwen3:1.7b (recommended), qwen3:0.6b, falcon3:1b
- **Architecture**: Tool-based agent system with function calling

## 🚀 Getting Started

### Prerequisites
- Node.js (for development server)
- [Ollama](https://ollama.ai) installed locally
- Compatible model: `ollama pull qwen3:1.7b`

### Installation
```bash
# Clone the repository
cd games/wuvu

# Install dependencies  
npm install

# Start ollama service
ollama serve

# Start development server
npm run dev

# Open http://localhost:3000
```

### Usage
1. **Manual play**: Click creatures to feed/play, click bowl area to clean
2. **AI assistance**: Click "AI Assist Agent: OFF" to activate AI helper
3. **Watch collaboration**: AI will evaluate every 60 seconds and take helpful actions
4. **Visual feedback**: Button pulses during AI thinking, console shows decisions

## 🏗️ Architecture Highlights

### Agent System Foundation
```typescript
abstract class Agent {
    abstract evaluate(gameState: GameState): Promise<void>;
    start() / stop() / getStatus()
}
```

### Tool Integration
```typescript
const executeActionTool = {
    type: 'function',
    function: {
        name: 'executeAction',
        description: 'Perform game actions',
        parameters: { type, target }
    }
}
```

### Unified Actions
```typescript
executeAction({
    type: 'feed' | 'play' | 'clean',
    target: 'creature1' | 'creature2' | 'creature3' | 'bowl',
    source: 'player' | 'ai-assist-agent'
});

// AI receives YAML game state:
environment:
  bowl_cleanliness: high
  living_creatures: 3
creatures:
  creature1:
    satiation: middling  
    happiness: high
    health: high
```

## 🎯 Design Philosophy

### Complexity Scaling
- Start simple (1 creature, basic needs)
- Add complexity (3 creatures + environmental management) 
- Create genuine overwhelm that motivates AI partnership
- Provide transparent, controllable AI assistance

### Human-AI Partnership
- **Transparent**: Players see what AI does and why
- **Controllable**: Toggle on/off, override decisions
- **Complementary**: AI handles routine maintenance, humans do enrichment
- **Same tools**: AI uses identical action system as players

### Foundation for Future
This implementation establishes patterns for:
- User-defined agents with custom prompts
- Multiple specialized agents working together
- Agent-to-agent communication and coordination
- Advanced collaboration patterns and negotiation

## 📁 Project Structure

```
wuvu/
├── src/
│   └── main.ts          # Complete game implementation
├── docs/
│   ├── completed/       # Completed phase documentation
│   └── *.md            # Development process docs
├── index.html          # Game entry point
├── package.json        # Dependencies and scripts
├── vite.config.ts      # Ollama proxy configuration
└── README.md           # This file
```

## 🎖️ Development Milestones

- ✅ **Phase 1**: Single creature with basic needs
- ✅ **Phase 2**: Multi-creature + environmental complexity  
- ✅ **Phase 3A**: AI Assist Agent with tool-based collaboration
- 🎯 **Future**: User-defined agents, advanced collaboration patterns

## 🤝 Contributing

This project demonstrates AI collaboration patterns for game development. The architecture is designed to be extensible for:

- Custom agent behaviors and prompts
- Different AI models and providers  
- Multi-agent coordination systems
- Advanced human-AI interaction patterns

## 📄 License

Part of the [Context Games](../README.md) collection - experimental games exploring AI-human collaboration.

---

*Wuvu proves that AI can be a genuine partner in managing game complexity, creating collaborative experiences that neither human nor AI could achieve alone.*
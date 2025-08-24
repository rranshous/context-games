# 🕯️ RitSim - AI-Driven Ritual Simulator

*An experimental game where AI becomes the game engine through mystical ritual interpretation*

## 🌟 Overview

RitSim explores the boundary between deterministic game mechanics and AI-generated content. Players arrange sacred objects on a ritual table, and Claude AI interprets the arrangements using established magical rules, generating both atmospheric prose and visual effects.

## 🎮 Gameplay

1. **Arrange Objects**: Drag ritual items (candles, stones, incense) on the mystical table
2. **Capture & Interpret**: Take a screenshot and send to Claude for analysis
3. **Experience Magic**: Watch the scene transform with AI-generated visual effects
4. **Mystical Feedback**: Read Claude's interpretation of your ritual's meaning and success

## 🔮 Features

### Core Mechanics
- **Visual Pattern Recognition**: AI analyzes screenshot arrangements instead of coordinates
- **Elemental Magic System**: Fire, Water, Earth, Air, and Spirit correspondences
- **Sacred Geometry**: Spatial relationships affect ritual outcomes
- **Structured AI Responses**: XML format enables both prose and visual effects

### Visual Effects
- **Ambient Glow**: Atmospheric lighting that matches ritual energy
- **Mystical Sparkles**: Floating particles indicating magical success
- **Energy Mist**: Swirling ethereal effects (currently being refined)
- **Dynamic Success Feedback**: Percentage-based ritual effectiveness

### AI Integration
- **Game World Context**: AI understands the magical rules and lore
- **Vision Processing**: Claude Sonnet 4 analyzes table arrangements
- **Contextual Interpretation**: Responses consider elemental balance and geometry
- **Structured Output**: Parseable XML for both narrative and visual effects

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Anthropic API key (Claude Sonnet 4)

### Installation
```bash
git clone [repository-url]
cd ritsim
npm install
```

### Configuration
Create a `.env` file with your API key:
```
ANTHROPIC_API_KEY=your_claude_api_key_here
```

### Development
```bash
# Start development server
npm run dev

# Or run separately:
npm run server:dev  # Express server with nodemon
npm run client:dev  # Vite dev server

# Build for production
npm run build

# Run production server
npm start
```

Visit `http://localhost:3000` to start performing digital rituals!

## 🏗️ Architecture

### Frontend (Canvas + AI)
- **Canvas Rendering**: HTML5 Canvas for object placement and interaction
- **Screenshot Capture**: Automatic image generation for AI analysis
- **Effects System**: CSS/Canvas-based visual effects rendering
- **AI Client**: Frontend interface to backend AI proxy

### Backend (Express + Claude)
- **AI Proxy**: Express server handling Claude API communication
- **Magic Context**: Game lore and rules injection into AI prompts
- **Response Parsing**: XML extraction and validation
- **Image Processing**: Base64 conversion for vision API

### AI Integration
- **Vision Model**: Claude Sonnet 4 for image analysis
- **Structured Prompts**: Game context + mystical interpretation instructions
- **XML Output**: Parseable format for both prose and effect data

## 📁 Project Structure

```
ritsim/
├── src/                    # Frontend source
│   ├── canvas/            # Rendering system
│   ├── objects/           # Interactive object management
│   ├── screenshot/        # Image capture utilities
│   ├── ai/               # AI client integration
│   └── ritual/           # Effect parsing & rendering
├── services/              # Backend AI services
├── docs/                  # Documentation
├── magic-mechanics.md     # Game world lore & rules
└── server.js             # Express server & API endpoints
```

## 🎯 Development Milestones

- ✅ **Milestone 1**: Backend Foundation & Static Serving
- ✅ **Milestone 2**: Canvas Rendering & Asset Loading  
- ✅ **Milestone 3**: Object Placement & Interaction
- ✅ **Milestone 4**: Canvas Screenshot Capture
- ✅ **Milestone 5**: AI Proxy Infrastructure
- ✅ **Milestone 6**: Vision Processing & Debug Display
- ✅ **Milestone 7**: Game Context & Ritual Interpretation
- ✅ **Milestone 8**: Structured AI Response Format
- 🎯 **Milestone 9**: Scene Rendering Refinement

## 🔮 Magic System

### Sacred Objects
- **Candles**: Elemental conduits (Red=Fire, Blue=Water, Purple=Spirit, White=Air)
- **Stones**: Earthly anchors (Obsidian=Protection, Quartz=Amplification, Amethyst=Wisdom)
- **Incense**: Spiritual communication bridges

### Ritual Mechanics
- **Spatial Relationships**: Positioning creates geometric energy patterns
- **Elemental Balance**: Harmony between opposing forces affects outcomes
- **Sympathetic Correspondences**: Object proximity creates magical resonance

## 🎨 AI Response Format

```xml
<ritual-outcome>
  <ritual successPercent="85" description="The crimson flame dances with azure wisdom..."/>
  <ambient-glow color="#9966ff" intensity="soft"/>
  <sparkles density="moderate" color="#ffd700"/>
  <energy-mist color="#ccccff" movement="swirling"/>
</ritual-outcome>
```

## 🔬 Experimental Goals

RitSim serves as research into **inference-driven game design**:

- **How much game logic can run on AI inference vs. traditional code?**
- **What gameplay experiences become possible with AI generation?**
- **How do we balance consistency with creative surprise?**
- **What new forms of player agency emerge from AI interpretation?**

## 🚧 Current Status

**Core Features**: ✅ Working  
**Visual Effects**: ✅ Functional (refinements in progress)  
**AI Integration**: ✅ Stable  
**User Experience**: ✅ Playable

The fundamental ritual cycle works end-to-end: arrange objects → AI analysis → visual transformation → mystical interpretation.

## 🤝 Contributing

This is an experimental project exploring AI-driven game mechanics. The codebase prioritizes rapid iteration and creative exploration over production polish.

## 📜 Philosophy

*"Magic is not about commanding reality, but about harmonizing with its hidden patterns."*  
— Ancient RitSim Axiom

RitSim explores digital ritual as a form of creative expression, where AI serves as both oracle and interpreter of symbolic arrangements.

---

*Manifest mystical experiences through inference and JavaScript* ✨🔮

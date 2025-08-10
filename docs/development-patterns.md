# Development Patterns & Preferences

**Robby's preferred coding patterns, architectures, and development approaches**

## Preferred Architecture Patterns

### Simulation ↔ Presentation ↔ Input Separation (Dark Hall Model)

**Pattern:** Clean separation between game logic, visual presentation, and user input handling.

**Why preferred:**
- Makes code more maintainable and testable
- Enables different presentation layers (web, mobile, projector)
- Allows AI to focus on simulation logic without UI concerns
- Family-friendly development - easier to explain and collaborate on

**Implementation Example:** Dark Hall project demonstrates this pattern effectively.

**Apply to:** Future game development, especially collaborative projects

### Configuration-Driven Architecture 

**Pattern:** Game behavior driven by configuration files rather than hard-coded logic.

**Benefits:**
- Easy to add new enemy types and behaviors (RaceOn goal)
- Enables AI-driven content generation
- Non-programmers can modify game behavior
- Rapid prototyping and iteration

**Implementation Example:** RaceOn's architecture ready for this expansion.

**Apply to:** AI-driven game development, content generation systems

### Deterministic HTML/Element Systems

**Pattern:** Game state represented as deterministic HTML elements and DOM manipulation.

**Why useful:**
- Predictable for AI collaboration
- Kid-friendly - visual elements map to code concepts
- Easy to debug and understand
- Enables collaborative development with AI

**Implementation Example:** Stacksonstacks project

**Apply to:** Educational game development, AI collaboration projects

## AI Integration Approaches

### AI as Creative Collaborator
- **Philosophy:** AI assists human creativity rather than replacing it
- **Implementation:** Real-time collaboration during development (like this documentation session)
- **Examples:** Sacred Scribe (storytelling), Sparkly-Sim (simulation tuning)

### Voice Control as Natural Interface
- **Pattern:** Web Speech API for natural language interaction
- **Projects:** Wallverine, Dinosaur Dance, Stacksonstacks
- **Benefits:** Immediate, intuitive interaction; works well for creative activities

### AI-Driven Behavioral Systems
- **Pattern:** AI controls NPC behavior, simulation parameters, or content generation
- **Examples:** Sparkly-Sim (neural energy reasoning), future RaceOn enemy AI
- **Architecture:** Keep AI decision-making separate from core game loop

## Family-Friendly Development Patterns

### Collaborative Development Approach
- **Include family members** in ideation and testing (step-son involvement)
- **Clear role separation** - kids focus on creative aspects, technical implementation handled separately
- **Visual feedback systems** - immediate visual results for creative input

### Kid-Friendly AI Collaboration
- **Age-appropriate interfaces** for AI interaction
- **Educational value** - teach collaboration skills with AI tools
- **Safe boundaries** - constrained AI interactions in controlled environments

## Voice Control Implementation Patterns

### Web Speech API Integration
- **Reliable patterns** established across multiple projects
- **Natural language processing** for creative commands
- **Cross-platform compatibility** (desktop and mobile)

### Voice Command Design
- **Natural phrases** over rigid syntax ("dance party" vs "execute_dance_formation")
- **Immediate visual feedback** for voice recognition
- **Graceful fallback** for recognition failures

## Project Development Lifecycle

### IPI (Introduce → Plan → Implement) Pattern
- **Introduce:** Clearly state goals and context
- **Plan:** Break down into phases with clear milestones  
- **Implement:** Execute systematically with documentation
- **Document decisions** for future reference

### Iterative Refinement Approach
- **Start with working core mechanics** before adding features
- **Family testing** - get feedback from actual users (step-son)
- **Authentic exploration** - let fun and creativity drive development direction

## Technical Preferences

### Technology Stack
- **TypeScript + HTML5 Canvas** for most games
- **Vite** for build processes
- **Git submodules** for project organization
- **Browser-based deployment** (itch.io publishing)

### Code Organization
- **Clear separation of concerns**
- **Configuration over convention** where possible
- **Family-accessible code structure** - readable and explainable

### AI Integration Stack
- **Anthropic Claude** for complex reasoning tasks
- **Whisper** for speech-to-text
- **Ollama** for local AI processing
- **Web Speech API** for voice control

## Publishing & Distribution

### itch.io as Primary Platform
- **Browser-based games** for maximum accessibility
- **Free distribution** model
- **Family-friendly content** focus

### Documentation Standards
- **Emoji badge system** for quick status scanning
- **Clear project categorization** (Games vs Interactive Experiences)
- **Live status tracking** via API integration

## Collaborative Development Guidelines

### Working with AI Assistants
- **Explicit feedback** rather than assuming preferences
- **Systematic documentation** of all decisions
- **Family context awareness** - some projects involve children
- **Creative partnership** approach to problem-solving

### Code Review & Quality
- **Architecture consistency** with established patterns
- **Family-friendly code** - explainable and maintainable
- **AI-collaboration readiness** - deterministic and predictable systems

# Game Projects

This directory contains all game development projects as submodules. Projects explore interactive entertainment, AI integration, and experimental gameplay mechanics.

## Games 🎮

### [Wuvu](./wuvu/)
AI-collaborative digital pet game where players care for 3 unique aquatic creatures while a simple AI Assist Agent helps with routine creature care. Demonstrates basic human-AI collaboration using local inference and shared game actions.  
🎯 **Status:** ✅ **Complete** - Simple AI assistant successfully implemented  
🎮 **Published:** Not yet  
🤖 **AI:** ✅ Local Ollama integration (qwen3:1.7b) with tool-based actions for feeding/cleaning/playing  
🔧 **Technical:** Tool-based agent architecture, unified human-AI action system, descriptive game state format  
✨ **Features:** Agent toggle, visual feedback, autonomous decision-making, transparent action logging

### [Con-Control](./con-control/)
AI collaboration space escape game where players work with a Ship AI (literally powered by Claude 4) to repair systems and escape a detention cell. Features **three escalating crises**: Power→Atmosphere→**Security Authorization**. The final phase creates an authentic AI ethical dilemma where Claude must choose between security protocols and human survival.  
🎯 **Status:** ✅ **Enhanced with Security Authorization Puzzle** - three-phase crisis progression complete  
🎮 **Published:** Not yet  
🤖 **AI:** ✅ Claude Sonnet 4 for real-time ship AI character with **authentic ethical decision-making**  
🔧 **Next:** Enhanced gameplay, multiple story paths, improved UI/UX  
✨ **Unique:** **Security authorization crisis**, escalating warning system, event horizon countdown, authentic AI ethical struggles, discovery-driven puzzles, voice + text input, streaming responses

### [RitSim](./ritsim/)
AI-driven ritual simulator where Claude interprets mystical object arrangements. Players drag sacred items on a ritual table, and AI generates both atmospheric prose and visual effects based on established magical rules and spatial patterns.  
🎯 **Status:** Core features complete, visual effects refinement in progress  
🎮 **Published:** Not yet  
🤖 **AI:** ✅ Claude Sonnet 4 for vision analysis and ritual interpretation  
🔧 **Next:** Refine energy mist rendering and effect combinations  
✨ **Unique:** Inference-driven game engine, visual pattern recognition, structured XML AI responses

### [Rescue Run](./rescue-run/)
Puzzle game teaching AI tool design through a rescue vehicle simulation. You don't control the car—you design the tools it uses to perceive and act, then watch the AI rescue stranded people. The core insight: how you define tools determines how well the AI performs.  
🎯 **Status:** v0.7 - Four-column UI, tool editing, review panel  
🎮 **Published:** Not yet  
🤖 **AI:** ✅ Claude Haiku for autonomous vehicle control via player-designed tools  
🔧 **Next:** Additional levels, polish  
✨ **Unique:** Teaches AI embodiment/tool design, meta-gameplay (designing tools IS playing), persistent tool configurations

### [RaceOn](./raceon/)
Desert combat racing game that evolved from closed-track racing to open-world water bandit hunting. Good foundation for forking and potential base for AI-driven game making experiments.  
🎯 **Status:** Foundation ready for expansion  
🎮 **Published:** [itch.io](https://codeflaw.itch.io/raceon) (Aug 9, 2025)  
🤖 **AI:** None (potential future integration)  
🔧 **Next:** Generalize implementation for easy addition of new enemy types and behaviors  
✨ **Unique:** Good separation of concerns, realistic physics, configuration-driven architecture

### [Dark Hall](./darkhall/)
Horror maze game created in collaboration with step-son. Excellent separation of simulation, presentation, and inputs - a preferred pattern for future game development.  
🎯 **Status:** Playable core mechanics complete  
🎮 **Published:** [itch.io](https://codeflaw.itch.io/darkhall) (Aug 9, 2025)  
🤖 **AI:** None  
🔧 **Next:** Add intro and game ending screens  
✨ **Unique:** Clean sim/presentation/input separation, collaborative family development, triple-layer lighting system

### [Stacksonstacks](./stacksonstacks/)
Deterministic HTML/element-based system designed for AI-driven game development. Focused on helping kids gain experience collaborating with AI in game creation.  
🎯 **Status:** Good foundation, ready to continue development  
🎮 **Published:** [itch.io](https://codeflaw.itch.io/stacksonstacks) (Jun 21, 2025)  
🤖 **AI:** 🎯 Planned (AI-driven game development collaboration)  
✨ **Unique:** Deterministic HTML/element system, designed for AI collaboration, kid-friendly development experience

### [AI Orchestration Game](./ai-orchestration-game/)
Early satirical workplace simulation. Hilariously funny as satire but intentionally not fun as a game (that's the joke). Humans coordinate between AI agents in enterprise software development chaos.  
🎯 **Status:** Satirical concept complete  
🎮 **Published:** Not yet  
🤖 **AI:** ✅ Multiple AI agents (Product Vision, Code Writer, Verification)  
✨ **Unique:** Intentionally unfun gameplay as commentary, authentic enterprise software development satire

### [All-Around-You](./all-around-you/)
Pre-AI collaboration experiment exploring WASM-based agent architectures. Each agent is its own WASM module with behavior and rendering packaged together for compositional use.  
🎯 **Status:** Experimental prototype  
🎮 **Published:** Not yet  
🤖 **AI:** None  
✨ **Unique:** WASM-based agent system, modular entity architecture

### [Fastfall](./fastfall/)
High-speed first-person perspective falling game where you jump from a hot air balloon and navigate through increasingly complex platforms as you plummet toward the ground. Full viewport POV experience with 3D-like scaling and atmospheric progression.  
🎯 **Status:** Just started development  
🎮 **Published:** Not yet  
🤖 **AI:** None  
✨ **Unique:** Immersive first-person freefall experience, 3D-like perspective using 2D canvas, atmospheric sky-to-ground progression, arcade-style wind physics

## Interactive Experiences 🎨

### [Wallverine](./wallverine/)
Voice-controlled wall animation system built for girlfriend's projector. Works well as a voice-powered projection experience. Possibly a finished product, though always room for enhancement.  
🎯 **Status:** Functional, potentially complete  
🎮 **Published:** [itch.io](https://codeflaw.itch.io/wallver) (Jun 21, 2025)  
🤖 **AI:** None (uses Web Speech API)  
✨ **Unique:** Purpose-built for projector setup, reliable voice control, wall-scale interactive art

### [Dinosaur Dance](./dinosaur-dance/)
Authentic fun exploration created through collaborative RP during development. Fun to play as both game and experience - step-son enjoyed playing on his phone.  
🎯 **Status:** ~Complete  
🎮 **Published:** [itch.io](https://codeflaw.itch.io/dinosaur-dance-extravaganza) (May 31, 2025)  
🤖 **AI:** None (uses Web Speech API)  
✨ **Unique:** Authentic exploration through RP development, voice-controlled creature formations, cross-platform enjoyment

### [Sparkly-Sim](./sparkly-sim/)
Ecosystem simulation exploring AI + simulation interaction. Can the AI turn knobs to help its actors propagate in the sim? Interesting visuals, was being refined last time worked on.  
🎯 **Status:** In development, interesting but not complete  
🎮 **Published:** Not yet  
🤖 **AI:** ✅ Anthropic Claude API for neural energy reasoning  
✨ **Unique:** AI-simulation interaction experiments, projector-ready visuals, emergent behaviors

### [Diplomatic Waters](./diplomatic-waters/)
Collaborative story building experience with AI. Experimental treaty writing simulator - didn't find the gameplay compelling enough to take very far.  
🎯 **Status:** Experimental, limited development  
🎮 **Published:** Not yet  
🤖 **AI:** ✅ Claude AI for treaty analysis  
✨ **Unique:** AI-human collaborative storytelling, legal language analysis, diplomatic simulation

### [World Weaver](./world-weaver/)
Platform that helps children digitize hand-drawn characters and stories, transforming them into shareable wiki pages through webcam capture and voice descriptions.  
🎯 **Status:** MVP Complete  
🎮 **Published:** Not yet  
🤖 **AI:** ✅ Whisper (speech-to-text) + Ollama (content generation)  
🔧 **Next:** Refine V1 implementation - step-son played with it but didn't get that into it  
✨ **Unique:** Physical-to-digital transformation workflow, voice-driven character documentation, AI-assisted wiki generation

### [Sacred Scribe](./hard-find-metatrial/sacred-scribe/)
Text-based game where you play as a copywriter creating recruitment materials for a cult. Maybe the most LOL/cackling-inducing game. Very immersive collaborative story building experience.  
🎯 **Status:** Playable full game, very fun  
🎮 **Published:** Not yet  
🤖 **AI:** ✅ Heavy AI integration (text analysis for recruitment effectiveness)  
✨ **Unique:** Immersive collaborative storytelling, psychological copywriting mechanics, high entertainment value

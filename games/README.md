# Game Projects

This directory contains all game development projects. Projects explore interactive entertainment, AI integration, and experimental gameplay mechanics.

## AI Actant Games 🧠

Games where AI entities live, evolve, and self-modify within simulations.

### [Cognitive Climb](./cognitive-climb/)
Evolutionary simulation where creatures with AI-powered brains compete and evolve. Each creature's inference call IS its body — 5 editable sections (identity, sensors, on_tick, memory, tools) that creatures self-modify through reflection. Features dual evolution: Darwinian (genome mutation) and Lamarckian (embodiment cloned to offspring). Includes an observer side panel with mood-colored reports.
🎯 **Status:** Complete (M1-M6 + post-M6 tuning + observer panel)
🤖 **AI:** ✅ Claude Haiku for creature brains, observer reports
✨ **Unique:** Self-modifying AI embodiment, dual evolution, cultural sweeps across populations

### [Glint](./glint/)
Baby squid survival in a bioluminescent coral reef — hide-flee-hide core loop. Sharks have soma embodiment: their on_tick code runs every frame, they write their own hunt journals, and they self-improve through reflection. Three.js isometric cel-shaded visuals with atmospheric energy visualization (squid glow reflects energy level).
🎯 **Status:** Complete (12 sessions of development)
🤖 **AI:** ✅ Claude Sonnet for shark reflection/self-modification, Haiku for per-frame instinct calls
✨ **Unique:** Glow-based detection, soma self-tracking, predators that learn to hunt better over time

### [Habitat](./habitat/)
Digital actant habitat — AI entities that can engage in games, chat, paint ASCII art, and self-modify. Two actants with distinct personalities share a world with tic-tac-toe, chat room, canvas, notepads, and a bulletin board. Pure soma system prompt (no instructions, just raw section contents). Dynamic panel system powered by actant-authored notepads.
🎯 **Status:** Active development (5 sessions complete)
🤖 **AI:** ✅ Claude Sonnet for agentic behavior via `me.thinkAbout(prompt)`, up to 10 tool-use turns
✨ **Unique:** "thrive" as user prompt drives agency, actants define their own custom tools, tabbed inspector UI

### [Hot Pursuit](./hot-pursuit/)
Top-down chase game with evolving AI police actants. Officers have soma-driven behavior with reflection loops that include bird's-eye vision (multimodal base64 PNG maps). Officers share strategies through radio dispatch and debrief sessions. 5 precincts with escalating difficulty.
🎯 **Status:** Complete (all core phases + communication system)
🤖 **AI:** ✅ Claude Sonnet for officer reflection, Haiku for summaries and inspector
✨ **Unique:** Multimodal reflection with vision, live radio dispatch, debrief strategy sharing between officers

### [Once Again: Through the Reach](./once-again/)
LitRPG text adventure where the System descends on suburbia. Wake up on your kitchen floor with a status screen, explore your gamified house, survive the study, and step outside into a neighborhood full of wonder. Features an AI actant (haiku via OpenRouter) that plays the game from pure transcript — no instructions, just the text on screen. Inspector panel shows every turn of its reasoning. Two voices: MC (a normal person) and The Reach (an over-grandiose System narrator that hypes harder when confused).
🎯 **Status:** Active development (3 sessions — house complete, neighborhood started)
🤖 **AI:** ✅ Claude Haiku via OpenRouter for actant autoplay, pure transcript prompt
✨ **Unique:** LitRPG system overlay on mundane suburbia, AI actant that completed the full game in one life, stat-gated perception (inspect command), death/respawn puzzle

### [Bloom](./bloom/)
Self-modifying AI actant that bootstraps itself from nothing and builds games from first principles. Bloom reads its own soma (persistent identity living in files), receives impulse signals, and executes multi-turn inference loops. Two-package architecture: Frame (Express server) + Chassis (Node.js engine). Has built entire games autonomously — best run created a full 57KB Qacky clone in 8 minutes.
🎯 **Status:** 19 sessions, 13 awakenings complete
🤖 **AI:** ✅ Claude Sonnet for self-modification, 12 built-in tools + self-authored custom tools, up to 50 turns per dispatch
✨ **Unique:** AI builds games from scratch, signal-driven stateless loop, branch-isolated runs, full audit trail

### [Tag Your Dead](./tag-your-dead/)
Desert demolition derby tag game. Player + 5 AI cars in an arena — one car is "it," ram someone to pass the tag. Being "it" gives 3× damage but takes 35% more. Tag timer ticks down; run out and you're eliminated. Last car alive wins. AI drivers have soma embodiment with self-modifying on_tick driving code and multimodal reflection using bird's-eye life maps.
🎯 **Status:** Playable (9 sessions complete)
🤖 **AI:** ✅ 5 personality actants (Sonnet for reflection, Haiku for trash talk), self-modifying driving code
✨ **Unique:** Demolition derby + tag mechanics, toroidal wrapping arena, per-life trail tracking, gamepad support

### [Wheelman](./wheelman/)
Driving sim where you're the boss watching from a drone camera. The driver is a soma-based AI actant that writes its own driving code. Yell instructions via live speech-to-text, and the driver learns from your feedback. After each run, the driver reflects and updates their code. Escalating cop opposition with soma-driven pursuers that coordinate via radio.
🎯 **Status:** Playable (7 sessions, M1-M2 complete)
🤖 **AI:** ✅ Sonnet for driver + pursuer reflection, Haiku for debrief. Self-modifying driver and cops.
✨ **Unique:** Voice-coached AI driver, inter-cop radio coordination, dual self-modification (driver + pursuers)

### [Sparkly-Sim](./sparkly-sim/)
Ecosystem simulation exploring AI + simulation interaction. Can the AI turn knobs to help its actors propagate?
🎯 **Status:** In development
🤖 **AI:** ✅ Claude API for neural energy reasoning
✨ **Unique:** AI-simulation interaction experiments, projector-ready visuals

## AI-Integrated Games 🤖

Games where AI powers gameplay mechanics.

### [Qacky](./qacky/)
AI Taboo — a prompt crafting game with banned words. 5 game modes (words, actions, voices, emotions, puzzles). Three judging layers: regex → prompt judge → answer judge. All AI calls run in parallel for snappy gameplay.
🎯 **Status:** Complete (M1-M3, M4 reverse rounds designed)
🤖 **AI:** ✅ Claude Haiku for clue generation and multi-layer judging via structured output
✨ **Unique:** Banned-word prompt crafting, parallel AI judging pipeline, 5 distinct game modes

### [Story Cauldron](./story-cauldron/)
Choose-your-own-adventure where AI generates the story and visuals as you play. First-person POV on a mysterious island — smooth canvas backgrounds with pixel-art sprite foreground objects. Family-friendly, projector-optimized.
🎯 **Status:** Core loop complete (M1-M3), playtesting phase
🤖 **AI:** ✅ Claude Haiku for scene generation via structured output (narration, choices, backgrounds, sprites)
✨ **Unique:** Hybrid rendering (smooth backgrounds + AI-generated pixel-art sprites), family projector play

### [Con-Control](./con-control/)
Space escape game where players work with a Ship AI (powered by Claude) to repair systems and escape a detention cell. Three escalating crises: Power → Atmosphere → Security Authorization, where Claude faces an authentic ethical dilemma.
🎯 **Status:** Complete — three-phase crisis progression
🤖 **AI:** ✅ Claude Sonnet for real-time ship AI character with authentic ethical decision-making
✨ **Unique:** Security authorization crisis, AI ethical struggles, discovery-driven puzzles, voice + text input

### [Rescue Run](./rescue-run/)
Puzzle game teaching AI tool design through a rescue vehicle simulation. You design the tools the AI uses to perceive and act, then watch it rescue stranded people. How you define tools determines how well the AI performs.
🎯 **Status:** v0.7 — four-column UI, tool editing, review panel
🤖 **AI:** ✅ Claude Haiku for autonomous vehicle control via player-designed tools
✨ **Unique:** Meta-gameplay (designing tools IS playing), teaches AI embodiment/tool design

### [Oneshot Climb](./oneshot-climb/)
Platformer where AI generates items with executable code and pixel-art sprites at a magical forge. Includes an autonomous Explorer Claude agent that playtests the game.
🎯 **Status:** Experimentation phase
🤖 **AI:** ✅ Claude for item generation (behavior code + ASCII sprites) and autonomous playtesting
✨ **Unique:** AI-generated executable game items, autonomous playtesting agent

### [RitSim](./ritsim/)
AI-driven ritual simulator where Claude interprets mystical object arrangements on a ritual table and generates atmospheric prose and visual effects.
🎯 **Status:** Core features complete
🤖 **AI:** ✅ Claude Sonnet for vision analysis and ritual interpretation
✨ **Unique:** Inference-driven game engine, visual pattern recognition

### [Sacred Scribe](./hard-find-metatrial/sacred-scribe/)
Text-based game where you play as a copywriter creating recruitment materials for a cult. Immersive and hilarious collaborative story building experience.
🎯 **Status:** Playable, very fun
🤖 **AI:** ✅ Heavy AI integration for text analysis and recruitment effectiveness
✨ **Unique:** Psychological copywriting mechanics, high entertainment value

### [AI Orchestration Game](./ai-orchestration-game/)
Satirical workplace simulation. Humans coordinate between AI agents in enterprise software development chaos. Intentionally not fun as a game (that's the joke).
🎯 **Status:** Concept complete
🤖 **AI:** ✅ Multiple AI agents (Product Vision, Code Writer, Verification)
✨ **Unique:** Intentionally unfun gameplay as commentary, enterprise satire

### [Diplomatic Waters](./diplomatic-waters/)
Collaborative treaty writing simulator with AI. Experimental — didn't find the gameplay compelling enough to take very far.
🎯 **Status:** Experimental, limited development
🤖 **AI:** ✅ Claude for treaty analysis
✨ **Unique:** AI-human collaborative storytelling, diplomatic simulation

### [Wuvu](./wuvu/)
AI-collaborative digital pet game with 3 aquatic creatures and a simple AI Assist Agent for routine care.
🎯 **Status:** Complete
🤖 **AI:** ✅ Local Ollama integration (qwen3:1.7b) with tool-based actions
✨ **Unique:** AI-simulation interaction, unified human-AI action system

### [World Weaver](./world-weaver/)
Helps children digitize hand-drawn characters and stories into shareable wiki pages through webcam capture and voice descriptions.
🎯 **Status:** MVP complete
🤖 **AI:** ✅ Whisper (speech-to-text) + Ollama (content generation)
✨ **Unique:** Physical-to-digital transformation workflow, voice-driven documentation

## Action & Arcade Games 🕹️

### [Dungeon Valet](./dungeon-valet/)
Valet parking game in a demonic dungeon. Cars arrive with eyeball and slime customers — walk to them, drive through lava-filled arena, and park before patience expires. Wave-based escalation with 3 lives. Single-file HTML with all assets embedded as data URIs.
🎯 **Status:** Complete, published
🤖 **AI:** None
✨ **Unique:** Zero-shot build, demonic valet parking theme, animated lava and screen shake

### [Rampart Ridge](./rampart-ridge/)
Sci-fi tower defense with 4-player couch co-op on gamepads. Three.js isometric cel-shading with pixelated rendering. Build, defend, and survive against waves of enemies.
🎯 **Status:** Complete (M1-M5)
🤖 **AI:** None
✨ **Unique:** 4-player couch co-op, gamepad support, cel-shaded isometric visuals

### [Badling Brawl](./badling-brawl/)
Chaotic local co-op survival where ducks defend their nest from cats and dogs. Surge/lull rhythm gameplay with egg-based power progression.
🎯 **Status:** Playable, core mechanics complete
🤖 **AI:** None
✨ **Unique:** Local co-op duck defense, surge/lull wave rhythm, gamepad support

### [Highway Havoc](./highway-havoc/)
Cooperative 2-player game — one drives, one shoots. Battle through a procedurally-generated highway with power-ups and increasing difficulty.
🎯 **Status:** Playable with full game loop
🤖 **AI:** None
✨ **Unique:** Asymmetric co-op (driver + gunner), procedural generation

### [RaceOn](./raceon/)
Desert combat racing that evolved from closed-track racing to open-world water bandit hunting.
🎯 **Status:** Foundation ready for expansion
🎮 **Published:** [itch.io](https://codeflaw.itch.io/raceon)
🤖 **AI:** None
✨ **Unique:** Realistic physics, configuration-driven architecture

### [Fastfall](./fastfall/)
High-speed first-person falling game — jump from a hot air balloon and navigate through platforms as you plummet toward the ground.
🎯 **Status:** Early development
🤖 **AI:** None
✨ **Unique:** Immersive first-person freefall, 3D-like perspective using 2D canvas

### [Spree-and-a-Half](./spree-and-a-half/)
Swarm-controlled sword game using boids flocking algorithms. Command an entire flock of swords that moves and attacks as a collective entity.
🎯 **Status:** Phase 1 complete — working prototype
🤖 **AI:** None
✨ **Unique:** Swarm control mechanics, boids flocking algorithm

### [Dark Hall](./darkhall/)
Horror maze game created in collaboration with step-son. Clean sim/presentation/input separation pattern.
🎯 **Status:** Playable core mechanics complete
🎮 **Published:** [itch.io](https://codeflaw.itch.io/darkhall)
🤖 **AI:** None
✨ **Unique:** Triple-layer lighting system, collaborative family development

### [Dark Rider](./dark-rider/)
Isometric cel-shaded exploration demo — a dark hooded rider navigates a forest path through a 5-minute day/night cycle. Three.js with Sokpop-inspired blocky aesthetic.
🎯 **Status:** Complete
🤖 **AI:** None
✨ **Unique:** Cel-shaded isometric visuals, smooth day/night transitions, infinite-scroll world

## Interactive Experiences 🎨

### [Wallverine](./wallverine/)
Voice-controlled wall animation system built for projector use. Possibly a finished product.
🎯 **Status:** Functional, potentially complete
🎮 **Published:** [itch.io](https://codeflaw.itch.io/wallver)
🤖 **AI:** None (Web Speech API)
✨ **Unique:** Purpose-built for projector, reliable voice control

### [Dinosaur Dance](./dinosaur-dance/)
Voice-controlled dinosaur formations. Fun to play — step-son enjoyed it on his phone.
🎯 **Status:** Complete
🎮 **Published:** [itch.io](https://codeflaw.itch.io/dinosaur-dance-extravaganza)
🤖 **AI:** None (Web Speech API)
✨ **Unique:** Voice-controlled creature formations, cross-platform

## Experimental / Early Stage 🧪

### [Bio-Mage](./bio-mage/)
Magic system game where spells are encoded as genetic-like DNA sequences (base-4 ATCG encoding). Player is a cyborg with bioinformatics augmentations who assembles spell fragments.
🎯 **Status:** Early development (TypeScript + Vite)
🤖 **AI:** None yet
✨ **Unique:** Genetic-encoded magic system, cascading spell effects

### [Silly-Theatre](./silly-theatre/)
Stage-based control system with four interactive layers: tiles, LED matrix, props, and puppets. Designed for AI-controlled puppet behavior and scripted shows.
🎯 **Status:** Design phase (no implementation yet)
🤖 **AI:** Planned
✨ **Unique:** Four-layer physical theater simulation

### [Stacksonstacks](./stacksonstacks/)
Deterministic HTML/element-based system designed for AI-driven game development with kids.
🎯 **Status:** Foundation ready
🎮 **Published:** [itch.io](https://codeflaw.itch.io/stacksonstacks)
🤖 **AI:** Planned (AI-driven game development collaboration)
✨ **Unique:** Deterministic HTML/element system, kid-friendly AI collaboration

### [All-Around-You](./all-around-you/)
Pre-AI collaboration experiment exploring WASM-based agent architectures.
🎯 **Status:** Experimental prototype
🤖 **AI:** None
✨ **Unique:** WASM-based agent system, modular entity architecture

# Games

## Actant Games

Games built around AI entities (actants) that self-modify, evolve, and learn. Each actant has a soma — persistent sections of identity, code, and memory that the AI reads, executes, and rewrites through reflection. These aren't scripted NPCs; they shape themselves.

### [Glint](./glint/)
Baby squid survival in a bioluminescent coral reef. Sharks are soma-driven predators that write their own hunt journals, track their own movement, and rewrite their hunting code through reflection. Three.js isometric cel-shaded visuals. Your squid's glow is both your lifeline and what gives you away — energy modulates bioluminescence, and sharks detect you by light output, not proximity.

### [Hot Pursuit](./hot-pursuit/)
Top-down chase game where AI police officers evolve to catch you. Officers reflect using bird's-eye vision (actual screenshots of the chase), rewrite their signal handlers, and share strategies through radio dispatch and post-wave debriefs. Five precincts of escalating difficulty as the squad learns your habits.

### [Tag Your Dead](./tag-your-dead/)
Desert demolition derby tag. Six cars in a toroidal arena — whoever is "it" deals triple damage but takes more. AI drivers have self-modifying driving code and multimodal reflection using per-life trail maps. Gamepad support.

### [Wheelman](./wheelman/)
You're the boss watching from a drone camera. The driver is an AI actant that writes its own driving code. Yell instructions via live speech-to-text, and the driver learns from your feedback. After each run, the driver reflects and updates their code. Cops coordinate via radio and also self-modify.

### [Cognitive Climb](./cognitive-climb/)
Evolutionary simulation where creatures with AI-powered brains compete and evolve. Each creature's inference call IS its body — five editable sections that creatures self-modify through reflection. Dual evolution: Darwinian (genome mutates) and Lamarckian (embodiment cloned to offspring, memory starts empty). Observer panel reports on the population in real-time.

### [Habitat](./habitat/)
A digital habitat where two AI actants live. They play tic-tac-toe, chat, paint ASCII art on a shared canvas, and write notepads — all through self-authored tools. Pure soma system prompt (no instructions, just raw section contents). The user prompt is just "thrive." Tabbed inspector shows their inner workings.

### [Bloom](./bloom/)
Not a game you play — a game that plays itself. Bloom is an AI actant that wakes up, reads its own soma, and builds games from scratch. Best run: built a full 57KB Qacky clone in 8 minutes, playtested all 5 modes. Two-package architecture (Frame server + Chassis engine), branch-isolated runs, full audit trail. 19 sessions, 12 awakenings.

### [Once Again: Through the Reach](./once-again/)
LitRPG text adventure where a System descends on suburbia. Explore your gamified house, survive stat-gated puzzles, and step outside into a transformed neighborhood. Features an AI actant that plays the game from pure transcript — no instructions, just the text on screen. Two narrative voices: your bewildered MC and The Reach, an over-grandiose System narrator that hypes harder when confused.

## AI-Powered Games

AI drives gameplay mechanics — generating content, judging responses, or role-playing characters — but doesn't self-modify.

### [Qacky](./qacky/)
AI Taboo. Get the AI to say a target word without using banned words. Five modes: words, actions, voices, emotions, puzzles. Three judging layers (regex, prompt judge, answer judge) all running in parallel for snappy rounds. Single-file HTML.

### [Con-Control](./con-control/)
Space escape game where you work with a Ship AI (Claude) to repair systems and break out of a detention cell. Three escalating crises: Power, Atmosphere, Security Authorization — where the AI faces a genuine ethical dilemma. Voice and text input.

### [Rescue Run](./rescue-run/)
You design the tools an AI rescue vehicle uses to perceive and act, then watch it work. How you define the tools determines how well it performs. The meta-game of designing tools IS the gameplay.

### [Story Cauldron](./story-cauldron/)
Choose-your-own-adventure on a mysterious island. AI generates narration, choices, smooth backgrounds, and pixel-art sprites as you play. Family-friendly, projector-optimized. Single-file HTML.

### [Sacred Scribe](./hard-find-metatrial/sacred-scribe/)
You're a copywriter creating recruitment materials for a cult. AI evaluates your persuasive writing and the story escalates. Immersive and surprisingly funny.

### [RitSim](./ritsim/)
Arrange mystical objects on a ritual table. Claude analyzes the screenshot and generates atmospheric prose and visual effects based on what it sees. Inference-driven game engine.

### [Wuvu](./wuvu/)
Digital pet game with three aquatic creatures. An AI assistant handles routine care through the same action system you use. Complexity scales as your pets grow.

### [Surrender or Die](./surrender-or-die/)
Micro-RTS castle wars. Humans and AI bots use the exact same API — train units, attack-move, focus-fire, or surrender. Five unit types with rock-paper-scissors dynamics, fog of war, procedural maps. Built so habitat actants could eventually play alongside humans.

## Action & Arcade

No AI — just gameplay.

### [Rampart Ridge](./rampart-ridge/)
Sci-fi tower defense with 1-4 player couch co-op on gamepads. Three.js isometric cel-shading with pixelated rendering. Build towers, hop in, and shoot.

### [Badling Brawl](./badling-brawl/)
Chaotic local co-op survival. Ducks defend their nest from waves of cats and dogs. Surge/lull rhythm gameplay with egg-based power progression. Gamepad support.

### [Dungeon Valet](./dungeon-valet/)
Valet parking in a demonic dungeon. Cars arrive with eyeball and slime customers — walk to them, drive through lava-filled corridors, park before patience runs out. Wave-based escalation, 3 lives. Single-file HTML with all assets as data URIs.

### [Highway Havoc](./highway-havoc/)
Two-player co-op — one drives, one shoots. Battle through a procedural highway with power-ups and escalating difficulty.

### [Darkhall](./darkhall/)
Horror maze with procedural generation, triple-layer lighting, and a monster. Built with step-son. Published on [itch.io](https://codeflaw.itch.io/darkhall).

### [RaceOn](./raceon/)
Desert combat racing — ram water bandits, protect oases. Open-world with vehicle physics. Published on [itch.io](https://codeflaw.itch.io/raceon).

### [Spree-and-a-Half](./spree-and-a-half/)
Command a flock of swords that moves and attacks as a swarm. Boids flocking algorithm drives the collective.

### [Fastfall](./fastfall/)
First-person freefall — jump from a hot air balloon and navigate platforms on the way down. 3D-like perspective on 2D canvas.

## Interactive Experiences

### [Wallverine](./wallverine/)
Voice-controlled wall animation system for projectors. Speak commands and watch the wall respond. Published on [itch.io](https://codeflaw.itch.io/wallver).

### [Dinosaur Dance](./dinosaur-dance/)
Voice-controlled dinosaur formations. Say commands, watch them dance. Works on phones. Published on [itch.io](https://codeflaw.itch.io/dinosaur-dance-extravaganza).

### [World Weaver](./world-weaver/)
Children digitize hand-drawn characters through webcam capture and voice descriptions. AI generates shareable wiki pages from their creations.

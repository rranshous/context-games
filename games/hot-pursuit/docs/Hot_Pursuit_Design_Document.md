# Hot Pursuit: An Actant Evolution Chase Game

*Created: February 24, 2026 | Last Updated: February 24, 2026 | Robby Ranshous*

*Design document for development with Claude Code in VS Code*

---

## Concept

A top-down, birds-eye-view chase game with retro low-fi graphics (think early GTA, pre-3D era). The player is a fugitive navigating a city grid. The police are actants — AI entities that evolve their pursuit tactics across runs.

The core question the game explores: **what happens when the enemies remember you?**

Each chase is separated by a narrative gap ("one week later"), during which the police actants reflect on the previous chase, update their tactical handlers, and crystallize new pursuit behaviors. The player experiences a natural difficulty curve that emerges from genuine adaptation rather than scripted escalation.

---

## Two-Phase Architecture

The game operates in two distinct modes that map cleanly onto the embodiment architecture.

### Chase Mode — Pure Embodiment, No Cognition

During active gameplay, **no inference occurs**. The police actants execute entirely on crystallized behaviors — signal handlers and tactical code that the actant wrote for itself during the previous reflection phase. This means:

- The soma contains the actant's crystallized pursuit handlers, memory of past chases, and tactical state
- The chassis provides movement primitives, map awareness, and sensory input
- Both layers are active and producing behavior, but the model is not reasoning — it is performing what it already decided to be
- This runs at whatever frame rate we want because there's zero inference latency in the loop

The actant during a chase is like a musician performing a rehearsed piece. The intelligence happened earlier. The execution is embodied.

### Reflection Mode — Cognition Active

Between chases, each police actant gets inference cycles. This is where the model thinks, learns, and modifies its own soma. The input is structured replay data from the previous chase. The output is updated tactical handlers that will execute in the next chase.

The narrative framing ("one week later") makes this natural. The player isn't waiting — they're experiencing the passage of time. The reflection can take as long as it needs.

---

## Game Mechanics

### The Chase

- **Perspective**: Top-down 2D, pixel art or low-fi vector style
- **Map**: City grid with streets, alleys, dead ends, open plazas, tunnels — enough spatial complexity to support diverse tactical approaches
- **Player movement**: Direct control (WASD or arrow keys), slightly faster than police base speed to ensure escape is possible
- **Win condition**: Reach one of several extraction points, or survive for N turns/seconds
- **Lose condition**: Cornered by police (surrounded within N tiles with no escape path)
- **Police count**: Start with 3-4 actants, potentially scaling up in later runs
- **Fog of war**: Police only "see" the player within their line-of-sight cone. Pursuit requires tracking, not omniscience

### The Narrative Gap

Between chases, the game presents a diegetic interstitial:

- A **police strategy board** — a visual showing the map with pins, notes, and annotations drawn from the actants' actual memory and observations
- Example annotations: "Suspect favors east-side alleys," "Lost visual contact near the bridge — deploy unit there next time," "Suspect doubles back when flanked from the north"
- These are real observations pulled from the actants' reflection output, not scripted flavor text
- The player gets to see the adaptation coming but doesn't know exactly how it will manifest

### Progression

- **Run 1-2**: Police run naive handlers. "Move toward last known player position." Player feels powerful, learns the map
- **Run 3-5**: Actants begin composing basic tactics. Cut-off attempts, pincer patterns. Player notices the cops are smarter
- **Run 6-10**: Actants have individuated. One is the tracker, one is the flanker, one anticipates escape routes. Player must read their styles and exploit gaps
- **Run 10+**: Coordination patterns emerge. The player is now engaged in a genuine strategic contest against adapted opponents

---

## Actant Architecture

### Soma Layout (Per Police Actant)

```
IDENTITY
  name: "Officer [generated]"
  badge_number: [unique ID]
  personality_seed: [initial behavioral bias — e.g., aggressive, cautious, methodical]

MEMORY
  chase_history: [array of structured replay summaries]
    - run_id, player_path, own_path, player_captured (bool)
    - moments_of_interest: [list of {tick, event, significance}]
      e.g., { tick: 45, event: "lost_visual", significance: "player used alley at E7 to break LOS" }
    - self_assessment: "my flanking attempt at tick 32 failed because I committed too early"
  
  player_model: [accumulated beliefs about player tendencies]
    - preferred_escape_routes: [weighted list]
    - behavioral_patterns: ["doubles back under pressure", "favors east side"]
    - exploitation_ideas: ["station at E7 alley exit preemptively"]

  ally_observations: [optional — populated if communication is enabled]
    - shared observations from other actants' debriefs

TACTICAL_HANDLERS (crystallized code — executes during chase)
  on_player_spotted(player_position, own_position, map_state):
    // default: move_toward(player_position)
    // after reflection: may become complex pursuit logic
    
  on_player_lost(last_known_position, own_position, map_state):
    // default: move_to(last_known_position)
    // after reflection: may become search patterns, predictive positioning
    
  on_ally_signal(ally_id, signal_type, data):
    // default: no-op
    // after reflection: coordination responses

  on_tick(own_position, known_state, map_state):
    // the per-cycle logic — patrol patterns, positioning, idle behavior
    // early runs: random patrol
    // later runs: strategic positioning based on player_model

REFLECTION_PROMPTS (used during reflection mode — guides the model's thinking)
  review_prompt: "Here is the replay of chase #{run_id}. Review your performance..."
  update_prompt: "Based on your review, update your tactical handlers..."
  debrief_prompt: "Summarize your key observations for the shared debrief..."
```

### Chassis (Per Police Actant)

The chassis provides the primitives the actant composes in its handlers:

**Movement primitives**:
- `move_toward(target)` — pathfind and move one step toward target
- `move_to_intercept(target, target_velocity)` — predictive movement
- `hold_position()` — stay put
- `patrol(waypoints)` — cycle through positions
- `move_away(target)` — retreat/reposition

**Observation primitives**:
- `line_of_sight(target)` → bool — can I see the target?
- `last_known_position()` → position | null
- `ally_positions()` → array of {id, position}
- `map_query(position, radius)` → terrain info (walls, alleys, intersections)
- `distance_to(target)` → number
- `escape_routes_from(position)` → array of paths

**Communication primitives** (for radio-enabled experiments):
- `broadcast(signal_type, data)` — send to all allies
- `signal(ally_id, signal_type, data)` — send to specific ally

**The compositional soma principle applies**: the actant can only compose these primitives. It cannot reach outside this tool surface. Boundaries are structural, not behavioral.

### Reflection Phase — What the Model Actually Does

After each chase, each actant receives:

1. **Structured replay data**: tick-by-tick positions of self, allies, and player (where visible)
2. **Its current soma**: identity, memory, current tactical handlers
3. **A reflection prompt** that asks it to:
   - Review the chase replay
   - Identify what worked and what failed in its own behavior
   - Update its player model with new observations
   - Rewrite its tactical handlers to implement improved tactics
   - (If communication enabled) Produce a debrief summary

The model outputs an updated soma. The game engine validates the output (handlers must only use chassis primitives), stores it, and it becomes the actant's body for the next chase.

---

## Communication Experiments

The game is designed to support multiple communication configurations to observe different evolutionary dynamics.

### Configuration A: No Communication

Each actant reflects in isolation. Coordination can only emerge through environmental observation during chases — seeing where allies are positioned, inferring intent from movement patterns. Models have demonstrated emergent coordination without communication in simulation. This configuration tests whether that holds in a spatial pursuit context.

**Prediction**: Slower to coordinate but more diverse individual strategies. Each actant develops its own "personality" more strongly.

### Configuration B: Observation Sharing (Debrief)

After each chase, actants share structured observations — what they saw, where they lost the player, what the player did. They do NOT share their tactical handlers or strategic reasoning.

**Prediction**: Faster convergence on accurate player models, but tactics remain individual. Each actant interprets the same data differently based on its identity seed and history.

### Configuration C: Tactic Sharing (Radio + Debrief)

Actants share both observations and their updated handlers. An actant can adopt another's tactical code if it finds it useful.

**Prediction**: Fastest coordination, but reduced individuation. The police become more uniform, which may actually be less interesting for the player — fewer exploitable gaps between styles.

### Configuration D: Live Radio

During the chase itself, actants can broadcast observations in real-time using the communication primitives. "Player spotted at E7." "I'm moving to cut off the bridge." Still crystallized handler execution, but handlers can include broadcast/signal calls.

**Prediction**: Most realistic coordination. The interesting question is whether the handlers learn to incorporate radio input effectively through reflection, or whether the added input creates noise.

---

## Technical Architecture

### Stack

- **Runtime**: TypeScript (Node.js or browser-based)
- **Rendering**: HTML5 Canvas or a lightweight 2D library (Pixi.js for performance, or raw canvas for simplicity)
- **Game loop**: Fixed timestep, tick-based internally even if rendered smoothly
- **Inference**: Anthropic API calls during reflection phase
- **State management**: Each actant's soma stored as structured JSON

### Game Engine Responsibilities

```
GameEngine
  ├── Map (static city grid, loaded from tilemap)
  ├── Player (position, movement, input handling)
  ├── ActantRunner (per police unit)
  │   ├── loads soma from storage
  │   ├── executes tactical handlers each tick
  │   ├── provides chassis primitives
  │   └── records replay data
  ├── ChaseManager
  │   ├── initializes chase state
  │   ├── runs game loop
  │   ├── detects win/lose conditions
  │   └── produces structured replay on completion
  └── ReflectionManager
      ├── feeds replay + current soma to inference
      ├── validates returned soma (handler safety check)
      ├── manages communication/debrief if enabled
      └── stores updated soma for next chase
```

### Handler Execution Safety

Since actant-written handlers execute as game logic, the engine must enforce:

- **Allowlisted function calls only**: Handlers can only call chassis primitives. Any other function call is rejected during validation
- **Execution timeout**: Handlers that run too long are killed and replaced with a default
- **State isolation**: One actant's handler cannot access another's state directly
- **Determinism**: Given the same inputs, a handler produces the same outputs. No randomness unless explicitly seeded

### Replay Data Structure

```typescript
interface ChaseReplay {
  run_id: number;
  duration_ticks: number;
  outcome: 'escaped' | 'captured';
  
  player_path: Array<{
    tick: number;
    position: Position;
    action: 'move' | 'wait' | 'sprint';
  }>;
  
  actant_paths: Record<string, Array<{
    tick: number;
    position: Position;
    action: string;          // which handler fired
    player_visible: boolean;
    player_position?: Position; // only if visible
  }>>;
  
  events: Array<{
    tick: number;
    type: 'player_spotted' | 'player_lost' | 'near_capture' | 
          'broadcast' | 'extraction_attempt';
    actant_id?: string;
    data: Record<string, any>;
  }>;
}
```

---

## Metrics and Observation

### Per-Run Metrics

- **Time to capture / escape duration**: Is the net tightening over runs?
- **Closest approach distance**: Even in escapes, are the police getting closer?
- **Handler complexity**: Lines of code in tactical handlers over time (are actants crystallizing more complex behaviors?)
- **Handler diversity**: How different are the actants' handlers from each other? (Measured as edit distance or structural diff)

### Cross-Run Metrics

- **Convergence rate**: How quickly do actants develop effective coordination?
- **Player model accuracy**: Do the actants' player_model beliefs correlate with actual player behavior?
- **Strategy emergence timeline**: When do recognizable tactics (flanking, ambush, sweep) first appear?
- **Communication overhead vs. coordination gain**: In radio-enabled configs, does the token cost produce proportional tactical improvement?

### The Spectator Layer

Replay viewing with visualization:

- Heatmaps of player paths across runs (do player strategies shift in response to police adaptation?)
- Actant "personality profiles" — a summary of each actant's evolved tactical style
- Side-by-side replay of the same actant's behavior in run 1 vs. run 10
- The police strategy board rendered as a viewable artifact between runs

---

## Development Phases

### Phase 1: The Grid and the Chase

Build the core game loop with no inference:

- Tile-based city map with walls, alleys, intersections
- Player movement and input
- Static police units running hardcoded "move toward player" logic
- Win/lose detection
- Replay data capture
- Basic top-down rendering

**Milestone**: Playable chase that produces structured replay data.

### Phase 2: The Embodiment Layer

Add the actant architecture:

- Soma data structure (identity, memory, handlers)
- Chassis primitive library
- Handler execution engine (load soma → execute handler per tick → record actions)
- Handler validation (allowlist enforcement)
- Replace hardcoded police logic with handler-driven behavior

**Milestone**: Police behavior is entirely driven by handlers read from soma JSON. Manually editing the JSON changes behavior.

### Phase 3: The Reflection Loop

Add inference-driven evolution:

- Reflection manager: feeds replay + soma to Claude API
- Prompt engineering for the reflection phase
- Soma update pipeline: validate → store → load for next chase
- The interstitial strategy board UI

**Milestone**: Police actants evolve across runs. Observable behavioral change from run to run.

### Phase 4: Communication Experiments

Add the communication layer:

- Debrief sharing mechanism
- Radio primitives in chassis
- Configuration switches for A/B/C/D communication modes
- Metrics capture for cross-configuration comparison

**Milestone**: Can run the same scenario under different communication configs and compare outcomes.

### Phase 5: Polish and Observation

- Retro visual style and feel
- Spectator replay viewer
- Metrics dashboard
- Multiple maps with different spatial properties
- Player progression features (new maps unlock, actant count increases)

---

## Open Questions

- **How much replay data does the actant need?** Full tick-by-tick? Summarized highlights? Too much may overwhelm; too little may not support useful reflection
- **Should actants share a player model or build independent ones?** Independent models preserve individuation but may produce contradictory beliefs
- **What's the right handler language?** JavaScript functions are expressive but hard to sandbox. A DSL (domain-specific language) for tactical behavior would be safer but limits emergent complexity
- **How do we handle actant "forgetting"?** After 50 runs, the memory section gets large. Do we summarize? Let the actant curate its own memory? Fixed-window?
- **Can the player see their own heatmap?** Showing the player their own patterns might create a meta-game where they deliberately vary behavior to confuse the actants

---

## Why This Game Matters

This isn't just a game. It's a legible, visceral demonstration of:

- **Actant individuation** — the same starting embodiment producing different entities through experience
- **Behavioral crystallization** — prose reasoning becoming executable code, visible as increasingly sophisticated police behavior
- **Co-evolutionary dynamics** — the player and the police mutually adapting, creating an arms race that neither side scripts
- **The embodiment thesis** — that the same model in different embodiments (different actants with different histories) produces fundamentally different capabilities

If we build it well, a player who has never heard of embodiment theory will experience it directly: the cop who always takes the alley, the one who waits at the bridge, the one who seems to read your mind. Not because we programmed those personalities, but because they emerged.

That's the pitch. That's the experiment.

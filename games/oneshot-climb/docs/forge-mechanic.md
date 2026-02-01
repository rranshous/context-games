# The Forge Mechanic

## Core Idea

Instead of hiding inference latency behind a loading screen, make it gameplay.

The Forge is where new abilities are created. Activating it triggers real AI inference - the wait becomes tension, not frustration.

## How It Works

1. **Discovery** - Player finds a Forge in the world (creation station, mystery altar, ancient machine, etc.)
2. **Activation** - Player chooses to interact, triggering inference
3. **Defense** - While the item is being "created", the player must survive
   - Enemies swarm toward the forge
   - Timer counts down (tied to inference progress)
   - Player defends until creation completes
4. **Resolution**
   - **Success**: Item materializes, player gains unique ability
   - **Failure**: Forge sparks and fizzles - "creation was unstable"

## Why This Works

### Latency becomes gameplay
- 5-15 seconds of inference time = 5-15 seconds of defend phase
- Players are engaged, not waiting
- The tension matches the anticipation of "what will I get?"

### Failures are diegetic
- Bad code / timeout / parse error = "creation unstable"
- Players never see error messages
- Failed forges are just part of the world, not bugs

### Pacing mechanism
- Forges are **optional intensity spikes**
- Cautious players: skip forges, safer run, fewer abilities
- Aggressive players: hit every forge, chaos builds, high risk/reward
- Natural difficulty scaling based on player choice

## Visual Feedback

During creation:
- Sparks, energy particles building up
- Progress indicator (could be literal bar, or visual intensity)
- Sound design: building hum, crackling energy
- Forge glows brighter as completion approaches

On success:
- Flash of light
- Item appears above forge
- Triumphant sound

On failure:
- Sparks scatter
- Forge dims/smokes
- Disappointed sound (but not punishing)

## Streaming Integration

Token streaming from inference can drive visual feedback:
- Each token chunk = energy pulse
- Longer generation = more buildup
- Natural variation in creation "intensity"

## Open Questions

- How many forges per run? Rare (1-2) or frequent (every room)?
- Can forges be "lost" if player dies during defense?
- Is there a "cancel" option if overwhelmed?
- Do different forge types generate different ability categories?
- Forge placement: fixed locations, random spawns, or player-triggered?

## Theming Options

The "forge" could be:
- Ancient magical forge (fantasy)
- Glitchy terminal/machine (sci-fi)
- Mysterious altar (eldritch)
- Growing crystal/plant (nature)
- Whatever fits the world we build

Name TBD - "Forge" is placeholder. Could be: Crucible, Altar, Beacon, Nexus, etc.

# Frozen Reservoir Probe Subsystem — Experiment Seed

*Created: April 5, 2026 | Last Updated: April 5, 2026 | Robby Ranshous*

## What This Is

Seed context for pairing on the frozen reservoir + linear probe subsystem. The conceptual architecture is documented in `frozen-reservoir-probe-subsystem.md` — read that first if you haven't. This doc is about building a working prototype to experiment with.

## Vocabulary (use precisely)

- **Model** — fixed weights, pure potential
- **Embodiment** — repo/scaffolding + soma that actualizes a model
- **Actant** — the emergent entity that individuates through operation within an embodiment
- **Soma** — the serializable self, assembled from per-section files before each inference call; visible to the actant
- **Chassis** — load-bearing infrastructure opaque to the actant (loop, tool surface, subsystems)
- **Tick** — one cycle of the game loop. Not 1:1 with inference. onTick runs code at game speed; cognition fires only between rounds
- **Reservoir** — a frozen small LLM used for a single forward pass to project input into high-dimensional activation space. No generation. Not inference.
- **Probes** — linear layers trained on reservoir activations. The only trainable component. What actually learns.

## What We're Building

A chassis subsystem that:

1. Takes raw game state as input
2. Passes it through a frozen small LLM (single forward pass, no generation)
3. Extracts intermediate activations from the forward pass
4. Runs trained linear probes on those activations to produce derived values
5. Injects those values into the `world` and `me` objects before onTick fires

The actant never sees this subsystem. It just gets richer `world` and `me` data.

## The Prototype Game

We need an all-actant game — no human player — so we get deterministic replay for counterfactual evaluation. Keep it simple. The game is a means to test the subsystem, not a product.

Suggestion: a minimal pursuit game. Grid world. One pursuer actant, one evader actant. Each has an onTick that reads `world` and calls movement actions. Rounds end on capture or timeout. Clear outcome signal.

The game needs:

- A tick loop that calls each actant's onTick(me, world) every cycle
- Round boundaries where actant cognition (big LLM) fires for reflection
- Serializable game state at every tick (for replay)
- Outcome scoring per round

## Tech Stack

- **TypeScript** for the game loop, chassis, tick infrastructure
- **Python** for the reservoir/probe layer (PyTorch or similar — this is where the frozen LLM lives, where activations get extracted, where probes train)
- Bridge between them: the TS game loop calls out to the Python probe service per tick. Keep it simple — local HTTP or stdio pipe. Latency matters since this runs every tick.

Alternative: if a small enough model exists as ONNX, run it in-process in Node via onnxruntime-node. Eliminates the bridge. Worth investigating.

## Reservoir Model Selection

Needs to be:
- Small enough to forward-pass every tick without bottlenecking the game loop
- Large enough that its activation space is meaningfully rich
- Available with accessible intermediate layer activations (not just logits)

Candidates to investigate:
- TinyLlama (1.1B) — maybe too large for per-tick
- SmolLM (135M–1.7B range) — worth benchmarking
- Phi-2 (2.7B) — probably too large
- GPT-2 small (124M) — well-understood, easy to extract activations from, might be the right starting point for experimentation
- Any small model available as ONNX with layer access

First experiment should establish: what's the per-forward-pass latency for candidate models on Robby's hardware? That sets the ceiling for game loop speed.

## Probe Architecture

Linear probes. Keep it simple:
- One probe per derived value (e.g., `threatLevel`, `pursuitUrgency`, `confidence`)
- Each probe: single linear layer from activation vector → scalar or small vector
- Training: standard linear regression / logistic regression on accumulated (activation, label) pairs
- Storage: probe weights serialize to disk between sessions. This is part of the actant's persistent state (in chassis, not soma).

## Training Pipeline

Three signal sources, all cheap — no big LLM in this loop:

### 1. Outcome data
Every tick's reservoir activations paired with end-of-round outcome. Regression target: did this activation state lead to a good round?

### 2. onTick branch tracing
Instrument the onTick execution to capture which branches fired and what values were read. The code IS the fitness function — trace it, don't interpret it. If `world.threatLevel > 0.7` triggered pursuit and the round was won, that's a positive training signal for the threatLevel probe producing >0.7 in similar activation states.

### 3. Actant reflection (harvested from memory)
Between rounds, the actant writes observations to its memory section. Parse these as soft labels. "Overcommitted on that flank" → negative signal for the activation states during that flank. This is noisier — defer until pipelines 1 and 2 are working.

## The Dual Pipeline Experiment

Run both training approaches in parallel on the same game:

- **Pipeline A — Counterfactual**: After each round, freeze the opponent's onTick, replay the round with perturbed probe values, measure outcome delta. Clean gradient.
- **Pipeline B — Correlational**: Accumulate (activations, outcomes) over many rounds, regress. No replay.

Compare: convergence speed, final probe quality, stability. This tells us what we lose when a human enters the loop later.

## Implementation Order

### Phase 0: Benchmark reservoir candidates
- Forward-pass latency for candidate models on local hardware
- Activation extraction: confirm we can pull intermediate layer activations efficiently
- Decide: Python service vs ONNX in-process

### Phase 1: Minimal game loop
- Grid world, two actants (pursuer/evader), tick loop, round boundaries
- Static onTick code (hand-written, no reflection yet) — just get ticks running
- Raw `world` object with basic game state
- Logging: full game state at every tick, serializable for replay

### Phase 2: Wire in reservoir
- Forward pass on game state each tick
- Extract activations
- Define 2-3 probe targets (start simple: `threatLevel`, `distanceUrgency`)
- Untrained probes producing random values — confirm the plumbing works
- Enriched `world` object reaching onTick

### Phase 3: Training pipeline A (counterfactual)
- Accumulate (activations, tick, round outcome) buffer
- After each round: replay with perturbed probes, compute gradient
- Train probes
- Measure: do probe outputs improve over rounds?

### Phase 4: Training pipeline B (correlational)
- Same buffer, no replay
- Regression on accumulated data
- Compare with pipeline A outputs

### Phase 5: Add actant cognition
- Between-round reflection via big LLM (Claude via OpenRouter)
- Actant can rewrite onTick code
- Observe: does the implicit fitness coupling work? Do probes adapt when onTick changes?
- Harvest reflection as soft labels (pipeline 3, lower priority)

### Phase 6: Measure and iterate
- Compare dual pipelines
- Experiment with probe retraining cadence
- Try different reservoir models if Phase 0 surfaced multiple viable candidates
- Try `me` enrichment (dispositional signals) in addition to `world` enrichment

## Directory Structure (suggested starting point)

```
frozen-reservoir-experiments/
├── CLAUDE.md              ← you are here (or pointing here)
├── game/
│   ├── loop.ts            ← tick loop, round management
│   ├── world.ts           ← world state assembly
│   ├── actant.ts          ← actant interface (onTick, reflection)
│   └── replay.ts          ← deterministic replay for counterfactuals
├── reservoir/
│   ├── service.py         ← frozen model forward pass + activation extraction
│   ├── probes.py          ← linear probe definitions, training, serialization
│   └── bridge.ts          ← TS side of the game↔reservoir communication
├── training/
│   ├── buffer.ts          ← rolling buffer of (activations, branches, outcomes)
│   ├── counterfactual.ts  ← pipeline A
│   ├── correlational.ts   ← pipeline B
│   └── compare.ts         ← dual pipeline comparison metrics
├── actants/
│   ├── pursuer/
│   │   ├── soma/          ← per-section soma files
│   │   └── probes/        ← serialized probe weights
│   └── evader/
│       ├── soma/
│       └── probes/
└── data/
    └── rounds/            ← serialized round data for replay and analysis
```

## Settled Decisions

- Reservoir lives in chassis (opaque to actant)
- Frozen weights — only probes train
- Integration via `world` and `me` enrichment on onTick arguments
- No big LLM inference in the training loop
- All-actant game for prototype (deterministic replay)
- Dual training pipelines for comparison
- TypeScript game loop, Python reservoir/probe layer

## Open Questions (to be answered by experimentation)

- Which frozen model? (Phase 0 benchmarking)
- In-process ONNX vs Python service? (Phase 0)
- Which activation layers to probe? All? Last N? Specific layers?
- How many ticks of data before probes start converging?
- Retraining cadence — every round? Every N rounds? Continuous?
- Rolling buffer size — how much history matters?
- How sensitive are probes to onTick rewrites? (Phase 5)
- Does `me` enrichment add value beyond `world` enrichment? (Phase 6)

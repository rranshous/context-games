# Frozen Reservoir + Linear Probe Subsystem for Actant Embodiment

*Created: April 3, 2026 | Last Updated: April 3, 2026 | Robby Ranshous*

## Core Concept

A small frozen LLM used as a reservoir computer within the actant's chassis. The model's weights never change — it provides a rich, high-dimensional nonlinear transformation of raw input via a single forward pass. Linear probes trained on the resulting activations are the only trainable component. This is not inference. There is no generation, no token cost. The reservoir transforms; the probes extract.

This subsystem provides **learned but non-deliberative** behavior — richer than a state machine, cheaper than inference. It is the actant's reflex layer.

## Architectural Placement

The subsystem lives in the **chassis**. It is opaque to the actant's cognition, just like the loop, tool execution, and signal dispatch. The actant never inspects the mechanism, but everything it experiences is shaped by it.

This creates two parallel tracks of individuation:

- **Soma-level individuation**: narratively available, deliberate, happens through reflection and self-modification of sections (identity, memory, signal handlers, onTick code)
- **Probe-level individuation**: invisible to the actant, happens through accumulated exposure, manifests as shifts in perception and readiness that the actant cannot fully articulate

The actant gets better at things without deciding to get better at them.

## Integration Surfaces

The reservoir+probes wire into the existing embodiment at the `world` construction step, before the onTick fires:

```
Raw game state → reservoir forward pass → probe extraction → enriched world object → onTick(me, world)
```

Two enrichment surfaces:

- **`world` enrichment**: Probes produce derived perceptions — threat assessments, pursuit urgency, terrain reads, situational classifications. These appear as fields on the `world` object. The actant's onTick code reads them like any other game state. It does not know they are learned.
- **`me` enrichment**: Probes produce dispositional signals — confidence, readiness, recent performance assessments. The body reporting its own state to the mind. The onTick code can branch on these without knowing their origin.

## Relationship to the Tick/Inference Distinction

In implementations like the desert pursuit game, the onTick runs at game-loop speed (every tick) and the actant's actual cognition fires between rounds for reflection. The reservoir+probes operate at **tick frequency** alongside the onTick code. Both are sub-cognitive. Both are fast.

The difference:

- **onTick code** is *written* behavior — authored by the actant's cognition during between-round reflection
- **Probe outputs** are *trained* behavior — patterns learned from accumulated exposure

At runtime these are coupled: the onTick code consumes probe-enriched data. The actant authors code that depends on perceptions it doesn't know are learned.

## Training Signal Sources

Three candidates, likely blended:

### 1. Outcome Data
The game produces natural labels. Rounds end with measurable outcomes traceable to tick-level states. Accumulate (reservoir activations at tick N, round outcome) pairs. Train probes on those.

### 2. The Actant's Own Reflection
Between rounds, the actant reviews what happened and writes judgments into memory — "that approach worked," "I overcommitted on that turn." These can be harvested as soft labels. The mind labels training data for the body without knowing it's doing that.

### 3. Behavioral Alignment with onTick Code
The onTick is executable code with explicit branching logic. It can be traced mechanically — no LLM interpretation needed. If the code says `if (world.threatLevel > 0.7) { me.pursue(world.playerBearing) }`, you know what the code wants `threatLevel` to mean. Instrument onTick execution, capture branch paths, pair with outcomes, train probes to produce values that lead to better branch selections.

**Important**: no big LLM inference in this loop. The training pipeline is code execution and linear algebra.

### Two Kinds of Reflex Development

Sources 1 and 3 produce **practice-trained reflexes** — the body getting better at executing explicit strategy. Like training through willpower and repetition.

Source 2 produces **attention-trained reflexes** — the body getting better at noticing what the actant finds salient. Shaped by focus rather than intent.

Both are sub-cognitive once trained. They get there through different doors — one through the will, one through the gaze.

## Implicit Fitness Function Coupling

When the actant rewrites its onTick code during reflection, it implicitly reshapes the fitness landscape for the probes. New branches, new thresholds, new variable reads automatically shift what the probes are optimized toward on the next training pass. No explicit coordination needed. The mind changes strategy; the body adapts to serve it.

## The Counterfactual Problem

Evaluating whether different probe outputs would have led to better outcomes requires either:

- **Counterfactual replay** (deterministic case): Freeze opponent onTick, rerun the round with perturbed probe values, observe difference. Clean gradient. Only possible when all players are actants.
- **Correlational learning** (human-in-the-loop case): Over many rounds, regress probe output patterns against outcomes. No replay needed. Noisier, slower to converge, but works when the game isn't fully deterministic from the system's perspective.

## Prototype Plan

Use an **all-actant game** (e.g., Glint — squid vs. sharks) where the entire simulation is deterministic and counterfactual replay is available.

Run **both training approaches in parallel** on the same game, same actants, same reservoir:

- Pipeline A: counterfactual replay
- Pipeline B: correlational

Compare convergence speed, final performance, stability. This directly measures what you lose going correlational — which is the cost of introducing a human player later.

If correlational converges to similar values as counterfactual, you've validated it's sufficient even when you don't need it.

This is also where to discover mechanical details: probe retraining cadence, rolling buffer sizing, sensitivity to hyperparameters.

## Open Questions

- What is the right size/architecture for the frozen reservoir model relative to the actant's primary model?
- How does probe training history factor into embodiment migration or model swaps? The actant doesn't know it has a trained perceptual substrate, but continuity depends on preserving it.
- Does the actant benefit from *any* awareness of the probe layer, or is full opacity the right default?
- How do probes interact when multiple enrichment targets compete or contradict?
- What is the right retraining cadence — every round, periodic, triggered by performance degradation?
- Can probe sets be shared or transferred between actants in the same habitat, and what would that mean for individuation?

## Prior Art / Context

Robby has done experimental work treating a frozen LLM after a single forward pass as a reservoir in the reservoir computing sense, with linear probes as the trainable readout layer. The term "frozen" is important — the LLM's weights are fixed; only the probes learn. This work predates and motivates the embodiment integration described here.

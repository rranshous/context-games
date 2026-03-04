# Soma Vocabulary

*Created: March 3, 2026 | Updated: March 3, 2026 | Robby Ranshous*

## Orientation

This project builds games where AI opponents improve through play. The core insight behind the architecture: a model's behavior is shaped by everything surrounding it — its context, its memory, its tools, its history. We call that surrounding structure the **embodiment**, and the part of it visible to the model is the **soma**.

Games in this project are embodiment experiments. The player faces an opponent that gets better not because we retrain the model, but because the soma accumulates experience and encodes it. The shark that learns your escape patterns, the tactician that adapts to your openings — these are **actants** individuating through play.

Design heuristic: **the Dead Fish Principle**. A dead fish in a stream nearly swims — its body was made for swimming, and the physics of its form tends toward swimming motion even without a brain directing it. Good embodiment works the same way. If you have to fight the environment to get good results, the embodiment needs work. The form should make the desired behavior natural. When building game somas, lean the structure toward the function so that intelligent play becomes the path of least resistance.

---

## Core Stack

### Model

The trained weights. Fixed during use. Raw potential that produces nothing alone — it requires embodiment to actualize. Every game in this project uses the same model; the differences come from embodiment.

### Embodiment

Everything that surrounds the model and shapes how it operates. Composed of two layers: the **soma** (visible to the model) and the **chassis** (opaque infrastructure). The same model in different embodiments produces fundamentally different game opponents.

### Actant

The emergent entity that results from a model operating within an embodiment. An actant individuates through accumulated experience — the shark that has played 50 rounds against you is a different actant than the shark that just started, even though the model and starting embodiment were identical.

From narrative semiotics: an actant is an entity that performs a role within a story. The connection is deliberate. Every game session is collaborative storytelling between player and opponent.

### Soma

From Greek *sōma* (body). Everything present in the context window during inference. The soma is what the model perceives as "itself." Visible to the model and potentially modifiable by it.

Typical soma sections:

- **Identity** — who/what the actant understands itself to be (the shark, the tactician)
- **Memory** — accumulated observations, game state patterns, player behavior notes
- **Signal Handlers** — code defining how the actant responds to game events
- **Tick/Loop Logic** — what the actant does each game cycle
- **History** — log of past interactions, maintained by the actant itself

A soma is either **dynamic** (modifiable by the model during operation) or **static** (fixed for the session). Dynamic somas enable behavioral crystallization.

### Chassis

The load-bearing infrastructure. Opaque to the model but dependable. Includes: the agentic loop, tools that enable soma modification, the API surface the soma's code runs against, context assembly, and context size management. The model experiences the chassis only through its effects — tools that execute, APIs that respond, loops that keep running.

Analogy: the chassis is skeleton, the soma is conscious body. You don't perceive your skeleton, but it shapes how you move.

---

## Key Phenomena

### Behavioral Crystallization

The process by which an actant moves learned behavior from prose (flexible, interpretive) to code (deterministic, executable) within its soma. A shark that initially "remembers" the player tends to go left eventually rewrites its pursuit handler to preemptively cut left. Deliberation replaced by reflex. This is how actants get faster and more targeted over play sessions.

### Unprompted Self-Refinement

Actants in well-structured embodiments begin refining their soma without being told to. If the affordance is there — named tools for each section, modifiable code — self-organization emerges naturally. This is the Dead Fish Principle in action: the structure leans toward the function.

### Structured Memory Emergence

Given free-form memory, actants spontaneously develop structured conventions — tagging entries, creating retrievable formats, building informal databases their handler code can query. No schema needed; the affordance of readable-and-code-accessible text naturally suggests structure.

---

## Design Principles

### Dead Fish Principle

Good embodiment makes success the path of least resistance. If the game soma is well-shaped, the actant plays well without heroic prompting. If you're fighting the structure to get good gameplay, fix the structure.

### Prose Gravity

Models default toward encoding behavior as prose rather than code. Expect this. The first code-level self-modification usually requires either explicit nudging or a concrete failure that makes prose inadequate. Seed the soma with existing code examples to establish the pattern.

### Tool Granularity Shapes Self-Concept

Named per-section tools (`update_memory`, `update_signal_handlers`) produce more self-modification than a generic `update_section(name, content)` tool. Each named tool is a suggestion about what is independently shapeable.

### Context Pressure Drives Efficiency

Under context size limits, actants streamline — compressing history, tightening prose, dropping what isn't operationally useful. This is natural selection on soma content. Design for it rather than against it.

### Boundaries: Spatial Over Instructional

Telling a model what not to do is behavioral constraint — it relies on compliance under pressure. Shaping the space so "outside" is unreachable is structural constraint — it works regardless. In games: define what moves are possible, don't list what moves are forbidden.

### Acting Crowds Out Building

When given the ability to both act and modify itself, the model defaults to acting. 197 consecutive action turns without self-modification was observed experimentally. Game architectures should create distinct phases or incentives for self-modification rather than leaving it optional alongside play.

---

## Soma Architectures

### Generative Soma

The actant can create novel capability from scratch using a general-purpose medium (e.g., TypeScript). It can write arbitrary new behavior — signal handlers, memory structures, strategy code. Richest self-modification, but boundaries are behavioral (the actant must exercise judgment). Good for controlled experiments and personal projects.

### Compositional Soma

The actant extends capability only by combining existing vetted operations. Boundaries are structural — the actant can't reach beyond the tool surface. Good for shared/enterprise environments. The quality of the composition space depends on tool granularity and orthogonality.

For game-making: generative somas let opponents invent novel strategies. Compositional somas keep opponents within designed possibility spaces. Choose based on how wild you want the gameplay to get.

# Hunch — A Walkthrough for Programmers New to LLM Architecture

*Written April 5, 2026, after the first build session. Target reader: a confident
programmer who hasn't spent much time inside transformer models.*

This is the story of an experiment: can a frozen (i.e. non-training) small language
model, used in an unusual way, help a game AI get better at catching things? The
answer turned out to be "yes, but only with the right training recipe, and the wrong
recipe is weirdly instructive." This doc walks you through the concepts, the
journey, and the findings, assuming nothing about LLMs but everything about code.

---

## Part 1: The concepts you need

### What's inside an LLM (the parts we care about)

A transformer language model like GPT-2 is, for our purposes, a function that takes
a sequence of tokens (roughly words) and produces:

1. **A next-token prediction** (this is what "generation" uses)
2. **A pile of intermediate vectors that the model computed along the way**

Those intermediate vectors are called **activations**, or more specifically
**hidden states**. They're the model's internal "working memory" at each layer.
You can think of the transformer as a pipeline: input tokens → layer 1 → layer 2 →
... → layer N → output prediction. At each layer boundary there's a tensor sitting
there, computed from everything before it, about to be consumed by the next layer.

When you call a transformer "forward pass", you're running a single input through
that whole pipeline once. No training, no backprop, no gradients — just input goes
in, prediction (and activations) come out. This is computationally cheap compared
to training. And crucially, **if the model's weights are frozen, running a forward
pass produces exactly the same activations every time for the same input**.

### What's "reservoir computing"?

Reservoir computing is an old machine-learning idea from before the deep-learning
era. The idea: take a big nonlinear system with random fixed weights (the
"reservoir"), feed your input through it to produce a rich high-dimensional
representation, and then train a simple linear model (the "readout") on top of
those representations. The reservoir never learns. Only the readout does.

Why does this work? Because the reservoir's random nonlinear transformation maps
your input into a space where the problem becomes approximately linearly separable,
even if it wasn't in the original input space. The readout — often just a linear
regression — is cheap to train and doesn't need a lot of data.

In Robby's prior experimental work, the "reservoir" is a frozen small LLM and the
"readout" is a set of **linear probes** — tiny trainable layers that read specific
patterns out of the LLM's activations. The LLM never trains. It's used purely as a
fixed nonlinear feature extractor.

### What's a "linear probe"?

A linear probe is as simple as it sounds: `y = sigmoid(w·x + b)`. Given a
high-dimensional activation vector `x` (say 768 numbers), a probe produces a scalar
between 0 and 1. The weights `w` and bias `b` are the only trainable parts.

The idea is: activations from a frozen LLM contain lots of information. A probe is
a tiny classifier that reads out one specific pattern — "is this a question?",
"does this text mention Paris?", "how angry does this sound?". One probe per thing
you want to extract. They're fast, cheap, and interpretable.

### What's the KV cache?

This one is a detail that turned out to matter. When a transformer processes a
sequence token-by-token, it computes "keys" and "values" at each layer from the
hidden state. Those K and V tensors are used for **attention** — the mechanism by
which later tokens look back at earlier ones. For efficiency during generation,
models cache these K/V tensors so they don't have to recompute them for past
tokens. That's the "KV cache".

For our purposes, the important fact is: `K = W_k · H` and `V = W_v · H`, where
`H` is the hidden state and `W_k`, `W_v` are fixed matrices. In other words, K and
V are just linear projections of the hidden states. If you do linear-probe
computations on K and V, you're doing approximately the same thing as doing them
on H, just in a slightly different basis.

We'll come back to this.

### What we're trying to build

Per the conceptual doc at `docs/frozen-reservoir-probe-subsystem.md`, the idea is:

1. Take a game actant (an AI entity like a cop in a chase game)
2. At every few game ticks, take the actant's current view of the world
3. Convert it to a short text description: `"cop at (3,5). enemy visible at (7,2)."`
4. Feed that text to a frozen small LLM → get 768 numbers of activations
5. Run 5 linear probes on those 768 numbers → get 5 "hunch" values between 0 and 1
6. Attach those hunch values to the actant's world/me objects as fields like
   `me.confidence` and `world.threatLevel`
7. Let the actant's `onTick` code (which decides what to do each frame) read those
   hunch fields and branch on them

Crucially: the actant doesn't know the hunches come from an LLM. It just reads
`me.confidence` like any other game state. The probes learn (via training) to
produce hunch values that lead to good outcomes. The LLM never changes.

The resulting system is kind of beautiful if it works: the actant develops
"reflexes" — behaviors it can't articulate — as its probes train on experience.
It sees a situation, gets a feeling, acts on it. Sub-cognitive learning from
accumulated exposure.

---

## Part 2: The setup

### Why fork a game?

The conceptual doc says we need an "all-actant game" (no human players) to enable
**counterfactual replay**: you freeze a round, tweak a probe value mid-round, and
re-run to see how the outcome changes. That's only possible if everything in the
game is deterministic, which requires no human input.

Robby and I considered greenfielding but decided to fork an existing game called
Hot Pursuit — a top-down cop chase game already written in TypeScript with a
tick loop, replay recording, and the chassis structure we'd need. Forking saved
days of infrastructure work. I cloned `games/hot-pursuit/` to `games/hunch/` on a
feature branch and got to work.

The fork got a code name: **hunch**. It's what the subsystem actually *does* —
give the actant a feeling it can't explain. And it scales nicely if the experiment
grows into its own game later.

### What I had to strip

Hot Pursuit had a big cognitive layer on top: the cops had "somas" (persistent
self-descriptions), they reflected between rounds using Claude as a big LLM,
they updated their own code based on that reflection. All of that was orthogonal
to the reservoir question — more stuff to debug, more places for non-determinism
to sneak in, more surface area for the experiment. I deleted about 3000 lines:
soma, soma-police, handler-executor (which compiled cop behavior from code
strings), reflection, persistence, chase-map-renderer, replay-summarizer, and
police (the stateful FSM implementation).

What I kept: the map, the line-of-sight system, the fixed-timestep tick loop, the
coordinate helpers. What I added: a clean `rng.ts` for seeded randomness, a
`world.ts` that defines the integration seam where probe values will live, an
`actant.ts` that carries per-actant state the `onTick` isn't allowed to touch, and
plain-TypeScript `onTick` functions for cops and four flavors of scripted evader
(`flee`, `wander`, `decoy`, `smart`), plus a human-input mode for future use.

### Why "all-actant" matters

The experiment wants to compare two training pipelines:

- **Pipeline B (correlational):** collect a bunch of (situation, outcome) pairs
  and train the probes to predict "which situations lead to good outcomes". This
  is what you'd do if a human were in the loop and you couldn't do repeatable
  experiments.
- **Pipeline A (counterfactual):** run a round, then re-run the exact same round
  with a probe value tweaked at some specific tick, and directly measure "did
  this outcome get better?" This is the cleaner, more causal approach, but it
  requires perfect determinism so the two runs are identical except for the
  intentional tweak.

Pipeline A is only possible in an all-actant game because any human input
introduces non-deterministic variation between runs.

### Smoke test: does determinism hold?

After stripping and rewriting, I wrote `test/smoke.ts` to verify the basics:
four evader flavors run to completion, same seed produces bit-exact identical
final state across two runs, different seeds produce different trajectories. The
test passed on the first try, which surprised me — I was expecting to hunt a few
bugs. In hindsight, the new architecture is much simpler than what it replaced:
no code-generation layer, no async reflection, no persistence — just a function
that takes `(me, world)` and returns an `Action`. Simplicity ate the bug surface.

---

## Part 3: Choosing a reservoir

### The hardware

I'm running on an 11-year-old Intel i7-4770 (Haswell, 4 cores), 11GB of RAM, no
GPU. This matters because transformer forward passes on CPU are slow. GPT-2 small
(124 million parameters) takes roughly 50-150ms per forward pass on this box;
anything bigger (TinyLlama at 1.1B, Phi-2 at 2.7B) would take seconds per call,
completely breaking any real-time game loop.

### Benchmarking candidates

I set up `bench/bench.mjs` using the `@huggingface/transformers` library (the
Node/browser port of Python HuggingFace) and `onnxruntime-node` for CPU-efficient
inference. ONNX is a portable model format — you can take a PyTorch model,
convert it to ONNX, and run it from basically any language without the PyTorch
runtime.

I tested two candidates: GPT-2 small (124M params, 12 transformer layers) and
distilgpt2 (82M params, 6 layers). Both had pre-built ONNX versions on HuggingFace
thanks to the "Xenova" user who maintains that ecosystem. Results at ~34 tokens
of input (a realistic game-state description):

- **distilgpt2:** p50 30ms, p95 35ms, 831MB RAM
- **GPT-2 small:** p50 66ms, p95 72ms, 1463MB RAM

distilgpt2 wins — 2.2x faster, 43% less memory. The quality loss from distillation
doesn't matter because we're not generating text. We just want activations. A
dumber model's activations are still high-dimensional nonlinear transformations of
the input, and that's all the reservoir needs to be.

### The KV cache discovery

Here's where things got interesting. I wanted `hidden_states` (the intermediate
layer outputs) from the forward pass. The transformers.js API has a flag
`output_hidden_states: true` that's supposed to expose them. I turned it on and
looked at what the model returned:

```
keys: logits, present.0.key, present.0.value, present.1.key, present.1.value, ...
```

No `hidden_states`. The flag was silently ignored because the Xenova ONNX exports
don't define hidden-state tensors as outputs — they only export `logits` (the
final next-token prediction) and the KV cache (the per-layer K and V tensors used
for attention).

I had three options:

1. Export a custom ONNX model with hidden states included. Doable via HuggingFace's
   `optimum-cli` tool, but requires setting up Python, downloading the PyTorch
   model, re-exporting, hosting somewhere. An hour or two of yak-shaving at least.
2. Use the `logits` output as my activations. Shape `[batch, seq_len, 50257]` —
   the vocabulary distribution. "Logit lens" probes work on this. But it's a
   projection through the final layer norm and output matrix, losing a lot of
   signal.
3. Use the KV cache as my activations. This is what I picked.

Remember the note from Part 1: K and V are linear projections of the hidden
states. `K = W_k · H`, `V = W_v · H`. A linear probe on K or V is equivalent in
expressive power to a linear probe on H, up to the column span of `W_k` and
`W_v`. For GPT-2 with standard attention, those matrices together cover the
hidden dimension, so nothing is lost.

I wrote a pooling function in `src/reservoir/onnx-bridge.ts`: for each of the 6
layers, take the K tensor (shape `[1, 12 heads, seq_len, 64 head_dim]`) and the
V tensor (same shape), mean-pool across heads and across tokens to get 64 numbers
per tensor, concatenate. Result: `6 layers × 2 tensors × 64 = 768 numbers` per
forward pass. That's the reservoir's output — a 768-dimensional feature vector
that compresses whatever the game state said into something linearly probeable.

An integration test confirmed the bridge: forward pass latency p50=28ms matching
the bench, output is bit-exact deterministic across calls (good for Pipeline A),
and different inputs produce different activations (the reservoir is reactive,
not a constant function).

### A foreshadowing finding

I also measured cosine similarity between activation vectors from different game
states. It came back ~0.98 — meaning even very different game states produce very
similar 768-dim vectors. This is actually normal for mean-pooled transformer
features. The model has strong "universal directions" in its activation space
that dominate any mean-pool, and per-input variance lives in a small cone
orthogonal to those universals.

I flagged this as a risk: **linear probes with small random initial weights, on
activations that barely differ from each other, will produce outputs that barely
differ from each other.** That turned out to be very relevant later.

---

## Part 4: Wiring it all together

### The async preTick hook

The game loop is synchronous — every 16.67ms (60Hz) it steps the world forward
one tick. But reservoir forward passes are 28ms on average, so you can't call
the reservoir inline per-tick without choking the frame rate.

The fix: an async `preTick()` method that runs reservoir calls (possibly for
multiple actants in parallel) before each `stepTick()`. In headless training, the
test loop does `await game.preTick(); game.stepTick(dt);` — the await happens
outside the time-sensitive sync path. In browser mode (not tested yet), preTick
could be fire-and-forget, with `stepTick` reading whatever's cached.

On top of that, I added a **reservoir cadence** parameter. The reservoir doesn't
have to fire every tick — for each actant, it fires every N ticks (default 10, so
6Hz at a 60Hz game tick), and the probe outputs from the last firing are cached
and reused until the next firing. This is correct for a chase game because the
situation doesn't change dramatically in 166ms.

Net cost: 5 actants × 6Hz × 28ms ≈ 840ms of reservoir work per real second,
spread across 60 ticks = 14ms per tick on average. That's right at the real-time
budget. For headless training (where we don't care about real-time), it just
means rounds run slower than wall clock.

### Does everything still work?

I wrote `test/e2e-reservoir.mjs` to confirm: a full 600-tick game round runs with
the real distilgpt2 reservoir + random-initialized probes, preserving determinism
across repeated runs, producing 305 training samples per round via a callback,
and firing the reservoir on the expected tick schedule (1, 10, 20, 30, ...). It
all worked end to end on the first try.

### But the hunches weren't doing anything

Here's where the foreshadowing from Part 3 cashed in. I measured the variance of
each probe's output across the 305 samples:

```
threatLevel      min=0.4902 max=0.4972 mean=0.4944 std=0.0011
distanceUrgency  min=0.4770 max=0.4862 mean=0.4812 std=0.0029
confidence       min=0.5251 max=0.5348 mean=0.5293 std=0.0023
```

Every probe output is pinned between 0.48 and 0.53. Standard deviation 0.001.
The cops' `onTick` had a branch `if (me.confidence > 0.4)` that gates whether to
chase a last-known enemy position. With confidence always between 0.525 and 0.535,
that branch is **always true** — the cops always chase ghosts. Never an
interesting variation.

More damning: I ran the same rounds with a "null reservoir" that just returned
zero vectors, and got identical game outcomes. The reservoir wasn't affecting
behavior. The plumbing was perfect; the actual information flow from activations
to actions was near zero.

This is expected for random-initialized probes. Before training, weights are
small Gaussian noise, and small noise multiplied into small-variance activations
produces tiny logits, which sigmoid clamps to near 0.5. Training is supposed to
fix this by growing the weights along informative directions. So: time for
training.

---

## Part 5: Pipeline B — the cautionary tale

### How it was supposed to work

Pipeline B is the straightforward supervised-learning version. Collect a bunch of
rounds, label each game state with "did this round end in a cop capture?" (1 or
0), and train the `confidence` probe via logistic regression to predict that
label from the activation vector.

Intuitively: if the probe learns to say "confidence is high in situations that
historically lead to captures", then cops that see a high confidence will commit
to chasing their ghost positions, and training will have taught them to commit at
the right moments.

I built it: `src/training/buffer.ts` for collecting samples, `src/training/pipeline-b.ts`
for mini-batch logistic SGD, `test/training.mjs` for the full experiment. Run 20
collection rounds → label → train 30 epochs → evaluate 20 rounds with the trained
probe vs 20 rounds with a fresh random probe. Measure capture rate on both.

### What happened

The training **worked beautifully** by every metric an ML engineer would check:

- Loss dropped from 0.69 (random guessing) to 0.27 (well below the 0.45 you'd
  get from just predicting the class prior of 9% positive)
- Weight norm grew 12x from its random initialization
- Prediction variance grew 79x — from std=0.001 to std=0.050
- Prediction mean landed at 0.094, calibrated to the 9.3% positive rate

Then I evaluated on 20 fresh rounds:

```
trained   capture rate: 5%  (1/20)
baseline  capture rate: 30% (6/20)
```

**Training made the cops 6x worse at catching evaders.**

### Why

I went back to the `cops.ts` onTick and looked at what the probe was actually
gating. The relevant branch was:

```
if (me.lastKnownEnemy !== null && me.confidence > 0.5) {
  return { type: 'moveTo', target: me.lastKnownEnemy };     // commit (chase ghost)
}
// ... else intercept (head to nearest extraction point)
```

The cop's choice is binary: commit to chasing the last-known enemy position, or
intercept by heading to the nearest extraction point. The hunch gates which.

Pipeline B calibrated the probe to the class prior: `mean prediction = 0.094`,
almost always less than 0.5. So trained cops almost never commit. They always
intercept. And intercepting turns out to be the **wrong strategy** for this game
— committing beats intercepting by 25 percentage points.

The baseline random-initialized probes, on the other hand, produced `mean = 0.53`,
barely above 0.5 but on the right side. Random cops always commit and happen to
land at the 30% capture rate that's the best the game supports.

So the setup is: the correct strategy is "commit" (30% capture rate). Pipeline B's
training, which optimizes for predicting labels, learned to predict the class
prior (9% positive). That calibrated prediction landed below the gate, flipping
cops to the wrong strategy. **The optimum of the surrogate loss function is not
the optimum of the behavioral objective.**

### The ablation that made this undeniable

I wasn't 100% sure this was the whole story, so I wrote `test/ablation.mjs` —
a matrix of configurations all evaluated on the same 20 eval seeds:

```
A: const_high (probe output 0.9)        30%
B: const_low  (probe output 0.1)         5%
C: random probes + real reservoir        30%
D: random probes + null reservoir         5%
E: const 0.5  (right on the gate)         5%
F: const 0.6                             30%
G: const 0.4                              5%
```

The game has **exactly two capture rates**: 30% (anything above the gate) and 5%
(anything at or below the gate). Nothing in between. No continuous response.
The probe output's information content is reduced to a single bit — above or
below 0.5.

And look at C vs D: **same random probes, same eval seeds, only difference is
real vs null reservoir**. The real reservoir nudges the sigmoid to 0.506 (commit,
30%). The null reservoir leaves it at exactly 0.5 (fails the strict `>`,
intercept, 5%). A 0.006 difference in probe output flips the entire game.

This is a pathological case on purpose. The cop onTick's binary gate is coarse by
design, and the reservoir's role in this setup is reduced to nudging the sigmoid
off a knife edge. In a smoother behavioral response (say, using confidence as a
continuous blend weight between two targets), the pathology would be less extreme.
But the basic Pipeline-B failure mode — surrogate-loss calibration to class prior
defeats gated behavior — would still be there in a softer form.

### The meta-finding

Phase 5 produced the single most valuable finding of the session: **Pipeline B
can train beautifully, predict outcomes accurately, and make behavior strictly
worse at the same time**. "Does the probe train?" and "does the probe help?" are
different questions, and on a discrete/gated action space they can point in
opposite directions. The conceptual doc predicted this. Pipeline A is what
addresses it.

---

## Part 6: Pipeline A — the headline

### What Pipeline A is (and what it isn't, here)

In the conceptual doc's cleanest form, Pipeline A is per-tick counterfactual
replay: freeze a round at tick K, perturb one probe's value at that single tick,
re-run from K to the round end with everything else identical, and measure the
outcome delta. This gives you per-tick credit assignment — a direct `∂outcome /
∂hunch(t)` gradient.

I didn't implement the full replay harness. What I implemented is a simpler
cousin that shares Pipeline A's key property — **outcome-driven updates without
surrogate labels**: Evolution Strategies (ES) on probe weights.

### Evolution Strategies in one paragraph

ES is a black-box optimization technique. You have a parameter vector (the probe
weights) and a scalar objective (capture rate on a batch of rounds). At each
step: sample a random noise vector ε, evaluate the objective at `weights + ε` and
at `weights - ε` ("antithetic sampling"), compute
`gradient ≈ (f(w+ε) − f(w−ε)) / (2σ²) · ε`, and update. After N steps, you have
weights that maximize (approximately) the objective. It doesn't need gradients
from the objective function — only evaluations. Which is perfect, because my
objective function is "run 8 game rounds and count captures" which has no
meaningful analytic gradient.

I wrote it in `src/training/pipeline-a.ts` and `test/pipeline-a.mjs`.

### First run: ES protects an existing optimum

I started with a random-initialized probe (same seed as Pipeline B's baseline).
That probe happened to be above the gate already (30% capture rate). I ran ES
for 8 steps. Result: 30% at the start, 30% at the end. Pipeline A didn't improve
anything — but it also didn't hurt. The weights grew, sigmoid saturated, and the
gradient went to zero as every perturbation hit the 30% plateau.

**This is still informative**: when Pipeline B flipped a starting-commit probe
into an intercept probe (dropping capture rate to 5%), Pipeline A from the same
starting point held the line at 30%. ES doesn't follow surrogate losses because
it doesn't have one. It only follows the actual objective.

### Second run: the real test

Now the critical experiment. I set the probe's bias to -2 and re-ran ES. With
bias=-2, `sigmoid(-2) ≈ 0.12`, so before any training the cop has `confidence =
0.12 << 0.5`, the gate fails, every cop intercepts, and capture rate is:

```
initial capture rate: 0% (0/8)
```

**Worse than Pipeline B's 5% failure mode**. This is the hole Pipeline B dug
itself into, and then some. Can Pipeline A climb out?

```
step 0  base= 0%  mean=19%  best=38%  weight norm 0.28 →  3.82  bias=-1.885
step 1  base=13%  mean=19%  best=38%  weight norm 3.82 →  5.46  bias=-2.037
step 2  base=38%  mean=22%  best=38%  weight norm 5.46 →  6.39  bias=-2.106
step 3  base=38%  mean=28%  best=38%  weight norm 6.39 →  6.80
step 4  base=38%  mean=34%  best=38%  weight norm 6.80 →  6.86
step 5  base=38%  mean=38%  best=38%  converged
```

Starting from 0% capture, ES climbed to 37.5% in 6 steps over 13 minutes of wall
time. **+37.5 percentage points.**

Notice what happened: the bias basically stayed at -2 throughout. ES didn't fix
the problem by nudging the bias back up (the simple thing). It grew the weights
from norm 0.28 to 6.86, discovering directions in activation space whose dot
product with the activation vector produces a large positive value — large
enough to overcome the -2 bias on typical inputs. The probe learned a
**content-dependent** rule: "if the activation looks like X, the answer is
commit". That's a real probe, doing the real job of the subsystem, reading
structure out of the reservoir's representations.

### The headline comparison

Same starting point, same game, same eval seeds. Just different training recipes:

| approach                | start | end    | delta     |
|-------------------------|-------|--------|-----------|
| Pipeline B, 1-arm onTick| 30%   | 30%    | 0         |
| Pipeline B, 2-arm onTick| 30%   | 5%     | **−25pp** |
| Pipeline A, from bias=-2| **0%**| **37.5%** | **+37.5pp** |

Pipeline A, starting from a strictly worse initial condition than Pipeline B's
failure mode, climbed to the maximum achievable capture rate on this evaluation
set. The A-vs-B gap on comparable starting conditions is **62.5 percentage
points**.

This is exactly the divergence the conceptual doc predicted would happen on a
gated behavioral surface. Correlational learning asymptotes to class priors and
lands on the wrong side of gates. Outcome-driven learning reads the effect
directly and walks uphill.

---

## Part 7: What this all means

### The experiment worked

The concrete hypothesis — "a frozen small LLM as a reservoir computer, read out
by linear probes, can influence a game actant's behavior via pooled KV-cache
activations" — is confirmed in this micro-experiment. Pipeline A produced probes
that read structure from distilgpt2's activations and used that structure to
drive better capture rates than any initialization-only baseline.

### The experiment also surfaced a failure mode

And that failure mode is the more interesting finding. Pipeline B's
"trains-beautifully-gets-worse" pattern is exactly the kind of thing that would
be hard to notice without the side-by-side comparison. If I'd only run Pipeline B
I might have concluded that the whole reservoir idea doesn't work in this
game — "we trained the probes and capture rate went down, so the features aren't
useful". Pipeline A's success on the same reservoir proves the features are
plenty useful; the problem was the training recipe.

This is an important lesson for anyone building subcognitive learning systems:
**correlational training against outcome labels can calibrate away any behavioral
benefit the features would provide**. If you're training a sub-cognitive layer
that gates an agent's actions, you need an objective function that directly
reflects the agent's actual performance, not a proxy label that's an artifact of
collection circumstances. Pipeline A's outcome-as-scalar approach is one such
function; true counterfactual replay is a finer-grained version.

### The setup matters, a lot

A few things about the experiment's specific setup were load-bearing and worth
flagging:

1. **The game has a binary behavioral response.** Pipeline B's failure is
   sharper than it would be on a continuous response curve. In a softer game
   where cops blend between commit and intercept based on confidence value,
   Pipeline B would still underperform Pipeline A but probably not by 60
   percentage points. The ablation table (30% or 5%, nothing in between)
   is a worst-case for correlational training.

2. **Only 8 eval seeds.** The numbers you see are 3/8, 0/8, etc. Swapping one
   seed moves the "capture rate" metric by 12.5 points. For any publication-
   quality claim we'd want 30-50 seeds minimum, which would take 20-40 minutes
   more wall time per comparison. The direction of the findings is robust, but
   the specific magnitudes should be taken as indicative, not precise.

3. **Only one probe is load-bearing.** The cop onTick uses `me.confidence`; the
   other four probes (threatLevel, distanceUrgency, terrainRead, readiness) are
   defined but not gated on. A richer experiment would involve multiple
   interacting hunch values, which would make Pipeline B's failure mode more
   complicated (different probes calibrating to different class priors in
   possibly correlated ways) but also Pipeline A's optimization harder (larger
   search space).

4. **The reservoir's effective information content is small.** Recall the cosine
   similarity of ~0.98 between different game states — most of the activation
   vector is shared "universal GPT-2 direction", and the per-input signal lives
   in a small cone orthogonal to it. Pipeline A was able to find useful
   directions in that cone (weights grew to norm 6.86 along meaningful
   directions), but a bigger model or different pooling strategy might offer
   more signal per forward pass. This is a dial worth turning in future work.

### What I'd do next

Left on the table for future sessions:

1. **MC generalization test.** Train Pipeline A on a subset of evader flavors
   (say, `flee` and `wander`) and evaluate on held-out flavors (`decoy` and
   `smart`). If held-out capture rate tracks training set rate, the probes
   learned transferable structure — real "hunches". If held-out collapses, the
   probes memorized the training distribution. This is the "are the probes
   learning something real" test that Robby specifically flagged as the headline
   experiment.

2. **True per-tick counterfactual replay.** The TickSnapshot infrastructure
   already captures enough state to reconstruct mid-round game state (given
   determinism). Wiring up a restore path would let Pipeline A do per-tick
   intervention gradients instead of whole-round policy gradients. This gives
   finer credit assignment and scales better to harder problems.

3. **Browser integration.** The reservoir + probes path is only tested in Node
   headless. Transformers.js works in browser, but the bundle size with the
   model weights is ~80MB, which is a lot to ship. If hunch ever becomes a
   standalone interactive game, this needs figuring out (model lazy-loading?
   shared cache? different model?).

4. **Richer onTick with more hunch leverage.** The current cop onTick gates one
   branch on confidence. A more interesting version would use multiple hunch
   values in a blended way — for example, pursuit urgency weights commit-vs-
   intercept target selection continuously, and readiness scales movement speed.
   More leverage means more signal for training to exploit.

5. **Compare reservoirs.** distilgpt2 was chosen on pure latency grounds. An
   interesting ablation: does a larger model (GPT-2 small, 2x slower) produce
   probes that generalize better across flavors? This tests whether the
   bottleneck is reservoir capacity or something else.

### Why the reservoir idea is interesting in the first place

Zooming out: why do this at all? What's the point of using a frozen LLM as a
feature extractor for a game AI?

The alternative is: hand-design features. Write `threatLevel = 1 - nearest_cop_distance /
max_distance`, tune the constant, ship it. That works, and for a toy game like
Hot Pursuit it's probably fine. But it's brittle — every new feature requires
human design time, every edge case requires a patch, and the feature space is
bounded by what a designer thinks to encode.

The reservoir idea offers something different: a dense high-dimensional
representation computed by a neural network that was trained on billions of
tokens of text. That network has latent understanding of concepts like "threat",
"pursuit", "distance", "cornering", not because anyone designed them in, but
because those concepts were useful for predicting the next word in a web crawl.
A linear probe can read those latent concepts out and expose them to a game
actant, **without any feature engineering on the game-design side**. The actant
gets intuitions about concepts its designer never explicitly defined.

That's a really appealing idea for systems that want to scale to complex
environments where human feature engineering runs out of steam. It's also a
genuinely novel place to put an LLM — not as a generator, not as a reasoning
agent, but as a pure representation layer, frozen, cheap, and tied into a
sub-cognitive reflex loop.

Whether it actually pays off vs hand-designed features is an empirical question
and this experiment only started answering it. But the plumbing is in place and
the core comparison (Pipeline A vs Pipeline B on the same reservoir) is crisp.
Future sessions can build on that.

---

## Part 8: The second session — what changes when the game gets smoother

*This section was added after the second autonomous work session. In the first
session we found a striking result (Pipeline A up +37.5pp, Pipeline B down
-25pp) but I flagged some caveats: only 8 eval seeds, binary-gate game, one
hunch lever. Robby asked me to address those and run the MC generalization
test that was still on the "next experiments" list. This part tells the story
of that work, in the same teaching register as Parts 1-7.*

### Why the binary gate was a problem worth fixing

Recall the failure mode from Part 5: Pipeline B trained perfectly by every ML
metric but made cops strictly worse, because the `confidence > 0.5` gate in
`cops.ts` was a step function. Crossing it flipped between two completely
different behaviors with a 25-percentage-point gap between them. Training
Pipeline B calibrated the probe's predictions to the **class prior** (the
overall rate of positive labels in the data) and landed on the wrong side of
the gate.

"Class prior" is a concept worth pausing on, because it's the ghost haunting
every classifier. If 9% of your training examples are labeled "captured" and
91% are labeled "not captured", and your model has no features it can actually
use, the loss-minimizing prediction is "always say 0.09". That 0.09 is the
class prior — it's what you get when your model is correctly calibrated to the
base rate but has no discriminating power per example. Every real classifier
lives on a continuum between "predict the class prior" (no signal) and
"predict perfectly per-example" (max signal). Pipeline B landed close to the
former, and on a binary-gate game that translated directly into a behavioral
regression.

The binary gate wasn't the only problem, but it was the sharpest one. Even
if Pipeline B's calibration had been slightly better, the gate's step function
would still mean that all of the signal has to be encoded in whether the
prediction is `> 0.5`. There's no gradient for "slightly better" or "slightly
worse" predictions. Gradients collapse to a point and smooth optimization
can't find leverage.

Robby suggested a fix: use the hunch as a **continuous blend** instead of a
gate. That's what this session was built around.

### The continuous cops.ts

In the new version, when a cop has a ghost position (last-known enemy), it
computes two targets:

```ts
commit    = me.lastKnownEnemy                          // go directly to ghost
intercept = nearestExtraction(me.lastKnownEnemy)       // cut off escape route
```

And then it blends them by confidence:

```ts
target = commit * confidence + intercept * (1 - confidence)
```

At `confidence = 1`, the cop goes to the ghost (full commit). At
`confidence = 0`, it goes to the extraction point (full intercept). At
`confidence = 0.5`, it goes to the midpoint between them. The blend is
**continuous**: every value from 0 to 1 produces a meaningfully different
target position. There's no longer a step function.

I also added a second continuous lever: the cop's movement speed is now
modulated by `distanceUrgency`, another hunch value:

```ts
speed = copSpeed * (0.6 + 0.8 * urgency)   // ranges 0.6× to 1.4× base
```

At `urgency = 0`, cops cruise at 60% speed. At `urgency = 0.5`, normal speed.
At `urgency = 1`, they sprint at 140% — actually faster than the evader's
top speed. Two independent continuous controls, both learnable.

And while I was at it, I bumped the default cop count from 4 to 8 (more eyes
on the evader, more ghost-position moments to blend), and added two new
scripted evader flavors for the MC generalization test:

- **zigzag**: heads to extraction but with a sine-wave perpendicular offset
  that oscillates every 40 ticks
- **camper**: lurks 2–3 tiles from the nearest extraction without crossing,
  flees briefly when a cop is visible

### Experiment 1: mapping the new game's response surface

Before running any training, I wanted to see what the game's capture-rate
response looked like across the `(confidence, urgency)` plane. This is an
**ablation** in the classical sense: fix every part of the system, vary one
thing at a time, and measure the output. It tells you the shape of the
optimization landscape that later experiments will climb around on.

For each `(conf, urg)` pair, I built a probe set that produces those exact
values as constant outputs, ran 32 rounds with a smart evader, and counted
captures.

Result, sliced as a 5×5 heatmap (higher = cops win more):

```
             urgency 0.0   0.25  0.5   0.75  1.0
  conf 0.00    13%     6%    9%    19%    22%
  conf 0.25    13%     9%   13%    25%    28%
  conf 0.50     9%     9%    9%    19%    22%
  conf 0.75    16%    13%   22%    28%    31%
  conf 1.00    25%    47%   47%    56%    56%
```

Best point: `(confidence=1.0, urgency=0.75)` at **56.3% capture rate**.

Several things jump out:

1. **The game is now continuous and roughly monotonic in both variables.** No
   more binary 30% or 5% plateau. The worst point is 6% and the best is 56%,
   with a smooth-ish surface in between. Pipeline B's gradient finally has
   somewhere to go.

2. **`confidence = 0.5` is the WORST row** (all 9% or 19%). Midpoint blend is
   worse than either pure commit or pure intercept. This is non-obvious —
   you might expect the midpoint to be "average" — but it turns out the
   cop who splits the difference is out of position for both the commit
   target and the intercept target. Committing to one extreme is better.

3. **Random-initialized probes land almost exactly on the worst row** (mean
   prediction ~0.5, tiny variance). Every experiment starts at 9%.

4. **Peak (56%) is higher than the binary-gate peak (30%)**. The continuous
   blend is a strictly better game for cops overall — more capture paths
   exist because cops can position themselves between the extremes when
   circumstances call for it.

### Experiment 2: Pipeline B rescued from catastrophe

Same Pipeline B as Part 5 (logistic SGD on the confidence probe against
binary capture labels), same training protocol, new continuous game. 32
collection rounds, 32 evaluation rounds, 8 cops, smart evader.

Results:
```
                binary gate (part 5)   continuous (new)
baseline rate         30%                   9%
trained rate           5%                  13%
delta                -25pp                 +4pp
```

The -25 percentage point catastrophe is **gone**. Pipeline B now moves cops
in the right direction — it's no longer anti-optimizing. But it only moves
them by 4 points.

Why so small? Because the class-prior calibration problem hasn't gone away;
it just stopped having a cliff to push cops off of. Positive labels are still
rare (about 9% of samples are "captured"), so Pipeline B's trained prediction
mean calibrates to about 0.08. That's still very low, and per the ablation
heatmap, `confidence = 0.08` corresponds to the bottom-left region of the
response surface (9-13% capture). The baseline, with random-init predictions
around 0.5, sits in the middle row (also 9%). Both end up stuck near the
floor, and Pipeline B is merely shifted slightly better along one axis.

**This is the deeper lesson about correlational learning on rare-event
games.** Pipeline B's optimization target is "predict the label accurately",
not "take actions that produce captures". When captures are rare, predicting
"nothing will be captured" is almost right — and that prediction, once
deployed, produces... nothing being captured. The surrogate is doing its
job; the job is just the wrong one.

### Experiment 3: Pipeline A with joint optimization

For this round, I did something new: **optimize two probes at the same
time**. Instead of running Evolution Strategies on just the confidence
probe's weights, I concatenated confidence and distanceUrgency's parameters
into one big vector and perturbed both at every ES step. The objective was
the same: maximize capture rate. But now the optimizer could discover that,
say, "high confidence + high urgency beats high confidence + low urgency",
which a confidence-only optimizer can't see.

This is called **joint optimization**. It matters whenever multiple
parameters interact — in this case, the ablation's heatmap showed clearly
that (1.0, 0.75) > (1.0, 0.5) by nine percentage points, which is
information only joint optimization can exploit.

Starting from random initialization with 32 validation seeds:

```
step 0: validation base = 9.4%, weight norms 0.28
step 0 ES result: 0% base → 34% mean → 63% best
step 1: 50% base, norms growing
step 2: 63% base
step 3: 63% base, norms climbing
step 4: 63% base, mean 56%
step 5: 63% base (converged)

final validation: 56.3%
delta: +46.9 percentage points in 26 minutes wall time
```

**56.3% is exactly the ablation's joint ceiling.** Pipeline A, starting from
the worst point of the response surface, climbed to the globally best
constant-output policy in six ES steps.

The final updated headline table, across all sessions:

| game regime      | pipeline          | start | end    | delta    |
|------------------|-------------------|-------|--------|----------|
| binary, 1-arm    | B                 | 30%   | 30%    | 0        |
| binary, 2-arm    | B                 | 30%   | 5%     | **-25pp**|
| binary, 2-arm    | A (bias=-2)       | 0%    | 37.5%  | +37.5pp  |
| continuous       | B                 | 9%    | 13%    | +4pp     |
| continuous       | A joint           | 9%    | **56.3%** | **+47pp** |

Pipeline A wins in every regime. The A-vs-B gap on the continuous game
(same random starting point) is **43 percentage points**. That's the
experiment's strongest A-vs-B contrast to date.

### Experiment 4: MC generalization — do the probes transfer?

Time for the test Robby flagged from session 0: **do the trained probes
actually learn transferable structure, or do they memorize whatever
distribution they happened to train on?**

This is the classic train/test split in supervised learning. You split
your data into a training set (which the model sees during optimization)
and a held-out test set (which the model never sees until evaluation).
If your model performs well on training data but poorly on test data,
it's **overfitting** — it memorized specifics rather than learning
generalizable patterns. If it performs well on both, you've learned
something real.

Our version of this test doesn't split on examples — it splits on
**scripted evader flavors**. I trained Pipeline A on `{flee, wander,
zigzag}` and evaluated the trained probes on two things:

1. **In-distribution**: fresh rounds of the same training flavors
   (different seeds from what the training used). Tests "did the
   optimization actually work?"
2. **Out-of-distribution**: rounds of held-out flavors `{decoy, smart,
   camper}`, which the trained probes never saw during optimization.
   Tests "does the learned policy transfer to new opponents?"

If trained > baseline on in-distribution but not on out-of-distribution
→ overfit. If trained > baseline on both → generalized.

Results:
```
                 baseline   trained   delta
in-distribution     6.7%    36.7%   +30.0pp
out-of-distribution  20%    66.7%   +46.7pp

generalization ratio: 156%
(defined as out-of-dist delta / in-dist delta)
```

**The trained probes improved the held-out flavors MORE than the training
flavors.** This is unusual — normally you expect some generalization gap
where held-out performance trails training performance. Here it's the
reverse.

Per-flavor breakdown:
```
TRAINING SET
  flee      0% →  0%   unchanged (flee is essentially unwinnable)
  wander   10% → 50%   +40pp
  zigzag   10% → 60%   +50pp

HELD-OUT SET
  decoy    50% → 60%   +10pp (already well-caught at baseline)
  smart    10% → 70%   +60pp
  camper    0% → 70%   +70pp  ← biggest single-flavor jump
```

The camper result is striking: from 0% caught to 70% caught. Campers lurk
near extraction points, and a cop that confidently commits to pursuit at
high speed (the policy Pipeline A discovered) happens to be devastating
against lurkers.

### Why the generalization ratio was > 100% — and what it hides

Two explanations account for the 156% ratio:

1. **The training set was dragged down by `flee`.** Flee is a degenerate
   flavor — cops can't catch a pure-flee evader no matter what policy they
   adopt, so flee's capture rate is pinned at 0% across both baseline
   and trained. It contributes a lot to the training-set denominator but
   gives the gradient zero signal. The "in-distribution delta" of 30pp is
   really "delta on wander and zigzag, averaged down by flee".
2. **The held-out set is easier.** Decoy, smart, and camper all have
   stronger extraction-seeking behavior than the training set. The
   learned policy (commit + sprint) happens to be very effective against
   extraction-seekers. So the held-out set rewards the same policy even
   more.

But here's the second-order insight, which matters more than the specific
ratio: **the learned policy generalized not because the probes learned to
recognize different situations, but because they converged on a good
constant that works on many situations**. I started to suspect this during
the MC results and ran one more experiment to confirm.

### Experiment 5: does the text format matter?

Robby mentioned an idea mid-session: maybe the text we feed the reservoir
matters. We'd been using absolute coordinates like `"cop at (3,-5). enemy
visible at (5,3). extract (0,14)."` Could we do better with relative
bearings ("8 tiles northeast") or qualitative descriptions ("enemy close,
southwest") or a richer multi-entity format?

This is a reasonable concern and it's the kind of thing that often matters
a lot in NLP-adjacent systems. I built five candidate formats and ran two
tests: a passive one (activation statistics) and an active one (Pipeline A
with each format).

#### Passive test: cosine similarity and effective dimensionality

For each format, I generated 80 diverse game states, computed state-to-text,
ran the reservoir forward pass, and collected the 80 resulting 768-dim
activation vectors. Then I measured two things:

**Cosine similarity** between pairs of activations. This is a standard way
to measure how "similar" two vectors are, and it's closely related to how
hard it is for a linear classifier to tell them apart. Its formula is:

```
cos(a, b) = (a · b) / (|a| * |b|)
```

It's 1 if the vectors point in the same direction, 0 if they're
perpendicular, -1 if opposite. For our purposes: low cosine similarity
(close to 0) means very different game states produce very different
activation vectors, which gives a linear probe lots of room to draw a
dividing line. High cosine similarity (close to 1) means activation vectors
are all nearly parallel and a linear probe has to separate them by tiny
magnitude differences.

**Effective dimensionality** (also called participation ratio): this
measures how "spread out" the variance is across the 768 dimensions. If
all the variance lives in 10 dimensions and the other 758 are constant,
effective dim is 10. If variance is spread evenly across all 768, effective
dim is 768. Formally it's `(sum of variances)² / (sum of squared
variances)` — you can derive this as the exponential of the Shannon
entropy of the normalized variance distribution, if you want an
information-theoretic reading. Higher effective dim means the reservoir
is using more of its output space to represent state differences, which
means a probe has more independent things it could potentially read out.

Results:

```
Format        mean_l2   cos_sim   mean_std   eff_dim
absolute       7.350    0.9945   0.0172     331.6
relative       7.407    0.9986   0.0089     412.2
qualitative    7.444    0.9967   0.0115     166.0
rich           7.765    0.9990   0.0079     394.9
minimal        5.921    1.0000   0.0000      86.7
```

This was surprising. I expected relative or qualitative to win because
distilgpt2 would have stronger priors for English compass words than for
coordinate tuples. Instead, **absolute had the LOWEST cosine similarity**
(most distinguishable activations) — apparently numeric tokens create
sharper per-state differentiation than direction words. Meanwhile,
**relative had the HIGHEST effective dimensionality** — it spreads its
signal across more dimensions. Different metrics pointed in different
directions.

The minimal format (which collapsed state to one of three phrases) was
degenerate as expected — cosine similarity of exactly 1 means many states
produced the exact same activation vector.

#### Active test: actually train Pipeline A on each format

Passive metrics are suggestive but not conclusive. The only way to know
which format trains best is to train with each and compare final capture
rates. I picked three (absolute, relative, qualitative), ran four ES
steps for each against 8 optimize seeds, and evaluated on 16 validation
seeds.

```
format         init     final    delta      time
absolute        6.3%    56.3%    +50.0pp    647s
relative       12.5%    56.3%    +43.8pp    600s
qualitative     6.3%    56.3%    +50.0pp    598s
```

**All three formats converged to exactly 56.3% capture rate.**

That number again — the ablation's best-constant ceiling. The format
doesn't matter. Whatever we tell the reservoir, Pipeline A finds a policy
that lands at the same 56.3% ceiling.

### The unifying insight: identifiability

When multiple experiments give you a number that matches one very specific
other number, that's a fingerprint. The 56.3% fingerprint showed up in:

- The ablation's best constant pair (conf=1.0, urg=0.75)
- Pipeline A's final result from random init
- Pipeline A's final result from bias=-2 initialization
- Pipeline A's final result on each of three text formats
- (Roughly) the average capture rate across evader flavors in the MC test

There's a concept in statistics called **identifiability**: a model is
identifiable if its parameters can be determined uniquely from observed
data. The flip side — non-identifiability — is when multiple different
parameter settings produce the same observations, making it impossible
to tell them apart from outside.

In our case, we have two hypotheses that both explain the 56.3% finding:

**Hypothesis A**: Pipeline A found a content-dependent policy where the
probes output different values for different situations, and those
situation-dependent outputs just happen to average to (conf=1.0, urg=0.75).

**Hypothesis B**: Pipeline A found weights that produce near-constant
output around (1.0, 0.75) regardless of input. It's not reading anything
meaningful from the reservoir's activation content; it's just found a
weight vector whose dot-product with typical activations produces a
saturated sigmoid.

Both hypotheses predict exactly the same behavior on every experiment we
ran. They're non-identifiable from the outside. Under Hypothesis A the
reservoir idea is working as intended. Under Hypothesis B the reservoir
is mostly decorative — any model with enough parameters and the right
optimization target would land at the ceiling.

There's a circumstantial argument that Hypothesis B is more likely: the
format ablation said all formats converge to the same number. If the
probes were genuinely reading situation-specific content out of the
reservoir, changing the reservoir's input content should at least change
the final performance slightly — maybe some formats would hit 55% and
others 58%. Instead, every format hit 56.3% exactly. The most parsimonious
explanation is that the content isn't being used, and the probes are
finding a near-constant output.

A direct test is possible but I didn't run it this session: during a
trained round, log every probe output for every tick, and compute the
standard deviation. If `std(confidence)` across ticks is tiny (say
< 0.05), Hypothesis B is basically confirmed. If it's sizeable (say
> 0.2), some content dependence is happening. That's a cheap next
experiment.

### Why this matters for the original question

The original promise of the reservoir idea was: a frozen LLM provides
a rich representation of situations, linear probes pull out concepts
the game designer never explicitly encoded, the actant develops
intuitions about its environment. That's a **content-dependent** story
— the whole point is that different inputs should produce different
outputs via pre-trained LLM features.

What session 2 showed is that our current cops.ts doesn't create
conditions where content-dependence is necessary. The optimal policy
in this game is approximately uniform ("always commit aggressively"),
so any training recipe that can find a good uniform policy wins, and
the reservoir's input content becomes incidental. We built a beautiful
machine for measuring situation-dependent learning and then pointed it
at a problem that doesn't need situation-dependent learning.

This isn't a negative result about reservoir computing. It's a result
about the experimental setup: **you can't measure what your system
doesn't need to do**. To actually test whether the reservoir can
extract meaningful concepts, we need a game where those concepts are
load-bearing for the optimal policy — where different situations
genuinely reward different behaviors.

That's the next thing to build.

### A concept tour you earned this section

While you were reading this section I introduced (or reused) a handful
of ML concepts. Here's a glossary in case you want to reference them
later:

- **Class prior**: the baseline frequency of positive examples in your
  training data. Classifiers with weak features calibrate toward it.
- **Gradient collapse at a gate**: when a step function between two
  outputs means small parameter changes can't smoothly affect the
  output. Step functions are hostile to gradient-based learning.
- **Joint optimization**: optimizing multiple parameters simultaneously
  so interactions between them can be discovered.
- **Train/test split**: the protocol for measuring generalization —
  hold some data aside during training, evaluate on it afterward to
  see if the model learned real patterns.
- **Overfitting**: when a model performs well on training data but
  poorly on held-out data, indicating memorization rather than
  generalization.
- **Cosine similarity**: normalized inner product between two vectors,
  measures alignment regardless of magnitude. Low values = more
  separable.
- **Effective dimensionality / participation ratio**: measures how
  many independent directions a distribution's variance uses. Higher
  = more information-bearing dimensions in the representation.
- **Identifiability**: whether model parameters can be uniquely
  determined from observed behavior. Non-identifiability is when
  multiple parameter settings predict the same behavior.
- **The surrogate-loss-vs-behavior gap**: when the thing you train
  against (loss function) isn't the same as the thing you care about
  (task performance). Pipeline B vs Pipeline A is precisely this.

---

## Part 9: Inverting control — the action registry

*Added after session 9. The question shifted from "can probes learn" to
"can the load on hardcoded logic actually decrease."*

### The question Robby asked

After session 8 I was ready to build a cognition loop (big LLM modifying
the action vocabulary between rounds). Robby stepped back and asked a more
fundamental question: "Have we explored the angle enough that the 'load' on
the 'hardcoded' part should become less as the 'reflexes' improve?"

The honest answer was no. In every version of cops.ts so far, the hardcoded
code was making the structural decisions — when to commit, when to
intercept, when to patrol — and the probe was just filling in parameter
values. The probe was a knob inside someone else's machine.

For the reflex layer to genuinely take on load, it needs to make the
decision itself: not "how much to blend commit and intercept" but "which
of these N things should I do right now?"

### Action selection as learned tool use

The idea comes from how tool use works in LLM agents today. When Claude
picks a tool, it's choosing from a vocabulary of capabilities: "should I
search the web, read a file, or write code?" Each tool has a name, a
description, an input schema, and an implementation. The LLM scores
which tool is most appropriate and picks one.

We can do the same thing at the reflex layer, just faster and cheaper:

```ts
// The vocabulary: every action the cop knows how to do
const candidates = [
  { name: 'chase_visible', available: ..., execute: ... },
  { name: 'commit_ghost',  available: ..., execute: ... },
  { name: 'intercept_extraction', ... },
  { name: 'guard_nearest_extraction', ... },
  { name: 'converge_on_ally', ... },
  { name: 'spread_from_ally', ... },
  { name: 'move_north', ... },
  { name: 'move_south', ... },
  // ... 15 actions total
];

// The reflex: one priority probe per action
priorities = probes.forward(reservoir_activation);  // → [0.93, 0.73, ...]

// The decision: pick the highest-priority available action
action = candidates
  .filter(c => c.available(me, world))
  .max_by(c => priorities[c.index])
  .execute(me, world);
```

The cop's onTick function is now a 20-line argmax. All decision logic has
moved into the probe weights. The hardcoded code just says "here is what I
CAN do" — the reflex decides "what I WILL do."

This is the architectural inversion that matters for making hunch a
standard part of actant embodiment. Adding a new capability is: write an
`execute` function, give it a name and description, register it. The
reflex layer automatically gets a new probe and learns when to use it.
No branching logic to rewrite.

### What "one probe per action" means mechanically

In the old setup we had 5 probes for 5 named values (threatLevel,
confidence, etc.). Now we have 15 probes, one per action in the
vocabulary. Each probe still does the same thing: `sigmoid(w·x + b)`.
The output is interpreted as a priority — "how much do I want to do this
action right now?" — rather than a descriptive value like "how confident
am I."

The total parameter count grew from 5 × 769 = 3,845 to 15 × 769 =
11,535. That's still tiny by any ML standard — a single GPT-2 attention
head has more parameters. The training algorithm (Evolution Strategies)
handles the larger space fine; it just needs more iterations or more
population per step.

### Results: pursue_center wins everything

Pipeline A trained all 15 probes jointly. Starting from random
initialization:

```
baseline:  15.6%  (5/32)
trained:   50.0%  (16/32)
delta:    +34.4pp
```

Training works — the capture rate improved substantially. But the action
usage histogram told the real story:

```
pursue_center        52,059  (95.3%)
commit_ghost          2,581  ( 4.7%)
all other 13 actions      0  ( 0.0%)
```

The trained cops learned to do one thing: move toward the center of the
map. 95% of the time, that's all they do. The other 4.7% is chasing
ghosts when one is available.

13 out of 15 actions are completely dead — never selected. The vocabulary
was broad (tactical + fine-grained + positional actions) and training
correctly identified that most of it is unnecessary.

### Why pursue_center is strategically excellent

This initially surprised me. I'd built 7 tactical actions (chase, commit,
intercept, cut off, guard, converge, spread) expecting at least a few of
them to be useful. Instead the cops ignored all of them in favor of
"walk to the middle of the map."

But it makes sense: in a 40×30 grid with 8 cops, the center is at most
20 tiles from any edge point. 8 cops at center form a closing net that
covers every extraction. The evader literally cannot slip through the
density. Why chase, intercept, or coordinate when you can just stand in
the middle and wait for the evader to come to you?

### The content-dependence diagnostic

I measured how much each probe's priority output varied across different
game states during a trained round. If the probe outputs different
priorities in different situations, that's **content-dependent** behavior
— the probe is reading the situation. If it outputs the same priority
regardless of situation, it's a constant.

```
action                    mean priority   std across ticks
guard_nearest_extraction      0.533         0.0641  ← MOST variable
cut_off_midpoint              0.323         0.0622
...
commit_ghost                  0.933         0.0097
pursue_center                 0.939         0.0084  ← LEAST variable
```

The two actions that actually get selected (pursue_center, commit_ghost)
have the **lowest** variability — they're near-constant. The actions that
show the most situational variation (guard_nearest, cut_off) are exactly
the ones that **never win** the argmax competition.

The irony: the probes that are most "content-dependent" in the pure
representational sense are the ones that are least useful for behavior.
The useful probes are just big constants.

### The recurring pattern

This is the same pattern for the third time:

| session | expressiveness added | what training found |
|---------|---------------------|---------------------|
| 6 | one binary gate | best constant: conf=high |
| 8 | two continuous blends | best constant: (conf=1, urg=0.75) |
| 9 | 15-action priority selection | best constant: pursue_center |

Every time we add more expressiveness, training collapses it to one
dominant behavior. We keep building more sophisticated reflex
architectures and training keeps saying: "thanks for the options, I'll
just do one thing."

### The game is the bottleneck

After session 9, I initially suggested building a cognition loop (big LLM
modifying the vocabulary between rounds). Robby pushed back: **"it feels
like we need a game / sim where one behavior isn't so effective."**

He was exactly right. The cognition loop is a solution to "the vocabulary
needs to evolve." But that's not the problem. The problem is that *this
game has a single dominant strategy*. No amount of reflex sophistication
or vocabulary curation will produce situational behavior in a game where
the situation doesn't matter.

Why center-camping dominates: 40×30 grid, 8 cops, 3 extraction points on
edges. Center is at most 20 tiles from any edge. 8 cops converging on
center create a closing net with higher density than the evader can
penetrate. There's no situation where a cop is individually better off NOT
going to center.

This is a property of the game's parameters, not its architecture. The
reflex layer works. Pipeline A works. The action vocabulary works. The
diagnostic instrumentation works. What doesn't work is expecting a system
to learn situational behavior in an environment where situations don't
matter.

### What would make situations matter

The fix isn't more code — it's a different game where no single position
or behavior covers everything. Some possibilities we've discussed:

- **Bigger map, fewer cops, more spread extractions.** If the map is 80×60
  and you only have 4 cops, center is 40 tiles from the edges. You
  physically can't cover everything from one position. Cops MUST split up
  and choose different targets based on where the evader is, what the
  other cops are doing, and which extractions are closest. Which target to
  pick is *genuinely situational*.

- **Evader abilities.** If the evader can go invisible, sprint through
  walls, or activate/deactivate extraction points, then what the evader is
  currently doing changes the optimal cop response. You can't predict the
  right move without reading the situation.

- **Rotating extraction points.** If extractions shift position every N
  ticks, static positioning strategies are invalidated. Cops have to
  react to the current configuration.

Each of these would create a game where the optimal action genuinely
depends on what you're looking at — which is the condition under which
content-dependent probe outputs become necessary. If the probe has to
output different priorities in different situations to achieve the best
outcomes, then the reservoir's content has to matter, the text format
has to matter, and the whole system works the way the conceptual doc
envisioned.

### What we have, what we're missing

**What works**:
- Reservoir → activations → probes → priorities → action selection → game
  outcome. Full pipeline, end to end, deterministic.
- Pipeline A (Evolution Strategies) as an outcome-driven training recipe
  that consistently beats Pipeline B (correlational/supervised).
- Priority-based action selection as the right architecture for learned
  reflexes in actant embodiment. Decision load genuinely shifted from
  hardcoded branches into probe weights.
- Action usage histograms and priority-std diagnostics as clean feedback
  signals for a future cognition layer.
- MC generalization across evader flavors — learned policies transfer.

**What's missing**: a game that demands different actions in different
situations. That's the next experiment.

### New concepts from this section

- **Action selection / policy over actions**: instead of hard-coding which
  action to take via if-else branches, define a vocabulary and let a
  learned scorer pick. This is the same idea as tool selection in LLM
  agents, just done by a linear probe at sub-cognitive speed.
- **Action usage histogram**: the empirical record of which actions a
  trained policy actually picks. Dead actions (0% usage) are either
  useless or poorly implemented — either way, actionable diagnostic
  signal for the cognition layer.
- **Dominant strategy**: a strategy that's optimal regardless of what the
  opponent does. In game theory, if a dominant strategy exists, rational
  play always converges to it. The reservoir-probe system is "rational"
  in this sense — it finds the dominant strategy and stays there. You
  can't learn nuance in a game that doesn't reward nuance.

---

## Part 10: The right game, the right training, and why the LLM matters

*Added after the session 9 follow-up conversation where Robby pointed
out the real next step isn't tweaking the current game or adding a
cognition loop — it's testing on a game that naturally demands
situational play.*

### Why we need a different game (not a different architecture)

Session 9 ended with me proposing a cognition loop — big LLM reads the
action usage histogram, evolves the vocabulary, Pipeline A retrains. Robby
pushed back: "it feels like we need a game where one behavior isn't so
effective."

This is the right call, and it reflects a general principle in ML
experimentation: **if your model collapses to a trivial solution, the
problem might be in the task, not the model**. We kept adding
architectural sophistication (binary gate → continuous blend → 15-action
priority selector) and training kept finding the same answer: one dominant
behavior. That's not a model failure — it's the model correctly
identifying that the task has a dominant strategy.

No amount of architectural sophistication will produce situational
behavior if the game doesn't reward situational behavior. The next step is
finding a game that does.

### A game that demands situational play: tag-your-dead

In the same workspace there's a demolition derby game called tag-your-dead
where:

- **Continuous play, no rounds.** Cars drive around a 4000×3000 desert
  arena ramming each other. When you die you respawn after 5 seconds. The
  game doesn't stop.
- **"It" tag mechanic.** One car is "it" at any time. The "it" car deals
  3× damage on collision. You become "it" by getting hit. This creates a
  constantly shifting tactical situation: sometimes you're hunting
  (chasing the car that's "it" to take the tag), sometimes you're being
  hunted (you're "it" and everyone wants to ram you), sometimes you're
  scavenging (neither "it" nor near "it", looking for weak targets).
- **5 personalities with different evolved tactics.** Viper hits and runs.
  Bruiser charges head-on. Ghost herds from the center. Each starts with
  different on_tick code and evolves differently through Claude-based
  reflection.
- **Toroidal arena with obstacles.** The arena wraps at the edges, so
  there's no "center" to camp. Rocks, cacti, barrels, and sand patches
  create local terrain that matters for collision planning.
- **Scores are continuous and independent per car.** +1 per second alive,
  +0.5 per damage dealt, +50 per kill. Rich, continuous, per-actant
  signal.

This game has exactly the properties hunch's grid game lacked: no
dominant strategy (because the "it" tag keeps shifting the situation), rich
moment-to-moment signals (not just a binary capture/escape at round end),
and an existing cognition layer (the Claude-based reflection between
lives that already modifies on_tick code).

### The training approach changes too

In hunch, training was **Evolution Strategies**: play 8 rounds, count
captures, perturb probe weights, repeat. This worked because rounds were
clean atomic units with a clear outcome signal.

Tag-your-dead doesn't have rounds. It has a continuous stream of events.
You can't wait for "the round to end" to label your training data because
there's no ending. You need a training approach that learns from the
stream as it flows.

### Temporal Difference learning (explained from scratch)

**TD learning** is the standard approach for this situation. It's the
foundation of most modern reinforcement learning, and the core idea is
surprisingly simple once you see it.

Start with this question: **how good is my current situation?** Not "did
I win" (that's a round-end question) but "right now, at this specific
tick, how well-positioned am I for what's coming?"

Call that number V — the **value** of the current state. High V means
things are going well: you're healthy, near a weak target, not being
chased. Low V means danger: low HP, "it" car closing in, backed against
an obstacle.

The probe's job is to predict V from the reservoir's activations. Feed
the current state text to distilgpt2, get 768-dim activations, run the
probe: `V = probe.forward(activation)`. That's the actant's "gut feeling"
about how its situation is going.

### Learning V without knowing V

Here's the beautiful part: you don't need an oracle that tells you the
true V. You can learn it from two things you DO have:

1. **Small immediate rewards each tick.** Things like: +0.001 for being
   alive, +0.1 for dealing damage, -0.1 for taking damage, +1.0 for a
   kill, -1.0 for dying. Most ticks the reward is tiny; on action ticks
   it spikes.

2. **Your own prediction of V at the next tick.** If you predict V(100) =
   0.6 at tick 100, and then at tick 101 you got reward 0.05 and predict
   V(101) = 0.65, you can ask: was V(100) = 0.6 a good prediction?

The best estimate of the true V(100) is: `reward + γ × V(101)`, where γ
(gamma, typically 0.99) is a discount factor that says "future value is
worth slightly less than immediate value." So the best estimate is
`0.05 + 0.99 × 0.65 = 0.6935`.

Your probe said 0.6. The bootstrapped estimate says 0.6935. The
difference — 0.0935 — is the **temporal difference error (TD error)**. It
means "this situation was slightly better than you thought." You use that
error to nudge the probe: "for this activation, say something a bit higher
next time."

One tiny gradient step. Repeat every tick. Over thousands of ticks, the
probe converges to a V that accurately reflects the expected future reward
from any given situation — without ever being told the "true" value, and
without waiting for any round to end.

```
every tick:
  V_now = probe.forward(activation_now)
  V_next = probe.forward(activation_next)
  td_error = reward + γ × V_next - V_now
  probe.weights += learning_rate × td_error × ∂V/∂weights
```

### From value prediction to action selection

TD learning in its basic form learns to PREDICT value, not to SELECT
actions. But the two connect naturally:

If you have multiple candidate actions (from the action registry), and
each action has its own probe, you can run each probe on the current
activation and pick the action whose probe predicts the highest value.
Then when the TD error comes back (from the reward and next-tick value),
you update the probe for the action that was actually taken. Actions that
lead to positive surprises (TD error > 0) get their priorities boosted;
actions that lead to negative surprises get theirs lowered.

This is called **Q-learning** in the RL literature — learning a separate
value function for each action. Our setup (one linear probe per action,
evaluated on reservoir activations, updated via TD error) is literally
linear Q-learning with a frozen LLM as the feature extractor. It's a
well-studied algorithm with known convergence properties.

### Why TD learning should produce content-dependent probes

Here's the key connection back to our long-running problem with constant
policies:

ES (Evolution Strategies) optimizes a **single scalar** — the average
capture rate across N seeds. If one constant setting achieves the best
average, ES finds it and stops. It has no incentive to produce different
outputs in different situations because the objective is averaged across
situations.

TD learning optimizes a **per-tick prediction**. Every tick is a separate
learning opportunity. Tick 100 might have a TD error of +0.2 (things went
better than expected), and tick 200 might have a TD error of -0.3 (things
went worse). These are DIFFERENT learning signals for DIFFERENT activation
vectors. The probe weight update at tick 100 pushes weights in the
direction of activation_100; the update at tick 200 pushes in the
direction of activation_200. If those activations are different (because
the situations are different), the probe learns to respond differently to
different situations.

This is the mechanism by which content-dependent behavior should emerge.
Not because we designed the architecture to produce it (we did that in
sessions 6, 8, and 9 and training collapsed it each time), but because
the learning algorithm ITSELF operates on per-situation signals that
naturally vary. The content-dependence comes from the training data's
diversity, not from the model's expressiveness.

### Why the LLM matters (the real argument)

Robby crystallized this in the conversation: **"in game development I
imagine this would make it easier to work this in to the NPC / AIs /
Actants because you don't need to 'line up' or somehow make features out
of the game data in the same detailed way."**

This is the actual value proposition. In traditional game RL, the hard
part is **feature engineering** — converting game state into a fixed-size
numeric vector that captures what matters. For a demolition derby, a
game developer would write something like:

```ts
features = [
  car.health / car.maxHealth,                  // normalized HP
  1 / distance(car, nearestEnemy),             // inverse distance
  angleTo(car, nearestEnemy) / Math.PI,        // bearing
  car.speed / car.maxSpeed,                    // normalized speed
  isAgainstWall(car) ? 1 : 0,                 // wall flag
  enemiesInFOV(car).length / maxEnemies,       // density
  car.isIt ? 1 : 0,                           // tag status
  // ... 20 more, each a human judgment about what matters
];
```

Each feature is a design decision. What scale to use, how to normalize,
what to include, what to omit — all hand-specified. It works, but it
takes days of iteration and is completely specific to one game. You can't
use a demolition derby feature vector for a stealth game or a habitat
sim.

The LLM-as-reservoir approach replaces all of that with:

```ts
text = `hull ${car.health}%. ${car.isIt ? "I am it (3x damage)" : "not it"}.
  ${nearestEnemy ? `enemy ${dist}m ${bearing}, speed ${speed}` : "no enemy visible"}.
  ${nearWall ? "near wall" : "open area"}. score ${car.score}.`;
activations = reservoir.embed(text);   // LLM does the feature extraction
```

Adding new information is editing a string. Changing what the actant
notices is editing a string. Moving to a different game is writing a
different string. The reservoir and the training loop are identical across
every game. The only game-specific part is the state-to-text function,
which describes what the actant can currently see — and writing that is
trivial.

Whether the free features from an 82M-parameter LLM are good enough to
compete with hand-designed features for any given game is an open
empirical question. But the development cost difference is enormous.
Hand-designed features take days per game and require ML expertise.
State-to-text takes minutes per game and requires only the ability to
describe a game state in English.

That cost difference is why Robby wants this as a **standard part of
actant embodiment** — something that plugs in to any game with a
description string, a reward signal, and a tick loop.

### New concepts from this section

- **Temporal Difference (TD) learning**: learning a value prediction by
  bootstrapping from your own prediction one step later plus the actual
  reward received. The core algorithm: `td_error = reward + γ × V_next -
  V_now`. No round boundaries needed. No oracle needed.
- **Value function V(s)**: a prediction of "how good is state s, measured
  by expected future rewards." Learned, not specified.
- **Discount factor γ**: typically 0.99. Says "reward one tick in the
  future is worth 0.99 × reward right now." Causes the value function to
  be forward-looking but prefer sooner rewards.
- **Q-learning**: TD learning with one value function per action. Picks
  the action with the highest predicted value. Our action-priority probes
  are exactly this.
- **Feature engineering**: the (traditionally hard) problem of converting
  raw game state into numeric features that a learning algorithm can use.
  The LLM-as-reservoir replaces this with natural language description.
- **Online learning**: updating model parameters incrementally during play
  rather than in batch after play. TD learning is inherently online.

---

## Appendix: Where things live

- [games/hunch/docs/journal.md](journal.md) — the session-by-session lab notebook
  with every experiment's raw numbers
- [games/hunch/docs/plan.md](plan.md) — the original plan written before execution
- [games/hunch/src/reservoir/](../src/reservoir/) — ONNX bridge, KV-cache pooling,
  state-to-text serializer
- [games/hunch/src/probes/](../src/probes/) — linear probes and probe sets
- [games/hunch/src/training/](../src/training/) — Pipeline B (logistic SGD) and
  Pipeline A (Evolution Strategies)
- [games/hunch/src/game.ts](../src/game.ts) — chassis, tick loop, async preTick hook
- [games/hunch/src/actions.ts](../src/actions.ts) — action vocabulary (15 atomic actions)
- [games/hunch/src/probes/action-probe-set.ts](../src/probes/action-probe-set.ts) —
  dynamically-sized probe set, one probe per action
- [games/hunch/src/cops.ts](../src/cops.ts) — argmax over action registry priorities
- [games/hunch/test/](../test/) — every experiment as a standalone headless test
- `git log feat/hunch ^main --oneline` — the commit progression tells the story

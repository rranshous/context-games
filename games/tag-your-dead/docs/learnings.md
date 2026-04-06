# Tag You're Dead — Reservoir + Tendency System Learnings

*Living document. Started 2026-04-06. Updated as experiments produce findings.*

This doc captures what we've learned from integrating a frozen LLM
reservoir + linear probe tendency system into tag-your-dead. It's
intended to be useful for anyone building similar systems in other
games or actant embodiments.

---

## 1. The Vocabulary Abstraction

**The single most valuable output of this experiment so far.**

Named actions with ordinal magnitudes (0..1), composed via softmax,
shared between a learned sub-cognitive layer and an LLM-authored
conscious layer. Example:

```js
me.ram_nearest(0.8);    // "I strongly want to ram"
me.flee_it_car(0.6);    // "I moderately want to flee IT"
me.cruise_forward(0.3); // "I mildly want to go straight"
```

All fire simultaneously. Softmax gives each a proportional share of the
car's movement budget. The magnitudes are ordinal — `(0.8, 0.6, 0.3)`
and `(0.4, 0.3, 0.15)` produce identical behavior (same ratios).

**Why this matters for actant design:**

- **LLMs write better code with it.** Claude's reflection-authored
  on_tick went from 2000-char angle-math monstrosities to 200-char
  intent expressions. "Hunt strongly, ram moderately, flee when hurt"
  is a sentence an LLM can reason about. `Math.atan2(Math.sin(diff),
  Math.cos(diff)) * 2.5` is not.

- **Self-diagnosis becomes possible.** Dust Devil looked at its trail
  map, saw circular motion, traced it to `steer_left(0.2)` in its code,
  and removed it. The action names are human-readable, so an LLM can
  connect behavior patterns to code.

- **Composition is automatic.** Both the learned tendency and the
  authored code contribute to the same softmax pool. No explicit
  composition logic needed. Adding a new capability is: write a
  directional function, give it a name, register it.

- **Portable across games.** The vocabulary changes per game (a
  demolition derby has `ram_nearest`; a stealth game has `hide_in_kelp`)
  but the pattern is identical: define `{name, description, available,
  direction}`, compose via softmax, expose on `me` API.

---

## 2. Two-Timescale Coupling

**The most theoretically interesting dynamic we've observed.**

The system has two learning layers operating at vastly different speeds:

| layer | mechanism | timescale | power |
|-------|-----------|-----------|-------|
| tendency probes | TD learning on reservoir activations | 1000s of ticks, tiny weight updates | weak per-step but continuous |
| on_tick code | Claude reflection between deaths | one-shot rewrite, ~30s wall time | powerful per-step but episodic |

These layers train on the same reward signal (score delta) but at
different rates. The fast learner (Claude) shifts strategy in one shot.
The slow learner (probes) is always chasing the previous strategy.

**This creates oscillation:** probes converge toward what worked under
strategy N → Claude reflects and jumps to strategy N+1 → probes are now
slightly wrong for strategy N+1 → probes slowly chase toward N+1 →
Claude reflects again → cycle continues.

**Why the oscillation might be valuable:**

In optimization, noise and perturbation prevent convergence to local
optima. The tendency layer's lag provides a constant source of slight
mismatch between what the body wants and what the driver intends. This
mismatch is:

- **Free exploration.** The body's "wrong" lean might accidentally
  discover effective behaviors the driver never considered.
- **Anti-stagnation.** Without oscillation, the system would settle
  into a fixed point after a few reflections. With it, the body keeps
  shifting underneath the driver, forcing continuous adaptation.
- **Smooth interpolation.** Between reflections (which are episodic),
  the probes provide continuous adaptation to changing game conditions.
  The body adjusts tick-by-tick; the driver adjusts death-by-death.

This is a well-studied phenomenon in multi-agent and multi-timescale
learning in the RL literature. The specific dynamics (fast-slow coupling,
target non-stationarity, emergent exploration) are active research
topics. Our contribution is applying them to the actant embodiment
context with an LLM as the fast learner and a reservoir as the slow one.

**Open question:** Does the oscillation help or hurt over many death
cycles? Need comparative data: probes ON vs probes OFF over extended
play.

---

## 3. Reward Shaping vs Game Score

**Tried three reward designs. Each taught us something.**

| version | design | result | lesson |
|---------|--------|--------|--------|
| v1 | hand-shaped, 6 components | worked but is reward engineering | same problem as feature engineering — we wanted to avoid this |
| v2 | raw `curr.score - prev.score` | spinning optimal | game score designed for player experience, not RL reward |
| v3 | score delta minus passive baseline | no spinning, evasive strategies | minimal fix preserving game's own balance |

**Key insight:** game scoring and RL reward are different things. A game
designer balances scoring for player engagement (survival should feel
rewarding). An RL reward must incentivize the specific behaviors you
want to learn. These can conflict: +1/sec survival is satisfying for a
human player but makes "spin in circles" optimal for an RL agent.

**With the tendency system, the reward problem is less acute.** The
tendencies are a gentle lean, not the entire behavior. The on_tick code
(authored by Claude) carries the strategy. The probes just need signal
for "did my lean help?" — and raw score delta might be fine for that
because the lean's contribution is small relative to the driver's intent.

---

## 4. Orienting Context in State-to-Text

**Telling the reservoir what the game IS produces dramatically richer
activations.**

Before: `"I am damaged. car close northwest (IT)."`
After: `"Demolition derby. Ram other cars to score points. Being IT means
dealing 3x damage but dying if the timer runs out. I am damaged. Car
close to the northwest, IT. Score: 253."`

TD errors (which measure how much the probes are learning per tick):
```
no context:        0.0001 - 0.0025
with context:      0.0097 - 0.3276    (10-100× larger)
```

**Why:** distilgpt2 has pre-trained representations for "demolition
derby", "ram", "danger", "score" that are semantically richer than its
representations for bare coordinate data. The context prefix primes the
activation space toward game-relevant dimensions.

**Takeaway for other games:** always include a brief orienting sentence
in state-to-text. "Stealth game. Hide from predators. Eating morsels
gives energy." or "Tower defense. Build walls, place turrets, survive
waves." One sentence, dramatic activation improvement. This is the
reservoir's pre-trained knowledge paying for itself.

---

## 5. The Reservoir's Value Proposition (Honest Assessment)

**When Claude reflection is available, the reservoir probes haven't
yet demonstrated clear independent value.**

Claude's one-shot reflection rewrites 1500 chars of strategic code.
Probes nudge steer by ±0.01 after 1000 updates. The cognitive layer
is orders of magnitude more powerful per-step.

**But the probes offer something Claude can't:**

- **Per-tick adaptation.** Claude only reflects between deaths. Probes
  update every tick. In the seconds before a death, the probes are the
  only learning mechanism active.
- **Non-linguistic learning.** Claude reasons in text. Probes learn from
  activation patterns that may encode spatial/temporal structure the
  text descriptions don't capture.
- **Perturbation via oscillation.** The body's slight misalignment with
  the driver's intent provides exploration (see section 2).

Whether these properties produce measurable improvement over Claude-only
is the key open question. The experiment to run: extended probes-ON vs
probes-OFF comparison.

---

## 6. Temporal Context (Not Yet Implemented)

**Current state-to-text is a single-tick snapshot. The reservoir could
process sequences.**

An LLM's activations carry context across the token sequence. If we
fed it a window of recent states:

```
3s ago: healthy, ramming, closing in.
2s ago: took damage, still closing.
1s ago: damaged, very close, boost ready.
Now: damaged, adjacent, boosting.
```

The activation pattern would encode the TRAJECTORY, not just the
current position. Probes could learn temporal concepts like "closing in
on a kill" or "being chased and losing HP" that a single snapshot can't
represent.

This is a natural extension of the reservoir computing paradigm — the
"echo state" property where recent input history persists in the
activation dynamics. We're not exploiting it yet. It might be the
lever that makes the sub-cognitive layer genuinely complementary to
Claude's episodic reflection.

---

## Appendix: Architecture Reference

```
game tick (60fps)
  → on_tick: me.ram_nearest(0.8) etc. → TendencyAccumulator
  → reservoir: state-to-text → distilgpt2 → 768-dim activations
  → probes: 13 tendency magnitudes → TendencyAccumulator
  → softmax compose all tendencies → net (steer, accel) → car physics
  → reward: score delta → TD update on all probes

between deaths:
  → Claude sonnet: review life map + stats
  → edit_on_tick: rewrite vocabulary code
  → edit_memory: record strategy
  → brag: in-character announcement
```

Files:
- `src/reflex/actions.ts` — 13 tendency definitions
- `src/reflex/tendency-system.ts` — TendencyAccumulator + softmax
- `src/reflex/td-learner.ts` — OnlineProbe + TDLearner
- `src/reflex/reflex-layer.ts` — per-car CarReflex + ReflexLayer
- `src/reflex/onnx-bridge.ts` — distilgpt2 reservoir
- `src/reflex/state-to-text.ts` — orienting context + qualitative state
- `src/reflex/reward.ts` — raw score delta
- `src/soma.ts` — buildMeAPI with vocabulary methods
- `src/reflection.ts` — Claude reflection with vocabulary API docs

# Hunch — Journal

Running log of sessions, decisions, numbers, surprises. Most recent entries at the top.

Inherited hot-pursuit docs live in `_inherited/` for reference.

---

## STATUS SUMMARY (for future-me or a catching-up reader)

**What hunch is**: an experimental fork of hot-pursuit prototyping the
"frozen reservoir + linear probe" subsystem from
`docs/frozen-reservoir-probe-subsystem.md`. The question is whether a
frozen small LLM's pooled activations, read out by linear probes, can
produce sub-cognitive "hunches" that improve an actant's behavior without
the actant knowing the subsystem exists.

**Headline table across all sessions** (capture rate on smart evader):

| session | game regime | pipeline | start | end | delta |
|---|---|---|---|---|---|
| 5a | binary, 1-arm onTick | B | 30% | 30% | 0 |
| 5c | binary, 2-arm gate | B | 30% | 5% | **−25pp** |
| 6 | binary, 2-arm gate | A (bias=-2) | 0% | 37.5% | +37.5pp |
| 8 | continuous blend | B | 9% | 13% | +4pp |
| 8 | continuous blend | A joint | 9% | **56.3%** | **+47pp** |

Pipeline A dominates Pipeline B across every game variant we've tested.
Continuous blend eliminates Pipeline B's catastrophic regression failure
but doesn't close the A-vs-B gap — Pipeline A beats Pipeline B by 43pp
on the same random starting point in the continuous game.

**Session 9 additions**:
- **Priority-based action selection**: replaced hardcoded-branches-with-
  reflex-parameters design with a vocabulary of 15 atomic actions. The
  reflex layer decides WHICH action to take by scoring all available
  actions and picking the highest-priority one. This is the key
  architectural shift: decisions moved from hardcoded code into learned
  priorities.
- Pipeline A trained all 15 probes jointly (11,535 params). From 15.6%
  baseline to 50.0% trained (+34.4pp). Two actions dominated: `pursue_
  center` (95.3%) and `commit_ghost` (4.7%). The other 13 actions were
  never selected — dead weight that a cognition layer would prune.
- Content-dependence measurement: mean per-action priority std = 0.030,
  still in near-constant regime. The two "alive" probes (pursue_center,
  commit_ghost) have very low std (0.008, 0.010) — they're saturated
  constants. The "dead" probes guard_nearest and cut_off_midpoint have
  higher std (0.06) — they're varying situationally but losing the
  argmax competition to the dominant pair.
- **Emerging insight**: the priority-based architecture exposes what
  cognition needs to do. The usage histogram IS the cognition signal.
  A big LLM between rounds would read "pursue_center used 95%,
  everything else dead" and either (a) modify dead actions to be more
  competitive, (b) remove them, or (c) invent new actions targeting the
  5% of ticks where commit_ghost wins (situational pursuit actions with
  better implementations).

**The recurring pattern (sessions 6, 8, 9)**: every time we add more
expressiveness to the reflex layer, training collapses it back to one
dominant behavior. Session 6: constant conf=high. Session 8: constant
(conf=1, urg=0.75). Session 9: 95% pursue_center. The bottleneck is not
the reflex architecture — it's that **this game has a single dominant
strategy**. 40×30 grid + 8 cops + 3 edge extractions = center camping
covers everything. No amount of reflex sophistication will produce
situation-dependent behavior when the situation doesn't matter.

**Where the experiment stands**: the plumbing works, the training works,
the architecture (priority-based action selection) is the right shape for
an embodiment subsystem. But to validate content-dependent learned reflexes
— the actual promise of the reservoir idea — we need a game where no
single behavior dominates. The current game's parameters need to change:
bigger map, fewer cops, more spread extractions, or evader abilities that
shift the tactical picture. The architecture is ready; the game isn't.

**Session 8 additions**:
- Continuous target-blend cops.ts (confidence as 0..1 weight) + urgency-
  modulated cop speed (0.6x..1.4x). Two continuous levers.
- 8 cops, 2 new scripted evader flavors (`zigzag`, `camper`) for MC diversity.
- 32-seed eval sets for tighter statistics.
- **MC generalization test**: trained Pipeline A on {flee, wander, zigzag},
  evaluated on {decoy, smart, camper}. In-dist 6.7%→36.7% (+30pp),
  out-of-dist 20%→66.7% (+46.7pp). **Generalization ratio: 156%** —
  held-out improved more than training distribution did.
- **State-to-text ablation**: tried absolute coords, relative bearings,
  qualitative words, rich multi-entity, minimal. Passive metrics favored
  absolute on cosine similarity, relative on effective dimensionality.
  Active Pipeline A training produced **identical 56.3% final rate for
  all three formats tested**.

**The big session 8 insight**: Pipeline A, MC generalization, and the
state-to-text null result ALL tell the same story. The optimal policy
on this cops.ts is approximately constant (conf high, urg high). Pipeline
A converges to that constant regardless of starting point, and regardless
of what text format we feed the reservoir, because the optimum doesn't
vary by situation. We are measuring a training pipeline's ability to
find the best constant, not its ability to learn situation-specific
reflexes.

For "content-dependent hunches" (different activations → different
behaviors at different moments) to matter, we need game structure where
different situations call for different optimal policies. The current
cops.ts doesn't have that — the best move is always the same.

**Where we are after sessions 0-9**:

- **Phases 0-4** (plumbing) are complete. Fork stripped, determinism
  validated, distilgpt2 benchmarked and wired via `@huggingface/transformers`,
  pooled KV cache extracted (768-dim), linear probes implemented, reservoir +
  probes integrated into the game loop via `async preTick()`. End-to-end
  pipeline works and preserves determinism even with the reservoir in the
  loop.

- **Phase 5 (Pipeline B, correlational)** was run and it **failed informatively**.
  With a two-arm cop onTick (confidence > 0.5 → commit, ≤ 0.5 → intercept),
  correlational training on binary capture outcomes drove the probe's
  prediction mean to the class prior (9% positive → predict 0.09), flipping
  cops into intercept mode and crashing capture rate from 30% → 5%. This is
  a textbook failure of correlational learning on a gated action space.

- **Ablation** (test/ablation.mjs) showed the game has exactly two capture
  rates — 30% (commit) and 5% (intercept) — selected by which side of 0.5
  the probe output lands on. Random probes with real reservoir land at 0.506
  (commit, 30%); same probes with null reservoir land at exactly 0.5 (fails
  gate, intercept, 5%). A difference of 0.006 in probe output flips the
  entire game.

- **Phase 6 (Pipeline A, Evolution Strategies on outcomes)** succeeded.
  Starting from bias = -2 (initial capture rate 0%, worse than Pipeline B's
  5% failure mode), ES climbed to 37.5% capture rate in 6 steps / 13 minutes
  wall. Weights grew 0.28 → 6.86, aligned with activation direction that
  overcomes the -2 bias on typical inputs.

**Headline table** (capture rate on `smart` evader, 8 eval seeds):

| approach | start | end | delta |
|---|---|---|---|
| Pipeline B, 1-arm onTick | 30% | 30% | 0% |
| Pipeline B, 2-arm onTick | 30% | 5% | **-25%** |
| Pipeline A, from bias=-2 | **0%** | **37.5%** | **+37.5pp** |

Pipeline A started from a worse initial condition than Pipeline B's failure
mode and climbed to the maximum achievable capture rate. This is exactly
the A-vs-B divergence the conceptual doc predicts: correlational learning
is drag-pulled toward class priors and gets gated-branch signs wrong;
counterfactual / outcome-based learning reads the effect directly.

**What we have**:
- A working fork at `games/hunch/` on branch `feat/hunch`
- ~15 checkpoint commits telling the progression
- Complete reservoir + probe integration pipeline
- Both training pipelines (B via logistic SGD, A via ES with optional
  joint multi-probe optimization)
- Continuous target-blend and speed-modulation cops.ts
- 6 scripted evader flavors spanning diverse behavior types
- MC generalization result showing probes transfer across flavors
- State-to-text ablation across 5 formats (passive + active)
- All tests headless and fully deterministic

**What's missing / next experiments**:
- **A game that demands situational play.** This is THE blocker for the
  whole experiment's next chapter. The current 40×30 map with 8 cops is
  solved by center-camping. Candidates for breaking dominance:
  - Bigger map + fewer cops + more spread extractions (simplest: config
    change, no new code — but needs a new map layout)
  - Evader abilities (stealth, wall-phase, extraction
    activation/deactivation) that change the tactical picture mid-round
  - Rotating/shifting extraction points that invalidate static positioning
  The right choice depends on what creates situational variation WITHOUT
  adding complexity to the chassis. If a config-only change does it,
  that's ideal because the rest of the pipeline is validated and
  unchanged.
- **True per-tick counterfactual replay** (the ES variant we have is
  outcome-based policy gradient, a simpler cousin)
- **Browser integration**: main.ts still builds but hasn't been tested
  with the reservoir in the loop since pre-probe days
- **Cognition loop** (big LLM reads usage histogram + replays, modifies
  action vocabulary between rounds) — the right idea but premature until
  we have a game where multiple actions NEED to be used. Adding a smarter
  vocabulary designer to a game that only needs one vocabulary entry is
  wasted machinery.

**Note on trust**: every experiment is in `games/hunch/test/`, every
result is journaled in this file with real numbers, and every commit is
small and reversible. Nothing is fabricated. If a number looks wrong,
rerun the test — all bundles rebuild with one command.

---

## Session 9 — Priority-based action selection (2026-04-05)

### The pivot

Robby's reframe mid-session 8 follow-up: "Have we explored the angle
enough that the 'load' on the 'hardcoded' part should become less as the
'reflexes' improve?"

The answer was no. Sessions 5-8 demonstrated Pipeline A beating Pipeline B
convincingly, probes generalizing across evader flavors, and the training
pipeline working end-to-end. But the load on the hardcoded code hadn't
shifted at all — the reflex layer was just filling in parameter values
inside a fixed decision structure. Cops.ts still decided WHEN to commit
vs intercept via hardcoded branches; the probe just set the blend weight.

This session is the architectural move that actually shifts load.

### What changed

**Previous pattern**: hardcoded branches structure the decision; reflex
fills parameter blanks within the structure.
```ts
if (visible) chase;
else if (ghost) target = commit*conf + intercept*(1-conf); // ← reflex fills conf
else patrol;
```

**New pattern**: hardcoded code defines a vocabulary of atomic actions;
reflex selects which action to take by scoring priorities.
```ts
candidates = [chase_visible, commit_ghost, intercept, cut_off, guard,
              converge, spread, move_N/S/E/W, hold, patrol, center, scatter]
priorities = reflex_probes.forward(activation)   // one score per action
action = highest_priority_available(candidates, priorities)
```

15 atomic actions in the registry, each with `{name, description,
available(me,world), execute(me,world)}`. Cops.ts shrank to a 20-line
argmax loop.

Responsibilities transferred from hardcoded branches to learned priorities:
- when to chase visible vs commit to ghost → LEARNED
- when to intercept vs guard extraction → LEARNED
- when to coordinate with allies → LEARNED
- when to patrol vs actively hunt → LEARNED
- what direction to move when no enemy info → LEARNED

### Pipeline A results on 15-action vocabulary

Training: joint ES on all 15 × 769 = 11,535 trainable parameters.
6 ES steps, 2 perturbation pairs, σ=0.4, lr=0.3.

```
baseline:  15.6% (5/32)
trained:   50.0% (16/32)
delta:    +34.4pp  in 25 minutes wall time
```

### What the trained cops actually do

Action usage histogram (32 validation rounds, 54,640 total selections):
```
pursue_center        52,059  (95.3%)
commit_ghost          2,581  ( 4.7%)
everything else           0  ( 0.0%)
```

**The trained cops overwhelmingly just move toward the center of the
map.** 13 out of 15 actions are completely dead — never selected.
`commit_ghost` fires only when a ghost position is available and
happens to beat pursue_center's probe output for that specific tick.

### Content-dependence measurement

Per-action priority standard deviation across ticks (the direct test for
whether probes respond to situation or output near-constants):

```
guard_nearest_extraction  mean=0.533 std=0.0641  (highest variation)
cut_off_midpoint          mean=0.323 std=0.0622
move_south                mean=0.547 std=0.0397
...
commit_ghost              mean=0.933 std=0.0097
pursue_center             mean=0.939 std=0.0084  (lowest variation)
mean across all actions: 0.0300
```

The two "winning" probes (pursue_center, commit_ghost) have the LOWEST
variation — they're saturated constants. The "dead" probes (guard_nearest,
cut_off) have the HIGHEST variation — they're actually responding to
the situation more, but losing the argmax competition.

This is the same "good constant" story from session 8, but structurally
richer: the probes that respond most to content are exactly the ones that
DON'T win the selection. The winning probes are just big constants.

### Why pursue_center wins

At first this surprised me. But `pursue_center` is strategically
excellent for a pursuit game:
- The center has the shortest average path to every point on the map
- 8 cops converging toward center create a closing net from all sides
- In a 40×30 grid, center cops are ≤15 tiles from any extraction point

Compared to `chase_visible` (which requires LOS and won't fire for
most cops most of the time) or `intercept_extraction` (which assumes
knowledge of the evader's destination), `pursue_center` is robust: it
works whether or not you know where the evader is.

### What a cognition layer would do with this data

The usage histogram is the signal a cognition layer reads between rounds:

1. **"pursue_center is 95% of my behavior"** → I'm basically a center-
   seeking missile. Can I do better than this? What if I split my pursuit
   between two points instead of one? What if I already checked center
   and found nothing — should I switch?

2. **"commit_ghost fires 5%"** → I occasionally chase last-known
   positions. This is the only situational behavior I have. Could I make
   it better? What if I modified its implementation to account for how
   stale the ghost is?

3. **"13 actions dead"** → These aren't useful as-is. Maybe intercept
   would work if it targeted a different extraction. Maybe patrol_cycle
   would work if patrol points were better placed. Maybe converge_on_ally
   is good but needs the right trigger.

A big LLM, given this histogram + round replays, could:
- Modify dead actions' implementations to be more competitive
- Invent new variants (e.g. `pursue_offset_northwest` to spread cops)
- Remove dead weight to shrink the ES search space
- Tune the winning actions (e.g. `pursue_center_then_sweep`)

This is the pathway to the hot-pursuit pattern of big-LLM-evolves-onTick:
the cognition layer edits the vocabulary, the reflex layer learns new
priorities, and the cycle repeats.

### Honest assessment

**What worked**: load genuinely shifted. Cops.ts went from ~30 lines of
branching logic to a 20-line argmax. Decisions that were previously
hardcoded (when to commit, when to patrol) are now in probe weights.
Pipeline A found a +34.4pp improvement on a 15-dimensional search space.
The usage histogram and priority-std diagnostics provide clean signals
for a cognition layer to act on.

**What didn't work**: content-dependence is still low. Probes learned to
be big constants, not situation-reactive responders. The actions that DO
vary situationally lose to the constant-output winners. The game still
rewards a single dominant policy, and the reflex layer found it.

**What this tells us for next**: the architecture is right. The
vocabulary is right (or at least big enough — 13/15 dead is information).
What's missing is the feedback loop: a cognition layer that reads the
histogram, modifies the vocabulary, and forces the reflex layer to
contend with a more competitive action set. That's the thing that makes
content-dependence necessary — when there's no single dominant action,
probes MUST learn when each action is better than the others.

### The wrong next step (corrected)

My initial instinct was: "add a cognition loop — big LLM reads the usage
histogram, modifies the vocabulary, Pipeline A retrains." Robby's
response: **"it feels like we need a game / sim where one behavior isn't
so effective."**

He's right. The cognition loop is a solution to "the vocabulary needs
to evolve" — but that's not the problem. The problem is that the game
doesn't NEED situational decisions. Adding a smarter vocabulary designer
to a game with one dominant strategy just produces a smarter designer of
vocabularies that all converge to `pursue_center`.

The pattern across every session:
- Session 6: Pipeline A → constant (conf=high)
- Session 8: Pipeline A → constant (conf=1.0, urg=0.75)
- Session 8 MC: generalizes because the constant is universally good
- Session 8 state-to-text: format doesn't matter because content doesn't
  matter
- Session 9: 15-action vocabulary → 95% pursue_center

Every time we add more expressiveness to the reflex layer, training
collapses it back to one dominant behavior. The bottleneck is not the
reflex architecture — it's the game.

### Why the current game has one dominant strategy

40×30 grid. 8 cops. 3 extraction points on edges. Center is at most
20 tiles from any edge. 8 cops converging on center form a closing net
that covers every extraction. The evader can't slip through because cop
density is too high relative to map size. There's no situation where a
cop is better off NOT being at center.

### The actual next step: tag-your-dead

Discussion with Robby evolved further: rather than tweaking hunch's game
parameters, the right move is to test the reservoir+probe approach on a
REAL game that naturally demands situational play.

**tag-your-dead** (`games/tag-your-dead/`) is a demolition derby game in
this workspace with properties that directly address every limitation of
hunch's current game:

- **No discrete rounds**: continuous play, lives end on death, game runs
  continuously. Forces a training approach that doesn't depend on
  round-end outcome signals.
- **Rich moment-to-moment signals**: damage dealt/taken, collisions,
  proximity, speed, the "it" tag mechanic (3x damage multiplier), HP,
  score per second alive + per damage + kill bonus.
- **Cognition layer already exists**: actants have soma with identity,
  on_tick (compiled code running every frame), and memory. Between deaths,
  Claude API reflects on life replays and can edit on_tick code. This is
  exactly the two-layer system (cognition defines behavior, reflex
  selects/prioritizes).
- **5 personalities with different tactics**: Viper (strike-and-vanish),
  Bruiser (ram-charging), Ghost (herding), Rattler (intercepting), Dust
  Devil (chaotic). Built-in diversity.
- **Continuous arena with obstacles**: 4000×3000 toroidal wrapping arena
  with rocks, cacti, barrels, sand patches. No "center camping" possible
  — there is no center in a toroidal space.
- **Score independent per car**: each car's reward signal is clear and
  measurable.
- **Human player is removable**: the game runs actant-only if desired.

This game also surfaces the training approach question directly: ES
(batch evaluation between rounds) won't work without rounds. The right
approach for tag-your-dead is **temporal difference (TD) learning** —
online, incremental probe updates during play using a tick-level reward
signal composed from the continuous game events. The probes improve while
the game runs, not between batch evaluation passes.

TD learning also has a key property for content-dependent learning: each
tick is a learning opportunity with a unique situation and a unique
reward, so the probes are trained on a DISTRIBUTION of diverse situations
rather than replaying the same 8 fixed seeds. This is the condition
under which content-dependent probe outputs should emerge naturally —
different situations giving different rewards, forcing the probes to
discriminate.

### The case for LLM-as-reservoir (crystallized through discussion)

Robby named the key insight: "in game development I imagine this would
make it easier to work this in to the NPC / AIs / Actants b/c you don't
need to 'line up' or somehow make features out of the game data in the
same detailed way."

This is the actual value proposition of the LLM-as-reservoir approach
vs traditional game RL:

**Traditional**: game developer hand-designs a feature vector.
```
features = [hp/maxHp, 1/nearestEnemyDist, angleTo(enemy)/PI, speed/maxSpeed,
            isAgainstWall ? 1 : 0, enemiesInRange.length / maxEnemies, ...]
// Each feature is a human judgment. Takes days of iteration. Game-specific.
```

**Reservoir approach**: game developer writes a text description.
```
text = "hull 40%. enemy close northwest, fast. near wall. 3 cars visible."
activations = reservoir.embed(text)  // LLM does the feature extraction
// Adding new info = editing a string. Game-agnostic reservoir. Minutes not days.
```

The reservoir's pre-trained knowledge of English provides implicit feature
engineering. "Close" vs "far," "fast" vs "slow," "northwest" vs "behind" —
the LLM has representations for these concepts because they were useful
for next-token prediction on web text. A linear probe can extract them
without anyone writing `1/nearestEnemyDist`.

This matters for making the subsystem a standard part of actant
embodiment across games. The reservoir code is identical everywhere. The
training code is identical everywhere. The only game-specific part is the
state-to-text function — and writing a text description of what an actant
can see is trivial compared to designing a numerical feature vector.

Whether the free features from an 82M-parameter distilgpt2 are actually
GOOD ENOUGH to beat hand-designed features on any given game is an open
empirical question. But the development cost difference is enormous, and
that's the bet this experiment is making.

---

## Session 8 — Continuous leverage, 8 cops, MC generalization, state-to-text (2026-04-05)

### The hypothesis

After sessions 5-7 revealed that the binary confidence>0.5 gate created a
pathological "two capture rates" game (30% or 5%, nothing in between),
Robby proposed three changes aimed at the next experimental regime:
blended/nuanced hunch values (continuous instead of gated), larger pool
of actants, and greater evader diversity. The goal: create a richer game
space where training signal has room to move and where the MC
generalization test Robby flagged from the start becomes meaningful.

Then partway through execution, Robby added a fourth dimension: the text
format we feed the reservoir might matter — absolute vs relative vs
qualitative. Added as a dedicated ablation.

### Code changes (commit d587a99)

**cops.ts** — replaced `if (confidence > 0.5)` gate with a continuous
target blend. When a cop has a ghost position:
```
commit    = last_known_enemy
intercept = extraction point nearest the ghost
target    = commit * confidence + intercept * (1 - confidence)
```
Confidence is now a continuous lever from 0 to 1. 0.5 = midpoint cut-the-
corner. 1 = pure commit. 0 = pure intercept.

**game.ts** — cop speed now modulated by `distanceUrgency`:
```
speed_mult = 0.6 + 0.8 * urgency    (0.6× .. 1.4×)
```
0.6× at urgency=0 (cruising), 1.0× at 0.5 (normal), 1.4× at 1.0 (sprint
above evader peak). Second continuous lever, independent of confidence.
Evaders stay at fixed speed since their onTicks aren't trained.

**mode.ts** — default `copCount: 4 → 8`.

**evaders.ts** — added two flavors for MC diversity:
- `zigzag`: sine-wave perpendicular offset (period 40 ticks, amplitude 0.7)
  while heading to extraction. Predictable but non-linear motion.
- `camper`: lurk 2-3 tiles from nearest extraction, don't cross. Flee
  briefly when a cop is visible. Targets interception test.

Smoke test with all 6 flavors: determinism preserved, outcomes diversify
(flee 0/0/4, wander 0/4/0, decoy 3/1/0, smart 2/2/0, zigzag 3/1/0,
camper 0/2/2).

### Experiment 1: ablation (commit 458e619)

Swept confidence 0..1 (urgency fixed at 0.5) and urgency 0..1 (confidence
fixed at 0.5) with 32 eval seeds on smart evader / 8 cops. Plus a joint
5×5 grid.

Confidence sweep: **9% at confidence=0 → 47% at confidence=1**, roughly
monotonic with some noise (32 seeds still gives ±5pp CI).
Urgency sweep: 9% → 22%, smaller but real.

Joint 5×5 grid:
```
             urg 0.0  0.25  0.5   0.75  1.0
  conf 0.00     13%    6%    9%   19%   22%
  conf 0.25     13%    9%   13%   25%   28%
  conf 0.50      9%    9%    9%   19%   22%
  conf 0.75     16%   13%   22%   28%   31%
  conf 1.00     25%   47%   47%   56%   56%
  BEST: (conf=1.0, urg=0.75) = 56.3%
```

Critical findings:
1. Game is now continuous and monotonically responsive. No step function.
2. **Confidence=0.5 is the WORST point (9%)** — midpoint blend is worse
   than either pure commit or pure intercept. Random-init cops land
   exactly here.
3. **Peak is 56%** — higher than the binary-gate peak of 30%. The
   continuous blend is a strictly better game for cops.
4. Joint optimization matters — (1.0, 0.75) beats (1.0, 1.0) by 0pp but
   beats (1.0, 0.5) by 9pp. There's a local optimum in urgency space.

### Experiment 2: Pipeline B rescued from catastrophe (commit de92b14)

Re-ran Pipeline B on the new continuous setup with 32 collection + 32 eval
rounds, smart evader, 8 cops, logistic SGD on confidence probe.

```
session 5c (binary):   trained 5%  baseline 30%  delta −25pp
session 8  (continuous): trained 13% baseline  9%  delta  +4pp
```

The −25pp catastrophic regression is gone. Continuous blend eliminated
the knife-edge gate that let class-prior calibration land on the wrong
side of a binary behavior split. Pipeline B now moves in the right
direction, just barely.

Why only +4pp: Pipeline B still calibrates to class prior (8.5% positive).
Trained prediction mean lands at ~0.08, which per the ablation heatmap
puts cops at the BOTTOM-LEFT of the response surface (9-13% capture).
Random baseline predicts ~0.5 → stuck at the WORST point of the heatmap
(also 9%). Both end up in the bottom row, Pipeline B shifted slightly
better along one column. The ceiling (56%) is unreachable.

### Experiment 3: Pipeline A joint optimization hits the ceiling (commit 5ffd27c)

Pipeline A with joint ES on BOTH confidence and distanceUrgency probes
simultaneously. 8 optimize seeds per candidate, 32 validation seeds, 6 ES
steps, 2 noise pairs per step.

Trajectory from random init:
```
step 0: base=0%   mean=34%  best=63%  |conf|=4.4  |urg|=4.4
step 1: base=50%  mean=44%  best=63%  |conf|=5.8  |urg|=5.9
step 2: base=63%  mean=44%  best=50%
step 3: base=63%  mean=50%  best=63%  |conf|=7.0  |urg|=6.8
step 4: base=63%  mean=56%  best=63%  |conf|=7.4  |urg|=7.0
step 5: base=63%  mean=50%  best=63%  converged

initial validation: 9.4%  (3/32)
final validation:   56.3% (18/32)  delta: +46.9pp over 26 minutes
```

**56.3% exactly matches the ablation's joint ceiling at (conf=1.0,
urg=0.75)**. Pipeline A found the globally optimal policy for this
continuous game.

Both weight norms grew from ~0.28 to ~7. Biases stayed near zero. So
weights are doing the work — content-dependent readouts, not just bias
tuning... OR weights tuned to produce near-constant outputs that happen
to saturate the sigmoid above the inflection. The next experiment
distinguishes these.

### Experiment 4: MC generalization (commit e338985)

The test Robby flagged from session 0. Train Pipeline A on
{flee, wander, zigzag}, evaluate on {decoy, smart, camper} — both flavor
sets have 3 members with diverse motion patterns.

```
BASELINE (random probes, same seed)
  in-distribution   (train flavors):  6.7%
    flee=0%  wander=10%  zigzag=10%
  out-of-distribution (held-out):     20%
    decoy=50%  smart=10%  camper=0%

TRAINED (Pipeline A on training flavors, 6 ES steps)
  in-distribution:   36.7%  flee=0%  wander=50%  zigzag=60%
  out-of-distribution: 66.7% decoy=60% smart=70% camper=70%

  in-dist delta:   +30.0pp
  out-of-dist delta: +46.7pp
  generalization ratio: 156%   (out > in)
```

Per-flavor highlights:
- **camper 0% → 70%** (+70pp) — largest single-flavor jump. Campers lurk
  near extractions; trained cops commit+sprint and devastate them.
- **smart 10% → 70%** (+60pp)
- wander/zigzag (training) also climb ~40-50pp
- flee stays at 0% — the flavor is ~unwinnable under any policy

The 156% generalization ratio (held-out improved MORE than training
distribution) was the session's biggest surprise. Interpretation:
- Training set's `flee` drags the in-dist metric down (it's always 0%
  regardless of policy)
- Learned policy is "commit + sprint" which transfers cleanly to any
  extraction-seeking evader, and held-out has 3 extraction-seekers vs
  training's 1 (zigzag)
- Probes didn't overfit. They generalized, massively.

But: the learned policy is likely near-constant. The caveat I flagged
here got confirmed in the next experiment.

### Experiment 5: state-to-text ablation (commit 4079f17)

Robby asked mid-session: "does the input format matter? What about
relative values, different data selections?" Added 5 candidate formats:
- `absolute` (current): `"t120. cop at (3,-5). enemy visible at (5,3)."`
- `relative`: `"enemy visible 8 tiles northeast. extract 14 tiles south."`
- `qualitative`: `"enemy close, south. extraction far northwest."`
- `rich`: multi-entity + facing direction
- `minimal`: `"enemy visible, pursuing."`

**Passive test** — activation statistics across 80 diverse game states:
```
Format      mean_l2  cos_sim  mean_std  eff_dim
absolute    7.350    0.9945   0.0172    331.6
relative    7.407    0.9986   0.0089    412.2
qualitative 7.444    0.9967   0.0115    166.0
rich        7.765    0.9990   0.0079    394.9
minimal     5.921    1.0000   0.0000     86.7
```
Counterintuitively, `absolute` had the best (lowest) cosine similarity —
numeric tokens create stronger per-state differentiation than compass
words. `relative` had highest effective dimensionality. Different metrics
pointed different directions, no clear passive winner.

**Active test** — Pipeline A trained for each format:
```
format       init    final    delta
absolute     6.3%    56.3%    +50.0pp
relative     12.5%   56.3%    +43.8pp
qualitative  6.3%    56.3%    +50.0pp
```

**All three formats converged to EXACTLY 56.3%.**

This is the ablation's joint ceiling (conf=1.0, urg=0.75 = 56%) reached
regardless of text format. The format question turned out to be the wrong
question.

### The unifying insight

Four experiments in session 8 all point to the same conclusion:

1. **Pipeline A hits 56.3%** starting from random init (experiment 3)
2. **MC generalization produces "general purpose good policy"** that
   transfers to held-out flavors at 66.7% (experiment 4)
3. **All text formats converge to 56.3%** (experiment 5)
4. **The ablation's best constant pair gives 56.3%** (experiment 1)

**Pipeline A is finding the best constant, not learning situation-specific
reflexes.** The optimal policy on the current cops.ts is approximately
uniform — "commit aggressively, sprint hard" regardless of the specific
activation content. Because the optimum doesn't vary by situation, the
reservoir's input content barely matters (format ablation), training
trajectories from different starting points converge to the same place
(pipeline A runs), and held-out evaders benefit from the same learned
constant as training ones (MC generalization).

This is not a failure of the reservoir idea. It IS a finding about what
kind of learning this game supports. Linear probes on frozen LLM
activations CAN produce continuous policy improvements (+47pp in
Pipeline A, demonstrated empirically) — but to demonstrate content-
dependent "hunches" (different situations producing different reflexes)
we need a game where the OPTIMAL POLICY ITSELF varies by situation.

### What Robby's three proposed next steps look like through this lens

Looking back at the three directions Robby suggested (blended values,
larger actant pool, greater diversity), session 8 showed:
- **Blended values**: worked as intended. Eliminated Pipeline B's
  catastrophic failure mode. Gave training a continuous gradient to
  ride. Pipeline A climbed smoothly.
- **8 actants + diverse evaders**: gave MC generalization meaningful
  scope. Produced the 156% generalization ratio result, which is
  striking on its own even if its mechanism is "general-purpose good
  constant."
- **State-to-text (Robby's addition)**: confirmed that format doesn't
  matter for this cops.ts, which is the cleanest way to demonstrate
  that the policy-is-constant story is real.

### Next experimental moves (ranked)

1. **Content-dependent cops.ts**: redesign so that different situations
   reward different optimal policies. Candidates:
   - Ally coordination (confidence depends on what other cops are doing)
   - Stamina/cooldown on sprinting (urgency must be temporally selective)
   - Map-awareness (local topology changes optimal commit-vs-intercept
     tradeoff)
   This is the big one — it's the pathway to demonstrating
   situation-specific learned reflexes.

2. **Quantify probe output variance during play** to confirm the
   constant-policy hypothesis numerically.

3. **Revisit state-to-text** once cops.ts has content-dependent rewards.
   Format may suddenly matter a lot.

4. **Try larger reservoir (GPT-2 small)** once there's content-dependent
   learning — distilgpt2 was picked for speed when we didn't know if
   content mattered; if it does, more layers of feature extraction may
   help.

### Wall time

Session 8 consumed roughly 90 minutes of compute:
- Pipeline B: ~7 min
- Pipeline A (joint, 32 validate seeds): ~26 min
- MC generalization: ~28 min
- State-to-text passive: ~1 min
- State-to-text active (3 formats): ~31 min
- Smoke + ablation + misc: ~5 min

---

## Session 7 — Phase 6: Pipeline A climbs out of the failure hole (2026-04-05)

### What happened

Implemented Pipeline A as Evolution Strategies on probe weights: perturb → evaluate → outcome-driven gradient → update. No label construction. No class-prior drag. Just directly optimize capture rate as a scalar function of probe weights.

Files:
- `src/training/pipeline-a.ts` — `esStep()` with antithetic sampling
- `test/pipeline-a.mjs` — run the ES loop with evaluation on a fixed seed batch

### Two runs

**Run 1** (initial: random probe, bias=0 → already in commit mode):
```
initial  capture rate: 37.5%  |w|=0.28  bias=0
step 0  base=38% mean=19% best=38%  |w|: 0.28→3.10  gradient norm 10.2
step 1  base=38% mean=31% best=38%  |w|: 3.10→3.56
step 2  base=38% mean=38% best=38%  |w|: 3.56→3.56  gradient norm 0 (plateau)
...
final    capture rate: 37.5%  |w|=3.95  bias=-0.011
delta: 0pp  (but weights grew — ES protected the optimum from perturbations)
```

This is a null result but important. ES found weights strong enough that most perturbations couldn't flip behavior — sigmoid saturated. Starting already at the optimum, ES had nowhere to go, and it successfully held position.

**Run 2** (initial: bias = -2 → starts in intercept mode, below Pipeline B's failure rate):
```
initial  capture rate: 0%    |w|=0.28  bias=-2.00
step 0  base= 0% mean=19% best=38%  |w|: 0.28→3.82  |g|=7.619  bias=-1.885
step 1  base=13% mean=19% best=38%  |w|: 3.82→5.46  |g|=7.506  bias=-2.037
step 2  base=38% mean=22% best=38%  |w|: 5.46→6.39  |g|=6.190  bias=-2.106
step 3  base=38% mean=28% best=38%  |w|: 6.39→6.80  |g|=5.290  bias=-2.096
step 4  base=38% mean=34% best=38%  |w|: 6.80→6.86  |g|=1.723  bias=-2.082
step 5  base=38% mean=38% best=38%  |w|: 6.86→6.86  |g|=0.000  (converged)
final    capture rate: 37.5%  |w|=6.86  bias=-2.08
delta: +37.5pp  in 13 minutes wall time
```

**This is the experiment's headline result.** Starting from a worse position than Pipeline B's failure mode (0% vs 5%), Pipeline A climbed to the maximum achievable capture rate on these seeds.

### Mechanistically what happened in run 2

The bias stayed ≈ -2 throughout. ES didn't just flip the bias back up. Instead, it grew the WEIGHTS from norm 0.28 → 6.86, aligning them with activation-space directions that correlate with "commit is the right move here". The logit `w·x + b` flipped from ≈ -2 (sigmoid 0.12, intercept) to ≈ +small (sigmoid 0.5+, commit) via `w·x` growing to dominate the bias.

This is genuinely learning something structural. Unlike Pipeline B, which calibrated to class priors, Pipeline A found a weight vector that distinguishes "situations where committing works" from the rest. That's what hunches were supposed to be.

### Why Pipeline A succeeds where Pipeline B fails

Pipeline B minimizes a surrogate loss (label prediction) that asymptotes to the class prior. Its optimum is 9% (the prior), on the wrong side of the 0.5 gate. The surrogate optimum ≠ the behavioral optimum.

Pipeline A minimizes the actual behavioral objective (negative capture rate) directly. There is no surrogate, no class-prior drag, no sigmoid-saturation failure on labels. When ES perturbs weights and measures the outcome delta, it reads the 25-point capture rate gap directly and walks uphill.

The failure mode Pipeline B exhibits — "probe trains beautifully, behavior gets worse" — is exactly what counterfactual methods are supposed to fix. The conceptual doc predicted this and hunch demonstrated it cleanly.

### Honest caveat

Our Pipeline A is Evolution Strategies on probe weights with fresh-round evaluation, NOT true per-tick counterfactual replay. It's a simpler cousin that shares the key property: outcome-driven updates that don't pass through label surrogates. A true per-tick counterfactual (perturb confidence at tick K, replay from K with frozen past) would give finer credit assignment and is the next step for anyone who wants Pipeline A to scale to harder problems.

### Decisions locked

- **Pipeline A wins**, at least on this experiment. The comparison table in the status summary at the top of this journal is the experiment's core artifact.
- **Keep both pipelines in the codebase**. They're not "A succeeded, delete B". They're a dyad showing the gap between correlational and outcome-driven learning on a gated action space. The contrast is the finding.
- **Evolution Strategies is the right Pipeline A baseline for a CPU-only experiment**. Fine-grained counterfactual replay would require per-tick game state snapshots + replay harness, which we have plumbing for (captureSnapshot) but not the full restore path.
- **Stop here for today**. 7 sessions, 8 commits, a complete A-vs-B story. Phase 8 MC generalization is the obvious next experiment but requires another ~30-60 min of wall time and is best done after Robby sees what we have.

### Next (for future session)

Phase 8: MC generalization. Train Pipeline A on `{flee, wander}`, evaluate on `{decoy, smart}`. If held-out capture rate ≈ training capture rate, probes learned transferable structure. If held-out collapses, probes overfit to training distribution.

---

## Session 6 — Phase 5b/c: the two-arm split + ablation reveals binary game (2026-04-05)

### Iteration: stronger hunch leverage

Updated `cops.ts` to use confidence as a two-arm split when the cop has a ghost position:
- `confidence > 0.5` → **commit** (chase last-known enemy)
- `confidence ≤ 0.5` → **intercept** (head to extraction nearest the ghost)

Both arms produce substantial motion. Determinism preserved (smoke test still passes; minor shift in wander flavor from 233→235 ticks confirms the new branch actually fires in ghost scenarios).

### Re-ran Pipeline B with the new onTick

```
STAGE 1: collect 20 rounds (outcomes: captured=2, escaped=9, timeout=9)  — 75s
         buffer: 2188 confidence-labeled samples, 9.3% positive
STAGE 2: train 30 epochs
         loss: 0.693 → 0.272  (matches class prior — 9.3% positive → H(0.093) ≈ 0.45, we got even lower)
         pred mean=0.094  std=0.050
STAGE 3: evaluate 20 rounds
         trained  captured=1/20  (5%)
         baseline captured=6/20  (30%)
         DELTA: -25%
```

**Training made it worse.** The probe learned perfectly to predict capture, and deploying it actively harmed capture rate. This is a much more informative result than the 0% delta from Phase 5a — it proves the hunch now has real behavioral leverage, and that Pipeline B is using that leverage wrong.

### Ablation (test/ablation.mjs) — disentangling training from behavior

Ran 7 groups × 20 rounds on the same eval seeds:

```
A: const_high (0.9)            30%    ← always commit
B: const_low (0.1)              5%    ← always intercept
C: random + real reservoir     30%    ← mean 0.525 > 0.5 → commit
D: random + null reservoir      5%    ← mean 0.500 (bias=0) → gate is >, so false → intercept
E: const 0.5                    5%    ← gate is >, 0.5 doesn't pass → intercept
F: const 0.6                   30%    ← above gate → commit
G: const 0.4                    5%    ← below gate → intercept
```

**The game has exactly two capture rates: 30% and 5%**. Everything above the gate hits 30%, everything at-or-below hits 5%. No middle ground, no continuous response. The probe's output matters only for whether it's strictly greater than 0.5.

### Biggest surprise: group C vs group D

Same random probes. Same eval seeds. Only difference: real reservoir (dim 7.4 L2 norm input) vs null reservoir (zero input).

- C: `confidence = sigmoid(w·activation + bias) ≈ sigmoid(0.025 + 0) ≈ 0.506` → gate passes → **commit → 30%**
- D: `confidence = sigmoid(0 + 0) = 0.5` → gate fails (strict >) → **intercept → 5%**

A difference of 0.006 in probe output flips the entire game. The reservoir's contribution isn't the information in its activations — it's the infinitesimal amount by which those activations perturb the sigmoid off exactly 0.5.

### Diagnosis: quantized outcome space defeats Pipeline B

Pipeline B's logistic regression optimizes **per-sample label prediction**, which asymptotes to the class prior when the per-sample signal is weak. With 9.3% positive class and a linear probe on mean-pooled KV cache, predicted mean → 0.094. That's on the wrong side of a 0.5 gate controlling a binary behavior.

This is a textbook failure of correlational learning on a discrete action space. The probe can predict outcomes accurately (low loss!), and the probe can influence behavior strongly (±25% capture rate!), but the two connect through a non-differentiable gate that Pipeline B has no way to reason about.

### What this means for the experiment

This is *exactly* the failure mode the conceptual doc predicts for correlational training and which Pipeline A (counterfactual replay) is designed to solve. Pipeline A asks "if I perturbed confidence here, would outcome change?" and directly reads the 25% effect — no label construction, no class-prior drag, no sigmoid saturation issue. It lands on "confidence should be > 0.5" in a single step.

I couldn't have scripted a cleaner motivating finding. The ablation result is the experiment's best artifact so far — it shows the Pipeline B failure mode with clean numbers and suggests the exact shape of the Pipeline A solution.

### Decisions locked

- **Keep the two-arm cop onTick.** The quantization problem is real and worth preserving — it's the very condition that makes Pipeline A valuable to test. Smoothing the gate into a blend would make Pipeline B look better while hiding the pipeline difference.
- **Keep Pipeline B code in place.** It's a baseline, not a failure. The experiment's core finding IS the gap between A and B.
- **Commit the ablation results as a first-class artifact.** The summary table is more valuable than any code for understanding the hunch layer's role.
- **Move to Pipeline A immediately.** The setup is perfectly primed for it.

### Next

Phase 6: Pipeline A implementation. Plan:
- Keep it simple first: **Evolution Strategies / policy gradient via weight perturbation**. No per-tick replay required — just perturb the probe, evaluate on a batch of rounds, move in the direction of improvement.
- Budget: 10 ES steps × 2 evals × 10 rounds = 200 round evals ≈ 13 minutes wall time.
- Metric: capture rate on the same eval seeds used in Pipeline B. Expected result: confident convergence to 30% (commit mode).
- If Pipeline A hits 30% and Pipeline B hit 5%, we have a **35-percentage-point delta** between pipelines on identical activations. That's the experiment's headline.

---

## Session 5 — Phase 5a: training works, behavior doesn't move (2026-04-05)

### What happened

Built Pipeline B: training buffer, binary-capture credit assignment, logistic SGD probe trainer. Ran a first offline training experiment: collect 20 rounds → train `confidence` probe → evaluate 20 rounds trained vs 20 baseline.

### Results

**Stage 1: collection** (20 rounds smart evader, random probes, 76s total)
```
outcomes: captured=4  escaped=9  timeout=7
buffer: 2700 samples (2160 with confidence labels, 19.6% positive)
```

Healthy distribution — not degenerate like `flee` (100% timeout) or `wander` (100% capture). Signal is present.

**Stage 2: training** (30 epochs SGD, 2160 samples, L2=1e-4)
```
loss: 0.6926 → 0.4293      (38% reduction, well below the 0.50 you'd get from
                             predicting the class prior — probe learned something)
weight norm: 3.55           (grew 12× from random init — meaningful update)
prediction mean: 0.1958     (≈ class prior 0.196 — probe calibrated to base rate)
prediction std: 0.0789      (79× the random-init std of 0.001 — reactive now)
```

The probe trained successfully. It's predicting meaningfully different confidence values for different activation states, and it's calibrated to the label distribution. By any traditional ML metric this is "training worked."

**Stage 3: evaluation** (20 rounds each, trained vs baseline)
```
trained   outcomes: captured=6 escaped=10 timeout=4  →  30% capture rate
baseline  outcomes: captured=6 escaped=10 timeout=4  →  30% capture rate
                    delta = 0%  (same on every seed pair too)
```

**Behavior change: zero.** Training moved the probe significantly but had no effect on capture rate.

### Diagnosis

The `confidence > 0.4` threshold in `cops.ts` only gates ONE branch: "chase last-known enemy position". Let's look at both probe regimes through this gate:

- Baseline (random init): `confidence ≈ 0.53`, std 0.001 → **always > 0.4** → cops ALWAYS chase ghosts
- Trained: `confidence ≈ 0.20`, std 0.079 → **almost never > 0.4** → cops ALMOST NEVER chase ghosts

Opposite behaviors. Identical outcomes. Conclusion: **whether cops chase last-known enemy positions doesn't meaningfully change capture rate on this map with this evader**. Once the evader breaks LOS they've moved; chasing a stale ghost position is statistically wasted motion.

This is a textbook case of the conceptual doc's "the code IS the fitness function" principle. Training can only shape behavior through branches the code actually uses, and those branches have to be load-bearing for outcomes. A hunch gating a non-load-bearing branch cannot affect the outcome, no matter how well the probe trains.

### What this tells us

1. **The reservoir + probe machinery works end-to-end.** Samples flow, gradients flow, predictions change, determinism holds. Phases 0-4 all gave us a working pipeline.
2. **Linear probes on mean-pooled KV cache CAN learn game outcomes.** Loss reduction + variance growth prove the reservoir contains enough signal for correlational learning.
3. **The current cop onTick has insufficient hunch leverage.** Only one hunch branch, and it gates a non-critical decision. This is a code problem, not a reservoir problem.
4. **Correlational training does predict outcomes**, which is what the probe LOSS measures. But predicting outcomes ≠ causing better outcomes. This is the gap Pipeline A (counterfactual replay) is meant to expose — and it's showing up early, at Pipeline B, because our behavioral code doesn't expose enough leverage.

### Next

Iterate on `cops.ts` — add hunch branches with more behavioral leverage, and re-run the experiment. Specific plan:

- Replace the single confidence gate with a two-arm split: high confidence → commit to chasing last-known; low confidence → head to nearest extraction to cut off escape routes. Both arms produce meaningful motion.
- Optionally: add `threatLevel` gate on patrol target selection.
- Re-run Pipeline B on the new onTick. Measure capture rate delta.
- If still no delta: add a diagnostic to verify branches are firing differently between trained and baseline.

This is a legitimate exploration step — forming a hypothesis ("hunch branches need more leverage") and testing it.

---

## Session 4 — Phase 4: reservoir + probes in the game loop (2026-04-05)

### What happened

Wired the reservoir + ProbeSet into the game loop via an `async preTick()` hook. Headless loop becomes `await game.preTick(); game.stepTick(dt);`. When `reservoir` + `probeSet` are not provided, preTick is a no-op and the loop falls back to RNG-noise hunch values (preserves Phase 1 smoke test behavior).

Files added:
- `src/probes/probe.ts` — `LinearProbe` class (sigmoid(w^T x + b)), random init via seeded RNG, JSON serialization
- `src/probes/probe-set.ts` — `ProbeSet` bundle of the 5 named hunch probes with optional dataset centering (Phase 3 finding: centering will matter)
- `test/e2e-reservoir.mjs` — full end-to-end test: real distilgpt2 + random probes + runHeadlessAsync

Files modified:
- `src/actant.ts` — ChassisState gains `latestActivation`, `latestHunch`, `lastReservoirTick`
- `src/game.ts` — `async preTick()`, `async runHeadlessAsync()`, `peekPerception()` (read-only, for state-to-text), GameOptions extended with `reservoir`, `probeSet`, `reservoirCadence`, `onTrainingSample`
- `src/game.ts` — `buildPerception` reads `chassis.latestHunch` when reservoir is configured, falls back to RNG otherwise

### E2E test results

```
Loading reservoir... loaded  dim=768  in 1355ms
Probes initialized: threatLevel, distanceUrgency, terrainRead, confidence, readiness  inputDim=768

TEST 1: single round (flee evader, seed=42, cap 600 ticks)
  outcome=timeout ticks=600 closest=8.68t
  wall time: 8715ms  (14.5ms/tick)                  ← close to real-time budget
  training samples collected: 305

TEST 2: hunch variance across 305 samples
  threatLevel      min=0.4902 max=0.4972 mean=0.4944 std=0.0011
  distanceUrgency  min=0.4770 max=0.4862 mean=0.4812 std=0.0029
  terrainRead      min=0.5246 max=0.5317 mean=0.5281 std=0.0018
  confidence       min=0.5251 max=0.5348 mean=0.5293 std=0.0023
  readiness        min=0.5094 max=0.5158 mean=0.5126 std=0.0014

TEST 3: cadence schedule
  evader-0  samples=61  strides=[9,10]  ticks[0..5]=1,10,20,30,40,50
  cop-0..3  samples=61  strides=[9,10]  ticks[0..5]=1,10,20,30,40,50

TEST 4: determinism (two runs with identical config)
  match=true                                         ← Pipeline A still viable

TEST 5: null reservoir baseline
  outcome=timeout ticks=600 wall=7ms
  vs real: outcome=timeout ticks=600 wall=8715ms    ← same outcome — hunches not influencing behavior
```

### Key findings

1. **Latency math works out**. 5 actants × 6Hz reservoir × 28ms = 840ms/sec of reservoir work, amortized across 60 ticks/sec = 14ms/tick. Real-time feasible for interactive, trivially fine for headless training.

2. **Hunch variance is tiny — confirms Phase 3 prediction**. Mean-pooled KV cache cosine ~0.98 across inputs translates to probe outputs clustered within a 0.01-width band. For `cops.ts`'s `confidence > 0.4` branch with min=0.525, **the branch is ALWAYS true**. Cops always chase ghosts. This is essentially constant behavior, not hunch-gated.

3. **Null reservoir produces identical outcomes to real reservoir** on the same round. This is the strongest evidence: with untrained probes at this init scale, the reservoir is **not influencing behavior**. It's noise-in-noise-out. Everything works mechanically, but the hunch layer doesn't matter until probes are trained.

4. **Determinism survives**. Two runs with same seed + same-seed probes produce bit-exact matching final states. The reservoir forward pass is deterministic (Phase 3), the probes are pure math, the cadence schedule is tick-based. Pipeline A is still viable.

5. **The RIGHT failure mode**. This is exactly where the experiment should be after Phase 4. The plumbing is correct; the missing piece is training. Phase 5 will produce probe weights that make the reservoir matter.

### Things I'm tracking for Phase 5

- **Centering matters**: subtract the dataset mean from activations before probing. The "universal GPT-2 direction" that dominates mean-pool will be factored out, leaving per-input variance visible.
- **Training label for `confidence`**: discounted round outcome. For cops, `target(tick) = γ^(ticks_to_end) × (1 if captured else 0)`. Classic RL discounted return. Clean label, no heuristics.
- **Start with one probe**: `confidence` only. Once that trains and improves capture rate, extend to other probes with appropriate labels. Don't boil the ocean.
- **Training cadence**: retrain after every round initially. Probe weights come from closed-form regression (or few GD steps). No need for expensive optimization.
- **Pipeline A comes AFTER Pipeline B works**. Counterfactual replay adds complexity; get correlational learning working first.

### Decisions locked

- **Integration shape**: `async preTick()` + `runHeadlessAsync()`. Clean separation from sync stepTick. Browser can fire preTick as fire-and-forget; Node headless awaits it.
- **Cadence default**: 10 ticks (6Hz). Tunable via GameOptions.
- **Training sample emission**: via `onTrainingSample` callback on preTick. Game doesn't store a buffer internally — callers own the buffer. Clean separation.
- **Null baseline stays in the test suite** as a sanity check: if trained probes don't beat null on held-out flavors, training hasn't learned anything real.

### Next

Phase 5: Pipeline B correlational training.
- `src/training/buffer.ts` — ring buffer of training samples keyed by (round, actant, tick)
- `src/training/credit.ts` — compute discounted-outcome target per sample from round result
- `src/training/pipeline-b.ts` — closed-form linear regression (or mini-batch SGD) on buffer, updates `confidence` probe weights
- Write a training-loop test: run N rounds, retrain confidence probe after each, measure capture rate trend

---

## Session 3 — Phase 3 reservoir bridge working (2026-04-05)

### What happened

Built the reservoir bridge: abstract `ReservoirBridge` interface, `OnnxReservoirBridge` implementation using `@huggingface/transformers` + `onnxruntime-node`, `stateToText()` serializer, and a `NullReservoirBridge` baseline.

Files added:
- `src/reservoir/bridge.ts` — interface + null backend
- `src/reservoir/onnx-bridge.ts` — ONNX implementation with KV-cache pooling
- `src/reservoir/state-to-text.ts` — (me, world) → short string
- `test/reservoir.mjs` — standalone node integration test

### KV-cache pooling implementation

Per the Phase 0 finding, Xenova ONNX exports expose `present.X.key` and `present.X.value` instead of `hidden_states`. The `OnnxReservoirBridge`:

1. Warms up once on load to auto-detect layer count and head_dim by introspecting the output tensor
2. For each forward pass: iterates `present.0..N.key/value`, each of shape `[1, num_heads, seq_len, head_dim]`
3. Mean-pools over heads + tokens per layer → `[head_dim]` per K and per V
4. Concatenates all layers → 768-dim Float32Array for distilgpt2 (6 layers × 2 × 64)

### Integration test results (test/reservoir.mjs, bundled via esbuild → node)

```
Loading reservoir...
  loaded in 1400ms  dim=768            ← model cached from Phase 0, fast startup

TEST 1: state-to-text samples (target: ≤50 tokens, actual ~52-70 chars)
  t10. cop at (0,0). no enemy. nearest extract (0,14).                       [52 chars]
  t120. cop at (3,-5). enemy visible at (5,3). nearest extract (0,14).       [68 chars]
  t240. cop at (-7,8). enemy last seen at (2,1). nearest extract (0,14).     [70 chars]

TEST 2: embed output shape
  embed shape: 768  expected: 768  match=true
  has NaN: false
  l2 norm: 7.3734                     ← reasonable scale, activations healthy

TEST 3: determinism
  max |e1a - e1b| = 0.000e+0         ← bit-exact deterministic
  deterministic: true

TEST 4: reactivity (cosine similarity between different game states)
  pair 0-1: l2diff=1.3659  cos=0.9843
  pair 0-2: l2diff=1.4636  cos=0.9826
  pair 1-2: l2diff=1.0024  cos=0.9916

TEST 5: latency at realistic input (68 chars)
  p50=28.0ms  p95=29.3ms  min=27.1  max=29.3
```

### Surprises + findings

1. **Cosine similarity ~0.98-0.99 between very different game states.** This is high. It means the mean-pooled KV cache sits in a tight cone of GPT-2's activation space regardless of input — the variance per input is small relative to the shared structure.

   This is expected behavior for mean-pooled transformer features (models have strong "universal" directions that dominate the mean). It is a risk for linear probes: if per-input variance is small, probes have less signal to work with.

   Three mitigations to try in Phase 4 if probes underperform:
   - **Center features**: subtract the dataset mean before probing. Removes the shared "universal" direction.
   - **Pool differently**: use last-token activations instead of mean, or use a single middle layer instead of all layers concatenated.
   - **Whitening**: after centering, divide by per-dim std. Standard linear-probe preprocessing.

   Filing these as knobs to turn in Phase 4 rather than pre-solving.

2. **L2 difference is substantial (1.0-1.5)** even when cosine is ~0.98. So there IS meaningful variation, just along a direction that's nearly orthogonal to the "mean" cone. Probes that center features should see strong signal.

3. **Latency matches Phase 0 exactly.** p50=28ms at 68 characters — right where Phase 0 medium (34 tokens ≈ 70 chars) landed. Good calibration.

4. **Bit-exact determinism from the model.** Max diff across two runs = 0.0 (not ~1e-7 float noise — literally zero). Means hunch's Pipeline A counterfactual replay will survive the reservoir layer without any diff tolerance.

5. **Dynamic import pattern works in both browser and node.** `await import('@huggingface/transformers')` lets the bridge be importable from both the browser bundle (via webpack/esbuild) and Node headless tests, without two separate source files.

### Decisions locked

- **Reservoir output is 768-dim**, fixed at load time via introspection. Probes will be `Float32Array → scalar` linear maps of shape `[768 + 1 → 1]` (weights + bias).
- **Dataset centering will be applied before probing** — Phase 4 implementation will compute a running mean over the training buffer and subtract it before forwarding through probes.
- **Reservoir cadence is a tuning knob for Phase 5**, not locked yet. Plumbing allows any cadence; training will tell us what's affordable.
- **Keep the `NullReservoirBridge` around** as a training baseline — compare probe performance with real reservoir vs untrained null vector. If they perform similarly, we know the reservoir isn't providing useful features.

### Next

Phase 4: linear probes + wire reservoir into game loop. Plan:
- `src/probes/probe.ts` — LinearProbe class: `{ W, b }` + `forward(x) → scalar`, `save/load JSON`
- `src/probes/probe-set.ts` — a bundle of named probes producing hunch values
- `src/game.ts` — add optional `reservoir` and `probeSet` to GameOptions; when present, async reservoir pump updates a per-actant hunch cache; `buildPerception` reads cache
- Initialize probes with small random weights; verify they produce non-constant hunch values during headless rounds
- Add an end-to-end test: run a round with real reservoir + random probes, confirm outcomes still distribute + determinism holds

---

## Session 2 — Phase 0 reservoir benchmark (2026-04-05)

### Tools

`@huggingface/transformers@4.0.1` + `onnxruntime-node@1.24.3` installed in `bench/`.
Script: `bench/bench.mjs`. Models auto-download to `bench/models/` (gitignored, 795MB).

### Raw results (see `bench/bench-results.json`)

Ran each model on 3 state-to-text variants: short (19 tok), medium (34 tok), long (143 tok).
20 warm iterations each.

```
── Xenova/distilgpt2 ──
  load+download:  86456ms   (first run, cached after)
  short   tokens= 19  min=22.1  p50=25.3  p95=30.3  max=30.3ms
  medium  tokens= 34  min=28.6  p50=30.4  p95=35.1  max=35.1ms
  long    tokens=143  min=86.3  p50=96.5  p95=150.0 max=150.0ms
  rss=831MB  heapUsed=31MB

── Xenova/gpt2 ──
  load+download: 112776ms
  short   tokens= 19  min=35.3  p50=37.5  p95=49.0  max=49.0ms
  medium  tokens= 34  min=64.6  p50=66.2  p95=72.4  max=72.4ms
  long    tokens=143  min=133.2 p50=146.6 p95=231.3 max=231.3ms
  rss=1463MB  heapUsed=31MB
```

### Decision: distilgpt2 wins

Both models work and both are usable. distilgpt2 is **2.2× faster** than gpt2 at medium input length (30ms vs 66ms p50) and uses **43% less memory** (831MB vs 1463MB RSS). The quality loss from distillation is irrelevant for a reservoir — we don't care about generation quality, only that the activation space is rich enough for linear probes to extract patterns. distilgpt2 is 6 layers × 12 heads × 64 head_dim, still plenty of capacity for the probe targets we'll define in Phase 4.

### Surprise + critical finding: no `hidden_states` in the ONNX graph

Passed `output_hidden_states: true` to `model(inputs, ...)`. The flag was silently ignored because the Xenova ONNX exports don't define `hidden_states` as an output tensor. What we actually get back:

```
keys: logits, present.0.key, present.0.value, present.1.key, present.1.value, ...
```

Those `present.X.key` and `present.X.value` are the **KV cache tensors** from each transformer layer — used by the model for incremental generation. They are NOT the raw hidden states `H`, but they are linear projections of them: `K = W_k · H`, `V = W_v · H`.

Implication for linear probes:
- A linear probe on `hidden_states`: `probe(H) = w^T H + b`
- A linear probe on KV cache: `probe(K,V) = w1^T K + w2^T V + b = (w1^T W_k + w2^T W_v) H + b`
- These are equivalent in expressivity (for linear probes) up to the span of `W_k` and `W_v`, which jointly cover the hidden dim for standard GPT-2 attention.

**Verdict: KV cache is usable as-is.** Skip custom ONNX re-export (would require optimum-cli + more wall time). Pool mean-across-tokens-and-heads, flatten across layers, feed to probes.

Shapes for distilgpt2 medium input (34 tokens):
- raw per layer: `[1, 12 heads, 34 tokens, 64 head_dim]` for each of K and V
- pooled per layer (mean over tokens + heads): `[64]` per K, `[64]` per V → `[128]` per layer
- flattened across 6 layers: `[768]` total feature dim
- One 768-dim vector per forward pass. Probes learn `[768] → scalar` linear maps.

### Token length matters — state-to-text budget

Token count dominates latency roughly linearly on distilgpt2:
- 19 tok → 25ms
- 34 tok → 30ms
- 143 tok → 97ms

**Budget for state-to-text: ≤50 tokens**. Keeps p50 under 35ms. The "medium" sample string is about the right density for that budget.

### Implications for tick-rate coupling

At 30ms per reservoir call, synchronous in-loop reservoir fire costs:
- 1 actant × 60Hz × 30ms = 1800ms/sec → 1.8× slowdown → real-time barely viable
- 5 actants × 60Hz × 30ms = 9000ms/sec → 9× slowdown → not real-time

**Decoupling plan**:
- Reservoir cadence = every 10 ticks (6Hz at 60Hz game tick)
- Per-tick cost: 5 actants × 6Hz × 30ms = 900ms/sec → 0.9× → ≈ real-time
- Probe values cached between reservoir calls; onTick reads latest. Stale cached probes are fine because the game state doesn't change dramatically in ~150ms.

For headless training, even slower cadences work — rounds just take longer. Will tune empirically in Phase 5.

### Next

Phase 3 — reservoir bridge. Interface:
```ts
interface ReservoirBridge {
  embed(text: string): Promise<Float32Array>;  // 768-dim for distilgpt2
}
```
- `OnnxReservoirBridge` implementation using the same @huggingface/transformers flow as bench
- `stateToText(me, world)` — synthesize a ~30-token summary of the actant's situation
- `ReservoirPump` wrapper: per-actant async fire-and-forget with cached latest
- Wire into `buildPerception`: probes read latest, inject hunch values

---

## Session 1 — Phase 1 complete: strip, rewrite, determinism validated (2026-04-05)

### What happened

Stripped hunch down to essentials and rewrote the chassis around a clean push-model `world`/`me` surface. Deleted 9 files from the fork (soma, soma-police, handler-executor, reflection, replay-summarizer, chase-map-renderer, persistence, chassis, police — ~3k lines). Wrote 7 new files (rng, world, actant, mode, cops, evaders) + rewrote 4 (types, game, renderer, main) + reduced map.ts to deterministic RNG.

Final hunch shape:
```
src/
  rng.ts         seeded mulberry32, fork() for per-subsystem RNGs
  types.ts       Position, TileType, GameConfig, Outcome, InputState
  world.ts       World, Me, Action, OnTick — THE integration seam for probes
  actant.ts      Actant, ChassisState — per-actant state the onTick doesn't touch
  mode.ts        EvaderFlavor, ModeConfig, URL param parsing
  cops.ts        copOnTick — single hunch-gated branch (confidence > 0.4)
  evaders.ts     fleeOnTick, wanderOnTick, decoyOnTick, smartOnTick, makeHumanOnTick
  map.ts         TileMap + deterministic random spawns (takes RNG param)
  los.ts         unchanged — pixel-space LOS raycasting
  coords.ts      unchanged — tile-center ↔ pixel conversion
  game.ts        chassis glue: per-actant perception, onTick dispatch, movement, outcome
  renderer.ts    minimal canvas HUD
  main.ts        entry, URL params, human input
```

All pixel math is confined to the physics/render boundary. OnTick surface is pure tile-center coords.

### Smoke test results (test/smoke.ts — run headless via `npx esbuild --bundle --platform=node test/smoke.ts | node`)

**Test 1 — termination**: all 4 flavors run to completion on seed 42.
```
flee     outcome=timeout ticks=5400 closest=8.68t
wander   outcome=captured ticks=233  closest=0.73t
decoy    outcome=escaped  ticks=301  closest=6.05t
smart    outcome=escaped  ticks=301  closest=6.05t
```

**Test 2 — determinism**: same (flavor, seed) → identical final state across two independent runs.
```
flee     match=true
wander   match=true
decoy    match=true
smart    match=true
✓ fully deterministic
```
This is the precondition for Pipeline A (counterfactual replay). Achieved without replay infrastructure yet — just clean seeded RNG threading through map randomization + per-actant chassis RNG forks.

**Test 3 — cross-seed variety**: 4 seeds → 4 unique trajectories for each flavor. No RNG collapse.

**Test 4 — outcome distribution** across seeds {42, 1337, 9001, 7}:
```
flee     escaped=0 captured=0 timeout=4   ← degenerate
wander   escaped=0 captured=4 timeout=0
decoy    escaped=3 captured=1 timeout=0
smart    escaped=2 captured=2 timeout=0
```

### Surprises + things to note

1. **flee is degenerate**: 100% timeout, cops never get close (avg closest approach 8.68 tiles). Pure-flee evader is too good — it never dies but never wins either. Implications:
   - For MC training distribution: flee provides no outcome variance on its own. Training signal from flee alone would be zero.
   - Across the mix of flavors, the other three have variance. The experiment still has plenty of signal. Keep flee in the distribution because it represents "evader survived" as a legitimate outcome class, even if all flee rounds land there.
   - Could tune: raise cop speed, lower evader speed, shrink map, add memory to flee (to stop running into dead ends). Deferring — the current mix is good enough for Phase 4+.

2. **decoy and smart identical on seed 42**: both escape at tick 301 with closest=6.05. This is because `smart` falls through to `decoy` behavior when no cops are visible. On seed 42 the evader never sees a cop, so smart == decoy. They diverge on other seeds (decoy 3/1, smart 2/2) as expected. Good.

3. **Zero type errors on first build**, zero test failures on first run. This is suspicious — I was expecting at least a few bugs in the chassis glue. Most likely explanation: the new architecture is much simpler than hot-pursuit's (no soma, no handler-executor, no compiled code strings), and the onTick interface is small and typed. Complexity was the bug surface.

### Decisions recorded

- **Exposed `Game.outcome`** (was private) so headless test + future replay harness can read it without reflection.
- **LOS perception uses pixel-space raycasting** (unchanged from hot-pursuit) — `canSee()` takes pixel positions internally, chassis converts at the boundary. Clean separation.
- **Per-actant RNG state** is carried on `ChassisState.rngState` and forked from the master RNG at spawn. Each actant's hunch values come from a `new RNG(chassisState.rngState)` each tick, advancing the state. Deterministic and per-actant isolated.
- **Hunch fields in Phase 1** are random values from the seeded RNG — not zero, so the `copOnTick`'s `confidence > 0.4` branch actually fires. This keeps the plumbing exercised until Phase 4 replaces these with real probe outputs.
- **Test infrastructure**: `test/smoke.ts` + one-line runner `npx esbuild --bundle --platform=node test/smoke.ts | node`. No ts-node, no jest — minimal.

### Commit

`hunch(phase1): strip to essentials, push-model world/me, determinism validated`

### Next

Phase 0 reservoir benchmark. `onnxruntime-node` + `@huggingface/transformers` already installed in `bench/`. Candidates to test:
- `Xenova/gpt2` (124M) — default
- `Xenova/distilgpt2` (82M) — 1.5× faster
- Explore quantized variants if available

Measure forward pass latency + activation extraction, decide reservoir-tick cadence.

---

## Session 0 — Fork, plan, environment (2026-04-05)

### Context

Robby proposed an experimental prototype of the frozen reservoir + linear probe subsystem described in `docs/frozen-reservoir-probe-subsystem.md` + `docs/frozen-reservoir-experiment-seed.md`. We talked through:

- Forking an existing game rather than greenfielding (leverage existing chassis, game loop, replay infra)
- Picked hot-pursuit: TypeScript + esbuild, tick loop + round boundaries + replay recorder already wired
- Codename **Hunch** (other candidates: Rime, Lodestone, Cinder, Quartz, Dragnet). Hunch won because it names what the subsystem *is* — an actant getting a feeling it can't articulate.
- Agreed: all-actant mode for the experiment so Pipeline A (counterfactual replay) works. Human mode can come back later via a mode switch.
- Framing is exploration, not delivery. No wrong/right answers, just learning. Journal hard, commit often.
- Key reframe from Robby on Tier 3: I *can* tell if probes are actually learning vs fitting noise — by varying the opponent distribution (scripted variants) and measuring generalization on held-out variants. This is the MC generalization test.

### Environment

```
CPU: Intel i7-4770 @ 3.4GHz, 4c/8t (Haswell, 2013)
RAM: 11GB (7.2GB available)
GPU: none (nvidia-smi: no driver)
Disk: 1.7TB free
Python: 3.12.3 (pip 26.0.1 via ~/.local)
Node: 18.19.1
```

**Implication**: CPU-only forward passes are the bottleneck. GPT-2 small FP32 on this box is probably 50-150ms per pass, TinyLlama is seconds. Strategy: use quantized ONNX via `onnxruntime-node` for in-process reservoir (no IPC overhead), decouple reservoir cadence from tick rate so a slow forward pass doesn't choke the game loop. Python subprocess bridge stays as fallback if ONNX activation extraction is painful.

### Decisions locked in session 0

1. **Fork structure**: `games/hunch/` on branch `feat/hunch` off `main`. Hot Pursuit source copied, build artifacts + node_modules stripped. Inherited docs moved to `docs/_inherited/` for reference.
2. **Strip aggressively**: remove soma, reflection, handler-executor (code-gen), radio, precincts, persistence, promotion from hunch. These are orthogonal to the reservoir question and add noise. Keep map, player, LOS, tick loop, replay recorder.
3. **onTick is plain TypeScript**, not compiled code strings. All four cops share the same fixed onTick; differentiation comes from probes, not authored behavior.
4. **Push model** for probe values via enriched `World` and `Me` passed as parameters. Matches conceptual doc.
5. **Mode switch**: `human | scripted-flee | scripted-wander | scripted-decoy | scripted-smart | actant`. Scripted variants are the MC distribution for generalization testing.
6. **Determinism is prerequisite for Phase 6 (counterfactual replay).** I'll audit and lock it in Phase 1.
7. **State-to-text serialization is a design choice worth thinking about.** Deferred to Phase 3. Candidates: structured natural language, symbolic tight notation, JSON-ish. Pick one and measure token count.

### Plan (high-level, detailed in `plan.md`)

Phase 0: benchmark reservoir candidates (onnxruntime-node + HF ONNX GPT-2/distilgpt2)
Phase 1: strip hunch to essentials, determinism audit
Phase 2: all-actant mode + scripted evader variants
Phase 3: reservoir bridge interface + ONNX implementation
Phase 4: untrained probes, confirm end-to-end plumbing
Phase 5: training buffer + correlational pipeline (Pipeline B)
Phase 6: counterfactual replay + Pipeline A
Phase 7: compare A vs B
Phase 8: MC generalization test — train on subset of scripted variants, evaluate on held-out

### Initial actions this session

- Created branch `feat/hunch`
- Forked `games/hot-pursuit` → `games/hunch`, cleaned build artifacts
- Wrote `docs/plan.md` and this journal entry
- Next: first commit, then start Phase 1 (strip + determinism audit)

### Open questions I'm carrying

- Which reservoir model actually fits on this box? (Phase 0)
- Is the state-to-text choice going to dominate the result? (Phase 3)
- Does the counterfactual replay determinism hold under perturbation? (Phase 6)
- If probes don't generalize across scripted variants, is the reservoir too small, or the probes too simple, or the training signal too sparse? (Phase 8 diagnostic)

### Notes to self

- Journal every phase transition. Numbers, not vibes.
- Commit at every checkpoint. Commit messages: `hunch(phaseN): what + why`.
- If I feel myself thrashing, stop and write the thrashing down — that's the most valuable signal.
- Don't cross the soma boundary. If I want to debug by putting probe awareness in the actant's behavior, stop.

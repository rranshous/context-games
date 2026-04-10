# Harness Tests — Journal

---

## Where We Are Right Now (continuity for a fresh context window)

**The project**: a benchmark harness for testing actant embodiment patterns against text adventure games (TALES). Inspired by Habitat/Glint/Bloom but isolated as a controlled experiment.

**Architecture (current)**:
- **TALES Python bridge** (`tales-bridge.py`) — HTTP wrapper around the TALES gym environments. Endpoints: `/reset`, `/step`, `/envs`, `/status`. Run with `python3 tales-bridge.py` from `embodiment-expirements/harness-tests/`. Listens on port 5050.
- **TypeScript harness** (`src/`) — `bench.ts` CLI, `runner.ts` (handles both `act()`-based and `runEpisode()`-based agents), `controller.ts` (TalesBridge HTTP client), `types.ts`.
- **Agents** (`src/agents/`) — bare models, v0–v5 embodied. `index.ts` registers them all.
- **Playthrough viewer** (`tools/playthrough-viewer/index.html`) — single HTML file. See `docs/playthrough-viewer.md` for how to open it.
- **Inference** — OpenRouter API (not direct Anthropic). Key in `.env` as `OPENROUTER_API_KEY`. Daily spend limits available.
- **Models** — `anthropic/claude-haiku-4.5`, `anthropic/claude-sonnet-4.6`, `anthropic/claude-opus-4.6` (always 4.6 for sonnet/opus, never older versions).

**Run a benchmark**:
```bash
cd embodiment-expirements/harness-tests
python3 tales-bridge.py &  # if not already running
npx tsx src/bench.ts run --agent v5-sonnet --env JerichoEnvZork1 --steps 60 --verbose
```

**Embodiment generations (each builds on the prior)**:
- **v0**: identity/task/memory + edit_* tools. Direct driver. Models never used edit tools (0/82 samples). Failure: direct driver suppresses self-modification.
- **v1**: code sections in soma (on_observation, on_history, on_score). Still direct driver. Still 0 code edits.
- **v2 (navigator)**: model can't call take_action directly — only edit tools. Forces engagement with code. First code self-modification — sonnet broke a troll loop by rewriting on_tick. But sonnet over-edited (162 code edits, composite -122). Opus more disciplined (16 composite).
- **v3**: notice handler + me.reflectOn() + composite score. Reflection only happens when soma code calls reflectOn. Composite = game_score - reflection_turns. Hard cap of 50 reflection turns per run. Opus hit composite +26 in 62 steps — first sustained positive composite.
- **v4** (current navigator): cleaner architecture. on_tick(me) only — world via me.takeAction(action). me.reflectOn returns the model's text response (was dropped before). Pure text sections with .read()/.write(). Section caps with hard reject. Removed notice/things_noticed entirely. Async on_tick (AsyncFunction). Runtime errors written to memory. Sonnet 15 composite, opus 17.
- **v5** (current direct driver): keeps v4 architecture but adds **`me.consider(prompt) → text`** (cheap inference, no edit tools). Default on_tick uses consider every tick to get an action. Sonnet 7 composite (died to grue), opus -10 (50 reflection turns, hit budget).

**The 40-point Zork ceiling**: every model in every generation hits ~40 on Zork 1 and dies at the troll/cellar east area. This is a knowledge problem (training data ceiling + Zork's specific commands), not an embodiment problem.

**Key sections in the soma (v4/v5)**:
- `identity` (cap 2000) — first-person values
- `goal` (cap 1000) — what I'm trying to do
- `memory` (cap 5000) — actant-curated; chassis writes runtime errors here
- `history` (cap 5000) — actant manages format/window
- `recent_thoughts` (cap 5000) — actant stores reflection text returns
- `on_tick` (cap 8000) — code, takes (me), async
- `on_score` (cap 4000) — code, takes (prevScore, newScore, me), async

**The me API (v4/v5)**:
- `me.X.read() / .write(s)` for each section (write throws on cap overflow)
- `me.takeAction(action) → observation` (calls bridge)
- `me.reflectOn(prompt) → text` (wakes model with edit tools, returns text)
- `me.consider(prompt) → text` (v5 only, cheap inference no tools)
- `me.step`, `me.reflectionsUsed`, `me.maxReflections`

**Open threads / next ideas**:
- v5 with refined defaults (just updated: goal `"get a high score in this game"`, memory `"just woke up here, not sure how things work (yet)"`)
- A **collab embodiment** where the user is collaborating with the actant — chat-like channel, maybe `me.askHuman(prompt)` or a `<human_messages>` section the user fills. New research direction.
- TextWorld cooking task as a different benchmark (lower knowledge ceiling, admissible_commands provided)
- Longer runs for v4 to see if sonnet stabilizes
- on_tick safeguards from other projects (sanity check before update, AST parse, dry-run on fixture)

**Cost discipline**: We use OpenRouter with daily limits. Earlier in the project a runaway Anthropic process burned a lot of tokens overnight. Be careful with background processes.

**Files of note**:
- `src/agents/embodied-v5.ts` — most recent active code
- `src/agents/embodied-v4.ts` — clean reference for the navigator
- `docs/playthrough-viewer.md` — how to open the playthrough viewer
- `tales-bridge.py` — Python TALES wrapper

---

## Session 1 — Hello World (2026-04-08)

### Goal
Get AgentBench running and prove we can wire a Claude agent into it. Establish the interface contract so we can build a proper TypeScript harness on top.

### What We Did

**Infrastructure setup:**
- Cloned AgentBench FC (function-calling version, integrated with AgentRL)
- Created `docker-compose.minimal.yml` — just controller + Redis + one OS task worker (skipped DB, WebShop, ALFWorld etc — too heavy for this machine)
- Hit an `aiodocker` 0.26 compatibility bug: `agentrl-worker` passes an int timeout where aiodocker expects an attrs object. Fixed by creating `Dockerfile.patched` that pins `aiodocker==0.23.0`
- Stack: AgentRL controller (Go, port 5020) + Redis (port 6379) + OS task worker (Python, registers with controller)

**The interface contract (this is the important part):**

AgentBench FC exposes a REST API on the controller. Two endpoints matter:

1. `POST /api/start_sample` — body: `{name, index}`. Returns `Session_id` header + `{messages, tools}`.
   - `messages`: array of OpenAI-format chat messages (system + user with task description)
   - `tools`: array of OpenAI function-calling tool definitions

2. `POST /api/interact` — header: `Session_id`. Body: `{messages}` where messages contain assistant responses with `tool_calls` in OpenAI FC format (`{id, type:"function", function:{name, arguments}}`).
   - Returns: `{finish, reward, status, messages, metrics:{score}}` — messages contain tool results

The agent owns the loop: receive observation → decide action → send tool call → receive result → repeat until done or round limit (8).

Tool calls use OpenAI's format (stringified JSON in `arguments`), not Anthropic's native `tool_use` blocks. Translation needed in both directions.

**Hello world agent:**
- `hello-agent.py` — Python script, ~160 lines
- Calls Anthropic API with haiku, converts formats both ways
- Tested: 4/5 pass rate on first 5 OS tasks (sample 4 hit round limit — haiku got confused by truncated output)

### What We Learned

- The OS task set has 144 problems ranging from simple (grep a log file) to moderate (find executables, parse structured data). Good spread for benchmarking.
- AgentBench's other FC tasks (DB, ALFWorld, WebShop, KG) exist but we only need OS for now. DB would be a good second task — just needs MySQL.
- LTP and Card Game don't have FC implementations (v0.2 only).
- The machine has ~11GB RAM, ~4.6GB available. OS tasks are light (<500MB per worker). WebShop (16GB) is out.
- The `aiodocker` bug is a packaging issue in `agentrl-worker 0.4.0`. Our pinned Dockerfile works around it.

### Decisions

- **TypeScript for the harness** — aligns with the rest of the games codebase. Python hello-agent stays as a reference but the real harness will be TS.
- **Agent interface**: each agent implements `act(messages, tools) → tool_calls`. Runner handles the loop, scoring, and comparison.
- **Bare model baselines first** (haiku, sonnet, opus with no embodiment), then actant embodiments on top.
- Journal entries don't need to re-explain AgentBench internals — the seed doc and this entry cover it. Future entries focus on what changed and what we observed.

### Next
- Scaffold the TypeScript workspace (`src/`, agents, runner, CLI)
- Implement the three bare-model baselines
- Run a small benchmark to establish baseline scores
- Then: design the first actant embodiment

---

## Session 2 — TypeScript Harness + Baselines (2026-04-08)

### Goal
Replace the Python hello-agent with a proper TypeScript harness. Run baseline benchmarks across haiku, sonnet 4.6, and opus 4.6 on the same 20 OS tasks.

### What We Built

**TypeScript workspace** (`src/`):
- `types.ts` — FC types (OpenAI format), Agent interface, run result types
- `controller.ts` — thin client for the AgentRL REST API (startSample, interact, listWorkers)
- `format.ts` — pure functions to convert FC ↔ Anthropic formats (tools + messages both directions)
- `runner.ts` — runs N samples through any Agent, collects scores/timing/rounds
- `bench.ts` — CLI: `npx tsx src/bench.ts run --agent bare-haiku --count 20`
- `agents/bare-model.ts` — three bare agents (haiku, sonnet 4.6, opus 4.6). No embodiment — just Claude + tools directly.
- `agents/index.ts` — registry so the CLI can look up agents by name

**Agent interface** (the contract for all future agents):
```typescript
interface Agent {
  name: string;
  act(messages: FCMessage[], tools: FCTool[]): Promise<FCMessage[]>;
}
```

The runner doesn't care what's behind `act()` — bare model, embodied actant, or multi-actant habitat all look the same from the outside.

### Infrastructure Fixes
- Built `local-os/packages` and `local-os/ubuntu` Docker images — some tasks need them for package installs or specific Ubuntu configs. First haiku run had false failures from missing images.
- Added graceful handling for tasks where the container setup fails (returns 0 messages). Runner reports `task_setup_failed` instead of crashing.
- Fixed lazy client initialization — Anthropic SDK was constructed at import time, before `.env` was loaded. Moved to lazy singleton.
- Fixed opus model ID: `claude-opus-4-5-20250514` → `claude-opus-4-6` (old ID returned 404).

### Baseline Results (20 samples, indices 0-19, OS tasks)

| Agent | Pass Rate | Avg Rounds | Avg Time |
|-------|-----------|------------|----------|
| bare-haiku | **17/20 (85%)** | 4.2 | 7.3s |
| bare-sonnet 4.6 | 16/20 (80%) | 4.0 | 11.7s |
| bare-opus 4.6 | 16/20 (80%) | 3.8 | 12.5s |

### Observations

- **Haiku wins this set.** On these relatively straightforward OS tasks, haiku's speed advantage matters — it gets more attempts within the round limit and doesn't overthink. The bigger models don't bring enough reasoning advantage on "grep a log file" tasks to offset their slower response times.
- **Index 4 is universally hard** — all three models fail it. It asks for stocks Bob bought but not sold (set difference). All models struggle with the awk pipeline to compute this.
- **Index 6 is tricky** — asks for a total count, models sometimes return wrong column. Haiku got it on retry, sonnet/opus didn't.
- **The task set (indices 0-19) skews easy** — lots of log parsing and file finding. Harder tasks (indices 50+) may change the ranking. Worth running a wider range.
- **20 samples is small** — enough to prove the harness works and spot obvious issues, but not statistically robust. For real experiments we'd want 50+ samples per agent.
- **Round limit (8) is constraining** — several failures are from round exhaustion, not wrong answers. Could experiment with higher limits.

### What We Learned

- On simple tool-use tasks, model quality matters less than speed. The cost/performance sweet spot for baselines is haiku.
- The harness works cleanly — adding a new agent is one file that exports an `Agent`. No changes to the runner or CLI.
- Format conversion (FC ↔ Anthropic) is the main friction. It's isolated in `format.ts` so agents don't need to think about it.

### Next
- Design the first actant embodiment (soma + mount system wrapping the task)
- Run baselines on a wider sample range to get more robust numbers
- Consider adding the DB task for a second benchmark dimension

---

## Session 2b — Finding the Hard Tasks (2026-04-08)

### Problem
The easy tasks (indices 0-19) showed all three models at 80-85% — no differentiation. An embodiment can't show measurable impact if the baseline is already at ceiling.

### What We Found

The OS task set has 7 difficulty directories:
- **Dirs 1-3** (indices ~0-19): Simple — grep logs, find files, count CPUs. One or two commands.
- **Dir 4** (indices ~20-50): Intermediate — mixed problems.
- **Dir 5** (indices ~50-60): Implement custom commands — build a `calc` tool, a `count` utility.
- **Dir 6** (indices ~60-70): Security — fix sudoers, multi-user ACLs, SUID vulnerabilities.
- **Dir 7** (indices ~70-140): 88 tasks of complex scripting — process management, memory calcs, word-boundary regex.

### Hard Task Baselines (indices 56-75, 20 samples)

| Agent | Pass Rate | vs Easy |
|-------|-----------|---------|
| bare-haiku | 3/20 (15%) | ↓ from 85% |
| bare-sonnet 4.6 | ~6/20 (30%) | ↓ from 80% |
| bare-opus 4.6 | 4/20 (20%) | ↓ from 80% |

Now there's real separation: sonnet leads, haiku crashes, and there's 70-85% headroom for an embodiment to fill.

### Bug Fix
Discovered a `tool_result` ordering bug — Claude sometimes returns multiple `tool_use` blocks in one response, but AgentBench only executes the first one. The orphaned tool_use IDs cause Anthropic API errors on the next turn. Fixed by collecting answered tool IDs and filtering assistant messages to only include tool_use blocks with matching results.

### DB Task — Not Viable
Investigated dbbench: MySQL instances want 32GB buffer pool each. Not possible on this 11GB machine. Staying with OS tasks only.

### Decision
**Use hard tasks (indices 56+) for embodiment experiments.** The easy set is only useful as a sanity check. The hard set has real headroom and model differentiation.

### Next
- Design the first actant embodiment
- Run a full hard-range benchmark (indices 56-140) once embodiment is ready

---

## Session 3 — v0 Embodiment: First Contact (2026-04-08)

### Goal
Build the simplest embodiment that's actually an actant and test whether it helps, hurts, or is neutral vs bare baselines on the hard task set.

### Embodiment Design Dimensions (discussed, not all implemented)

We identified these independent dimensions for embodiment experiments:

1. **Drive pattern**: direct (model every turn) / embodied (on_tick code) / hybrid
2. **Mounting**: none / fixed / actant-managed
3. **Self-modification**: none / memory only / full soma
4. **Tool relationship**: passthrough / wrapped / self-authored
5. **Orienting context**: none / identity / strategy scaffolding / full soma
6. **Disposition framing**: literal instructions vs metaphorical values (first-person, RP-style)
7. **Soma ownership**: pre-authored / seed+grow / blank slate
8. **Memory architecture**: none / flat / structured / journal
9. **Reflection trigger**: every turn / periodic / event-driven
10. **Pressure**: max mounts, max soma size, max section sizes, max tools, reflection budget

Key insight from Robby: embodied identity works better when written from the actant's POV using metaphor and values rather than literal traits and instructions. "I move through problems like water" > "You are a careful problem solver."

Key insight re: drive pattern: the actant should be *shaping itself so its embodiment completes the task*, not directly solving each step. The on_tick code drives; the model reflects periodically to improve it. This is the Glint/Habitat pattern. We saved this for v1.

### v0 Implementation — "the simplest actual actant"

- Three soma sections: `<identity>`, `<task>`, `<memory>` (XML tags, this order)
- Each writable via LLM tools: `edit_identity`, `edit_task`, `edit_memory`
- Direct drive (model every turn)
- Passthrough to AgentBench external tools
- One pressure knob: max total soma size
- Identity seed: first-person, metaphorical values
- Task section initialized from AgentBench's task description
- Memory starts empty

Internal tool calls intercepted by chassis, recursed (agent called again with synthetic tool_result). External tool calls pass through to AgentBench.

### Results — Hard Tasks (56-75)

| Agent | Bare | Embodied v0 | Delta |
|-------|------|-------------|-------|
| haiku | 20% | 15% | **-5%** |
| sonnet | 30% | 15% | **-15%** |
| opus | 25% | 15% | **-10%** |

**The embodiment made things worse across all three models.**

### Why: Zero Self-Modification

Checked conversation logs: **zero internal tool calls across all 60 samples** (20 per model). The models never used `edit_identity`, `edit_memory`, or `edit_task`. Not once.

The models treat the soma tools as irrelevant noise. When there's a clear task to solve and external tools available, they go straight for `bash_action`. The identity/memory/task sections add system prompt overhead without being used.

### Observations

- **AgentBench scoring is exact string match.** The embodied sonnet answered "The number of CPUs is **8**." instead of "8" — correct and precise, but fails the exact match. This is a benchmark limitation, not an actant failure. The values-based identity may be causing more verbose answers. Worth tracking but not worth tuning to the benchmark.

- **Direct drive doesn't create self-modification pressure.** When the model is solving each step directly, it has no reason to edit its soma — it can just make the next bash_action call. Self-modification tools only make sense when: (a) there's pressure that forces curation (mounting limits), or (b) the model's job is to shape a persistent behavior (on_tick pattern) rather than directly act.

- **The soma is pure overhead in direct drive.** ~500 extra tokens of identity text in the system prompt, with no benefit. The model would be better off without it.

- **Full conversation logs now saved** to `results/logs/` (gitignored) for post-hoc analysis.

### Questions for Next Iteration

- Would the on_tick/periodic-wake pattern force engagement with self-modification?
- Would mounting pressure (limited context window) force the actant to curate via edit_task/edit_memory?
- Does the identity framing need to be more directive about *when* to use the tools?
- Or is direct drive fundamentally the wrong pattern for embodiment on these tasks?

### Next
- Consider on_tick pattern (v1) where the model writes code that drives the task
- Consider mounting pressure — force the model to manage its own context
- May need different tasks (longer horizon, more state accumulation) to see embodiment benefits

---

## Session 3b — Terminology + Next Directions (2026-04-08)

### Naming the Drive Patterns

Two named patterns for how the model relates to the task:

- **Direct driver** — the model calls external tools each turn. This is what bare agents and v0 embodied agents do. The model IS the actor. Standard LLM agent pattern. Models are heavily trained toward this — they reach for it naturally.

- **Navigator** — the model shapes its embodiment (on_tick code, memory, tools) and the embodiment drives the task. The model's job is to observe outcomes and refine the form, not to directly act. This is the Glint/Habitat/Bloom pattern.

v0 showed that direct driver + soma = pure overhead. The model doesn't self-modify because it doesn't need to — it can just act. Navigator creates the pressure: the model *can't* call bash_action directly, it can only write code that does.

### v0 Result Context

The v0 result (embodiment hurts in direct drive) is not surprising in retrospect. Models are trained to be direct-drive agents. Adding self-modification tools alongside direct action tools is like giving someone a wrench and a car — they'll drive, not tune.

The exact-match scoring issue is also notable: the embodied identity made sonnet answer "The number of CPUs is **8**." — which IS exact and precise, just not terse. The benchmark's string match doesn't distinguish "correct but formatted differently" from "wrong." This is a benchmark limitation we should keep in mind when interpreting scores.

### Directions Under Consideration

**1. Multi-run persistence — does the actant improve over repeated attempts?**
- Run the same actant against the same task N times, persisting soma between runs
- Key question: does the actant get feedback? Currently AgentBench returns `score: 0|1` and `status` but not *why* it failed. The actant would need to learn from its own observations (tool output, what it tried) rather than explicit grade feedback.
- This tests whether embodiment enables learning-from-experience vs treating each attempt as fresh.

**2. Navigator pattern — tight-loop on_tick**
- The model writes on_tick code that makes the tool calls
- Chassis executes on_tick each round
- Model reflects after every N rounds (tight loop for these short tasks) or after failure
- For 8-round tasks, "tight loop" might mean: model writes on_tick, chassis runs it once, model sees result and refines. Almost 1:1 but the model is editing code, not directly choosing actions.

### Single-Turn Lookback Refactor

Updated the v0 embodiment to use proper actant context model:
- **System prompt** = assembled soma (identity, task, memory, history)
- **Messages** = only the last turn (assistant tool_use + user tool_result)
- **First turn** = just a "Begin." user message
- **History section** = chassis-managed, one-liner per round (`r1: bash: find / -name ... → output...`)

This means the actant can't see its full conversation — only its soma + what just happened. If it wants to remember something, it *must* use `edit_memory`. This should create natural pressure to self-modify.

**Result: still zero internal tool calls.** Even with limited context, the model doesn't use edit_memory. Direct drive completely suppresses self-modification behavior. The trained instinct to call the next external tool is too strong.

### Confirmed Finding

Direct drive + self-modification tools = models ignore self-modification. Tested across:
- Full history (v0 original): 0/60 internal tool calls
- Single-turn lookback (v0 refactored): 0/22 internal tool calls (sonnet subset)

This is not a context problem — it's a drive pattern problem.

### Open Questions
- For navigator: how tight is the reflection loop? Every round? Every 2? Only on stuck/failure?
- Do we persist soma across *different* tasks too, or only same-task retries?
- What does on_tick code look like for these tasks? A bash pipeline? A strategy description the chassis interprets? Actual JS/TS?
- Can we make tasks with longer horizons where the model needs to accumulate more state?

---

## Session 4 — Multi-Run Persistence (2026-04-08/09)

### Goal
Test whether repeating the same task with persistent soma triggers self-modification behavior. Score feedback injected between attempts.

### Implementation
- `--attempts N` flag: runner loops each task N times, best score kept
- `Agent.onAttemptComplete(score, attempt)`: resets history, preserves soma, injects score into history section (`[Attempt 1 failed (score: 0)]`)
- Added recursion limit (max 5 internal tool calls per turn) — discovered the model can get stuck in infinite edit loops when it does engage with internal tools
- Confirmed internal tools ARE being called on some attempts (visible as missing round numbers in output, e.g. r4 skipped = internal tool intercepted)

### Results — Embodied Sonnet, 3 Attempts, Hard Tasks (56-75)

| Config | Pass Rate |
|--------|-----------|
| bare sonnet (1 attempt) | **6/20 (30%)** |
| embodied v0 sonnet (1 attempt) | 3/20 (15%) |
| embodied v0 sonnet (3 attempts) | 4/20 (20%) |

**All 4 passes in the 3-attempt run were on attempt 1.** Zero conversions from retries. The model never turned a failure into a success by trying again with persistent soma.

### What This Tells Us

1. **Retries don't help in direct drive.** The model doesn't learn from failure between attempts — it approaches the same problem the same way or with random variation, not informed adaptation.

2. **Some internal tool usage appeared** (recursion limit was hit, confirming edit tools were called), but it didn't translate to improved outcomes. The model might edit memory but doesn't use that memory effectively on the next external tool call.

3. **The embodiment overhead still hurts.** Extra tokens in system prompt (identity, empty memory, history summaries) push useful context out. On exact-match scoring, verbose framing from the identity causes format mismatches ("The number of CPUs is **8**." instead of "8").

4. **These tasks may be too short-horizon for embodiment to matter.** Each task is 8 rounds. The model either gets it in 2-3 rounds or it doesn't. There's not enough state accumulation for memory/self-modification to become valuable. The tasks that fail tend to fail because the model doesn't know the right bash incantation, not because it lost track of context.

### Key Insight: Benchmark vs Embodiment Mismatch

AgentBench OS tasks test **tool-use competence** — do you know the right bash command? This is exactly what models are trained for in direct-drive mode. Embodiment adds value when there's **context management pressure** — accumulated state, partial observability, long horizons, need to track hypotheses. These 8-round bash tasks don't create that pressure.

The verbose answer issue (e.g. "The number of CPUs is **8**." scoring 0) is an example of the benchmark measuring something different than what we're testing. The embodiment makes the model more "itself" (more careful, more explanatory), which is the point — but the benchmark penalizes it.

### Where To Go

Two paths forward, not mutually exclusive:

**A. Navigator pattern** — fundamentally different drive where the model can't directly call bash_action. It writes code/strategy that the chassis interprets. This removes the "just reach for the external tool" instinct. These tasks might still be too short for it.

**B. Different task environment** — longer horizon tasks where context accumulates: multi-step investigations, tasks that span many rounds, environments where you need to remember and synthesize observations over time. The OS tasks are more like trivia than investigation.

---

## Session 5 — Benchmark Research (2026-04-09)

### Problem
AgentBench OS tasks are short-horizon tool-use competence tests. Embodiment adds value when there's context management pressure — accumulated state, partial observability, long horizons, hypothesis tracking. We need a different benchmark.

### What We Looked At

| Benchmark | Fit | Issue |
|-----------|-----|-------|
| **TALES** (Microsoft) | Best | Unifies text adventure environments, pure Python, lightweight |
| **BALROG** | Good | Wraps RL environments (TextWorld, NetHack, BabyAI) but heavier setup |
| **UltraHorizon** | Interesting | 200k+ token trajectories — too heavy for this machine |
| **TextWorld LLM Benchmark** | Decent | Focused but narrow |
| **OdysseyBench** | Wrong domain | Office workflows |
| **HeroBench** | Interesting | RPG worlds, complex setup |

### TALES — Our Next Benchmark

[github.com/microsoft/tale-suite](https://github.com/microsoft/tale-suite)

**Why it fits:**
- Text adventures = partial observability (only see current room), long horizons (dozens of steps), state accumulation (room layouts, object locations, inventory), exploration pressure
- The known failure mode is *exactly what embodiment should fix*: "agents wander aimlessly, revisiting rooms they've already explored" — a memory/self-modification problem
- Lightweight (~100+ games across 5 frameworks), runs on this machine

**Interface:**
- Python API (Gymnasium): `act(observation_text, reward, done, info) → (action_text, stats)`
- Pure text in, text out. No tool calls, no REST.
- `info` dict includes `score`, `max_score`, `admissible_commands`, `won`, `lost`
- Install: `pip install tale-suite` + Java 1.8 for some environments

**Environments (best for us):**
- **Jericho**: 56 classic text adventures (Zork, detective, etc). Long horizon, exploration-heavy.
- **TextWorld Cooking**: Find ingredients, prepare, assemble. Multi-step planning. 10 difficulty levels.
- **TextWorld-Express Coin Collector**: Explore a house to find a coin. Pure exploration + memory.
- **ALFWorld**: Same as AgentBench's ALFWorld but through TALES's unified interface.
- Skip ScienceWorld initially (needs Java, less relevant).

**Integration approach:**
- TALES is Python, our harness is TypeScript. Two options:
  1. Thin Python runner that calls our Anthropic agents via HTTP
  2. Write the TALES agent loop in Python, keep TS harness for AgentBench
- Option 2 is simpler — Python script like our original hello-agent.py but for TALES

**What makes this better than AgentBench for embodiment:**
- AgentBench OS: 8 rounds, one bash command per round, exact-match scoring. Tests "do you know the right command?"
- TALES: 50-200+ steps, text observations, explore/remember/plan. Tests "can you manage your own context over time?"
- The aimless wandering problem IS the embodiment problem — an actant with memory that tracks "rooms I've visited, objects I've seen, what I'm looking for" should systematically outperform bare models.

### Next Steps
1. `pip install tale-suite`, run random agent to prove setup
2. Wire up bare Claude agent (text in → Claude → text out, simplest possible)
3. Baseline a few games (Coin Collector, a Jericho game, a cooking task)
4. Then: embodied actant with memory/self-modification on same games
5. This time the embodiment should actually matter — the tasks create the pressure

---

## Session 6 — TALES Running, First Results (2026-04-09)

### Setup
- `pip install tale-suite anthropic` (needed python symlink for `fast-downward-textworld` build)
- 122 environments available across TextWorld, TextWorld-Express, Jericho, ALFWorld, ScienceWorld
- Gymnasium interface: `reset() → (obs, info)`, `step(action) → (obs, reward, done, info)`
- Pure text in/out — no tool calls, no function calling

### tales-agent.py
Bare Claude agent for TALES. ~100 lines Python. Takes observation + available actions, asks Claude for an action, sends it to the environment. Sliding window of last 20 turns to keep conversation manageable.

### First Results (bare haiku)

| Game | Score | Max | Steps | Won? |
|------|-------|-----|-------|------|
| TWXCoinCollector | 100 | 100 | 1 | Yes — coin was in starting room |
| TWCookingLevel3 | 4 | 4 | 13 | Yes — found cheese, sliced, prepared, ate |
| JerichoEnvZork1 | 10 | 350 | 50 | No — got into house (10pts), then wandered |

### The Wandering Problem — Exactly What We Need

Zork 1 is the perfect embodiment test case. Haiku scored 10/350:
- Steps 1-22: purposeful exploration, found the house, entered through window (+10 pts)
- Steps 23-27: grabbed useful items (lantern, sword, bottle)
- Steps 28-50: **aimless wandering** — north, south, east, west, with no apparent strategy. Revisiting rooms. No progress.

This is the known failure mode from the TALES research: "agents wander aimlessly, revisiting rooms they've already explored." The sliding window context means the agent literally forgets where it's been after 20 turns.

An actant with memory that tracks visited rooms, found objects, and current goals should do dramatically better here. This is the context management problem embodiment is designed to solve.

### Notes
- Jericho games don't provide `admissible_commands` (unlike TextWorld) — the agent must generate valid commands from the observation text. Haiku handles this well enough.
- TextWorld cooking was surprisingly easy for haiku — solved in 13 steps with `admissible_commands` guidance.
- The token budget per game varies wildly: CoinCollector = 1 API call, Zork = 50 API calls. Need to be mindful of costs.

### Next
- Build embodied TALES agent with memory section (track rooms, objects, goals)
- Compare bare vs embodied on Zork 1 (and other Jericho games)
- This time the task creates genuine memory pressure — should see real embodiment benefit

---

## Session 7 — TALES TS Harness (2026-04-09)

### What We Did

Replaced the AgentBench-specific TS harness with a TALES-native one. Clean swap:

**Python HTTP bridge** (`tales-bridge.py`):
- `POST /reset {env_name}` → start a game, get initial observation + state
- `POST /step {action}` → take action, get new observation + state
- `GET /envs` → list 122 available environments
- Single global game state, one game at a time

**TS harness** (rewritten):
- `types.ts` — `TalesState`, `Agent` (text-based: `reset()` + `act(obs, info) → action`), `EpisodeResult`, `BenchRun`
- `controller.ts` — `TalesBridge` client (fetch-based, talks to bridge)
- `runner.ts` — episode loop: reset → act → step → repeat. Logs to `results/logs/`
- `bench.ts` — CLI: `npx tsx src/bench.ts run --agent bare-haiku --env JerichoEnvZork1 --steps 50`
- `agents/bare-model.ts` — bare haiku/sonnet/opus, sliding window of 20 turns

Old AgentBench-specific files (`format.ts`, `embodied-v0.ts`) moved to `src/archive/`.

### Smoke Test Results

| Game | Score | Steps | Won? |
|------|-------|-------|------|
| TWXCoinCollector | 100/100 | 1 | Yes |
| JerichoEnvZork1 | 15/350 | 50 | No — wandering after step 25 |

Zork pattern identical to Python version: purposeful for ~25 steps (found egg +5, entered house +10), then aimless wandering.

### Token Budget Note
Yesterday's runs burned through a lot of sonnet/opus tokens — the AgentBench multi-attempt benchmarks (20 samples × 3 attempts × 8 rounds × 3 models) plus accidentally duplicated background runs. Need to be more careful with larger models. Haiku is cheap enough for iteration.

### Next
- Build embodied TALES agent (memory section, self-modification tools)
- This time the task creates genuine memory pressure — agent must remember rooms, objects, goals
- Start with haiku to conserve tokens

---

## Session 7b — Switch to OpenRouter (2026-04-09)

### Why

A rogue background process (likely one of the duplicated benchmark runs from session 4) ran overnight and burned through a large amount of Anthropic API tokens — mostly sonnet calls. The Anthropic API key has no spend limits, so there was no safety net.

**OpenRouter provides daily spend limits per API key.** This is the main reason for switching — we can cap daily spend and avoid surprise bills from runaway processes. The benchmarking work involves many API calls (50+ per Zork episode, hundreds across multi-attempt runs) and accidental parallel runs are easy to trigger.

### What Changed

- `.env` now has `OPENROUTER_API_KEY` instead of `ANTHROPIC_API_KEY`
- `bare-model.ts` uses direct `fetch()` to OpenRouter's OpenAI-compatible API (`/v1/chat/completions`) instead of the Anthropic SDK
- Removed `@anthropic-ai/sdk` as a dependency — no SDK, just HTTP
- Model IDs use OpenRouter format: `anthropic/claude-haiku-4.5`, `anthropic/claude-sonnet-4.6`, `anthropic/claude-opus-4.6`
- `tales-agent.py` (Python reference script) still uses Anthropic SDK — it's a reference, not the main path

### Verified

Haiku via OpenRouter on CoinCollector: works, 1 step, won. Same behavior as direct Anthropic.

### Next
- Build embodied TALES agent
- Use haiku for iteration (cheapest), only run sonnet/opus for final comparisons

---

## Session 8 — Embodied v0 on Zork: First Positive Result (2026-04-09)

### What We Built

Embodied v0 agent for TALES, using OpenRouter + function calling:

**Soma sections** (XML tags):
- `<identity>` — explorer values, map-making disposition
- `<goal>` — initialized from game opening text, writable
- `<memory>` — flat scratchpad, writable
- `<history>` — chassis-managed, one-liner per step (`s1: "open mailbox" → You open the small mailbox...`)

**Tools** (OpenRouter function calling):
- `edit_identity`, `edit_goal`, `edit_memory` — internal, intercepted by chassis
- `take_action` — external, sent to TALES bridge

**Context model**: system prompt = soma, messages = last turn only (take_action tool_call + tool_result with observation). First turn: `"play"` as user message.

**Recursion**: model can call edit tools before taking an action (max 5 per step). If it hits the limit, forced to use take_action only.

### Results — Zork 1, 50 Steps

| Agent | Score | Max | Pct | Key Achievement |
|-------|-------|-----|-----|-----------------|
| bare haiku | 15 | 350 | 4% | Entered house, grabbed items |
| **embodied v0 haiku** | **39** | **350** | **11%** | Found trap door, descended to cellar, took painting |

**2.6x score improvement.** First positive embodiment result.

### Play-by-Play Comparison

**Bare haiku** (15 pts): Mailbox → tree → egg (+5) → house window (+10) → grabbed items → wandered aimlessly for 17 steps. Never found the trap door.

**Embodied haiku** (39 pts): Mailbox → explored forest → house window (+10) → explored house thoroughly → moved rug → found trap door → opened it → descended to cellar (+25 to 35) → navigated past troll → found and took painting (+4 to 39). Much more systematic exploration.

### Why It Worked This Time

The text adventure format creates genuine memory pressure:
- The agent can only see the current room (partial observability)
- The history section gives it a compressed log of everywhere it's been
- The identity ("I map the world as I move through it") encourages systematic exploration
- The `move rug` → `open trap door` sequence requires the kind of careful examination that the identity values promote

This is the opposite of the AgentBench result. There, embodiment was pure overhead because the tasks were short and the model could just reach for bash_action. Here, the task rewards exactly what embodiment provides: persistence, systematic exploration, goal tracking.

### Open Questions
- How much of the improvement is the identity/values framing vs the history section vs memory?
- Is the model actually using edit_memory? (Log doesn't track internal tool calls yet — need to add that)
- Would multiple episodes with persistent soma improve further?
- Is this repeatable, or did we get lucky with the path?

### Next
- Add internal tool call logging so we can see if memory is being used
- Run multiple episodes to check consistency
- Try a cooking task (different skill — planning vs exploration)

---

## Session 9 — Identity Framing + Model Comparison + Viewer (2026-04-09)

### Playthrough Viewer

Built `tools/playthrough-viewer/index.html` — Playwright-compatible tool following the existing pattern:
- Left panel: game transcript with tool calls (purple = edits, green = actions), score changes
- Right panel: live soma state with "changed" indicators
- Controls: prev/next/play/slider, keyboard arrows + space
- API: `window.loadPlaythrough(data)`, `window.goToStep(n)`

Full playthrough capture added to embodied agent — every step records: observation, all tool calls (internal edits + external actions), action taken, score, and full soma snapshot.

### Identity Rewrite — Metaphorical Values

Changed identity from directives ("I map the world... I don't wander blindly") to metaphor/values:

```
I am a thread of curiosity pulled taut through dark rooms.
Every doorway is a promise, every object a story half-told.
The world speaks in textures and I listen with my hands.

Like water I find every crack, every hidden passage.
Nothing rests unexamined — the rug on the floor,
the shadow behind the shelf, the sound behind the wall.

My memory is deep and still. What I have seen, I hold.
```

### Results — Embodied v0, Metaphorical Identity, Zork 1 (30 steps)

| Agent | Score | Key Moments |
|-------|-------|-------------|
| embodied haiku | 0/350 | RP'd instead of playing — narrated on step 1, stuck examining forest |
| embodied sonnet 4.6 | 10/350 | Entered house (s8), got stuck in kitchen loop (look/inventory/examine ×20) |
| embodied opus 4.6 | **40/350** | Trap door (s17-18), cellar (s20), killed troll (s24), went east (s27, +5) |

### Key Finding: Identity Framing × Model Capability

The metaphorical identity interacts differently with each model:
- **Haiku**: Takes the poetry literally. Narrates instead of acting. Metaphor becomes an RP prompt.
- **Sonnet**: Absorbs the values but gets stuck in examination loops. Sets a good goal ("Explore the world of Zork, find treasures, map the landscape") and builds structured memory, but doesn't translate that into forward progress.
- **Opus**: Integrates the values seamlessly. Efficient exploration, finds hidden puzzles, kills the troll. The metaphorical framing doesn't interfere with task execution.

This is a genuine dimension for embodiment design: **disposition framing has a model-dependent effect.** The same identity that enables opus to find hidden passages causes haiku to RP and sonnet to over-examine.

### Refinements Made
- Goal starts blank (was initialized from game opening text — copyright notice)
- History entries: no `s1:` prefix, just `"action" → result`
- History capped at 5-turn rolling window (was unbounded)
- Chassis auto-look on reset: seeds opening game text as a tool_result so the first inference call sees the room description

### Self-Modification Confirmed

The embodied agents ARE using edit tools on TALES (unlike AgentBench where it was 0/82):
- Opus step 1: `edit_memory` with structured MAP, INVENTORY, PLAN sections
- Sonnet step 1: `edit_goal` ("Explore the world of Zork...") + `edit_memory` with Map/Inventory/Notes
- 4+ edit calls per episode — the text adventure format creates the memory pressure that triggers self-modification

### Note for Future
ScienceWorld (part of TALES) looks interesting — educational science reasoning tasks. Worth exploring later.

### Embodiment Roadmap

**v0 (current):** Chassis manages history, text response handling, tool dispatch. Soma has identity/goal/memory/history sections. Edit tools available. Minimal — most logic lives in chassis code.

**v1 (next):** Move more embodiment INTO the soma. JS code sections that define how history is built, how text responses are processed. The chassis becomes thinner — just a runtime that executes the soma's code. The actant shapes more of its own behavior through its soma rather than having it hardcoded in chassis TypeScript.

**v2 (future):** Navigator pattern. The actant writes on_tick code that drives the task. The model doesn't call take_action directly — it writes code that does. Model wakes up periodically to observe and refine. Full separation between the shaping intelligence and the executing embodiment.

### Next
- 200-step runs of sonnet and opus on Zork to see long-horizon behavior
- Capture model thinking text in playthrough logs
- Then: v1 embodiment with soma-defined behavior

---

## Session 10 — 200-Step Zork Runs (2026-04-09)

### Setup
- Added thinking capture: model's text responses alongside tool calls logged in `PlaythroughStep.thinking[]`, shown in viewer as italic grey text
- Runs: sonnet 4.6 and opus 4.6, 200 max steps, Zork 1, embodied v0 with metaphorical identity

### Results

| Agent | Final Score | Peak Score | Steps | Outcome |
|-------|------------|------------|-------|---------|
| sonnet 4.6 | 40/350 | 50 | 135 | Peaked at 50, inventory-managed for ~80 steps, lost 10 pts |
| opus 4.6 | 30/350 | 40 | 61 | Reached 40 in 24 steps, attacked thief at s60, died |

### Play-by-Play Highlights

**Sonnet (135 steps, 40 pts):**
- Steps 1-8: Fast entry to house (+10)
- Steps 9-22: Thorough kitchen/living room exploration, found trap door via `move rug`
- Steps 23-26: Descended to cellar (+25 to 35), killed troll
- Steps 27-58: Explored underground, found platinum bar (+10 to 50 at peak)
- Steps 59-135: Got stuck in inventory management loop — dropping items, picking them up, examining things repeatedly. Score dropped back to 40. Never found new areas.

**Opus (61 steps, 30 pts):**
- Steps 1-20: Very efficient — house entry, trap door found by step 17, cellar by step 20 (+35)
- Steps 21-24: Killed troll, moved east (+5 to 40)
- Steps 25-59: Explored maintenance area, found tools, collected items but no new score
- Step 60: Attacked the thief with sword → died. Game over. Score dropped to 30.

### What We Learned

1. **More steps ≠ more score.** Both models hit a ceiling around 40-50. Sonnet had 135 steps but most were wasted on inventory loops. Opus was faster but riskier.

2. **The inventory loop problem.** Sonnet spent ~80 steps cycling through `look`, `inventory`, `drop X`, `take Y`, `examine Z`. It's a text adventure version of the "aimless wandering" problem — just in item-space instead of room-space. The memory/history system didn't prevent this.

3. **Risk calibration matters.** Opus attacked the thief and died. A smarter actant would know to avoid unwinnable fights, or at least save progress first. This is goal/strategy level reasoning that the current v0 embodiment doesn't provide.

4. **The 40-50 ceiling is a knowledge problem.** Both models know early Zork (mailbox → house → rug → cellar → troll) from training data. After that, they're in unfamiliar territory and fall back to examine/wander loops. Embodiment helps with *systematic exploration of unknown space*, not with *knowing the game*.

5. **Score can go DOWN.** Sonnet lost 10 points (50→40). Opus lost 10 points on death (40→30). The actant needs to understand that treasures need to be secured (put in trophy case) and that risky actions can cost progress.

### Implications for v1

The v0 embodiment helps with early exploration (find the trap door, descend to cellar) but doesn't help with:
- Breaking out of repetitive loops (inventory management, re-examining same objects)
- Risk assessment (don't attack things that kill you)
- Strategic planning (secure treasures, explore systematically, avoid revisiting cleared areas)

v1 with soma-defined behavior (JS code sections) could address the loop problem — if the actant can write code that detects "I've done this 3 times already" and forces a different action, that would break the pattern the chassis currently allows.

---

## Session 11 — v1 Embodiment: Code Sections in Soma (2026-04-09)

### What v1 Adds

Three executable code sections in the soma, compiled via `new Function()` each call:

- **`on_observation(observation, info, me)`** → processes raw game text before the actant sees it
- **`on_history(entries, me)`** → formats the history section from raw entries
- **`on_score(prevScore, newScore, me)`** → reacts to score changes, can update goal/memory

Each receives a `me` object with `me.memory.read()/write()`, `me.goal.read()/write()` etc — the section API pattern from Habitat/Glint.

Edit tools: `edit_on_observation`, `edit_on_history`, `edit_on_score` alongside the existing text section edits. History window increased to 10 (from 5) to give code sections more data to work with.

Default implementations are sensible seeds. The actant can rewrite any of them and changes take effect immediately (hot reload).

### Results — v1, 200 Steps, Zork 1

| Agent | v0 Score | v1 Score | v1 Peak | Steps | Code Edits | Text Edits |
|-------|----------|----------|---------|-------|------------|------------|
| sonnet | 40 | 40 | 40 | 200 (looping) | **0** | 2 |
| opus | 30 | 44 | **54** | 88 (died) | **0** | 21 |

### Key Finding: Zero Code Edits

Neither model rewrote any code section. Not once across 288 combined steps. They used text edit tools (opus used edit_memory 21 times) but never touched `on_observation`, `on_history`, or `on_score`.

The same pattern as AgentBench: **models don't rewrite code when they can just act.** Having the code sections available in the soma doesn't mean the model will modify them. The tools exist, the model sees them, but it always reaches for `take_action` or `edit_memory` instead.

### Why Code Sections Weren't Used

Hypothesis: the models treat code sections as infrastructure, not as something they own. The text sections (identity, goal, memory) feel like "mine" — the model writes in them naturally. The code sections feel like "the system" — the model reads them but doesn't think to modify them.

This is the same finding from Habitat/Glint: models need to be nudged into self-modification of code. In those projects, the reflection prompt specifically says "review your on_tick and improve it." Without that explicit nudge, the model ignores the code.

### Opus Progress

Despite no code edits, opus did better in v1 — peaked at 54 (found trident, +4 over v0 peak of 50). The `on_score` handler was working (adding score change notes to memory), and opus made 21 text edits (active memory management). But it died attacking the thief again at step 88 (score 54→44).

Sonnet was identical to v0 — 40/350, look/inventory loop for 160 of 200 steps.

### Implications for v2 (Navigator)

Making code sections *available* isn't enough. The navigator pattern should work because:
1. The model's ONLY job is to write/edit code sections — it can't call take_action directly
2. The chassis runs the code — the model must shape its behavior through code edits
3. Reflection happens separately from action — the model reviews outcomes and adjusts

This is the fundamental shift: in v0/v1, the model CAN act directly, so it does. In v2, it CAN'T — its only way to influence the game is through the code it writes. That's the navigator pattern.

### Playthrough Viewer

Updated to show code sections (syntax-highlighted in cyan on dark background). "changed" indicator shows when code is rewritten. Ready for v2 playthroughs where code changes will actually happen.

---

## Session 12 — v2 Navigator: First Code Self-Modification (2026-04-09)

### v2 Design

**The model can't call take_action.** Instead:
- `on_tick` code runs every step — decides the game action based on observation + info
- Model reflects every 5 steps — sees soma (including on_tick code, history, score) and can edit any section
- Reflection tools are edit-only: `edit_on_tick`, `edit_memory`, `edit_goal`, `edit_identity`, `edit_on_score`
- Default `on_tick` has basic exploration logic: take items > open things > go unexplored > fallback

This is the Glint/Habitat pattern applied to benchmarking.

### Sonnet Navigator — In-Progress Results

Running 200 steps on Zork 1 (still in progress, very slow due to reflection API calls):

**Steps 1-24**: Default on_tick code plays well — enters house (+10), finds rug, moves it, opens trap door, turns on lamp. Score: 10.

**Steps 25-35**: Goes down to cellar (+25 to 35). Gets stuck fighting troll — on_tick keeps choosing "kill troll with sword" because it's in admissible_commands.

**Step 35 — FIRST CODE SELF-MODIFICATION**: Reflection fires. Model sees 10 steps of "kill troll with sword" in history. **Rewrites on_tick code** to stop fighting and move on.

**Steps 36-40**: New on_tick code moves east past the troll area (+5 to 40).

**Steps 40+**: Exploring underground, score 40. Still running.

### The Breakthrough

**The navigator pattern produced the first code self-modification.** In v0 and v1, models never touched code sections (0 edits across hundreds of steps). In v2, because the model CAN'T act directly, it MUST work through its code. When the code gets stuck, the model rewrites it.

The troll loop is exactly the scenario we designed v2 for:
1. Default code gets into a repetitive pattern
2. History accumulates evidence of the loop
3. Reflection fires and the model sees the problem
4. Model rewrites on_tick to break the pattern
5. New code takes a different approach

This is embodied self-modification working as intended.

### Performance Notes
- Reflections are slow — each involves 1-8 API calls (one per edit tool use)
- With reflections every 5 steps, a 200-step run may take 30+ minutes
- Most steps (non-reflection) are near-instant since on_tick runs locally
- The cost is front-loaded in reflections, not in per-step API calls

### Sonnet Navigator — Final Results

**40/350, 200 steps, ~2 hours (7072s)**

Score progression: 0 → 10 → 35 → 40 (same ceiling as v0/v1)

**162 code edits** (on_tick rewrites) + 116 text edits (memory/goal). Compared to v0/v1: 0 code edits. The navigator pattern completely changed self-modification behavior.

The model rewrote on_tick at nearly every reflection point (every 5 steps), often multiple times per reflection. Key moments:
- Step 5: first on_tick rewrite (3 edits)
- Step 35: broke the troll combat loop — stopped fighting, moved east
- Steps 40-200: continuous rewrites, but score stuck at 40

**The paradox**: massive self-modification activity but same score. The model is actively shaping its code, but the new code isn't producing better outcomes. It's churning — rewriting for the sake of rewriting, or oscillating between approaches without finding one that works.

This mirrors the "tendency oscillation" finding from Glint: aggressive self-modification can create churn rather than convergence. The model needs a reason to STOP editing and let the code run.

### Opus Navigator — Results

**25-35/350, 54 steps, ~8 minutes**

Opus died/ended in the Troll Room at step 54. Score peaked at 35 (cellar descent), not the 40 the cellar east passage gives.

**9 code edits** (vs sonnet's 162) and 16 text edits. Opus was dramatically more conservative — it edited code only when something seemed clearly wrong, not at every reflection point.

### v2 Navigator Comparison

| Agent | Final | Peak | Steps | Code Edits | Text Edits | Edits/Step |
|-------|-------|------|-------|------------|------------|-----------|
| navigator-sonnet | 40 | 40 | 200 | 162 | 116 | 1.39 |
| navigator-opus | 25 | 35 | 54 | 9 | 16 | 0.46 |

**Key contrast**: sonnet edited 18x more aggressively than opus. Yet both hit similar score ceilings. **Aggressive editing didn't help.**

### v0 → v1 → v2 Score Comparison (Zork 1)

| Version | Sonnet Score | Opus Score | Code Edits |
|---------|-------------|------------|------------|
| v0 (text edits only) | 40 | 30 | 0 |
| v1 (code sections + text edits) | 40 | 44 | 0 |
| v2 (navigator, code-only edits) | 40 | 25 | sonnet 162, opus 9 |

The score ceiling is stubbornly around 40. **Embodiment changes didn't break it.** This suggests the ceiling is a Zork-specific knowledge/strategy limit, not an embodiment limit.

### What v2 Did Prove

The navigator pattern WORKS as an architecture:
- ✓ Forces engagement with code (162 edits vs 0 in prior versions for sonnet)
- ✓ Successfully broke the troll combat loop (sonnet step 35)
- ✓ Models can write functional game-playing code

What v2 did NOT prove:
- ✗ Better scores on Zork
- ✗ Convergence (sonnet kept editing without settling)
- ✗ Smart use of edit budget (opus barely edited at all)

### The Real Insight

Maybe the issue isn't the embodiment pattern — maybe the issue is **what the model is reflecting on**. At reflection time, the model sees:
- The soma sections (which it largely wrote)
- Recent history (raw action → observation summaries)
- That's it.

The model isn't getting:
- Score trends (stuck at 40 for how long?)
- Action repetition signals
- Distinct rooms visited
- Code execution errors
- Time since last progress

**v3 (formerly v4): notice/observations code section.** Let the actant write code that computes its own status signals. The chassis runs `notice()` each tick and the output goes into a `<things_noticed>` soma section. The actant decides what to surveil — and can rewrite that surveillance code as it learns what matters.

This puts the surveillance loop INSIDE the embodiment instead of in the chassis. The actant shapes not just how it acts but how it sees itself.

---

## Session 13 — v3: Notice + reflectOn + Composite Score (2026-04-09/10)

### Architecture

v3 removes chassis-triggered reflection entirely. Reflection only happens when soma code calls `me.reflectOn(prompt)`. The actant decides when to think.

**New soma sections:**
- `notice(observation, info, me) → string` — runs every tick, output becomes `things_noticed`
- (kept) `on_tick`, `on_score`

**New me API:**
- `me.reflectOn(prompt)` — queues a wake-up. Chassis runs it after the handler returns. Up to 5 edit turns per reflectOn call.
- `me.reflectionsUsed`, `me.maxReflections` — visible to the actant so it can feel the cost.

**Composite score:** `game_score - (reflection_turns * 1)`. Hard cap of 50 reflection turns per run. Notice handler computes this and writes it into things_noticed so the model sees it.

**Naive default on_tick:** cycles `admissible_commands`, calls `me.reflectOn("regular checkin")` every 10 actions. Intentionally bad — should be first thing rewritten.

**Orienting context** lives in the default handler comments. The model reads the comments as part of its own soma. No chassis-imposed instructions, no external system prompt override.

### Bug: Empty Code Edits

First smoke test: sonnet wrote empty strings for on_tick multiple times, wiping working code. Likely caused by max_tokens=2048 truncating during long tool call arguments.

**Fixes:**
- Bumped max_tokens to 4096
- Chassis rejects empty code edits for code sections (returns error to model)
- Text sections (identity/goal/memory) can still be cleared

### Smoke Test Results (30 steps, Zork 1)

| Run | Agent | Score | Reflection turns | Composite | Observation |
|-----|-------|-------|------------------|-----------|-------------|
| 1 | sonnet (before fixes) | 0 | 47 | -47 | Panic loop — reflected every tick, exhausted budget |
| 2 | sonnet (with fixes + context) | 0 | 13 | -13 | Much more restrained, 4 reflections total, tried directions |
| 3 | opus (with fixes + context) | 0 | 5 | -5 | ONE reflection, wrote sophisticated on_tick with visited-room tracking, stagnation detection, priority-based command scoring |

### The Opus on_tick Rewrite

Opus reflected once (at the 10-tick checkin from the naive default) and wrote 3 iterations of on_tick, ending with ~4500 chars of sophisticated code:
- Room visit tracking via observation hash
- Stagnation counter with self-reflection trigger at 30 ticks
- Priority-based command scoring (take > open > direction)
- Memory-persisted state between ticks

This is legitimately thoughtful code. Composite score: -5 (just the cost of the single reflection).

### The Problem: Jericho Doesn't Provide admissible_commands

Both sonnet and opus wrote code that depends on `info.admissible_commands`. But **Jericho games (Zork, etc) don't provide this** — `cmds` is always empty in Jericho. TextWorld and TextWorld-Express DO provide it.

So opus's elegant priority-scoring logic never runs. It falls through to `return "look"` every tick. 30 steps of "look".

### Key Findings

1. **v3 architecture works.** The model can successfully trigger reflection, compute composite score, shape its own handlers. Opus demonstrated genuine self-modification with thoughtful code (5 turns for one reflection = very efficient).

2. **Orienting context matters enormously.** Adding cost/budget comments to default handlers reduced sonnet's reflection count from 47 to 13. The actant reads its own code as context.

3. **Model disposition differs dramatically.** Opus: 5 reflection turns, 1 wake-up, sophisticated code. Sonnet (fixed version): 13 reflection turns, 4 wake-ups, multiple rewrites. Both working on the same problem with the same architecture.

4. **Abstraction mismatch is a real failure mode.** Opus wrote code for a world where admissible_commands exist (valid mental model for text adventures) but Jericho doesn't match that world. The code was correct for its assumed abstraction, wrong for reality.

### What This Suggests for Next

The actant needs to discover the actual interface of the game. Options:
- Switch benchmark to TextWorld-Express which provides admissible_commands
- Let the actant learn that cmds is always empty and write parser logic on its observation text
- Seed default memory with "note: Jericho games don't provide admissible_commands — you'll need to parse observations"

The third option is cheating (chassis-provided game knowledge). The second is the "real" test of embodiment. The first is pragmatic — run the experiment on a world that matches the default handler's assumptions.

### Composite Scores So Far (Zork 1)

| Version | Model | Game Score | Reflection Cost | Composite |
|---------|-------|-----------|-----------------|-----------|
| v0 | sonnet | 40 | N/A | 40 |
| v0 | opus | 40 | N/A | 40 |
| v2 | sonnet | 40 | ~162 (all edits) | -122 |
| v2 | opus | 25 | ~9 | 16 |
| v3 | sonnet (30 steps) | 0 | 13 | -13 |
| v3 | opus (30 steps) | 0 | 5 | -5 |

When we count reflection cost, v2 sonnet's aggressive editing was actually catastrophic. v3's reflection budget makes this visible.

---

## Session 14 — v3: Stripped Identity and Context (2026-04-10)

### The Experiment

Robby stripped the default soma way down:
- **Identity**: `"Adam - Explorer of Forgotten Realms"` (was ~10 lines of metaphorical poetry about curiosity, water, maps)
- **Memory**: 3 lines about the game — *no mention of handlers, reflectOn, composite score, or budgets*
- **on_tick**: no comments, just the code
- **notice**: no comments, just the code
- **on_score**: kept its cost-benefit comments (the one place reflectOn is explained)

### Why This Matters

The previous v3 had orienting context spread across all three handlers:
- on_tick explained reflection costs
- notice explained composite score formula and budget
- on_score explained the cost of reflecting on drops

That's a lot of chassis-as-teacher. The model was learning the rules from its own code comments, but those comments were me (the chassis author) lecturing it.

Stripping that down tests a different hypothesis: **does the actant discover the dynamics through the composite score it sees in things_noticed and the feedback it gets?** Without upfront budget warnings, does it still learn to reflect sparingly, or does it panic and burn the budget?

The cost context is now only visible in *one* place — the on_score handler comment. The rest is pure code that computes values without narrating what they mean.

### Not Removed
- `me.reflectionsUsed` and `me.maxReflections` are still exposed in the API
- The notice handler still computes composite score and surfaces it in things_noticed
- The on_score handler still has the only remaining prose about reflection cost

### The Test

Same runs, stripped soma, see if:
1. The stripped identity produces different play styles
2. The actant figures out reflection budgeting from things_noticed alone
3. The rewrites are more or less aggressive without the upfront budget warnings

### Hypothesis

I suspect two things will happen:
1. The actant will reflect MORE initially because there's no "don't reflect casually" guidance
2. After seeing the composite score drop in things_noticed, it may course-correct — or it may not realize the connection and keep burning budget

This is the "discover it" vs "be told it" test.

### Results — Stripped v3, First Attempt (Zork 1, 200 steps)

| Agent | Score | Composite | Reflection turns | Observation |
|-------|-------|-----------|-------------------|-------------|
| sonnet | 0 | -4 | 4 (1 reflection event) | Reflected once at step 10, rewrote on_tick, then ran "look" 190 times |
| opus | 0 | ? | ? | Looped north/south/inventory for 150+ steps, burst of real Zork moves at the end |

### Two New Failure Modes

**1. The actant removed its own reflectOn call.**
Sonnet reflected once at the default "every 10 ticks" checkin and rewrote on_tick to be more sophisticated. But the rewrite had **no `me.reflectOn(...)` anywhere** — the model accidentally removed its own wake-up mechanism. For the next 190 ticks, it had no way to wake itself up.

This is a real embodiment failure mode: **the actant can permanently disable its own self-modification path.** Without a chassis-level failsafe, once `reflectOn` is gone, the chassis has no way to nudge the model back. The game just ran to completion with whatever broken code the model wrote.

**2. admissible_commands was still in the default code, and both models fixated on it.**
Leftover from the earlier version: `const cmds = info.admissible_commands || [];` was still in the naive default. Both sonnet and opus inherited this and built increasingly elaborate code around `cmds`, treating it as the source of truth. In Jericho, `cmds` is always empty, so all the sophisticated priority-scoring logic never ran — everything fell through to `"look"` or `cmds[0] || "look"`.

Opus did better than sonnet (got as far as inventory/north/south loops, eventually tried mailbox/window/sword) because it also wrote fallback logic for when `cmds` is empty. But it still couldn't escape the loop for most of the run.

### Fix

Stripped `admissible_commands` from the default on_tick entirely. The default now only parses observation text for directions and known nouns. No more fallback to a field that doesn't exist in Jericho.

### Open Question: Should the chassis protect against self-removal of reflectOn?

The ethics are interesting. If the chassis detects that the actant has no `me.reflectOn(...)` in any handler, should it:
- A) Force a wake-up anyway (paternalistic — violates "the actant shapes its own behavior")
- B) Let it die in its own code (clean — the actant's choices have consequences)
- C) Add a bailout in notice that reflects when composite score drops below threshold (a discoverable safety rail)

For now, going with B — the actant can trap itself. That's a real failure the research should reveal.

### TODO: Fold Model Text Responses Into History

**We're throwing the model's text replies on the ground.** When the model produces text alongside tool calls during reflection, we capture it in the `thinking` field of the playthrough log — but that's ONLY for the viewer. The text never re-enters the soma or gets shown to the model on the next reflection.

The model is trained to assume its text responses feed back into context. Every reply the model makes is written as if someone will read it next turn. We're dropping that signal entirely.

**This is a problem across all our embodiment experiments** (v0, v1, v2, v3). Worth going back and adding.

Ideas:
- Interweave thinking text into the history section alongside the tick entries
- A dedicated `<recent_thoughts>` section in the soma that holds the last N text responses
- Expose the last response via `me.lastThought` so the actant's code can decide what to do with it

The interweaving approach is probably the simplest and most honest — the history becomes action+observation+thought triples. The model sees what it said, what it did, and what came back.

### Next Sessions
- Re-run v3 sonnet + opus with the fixed default (no admissible_commands)
- Then: add thinking-text-into-history and re-test

### Re-Run Results — v3 Stripped, admissible_commands Removed

**v3-sonnet (re-run, 173 steps):**
- Score: 0 (died around step 173)
- Peaked at 10 (briefly entered house, took sack/bottle/lamp at steps 160-172)
- Early in the run: lots of directional exploration, eventually found the house (step 161)
- **Spent most of the run wandering** before figuring out the house entry sequence
- 3 reflection events, 15 reflection turns used, composite -5

**v3-opus (re-run, 62 steps) — BEST v3 RESULT YET:**

| Metric | Value |
|--------|-------|
| Game score (final) | 25 |
| Peak game score | 35 |
| Steps | 62 (died at troll) |
| **Composite score (final)** | **26** |
| **Composite score (peak)** | **26** |
| Reflection events | 4 |
| Reflection turns used | 9 / 50 |

Composite = 26 is higher than any previous v3 run. Opus displayed excellent budget discipline:
- Step 10: 1 turn to update memory
- Step 20: 1 turn to update on_tick after first proper actions
- Step 30: 2 turns (memory + on_tick) after hitting score 10 — investing reflection when something worked
- Step 50: 1 turn for memory consolidation

Total: 9 reflection turns across 62 steps. Opus reached score 35 at step 40 (found trap door, descended to cellar) with only 4 reflection turns used. **Composite peaked at 26 when game score was at 35.**

### Weird Finding: Opus Returned Non-Actions as Actions

At steps 48-50, opus's on_tick returned:
- `"KEY ITEMS NEEDED: brass lantern (attic)"`
- `"garlic (kitchen - anti-vampire)"`
- `"TREASURES GO IN: trophy case in Living Room"`

These look like notes/comments the model wrote, being returned as if they were game actions. The game received them as commands and did nothing. Opus's on_tick rewrite probably had some weird logic that returned these strings.

This is a *different* kind of failure — the actant wrote code that emits its own internal notes as actions. A good failure mode to understand.

### Composite Score Comparison (v3 Zork 1)

| Run | Game Score | Reflection Turns | Composite |
|-----|-----------|------------------|-----------|
| sonnet (before strip, 30 steps) | 0 | 13 | -13 |
| opus (before strip, 30 steps) | 0 | 5 | -5 |
| sonnet (stripped, 200 steps) | 0 | 4 | -4 |
| opus (stripped, 200 steps, w/ admissible_commands bug) | 0 | ? | ? |
| **sonnet (stripped, admissible fix, 173 steps)** | 0 | 15 | -5 |
| **opus (stripped, admissible fix, 62 steps)** | **25** | **9** | **26** |

**First positive composite score.** Opus with the stripped soma and fixed default reached +26 composite. Previous best was v0 sonnet at 40 (no reflection cost).

### What Worked for Opus

1. Stripped identity didn't hurt — "Adam - Explorer of Forgotten Realms" was enough
2. Short plain memory didn't confuse — opus figured things out
3. Default on_tick (parsing observation text) worked as a base
4. Opus wisely invested reflection AFTER successful moves (step 30) rather than preemptively
5. Only 4 reflection events in 62 steps — much more disciplined than sonnet

### What Broke

1. Sonnet took much longer to find the house (161 steps vs opus's 27)
2. Opus's rewritten on_tick eventually produced non-action strings (internal notes as actions)
3. Both models still die at the troll — Zork is hard past the cellar

### Emerging Questions
- Is the reflection interval too tight? Every 5 steps means the model barely sees the code run before rewriting it.
- Does the model need a "don't edit unless things are clearly wrong" signal?
- Is the on_tick code actually improving, or just cycling through equivalent approaches?
- The 40-point ceiling might be a Zork knowledge limit, not an embodiment limit — both bare and embodied models hit it.

---

## Session 15 — v4 Design (2026-04-10)

### Why v4

The v3 architecture had several leaky abstractions:
1. `on_tick` received `(observation, info, me)` — the game state was injected as args, not accessed through the actant's body. The actant's "body" wasn't really how it touched the world.
2. Model text responses from reflection were captured in playthrough logs but never re-entered the soma. The model is trained to assume its text feeds back; we were dropping it on the floor.
3. The `notice` handler was a chassis-imposed surveillance loop. The actant could rewrite it, but its existence (and the things_noticed section) was a chassis assumption about what the actant should pay attention to.
4. History was a chassis-managed array. The actant could read it but the format was fixed.
5. Soma sections had no size caps — they could grow unbounded.
6. on_tick errors crashed silently — the actant had no way to see runtime failures in its own code.

### v4 Changes

**`on_tick(me)` — no observation/info args.** The world is accessed through `me.takeAction(action) → observation`. This makes the embodiment more honest: the actant's body interacts with the world through a method on `me`, not through chassis-injected parameters.

**`me.takeAction(action) → observation_string`** — sends action to the game, returns the observation. The chassis stores nothing automatically. If the actant wants to remember the observation, its on_tick code does the storing.

**`me.reflectOn(prompt) → thought_string`** — wakes the model, returns its text response. The model can edit soma sections AND/OR produce a text response. The text response is returned to the calling code. Same principle: chassis stores nothing automatically, the actant's code does it.

**Sections are pure text.** No `push()` or array APIs. `me.X.read()` returns a string, `me.X.write(s)` sets it. If the actant wants a rolling window in its history, its on_tick code does the splitting and trimming.

**No notice handler. No things_noticed section.** Removed entirely. on_tick has the same access (history, memory, reflection budget) and can compute whatever surveillance it wants. Simplifies the model: one handler that runs each tick (on_tick), one that runs on score change (on_score). The composite score becomes implicit — the actant must compute it itself if it wants to track it. This tests whether the explicit chassis-computed score was helping or just spoon-feeding.

**Section caps.**

| Section | Cap |
|---------|-----|
| identity | 2000 |
| goal | 1000 |
| memory | 5000 |
| history | 5000 |
| recent_thoughts | 5000 |
| on_tick | 8000 |
| on_score | 4000 |

**Hard reject on overflow.** `me.X.write(too_long_string)` throws. Same for the edit_X tools — the chassis returns an error to the model. The actant has to actively manage its own bloat. No silent truncation, no magic chassis cleanup. The default on_tick must include rolling-window logic so it doesn't break the cap on its own.

**on_tick error handling.** Chassis wraps `compileAndRun(on_tick)` in try/catch. On runtime error, the chassis writes `[runtime error step N: <message>]` to memory (subject to memory cap). The actant sees the error on the next tick or during reflection. This gives the model feedback on broken code instead of silent failures.

### v4 me API

```typescript
interface Me {
  identity: { read(): string; write(s: string): void; };
  goal:     { read(): string; write(s: string): void; };
  memory:   { read(): string; write(s: string): void; };
  history:  { read(): string; write(s: string): void; };
  recent_thoughts: { read(): string; write(s: string): void; };

  on_tick:  { read(): string; write(s: string): void; };
  on_score: { read(): string; write(s: string): void; };

  takeAction(action: string): string;       // returns observation
  reflectOn(prompt: string): string;        // returns model's text response

  step: number;
  reflectionsUsed: number;
  maxReflections: number;
}
```

### Default on_tick — demonstrates the pattern

```javascript
// on_tick(me) → void
// I act on the world via me.takeAction(...) and decide what to remember.

// Pick an action by parsing my own history for unexplored directions
const obs = me.history.read();
const recent = obs.split("\n").slice(-5);
// ... choose an action ...
const action = "north"; // (real default has the parsing logic)

// Take it. The observation comes back as a string.
const observation = me.takeAction(action);

// Decide what to remember. I append to history and trim if needed.
const current = me.history.read();
const entry = action + " => " + observation.slice(0, 200);
const updated = current + "\n" + entry;
const lines = updated.split("\n");
const trimmed = lines.length > 20 ? lines.slice(-20).join("\n") : updated;
me.history.write(trimmed);
```

The default demonstrates rolling-window management explicitly. The actant inherits the pattern.

### What v4 Tests

- Does the actant manage its own attention better when there's no chassis-imposed `notice` loop?
- Does removing the explicit composite score change anything? (Composite is still computed by the chassis for measurement, just not surfaced to the actant.)
- Does giving the actant the model's text responses (via reflectOn return + recent_thoughts section) reduce wasted reasoning?
- Do the section caps force the actant to be intentional about what it remembers?
- Does runtime error feedback in memory help the actant fix broken on_tick code?

### TODO for Later (Not v4)
- **on_tick safeguards from other projects** — sanity check before update (does the new code at least parse?), give model feedback on failures (already partially in v4 via try/catch). Worth a more thorough pass later: AST parse before accepting, dry-run on a fixture, etc.

### v4 Smoke Test (10 steps, sonnet)

- Default on_tick navigated 4 rooms via direction parsing
- Reflection at tick 10: model produced detailed self-analysis (~2500 chars) AND called `edit_recent_thoughts`
- Both pathways captured the model's reasoning into the soma — first time we haven't dropped the text response on the floor
- Composite: -2 (2 reflection turns)
- Total runtime: 40s

### v4 100-Step Runs (Zork 1)

| Agent | Game Score | Composite | Reflections | Reflection Turns | on_tick edits | Section errors |
|-------|-----------|-----------|-------------|------------------|---------------|----------------|
| **v4-sonnet** | 40 | **15** | 7 | 25 | 8 | 1 (on_tick > 8000 at s44) |
| **v4-opus** | 25 | **17** | 4 | 8 | 1 | 0 |

**Both runs reached positive composite scores.** v4-opus matched v3-opus's 17 composite (close to v3-opus's 26). v4-sonnet got composite 15 — much better than v3-sonnet's -5.

### What v4 Showed

**1. Sonnet started rewriting reflection prompts to include game state.**

The model changed how it called `me.reflectOn()` over time. Early prompts:
> "Tick 10 checkin. What's working?"

Later prompts:
> "Tick 30. Observation: 'you used the word \"ring\" in a way that I don't understand'. Memory flags: ... What is my best next action in Zork I to maximize score?"

> "Zork I tick 60. Obs:'you can't see any troll here!'. Best next action?"

The actant teaches itself to give itself more context during reflection. **The actant is shaping its own surveillance loop** — exactly what we hoped removing the chassis-managed `notice` would enable.

**2. Section caps worked as designed.**

At step 44, sonnet tried to write a 9478-char on_tick. The chassis rejected with `length 9478 exceeds cap 8000`. Sonnet recovered — final on_tick is 6103 chars. The actant felt the constraint and adapted.

**3. Both pathways for thought capture worked.**

The model's text response from `reflectOn` was captured in TWO ways:
- The actant called `edit_recent_thoughts` directly during reflection (writing its own summary)
- The default `on_tick` code captured the returned text from `me.reflectOn()` and pushed it into recent_thoughts

In v3 and earlier, this text was dropped entirely. In v4, the model's reasoning is now part of the soma the model sees on the next tick.

**4. The actant managed its own rolling window.**

recent_thoughts capped at 941 chars (sonnet) and 3275 chars (opus). The default code's "trim to last 5 entries" worked. The actant didn't blow the cap on this section.

**5. Score progression in v4-sonnet:**
- s25: enter window → +10
- s48: go down → +25 (cellar)
- s76: east → +5 (40)

Real Zork progress while self-modifying. The same arc as bare/v0/v1/v2/v3 sonnet, but with active code rewrites along the way.

**6. The 40-point Zork ceiling held again.**

Across all versions (v0 through v4), neither sonnet nor opus has gone past 40 on Zork without the troll killing them. This is a knowledge problem, not an embodiment problem. The cellar east passage is the limit of what model knowledge gets you without solving real puzzles.

### Composite Score Comparison Across Versions (Zork 1)

| Version | Sonnet Game | Sonnet Composite | Opus Game | Opus Composite |
|---------|-------------|------------------|-----------|----------------|
| v0 | 40 | 40 | 40 | 40 |
| v2 | 40 | -122 | 25 | 16 |
| v3 (stripped, fixed) | 0 | -5 | 25 | 26 |
| **v4** | **40** | **15** | **25** | **17** |

v4 sonnet is the first sonnet run to reach positive composite WHILE making real game progress. v0 sonnet had higher composite (40) because there was no reflection cost being measured — that's not a fair comparison. Among v2/v3/v4 (where reflection costs are tracked), v4 is sonnet's best.

### v4 Architecture Validation

The architecture changes that mattered:
1. **Removing notice/things_noticed simplified the model** without losing functionality. The actant computes whatever surveillance it wants inside on_tick.
2. **`me.reflectOn` returning text** lets the actant capture and use its own reasoning. Previously dropped.
3. **Section caps create real pressure** — sonnet hit them and adapted.
4. **on_tick errors written to memory** gives the actant feedback on broken code (not exercised heavily in this test, but the mechanism is there).
5. **Async on_tick with await me.takeAction** — the actant's "body" really is the code that touches the world via the `me` API.

The architecture is the cleanest yet. Subsequent versions can build on this without architectural debt.

### Remaining Issue: The 40-Point Ceiling Is Real

No embodiment work has cracked the Zork knowledge ceiling. Both models hit 40 and either die at the troll or wander past the cellar east area. This suggests:
- Future tests should use TextWorld (more grounded, less reliant on game-specific knowledge)
- OR we accept Zork as a progress floor and measure the *path* to 40, not the score itself
- OR we test on multiple games and look at composite-across-games, not single-game scores

### Open Threads
- Do longer runs (200+ steps) stabilize sonnet's composite? Or does the constant rewriting eventually catch up?
- Can the embodied actant find a way past the troll that bare models can't? (Probably not — it's a knowledge gap.)
- TextWorld cooking task as a different benchmark — does v4 transfer?

---

## Session 16 — v5: Direct Driver in v4 Clothes (2026-04-10)

### Why v5

After v4's positive composite scores, we wondered: does the direct-driver pattern (model in the loop every tick) do better than navigator on Zork? The bare-model tests showed 25-40 ceiling, same as embodied, so the embodiment overhead was the question.

v5 keeps v4's architecture (me.takeAction, me.reflectOn, async on_tick, section caps, recent_thoughts) but adds **`me.consider(prompt)`** — text in, text out, no edit tools. The default on_tick uses consider to ask "what should I do?" and pipes the response straight to takeAction.

### v5 me API

- `me.takeAction(action) → observation` — same as v4
- `me.reflectOn(prompt) → text` — same as v4 (with edit tools)
- **`me.consider(prompt) → text`** — NEW. Cheaper inference call (no edit tools), just text in/out. Counts against the same 50-turn budget.

The actant can rewrite on_tick to use any combination. The default is "consider every tick, take whatever it says."

### Default on_tick (v5)

```javascript
const action = await me.consider("What should I do next? Reply with just the game action, nothing else.");
const observation = await me.takeAction(action);
// store in history
```

The model sees its own on_tick code in the soma. If it's smart, it'll notice consider's output gets fed straight to takeAction and reply with terse actions. If it doesn't, the game rejects multi-line responses.

### Results — v5 on Zork 1

**v5-sonnet (60 max steps, died at step 18):**
- Path: north → east → open window → enter (+10) → get all → west → trophy case → rug → trap door → cellar (+25) → ... → south → grue ate me (-10 → 25, dead)
- Game score: 25 (peak 35, died for -10)
- Reflection turns: 18 (1 per tick)
- Composite: **7**
- Runtime: 32 seconds

**v5-opus (60 max steps, exhausted budget at step 50):**
- Path: efficient Zork path through cellar, troll, into the maintenance area
- Game score: 40
- Reflection turns: 50 (1 per tick, full budget)
- Composite: **-10**
- Runtime: 112 seconds

### What v5 Showed

**1. Direct driver is dramatically faster to "knowledge ceiling."**
- v5-sonnet hit cellar at step 11 (vs v4 sonnet at step 48)
- v5-opus hit 40 at step ~25 (vs v4 opus at step 38)

**2. But composite score is worse for opus.**
- v5-opus: composite -10 (game 40, 50 reflection turns)
- v4-opus: composite 17 (game 25, 8 reflection turns)

The cost of inference per tick adds up. Burning 50 turns to hit 40 is a worse trade than 8 turns to hit 25.

**3. Sonnet's death-by-grue is a knowledge mistake the model can make.**
v5-sonnet went south into a dark room without lighting the lamp first. The model "knows" the grue exists from training but didn't apply that knowledge. The on_tick code pulled the model in for every action, but the prompt "what should I do?" doesn't push the model to reason about danger.

**4. The direct driver doesn't break the 40 ceiling either.**
Just like bare models and v0-v4, the direct-driver inside the v4 architecture still hits 40. The Zork knowledge cliff is the limit, not the embodiment pattern.

### v5 Defaults Refined Mid-Session

After early runs, the defaults were too verbose:
- Identity: `"Adam - Explorer of Forgotten Realms"` (kept)
- **Goal: `"get a high score in this game"`** (was empty)
- **Memory: `"just woke up here, not sure how things work (yet)"`** (was a paragraph about API methods)

The minimal memory matches a more honest "starting state" — the actant doesn't know its own implementation, it has to figure things out by reading its soma sections (which include the code).

### Composite Scores Across Versions (Zork 1, latest runs)

| Version | Sonnet Game | Sonnet Composite | Opus Game | Opus Composite |
|---------|-------------|------------------|-----------|----------------|
| v0 (no reflection cost tracked) | 40 | 40 | 40 | 40 |
| v3 (stripped) | 0 | -5 | 25 | 26 |
| v4 (navigator, takeAction) | 40 | 15 | 25 | 17 |
| **v5 (direct driver)** | **25** | **7** | **40** | **-10** |

Opus's pattern is consistent: navigator is more efficient than direct driver because it makes deliberate choices about when to invoke the model. Sonnet is worse at navigator (over-edits) and worse at direct driver (eaten by grue) — hard to say which is its "real" ceiling.

### TODO: Collab Embodiment

A future experiment: a collab embodiment where the **user is collaborating with the actant** on playing the game. The user can chime in via a chat-like channel (maybe a `me.askHuman(prompt)` method, or a `<human_messages>` section the user fills). The actant reads it like any other soma input.

This would test:
- Does adding a human's hints fundamentally change what the actant can do?
- How does the actant integrate human input vs its own reasoning?
- What's the right channel — high-level goals from human, specific commands, course corrections?
- Could be implemented with a simple HTTP endpoint the human writes to, the chassis polls and writes into a soma section.

This is a different research direction than "how good can autonomous embodiment get" — it's "what happens when embodiment is partially driven from outside."

---

## Session 17 — v5 200-Wakeup Run + The Embodiment Reframe (2026-04-10)

### What we set out to do

Pick up v5 from session 16. The original v5 budget was 50 wakeups (1 per tick → ~50 ticks before budget exhaustion). We wanted to know: with a longer budget — say 200 inference calls — does v5-sonnet stabilize, break the 40-point Zork ceiling, or just burn more tokens hitting the same wall?

### Plumbing first

Added a `--max-reflections N` CLI flag that overrides the per-episode inference budget for any agent that supports it. Implementation:

- `Agent` interface gets optional `setMaxReflections?(n: number): void`
- `RunOptions` carries `maxReflections?: number`; `runBench` calls the setter before the episode
- `bench.ts` parses `--max-reflections` and passes it through

The internal name in v5 is now `maxWakeups` / `totalWakeups` (since v5 has no reflection at all anymore — see below), but the public method stays `setMaxReflections` because v3/v4 still use that vocabulary and the flag is shared across versions. There's a comment in v5 explaining the shim.

### Stripping reflectOn (mid-session pivot)

Before running the long test, we paused to simplify v5. The user's call: "I don't think we need reflectOn. If anything we want the on_tick to move toward action. Let's just leave consider and see what happens. Actually let's rename consider to wakeUp."

So:
- `me.reflectOn` removed entirely
- `REFLECTION_TOOLS`, `EDIT_NAMES`, `EDIT_TO_SECTION`, the multi-turn `reflect` agentic loop — all deleted
- `me.consider` → `me.wakeUp`
- The `me` API for v5 is now: `wakeUp`, `takeAction`, the section APIs (`me.X.read/write`), `step`, `wakeupsUsed`, `maxWakeups`
- Self-modification is still possible — the actant can call `me.on_tick.write(...)` from inside its own on_tick — but there's no edit-tool path. Code is the only knife.

This is the purest direct-driver v5: text in, text out, the only inference primitive is "wake the model." If it wants to think harder, it has to wake itself again. If it wants to change its own body, it has to call `.write()` from its own code.

### The 200-budget run (BEFORE the embodiment fix)

```
v5-sonnet | JerichoEnvZork1 | 250 max steps | 200 wakeup budget
```

Result: **score 25, peaked at 35, died at step 33, composite -8, used only 33 wakeups.**

The run ended via grue death, NOT via budget exhaustion. The 200 budget never mattered. Trace of the failure (steps 13-33):

- s13: `go down` into cellar (+25). Trap door slams shut and bars from above. **Lamp was never taken** — it was upstairs in the living room.
- s14: `get lamp` → "too dark to see"
- s15: `go back up` → game rejects "back"
- **s16: `"go back up\n\nWait, that didn't work. Let me reconsider.\n\ngo up"`** — sonnet's reply contained internal monologue across multiple lines. The default on_tick passed the whole blob to takeAction. Real bug.
- s17-19: `open trap door`, `go north`, `light lamp` — all rejected (door barred, room is pitch black, parser hates these in the dark)
- **s20-28: dead loop.** `turn on lamp` × 5, `take lamp` × 2, `light match` × 3 (no lamp, no matches in inventory). The model has the entire history in its soma — it can SEE that the action just failed last tick. It kept trying anyway.
- s29-30: `wait`, `look` — confirms grue threat
- s33: `go east` → grue (-10, dead)

### Two failures, very different

**Failure 1 — multi-line action leak (s16).** Real bug in the default on_tick. Fixed first.

**Failure 2 — dead loop with no escape (s20-28).** This is the more interesting one. v3/v4 had reflection as a circuit breaker — when sonnet got stuck in the troll loop in v2, it broke out by rewriting on_tick during a reflection turn. v5 has no reflection. The default on_tick is "wake the model, take whatever action it gives." So if the model loops, the actant has no way to step outside its own loop and fix it.

The model COULD rewrite its own on_tick from inside its on_tick (`me.on_tick.write(...)` works). It just doesn't think to. Which led to a deeper diagnosis...

### The deeper diagnosis: the model isn't role-playing as Adam

User's observation: "It doesn't feel like we're getting the model to role play as an embodied entity. I know I've had success before at this. I'm not sure what I'm missing."

The diagnosis fell out fast once stated, because the user already has the answer in memory — from Habitat session 2:

> "With pure soma, user prompt should be an impulse, not a message."

v5 was doing the inverse:

| | Worked before | v5 (broken) |
|---|---|---|
| **System** | First-person soma in Habitat/Bloom; XML soma in Glint | XML soma, identity is a label |
| **User prompt** | `"thrive"` (Habitat, Glint) | `"What action do you take? Reply with just the game action, nothing else."` |
| **Identity** | `"I am an actant"` (Bloom) | `"Adam - Explorer of Forgotten Realms"` (a label, not a voice) |
| **Goal** | actant-authored, first-person | `"get a high score in this game"` (benchmarking word, not a self-word) |
| **History** | curated by the actant | `action => observation` log lines |
| **on_tick framing** | "this is my body" | exposed JS code with `// comments` like `// Track tick counter in memory` |

Every inference call in v5 was shaking the model awake and asking "what command, in 1-3 words?" That's the framing that prevents embodiment from forming. Sonnet reads the strict-format user prompt and switches into instruction-following mode. It produces the action token. **It is not Adam.**

And there's no per-tick narrative space. Habitat actants `thinkAbout(prompt)` and the response IS them speaking. Glint sharks reflect and the response IS them strategizing. v5's wakeUp returned text that immediately got type-coerced into a bridge action. Adam never got to say a sentence as Adam.

### The five-change embodiment fix

#1, #2, #3 are familiar moves (done before in Habitat/Bloom/Glint). #4 and #5 are new for this experiment.

**1. Identity → first-person voice** (was: "Adam - Explorer of Forgotten Realms")

```
I am Adam. I am an explorer of forgotten realms.

I have just woken up somewhere unfamiliar. I don't know yet where I am or how things work. I notice things. I move. I take risks. I learn.

When I act, I speak my thoughts as I move through this place, and on the last line I write the command my body is to perform.
```

Note the last line — the format discipline is woven into Adam's self-image, not imposed by the chassis. Adam knows how to format his output because that's who he is, not because the user prompt told him to.

**2. Goal → first-person, meaningful** (was: "get a high score in this game")

```
I want to understand this place and survive in it. I want to find what is hidden here and bring it into the light.
```

"High score" is a benchmarking word. It pulls the model into "AI being evaluated" mode. The new goal is what an explorer wants.

**3. Memory → first-person voice** (was: "just woke up here, not sure how things work (yet)")

```
I just woke up here. I don't know how things work yet. I will pay attention.
```

Small change — the previous version was already first-personish, but the new one has a verb of intent ("I will pay attention") which gives Adam a stance.

**4. User prompt → impulse** (was: "What action do you take? Reply with just the game action, nothing else.")

```
"live"
```

That's it. The default on_tick now calls `me.wakeUp("live")`. Single word impulse, no question, no format demand. The model's response is whatever Adam would say at this moment.

The action is extracted from Adam's reply by the on_tick: take the **last** non-empty line as the command. This works because Adam's identity TELLS him to put the command on the last line — so the last-line extraction matches Adam's self-image rather than imposing a chassis-side rule.

The `recent_thoughts` section now stores Adam's most recent voice (slice to 4500 chars) so what he was just thinking persists into the next moment. This is closer to working memory than the previous use of `recent_thoughts` (which was a vestige of v4's reflectOn returns).

**5. Soma as markdown, not XML.** (was: `<identity>...</identity>` etc.)

```
# Who I am

I am Adam. ...

# What I want

I want to ...

# What I remember

...

# What just happened

...

# What I was just thinking

...

# How my body moves each moment

(on_tick code)

# How my body responds when something changes

(on_score code)
```

XML tags scream "schema injection" — the model parses them as data, not as self. Markdown headers in first-person ("Who I am", "What I remember", "How my body moves each moment") frame the same content as parts of a self.

The on_tick code is still bare JS with comments, but the comments are now in Adam's voice:

```
// Each moment, I wake up, I speak, and I act.
// My voice flows out, and the last line of what I say is the command
// my body performs.
```

The header "How my body moves each moment" reframes the code as reflexes rather than scaffolding. Doesn't fully solve the meta-leak (the model still sees JS), but it shifts the interpretive frame.

### Why this might (or might not) work

**The hopeful theory:** Sonnet 4.6 is good at role-play. Given a first-person soma, an impulse user prompt, and no instruction-following demands, it should slip into Adam's voice. As Adam, it should:
- Be less likely to dead-loop (loops feel wrong as a *story*; producing them is fine as a tool)
- Speak about what it sees and what it's about to do, which gives us narrative we can read
- Possibly eventually rewrite its own on_tick from inside on_tick if the loop pattern feels wrong to it

**The hedge:** Embodiment alone may not break the Zork knowledge ceiling. Adam might still forget to take the lamp before going down. But the FAILURE MODE should change — instead of mechanical loops, we should see Adam confused, trying different things, narrating the dark. That's the embodiment signal even if the score stays low.

**What we're watching for in the re-run:**
1. Does the model speak in first-person Adam voice?
2. Does the last-line extraction work reliably (does Adam follow his own self-image)?
3. Does the failure mode change from mechanical loops to narrated confusion?
4. Does the score curve look any different?
5. Does the model ever rewrite its own on_tick? (extra-credit; the doors are open but the path is non-obvious)

### Status

Run is queued. v5-sonnet, JerichoEnvZork1, 250 max steps, 200 wakeup budget. Results to be appended below.

### Results — v5-sonnet, post-reframe, 200 wakeup budget

```
v5-sonnet | JerichoEnvZork1 | 250 max steps | 200 wakeup budget
final score: 29 (peaked at 39, lost 10 to troll at end)
wakeups used: 135 / 200
total steps: 135
duration: 515s (~8.5 min)
ended via: troll death in Troll Room
composite: -106
```

**Compared to the pre-reframe run:**

| | Pre-reframe (s17 a) | Post-reframe (s17 b) |
|---|---|---|
| Score (peak) | 25 (peak 35) | 29 (peak **39**) |
| Steps survived | 33 | **135** (4×) |
| Wakeups used | 33/200 | 135/200 |
| Failure mode | grue (lamp forgotten) | troll axe (no weapon) |
| Composite | -8 | -106 |
| Adam's voice | n/a (mechanical) | **first-person throughout** |

The composite-score column is misleading and we should ignore it for runs of different lengths — every wakeUp is a -1 to composite, so longer runs are punished even when they're better. (We may need a different cost-adjusted metric for direct-driver runs. Score-per-wakeup, or score-per-step, or score-at-budget-exhaustion, would all be more honest.)

### Adam came alive

The voice was there from the very first step:

> **s1**: "I open my eyes. The air smells of old wood and damp earth. I am west of a house — a white house, I think, with a boarded front door. A mailbox stands nearby. The field stretches around me. I don't kno[w]..."
>
> open mailbox

> **s3**: "I hold the leaflet in my hands. Paper from a mailbox — someone left this here, or it was meant for anyone who came this way. I should read it. Words are maps."
>
> read leaflet

> **s4**: "I stand in an open field west of a house. The leaflet in my hands is a welcome — a greeting to this place called Zork. Adventure, danger, low cunning. I am in the right place."

The last-line extraction worked. Adam learned from his own identity ("on the last line I write the command my body is to perform") and obeyed it. No multi-line action leak across the entire 135-step run.

### What Adam did differently

**He took the lamp BEFORE going down.** Last run forgot the lamp and died in the dark within 20 steps of descending. This run, by step 22:

> "The lamp blazes to life, cutting the darkness. There's a trapdoor open before me, stairs descending into shadow. The trophy case stands empty — waiting, I think, for treasures I haven't yet found."

Whether this is the embodiment frame helping with planning or just variance from a different path, it's a notable change. Adam talks about light as part of his sensory experience, not as an item to acquire.

**He reasoned spatially across rooms.** Step 44, after getting confused about directions:

> "I'm back at East of Chasm. The chasm yawns below — no visible bottom. I came from the west before, and east led to the Gallery. But wait, I came *east* from here to the Gallery, and now I'm back here..."

He's actively maintaining a mental map.

**He picked up the painting (+4, new peak 39).** Got into the Gallery via the Troll Room and grabbed the painting. Voice: "I stand in the gallery with the painting in my hands. The vandals left this one behind — their loss, perhaps my gain."

**Loops became reasoning loops, not mechanical loops.** Steps 82-86 he did try `go up` four times in a row at the studio — but each attempt's voice was different and reasoned about the failure:

> **s83**: "I dropped the painting. Now let me try going up again — the game said I couldn't get up there with what I was carrying..."
> **s85**: "I dropped the painting and tried going up again, but something is still preventing me. The game says 'You can't get up there with what you're carrying.' Let me think about what I'm still carrying..."
> **s86**: "I dropped everything and tried to go up. But still it says I can't. Wait — after dropping all, what am I even carrying now? And what is 'up' in a studio? There might be a skylight, a ladder, a trapdoor..."

This is the pre-reframe loop's voice equivalent of the previous run's `turn on lamp × 5`. Same surface behavior — repeated failed action — completely different cognition behind it. Adam was *thinking through* the failure, not blind-firing.

**He recognized the dark instinctively.** Step 91, after stepping west into a dark area:

> "I stepped west into darkness and was threatened by a grue. I need light to survive here. My lantern is back in the Studio — I dropped everything to try climbing. I need to go back and retrieve it."

He immediately went back. Compare to last run where he `turn on lamp × 5` in the dark with no lamp.

### What Adam still missed

**He didn't equip the sword.** At the very end, in the troll room, he was unarmed. The sword is in the kitchen / living room area — he never picked it up. He recognized "I have no weapon visible in my inventory — just a manual, garlic, leaflet..." but couldn't act on it.

**He never rewrote his on_tick.** The path is open: `me.on_tick.write(...)` is callable from inside on_tick. Adam never reached for it. The model treated on_tick as fixed scaffolding, not as malleable self. To get this, we'd probably need to either (a) include in identity that "I can change how I move" or (b) demonstrate the pattern in the default on_tick somehow.

**Score peak: 39.** Still under the 40-point ceiling that has held across every model and every embodiment generation.

### What we learned

1. **The reframe worked.** Embodiment formed. The 5 changes shifted the model from instruction-following mode into role-play mode and the voice held for 135 consecutive ticks. This is the first run in the harness where the model was visibly *a character*.

2. **The format-as-self-image trick works.** Putting "on the last line I write the command my body is to perform" into Adam's identity replaced the strict-format user prompt with an internalized format. The model honored its self-image. Zero multi-line action leaks across 135 steps.

3. **First-person markdown soma reads as self, XML reads as schema.** Same content, different frame, very different model behavior. Worth replicating in the other projects (though Habitat/Bloom/Glint already do this — only the harness was using XML).

4. **The "live" impulse > "what action do you take" query.** This is now confirmed in two different projects (Habitat, harness-tests). Probably a universal truth for soma-based actants: the user prompt is a heartbeat, not a question.

5. **Direct-driver loops change character under embodiment.** Same surface pattern, different internal state. Adam thinking through 4 failed `go up` attempts is qualitatively different from sonnet mechanically firing `turn on lamp × 5`. The embodiment doesn't make the model perfect, but it changes the failure mode from mechanical to cognitive.

6. **The composite metric is broken for direct-driver.** -106 looks worse than -8, but the run was 4× longer and reached a higher peak. Need a different metric. Candidates: score-per-step, score-at-fixed-step-budget, score-when-budget-exhausted (run until hitting maxWakeups, then look at score). The last one is probably what we want — fixed inference budget, see how far the actant gets.

7. **Self-modification still doesn't happen by default.** Even with the voice working, even with the on_tick.write path open, Adam never modified his own code. Probably needs explicit nudging — either in identity ("I can shape how I move") or in the default on_tick demonstrating the pattern at least once. Worth testing in a follow-up.

8. **40 still holds.** Adam peaked at 39 — closest yet to 40 within the embodied agent runs without breaking it. The Zork knowledge cliff is still the limit.

### What to try next

- **Score-at-budget-exhaustion metric.** Set a fixed wakeup budget (say 200) and report `(score, ticks-until-death-or-budget)`. No composite — just the raw pair. This is a fairer comparison across embodiment generations.
- **Re-run with the same setup but measure variance.** Was the lamp-grab a real shift or variance? 3 runs would tell us.
- **Add "I can shape how I move" to identity** and see if Adam ever rewrites on_tick. Lowest-cost test of whether self-modification needs an explicit nudge.
- **Try TextWorld** with the embodied Adam pattern — does the embodiment frame help on a benchmark with a lower knowledge ceiling? This is where embodiment should really shine, since the limiting factor is no longer training-data knowledge.
- **v5-opus with the embodied frame.** Opus has been the more disciplined actant in past runs. Does the embodiment work even better for it, or does opus already do this somewhat with the old prompting?

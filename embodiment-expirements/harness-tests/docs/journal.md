# Harness Tests — Journal

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

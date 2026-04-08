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

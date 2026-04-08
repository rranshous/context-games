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

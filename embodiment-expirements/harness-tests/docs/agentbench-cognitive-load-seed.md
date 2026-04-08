# AgentBench Cognitive Load Testing

*Created: April 8, 2026 · Robby Ranshous*

## What This Is

A seed document for pairing with Claude Code on wiring AgentBench into the actant embodiment framework. The goal is to use AgentBench's sandboxed, scored tasks as a **cognitive load test** — measuring where actant performance degrades under mount pressure, and eventually whether a habitat can distribute cognitive load across multiple actants to exceed single-actant capacity.

## The Idea

Actants use a mounting pattern: to interact with something, they mount it into their soma. Structural constraints (max mounts, max size) create resource pressure that forces curation over hoarding. This works well in practice, but we don't have empirical data on:

- Where the performance cliff is for a given model under mount pressure
- How that cliff shifts across models
- Whether habitat-level distribution of mounted context outperforms a single actant with higher limits

AgentBench provides sandboxed tasks with automated scoring. We repurpose it as a controlled degradation test for embodiments rather than a model comparison leaderboard.

## AgentBench Overview

- **Repo:** https://github.com/THUDM/AgentBench
- **Current version:** AgentBench FC (function calling), integrated with AgentRL
- **Setup:** Docker Compose brings up controller, task workers, and Redis
- **Agent interface:** Function-calling style — receives observations, returns actions

### Relevant Tasks (start here)

| Task | What It Tests | Mount Relevance | Memory | Startup |
|------|--------------|-----------------|--------|---------|
| OS interaction | Bash in sandboxed Ubuntu | File contents, command output, working state | <500M | ~5s |
| DB (dbbench) | SQL against MySQL | Schema, query results, prior answers | <500M | ~20s |
| Card game | Digital card game reasoning | Game state, hand, history | <500M | ~5s |
| LTP | Lateral thinking puzzles | Clue accumulation, hypothesis tracking | <500M | ~5s |

Skip WebShop (~16GB RAM) and Mind2Web (~1GB, 5min startup) initially. ALFWorld leaks memory — use cautiously.

### Setup Commands

```bash
# Clone
git clone https://github.com/THUDM/AgentBench.git
cd AgentBench

# Build OS interaction images
docker pull mysql:8
docker build -t local-os/default -f ./data/os_interaction/res/dockerfiles/default data/os_interaction/res/dockerfiles
docker build -t local-os/packages -f ./data/os_interaction/res/dockerfiles/packages data/os_interaction/res/dockerfiles
docker build -t local-os/ubuntu -f ./data/os_interaction/res/dockerfiles/ubuntu data/os_interaction/res/dockerfiles

# Bring up the stack
docker compose -f extra/docker-compose.yml up
```

Lite preset available for low-concurrency runs: `--config configs/start_task_lite.yaml`

## Experiment Design

### Phase 1: Baseline

Run the actant against OS and DB tasks at current mount limits. Record pass/fail scores per task. This is the ceiling for the current embodiment.

### Phase 2: Controlled Degradation

Systematically reduce mount constraints:
- Decrease max simultaneous mounts
- Decrease max mount size
- Both simultaneously

Run the same task set at each configuration. Plot score vs. mount pressure. Find the cliff — the point where the actant starts confabulating rather than admitting it dropped something.

### Phase 3: Habitat Distribution

Same tasks, but route through a multi-actant habitat instead of a single actant. The habitat collectively manages the mounted context. Measure:
- Does the habitat match single-actant baseline?
- Does it exceed single-actant performance under pressure?
- Where does inter-actant coordination overhead exceed the benefit of distributed context?

## Wiring Strategy

The integration point is the **agent interface**. AgentBench expects something that receives observations and returns function-call-style actions. Replace their default OpenAI API agent with a shim that:

1. Receives the observation from the task worker
2. Routes it through the chassis (soma assembly, inference, action extraction)
3. Returns the action in AgentBench's expected format

For Phase 3, the shim routes through the habitat's communication layer instead of a single actant.

The task workers and scoring infrastructure remain untouched — they don't care what's behind the agent interface.

## Key Signals to Watch For

- **Confident action on stale/invented details** — the confabulation failure mode under mount pressure. The actant won't signal uncertainty; it'll just proceed as if its compressed version of dropped content is complete.
- **Density vs. pruning behavior** — under pressure, does the actant compress mounted content (good) or silently drop it (bad)?
- **Coordination overhead in habitat mode** — inter-actant communication tokens that don't contribute to task progress.

## Relationship to Other Work

- **Frozen reservoir + probe subsystem** — the probes could eventually predict mount-pressure thresholds without running full benchmark suites
- **Qacky / game actants** — findings about cognitive load limits directly inform how much game state an actant can manage
- **Dead fish principle** — the mount constraints themselves are dead-fish design; this experiment validates where the constraints should sit

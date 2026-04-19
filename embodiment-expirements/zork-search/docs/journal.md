# Zork Search — Experiment Journal

## Session 1: Systematic Actant Design Search (2026-04-18)

### Goal
Find an actant design that learns to play Zork well. The design should be general (no walkthroughs in memory), but we believe it exists and can be found by systematically searching the design space.

### Prior Art Summary
Drawing from 8 agent versions (v0-v8) in harness-tests, plus successful actants in hot-pursuit (police officers), glint (predator sharks), habitat (game-playing entities), and bloom (self-modifying builder):

**Settled patterns** (won across all prior work):
- Named tools > abstract APIs (v5 vs v6: 0 edits in 2000 ticks vs 4 edits on first wake)
- Single-turn inference (multi-turn breaks embodiment frame)
- Pure soma as system prompt (no instruction preamble)
- Impulse word as user prompt ("thrive" > "what should I do?")
- Sonnet-class model minimum for self-modification
- Mounting pattern prevents spinning in stateless loops (Bloom session 15)

**Score ceiling**: v0-v8 all hit ~35-40 on Zork 1 (max 350). 

### Dimensions Searched

Five configurable dimensions, each with 3-5 levels:

1. **Memory architecture** (`memory`): blob, structured, auto_curated, mounted
2. **History handling** (`history`): rolling, summarized, full, none
3. **Action interface** (`action`): free_text, tool, structured
4. **Reflection pattern** (`reflection`): every_step, periodic, event_driven, actant_controlled
5. **Self-modification scope** (`selfMod`): none, memory_only, memory_tools, full_soma

### Phase 2 Results — Full Ablation (19 configs, 30 steps each, sonnet 4.6)

Skipped Phase 1 (free models don't exercise self-modification tools well). Ran 19 configs directly on sonnet.

**Ranking (sorted by best score):**

| Rank | Score | Memory | History | Action | Reflection | SelfMod | Tokens |
|------|-------|--------|---------|--------|------------|---------|--------|
| 1 | **40** | structured | rolling | tool | event_driven | memory_tools | ~86K |
| 1 | **40** | auto_curated | rolling | tool | event_driven | memory_tools | ~73K |
| 1 | **40** | mounted | rolling | tool | periodic | memory_tools | ~93K |
| 1 | **40** | mounted | rolling | tool | event_driven | memory_only | ~66K |
| 1 | **40** | blob | rolling | free_text | every_step | none | ~23K |
| 6 | **39** | mounted | rolling | tool | actant_controlled | memory_tools | ~80K |
| 7 | **35** | blob | rolling | tool | event_driven | memory_tools | ~61K |
| 7 | **35** | mounted | rolling | tool | event_driven | none | ~62K |
| 7 | **35** | mounted | rolling | tool | event_driven | full_soma | ~84K |
| 7 | **35** | structured | summarized | tool | event_driven | full_soma | ~96K |
| 11 | **20** | mounted | rolling | tool | event_driven | memory_tools | ~76K |
| 12 | **15** | mounted | summarized | tool | event_driven | memory_tools | ~71K |
| 12 | **15** | mounted | full | tool | event_driven | memory_tools | ~78K |
| 12 | **15** | mounted | rolling | tool | every_step | memory_tools | ~76K |
| 15 | **10** | auto_curated | summarized | tool | event_driven | memory_only | ~49K |
| 16 | **5** | mounted | rolling | tool | every_step | full_soma | ~72K |
| 17 | **0** | mounted | none | tool | event_driven | memory_tools | ~48K |
| 17 | **0** | mounted | rolling | free_text | event_driven | memory_tools | ~84K |
| 17 | **0** | mounted | rolling | structured | event_driven | memory_tools | ~80K |

### Phase 3 Results — Extended Evaluation (60 steps, sonnet 4.6)

| Config | Best Score | Avg Score | Tokens | Episodes |
|--------|-----------|-----------|--------|----------|
| mounted/rolling/tool/periodic/memory_tools | **50** | **45** | ~289K | 2 |
| structured/rolling/tool/event_driven/memory_tools | **45** | 45 | ~172K | 1 |
| auto_curated/rolling/tool/event_driven/memory_tools | **45** | 45 | ~131K | 1 |
| blob/rolling/free_text/every_step/none | **10** | 10 | ~33K | 1 |

### Dimension Analysis

**1. History handling — THE critical dimension**
- `rolling` is the ONLY history type that produces top scores
- `summarized` (15-35): compression loses actionable detail
- `full` (15): too much context dilutes attention
- `none` (0): agent is blind without transcript

**2. Action interface — tool-based wins**
- `tool` (take_action): Most reliable, works across all memory types
- `free_text`: Fragile — works for simple configs (blob/none) but breaks when combined with self-modification tools (model gets confused between prose/commands)
- `structured` (go/examine/take): The model sometimes calls multiple action tools per step, only last one executes. Score 0 was unlucky exploration, not a fundamental flaw — but no advantage over `tool`

**3. Memory architecture — all viable, different tradeoffs**
- `structured` (40-45): Pre-defined sections guide the model's organization. Good at 30 steps, maintained at 60 steps
- `auto_curated` (40-45): Chassis-built world model + actant notes. Token-efficient (~131K for 60 steps)
- `mounted` (20-50): High variance. Best score overall (50) when combined with periodic reflection. The mount/unmount freedom lets the agent create custom sections (map, inventory, goals)
- `blob` (35-40): Simple and competitive at 30 steps. Degrades at 60 steps (10) — can't maintain organization over longer runs

**4. Reflection pattern — prompt framing matters**
- `periodic` ("Think about where you are...") → **Best performer** (40-50). Planning orientation helps
- `actant_controlled` (budget-aware) → 39, very close
- `event_driven` ("What do you notice?") → 20-40, high variance
- `every_step` ("thrive") → 5-15, **worst performer**. The minimal impulse that worked for glint/habitat fails for Zork. Text adventures need more directive prompting than action games

**5. Self-modification scope — minimal impact**
- `none` (35): No self-editing, still competitive. Model plays from its system prompt alone
- `memory_only` (40): Equal to memory_tools. Editing memory is the key capability
- `memory_tools` (40-50): Wins when combined with mounting (creates custom sections)
- `full_soma` (5-35): High variance. Code editing introduces instability without clear benefit for this task

### Key Insights

**1. The winner: mounted + rolling + tool + periodic + memory_tools**
Score 50, created 3 self-organized sections (map, inventory_and_items, goals), killed the troll, found the platinum bar, navigated the maze. The agent:
- Mounted a `map` section and maintained ASCII room connection diagrams
- Mounted `inventory_and_items` tracking treasures
- Mounted `goals` with checkmarks for completed objectives
- Used the periodic "think and plan" prompt to reason about next steps

**2. "thrive" doesn't work for text adventures**
The minimal impulse pattern from glint/habitat (pure soma + "thrive") scores 5-15 here. Text adventures require more structured prompting because the action space is open-ended (natural language commands) vs the action games where movement/combat primitives are obvious.

**3. Rolling history is non-negotiable**
Without recent game transcript, the agent can't reason about what just happened. Summarized history loses critical details (e.g., "you can't go that way" responses that reveal room topology). Full transcript wastes context on stale information.

**4. Mounting > structured sections when combined with good prompting**
Structured sections (pre-defined map/puzzle/exploration) scored 40, but mounted sections with periodic prompting scored 50. The key difference: the agent organizes information the way IT finds useful, not the way the designer anticipated.

**5. Self-modification adds modest value**
The gap between `none` (35) and `memory_tools` (40-50) is real but not huge. The main benefit is memory curation (editing what the agent remembers), not tool/code creation.

**6. Auto-curated is token-efficient**
The chassis-built world model (auto_curated) scored equally to structured (45 at 60 steps) while using ~25% fewer tokens. It removes the burden of world-state extraction from the inference budget.

### Cost
Total experiment cost: **~$8.26** ($5.48 input + $2.78 output)
Total tokens: ~1.8M input, ~185K output
Remaining budget: ~$41.74 of $50

### Recommended Design

For a general text-adventure actant:

```
memory:     mounted (agent self-organizes with mount/unmount)
history:    rolling (last 20 lines of transcript)
action:     tool (take_action(command))
reflection: periodic ("Think about where you are and what you should do next. Then act.")
selfMod:    memory_tools (edit memory + identity + create custom tools)
model:      sonnet 4.6
```

This config scored **50 points** on Zork 1 in 60 steps, creating its own map, inventory, and goals sections. The design is general — no Zork-specific knowledge in the soma, no walkthroughs, no pre-built map. The agent discovers and organizes information from scratch.

---

## Session 2: Breaking the 50-Point Barrier (2026-04-18, continued)

### Changes Made

Three improvements to the agent:

1. **Observation in user prompt.** The current game output is now included directly in the user message, not just buried in rolling history. This gives the model immediate access to what it's seeing right now.

2. **Hybrid memory mode.** Combines auto_curated (chassis auto-populates `world_model` with score, step, life number, and current observation) with mounted (agent creates custom sections via mount/unmount). Best of both worlds.

3. **Multi-life learning.** On death:
   - `hard_earned_wisdom` and `custom_tools` persist across lives
   - Mounted sections persist (map, inventory, puzzle notes survive death)
   - History resets (fresh start, old transcript is irrelevant)
   - Identity includes "When I die, I keep my hard-earned wisdom"
   - Goal includes "Each life, push further than the last"

### Results

| Config | Steps | Lives | Best Score | Tokens | Key Observations |
|--------|-------|-------|-----------|--------|------------------|
| hybrid/periodic 150 | 150 | 2 | **50** | ~500K | Died once, rebuilt quickly in L2 |
| mounted/periodic 150 | 150 | 1 | **50** | ~500K | Never died, matched previous record |
| hybrid/periodic 300 | 300 | 1 | **64** | ~1.15M | Found 3 treasures (platinum, coins, painting), created dam_puzzle section |
| hybrid/periodic 500 | 500 | 2 | **60** | ~2.1M | Died to thief in L1, wrote 5899-char strategic guide for L3 |

### Key Findings

**1. Score 64 — new record** (300-step run, single life)
The agent found platinum bar (echo trick), bag of coins, and painting. Created and maintained a detailed map, inventory tracker, and dam puzzle notes. Got lost navigating back to deposit treasures — the underground maze is genuinely hard.

**2. Multi-life learning produces extraordinary strategic documents**
After dying in the 500-step run, the agent wrote a 5899-character "hard_earned_wisdom" that included:
- Priority-ordered action plan for next life
- Detailed route maps (dam access, efficient early game route)
- Complete treasure catalog with locations  
- 15+ failed commands for a passage (with correct conclusion: it's one-way)
- Score breakdown analysis
- Vocabulary notes ("crawl" not recognized)
- Item drop locations from previous life
- Combat tips and lamp conservation advice

This is exactly how a human plays Zork — die, learn, come back with a plan. The agent is doing it spontaneously.

**3. The agent's biggest bottleneck is maze navigation**
In both the 300 and 500-step runs, the agent spent 100+ steps wandering lost in the underground maze. It has a map section but can't reliably navigate using it. The maze sections of Zork are designed to be confusing (same room descriptions, looping paths).

**4. Observation in prompt helps but isn't transformative**
The 150-step configs hit 50 whether or not the observation was in the prompt. The main benefit is efficiency — the agent wastes fewer steps re-examining things it already sees.

**5. The thief is a real threat**
The 500-step agent died to the thief's stiletto in Life 1. It then wrote "garlic keeps thief at bay" in its wisdom and planned to take garlic first thing in Life 3.

### Emergent Behaviors

- **Self-organized sections**: Without any prompting, the agent consistently creates `map`, `inventory`/`inventory_and_items`, and task-specific sections (`dam_puzzle`, `coal_mine_maze`)
- **Strategic planning on death**: The agent doesn't just note what happened — it writes a complete playbook for its next life, including route optimization and priority ordering
- **Vocabulary experimentation**: When stuck at the beach passage, the agent systematically tried 15+ command variations before concluding the passage is one-way
- **Item management**: The agent deliberately drops items at strategic locations and tracks where they are in its mounted sections

### Cost
Session 2 cost: ~$8.52 additional ($16.78 → $25.30 total)
Remaining budget: ~$24.70

---

## Session 3: Anti-Wandering + 800-Step Multi-Life (2026-04-18, continued)

### Changes Made

1. **Anti-wandering detection.** Chassis tracks recent observations and actions. When the agent revisits the same room 3+ times, or spams "look" 3+ times in 5 steps, or goes 30+ steps without a score change, warnings appear in the user prompt:
   - "You have been in similar locations for N steps. Try a completely different direction."
   - "N steps since your last score change. Are you making progress or wandering?"
   - "You've used 'look' N times in the last 5 steps. Move or try something new."

2. **Higher thinking budget option.** Config now supports `thinkingBudget` parameter (default 2048).

3. **Lesson learned: TALES bridge is single-game.** Concurrent runs all share one bridge — parallel runs corrupt each other. Must run sequentially. ~$8 wasted on corrupted parallel runs.

### 800-Step Run — Final Results

Config: hybrid/rolling/tool/periodic/memory_tools, sonnet 4.6, 800 steps/wakeups

**Score progression:**

| Step | Life | Event | Score |
|------|------|-------|-------|
| 7 | L1 | Entered house via window | 10 |
| 29 | L1 | Killed troll, went underground | 40 |
| 43 | L1 | Took platinum bar (echo trick) | 50 |
| 429 | L1 | Took painting, deposited in trophy case | 54 |
| ~460 | L1 | Died (thief? score dropped to 44 before death) | — |
| 513 | L2 | Took platinum bar again | 60 |
| 662 | L2 | Took jeweled egg | 65 |
| 668 | L2 | **Deposited egg in trophy case** | **70** |
| ~700 | L2 | Died (score 60 at death) | — |
| 800 | L3 | Budget ran out (rebuilding, score 35) | — |

**Best score: 70** — new all-time record.

**What the agent accomplished (Life 2, using L1 wisdom):**
- Took garlic first (learned thief lesson from L1)
- Killed troll by step ~25 (efficient early game)
- Used echo trick for platinum bar
- Found and deposited jeweled egg in trophy case (+25 points!)
- Explored dam area, coal mine, beach
- Score 70 = 20% of Zork 1's max (350)

**Multi-life learning confirmed:**
- L1: score 44 at death. Slow early game, wandered in maze, died to thief.
- L2: score 70 (best), 60 at death. Faster start, garlic for thief protection, deposited treasures.
- L3: rebuilding from wisdom, hit 35 before step budget ran out.

### Generality Tests (from sequential chain before budget died)

| Game | Steps | Best Score | Max Score | Notes |
|------|-------|-----------|-----------|-------|
| Zork 1 | 800 | **70** | 350 (20%) | 3 lives, deposited treasures |
| Zork 2 | 150 | **0** | 400 (0%) | Hard game, 150 steps insufficient |
| Enchanter | ~100 | **45** | ? | Run killed mid-way, was scoring well |

Zork 2 scored 0 — the game is significantly harder with different mechanics. Enchanter reached 45 in ~100 steps before the run was killed, suggesting the design generalizes to at least some other Infocom games.

### Final "Run Until Credits Die" (50 real steps)

Budget hit OpenRouter's $50 key limit at step 50 (403 error). Agent got 40 points across 2 lives — confirming anti-wandering helps even in short runs (40 in 50 steps vs 20-40 in 30 steps previously).

**Bug discovered:** OpenRouter returns 403 (not 402) when key limit is exceeded. Fixed BudgetExhaustedError to catch both.

**Log overwrite bug:** Step logs share filename by config ID — the short final run overwrote the 300-step log. Need to add timestamp to log filenames in future.

### Cost
Session 3 total: ~$12 ($8 corrupted parallel + $4 sequential chain)
**Experiment total: ~$50 of $50 (budget exhausted)**

---

## Final Summary — Experiment Complete

### Best Design Found

```
memory:     hybrid (auto-curated world model + mounted custom sections)
history:    rolling (last 20 lines of transcript)
action:     tool (take_action(command))
reflection: periodic ("Think about where you are and what you should do next. Then act.")
selfMod:    memory_tools (edit memory + identity + create custom tools)
model:      sonnet 4.6
```

Plus chassis features:
- **Observation in user prompt** — current game output front and center
- **Anti-wandering detection** — warnings for repeated rooms, look spam, score stagnation
- **Multi-life wisdom transfer** — hard_earned_wisdom + mounted sections persist across deaths
- **Budget exhaustion handling** — clean shutdown on 402/403

### Score Progression Across All Experiments

| Session | Config | Steps | Best Score | Key Breakthrough |
|---------|--------|-------|-----------|------------------|
| 1 | mounted/rolling/tool/periodic | 60 | 50 | First self-organized sections |
| 2 | hybrid/rolling/tool/periodic | 300 | 64 | 3 treasures, dam puzzle |
| 2 | hybrid/rolling/tool/periodic | 500 | 60 | 5899-char strategic playbook |
| 3 | hybrid/rolling/tool/periodic | 800 | **70** | Multi-life learning, treasure deposit |

### What the Agent Consistently Does Without Prompting

1. **Mounts organized sections:** Always creates `map`, `inventory`/`inventory_and_items`, and task-specific sections (`dam_puzzle`, `coal_mine_maze`, `goals`)
2. **Maintains ASCII maps** with room connections and exit directions
3. **Tracks treasures** — knows which ones it's found, where they are, and which are deposited
4. **Writes strategic playbooks on death** — priority-ordered plans, route optimizations, vocabulary notes, failure analysis
5. **Learns from mistakes** — "don't press BLUE button", "take garlic first", "say echo in loud room"
6. **Experiments systematically** — when stuck, tries 15+ command variations before concluding something is impossible

### What Limits the Score

1. **Maze navigation** — the underground maze eats 100+ steps of wandering. The agent builds maps but struggles to backtrack using them.
2. **Inventory management** — Zork limits what you can carry. The agent drops items but sometimes can't find them again.
3. **The thief** — steals treasures and kills unprepared players. Garlic helps but doesn't solve the thief permanently.
4. **Step budget** — 800 steps across 3 lives isn't enough to fully explore Zork 1. The game expects dozens of play sessions.

### What's Settled (Design Principles for Text Adventure Actants)

1. **Rolling history is non-negotiable.** Only format that produces top scores.
2. **take_action tool > free_text.** Free text breaks when combined with self-mod tools.
3. **Planning prompts > impulse words** for open-ended action spaces. "thrive" works for action games, not text adventures.
4. **Mounting > pre-structured sections.** Agent organizes information the way IT finds useful.
5. **Hybrid memory** (auto world model + mounted) is the best combination.
6. **Multi-life learning compounds.** L2 consistently outperforms L1.
7. **Anti-wandering nudges help** but don't solve maze navigation fundamentally.
8. **Named edit tools drive self-modification.** Abstract APIs get ignored.

### Next Steps (for future sessions with fresh budget)

1. **Long-horizon plateau testing.** Run the winning config for 2000-5000 steps to find its score ceiling. Run the runner-up configs (structured, auto_curated, mounted/periodic) at the same horizon to see where each plateaus.
2. **Generality sweep.** Test on 5-10 different Jericho games (Zork 2, Zork 3, Enchanter, Planetfall, Hitchhiker's Guide, etc.) at 300+ steps each.
3. **Log filename fix.** Add timestamp to step log filenames to prevent overwrites.
4. **Bridge concurrency.** Either run multiple bridge instances on different ports, or add a lock/queue to prevent concurrent access.

---

## Session 4: Long-Horizon Plateau Testing (2026-04-19)

New $100 OpenRouter key. Focus: understand plateau behavior for Zork 1 across top configs.

### Run 1: Hybrid 2000-Step Plateau Test

Config: **hybrid/rolling/tool/periodic/memory_tools**, sonnet 4.6, 2000 steps/wakeups

**Final result: best score 70, 8 lives, ~9M tokens (~$48)**

**Death progression:**

| Life | Score at death | Notes |
|------|---------------|-------|
| L1 | 40 | Typical early death |
| L2 | 34 | Regressed |
| L3 | 44 | Slight improvement |
| L4 | 40 | Plateau oscillation |
| L5 | **60** | Big improvement — deposited treasures |
| L6 | 45 | Regressed |
| L7 | 35 | Regressed further |
| L8 | 50 (alive at step 2000) | Budget exhausted |

**Score milestones hit (across all 2000 steps):** 10, 35, 39, 40, 44, 45, 49, 50, 54, 55, 60, **70**

**Mounted sections at end:** `map`, `inventory_and_items`, `maze_mapping` (new — agent added a dedicated maze-tracking section)
**Hard-earned wisdom:** 4180 chars

### Key Finding: 70 Is The Plateau

The hybrid design plateaus at **70 points on Zork 1**. Evidence:
- 800-step run (3 lives): best 70
- 2000-step run (8 lives): best 70
- No life exceeded 70 despite accumulating wisdom across all 8

**Per-life scoring was surprisingly regressive after L5.** L5 hit 60 (second-best ever), then L6-L8 dropped back to 35-50. The agent's wisdom document wasn't translating into consistent improvement — suggests the ceiling isn't about knowledge, it's about execution ability.

**Per-step token cost grew 3x** as soma accumulated (1700 tok/step → 4500 tok/step). The growing soma starts hurting efficiency — more context to process, more time deliberating over moves the agent has already reasoned about.

### Why 70? (Hypotheses)

1. **The maze and deep dungeon** contain most remaining points. The agent's maps don't capture the maze's randomized connections (it IS a maze — rooms look similar, exits don't always work both ways).
2. **Inventory limits** force item juggling. Past ~4 treasures, the agent keeps dropping things and losing track.
3. **Execution vs knowledge gap.** The agent writes "go down, N, kill troll, then get egg" but in-game still spends 20-30 steps per phase due to misinterpreting descriptions.
4. **The thief** takes treasures and the agent doesn't recover them.

### Plateau Comparison Runs — Complete

Ran all three runner-up configs at the same horizon. Final results:

| Config | Steps Run | Lives | Best Score | Tokens |
|--------|-----------|-------|-----------|--------|
| **hybrid/periodic** (2000) | 2000 | 8 | **70** | ~9M |
| **structured/event_driven** (1500) | 1500 | 4 | **70** | ~6.8M |
| **mounted/periodic** (1500 budget) | 1050 | 4 | **60** | ~4.8M |
| **auto_curated/event_driven** (1500) | 1500 | 6 | **55** | ~? |

Run C (mounted/periodic) hit budget limit at step 1051 before completing. Was still improving (60 reached in L3).

### Plateau Findings

**70 is the score ceiling for this actant class on Zork 1.** Two independent configs (hybrid and structured) both converged to exactly 70 across multiple lives and thousands of steps. Neither exceeded it despite accumulating wisdom.

**Memory architecture matters most.** The ranking:
1. **hybrid (70)** — chassis world_model + actant-mounted sections  
2. **structured (70)** — pre-defined map_knowledge/puzzle_tracker/exploration_log
3. **mounted (60+)** — actant self-organizes everything (was still climbing when budget ran out)
4. **auto_curated (55)** — only chassis world_model, no agent-organized sections

**Insight:** The agent needs BOTH chassis-provided current state (world_model / structured sections) AND a place to organize its own thinking (mounted sections in hybrid; structured sections in structured mode). Auto_curated provides only the first; mounted provides only the second. The combination (or pre-structured equivalent) is what wins.

**Reflection prompt (periodic vs event_driven) seems less critical** than memory architecture. Both event_driven (structured) and periodic (hybrid) reached 70. Pattern in Run C suggests periodic is robust — mounted/periodic was still improving when budget ran out, might have hit 70 with more steps.

**Score milestones reached across all configs:**
- **hybrid 2000:** 10, 35, 39, 40, 44, 45, 49, 50, 54, 55, 60, **70**
- **structured 1500:** 10, 15, 20, 35, 40, 45, 50, 54, 59, 60, 64, 69, **70**
- **mounted 1050:** 10, 34, 35, 40, 44, 50, 54, **60**
- **auto_curated 1500:** 10, 35, 40, 44, 45, 50, 54, **55**

The structured config has the richest milestone distribution (hitting 15, 20 early, plus 59, 64, 69) — suggests more granular scoring progression. Hybrid skips through intermediate scores faster.

### Why Can't They Break 70?

Possible reasons (not definitively tested):
1. **The remaining points** (80 to reach 150, plus endgame to 350) are in the coal mine maze and deep dungeon — procedurally generated/randomized connections that defeat the agent's map-building
2. **Inventory management** — past ~4 items, agent keeps dropping things
3. **The thief** — takes treasures even with garlic (garlic prevents encounter, not theft of dropped items)
4. **Multi-step puzzles** — things like the coal→diamond→trophy case require long coherent plans
5. **Step budget per life** — even with 2000 steps, individual lives are too short to complete complex sequences

### Budget
Session 4 final spend: ~$98 of $100 key
- Hybrid 2000: ~$48
- Structured 1500: ~$36
- Auto_curated 1500: ~$?  
- Mounted 1050: ~$14

### OpenRouter Quirks Discovered

- **$0 balance blocks ANY request** regardless of max_tokens (402 "can only afford X tokens" is confusingly worded — it's really "your account is out of money")
- Fixed by adding credits to the account, not the key
- The 402/403 handler correctly stops runs cleanly

### Other Observations

- **VSCode crash killed a run at step 400** (score 64). Considered checkpointing but declined — the multi-life pattern effectively recovers from death already.
- **TALES bridge dies with parent process.** Must be restarted manually if parent crashes.
- **Token cost grew 3x over long runs** as soma accumulated — 1700 tok/step early, 4500 tok/step at 2000 steps. Soma size becomes the bottleneck at very long horizons.

---

## Final Conclusion

**Best actant design for Zork 1:**
```
memory:     hybrid (auto world_model + mounted sections) OR structured
history:    rolling (last 20 lines)
action:     tool (take_action)
reflection: periodic ("Think about where you are...") OR event_driven
selfMod:    memory_tools
model:      sonnet 4.6
```

**Plus chassis features:**
- Observation in user prompt
- Anti-wandering detection
- Multi-life wisdom transfer (hard_earned_wisdom + mounted sections persist)
- Budget exhaustion handling

**Score ceiling on Zork 1: 70 points (20% of max 350)** — confirmed across two independent memory architectures.

The agent genuinely plays the game: builds maps from scratch, discovers puzzle mechanics (echo trick, garlic for thief, don't press BLUE button), writes strategic playbooks on death, deposits treasures in the trophy case. But it hits a hard ceiling at 70 that more steps, more lives, and more accumulated wisdom don't break. The remaining 280 points require capabilities the current design lacks: robust maze navigation, long multi-step plans, and recovery from the thief's theft.

# Bloom — Development Journal

## Session 1: Scaffold + Architecture Rework (2026-03-07)

### What happened

Started from the design doc (`docs/qacky-repo-bloom-design.md`). Built initial scaffold, then immediately reworked the architecture based on design conversation.

### Commits

1. `5174d6d` — Initial scaffold: frame + chassis + soma (tick-based)
2. `b14a8b6` — Rework: signal-driven architecture with memory manager

### Architecture evolution

**V1 (discarded within session):** Habitat-style periodic tick-then-infer loop. `loop.ts` had a `tick()` function that assembled soma, picked a stage-based impulse, ran an agentic loop. Problem: bloom was blind between ticks, no reactivity to chat messages.

**V2 (current):** Signal-driven dispatch. The chassis polls for signals (new chat messages, timer tick), dispatches each through bloom's signal handler, runs an agentic loop per signal.

```
poll signals (chat, timer) every 5s
  → memory manager builds things_noticed
  → compile signal_handler.js, call with signal → impulse
  → agentic loop (multi-turn tool use) with that impulse
  → record actions to rolling history
```

### Key design decisions

**Signal handler as bloom-authored code.** The signal handler is a single JS function in the soma (`signal_handler.js`). The chassis compiles it via `new Function('return ' + code)()` each dispatch. Bloom writes/rewrites it to control how it reacts to signals. Default: chat → `'Robby said: "..."'`, tick → stage impulse.

**Memory vs things_noticed.** `memory` is bloom-authored persistent state. `things_noticed` is chassis-managed world context rebuilt every signal (recent chat, artifact inventory, current stage, what signal triggered the call). Clean separation: bloom never has to worry about the chassis overwriting its notes.

**Identity + responsibilities split.** Identity is stable self-concept. Responsibilities shift with context ("currently: establish self" → "currently: build chat API"). More frequent updates without touching identity.

**History as recent moves.** No message chain between inference calls — each call is stateless. History is the continuity mechanism: rolling window of timestamped tool calls, capped at ~5000 chars. Chassis appends after each dispatch.

**Custom tools in soma.** `custom_tools.json` holds `[{ name, description, input_schema, function_body }]` — Anthropic tool schema + JS function body. Chassis compiles and merges with built-in tools at inference time. Bloom can extend its own tool surface without modifying chassis TypeScript.

**No message history between calls.** Each inference call starts fresh with only the soma as context. This is different from Habitat where `thinkAbout()` runs a multi-turn conversation. Here, the soma IS the entire context. The agentic loop still runs multiple turns within a single signal response (for tool use), but between signals there's no carry-over.

### Soma sections (7)

| Section | File | Owner | Purpose |
|---|---|---|---|
| identity | `identity.md` | bloom | who I am, stage, arc |
| responsibilities | `responsibilities.md` | bloom | current focus |
| memory | `memory.md` | bloom | persistent notes |
| things_noticed | `things_noticed.md` | chassis | world context per signal |
| signal_handler | `signal_handler.js` | bloom | signal → impulse routing |
| history | `history.md` | chassis | rolling recent actions |
| custom_tools | `custom_tools.json` | bloom | tool extensions |

### Frame

Express server at `frame/`. Pure state machines, no AI knowledge.

- **ChatServer** (`src/chat.ts`): rolling 200 messages, `read()`, `readAfter(id)`, `post()`
- **ArtifactServer** (`src/artifacts.ts`): content store, `deliver()`, `list()`, `get(id)`
- **REST API** (`src/server.ts`): `/api/chat` (GET with `?count=` or `?after=`), POST), `/api/artifacts` (GET, POST, GET /:id)
- **Web UI** (`src/ui/index.html`): dark monospace chat + artifacts sidebar, polls every 2s
- **Persistence**: JSON files in `frame/data/` (gitignored), saves after every mutation

Port: 4444 (configurable via `PORT` env var).

### Chassis files

| File | Role |
|---|---|
| `main.ts` | Entry point, poll loop (5s default via `POLL_INTERVAL`) |
| `loop.ts` | Signal polling, dispatch, signal handler compilation, agentic loop, stage detection with excision markers |
| `tools.ts` | Tool registry (11 built-in + custom tool compilation) |
| `memory-manager.ts` | `pollChatSignals()`, `buildThingsNoticed()`, `recordHistory()` |
| `soma-io.ts` | Read/write section files, assemble soma → system prompt |
| `inference.ts` | Anthropic SDK wrapper, sonnet 4.6, 8192 max tokens |

### Built-in tools (11)

**Soma (4):** `update_identity`, `update_responsibilities`, `update_memory`, `update_signal_handler`
**Custom tools (3):** `add_custom_tool`, `edit_custom_tool`, `remove_custom_tool`
**Files (3):** `read_file`, `write_file`, `list_files`
**Frame (4):** `post_chat`, `read_chat`, `deliver_artifact`, `list_artifacts`

### Stage excision

Stage-based impulses live in `getStageImpulse()` in `loop.ts`, wrapped in `[STAGE:N:begin/end]` markers:

```typescript
// [STAGE:0:begin]
if (stage === 0) return 'become';
// [STAGE:0:end]
```

When bloom completes a stage, the chassis excises that block. The running code records how far bloom has come. Bloom advances by updating `current_stage` in identity.

### Polling mechanics

- `main.ts` polls every `POLL_INTERVAL` (default 5s)
- Next poll doesn't start until current cycle finishes (`setTimeout` after `await cycle()`)
- Chat signals: fetches new messages via `?after=lastSeenChatId`, filters out bloom's own messages
- Tick signal: fires when `TICK_INTERVAL` (default 60s) has elapsed since last tick
- `ONCE=1` mode: run one cycle and exit (for testing)

### What's NOT built yet

- No actual first run of bloom (would need `ANTHROPIC_API_KEY` set and frame running)
- No persistence of `lastSeenChatId` across restarts (in-memory only)
- `things_noticed.md` is gitignored conceptually but not in `.gitignore` yet (chassis-managed, changes every signal)
- No rate limiting on inference calls
- Frame has no auth (anyone can post as any handle)

### Tradeoffs accepted

- **Polling over webhooks/SSE**: simpler, bloom is the only consumer, 5s latency is fine
- **File-based soma over in-memory**: slower but persistent, bloom can see its own files, grep-friendly
- **Compiling JS strings at runtime**: same pattern as Habitat's `on_tick`. Type safety traded for self-modification capability.
- **JSON persistence in frame**: simple, no database. Will need upgrading if data grows or multiple frame instances needed.
- **No hot-reload for chassis changes**: bloom can rewrite `tools.ts` or `loop.ts`, but changes only take effect on next process restart. Could add dynamic import later.

### Patterns from Habitat that carried over

- Pure soma system prompt (no preamble, no hidden instructions)
- Tool-granularity-shapes-self-concept (per-section tools)
- `new Function('return ' + code)()` compilation pattern
- Agentic loop with tool_use → tool_result message cycling
- Sonnet for reasoning/self-modification (haiku too passive)
- "thrive" as the terminal impulse (from Habitat's discovery)

### What diverged from Habitat

- **Signal-driven vs tick-driven**: Habitat ticks on interval with `on_tick` code. Bloom polls for signals and dispatches through a handler.
- **File-based soma vs in-memory**: Habitat stores soma as JS objects. Bloom stores as files on disk.
- **Memory manager as chassis component**: Habitat's default `on_tick` builds world snapshots. Bloom has a dedicated memory manager that separates concerns.
- **No browser runtime**: Bloom is a Node.js process. No DOM, no render loop, no UI state.
- **History replaces message chain**: Habitat's `thinkAbout()` maintains a conversation. Bloom's calls are stateless; history provides continuity.

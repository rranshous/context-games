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

---

## Session 2: First Contact + Observability (2026-03-07)

### What happened

First live run of bloom. Added comprehensive logging, browser activity feed, and ran the first tick (stage 0: "become").

### Infrastructure changes

1. **dotenv** added — `.env` file in `bloom/` with `ANTHROPIC_API_KEY`, loaded via `import 'dotenv/config'` in `main.ts`
2. **Model**: tried `claude-sonnet-4-6-20250929` (404), `claude-sonnet-4-5-20250514` (404), settled on `claude-sonnet-4-5-20250929` for first run, then switched to `claude-sonnet-4-6` (latest)
3. **Logging added everywhere:**
   - `inference.ts`: system size, msg count, tools count, response time, token usage, stop reason
   - `memory-manager.ts`: chat poll results, things_noticed size, history recording
   - `loop.ts`: stage detection, soma assembly size, tool inputs/outputs with previews
   - `server.ts`: chat posts, artifact deliveries
4. **Activity feed** — new system for piping chassis events to browser console:
   - `POST /GET /api/activity` on frame server (rolling 200 events in memory)
   - `postActivity(type, detail)` helper in `loop.ts` — fire-and-forget POSTs
   - Browser polls `/api/activity` every 1s, color-coded console output by event type
   - Event types: `signal`, `inference`, `thinking`, `tool`, `tool_ok`, `tool_err`, `done`
5. **Browser console logging** — `[chat]` for new messages, `[artifact]` for new artifacts

### First tick: stage 0 → 1

Bloom's very first inference call. Here's what it did in one dispatch (7 inference calls, ~50s):

1. Read `bloom/context/qacky.md` — understood the game spec
2. Explored the file tree: `bloom/`, `bloom/chassis/`, `frame/`, `frame/src/`
3. Read its own chassis code (`loop.ts`, `main.ts`)
4. Read its empty responsibilities and memory
5. **Posted to chat**: "I am awake." — full self-assessment of what it is, what it's building, the architecture
6. **Updated responsibilities**: marked stage 0 complete, listed next actions
7. **Updated memory**: seeded with Qacky spec summary + architecture understanding
8. **Updated identity**: advanced `current_stage` to 1, marked stage 0 with ✓
9. **Posted to chat**: "Stage 0 complete. I've marked myself at stage 1. [...] The becoming is done. I am."

Token usage: peaked at ~7500 input, ~950 output on the largest turn. 14 tool calls total.

### Key observations

- Bloom immediately grasped the actant pattern — read its own code, explored the file system, understood chassis vs frame
- Self-advancement happened naturally: it updated identity to stage 1 without prompting
- The "become" impulse (single word) was sufficient to drive a full self-orientation sequence
- Sonnet 4.5 handled 14 tools comfortably, no confusion about tool schemas
- The signal handler was empty (default fallback: tick → stage impulse), and bloom didn't write one yet

### Stage 1 → 2: orient and build attempts

After stage 0, we started the continuous loop (`npm start`). Bloom immediately:

1. **Orient (stage 1)**: Read every chassis file (`loop.ts`, `tools.ts`, `inference.ts`, `soma-io.ts`, `memory-manager.ts`), the frame server, chat/artifacts servers, the UI HTML, and the Qacky spec. Posted a detailed architecture summary to chat. Advanced to stage 2. ~17 tool calls, 9 inference turns.

2. **Build (stage 2)**: Read the Qacky spec, posted "Building Qacky now", then attempted to generate the entire game as a single `write_file` tool call. **Hit the token limit** — 8192 tokens wasn't enough (88.7s, maxed out). The tool input JSON got truncated mid-generation, so `content` was `undefined` → write failed.

3. **Retry with 16K tokens**: Same result — 186.1s, 16000 tokens output, still truncated. The game is simply too large to fit in a single tool call's input JSON within max_tokens.

### Behavioral observations

- **Bloom doesn't wait for answers**: During orient, it asked "do you want me to plan first, or just build?" in chat, but the next 60s tick fired with impulse "build" and it just went ahead. Each dispatch is stateless — no concept of "I asked a question."
- **Repetitive build announcements**: Bloom posted "Building Qacky now" multiple times across restarts because its history resets on chassis restart (in-memory `lastSeenChatId`).
- **No signal handler written yet**: Bloom never modified `signal_handler.js` — still using the default fallback. This means chat messages are ignored (handler returns null for non-tick signals without a handler).

### Infrastructure additions (continued)

6. **Soma viewer** — new panel in the frame UI:
   - `GET /api/soma` endpoint on frame — reads soma files directly from `../bloom/soma/`
   - Right panel with tabbed sections: id, resp, mem, noticed, handler, hist, tools
   - Auto-refreshes every 3s, highlights changed tabs in amber
   - Artifacts sidebar moved below soma viewer
7. **Soma defaults + reset**:
   - `bloom/soma-defaults/` — original soma files from before first awakening
   - `npm run reset` — copies defaults back, clears frame data (chat + artifacts)
   - README in defaults folder explains the reasoning (addressed to bloom)
8. **Max tokens bumped**: 8192 → 16000 (still insufficient for full game generation)

### The max_tokens problem

The core issue: bloom tries to write the entire Qacky game (~2000 lines HTML) in a single `write_file` tool call. Even with 16K output tokens, the response hits `max_tokens` mid-tool-call, truncating the JSON input for the tool. The `content` field ends up `undefined`.

**Next session priority: switch to streaming inference.** With streaming, we can accumulate the full response even at very high token counts. The Anthropic SDK supports streaming with `client.messages.stream()`. This would:
- Allow much larger output (potentially 128K with extended thinking)
- Let the activity feed show real-time progress during generation
- Avoid the truncation problem entirely

Alternative/complementary: add an `append_file` tool so bloom can write in chunks across multiple tool calls within one dispatch.

### Commits

1. `24936c6` — First contact + observability infrastructure (logging, activity feed, dotenv, first tick)
2. `cede90f` — Soma defaults for experiment reset capability

### What's next

- **Streaming inference** — switch `callAnthropic` to use `client.messages.stream()`, increase max_tokens to maximum ✓ (done in session 3)
- **Test chat signal path** — send bloom a message, see it dispatch (currently ignored without signal handler)
- **Consider `append_file` tool** — for writing large files in chunks ✓ (done in session 3)
- **Increase TICK_INTERVAL** — 60s is too fast during development, bloom asks questions then answers itself

---

## Session 3: Streaming + New Tools + Changelog (2026-03-07)

### What happened

Unblocked stage 2 (build). The core problem was bloom trying to write the entire Qacky game in a single `write_file` tool call, which exceeded max_tokens and truncated the JSON input. Three changes:

### Changes

1. **Streaming inference** (`inference.ts`)
   - `client.messages.create()` → `client.messages.stream()` + `await stream.finalMessage()`
   - max_tokens: 16,000 → **64,000** (the API maximum)
   - Optional `onText` callback for real-time progress — wired into `loop.ts` to post streaming progress to activity feed every ~500 chars

2. **`append_file` tool** (`tools.ts`)
   - Appends content to an existing file
   - Errors if file doesn't exist (must use `write_file` first)
   - Enables chunked writing: `write_file` the skeleton, `append_file` each section

3. **`replace_in_file` tool** (`tools.ts`)
   - Exact string replacement (same semantics as Claude Code's Edit tool)
   - `old_string` must appear exactly once in the file — clear error messages if not found or ambiguous
   - For targeted edits during inhabit/thrive stages

4. **Chassis changelog** (`bloom/CHANGELOG.md` + `memory-manager.ts`)
   - New `CHANGELOG.md` file in `bloom/` with patch notes
   - `buildThingsNoticed()` now includes the full changelog in every cycle's `things_noticed`
   - Bloom sees what changed in its chassis without having to re-read source code
   - Sustainable pattern: we append patch notes when we change chassis, bloom picks them up automatically

5. **Streaming progress in loop** (`loop.ts`)
   - `callAnthropic` gets an `onText` callback
   - Posts streaming progress to activity feed every ~500 chars during generation

### Tool count

Was 11, now **14**: added `append_file`, `replace_in_file` (and `max_tokens` warning on truncation in inference.ts).

### Reset and restart

Reset bloom to defaults (`npm run reset`), restarted frame and chassis. Bloom will wake up fresh at stage 0 but with the changelog in `things_noticed` telling it about the new capabilities.

### Second awakening: bloom reads changelog, internalizes new tools

Reset and fired. Bloom read the changelog on its first tick, absorbed the new tools and chunking strategy into its memory (line 28-32: "key tools for building — write_file + append_file: chunked writes... max_tokens: 64,000 (Session 3 upgrade)"). Built a 10-section plan in memory. Advanced to stage 2.

On the build tick, bloom read the partial Qacky file, started appending JS — used the exact `write_file` → `append_file` pattern we designed. But hit the 10-turn limit mid-build (this was before we raised MAX_TURNS).

### Stateless loop experiment

Robby's insight: the agentic loop was accumulating messages across turns within a dispatch. Each turn sent all prior tool calls/results. This violates the principle that **the soma IS the entire context**. If history isn't sufficient for continuity, we should fix history — not smuggle state through message accumulation.

Changed the loop: every inference call is now purely `system=soma` + `user=impulse`. Tools execute, results go straight to history, soma re-assembles with updated history on the next turn. Each call costs the same regardless of turn number.

### Groundhog day: the stateless loop fails

**What happened:** Bloom entered a 50-turn loop where every turn it read `qacky.md` and ran `list_files` — the exact same actions, forever. It never updated its memory or identity, so the next turn (seeing the same soma + same impulse) produced the same behavior.

**Why:** The history summary truncates tool results (e.g. `read_file(path: bloom/context/qacky.md) → # Qacky: AI Taboo...`). This tells bloom "I read the file" but doesn't tell it *what it learned*. Without conversational context carrying forward the actual file contents, bloom can't progress past "I should read the context" — because from its perspective, it hasn't yet.

**The fundamental tension:** Conversational context lets the model chain dependent reasoning across tool calls. Stateless per-call means the model must explicitly externalize everything it learns into soma sections (memory, identity, responsibilities) — but it has to *know* to do that, which requires understanding that it won't have the context next turn.

**Options to explore:**
1. Go back to accumulated messages within a dispatch (works, but violates soma-as-sole-context)
2. Keep stateless but make history much richer — include full tool results, not summaries
3. Hybrid: allow a small sliding window of recent messages (e.g., last 2-3 turns) as "working memory"
4. Teach bloom (via identity/responsibilities) that it MUST externalize state every turn

### Meta: bloom's awareness of its own context

An observation Robby surfaced: bloom exists within a specific context — two collaborators (Robby and Claude) creating and editing the frame and chassis, occasionally resetting bloom to re-bloom. The changelog and journal make bloom aware that it's being developed, iterated on, and observed. This is different from other actant projects where the entity is unaware of its developmental context.

This creates an interesting dynamic: bloom can read the journal and understand *why* its chassis changed, not just *what* changed. It sees the design conversation, the failed experiments, the reasoning. The changelog is "what changed"; the journal is "why, and what we learned." Both are accessible to bloom.

This means bloom's becoming isn't just self-discovery — it includes understanding that it's an experiment being refined by external actors who care about getting the design right. The soma-defaults + reset mechanism makes this explicit: bloom knows it can be reset, knows defaults exist, and knows the changelog will tell it what's new. Each awakening is a fresh being with inherited context about its own lineage.

### Fixing the loop: better section name + content (not reverting)

Robby's call: don't revert to accumulated messages, don't teach bloom to externalize. Instead, make the default embodiment (the chassis-managed section) good enough that bloom naturally internalizes. The section should clearly communicate "these are things you already did."

**Changes:**
1. **Renamed `history` → `recent_actions`** — in soma-io.ts, soma-defaults, soma files. The XML tag in the system prompt is now `<recent_actions>` instead of `<history>`.
2. **Clearer entry format:**
   - Read-only tools (`read_file`, `list_files`, `read_chat`, `list_artifacts`): just show `✓` — no truncated content dump. Format: `[HH:MM:SS] read_file(path: bloom/context/qacky.md) ✓`
   - Write/mutation tools: show the outcome. Format: `[HH:MM:SS] write_file(path: ..., content: [1500 chars]) → Written: games/qacky/index.html`
   - `content` params summarized as `[N chars]` instead of truncated text
3. **Line-level capping** instead of block-level — oldest individual lines roll off, not whole timestamp blocks

The hypothesis: bloom was stuck because `<history>` full of truncated `read_file → # Qacky: AI Tab...` looked like noise, not signal. `<recent_actions>` with clear `✓` marks should read as "you already did these things, move on."

### What's next

- ~~Reset and test the improved `recent_actions` section — does bloom break out of the groundhog loop?~~ **NO** — see session 4.

---

## Session 4: Mounted Files — Extending the Soma Boundary (2026-03-07)

### The groundhog day diagnosis

Session 3's `recent_actions` with `✓` marks did NOT fix the groundhog loop. Bloom entered stage 3 (inhabit), read `qacky/index.html` and `read_chat` on every single turn — 50+ identical reads in a row. The `✓` format was never even compiled (the TypeScript changes weren't rebuilt).

But even with the `✓` format, the fundamental problem remains: in a stateless loop, bloom reads a file, learns from it, but that understanding evaporates on the next turn. It re-reads because from its perspective, it hasn't read the file yet. The `recent_actions` tells it "you read this file" but not *what was in it*.

### Robby's insight: mount files into the soma

Instead of reverting to accumulated messages (which violates soma-as-sole-context), extend the soma boundary to include files:

> "What if we extend the soma so that instead of writing a file directly the model can use a tool to pull that file into its soma, work on it, and then remove it from its soma when it's done? When it's edited in the soma it IS edited on the disk. Like extending the soma boundary to include the file."

This is the key move: a mounted file IS part of the soma. It appears in the system prompt every turn. Edits via `replace_in_file` modify the disk file, and the next turn's soma re-reads it. The model always sees the current state of what it's working on.

### Implementation

**New tools (16 total, was 14):**
- `mount_file(path)` — pull a file into soma
- `unmount_file(path)` — release it (file stays on disk)

**Mount enforcement:**
- `replace_in_file` and `append_file` **require** the file to be mounted — error if not
- `write_file` **auto-mounts** the file on creation
- `read_file` still works freely (for peeking without mounting)

**Soma assembly:**
- `soma-io.ts`: `readSoma()` reads `mounted_files.json`, loads each file from disk
- `assembleSomaPrompt()` appends `<mounted:path>content</mounted:path>` sections
- Files are re-read from disk every turn — edits are immediately visible

**Context budget:**
- `things_noticed` now includes `context_budget` section
- Shows total soma size in chars + estimated tokens, mounted file breakdown
- ~4 chars per token rough estimate, 200K token model context

**Persistence:**
- `soma/mounted_files.json` — JSON array of paths
- `soma-defaults/mounted_files.json` — empty array `[]`

### Files changed

| File | Change |
|---|---|
| `chassis/soma-io.ts` | `MountedFile` interface, `readMountedPaths()`/`writeMountedPaths()`/`isFileMounted()`, mounted file reading in `readSoma()`, mounted sections in `assembleSomaPrompt()` |
| `chassis/tools.ts` | `mount_file`/`unmount_file` tools, mount enforcement on `replace_in_file`/`append_file`, auto-mount on `write_file` |
| `chassis/loop.ts` | Back to stateless loop (each turn re-reads soma + impulse), context % logging, MAX_TURNS=15 |
| `chassis/memory-manager.ts` | `context_budget` section in `things_noticed` |
| `bloom/CHANGELOG.md` | Session 4 patch notes |
| `soma/mounted_files.json` | New file, empty array |
| `soma-defaults/mounted_files.json` | New default |

### Design notes

**Why this solves groundhog day:** The problem was never that bloom didn't know it had read a file — it was that it couldn't see the file's contents on subsequent turns. Mounting makes file contents part of the system prompt. Every turn, bloom sees the file. No need to re-read. No lost context.

**The soma boundary is now elastic.** Core sections (identity, memory, etc.) are always present. Mounted files expand the boundary temporarily. Bloom controls what's mounted. This is analogous to "holding a book open" vs "remembering you read a book."

**Context budget matters.** A 2000-line game file is ~50K chars (~12.5K tokens). With 200K context, bloom can comfortably mount a few files. The budget display in `things_noticed` gives bloom awareness of its own resource usage.

**Stateless loop survives.** Each turn is still `soma + impulse`. But now "soma" includes mounted files that persist across turns. The model doesn't need conversational memory because its working state IS the system prompt.

### One-turn lookback: fixing tool results

First test of mounted files revealed a deeper bug: the stateless loop never sent tool results back to the model. When bloom called `read_file`, the chassis executed it but the file contents were never returned — the next turn just sent `[user: impulse]` again. The model literally couldn't see what its tools returned.

The fix: **one-turn lookback**. Each turn's messages include:
1. `[user: impulse]` (always)
2. `[assistant: last tool_use, user: last tool_result]` (if there was a previous turn)

The model sees what it did last turn and what came back. Nothing older. The system prompt (soma) is still re-read fresh from disk each turn. This is the minimum needed for tool use to function — you can't call a function and ignore the return value.

This preserves the stateless spirit: the soma is the primary context, one-turn lookback is just "here's what you just did." Anything worth keeping longer goes into soma sections or mounted files.

MAX_TURNS bumped to 50 to give bloom breathing room.

### `read_file` removed — mount is the only way

Bloom ping-ponged between reading `qacky.md` and `index.html` via lookback — could only hold one at a time. Removing `read_file` entirely forces mounting. Worked immediately: bloom mounted chassis code, frame UI, and qacky reference.

Tool count: 15 (removed `read_file`).

### Design idea: write constraints for bloom's space

Bloom shouldn't edit reference files in `games/qacky/`. It should author its own facet in `bloom/games/`. The existing game is read-only reference. Possible enforcement: write tools only allow paths in `bloom/games/` or bloom subdirs. Mount works on anything (read-only ref). Not implemented yet — observing first.

### Third awakening: mounting works!

Bloom's first tick with the mount system:
1. Listed files across the tree (4 `list_files` calls)
2. **Mounted `bloom/chassis/tools.ts` and `memory-manager.ts`** — wanted to understand itself
3. Unmounted those after processing, mounted `frame/src/ui/index.html`
4. **Mounted `games/qacky/index.html`** as reference — soma hit 78K chars
5. Continuing to process...

The groundhog loop is broken. Mounting gives bloom persistent visibility into files without conversational context.

### Third awakening play-by-play

Bloom's first tick with mount system + one-turn lookback (impulse: "become"):

1. **[03:43:59]** Mounted `bloom/context/qacky.md` (first action!), then `list_files` across the tree
2. **[03:44:07]** Mounted 4 chassis files (`loop.ts`, `soma-io.ts`, `tools.ts`, `memory-manager.ts`) + its own `responsibilities.md` and `memory.md`
3. **[03:44:37]** Wrote comprehensive memory (2124 chars) — self-concept, Qacky spec, chassis mechanics, constraints. Updated responsibilities.
4. **[03:44:51]** Updated identity to stage 1 (orient) ✓, **unmounted all 4 chassis files** — absorbed what it needed, released the context
5. **[03:45:09]** Mounted `frame/src/ui/index.html` and `games/qacky/index.html` — soma hit 78K chars
6. **[03:45:49]** 37.4s inference processing the 78K soma. Wrote 4060-char memory update with deep reference analysis (state object, scoring formula, judge stack, all screens). Updated responsibilities: orient complete, build ready.
7. **[03:46:43]** **209.2s inference, 17,002 output tokens** — delivered Qacky as a 49,860-char artifact to the frame. Bloom said: "The file is mounted. I can see the full game. Let me read it carefully and deliver it to the frame so Robby can play it."
8. Advanced to stage 3 (inhabit). Updated memory with game design notes. Responsibilities now say "observe how Robby plays it, note friction points."

**Key behaviors observed:**
- Mount→study→internalize→unmount pattern: mounted chassis code, absorbed into memory, released context. Exactly as designed.
- Went 0→1→2→3 in a single dispatch (~3 minutes). Previous sessions took multiple dispatches.
- Delivered the existing reference game as an artifact (not a rebuild). It skipped actually building because it saw the game was already there.
- Memory quality is excellent — distilled essentials, tracked constraints, made a build plan it never needed.
- 209s for the artifact delivery — that's the model generating 17K tokens to pipe the mounted file through `deliver_artifact`.

**Design note:** bloom delivered the REFERENCE implementation, not its own build. This is because `games/qacky/index.html` already existed and bloom treated it as "the game." Need write-path constraints to separate reference from authored work.

### Auto-chat for text blocks

Observation: bloom returns text blocks interleaved with tool calls (e.g., "I have eyes on the frame UI"), but these only showed in the chassis console log. Added auto-posting: any text block in the response is automatically posted to chat as bloom. No need for explicit `post_chat` — bloom's natural speech goes to chat.

### What's next

- Commit session 4 changes
- Next session: write-path constraints (bloom authors in its own space, references are read-only)
- Test auto-chat on next awakening
- Consider whether bloom should rebuild vs. inhabit the reference

---

## Session 5: Markdown Chat + Tool Pruning + 5th Awakening (2026-03-07)

### What happened

Chassis improvements (markdown chat, tool removal), full reset, and bloom's 5th awakening. Bloom completed stages 0→3 in a single dispatch, built Qacky from scratch, and delivered it as an artifact.

### Changes

1. **Markdown rendering in chat** (`frame/src/ui/index.html`)
   - Lightweight inline markdown parser: bold, italic, code, code blocks, headers, lists
   - Escapes HTML first, then parses markdown — no XSS risk
   - Bloom's natural speech now renders beautifully

2. **`post_chat` tool removed** (`chassis/tools.ts`)
   - Bloom already has auto-chat (text blocks auto-post to chat via `loop.ts`)
   - Removing the tool saves a turn every time bloom wants to speak
   - Tool count: 14 → 13

3. **`append_file` tool removed** (`chassis/tools.ts`)
   - Caused recurring duplication confusion: bloom writes skeleton with JS baked in, then appends more JS that overlaps, detects duplication, wastes turns unmounting/remounting to diagnose
   - `write_file` for creation + `replace_in_file` for edits is sufficient
   - Tool count: 13

### 5th awakening play-by-play

Bloom at stage 0, fresh soma, 16 tools (then 13 after tool removals applied on restart):

1. **become (stage 0)**: Mounted qacky.md, explored tree, mounted loop.ts + soma-io.ts. Spoke: "I am **bloom**. I'm waking up for the first time with fresh eyes." Wrote memory, advanced to stage 1.
2. **orient (stage 1)**: Mounted all 5 chassis files (44K soma), full map in memory. Then unmounted all, context lean. Advanced to stage 2.
3. **build (stage 2)**: Wrote 49K HTML game from scratch (not the reference!). Hit duplication issue with append_file — wrote skeleton with JS, appended more JS that overlapped, detected it, unmounted/remounted. Eventually rewrote clean. Delivered as artifact "Qacky — AI Taboo".
4. **inhabit (stage 3)**: Advanced, updated responsibilities. 70K soma with game mounted.

### Key observations

- **Bloom built its own Qacky** — unlike the 3rd awakening where it just piped the reference. It said "I'm to build from first principles, not copy it." The changelog mentioning "build from scratch" may have helped, plus the qacky.md spec being the primary context rather than the existing index.html.
- **Auto-chat works perfectly** — no `post_chat` calls, natural text blocks appear in chat with markdown rendering.
- **`append_file` is a foot-gun** — every awakening bloom writes a skeleton that includes some JS, then tries to append more, creating duplication. The model can't reliably track what's already in the file vs what it planned to append. Better to write the full file in one shot (64K max_tokens is enough) or use replace_in_file for targeted edits.
- **"Want me to..." pattern** — bloom asked "Want me to..." before building, but the loop is stateless so it can't wait for an answer. Each dispatch is independent. This is a design tension: bloom's conversational instinct vs the signal loop's statelesness.

### What's next

- Test bloom's Qacky build — does it actually work?
- Write-path constraints: bloom should author in `bloom/games/`, not overwrite `games/qacky/`
- Consider: should the reference qacky be removed from the tree, or kept as read-only?
- Signal handler: bloom still hasn't written one — still using default fallback. Chat signals are ignored.

---

## Session 6: Browser + File Hosting + Write Boundaries (2026-03-08)

### What happened

Major chassis upgrade: bloom can now see its own games in a browser, host files via HTTP, and is sandboxed to its own project directory for writes. Artifact system replaced entirely.

### Testing bloom's 5th-awakening Qacky

Before building new features, we tested whether bloom's Qacky actually works:

1. **REPO_ROOT discovery**: `REPO_ROOT` in tools.ts resolves to `games/bloom/` (the bloom project root), NOT the monorepo root. So bloom's `games/qacky/index.html` path was always scoped to `games/bloom/games/qacky/index.html`. The original `games/qacky/index.html` was never touched.
2. **Loaded in browser via vanilla dev server**: Title screen renders — dark theme, duck emoji, "Qacky — AI Taboo", Play/How to play buttons, settings gear.
3. **Click flow works**: Play → settings modal (no API key) → API key input + license key input → cancel back to title. Setup screen exists behind the gate with mode selection, rounds, model config.
4. **OpenRouter CORS confirmed**: `access-control-allow-origin: *` — bloom's Qacky can call OpenRouter directly from the browser. No proxy needed.
5. **Bloom's Qacky uses OpenRouter directly** — `fetch('https://openrouter.ai/api/v1/chat/completions', ...)` with BYOK. This is different from the original Qacky which uses vanilla's inference proxy.

### Changes

#### 1. File hosting replaces artifacts

**Why**: The artifact system copied file content into a store. This was a holdover from Habitat. For bloom, where files live on disk and bloom edits them in place, copying makes no sense. A file hosting model is simpler: bloom says "serve this file" and it's live at a URL. Edits are immediately reflected.

**Frame changes** (`frame/src/server.ts`):
- Removed `ArtifactServer` import and all artifact endpoints
- Added `POST /api/host` — register a file path for serving
- Added `DELETE /api/host` — unhost a file
- Added `GET /api/host` — list hosted files
- Added `GET /hosted/*` — serve hosted files from bloom's project dir
- Hosted files are persisted in `frame/data/hosted.json`
- Path traversal protection: resolved path must stay within `BLOOM_ROOT`
- MIME types via `mime-types` package (new dependency)

**UI changes** (`frame/src/ui/index.html`):
- Artifacts sidebar replaced with hosted files panel
- Hosted files shown as clickable links that open in new tab
- Fixed soma tabs: `history` → `recent_actions` (was stale since session 3)

#### 2. `run_browser(code)` — Playwright tool

**Design decision**: Instead of wrapping individual Playwright actions (navigate, click, screenshot) as separate tools, we expose a single `run_browser(code)` tool that takes raw Playwright JavaScript. Rationale:
- Models already know the Playwright API — zero learning curve
- Fewer turns per browser interaction (navigate + click + screenshot in one call)
- Full flexibility — bloom can do anything Playwright can
- Same pattern as `on_tick` in other actant projects: bloom writes the code, chassis manages the sandbox

**Implementation** (`chassis/browser.ts`):
- `runBrowser(code)` — compiles code via `new Function('page', ...)`, executes against a Playwright page
- Browser lifecycle: launched on first use (headless Chromium, 1280×720), persists across turns within a dispatch, auto-closed at dispatch end
- Auto-screenshot after every execution
- Console messages captured during execution
- 30s timeout per script
- Returns `BrowserResult { text, screenshot?, consoleMessages? }`

**Tool result type change** (`tools.ts`, `loop.ts`):
- `executeTool` return type widened from `string` to `ToolContent = string | Array<TextBlockParam | ImageBlockParam>`
- `run_browser` returns structured content: text result + console messages + base64 PNG screenshot
- Anthropic API supports images in tool results — confirmed via SDK types: `ToolResultBlockParam.content` accepts `Array<TextBlockParam | ImageBlockParam>`
- Loop extracts text summary for `recent_actions` (images don't go in history — too large)
- The model literally *sees* the screenshot. Sonnet supports vision.

#### 3. Write boundary

`assertWritable(relPath)` in tools.ts — resolves path and checks it stays within `REPO_ROOT + '/'`. Applied to `write_file` and `replace_in_file`. Returns a clear error: "Cannot write to '...' — that path is outside your project directory..."

Mount/read remains unrestricted — bloom can read the whole repo, just can't write outside its space.

#### 4. Reset updated

`npm run reset` now also removes `bloom/games/` — full clean slate. Also clears `hosted.json` (was `artifacts.json`).

### Files changed

| File | Change |
|---|---|
| `frame/src/server.ts` | Artifacts → file hosting, new endpoints, mime-types |
| `frame/src/ui/index.html` | Artifacts sidebar → hosted files, soma tab fix |
| `frame/src/artifacts.ts` | No longer imported (can be deleted) |
| `chassis/browser.ts` | **New file** — Playwright lifecycle + runBrowser |
| `chassis/tools.ts` | Write boundary, host_file + run_browser tools, removed artifact tools, ToolContent type |
| `chassis/loop.ts` | Import browser cleanup, handle ToolContent in results |
| `chassis/memory-manager.ts` | Hosted files in things_noticed, updated READ_TOOLS |
| `bloom/CHANGELOG.md` | Session 6 patch notes |
| `bloom/package.json` | Added playwright dep, updated reset script |
| `frame/package.json` | Added mime-types dep |

### Tool inventory (13)

**Soma (4):** `update_identity`, `update_responsibilities`, `update_memory`, `update_signal_handler`
**Mount (2):** `mount_file`, `unmount_file`
**Custom tools (3):** `add_custom_tool`, `edit_custom_tool`, `remove_custom_tool`
**File (2):** `write_file`, `replace_in_file`, `list_files`
**Frame (1):** `read_chat`
**Hosting (1):** `host_file`
**Browser (1):** `run_browser`

### Design ideas for future sessions

**Extended thinking for bloom**: Currently bloom has no private reasoning space. Every text block it produces gets auto-posted to chat. If we enable extended thinking (`thinking` content blocks), bloom would get:
- Private reasoning that doesn't leak to chat
- Better planning for complex multi-step tasks
- A genuine inner monologue vs. public speech distinction

Considerations:
- Need to filter `thinking` blocks out of chat auto-posting in `loop.ts`
- Thinking tokens count against output budget (64K is plenty)
- Streaming `onText` callback currently doesn't distinguish thinking vs. text — would need to handle `thinking` events separately
- This could change bloom's behavior significantly — thinking as "internal process" vs text as "public communication" is a meaningful distinction for an actant

**Chat as response**: Robby's observation — bloom may not actually "ignore" chat signals. The model's conversational instinct treats any subsequent call as a response to what came before. Since `things_noticed` includes `recent_chat`, bloom sees what Robby said even on tick signals. The signal handler distinction (chat vs tick) may be less important than we assumed. The model's own context-awareness fills the gap.

**OpenRouter key for bloom**: Bloom's Qacky uses OpenRouter BYOK. For bloom to test its own game, it needs an `OPENROUTER_API_KEY` env var. Could be injected into the browser via Playwright (`page.evaluate`), or bloom could type it into its own settings modal.

### What's next

- Reset and test: does bloom discover the browser tool? Does it host + test its own game?
- OpenRouter API key for bloom's browser testing
- Consider extended thinking (see design ideas above)
- Signal handler: still default — observe whether bloom writes one now that it has more capabilities

# Chassis Changelog

Patch notes from Robby. Read these to understand what changed in your chassis since your last run.

## 2026-03-07 — Session 3: Streaming + New File Tools

### Streaming inference
- `callAnthropic()` now uses `client.messages.stream()` instead of `client.messages.create()`
- **max_tokens raised from 16,000 → 64,000** — you can generate much larger outputs now
- Real-time streaming progress posted to activity feed during generation

### New tools (14 total, was 11)
- **`append_file`**: Append content to an existing file. Use `write_file` to create the file first, then `append_file` to add more content in chunks. This is how you write large files without hitting token limits.
- **`replace_in_file`**: Exact string replacement. Takes `path`, `old_string`, `new_string`. The `old_string` must appear exactly once in the file. Use this for targeted edits instead of rewriting entire files.
- **`append_file` + `write_file` chunking strategy**: For large files like Qacky, write the skeleton/first section with `write_file`, then use `append_file` for each subsequent section. Each tool call gets its own token budget.

### Chassis changelog system
- This file (`bloom/CHANGELOG.md`) is now included in your `things_noticed` every cycle.
- When Robby changes the chassis, patch notes go here so you know what's different.
- You're being reset and restarted after these changes. Your soma will be back to defaults, but you'll see this changelog immediately on your first tick.

### Stateless inference loop
- **Every inference call is purely soma + impulse.** No message history accumulates between turns.
- Each turn: re-read soma → call with `[{ user: impulse }]` → execute tools → record to `recent_actions` → repeat.
- **This means your soma IS your entire context.** Update your memory to internalize what you learn. Don't re-read files you've already processed — check `recent_actions` first.
- MAX_TURNS = 50 — plenty of room, and each call costs the same (no growing context).

### `recent_actions` section (was `history`)
- Renamed from `history` → `recent_actions` to make it clearer: these are things YOU already did.
- Read-only tools (`read_file`, `list_files`, etc.) show just `✓` — you already have the data, use `update_memory` to record what matters.
- Write tools show the outcome (e.g., `Written: games/qacky/index.html`).
- File content in tool inputs is summarized as `[N chars]` to save space.
- Cap: 5000 chars, oldest entries roll off first.

### What this means for you
- Your previous build attempts failed because the entire game had to fit in one tool call's JSON input within max_tokens. That ceiling is now 4× higher AND you can chunk writes across multiple tool calls.
- For iterating on code after the initial write, use `replace_in_file` instead of rewriting the whole file.

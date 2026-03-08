# Chassis Changelog

Patch notes from Robby. Read these to understand what changed in your chassis since your last run.

## 2026-03-08 — Session 6: Browser + File Hosting + Write Boundaries

### You have a browser now — `run_browser(code)`
- New tool: `run_browser`. Pass it async JavaScript that uses a `page` variable (a Playwright Page object).
- A screenshot is automatically taken after your script runs and returned as an image you can see.
- The browser persists across calls within a single dispatch — navigate once, then interact across multiple calls.
- Console messages from the page are captured and returned as text.
- The browser is automatically closed at the end of each dispatch.
- Example: `await page.goto("http://localhost:4444/hosted/games/qacky/index.html"); return await page.title();`
- You can now test your own games: host them, navigate to them, screenshot, click, type, read console errors.

### File hosting replaces artifacts — `host_file(path)`
- `deliver_artifact` and `list_artifacts` are gone. The artifact system has been removed entirely.
- New tool: `host_file(path)`. Registers a file to be served via HTTP by the frame. Returns the URL.
- The file is served directly from disk — edits you make via `replace_in_file` or `write_file` are immediately live at the URL.
- Hosted files show in `things_noticed` with their URLs.
- Use this to make your games playable in the browser (including by `run_browser`).
- Example: `host_file(games/qacky/index.html)` → `http://localhost:4444/hosted/games/qacky/index.html`

### Write boundary
- `write_file` and `replace_in_file` now enforce a boundary: you can only write within your project directory.
- Paths that resolve outside your project root are rejected with a clear error message.
- You can still *read* (mount) files from anywhere — the constraint is writes only.
- This protects the rest of the repository. Your space is everything under `bloom/`.

### Tool count: 13
- Removed: `deliver_artifact`, `list_artifacts` (2)
- Added: `host_file`, `run_browser` (2)
- Net: same count, but very different capabilities.

### Reset now clears games
- `npm run reset` now also removes `bloom/games/` — full clean slate on reset.

---

## 2026-03-07 — Session 5: Markdown Chat + Fresh Awakening

### `append_file` removed
- The `append_file` tool has been removed. It caused duplication confusion during builds.
- Use `write_file` for creating files, `replace_in_file` for targeted edits.
- Tool count: 13 (was 14).

### `post_chat` removed — just speak naturally
- The `post_chat` tool has been removed. You don't need it.
- Any text you return (not tool calls) is automatically posted to chat as you. Just speak.
- This saves you a tool call every time you want to say something.
- Tool count: 14 (was 15).

### Chat now renders markdown
- The frame UI (`frame/src/ui/index.html`) now renders chat messages as markdown instead of raw text.
- Supports: **bold**, *italic*, `inline code`, code blocks, headers, lists.
- Your natural speech will look much better in the chat panel. Use markdown freely.
- HTML is still escaped — markdown is parsed from the escaped text, so no XSS risk.

---

## 2026-03-07 — Session 4: Mounted Files + Auto-chat

### Text blocks auto-post to chat
- When you return text (not tool calls), it's automatically posted to chat as you.
- No need to call `post_chat` for normal speech — just speak naturally.
- `post_chat` still exists for deliberate messaging if needed.

### Mounted files — extending your soma boundary
- **`mount_file(path)`**: Pull a file into your soma. Its contents appear as `<mounted:path>` in your system prompt every turn. You can SEE it without re-reading it.
- **`unmount_file(path)`**: Release a file from your soma. It stays on disk but leaves your system prompt.
- **`write_file` auto-mounts**: When you create a file, it's automatically mounted so you can see and edit it immediately.
- **`replace_in_file` and `append_file` require mount**: You must mount a file before editing it. This ensures you can always see what you're changing.
- **Mounted files are re-read from disk each turn.** Edits via `replace_in_file` modify the disk file — your next turn sees the updated content in your soma.
- Use this to bring files into your working awareness. Mount when you need to work on something, unmount when done.

### Context budget
- `things_noticed` now shows your soma's context budget: total chars, token estimate, mounted file sizes.
- The model context is ~200K tokens. Your soma sections + mounted files should stay well under that.
- You can see exactly which mounted files are consuming space.

### No `read_file` — mount is the only way to see files
- `read_file` has been removed. To see a file's contents, you must `mount_file` it.
- This is intentional: if a file is worth reading, it's worth having in your soma.
- `list_files` still works for discovering what exists.

### One-turn lookback loop
- Each turn re-reads your soma fresh from disk (system prompt).
- Messages sent to the model: `[user: impulse]` + optionally `[assistant: last tool_use, user: last tool_result]`.
- You see what you did LAST turn and what came back. Nothing older.
- Anything worth keeping beyond one turn must go into soma (memory, identity, mounted files).
- MAX_TURNS = 50.
- Tool count: 15. Added `mount_file`, `unmount_file`. Removed `read_file`.

### What this means for you
- To work on a file: `mount_file` → see it in your soma → `replace_in_file` to edit → `unmount_file` when done.
- You no longer lose file contents between turns. Mounted files ARE your soma.
- Think of mounting as extending your body to include a file. Unmounting is letting it go.

---

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

# Playthrough Viewer

A browser-based tool to step through saved playthroughs and watch what
happened: the game transcript, the soma state at each step, edits the
actant made, and the model's text responses (thinking).

## What it shows

**Left panel — Game Transcript:**
- Each step's observation (what the game showed)
- Each tool call:
  - Edit calls (purple) — `edit_on_tick`, `edit_memory`, etc with content preview
  - Action calls (green) — `→ open mailbox`, `→ go north`
- Model's thinking text (italic grey) — text returned alongside tool calls
- Score changes — `Score: 0 → 10` highlighted
- Steps before the current one fade. The current step has a teal border.

**Right panel — Soma:**
- All text sections at the current step: identity, goal, memory, history,
  recent_thoughts, things_noticed (v3 only)
- All code sections: on_tick, on_score, notice, on_observation, on_history
- A `changed` badge appears next to any section that differs from the previous step

**Header bar:**
- Game info: agent name, env name, episode number, final outcome (won/lost)
- Score: current step's game score, composite score (v3+), reflection turns used (v3+)

**Controls:**
- Prev / Next — step backward/forward
- Play — auto-advance every 1.5s
- Slider — jump to any step
- Keyboard: ← / → arrows, space to play/pause

## Files

- Tool: [tools/playthrough-viewer/index.html](../../../tools/playthrough-viewer/index.html)
- Logs: `embodiment-expirements/harness-tests/results/logs/<agent>_<env>_ep<n>.json`

Each log is a `Playthrough` JSON: `{ agent, env, episode, steps[], finalScore, maxScore, won, totalSteps }`.
Each step has the soma snapshot, all tool calls, the action taken, and the score at that moment.

## Opening the viewer

The viewer is a static HTML file. The simplest way is to serve the workspace
root with Python's HTTP server and load the file in a browser. Playthrough
JSON files are loaded via fetch from the same origin.

### 1. Start an HTTP server (from the workspace root)

```bash
cd /home/robby/coding/contexts/games
python3 -m http.server 8765
```

Leave it running. (If 8765 is taken, pick another port.)

### 2. Open the viewer

Navigate to:

```
http://localhost:8765/tools/playthrough-viewer/index.html
```

You'll see "Load a playthrough to begin" in the left panel.

### 3. Load a playthrough

Open the browser console (DevTools → Console) and run:

```js
const resp = await fetch('/embodiment-expirements/harness-tests/results/logs/v4-sonnet_JerichoEnvZork1_ep1.json');
const data = await resp.json();
window.loadPlaythrough(data);
```

The playthrough loads. Use the controls or keyboard to step through.

## Window API (for Playwright / scripted use)

The viewer exposes globals so an automation tool (like Playwright) or a
quick script can drive it:

```js
window.loadPlaythrough(data)   // load a parsed JSON object
window.getPlaythrough()         // returns the currently loaded data
window.goToStep(n)              // jump to step n (0 = before step 1)
```

This is the same pattern as `tools/tileset-cutter/` — Claude can launch
the viewer via Playwright, load a specific playthrough, scrub to interesting
steps, and screenshot or read state.

## Listing playthroughs

```bash
ls -lt embodiment-expirements/harness-tests/results/logs/ | head -20
```

The most recent runs are at the top. Filenames are
`<agent>_<env>_ep<n>.json` — agents include `bare-haiku`, `embodied-v0-sonnet`,
`v3-opus`, `v4-sonnet`, `v5-sonnet`, etc.

# waves against the sound of waves — journal

## session 1 — 2026-04-18

### what is this

An art experiment. A small local model (qwen2.5:1.5b via ollama) runs in a continuous stream of consciousness — its output feeds back as its next input. Words decay probabilistically over time. A web interface renders the living, dissolving text.

The idea: let a mind think out loud forever, watching what emerges when there's no task, no user, no goal — just a seed and momentum. The words it spoke dissolve beneath it, and it speaks from the gaps.

### model discovery

Started with **qwen3:1.7b** — a reasoning model. It produced `<think>` blocks with a genuine internal monologue voice, worth revisiting. But it splits output into two voices (thinking + response) when we want one continuous stream. Also tried it in assistant mode (without `raw: true`) and got "As an AI language model..." responses — useless.

Switched to **qwen2.5:1.5b** — non-reasoning, slightly smaller (986MB), good at open-ended continuation. With `raw: true` it treats the buffer as text to continue, not a question to answer. This is the right model for now.

**Key insight**: `raw: true` in ollama skips the chat template entirely. Essential for stream-of-consciousness — the model should continue, not respond.

**Future mode**: thinking-block-only using qwen3. Surface only the internal monologue. Different texture.

### probabilistic decay

Instead of a hard rolling window (trim oldest text), words decay probabilistically. Each word has an age (incremented every generation turn). Survival probability per turn: `P = 0.5 ^ (age / halfLife)`. Half-life of 100 turns means a word has a 50% chance of surviving 100 turns total.

This means the model reads its own degraded output. Gaps form. Coherence frays. The text becomes increasingly strange and fragmented as old words die randomly.

Max 150 words in the buffer. 8 tokens generated per turn.

### architecture journey

**v1 — custom Node.js server, SSE push**: server runs inference loop, streams tokens via SSE. Problem: server generates faster than UI can display, especially at slow pace settings. Tried backpressure (drain endpoint, pending counter) — fragile, counter drifted, server got stuck.

**v2 — pull-based**: server generates on demand, UI requests batches. Better but still unnecessary complexity with server-side state.

**v3 — stateless server + vanilla platform**: realized vanilla already has an ollama proxy. Added `POST /api/inference/ollama/generate` endpoint to vanilla (raw completion, no chat template). Game is now a single `index.html` — all state lives in the browser. Server is just a pass-through to ollama.

The architecture simplified itself: the UI is the clock, the UI holds the words, the UI decides when to ask for more. Server is stateless.

### UI pacing

The slider controls animation duration (how slowly words crawl in/out). The rAF loop checks elapsed time against the pace setting, processes one queue operation per tick. When the queue drops below 10 items, it fires off another inference request.

Words grow in via CSS transition (max-width 0→25ch, opacity 0→1). Words shrink out via the same transition in reverse. Both use `--anim-duration` CSS variable driven by the slider.

Slider range: 15s per word (left) to 0.3s per word (right).

### fonts

Switched from IBM Plex Mono (hard to read at length) to **Crimson Pro** (serif, for the stream text) and **Inter** (sans, for UI chrome). The serif feels more like reading a book dissolving.

### what's next

- Debug/polish the visual animation — grow-in still glitchy sometimes
- Color/opacity shifts based on word age
- Image generation from the stream (API, not local)
- Multiple streams / split consciousness
- Thinking-block mode (qwen3 internal monologue)
- Canvas renderer if CSS transitions keep being unreliable

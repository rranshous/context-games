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

### canvas renderer

CSS transitions were unreliable — `inline-block` overflow, reflow tricks, animation timing mismatches between grow and shrink. Ripped out all DOM word elements and switched to a canvas renderer.

Each display word is a JS object: `{ id, text, fullWidth, currentWidth, targetWidth, opacity, targetOpacity, dying, age }`. The rAF loop lerps `currentWidth` and `opacity` toward their targets every frame. Lerp rate is tied to the pace slider — slower pace = slower crawl.

Growing in: `targetWidth = fullWidth`, `targetOpacity = 1`. Shrinking out: `targetWidth = 0`, `targetOpacity = 0`. Same math, same speed, perfectly symmetric.

Text is clipped to its `currentWidth` via `ctx.clip()` — you see the word revealed letter by letter as it grows. Words below 2px width are skipped entirely in layout to prevent a visible "jolt" when they first appear.

Lines flow left-to-right with word wrap at 800px max width, centered horizontally and vertically on the canvas. Color lerps from accent blue to dim grey based on age.

### the jolt bug

Spent a while chasing a visual "jolt" when words appeared or finished growing. Tried:
1. Snap-to-target when close (thought it was lerp asymptote jitter) — nope
2. Skip words below 2px threshold — nope, the threshold itself caused a jump
3. Scale the gap proportionally to word growth — nope, still jolting

The actual fix was embarrassingly simple: bake the space into the word. Instead of rendering "hello" + 12px gap, render "hello " as one unit. The space grows and shrinks with the word. No separate gap math, no edge cases, no jolts. The gap IS the word.

**Lesson**: when you're fighting layout math, stop doing layout math.

## session 2 — 2026-04-19

### batched animations

Previously, a single inference turn would queue up ~13 individual ops (8 adds, 5 removes) and the tick loop would process one per pace interval. Visually: dribs and drabs, never felt like a coherent moment.

Switched to **batched ops** — each turn's changes (removes + adds) are a single batch, applied simultaneously when consumed. Old words start shrinking at the exact moment new words start growing. Feels like a breath rather than a drip.

Order inside the batch: removes first, then adds. The model sees the freshly-decayed buffer when it generates the next turn.

### two sliders

Split pacing into two knobs:
- **anim**: how long the grow/shrink animation takes (0.3s → 15s)
- **wait**: pause after animation before the next batch (0.6s → 120s, exponential curve so middle = ~8s)

Total cycle time = anim + wait. Inference is triggered the moment a batch is consumed, so it runs during the anim+wait window. No pre-buffering.

### UI drives inference

Before: server generated ahead, UI tried to keep up.
Then: UI had a `QUEUE_REFILL` threshold that pre-fetched.
Now: inference fires exactly once per batch consumption. The UI is the clock.

Result: pause the animation, and the next inference only starts once the current batch is consumed. The whole thing breathes at the user's chosen pace.

### UI rearrange

Moved all controls to the header, deleted the footer. Firefox was mysteriously not showing the footer sliders (possibly cache, possibly something else) so consolidating eliminated the issue and the layout is simpler.

### what's next

- Image generation from the stream (API, not local)
- Multiple streams / split consciousness
- Thinking-block mode (qwen3 internal monologue)
- Visual experiments: word physics (drift, gravity), color from content sentiment
- Ambient/installation mode (hide all chrome)

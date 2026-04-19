# waves against the sound of waves — journal

## session 1 — 2026-04-18

### what is this

An art experiment. A small local model (qwen3:1.7b via ollama) runs in a continuous stream of consciousness — its output feeds back as its next input, rolling window style. A web interface renders the flowing text.

The idea: let a mind think out loud forever, watching what emerges when there's no task, no user, no goal — just a seed and momentum.

### what got built

- **server.js** — Node.js, no dependencies. Talks to ollama's `/api/generate` endpoint with streaming. Manages a rolling context buffer (~2048 tokens), trims from the front at sentence boundaries. SSE pushes tokens to the browser in real time.
- **index.html** — Dark, warm UI. IBM Plex Mono. Tokens fade in as they arrive. Seed text shows in muted mauve. Auto-scrolls but respects manual scroll-up.
- **8 seed prompts** — ocean, dream, machine, forest, mirror, silence, memory, body. Each opens a different texture of thought. Custom seeds supported too.

### architecture

Dead simple loop:
1. Seed prompt → ollama → stream tokens to browser
2. Accumulate output into buffer
3. When turn ends (max 256 tokens), feed full buffer back as next prompt
4. Trim buffer when it exceeds window size
5. Repeat forever

No natural pause detection, no turn boundaries visible to the viewer — just continuous flow.

### tuning knobs

All via env vars: `MODEL`, `CONTEXT_WINDOW` (default 2048), `MAX_TOKENS` (default 256), `PORT` (default 3737).

Temperature 0.9, top_p 0.95, repeat_penalty 1.15 — warm and varied but not chaotic.

### what's next

- UI iterations once the stream feels right — color shifts, typography play, maybe the text itself influences the visual atmosphere
- Image generation from the stream (needs an API, local hardware can't handle it)
- Multiple streams / split consciousness?

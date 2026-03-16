# OpenRouter BYOK Support

## Problem

Right now, inference is server-operator-only: the platform owner sets `ANTHROPIC_API_KEY` in `.env` and all games use that single key. If a player has their own OpenRouter key, there's no way to use it — and we don't want every game implementing its own key management.

## Idea

Support "bring your own key" (BYOK) for OpenRouter at the platform level. A user can paste in their OpenRouter API key, and any game that makes inference calls through the platform proxy Just Works — no game-side changes needed.

## Why OpenRouter

- OpenRouter is OpenAI-compatible, proxies to dozens of models (Claude, GPT, Gemini, Llama, etc.)
- One key = access to everything. Users pick their own models and pay their own usage.
- Already using it for Bloom (funded account, `sk-or-v1-...` key).

## Design Sketch

### User-side
- New field in user profile / admin panel: "OpenRouter API Key" (stored per-user in DB)
- Key is stored encrypted or at least not in plaintext
- User can clear their key anytime

### Platform-side
- New route: `POST /api/inference/openrouter/chat/completions` (OpenAI-compatible)
- Uses the requesting user's stored OpenRouter key (not a server-wide key)
- Same auth + token-limit middleware as existing routes
- Token usage logged under `backend: 'openrouter'`
- If user has no key set, return 400 with clear error

### Game-side
- Games already call the platform proxy — they'd just target the openrouter endpoint instead of (or in addition to) the anthropic one
- Could also auto-detect: if game requests a non-Anthropic model, route through OpenRouter if user has a key
- Alternatively: unified `/api/inference/chat` endpoint that picks the right backend based on model name

## Open Questions

- Should the server-operator also be able to set a shared OpenRouter key (like the current Anthropic key)?
- Should games be able to pass a model preference and have the platform figure out which backend to use?
- How to handle the OpenAI-format ↔ Anthropic-format translation? (Games currently use Anthropic message format. OpenRouter uses OpenAI format. Platform could translate, or games could send the right format per endpoint.)
- Rate limiting per-user when they're using their own key — platform's problem or user's problem?

## Non-Goals

- Not adding OpenRouter key handling to individual games — that's the whole point
- Not replacing the server Anthropic key — that stays for the operator's own use

# Vanilla Platform Guide

How to develop and host oneshot-climb using the vanilla platform.

## Development Setup

```bash
# From repo root
cd platforms/vanilla
npm install
cp .env.example .env  # Add ANTHROPIC_API_KEY and SESSION_SECRET
npm run dev
```

Access the game at: `http://localhost:3000/dev/oneshot-climb/index.html`

## Inference API

The platform proxies AI requests so games never expose API keys.

### Claude (Anthropic)

```javascript
async function askClaude(prompt, systemPrompt = '') {
  const messages = [{ role: 'user', content: prompt }];
  const body = {
    messages,
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1000
  };
  if (systemPrompt) body.system = systemPrompt;

  const res = await fetch('/api/inference/anthropic/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error((await res.json()).error);
  const data = await res.json();
  return data.content[0].text;
}
```

### Ollama (Local, Free)

```javascript
async function askOllama(prompt, model = 'qwen3:0.6b') {
  const res = await fetch('/api/inference/ollama/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      model,
      stream: false
    })
  });

  if (!res.ok) throw new Error((await res.json()).error);
  const data = await res.json();
  return data.message.content;
}
```

### Available Models

**Claude:** `claude-sonnet-4-5-20250929`, `claude-haiku-4-5-20251001`
**Ollama:** Check `/api/inference/ollama/models`

## Authentication

Users must be logged in to use inference. Check auth status:

```javascript
async function checkAuth() {
  const res = await fetch('/auth/me', { credentials: 'include' });
  if (!res.ok) {
    window.location.href = '/login.html';
    return null;
  }
  return (await res.json()).user;
}
```

## Key Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/auth/me` | GET | Check login status |
| `/api/inference/anthropic/messages` | POST | Call Claude |
| `/api/inference/ollama/chat` | POST | Call Ollama |
| `/api/inference/ollama/models` | GET | List local models |
| `/api/inference/usage` | GET | Check token usage |

## Tips

- **Use Ollama for dev** - Free, fast, no token limits
- **Use Claude for quality** - Better responses for production/playtesting
- **Always include `credentials: 'include'`** - Required for session auth
- **Handle errors** - Token limits, auth failures, API errors

## Publishing

When ready to publish:
1. Login at `http://localhost:3000/login.html`
2. Go to `/manage.html`
3. Upload `index.html` with game name

## Reference

Full platform docs: [platforms/vanilla/README.md](../../../platforms/vanilla/README.md)

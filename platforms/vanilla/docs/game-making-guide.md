# Game Making Guide for Vanilla Platform

## Overview

Build HTML5 games that can use AI inference (Claude/Ollama) through the platform's secure proxy. No API keys in your game code!

## Development Workflow

### 1. Create your game in `games/` directory
```
games/
└── my-game/
    ├── index.html
    └── assets/
```

### 2. Start Vanilla Platform
```bash
cd platforms/vanilla
npm run dev
```

### 3. Access your game via dev route
```
http://localhost:3000/dev/my-game/index.html
```

Your game has full access to auth and inference APIs while developing!

### 4. Publish when ready
Upload via the web UI at `http://localhost:3000` or copy to `public/`

## Quick Start Template

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>My Game</title>
    <style>
        body { font-family: sans-serif; padding: 20px; }
    </style>
</head>
<body>
    <h1>My Game</h1>
    <div id="game"></div>
    
    <script>
        // Check if user is logged in
        async function checkAuth() {
            const res = await fetch('/auth/me', { credentials: 'include' });
            if (!res.ok) {
                alert('Please login first');
                window.location.href = '/';
                return null;
            }
            return (await res.json()).user;
        }

        // Call Claude
        async function askClaude(prompt) {
            const res = await fetch('/api/inference/anthropic/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    messages: [{ role: 'user', content: prompt }],
                    model: 'claude-3-5-sonnet-20241022',
                    max_tokens: 1000
                })
            });
            if (!res.ok) throw new Error((await res.json()).error);
            const data = await res.json();
            return data.content[0].text;
        }

        // Call Ollama (local, free)
        async function askOllama(prompt, model = 'qwen3:0.6b') {
            const res = await fetch('/api/inference/ollama/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    messages: [{ role: 'user', content: prompt }],
                    model: model,
                    stream: false
                })
            });
            if (!res.ok) throw new Error((await res.json()).error);
            const data = await res.json();
            return data.message.content;
        }

        // Your game code here
        async function init() {
            const user = await checkAuth();
            if (!user) return;
            
            document.getElementById('game').innerHTML = `
                <p>Welcome ${user.username}!</p>
                <button onclick="testAI()">Test AI</button>
                <div id="output"></div>
            `;
        }

        async function testAI() {
            document.getElementById('output').textContent = 'Thinking...';
            try {
                const response = await askClaude('Say hello in a fun way!');
                document.getElementById('output').textContent = response;
            } catch (e) {
                document.getElementById('output').textContent = 'Error: ' + e.message;
            }
        }

        init();
    </script>
</body>
</html>
```

## Key APIs

### Authentication
```javascript
// Check login status
GET /auth/me  →  { user: { username, is_admin } }
```

### AI Inference
```javascript
// Claude (cloud, paid, smart)
POST /api/inference/anthropic/messages
Body: { messages: [{role, content}], model, max_tokens }

// Ollama (local, free, fast)
POST /api/inference/ollama/chat  
Body: { messages: [{role, content}], model, stream: false }

// List available Ollama models
GET /api/inference/ollama/models

// Check your token usage
GET /api/inference/usage
```

## Publishing Your Game

### Option 1: Upload via Web UI
1. Go to `http://localhost:3000`
2. Login
3. Fill in game name, select your HTML file
4. Click Upload

### Option 2: Direct File Copy
Copy your `game.html` to `platforms/vanilla/public/` and access at `/game.html`

## Tips

- **Auth first**: Always check `/auth/me` before using inference
- **Handle errors**: Token limits, API failures, etc.
- **Use Ollama for dev**: Free and fast for testing
- **Use Claude for prod**: Better quality responses
- **Single HTML file**: Keep it simple, embed CSS/JS inline
- **credentials: 'include'**: Required on all fetch calls for session auth

## Error Handling

```javascript
async function safeAskClaude(prompt) {
    try {
        return await askClaude(prompt);
    } catch (e) {
        if (e.message.includes('Token limit')) {
            return "You've used all your tokens!";
        }
        if (e.message.includes('401')) {
            window.location.href = '/';
            return null;
        }
        return "AI error: " + e.message;
    }
}
```

## Available Models

**Anthropic:**
- `claude-sonnet-4-5-20250929` (recommended)
- `claude-haiku-4-5-20251001` (faster, cheaper)

**Ollama (depends on local install):**
- Check `/api/inference/ollama/models` for available models

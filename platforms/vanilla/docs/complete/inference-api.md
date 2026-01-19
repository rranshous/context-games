# Inference API Documentation

## Overview
The Vanilla Game Platform provides inference API endpoints that allow games to call AI models without exposing API keys. All endpoints require authentication.

## Authentication

Games inherit the session from the parent platform. Users must be logged in to use inference features.

### Check Authentication
```javascript
const response = await fetch('/auth/me', { credentials: 'include' });
const { user } = await response.json();
console.log(`Logged in as: ${user.username}`);
```

## Anthropic API (Claude)

### POST /api/inference/anthropic/messages

Call Claude models (claude-3-5-sonnet, claude-3-haiku, etc.)

**Request:**
```javascript
const response = await fetch('/api/inference/anthropic/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    messages: [
      { role: 'user', content: 'Hello, how are you?' }
    ],
    model: 'claude-3-5-sonnet-20241022',  // or claude-3-haiku-20240307
    max_tokens: 1024
  })
});

const data = await response.json();
console.log(data.content[0].text);
```

**Response:**
```json
{
  "id": "msg_abc123",
  "model": "claude-3-5-sonnet-20241022",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "Hello! I'm doing well, thank you for asking..."
    }
  ],
  "usage": {
    "input_tokens": 12,
    "output_tokens": 25
  }
}
```

**Streaming:**
```javascript
const response = await fetch('/api/inference/anthropic/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Tell me a story' }],
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    stream: true  // Enable streaming
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      
      const event = JSON.parse(data);
      if (event.type === 'text') {
        console.log(event.text);  // Stream text as it arrives
      }
    }
  }
}
```

## Ollama API (Local Models)

### POST /api/inference/ollama/chat

Call locally-hosted Ollama models.

**Request:**
```javascript
const response = await fetch('/api/inference/ollama/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    messages: [
      { role: 'user', content: 'What is 2+2?' }
    ],
    model: 'qwen3:0.6b',  // Use available model
    stream: false
  })
});

const data = await response.json();
console.log(data.message.content);
```

**Response:**
```json
{
  "model": "qwen3:0.6b",
  "message": {
    "role": "assistant",
    "content": "2+2 equals 4."
  },
  "done": true,
  "estimated_tokens": {
    "prompt_tokens": 8,
    "completion_tokens": 12,
    "total_tokens": 20
  }
}
```

### GET /api/inference/ollama/models

List available Ollama models.

**Request:**
```javascript
const response = await fetch('/api/inference/ollama/models', {
  credentials: 'include'
});
const { models } = await response.json();
console.log(models.map(m => m.name));
```

**Response:**
```json
{
  "models": [
    {
      "name": "qwen3:0.6b",
      "size": 522653767,
      "parameter_size": "751.63M"
    },
    {
      "name": "qwen3:1.7b",
      "size": 1359293444,
      "parameter_size": "2.0B"
    }
  ]
}
```

## Usage Tracking

### GET /api/inference/usage

Get current user's token usage.

**Request:**
```javascript
const response = await fetch('/api/inference/usage', {
  credentials: 'include'
});
const data = await response.json();
console.log(`Total tokens used: ${data.total_tokens}`);
```

**Response:**
```json
{
  "total_tokens": 246,
  "usage_history": [
    {
      "backend": "ollama",
      "model": "qwen3:0.6b",
      "prompt_tokens": 12,
      "completion_tokens": 205,
      "total_tokens": 217,
      "timestamp": "2025-10-06T00:15:56.199Z"
    },
    {
      "backend": "anthropic",
      "model": "claude-3-5-sonnet-20241022",
      "prompt_tokens": 20,
      "completion_tokens": 9,
      "total_tokens": 29,
      "timestamp": "2025-10-05T21:42:29.218Z"
    }
  ]
}
```

### GET /api/inference/usage/stats

Get usage statistics breakdown.

**Response:**
```json
{
  "total_tokens": 246,
  "by_backend": {
    "anthropic": 29,
    "ollama": 217
  },
  "by_model": {
    "claude-3-5-sonnet-20241022": 29,
    "qwen3:0.6b": 217
  },
  "entry_count": 2
}
```

## Error Handling

All endpoints return standard error responses:

```json
{
  "error": "Token limit exceeded",
  "used": 10500,
  "limit": 10000
}
```

**Common Error Codes:**
- `401` - Not authenticated (need to login)
- `403` - Account deactivated or not authorized
- `429` - Token limit exceeded
- `500` - Inference API error

## Example Game Integration

```javascript
class AIGame {
  async init() {
    // Check auth
    const authCheck = await fetch('/auth/me', { credentials: 'include' });
    if (!authCheck.ok) {
      alert('Please login first!');
      window.location.href = '/';
      return;
    }
    
    // Check available models
    const models = await fetch('/api/inference/ollama/models', {
      credentials: 'include'
    });
    const { models: availableModels } = await models.json();
    console.log('Available models:', availableModels);
  }
  
  async askAI(question) {
    try {
      const response = await fetch('/api/inference/anthropic/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messages: [{ role: 'user', content: question }],
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 500
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        if (error.error === 'Token limit exceeded') {
          alert('You have reached your token limit!');
          return null;
        }
        throw new Error(error.error);
      }
      
      const data = await response.json();
      return data.content[0].text;
    } catch (error) {
      console.error('AI error:', error);
      return null;
    }
  }
  
  async checkUsage() {
    const response = await fetch('/api/inference/usage', {
      credentials: 'include'
    });
    const data = await response.json();
    console.log(`Tokens used: ${data.total_tokens}`);
    return data;
  }
}
```

## Rate Limits

- Token limits are set per-user by the administrator
- Check `/api/inference/usage` to see your current usage
- The platform tracks tokens for both Anthropic and Ollama
- Ollama tokens are estimated (~4 chars per token)

## Best Practices

1. **Check authentication first** - Always verify the user is logged in
2. **Handle errors gracefully** - Show user-friendly messages
3. **Monitor usage** - Display token usage to users
4. **Use appropriate models** - Choose between Anthropic (accurate) and Ollama (free/fast)
5. **Stream for better UX** - Use streaming for long responses
6. **Set reasonable max_tokens** - Don't request more tokens than needed

## Support

For issues or questions, contact the platform administrator.

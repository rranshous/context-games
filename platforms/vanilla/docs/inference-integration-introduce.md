# Inference Integration - Introduce Phase

## Overview
Add AI inference capabilities to the Vanilla Game Platform to enable HTML5 games that use AI/LLM features.

## Context
We have a working platform that hosts HTML5 games. Now we want to enable games that need AI inference by:
1. Providing proxy endpoints that games can call
2. Supporting both local Ollama (CPU) and Anthropic API backends
3. Adding simple user management for access control
4. Tracking token usage per user with limits

## User Story
As a game developer, I want to create HTML5 games that use AI inference without embedding API keys in client code, so that:
- Games can access AI features securely
- Token usage is tracked and limited per user
- I can share games with friends who have their own accounts

## Requirements

### 1. Inference Proxy System
- **Session-based proxy endpoints** - Each user session gets isolated inference access
- **Multi-backend support** - Toggle between Ollama (local) and Anthropic APIs
- **Streaming support** - Real-time token streaming for better UX
- **Error handling** - Graceful failures with meaningful messages

### 2. User Management
- **Simple authentication** - Login/logout with username/password
- **Off-the-shelf library** - Use existing auth solution (Passport.js or similar)
- **Friend invites** - Easy way to create accounts for friends
- **Session management** - Track active user sessions

### 3. Token Usage Tracking
- **Per-user token counting** - Track tokens consumed by each user
- **Usage limits** - Configurable max tokens per user/per day
- **Usage dashboard** - View current usage and limits
- **Cost estimation** - Approximate cost based on API pricing

### 4. Technical Architecture

#### Inference Endpoints
```
POST /api/inference/chat
  - Body: { messages: [...], model: "claude-3-5-sonnet", stream: true }
  - Headers: Authorization: Bearer <session-token>
  - Response: Streamed text or JSON response

GET /api/inference/models
  - Lists available models (Ollama or Anthropic)

GET /api/inference/usage
  - Returns current user's token usage stats
```

#### Backend Configuration
```typescript
interface InferenceConfig {
  backend: 'ollama' | 'anthropic';
  ollamaUrl?: string;  // e.g., 'http://localhost:11434'
  anthropicApiKey?: string;
  maxTokensPerUser?: number;
  maxTokensPerDay?: number;
}
```

### 5. Libraries to Consider

#### Authentication
- **Passport.js** - Mature, well-documented, supports local strategy
- **express-session** - Session management
- **bcrypt** - Password hashing
- **jsonwebtoken** - Alternative JWT-based auth

#### Database (for users & usage)
- **SQLite** - Simple file-based DB, perfect for personal use
- **better-sqlite3** - Synchronous SQLite, fast and simple
- **Sequelize** or **TypeORM** - ORM layer (optional)

#### Inference Clients
- **ollama-js** - Official Ollama JavaScript client
- **@anthropic-ai/sdk** - Official Anthropic SDK
- Both support streaming!

### 6. Data Models

#### User
```typescript
interface User {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: Date;
  isActive: boolean;
  tokenLimit: number;  // Max tokens allowed
  dailyTokenLimit: number;
}
```

#### TokenUsage
```typescript
interface TokenUsage {
  id: string;
  userId: string;
  timestamp: Date;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;  // Estimated cost in USD
}
```

#### Session
```typescript
interface Session {
  sessionId: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
}
```

## Game Integration Pattern

Games would use the inference API like this:

```javascript
// In an HTML5 game
async function askAI(prompt) {
  const response = await fetch('/api/inference/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`
    },
    body: JSON.stringify({
      messages: [
        { role: 'user', content: prompt }
      ],
      model: 'claude-3-5-sonnet-20241022',
      stream: false
    })
  });
  
  const data = await response.json();
  return data.content;
}
```

## Security Considerations

1. **API Keys** - Never exposed to client, stored in server environment
2. **Rate Limiting** - Prevent abuse with request rate limits
3. **Token Limits** - Hard caps on token usage
4. **Session Expiration** - Auto-logout after inactivity
5. **HTTPS** - Required for production (API keys over network)

## Benefits

### For You (Platform Owner)
- Control over API costs
- Visibility into usage patterns
- Easy friend access management
- Flexible backend switching

### For Game Developers
- No API key management in games
- Simple HTTP API
- Streaming support for better UX
- Usage visibility

### For Players/Users
- Secure access to AI features
- Usage transparency
- Fair resource limits

## Open Questions

1. **User limits** - What's a reasonable default token limit?
2. **Cost sharing** - Should users eventually pay their own API costs?
3. **Model selection** - Should users choose models or games decide?
4. **Admin interface** - Do we need a UI for user management?
5. **Multi-tenancy** - Do we need to isolate games from each other?

## Next Steps
→ Move to **Plan Phase** to break down implementation tasks

---

**Phase**: Introduce  
**Date**: October 5, 2025  
**Status**: Ready for Planning

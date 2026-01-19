# Inference Integration - Plan Phase

## Decisions from Introduce Phase

### Open Questions - ANSWERED
1. **Token limits** - TBD after testing with real games
2. **Model selection** - Games specify model via API choice
3. **Admin UI** - YES, need web interface for user management
4. **Cost tracking** - Track tokens only (no USD cost calculation yet)
5. **Backend selection** - Games choose by calling specific endpoints:
   - `/api/inference/anthropic/*` - Routes to Anthropic API
   - `/api/inference/ollama/*` - Routes to local Ollama

### Key Principles
- **Speed over perfection** - Exploratory work, iterate fast
- **Use libraries liberally** - Don't reinvent the wheel
- **Single backend** - Keep architecture simple for operations
- **Game-driven routing** - Games choose backend by URL path

## Implementation Plan

### Phase 1: Database & User Management (Foundation)
**Goal**: Get user authentication working

#### Tasks
1. **Setup SQLite database**
   - Install `better-sqlite3`
   - Create schema for users, sessions, token_usage tables
   - Write migration/init script

2. **User authentication system**
   - Install `passport`, `express-session`, `bcrypt`
   - Create `/auth/login` and `/auth/logout` endpoints
   - Session-based authentication (cookies)

3. **Basic user management**
   - Create seed admin user (you)
   - Add `/auth/register` endpoint for creating new users
   - Password hashing with bcrypt

**Deliverable**: Can login/logout, create users

### Phase 2: Token Usage Tracking
**Goal**: Track and store inference API usage

#### Tasks
1. **Token usage model**
   - Table: user_id, timestamp, model, prompt_tokens, completion_tokens, total_tokens
   - Insert function for logging usage
   - Query function for user stats

2. **Usage middleware**
   - Middleware to capture token counts from responses
   - Store in database after each inference call

3. **Usage limits checking**
   - Check user limits before allowing inference requests
   - Return 429 Too Many Requests if over limit
   - Configurable limits per user

**Deliverable**: Token usage tracked and enforced

### Phase 3: Inference Proxy - Anthropic
**Goal**: Proxy requests to Anthropic API

#### Tasks
1. **Install Anthropic SDK**
   - `npm install @anthropic-ai/sdk`
   - Load API key from environment variable

2. **Create proxy endpoints**
   - `POST /api/inference/anthropic/messages` - Proxies to Claude API
   - Support streaming and non-streaming
   - Pass through model selection from game

3. **Request/response transformation**
   - Extract token counts from Anthropic responses
   - Log usage to database
   - Return formatted response to game

**Deliverable**: Games can call Claude via proxy

### Phase 4: Inference Proxy - Ollama
**Goal**: Proxy requests to local Ollama server

#### Tasks
1. **Install Ollama client**
   - `npm install ollama`
   - Configure Ollama URL (default: http://localhost:11434)

2. **Create proxy endpoints**
   - `POST /api/inference/ollama/chat` - Proxies to Ollama
   - Support streaming
   - Handle different model names

3. **Token counting for Ollama**
   - Ollama doesn't provide token counts
   - Use approximate counting (chars / 4) or tiktoken library
   - Log estimated usage

**Deliverable**: Games can call Ollama via proxy

### Phase 5: Admin UI
**Goal**: Web interface for user management

#### Tasks
1. **Admin authentication**
   - Add `isAdmin` flag to users table
   - Admin-only middleware for protected routes

2. **Admin dashboard page**
   - `/admin` - List all users with stats
   - Show: username, created date, total tokens used, is active

3. **User management actions**
   - Create new user (username, password, token limit)
   - Deactivate/activate users
   - Update token limits
   - View per-user usage history

4. **Usage statistics**
   - Total tokens by user
   - Total tokens by model/backend
   - Recent activity log

**Deliverable**: Admin can manage users via web UI

### Phase 6: Game Integration & Testing
**Goal**: Verify with real game

#### Tasks
1. **Update game upload UI**
   - Add note about inference API availability
   - Link to API documentation

2. **Create API documentation**
   - Document inference endpoints
   - Example code for games
   - Authentication flow

3. **Test game**
   - Create simple test HTML page that calls inference
   - Upload and verify it works
   - Test both Anthropic and Ollama backends

**Deliverable**: Working end-to-end inference in a game

## Technical Architecture

### Directory Structure
```
platforms/vanilla/
├── src/
│   ├── server.ts              # Main server (existing)
│   ├── db/
│   │   ├── schema.ts          # Database schema
│   │   ├── migrations.ts      # Init/migration scripts
│   │   └── queries.ts         # Database query functions
│   ├── auth/
│   │   ├── passport.ts        # Passport configuration
│   │   ├── middleware.ts      # Auth middleware
│   │   └── routes.ts          # Login/logout/register routes
│   ├── inference/
│   │   ├── anthropic.ts       # Anthropic proxy logic
│   │   ├── ollama.ts          # Ollama proxy logic
│   │   ├── middleware.ts      # Usage tracking, limits
│   │   └── routes.ts          # Inference API routes
│   └── admin/
│       ├── routes.ts          # Admin API routes
│       └── views.ts           # Admin UI endpoints
├── public/
│   ├── index.html             # Game browser (existing)
│   ├── login.html             # Login page
│   └── admin.html             # Admin dashboard
├── vanilla.db                 # SQLite database (created at runtime)
└── package.json
```

### Database Schema

```sql
-- Users table
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT 0,
  is_active BOOLEAN DEFAULT 1,
  token_limit INTEGER DEFAULT NULL,  -- NULL = no limit
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Sessions table (if using express-session + SQLite store)
CREATE TABLE sessions (
  sid TEXT PRIMARY KEY,
  sess TEXT NOT NULL,
  expire INTEGER NOT NULL
);

-- Token usage table
CREATE TABLE token_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  backend TEXT NOT NULL,  -- 'anthropic' or 'ollama'
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Indexes for performance
CREATE INDEX idx_token_usage_user_id ON token_usage(user_id);
CREATE INDEX idx_token_usage_timestamp ON token_usage(timestamp);
```

### API Endpoints (Complete List)

#### Authentication
- `POST /auth/login` - Login with username/password
- `POST /auth/logout` - Logout current session
- `POST /auth/register` - Register new user (admin-only)
- `GET /auth/me` - Get current user info

#### Inference - Anthropic
- `POST /api/inference/anthropic/messages` - Claude chat completion
  - Body: Standard Anthropic messages format
  - Response: Anthropic response + usage tracking

#### Inference - Ollama
- `POST /api/inference/ollama/chat` - Ollama chat completion
  - Body: Ollama chat format
  - Response: Ollama response + usage tracking

#### Inference - Shared
- `GET /api/inference/usage` - Get current user's token usage
- `GET /api/inference/usage/stats` - Usage statistics (totals, by model, etc.)

#### Admin
- `GET /admin` - Admin dashboard UI
- `GET /admin/api/users` - List all users
- `POST /admin/api/users` - Create new user
- `PUT /admin/api/users/:id` - Update user (limits, active status)
- `GET /admin/api/usage` - System-wide usage stats
- `GET /admin/api/usage/:userId` - Per-user usage history

#### Existing (Game Platform)
- `GET /` - Game browser (now requires login)
- `GET /api/games` - List games
- `POST /api/games` - Upload game
- `GET /games/:id/` - Play game

## Package Dependencies to Add

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.27.0",
    "ollama": "^0.5.0",
    "passport": "^0.7.0",
    "passport-local": "^1.0.0",
    "express-session": "^1.18.0",
    "bcrypt": "^5.1.1",
    "better-sqlite3": "^11.0.0",
    "connect-sqlite3": "^0.9.13",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "@types/passport": "^1.0.16",
    "@types/passport-local": "^1.0.38",
    "@types/express-session": "^1.18.0",
    "@types/bcrypt": "^5.0.2",
    "@types/better-sqlite3": "^7.6.11",
    "@types/uuid": "^10.0.0"
  }
}
```

## Configuration (Environment Variables)

```bash
# .env file
ANTHROPIC_API_KEY=sk-ant-...
OLLAMA_URL=http://localhost:11434
SESSION_SECRET=random-secret-string-here
NODE_ENV=development
PORT=3000
```

## Implementation Order

### Sprint 1 (Core Foundation)
1. Database setup + schema
2. User model + seed admin
3. Authentication (login/logout)
4. Protected routes middleware

**Milestone**: Can login as admin

### Sprint 2 (Inference - Anthropic)
1. Anthropic SDK integration
2. POST /api/inference/anthropic/messages
3. Token usage tracking
4. Usage limits enforcement

**Milestone**: Can call Claude from authenticated session

### Sprint 3 (Inference - Ollama)
1. Ollama client integration
2. POST /api/inference/ollama/chat
3. Token estimation for Ollama
4. Usage tracking for Ollama

**Milestone**: Can call Ollama from authenticated session

### Sprint 4 (Admin UI)
1. Admin dashboard HTML
2. User list + stats
3. Create/edit users
4. View usage history

**Milestone**: Admin can manage users via UI

### Sprint 5 (Polish & Testing)
1. API documentation page
2. Test game with inference
3. Error handling improvements
4. Login UI improvements

**Milestone**: Complete working system

## Success Criteria

✅ Admin can login and access admin panel  
✅ Admin can create users for friends  
✅ Users can login and access game platform  
✅ Games can call Anthropic API via proxy  
✅ Games can call Ollama via proxy  
✅ Token usage is tracked per user  
✅ Token limits are enforced  
✅ Admin can view usage stats  
✅ Admin can adjust user limits  

## Risk Mitigation

### Risk: Token counting inaccuracy (Ollama)
**Mitigation**: Use conservative estimation, adjust as needed

### Risk: Session management complexity
**Mitigation**: Use battle-tested express-session + SQLite store

### Risk: Streaming implementation challenges
**Mitigation**: Start with non-streaming, add streaming as enhancement

### Risk: Performance with SQLite
**Mitigation**: Add indexes, monitor query performance, sufficient for personal use

## Next Steps
→ Review plan with Robby  
→ Get approval to proceed  
→ Move to **Implement Phase** (Sprint 1)

---

**Phase**: Plan  
**Date**: October 5, 2025  
**Status**: Ready for Review

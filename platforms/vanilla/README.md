# Vanilla Game Platform

A simple HTML5 game hosting platform with AI inference capabilities. Upload, manage, and play HTML5 games that can use AI models without exposing API keys.

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment (copy and edit)
cp .env.example .env
# Add your ANTHROPIC_API_KEY and SESSION_SECRET

# Run in development mode (recommended for testing)
npm run dev

# Build for production
npm run build
npm start
```

The platform will start on `http://localhost:3000`

**Default Admin Login:**
- Username: `admin`
- Password: randomly generated on first run (printed to console once — save it!)
- Change password later: `node bin/change-password.js admin <new-password>`

## Features

✨ **Simple & Clean**
- Beautiful, responsive web interface
- Public game browsing for all visitors
- Admin-only game upload via `/manage.html`
- Click to play games in a new tab

🤖 **AI Inference Proxy**
- Secure proxy for Anthropic (Claude) API
- OpenRouter support (access OpenAI, Google, and other models)
- Local model support via Ollama
- Per-user token tracking and limits
- No API keys exposed to client code
- Games can use AI without managing credentials

🔐 **User Management**
- Login page at `/login.html`
- Admin dashboard at `/admin.html`
- Game management at `/manage.html` (admin only)
- Token limit enforcement
- Usage statistics and monitoring

🚀 **Zero Configuration**
- Works out of the box
- SQLite database (no setup needed)
- Automatic metadata tracking
- REST API included

🎮 **Game Development**
- Dev mode: serve games from `games/` directory
- Access dev games at `/dev/game-name/index.html`
- No upload needed during development
- See `docs/game-making-guide.md` for workflow

## Pages

| Page | URL | Access | Purpose |
|------|-----|--------|---------|
| Home | `/` | Public | Browse and play games |
| Login | `/login.html` | Public | User authentication |
| Manage Games | `/manage.html` | Admin | Upload and manage games |
| Admin | `/admin.html` | Admin | User management, stats |
| Test Inference | `/test-inference.html` | Logged in | Test AI APIs |

## How to Use

### Playing Games (Everyone)

1. Visit `http://localhost:3000`
2. Browse the games grid
3. Click any game card to play

### Uploading Games (Admin)

**Via Web UI:**
1. Login at `/login.html` as admin
2. Go to `/manage.html`
3. Fill in game name, select HTML file
4. Click "Upload Game"

**Via CLI:**
```bash
# Single HTML file
node bin/upload-game.js -n "Game Name" game.html

# ZIP file (must contain index.html)
zip -j /tmp/game.zip games/my-game/index.html
node bin/upload-game.js -n "Game Name" /tmp/game.zip
```

Set `VANILLA_URL`, `VANILLA_USERNAME`, `VANILLA_PASSWORD` env vars to customize connection (defaults to localhost:3000, admin).

### Developing Games

1. Create your game in `games/my-game/index.html`
2. Start the platform: `npm run dev`
3. Access at `http://localhost:3000/dev/my-game/index.html`
4. Full access to auth and inference APIs while developing
5. Upload via `/manage.html` when ready to publish

See `docs/game-making-guide.md` for complete guide.

### Admin Dashboard

1. Login as admin at `/login.html`
2. Visit `/admin.html`
3. View usage statistics
4. Create new users
5. Set token limits
6. Manage user accounts

## AI Inference API

Games can call AI models through the platform's proxy without exposing API keys.

### Anthropic (Claude)

```javascript
const response = await fetch('/api/inference/anthropic/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Hello!' }],
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 500
  })
});

const data = await response.json();
console.log(data.content[0].text);
```

### OpenRouter

```javascript
const response = await fetch('/api/inference/openrouter/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Hello!' }],
    model: 'openai/gpt-4o-mini',
    max_tokens: 500
  })
});

const data = await response.json();
console.log(data.choices[0].message.content);
```

### Ollama (Local Models)

```javascript
const response = await fetch('/api/inference/ollama/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Hello!' }],
    model: 'qwen3:0.6b',
    stream: false
  })
});

const data = await response.json();
console.log(data.message.content);
```

See `docs/inference-api.md` for complete documentation.

## API Documentation

The platform provides REST APIs for games and inference:

### `GET /api/games`
List all uploaded games.

**Response:**
```json
{
  "games": [
    {
      "id": "1234567890",
      "name": "My Game",
      "uploadDate": "2025-10-04T12:00:00.000Z",
      "fileName": "game.html",
      "fileType": "text/html"
    }
  ]
}
```

### `POST /api/games`
Upload a new game.

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body:
  - `game` (file): The HTML game file
  - `name` (string): The game name

**Response:**
```json
{
  "success": true,
  "game": {
    "id": "1234567890",
    "name": "My Game",
    "uploadDate": "2025-10-04T12:00:00.000Z",
    "fileName": "game.html",
    "fileType": "text/html"
  }
}
```

### `GET /api/games/:id`
Get metadata for a specific game.

**Response:**
```json
{
  "id": "1234567890",
  "name": "My Game",
  "uploadDate": "2025-10-04T12:00:00.000Z",
  "fileName": "game.html",
  "fileType": "text/html"
}
```

### `GET /games/:id`
Play a game directly. Returns the HTML file.

### Authentication Endpoints

- `POST /auth/login` - Login with username/password
- `POST /auth/logout` - Logout
- `POST /auth/register` - Create new user
- `GET /auth/me` - Get current user info

### Inference Endpoints

- `POST /api/inference/anthropic/messages` - Call Claude models
- `POST /api/inference/openrouter/chat/completions` - Call OpenRouter models (OpenAI-compatible)
- `POST /api/inference/ollama/chat` - Call Ollama models
- `GET /api/inference/ollama/models` - List available Ollama models
- `GET /api/inference/usage` - Get current user's token usage
- `GET /api/inference/usage/stats` - Get usage statistics

### Admin Endpoints (admin only)

- `GET /admin/api/users` - List all users
- `POST /admin/api/users` - Create user
- `PUT /admin/api/users/:id` - Update user (status, limits)
- `GET /admin/api/usage` - System-wide usage stats

## Tech Stack

- **TypeScript** - Type-safe development
- **Express.js** - Web server and REST API
- **SQLite** - Database for users and usage tracking
- **Passport.js** - Authentication
- **Anthropic SDK** - Claude AI integration
- **OpenAI SDK** - OpenRouter integration (OpenAI-compatible API)
- **Ollama** - Local model support
- **Multer** - File upload handling
- **Vanilla JavaScript** - Simple client-side code

## Project Structure

```
platforms/vanilla/
├── src/
│   ├── server.ts          # Express server with REST API
│   ├── db/
│   │   ├── schema.ts      # Database initialization
│   │   └── queries.ts     # User & usage queries
│   ├── auth/
│   │   ├── passport.ts    # Passport configuration
│   │   ├── middleware.ts  # Auth guards
│   │   └── routes.ts      # Login/logout endpoints
│   ├── inference/
│   │   ├── anthropic.ts   # Anthropic proxy
│   │   ├── openrouter.ts  # OpenRouter proxy (OpenAI-compatible)
│   │   ├── ollama.ts      # Ollama proxy
│   │   ├── middleware.ts  # Token limit checks
│   │   └── routes.ts      # Inference endpoints
│   └── admin/
│       └── routes.ts      # Admin API
├── bin/
│   ├── change-password.js # CLI: change user password
│   └── upload-game.js     # CLI: upload games (ZIP or HTML)
├── public/
│   ├── index.html         # Main game browser
│   ├── admin.html         # Admin dashboard
│   └── test-inference.html # Inference API test
├── docs/
│   ├── inference-api.md   # Complete API docs
│   ├── FINAL_SUMMARY.md   # Project overview
│   └── *.md               # IPI documentation
├── games/                 # Uploaded games
├── vanilla.db             # SQLite database
├── sessions.db            # Session storage
├── .env                   # Environment variables
├── package.json
├── tsconfig.json
└── README.md
```

## Environment Variables

Create a `.env` file:

```bash
# Required for Anthropic proxy
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Optional - for OpenRouter proxy
OPENROUTER_API_KEY=sk-or-your-key-here

# Optional - defaults to localhost
OLLAMA_URL=http://localhost:11434

# Required for sessions
SESSION_SECRET=your-random-secret-here

# Optional - defaults to 3000
PORT=3000
```

## Development

The platform uses TypeScript with hot-reloading in development mode:

```bash
npm run dev
```

This uses `tsx watch` to automatically restart the server when you make changes.

## Production Deployment

1. Set up environment variables

2. Build the TypeScript:
```bash
npm run build
```

3. Start the server:
```bash
npm start
```

Or use PM2 for process management:
```bash
pm2 start dist/server.js --name vanilla-games
```

## Documentation

- **`docs/inference-api.md`** - Complete inference API documentation
- **`docs/FINAL_SUMMARY.md`** - Full project overview and architecture
- **`docs/inference-integration-*.md`** - IPI development documentation

## Test Tools

### Test Inference
A simple chat interface for testing Anthropic, OpenRouter, and Ollama backends. Visit `/test-inference.html`.

## Security Notes

- API keys never exposed to client code
- Session-based authentication
- Per-user token limits enforced
- Admin-only routes protected
- Password hashing with bcrypt
- Admin password randomly generated on first run

## License

MIT


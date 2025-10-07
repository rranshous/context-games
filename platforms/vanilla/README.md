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
- Password: `admin123`
- ⚠️ **Change this immediately after first login!**

## Features

✨ **Simple & Clean**
- Beautiful, responsive web interface
- Upload HTML5 games via drag-and-drop form
- Browse all your games in a grid layout
- Click to play games in a new tab

🤖 **AI Inference Proxy**
- Secure proxy for Anthropic (Claude) API
- Local model support via Ollama
- Per-user token tracking and limits
- No API keys exposed to client code
- Games can use AI without managing credentials

🔐 **User Management**
- Passport.js authentication
- Admin dashboard at `/admin.html`
- User creation and management
- Token limit enforcement
- Usage statistics and monitoring

🚀 **Zero Configuration**
- Works out of the box
- SQLite database (no setup needed)
- Automatic metadata tracking
- REST API included

🎮 **Game Support**
- Single HTML file games
- Self-contained HTML5 games
- Games with embedded assets
- AI-powered games (see Sacred Scribe example)

## How to Use

### Uploading a Game

1. Open `http://localhost:3000` in your browser
2. Fill in the game name
3. Select your HTML game file
4. Click "Upload Game"
5. Done! Your game appears in the grid below

### Playing a Game

1. Browse the games grid on the homepage
2. Click any game card
3. The game opens in a new tab
4. Play!

### Admin Dashboard

1. Login as admin
2. Visit `/admin.html`
3. View usage statistics
4. Create new users
5. Set token limits
6. Manage user accounts

### Example: Sacred Scribe

Visit `/sacred-scribe.html` to play Sacred Scribe - a cult copywriter game that uses AI to evaluate your recruitment advertisements. This demonstrates how games can use the inference API.

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
│   │   ├── ollama.ts      # Ollama proxy
│   │   ├── middleware.ts  # Token limit checks
│   │   └── routes.ts      # Inference endpoints
│   └── admin/
│       └── routes.ts      # Admin API
├── public/
│   ├── index.html         # Main game browser
│   ├── admin.html         # Admin dashboard
│   ├── sacred-scribe.html # Example AI game
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

## Example Games

### Sacred Scribe
A cult copywriter simulator where you write recruitment advertisements and AI evaluates their psychological effectiveness. Visit `/sacred-scribe.html` to play.

### Test Inference
A simple chat interface for testing both Anthropic and Ollama backends. Visit `/test-inference.html`.

## Security Notes

- API keys never exposed to client code
- Session-based authentication
- Per-user token limits enforced
- Admin-only routes protected
- Password hashing with bcrypt
- Default admin password should be changed immediately

## License

MIT


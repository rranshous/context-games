# Vanilla Game Platform

A super simple HTML5 game hosting platform for personal use. Upload, manage, and play HTML5 games with zero fuss.

## Quick Start

```bash
# Install dependencies
npm install

# Run in development mode (recommended for testing)
npm run dev

# Build for production
npm run build
npm start
```

The platform will start on `http://localhost:3000`

Open your browser and visit the URL to see the web interface!

## Features

✨ **Simple & Clean**
- Beautiful, responsive web interface
- Upload HTML5 games via drag-and-drop form
- Browse all your games in a grid layout
- Click to play games in a new tab

🚀 **Zero Configuration**
- Works out of the box
- File-based storage (no database needed)
- Automatic metadata tracking
- REST API included

🎮 **Game Support**
- Single HTML file games
- Self-contained HTML5 games
- Games with embedded assets

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

### Game Requirements

Your HTML game file should be:
- A single `.html` or `.htm` file
- Self-contained (all assets embedded or referenced externally)
- Standard HTML5 format

## API Documentation

The platform provides a REST API for programmatic access:

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

## Tech Stack

- **TypeScript** - Type-safe development
- **Express.js** - Web server and REST API
- **Multer** - File upload handling
- **File-based storage** - No database required
- **Vanilla JavaScript** - Simple client-side code

## Project Structure

```
platforms/vanilla/
├── src/
│   └── server.ts          # Express server with REST API
├── public/
│   └── index.html         # Web interface
├── games/                 # Uploaded games (created at runtime)
│   ├── metadata.json      # Game metadata
│   └── [game-id]/         # Individual game directories
├── uploads/               # Temporary upload directory
├── package.json
├── tsconfig.json
└── README.md
```

## Development

The platform uses TypeScript with hot-reloading in development mode:

```bash
npm run dev
```

This uses `tsx watch` to automatically restart the server when you make changes.

## Production Deployment

1. Build the TypeScript:
```bash
npm run build
```

2. Start the server:
```bash
npm start
```

Or use PM2 or similar for process management:
```bash
pm2 start dist/server.js --name vanilla-games
```

## Future Plans

- Support for zipped game projects with multiple files
- Game categories and tags
- Search and filtering
- Integration with AI inference for dynamic games
- User authentication (optional)
- Game analytics

## License

MIT

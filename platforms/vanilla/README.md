# Vanilla Game Platform

A super simple HTML5 game hosting platform for personal use.

## Quick Start

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
npm start
```

The server will start on `http://localhost:3000`

## Features

- Upload HTML5 games (single HTML files or zipped projects)
- Browse all hosted games
- Play games directly in the browser
- Simple REST API
- File-based storage

## API Endpoints

- `GET /api/games` - List all games
- `POST /api/games` - Upload a new game
- `GET /api/games/:id` - Get game metadata
- `GET /games/:id` - Play a game

## Tech Stack

- TypeScript
- Express.js
- Multer for file uploads
- Simple file-based storage

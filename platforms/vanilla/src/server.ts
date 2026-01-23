import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import AdmZip from 'adm-zip';
import session from 'express-session';
import passport from './auth/passport.js';
import authRoutes from './auth/routes.js';
import inferenceRoutes from './inference/routes.js';
import adminRoutes from './admin/routes.js';
import { initializeDatabase } from './db/schema.js';
import { createUser, getUserByUsername } from './db/queries.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());

// Session middleware (BEFORE passport)
const SQLiteStore = require('connect-sqlite3')(session);
app.use(session({
  store: new SQLiteStore({
    db: 'sessions.db',
    dir: './'
  }),
  secret: process.env.SESSION_SECRET || 'vanilla-game-platform-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    secure: false // Set to true in production with HTTPS
  }
}));

// Passport middleware (AFTER session)
app.use(passport.initialize());
app.use(passport.session());

// Public files
app.use(express.static('public'));

// Auth routes
app.use('/auth', authRoutes);

// Inference routes
app.use('/api/inference', inferenceRoutes);

// Admin routes
app.use('/admin', adminRoutes);

// Dev mode: serve games from workspace for development
// Access games at /dev/game-name/index.html (e.g., /dev/rescue-run/index.html)
// Note: __dirname is dist/ when compiled, so we need to go up 3 levels to reach games/
const DEV_GAMES_DIR = path.join(__dirname, '../../../games');
app.use('/dev', express.static(DEV_GAMES_DIR));
console.log(`🔧 Dev mode enabled: serving games from ${DEV_GAMES_DIR}`);

// Ensure directories exist
const GAMES_DIR = path.join(__dirname, '../games');
const UPLOADS_DIR = path.join(__dirname, '../uploads');

async function ensureDirectories() {
  if (!existsSync(GAMES_DIR)) {
    await fs.mkdir(GAMES_DIR, { recursive: true });
  }
  if (!existsSync(UPLOADS_DIR)) {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  }
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});

const upload = multer({ storage });

// Game metadata interface
interface GameMetadata {
  id: string;
  name: string;
  uploadDate: string;
  fileName: string;
  fileType: string;
  isZip: boolean;
}

// Get metadata file path
const getMetadataPath = () => path.join(GAMES_DIR, 'metadata.json');

// Load all game metadata
async function loadMetadata(): Promise<GameMetadata[]> {
  try {
    const data = await fs.readFile(getMetadataPath(), 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

// Save game metadata
async function saveMetadata(metadata: GameMetadata[]): Promise<void> {
  await fs.writeFile(getMetadataPath(), JSON.stringify(metadata, null, 2));
}

// Routes

// List all games
app.get('/api/games', async (req: Request, res: Response) => {
  try {
    const games = await loadMetadata();
    res.json({ games });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load games' });
  }
});

// Get specific game metadata
app.get('/api/games/:id', async (req: Request, res: Response) => {
  try {
    const games = await loadMetadata();
    const game = games.find((g) => g.id === req.params.id);
    
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    res.json(game);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load game' });
  }
});

// Upload a new game
app.post('/api/games', upload.single('game'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const gameName = req.body.name || req.file.originalname;
    const gameId = Date.now().toString();
    
    // Create game directory
    const gameDir = path.join(GAMES_DIR, gameId);
    await fs.mkdir(gameDir, { recursive: true });
    
    const isZip = req.file.originalname.endsWith('.zip');
    
    if (isZip) {
      // Extract ZIP file (itch.io style)
      try {
        const zip = new AdmZip(req.file.path);
        zip.extractAllTo(gameDir, true);
        
        // Clean up uploaded zip
        await fs.unlink(req.file.path);
        
        // Verify index.html exists
        const indexPath = path.join(gameDir, 'index.html');
        if (!existsSync(indexPath)) {
          await fs.rm(gameDir, { recursive: true });
          return res.status(400).json({ error: 'ZIP must contain index.html at root level' });
        }
      } catch (zipError) {
        console.error('ZIP extraction error:', zipError);
        await fs.rm(gameDir, { recursive: true });
        return res.status(400).json({ error: 'Failed to extract ZIP file' });
      }
    } else {
      // Single HTML file
      const newPath = path.join(gameDir, req.file.originalname);
      await fs.rename(req.file.path, newPath);
    }

    // Create metadata
    const metadata: GameMetadata = {
      id: gameId,
      name: gameName,
      uploadDate: new Date().toISOString(),
      fileName: isZip ? 'index.html' : req.file.originalname,
      fileType: req.file.mimetype,
      isZip: isZip,
    };

    // Save metadata
    const games = await loadMetadata();
    games.push(metadata);
    await saveMetadata(games);

    res.json({ success: true, game: metadata });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload game' });
  }
});

// Delete a game (admin only)
app.delete('/api/games/:id', async (req: Request, res: Response) => {
  try {
    // Check if user is authenticated and is admin
    if (!req.isAuthenticated || !req.isAuthenticated() || !(req.user as any)?.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const gameId = req.params.id;
    const games = await loadMetadata();
    const gameIndex = games.findIndex((g) => g.id === gameId);

    if (gameIndex === -1) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const game = games[gameIndex];

    // Remove game directory
    const gameDir = path.join(GAMES_DIR, gameId);
    if (existsSync(gameDir)) {
      await fs.rm(gameDir, { recursive: true, force: true });
    }

    // Update metadata
    games.splice(gameIndex, 1);
    await saveMetadata(games);

    res.json({ success: true, message: `Game "${game.name}" removed` });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete game' });
  }
});

// Serve game files
app.use('/games/:id', async (req: Request, res: Response, next) => {
  const gameId = req.params.id;
  const gameDir = path.join(GAMES_DIR, gameId);
  
  // Check if game exists
  const games = await loadMetadata();
  const game = games.find((g) => g.id === gameId);
  
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  // Serve the game's index.html or the file itself
  // Decode URL-encoded characters (e.g., %20 -> space) for filesystem access
  const requestedPath = decodeURIComponent(req.path);
  
  if (requestedPath === '' || requestedPath === '/') {
    // Redirect to trailing slash if missing (ensures correct relative path resolution)
    if (requestedPath === '') {
      return res.redirect(`/games/${gameId}/`);
    }
    
    // Serve the main game file
    const gamePath = path.join(gameDir, game.fileName);
    return res.sendFile(gamePath);
  }
  
  // Manually serve files with correct MIME types
  const filePath = path.join(gameDir, requestedPath);
  
  // Check if file exists
  if (!existsSync(filePath)) {
    return res.status(404).send('File not found');
  }
  
  // Set proper MIME type based on extension
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: { [key: string]: string } = {
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.wasm': 'application/wasm',
    '.map': 'application/json',
  };
  
  const mimeType = mimeTypes[ext] || 'application/octet-stream';
  
  // Send file with correct MIME type
  res.type(mimeType);
  res.sendFile(filePath);
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Start server
async function startServer() {
  // Initialize database first
  await initializeDatabase();
  
  // Create default admin user if none exists
  const admin = await getUserByUsername('admin');
  if (!admin) {
    await createUser('admin', 'admin123', true);
    console.log('📝 Created default admin user (username: admin, password: admin123)');
    console.log('⚠️  Please change the password after first login!');
  }
  
  await ensureDirectories();
  
  app.listen(PORT, () => {
    console.log(`🎮 Vanilla Game Platform running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);

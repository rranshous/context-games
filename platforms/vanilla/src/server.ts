import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import AdmZip from 'adm-zip';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

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
  const requestedPath = req.path.replace(`/games/${gameId}`, '');
  
  if (requestedPath === '' || requestedPath === '/') {
    // Serve the main game file
    const gamePath = path.join(gameDir, game.fileName);
    return res.sendFile(gamePath);
  }
  
  // Set proper MIME type for JavaScript modules
  if (requestedPath.endsWith('.js')) {
    res.type('application/javascript');
  } else if (requestedPath.endsWith('.mjs')) {
    res.type('application/javascript');
  } else if (requestedPath.endsWith('.json')) {
    res.type('application/json');
  } else if (requestedPath.endsWith('.css')) {
    res.type('text/css');
  } else if (requestedPath.endsWith('.html')) {
    res.type('text/html');
  }
  
  // Serve static files from game directory
  express.static(gameDir)(req, res, next);
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Start server
async function startServer() {
  await ensureDirectories();
  
  app.listen(PORT, () => {
    console.log(`🎮 Vanilla Game Platform running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);

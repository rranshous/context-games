import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { ChatServer } from './chat.js';
import { ArtifactServer } from './artifacts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', 'data');

const app = express();
app.use(express.json({ limit: '10mb' }));

// --- State ---

let chat: ChatServer;
let artifacts: ArtifactServer;

function load(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  try {
    chat = ChatServer.fromJSON(JSON.parse(readFileSync(join(DATA_DIR, 'chat.json'), 'utf-8')));
  } catch { chat = new ChatServer(); }
  try {
    artifacts = ArtifactServer.fromJSON(JSON.parse(readFileSync(join(DATA_DIR, 'artifacts.json'), 'utf-8')));
  } catch { artifacts = new ArtifactServer(); }
}

function save(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(join(DATA_DIR, 'chat.json'), JSON.stringify(chat.toJSON(), null, 2));
  writeFileSync(join(DATA_DIR, 'artifacts.json'), JSON.stringify(artifacts.toJSON(), null, 2));
}

load();

// --- Chat API ---

app.post('/api/chat', (req, res) => {
  const { handle, text } = req.body;
  if (!handle || !text) { res.status(400).json({ error: 'handle and text required' }); return; }
  const msg = chat.post(handle, text);
  save();
  res.json(msg);
});

app.get('/api/chat', (req, res) => {
  const after = req.query.after as string | undefined;
  if (after) {
    res.json(chat.readAfter(after));
    return;
  }
  const count = parseInt(req.query.count as string) || 50;
  res.json(chat.read(count));
});

// --- Artifacts API ---

app.post('/api/artifacts', (req, res) => {
  const { handle, name, content, type } = req.body;
  if (!handle || !name || content === undefined) { res.status(400).json({ error: 'handle, name, content required' }); return; }
  const meta = artifacts.deliver(handle, name, content, type);
  save();
  res.json(meta);
});

app.get('/api/artifacts', (_req, res) => {
  res.json(artifacts.list());
});

app.get('/api/artifacts/:id', (req, res) => {
  const artifact = artifacts.get(req.params.id);
  if (!artifact) { res.status(404).json({ error: 'not found' }); return; }
  res.json(artifact);
});

// --- UI ---

app.use(express.static(join(__dirname, 'ui')));

// --- Start ---

const PORT = parseInt(process.env.PORT || '4444');
app.listen(PORT, () => {
  console.log(`[frame] http://localhost:${PORT}`);
});

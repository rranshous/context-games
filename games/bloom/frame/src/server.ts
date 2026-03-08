import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { lookup } from 'mime-types';
import { ChatServer } from './chat.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', 'data');
const BLOOM_ROOT = join(__dirname, '..', '..', 'bloom');

const app = express();
app.use(express.json({ limit: '10mb' }));

// --- State ---

let chat: ChatServer;

// Hosted files: paths (relative to BLOOM_ROOT) that bloom has registered for serving
let hostedFiles: string[] = [];

function load(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  try {
    chat = ChatServer.fromJSON(JSON.parse(readFileSync(join(DATA_DIR, 'chat.json'), 'utf-8')));
  } catch { chat = new ChatServer(); }
  try {
    hostedFiles = JSON.parse(readFileSync(join(DATA_DIR, 'hosted.json'), 'utf-8'));
  } catch { hostedFiles = []; }
}

function save(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(join(DATA_DIR, 'chat.json'), JSON.stringify(chat.toJSON(), null, 2));
  writeFileSync(join(DATA_DIR, 'hosted.json'), JSON.stringify(hostedFiles, null, 2));
}

load();

// --- Chat API ---

app.post('/api/chat', (req, res) => {
  const { handle, text } = req.body;
  if (!handle || !text) { res.status(400).json({ error: 'handle and text required' }); return; }
  const msg = chat.post(handle, text);
  save();
  console.log(`[frame] chat ${handle}: "${text.slice(0, 80)}"`);
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

// --- File hosting API ---

app.post('/api/host', (req, res) => {
  const { path: relPath } = req.body;
  if (!relPath) { res.status(400).json({ error: 'path required' }); return; }
  const full = resolve(BLOOM_ROOT, relPath);
  if (!full.startsWith(BLOOM_ROOT + '/')) {
    res.status(403).json({ error: 'path must be within bloom project' });
    return;
  }
  if (!existsSync(full)) { res.status(404).json({ error: `file not found: ${relPath}` }); return; }
  if (!hostedFiles.includes(relPath)) {
    hostedFiles.push(relPath);
    save();
  }
  const port = parseInt(process.env.PORT || '4444');
  const url = `http://localhost:${port}/hosted/${relPath}`;
  console.log(`[frame] hosting: ${relPath} → ${url}`);
  res.json({ url, path: relPath });
});

app.delete('/api/host', (req, res) => {
  const { path: relPath } = req.body;
  if (!relPath) { res.status(400).json({ error: 'path required' }); return; }
  const idx = hostedFiles.indexOf(relPath);
  if (idx === -1) { res.status(404).json({ error: 'not hosted' }); return; }
  hostedFiles.splice(idx, 1);
  save();
  console.log(`[frame] unhosted: ${relPath}`);
  res.json({ ok: true });
});

app.get('/api/host', (_req, res) => {
  res.json(hostedFiles);
});

app.get('/hosted/*', (req, res) => {
  const relPath = req.path.replace('/hosted/', '');
  if (!hostedFiles.includes(relPath)) { res.status(404).send('Not hosted'); return; }
  const full = resolve(BLOOM_ROOT, relPath);
  if (!full.startsWith(BLOOM_ROOT + '/') || !existsSync(full)) {
    res.status(404).send('Not found');
    return;
  }
  const mime = lookup(relPath) || 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  res.send(readFileSync(full));
});

// --- Activity feed (chassis → browser) ---

const activityLog: Array<{ type: string; detail: string; ts: number }> = [];
const MAX_ACTIVITY = 200;

app.post('/api/activity', (req, res) => {
  const { type, detail } = req.body;
  if (!type) { res.status(400).json({ error: 'type required' }); return; }
  activityLog.push({ type, detail: detail || '', ts: Date.now() });
  if (activityLog.length > MAX_ACTIVITY) activityLog.splice(0, activityLog.length - MAX_ACTIVITY);
  res.json({ ok: true });
});

app.get('/api/activity', (req, res) => {
  const after = parseInt(req.query.after as string) || 0;
  res.json(activityLog.filter(e => e.ts > after));
});

// --- Soma API (reads bloom's soma files directly) ---

const SOMA_DIR = join(__dirname, '..', '..', 'bloom', 'soma');
const SOMA_SECTIONS = ['identity.md', 'responsibilities.md', 'memory.md', 'things_noticed.md', 'signal_handler.js', 'recent_actions.md', 'custom_tools.json'];

app.get('/api/soma', (_req, res) => {
  const soma: Record<string, string> = {};
  for (const file of SOMA_SECTIONS) {
    const name = file.replace(/\.\w+$/, '');
    try {
      soma[name] = readFileSync(join(SOMA_DIR, file), 'utf-8');
    } catch { soma[name] = ''; }
  }
  res.json(soma);
});

// --- UI ---

app.use(express.static(join(__dirname, 'ui')));

// --- Start ---

const PORT = parseInt(process.env.PORT || '4444');
app.listen(PORT, () => {
  console.log(`[frame] http://localhost:${PORT}`);
});

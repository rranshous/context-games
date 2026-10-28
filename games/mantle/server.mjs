// Mantle, run locally: Node, files on disk, no dependencies. The API is core.mjs; this
// keeps the files, serves the pages, and listens. (worker.mjs is the hosted twin.)
//
//   node server.mjs [--port 7790]
//
// .env (next to this file), all optional
//   OPENROUTER_API_KEY=...                              lend thinking to commanders who haven't connected their own
//   MANTLE_MODEL=anthropic/claude-sonnet-5.5            the aids' thinking, on the relay
//   MANTLE_ART_MODEL=google/gemini-3.1-flash-lite-image  the units' pictures, on the relay
//   MANTLE_PUBLIC=1                                     lend nothing: everyone connects their own OpenRouter
//
// Data: data/<kind>/<id>.json, one document each (designs, art records, tallies);
// data/pictures/<name>, the pictures; data/log.jsonl, every relayed call with what it cost;
// data/secret, what signs commanders' cookies here.

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCore } from './core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, 'public'), DATA = join(HERE, 'data'), ART = join(DATA, 'pictures');
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const PORT = Number(arg('--port')) || 7790;

loadEnv(join(HERE, '.env'));
mkdirSync(ART, { recursive: true });

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const SECRET = join(DATA, 'secret');
if (!existsSync(SECRET)) writeFileSync(SECRET, randomBytes(32).toString('hex'));

const dir = (kind) => { const d = join(DATA, kind); mkdirSync(d, { recursive: true }); return d; };
const file = (kind, id) => join(dir(kind), `${String(id).replace(/[^a-z0-9.-]/gi, '')}.json`);
const store = {
  async get(kind, id) { const f = file(kind, id); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; },
  async put(kind, id, doc) { writeFileSync(file(kind, id), JSON.stringify(doc, null, 1)); },
  async list(kind) { return readdirSync(dir(kind)).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir(kind), f), 'utf8'))); },
  async remove(kind, id) { rmSync(file(kind, id), { force: true }); },
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml' };
const art = {
  async put(name, bytes) { writeFileSync(join(ART, name), bytes); },
  async get(name) { const f = join(ART, name); return existsSync(f) ? { body: readFileSync(f), type: TYPES[extname(f)] ?? 'application/octet-stream' } : null; },
};

const core = createCore({
  store, art,
  settings: {
    key: process.env.OPENROUTER_API_KEY || '',
    model: process.env.MANTLE_MODEL || 'anthropic/claude-sonnet-5.5',
    artModel: process.env.MANTLE_ART_MODEL || 'google/gemini-3.1-flash-lite-image',
    public: Boolean(process.env.MANTLE_PUBLIC),
    secret: readFileSync(SECRET, 'utf8'),
    artBase: '/art/',
    log: (entry) => appendFileSync(join(DATA, 'log.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`),
  },
});

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/art/')) {
    let body = null;
    if (req.method !== 'GET' && req.method !== 'HEAD') { const chunks = []; for await (const c of req) chunks.push(c); body = Buffer.concat(chunks); }
    const out = await core.handle(new Request(url, { method: req.method, headers: req.headers, body }));
    if (out) {
      res.writeHead(out.status, Object.fromEntries(out.headers));
      return res.end(Buffer.from(await out.arrayBuffer()));
    }
  }
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const path = normalize(join(PUBLIC, rel));
  if (!path.startsWith(PUBLIC) || !existsSync(path)) return res.writeHead(404).end('not here');
  res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-cache' }).end(readFileSync(path));
}).listen(PORT, () => console.log(`Mantle: http://localhost:${PORT}/${process.env.OPENROUTER_API_KEY && !process.env.MANTLE_PUBLIC ? '' : '  (no relay: commanders connect their own OpenRouter)'}`));

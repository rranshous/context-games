// gactant, run locally: Node, files on disk, no dependencies. The API itself is core.mjs;
// this keeps the files, serves the pages, and listens. (worker.mjs is the hosted twin.)
//
//   node server.mjs [--port 7780]
//
// .env (next to this file), all optional
//   OPENROUTER_API_KEY=...        thinking for anyone who hasn't connected their own OpenRouter
//   GACTANT_MODEL=anthropic/claude-sonnet-5.5
//   GACTANT_PUBLIC=1              open to anyone: no listing every ludant, no inference logs
//   GACTANT_SANDBOX=http://127.0.0.1:7780   serve the sandbox from another site, as hosted
//
// Data: data/<kind>/<id>.json, one document each (ludants, published, checkpoints, names),
// and data/log/<who>.jsonl, every inference with image bytes stripped. Reading those logs is
// how Claude sees what a ludant saw and did.

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SANDBOX_POLICY, createCore, safe, sameOrigin } from './core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, 'public');
const DATA = join(HERE, 'data');
const PORT = Number(process.argv[process.argv.indexOf('--port') + 1]) || 7780;

loadEnv(join(HERE, '.env'));
const MODEL = process.env.GACTANT_MODEL || 'anthropic/claude-sonnet-5.5';

for (const d of ['ludants', 'published', 'checkpoints', 'names', 'thumbs', 'reports', 'assets', 'log']) mkdirSync(join(DATA, d), { recursive: true });

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// ---------- the store: one JSON file per document ----------

const file = (kind, id) => join(DATA, kind, `${safe(id)}.json`);
const store = {
  async get(kind, id) { const f = file(kind, id); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; },
  async put(kind, id, doc) { writeFileSync(file(kind, id), JSON.stringify(doc, null, 1)); },
  async remove(kind, id) { rmSync(file(kind, id), { force: true }); },
  async list(kind) {
    return readdirSync(join(DATA, kind)).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(DATA, kind, f), 'utf8')));
  },
};

const core = createCore({
  store,
  settings: {
    model: MODEL,
    key: process.env.OPENROUTER_API_KEY || '',
    public: process.env.GACTANT_PUBLIC === '1',
    adminToken: process.env.GACTANT_ADMIN_TOKEN || '',
    // Where the sandbox page comes from: here (its iframe's origin is opaque anyway), or
    // another site, the way the hosted install uses gactantbox.com (e.g. http://127.0.0.1:7780).
    sandbox: process.env.GACTANT_SANDBOX || '',
    log: (who, record) => appendFileSync(join(DATA, 'log', `${who}.jsonl`), JSON.stringify(record) + '\n'),
    tail: (who, n) => {
      const f = join(DATA, 'log', `${who}.jsonl`);
      return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').slice(-n).map((l) => JSON.parse(l)) : [];
    },
  },
});

// ---------- pages ----------

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };

function serveStatic(path, res) {
  if (path === '/') path = '/index.html';
  const f = normalize(join(PUBLIC, path));
  if (!f.startsWith(PUBLIC) || !existsSync(f)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache',
    // The sandbox's origin is opaque, so its module scripts load cross-origin. These are
    // the platform's public files, so anyone may.
    'Access-Control-Allow-Origin': '*',
    ...(path === '/sandbox.html' ? { 'Content-Security-Policy': SANDBOX_POLICY } : {}),
  });
  res.end(readFileSync(f));
}

const json = (res, code, value) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) return serveStatic(url.pathname, res);
  if (!sameOrigin(req.headers.origin, req.headers.host)) return json(res, 403, { error: 'the API answers only this site\'s own pages' });
  try {
    let body = {};
    if (req.method === 'POST' || req.method === 'PUT') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    }
    json(res, 200, await core.route(req.method, url.pathname.slice(5).split('/').filter(Boolean), body, url.searchParams));
  } catch (err) {
    if (!err.code || err.code >= 500) console.error(`[gactant] ${req.method} ${url.pathname}: ${err.message}`);
    json(res, typeof err.code === 'number' ? err.code : 500, { error: err.message, ...(err.extra ?? {}) });
  }
}).listen(PORT, () => {
  console.log(`gactant on http://lilg:${PORT}/  model ${MODEL}  key ${process.env.OPENROUTER_API_KEY ? 'present' : 'none (people connect their own OpenRouter)'}`);
});

// Mantle, run locally: Node, files on disk, no dependencies. Serves the pages, holds the
// OpenRouter key, and keeps the designs.
//
//   node server.mjs [--port 7790]
//
// .env (next to this file)
//   OPENROUTER_API_KEY=...
//   MANTLE_MODEL=anthropic/claude-sonnet-5.5            the aids' thinking
//   MANTLE_ART_MODEL=google/gemini-3.1-flash-lite-image  the units' pictures
//
// Data: data/designs/<id>.json, one per kept design; data/art/<id>.<ext>, every picture
// drawn; data/log.jsonl, every call, with what it cost.

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, 'public'), DATA = join(HERE, 'data');
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const PORT = Number(arg('--port')) || 7790;

loadEnv(join(HERE, '.env'));
const KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.MANTLE_MODEL || 'anthropic/claude-sonnet-5.5';
const ART_MODEL = process.env.MANTLE_ART_MODEL || 'google/gemini-3.1-flash-lite-image';
if (!KEY) console.warn('no OPENROUTER_API_KEY in .env: the aids can\'t think');

for (const d of ['designs', 'art']) mkdirSync(join(DATA, d), { recursive: true });

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml' };
const safe = (id) => String(id).replace(/[^a-z0-9-]/gi, '').slice(0, 64);
const log = (entry) => appendFileSync(join(DATA, 'log.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);

async function openrouter(body) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json', 'x-title': 'Mantle' },
    body: JSON.stringify(body),
  }).catch((err) => ({ ok: false, status: 599, json: async () => ({ error: { message: err.message } }) }));
  const json = await res.json().catch(() => ({ error: { message: `OpenRouter answered ${res.status}` } }));
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `OpenRouter answered ${res.status}`);
  return json;
}

const routes = {
  // An aid thinks: the page holds the conversation and the tools, the model is ours.
  'POST /api/think': async ({ messages, tools }) => {
    const json = await openrouter({ model: MODEL, messages, tools, max_tokens: 4000 });
    log({ kind: 'think', model: MODEL, usage: json.usage, last: messages.findLast((m) => m.role !== 'system'), reply: json.choices?.[0]?.message });
    return json;
  },
  // A unit's picture, kept on disk.
  'POST /api/art': async ({ prompt }) => {
    const t = Date.now();
    const json = await openrouter({ model: ART_MODEL, modalities: ['image', 'text'], messages: [{ role: 'user', content: prompt }] });
    const url = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url) throw new Error('no picture came back');
    const [, mime, b64] = url.match(/^data:image\/(\w+);base64,(.*)$/s);
    const name = `${randomUUID()}.${mime === 'jpeg' ? 'jpg' : mime}`;
    writeFileSync(join(DATA, 'art', name), Buffer.from(b64, 'base64'));
    log({ kind: 'art', model: ART_MODEL, prompt, seconds: (Date.now() - t) / 1000, cost: json.usage?.cost, art: name });
    return { url: `/art/${name}` };
  },
  'GET /api/designs': async () => readdirSync(join(DATA, 'designs')).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(DATA, 'designs', f), 'utf8'))).sort((a, b) => b.kept.localeCompare(a.kept)),
  'POST /api/designs': async (design) => {
    const id = (design.id && safe(design.id)) || randomUUID();
    const kept = { ...design, id, kept: new Date().toISOString() };
    writeFileSync(join(DATA, 'designs', `${id}.json`), JSON.stringify(kept, null, 1));
    return kept;
  },
  'DELETE /api/designs': async ({ id }) => { rmSync(join(DATA, 'designs', `${safe(id)}.json`), { force: true }); return { ok: true }; },
};

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const route = routes[`${req.method} ${url.pathname}`];
  if (route) {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const out = await route(body ? JSON.parse(body) : {});
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(out));
    } catch (err) {
      console.error(url.pathname, err.message);
      res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: err.message }));
    }
    return;
  }
  const root = url.pathname.startsWith('/art/') ? join(DATA, 'art') : PUBLIC;
  const rel = url.pathname.startsWith('/art/') ? url.pathname.slice(5) : url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const path = normalize(join(root, rel));
  if (!path.startsWith(root) || !existsSync(path)) return res.writeHead(404).end('not here');
  res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-cache' }).end(readFileSync(path));
}).listen(PORT, () => console.log(`Mantle: http://localhost:${PORT}/`));

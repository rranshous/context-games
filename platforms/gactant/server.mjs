// gactant: a platform for game-shaped actants.
//
// The browser window is the frame. This server only keeps things: actants being shaped,
// their checkpoints, releases, and the installs players get. It also relays inference to
// OpenRouter so the key never reaches a page. No dependencies.
//
//   node server.mjs [--port 7780]
//
// .env (next to this file)
//   OPENROUTER_API_KEY=...
//   GACTANT_MODEL=anthropic/claude-sonnet-5.5     optional
//
// Words
//   actant      a soma (its sections) plus the state of the surfaces it lives with
//   checkpoint  a frozen copy of an actant, numbered
//   release     a checkpoint offered to players
//   install     one player's own copy of a release; it drifts toward that player
//
// API (JSON)
//   GET  /api/config                         -> { model, hasKey }
//   GET  /api/actants                        -> [{ id, name, updated, checkpoints }]
//   POST /api/actants        { soma, surfaces } -> { id }
//   GET  /api/actants/<id>                   -> { id, soma, surfaces, fresh, updated }   fresh: never saved since it was seeded
//   PUT  /api/actants/<id>   { soma, surfaces } -> {}
//   POST /api/actants/<id>/checkpoints { label } -> { n }
//   GET  /api/actants/<id>/checkpoints       -> [{ n, label, at }]
//   POST /api/releases       { actant, n, title } -> { id }
//   GET  /api/releases                       -> [{ id, title, actant, n, at, installs }]
//   POST /api/releases/<id>/install          -> { id }     a fresh install for a new player
//   GET  /api/installs/<id>                  -> { id, release, soma, surfaces, updated }
//   PUT  /api/installs/<id>  { soma, surfaces } -> {}
//   POST /api/infer          { who, model?, messages, tools?, max_tokens? } -> OpenRouter chat completion
//   GET  /api/log/<who>?n=20                 -> last n inference records for an actant or install
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, 'public');
const DATA = join(HERE, 'data');
const PORT = Number(process.argv[process.argv.indexOf('--port') + 1]) || 7780;

loadEnv(join(HERE, '.env'));
const MODEL = process.env.GACTANT_MODEL || 'anthropic/claude-sonnet-5.5';
const OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';

for (const d of ['actants', 'releases', 'installs', 'log']) mkdirSync(join(DATA, d), { recursive: true });

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// ---------- storage: one JSON file per thing ----------

const slug = (s) => String(s || 'actant').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'actant';
const newId = (name) => `${slug(name)}-${randomBytes(3).toString('hex')}`;
const safe = (id) => { if (!/^[a-z0-9-]+$/.test(id)) throw httpError(400, 'bad id'); return id; };
const file = (kind, id) => join(DATA, kind, `${safe(id)}.json`);

function read(kind, id) {
  const f = file(kind, id);
  if (!existsSync(f)) throw httpError(404, `no ${kind.slice(0, -1)} ${id}`);
  return JSON.parse(readFileSync(f, 'utf8'));
}
const write = (kind, id, value) => writeFileSync(file(kind, id), JSON.stringify(value, null, 1));
const list = (kind) => readdirSync(join(DATA, kind)).filter((f) => f.endsWith('.json')).map((f) => read(kind, f.slice(0, -5)));

function httpError(code, message) { return Object.assign(new Error(message), { code }); }

// ---------- inference relay ----------

async function infer(body) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw httpError(503, 'no OPENROUTER_API_KEY in platforms/gactant/.env');
  const who = body.who ? safe(body.who) : 'anon';
  const request = {
    model: body.model || MODEL,
    messages: body.messages,
    max_tokens: body.max_tokens || 8000,
    usage: { include: true },
    // Prefer one provider: each keeps its own prompt cache, and bouncing between them
    // turns every other call into a cache write.
    provider: { order: ['anthropic'], allow_fallbacks: true },
    ...(body.tools?.length ? { tools: body.tools } : {}),
  };
  const started = Date.now();
  const res = await fetch(OPENROUTER, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'gactant' },
    body: JSON.stringify(request),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw httpError(502, `openrouter: ${text.slice(0, 300)}`); }
  const record = {
    at: new Date().toISOString(), ms: Date.now() - started, model: request.model, status: res.status,
    usage: json.usage, error: json.error,
    // The last message is what woke this turn (an event, or tool results); the reply is what came back.
    last: summarize(request.messages.at(-1)), reply: json.choices?.[0]?.message,
  };
  appendFileSync(join(DATA, 'log', `${who}.jsonl`), JSON.stringify(record) + '\n');
  if (!res.ok || json.error) throw httpError(502, `openrouter ${res.status}: ${JSON.stringify(json.error ?? json).slice(0, 500)}`);
  return json;
}

/** Keep logs readable: drop image bytes. */
function summarize(message) {
  if (!message) return null;
  if (!Array.isArray(message.content)) return message;
  return { ...message, content: message.content.map((p) => (p.type === 'image_url' ? { type: 'image_url', bytes: p.image_url?.url?.length } : p)) };
}

function tail(who, n) {
  const f = join(DATA, 'log', `${safe(who)}.jsonl`);
  if (!existsSync(f)) return [];
  return readFileSync(f, 'utf8').trim().split('\n').slice(-n).map((l) => JSON.parse(l));
}

// ---------- routes ----------

async function route(method, parts, body, query) {
  const [a, b, c, d] = parts;
  if (a === 'config') return { model: MODEL, hasKey: Boolean(process.env.OPENROUTER_API_KEY) };
  if (a === 'infer' && method === 'POST') return infer(body);
  if (a === 'log' && b) return tail(b, Number(query.get('n')) || 20);

  if (a === 'actants') {
    if (!b && method === 'GET') {
      return list('actants').map((x) => ({ id: x.id, name: x.soma?.name, updated: x.updated, checkpoints: x.checkpoints?.length ?? 0 }))
        .sort((x, y) => (y.updated || '').localeCompare(x.updated || ''));
    }
    if (!b && method === 'POST') {
      const id = newId(body.soma?.name);
      write('actants', id, { id, soma: body.soma, surfaces: body.surfaces ?? {}, checkpoints: [], fresh: true, created: new Date().toISOString(), updated: new Date().toISOString() });
      return { id };
    }
    const actant = read('actants', b);
    if (!c && method === 'GET') return { id: actant.id, soma: actant.soma, surfaces: actant.surfaces, fresh: actant.fresh, updated: actant.updated };
    if (!c && method === 'PUT') {
      write('actants', b, { ...actant, soma: body.soma, surfaces: body.surfaces, fresh: false, updated: new Date().toISOString() });
      return {};
    }
    if (c === 'checkpoints' && method === 'GET') return actant.checkpoints.map(({ n, label, at }) => ({ n, label, at }));
    if (c === 'checkpoints' && method === 'POST') {
      const n = actant.checkpoints.length + 1;
      actant.checkpoints.push({ n, label: body.label || '', at: new Date().toISOString(), soma: actant.soma, surfaces: actant.surfaces });
      write('actants', b, actant);
      return { n };
    }
  }

  if (a === 'releases') {
    if (!b && method === 'GET') {
      const installs = list('installs');
      return list('releases').map(({ id, title, actant, n, at }) => ({ id, title, actant, n, at, installs: installs.filter((i) => i.release === id).length }))
        .sort((x, y) => y.at.localeCompare(x.at));
    }
    if (!b && method === 'POST') {
      const actant = read('actants', body.actant);
      const cp = actant.checkpoints.find((x) => x.n === Number(body.n));
      if (!cp) throw httpError(404, `no checkpoint ${body.n}`);
      const id = newId(body.title || actant.soma?.name);
      write('releases', id, { id, title: body.title || actant.soma?.name, actant: actant.id, n: cp.n, at: new Date().toISOString(), soma: cp.soma, surfaces: cp.surfaces });
      return { id };
    }
    if (c === 'install' && method === 'POST') {
      const release = read('releases', b);
      const id = newId(release.title);
      // The soma ships whole. Surfaces start fresh: the shaping conversation and sketches
      // were between the actant and its shaper, and the player is a new audience.
      write('installs', id, { id, release: release.id, soma: structuredClone(release.soma), surfaces: {}, fresh: true, created: new Date().toISOString(), updated: new Date().toISOString() });
      return { id };
    }
    if (!c && method === 'GET') { const { soma, surfaces, ...meta } = read('releases', b); return meta; }
  }

  if (a === 'installs' && b) {
    const install = read('installs', b);
    if (method === 'GET') return install;
    if (method === 'PUT') { write('installs', b, { ...install, soma: body.soma, surfaces: body.surfaces, fresh: false, updated: new Date().toISOString() }); return {}; }
  }

  throw httpError(404, `no route ${method} /api/${parts.join('/')}`);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };

function serveStatic(path, res) {
  if (path === '/') path = '/index.html';
  const f = normalize(join(PUBLIC, path));
  if (!f.startsWith(PUBLIC) || !existsSync(f)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(readFileSync(f));
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) return serveStatic(url.pathname, res);
  try {
    let body = {};
    if (req.method === 'POST' || req.method === 'PUT') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    }
    const out = await route(req.method, url.pathname.slice(5).split('/').filter(Boolean), body, url.searchParams);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out));
  } catch (err) {
    if (!err.code || err.code >= 500) console.error(`[gactant] ${req.method} ${url.pathname}: ${err.message}`);
    res.writeHead(typeof err.code === 'number' ? err.code : 500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}).listen(PORT, () => {
  console.log(`gactant on http://lilg:${PORT}/  model ${MODEL}  key ${process.env.OPENROUTER_API_KEY ? 'present' : 'MISSING (add OPENROUTER_API_KEY to .env)'}`);
});

// gactant: a platform for ludants, game-shaped actants.
//
// The browser window is the frame. This server only keeps things: ludants, their
// checkpoints, and publications. It also relays inference to OpenRouter so the key never
// reaches a page. No dependencies.
//
//   node server.mjs [--port 7780]
//
// .env (next to this file)
//   OPENROUTER_API_KEY=...
//   GACTANT_MODEL=anthropic/claude-sonnet-5.5     optional
//
// Words
//   ludant      a game-shaped actant: a soma (its sections) plus the state of the surfaces
//               it lives with. Played and shaped by whoever sits with it; there are no modes.
//   checkpoint  a frozen copy of a ludant's soma, numbered. One is taken automatically
//               whenever someone sits down, so anything changed while they're there can be undone.
//   publication a checkpoint offered to anyone. Taking a copy makes a new ludant whose
//               lineage points back; that copy can be published again.
//
// API (JSON)
//   GET  /api/config                                -> { model, hasKey }
//   GET  /api/ludants                               -> [{ id, name, updated, checkpoints, lineage, people }]
//   POST /api/ludants        { soma, by }           -> { id }          seed a new one
//   GET  /api/ludants/<id>                          -> { id, soma, surfaces, lineage, visitors, checkpoints (no somas), restored, fresh }
//   PUT  /api/ludants/<id>   { soma, surfaces }     -> {}
//   POST /api/ludants/<id>/arrive { who }           -> { firstVisit, visits, checkpoint, people }
//   GET  /api/ludants/<id>/checkpoints              -> [{ n, label, by, at }]
//   POST /api/ludants/<id>/checkpoints { label, by } -> { n }          no-op if nothing changed
//   POST /api/ludants/<id>/restore { n, by }        -> { restored }    checkpoints the present first
//   GET  /api/published                             -> [{ id, title, name, by, note, ludant, n, from, at, copies }]
//   POST /api/published      { ludant, title, by, note?, n? } -> { id }   n omitted: checkpoint now and publish that
//   GET  /api/published/<id>                        -> metadata
//   POST /api/published/<id>/copy { by }            -> { id }          a new ludant, descended from it
//   POST /api/infer          { who, model?, messages, tools?, max_tokens? } -> OpenRouter chat completion
//   GET  /api/log/<who>?n=20                        -> last n inference records
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

for (const d of ['ludants', 'published', 'log']) mkdirSync(join(DATA, d), { recursive: true });

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
  // A dropped connection or a busy provider shouldn't end someone's sitting: retry those.
  let res, text;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(OPENROUTER, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'gactant' },
        body: JSON.stringify(request),
      });
      text = await res.text();
      if ((res.status === 429 || res.status >= 500) && attempt < 3) throw new Error(`status ${res.status}`);
      break;
    } catch (err) {
      if (attempt >= 3) throw httpError(502, `openrouter unreachable: ${err.message}`);
      console.warn(`[gactant] infer attempt ${attempt + 1} failed (${err.message}); retrying`);
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
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

const now = () => new Date().toISOString();
const sameSoma = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Take a checkpoint, unless the soma is exactly what the last one holds. */
function checkpoint(ludant, label, by) {
  const last = ludant.checkpoints.at(-1);
  if (last && sameSoma(last.soma, ludant.soma)) return last.n;
  const n = (last?.n ?? 0) + 1;
  ludant.checkpoints.push({ n, label: label || '', by: by || null, at: now(), soma: structuredClone(ludant.soma) });
  return n;
}

const summary = (x) => ({
  id: x.id, name: x.soma?.name, updated: x.updated, checkpoints: x.checkpoints?.length ?? 0,
  lineage: x.lineage ?? {}, people: Object.keys(x.visitors ?? {}),
});

async function route(method, parts, body, query) {
  const [a, b, c] = parts;
  if (a === 'config') return { model: MODEL, hasKey: Boolean(process.env.OPENROUTER_API_KEY) };
  if (a === 'infer' && method === 'POST') return infer(body);
  if (a === 'log' && b) return tail(b, Number(query.get('n')) || 20);

  if (a === 'ludants') {
    if (!b && method === 'GET') return list('ludants').map(summary).sort((x, y) => (y.updated || '').localeCompare(x.updated || ''));
    if (!b && method === 'POST') {
      const id = newId(body.soma?.name);
      const ludant = { id, soma: body.soma, surfaces: {}, checkpoints: [], visitors: {}, lineage: { seededBy: body.by || null }, fresh: true, created: now(), updated: now() };
      checkpoint(ludant, 'as seeded', body.by);
      write('ludants', id, ludant);
      return { id };
    }
    const ludant = read('ludants', b);
    if (!c && method === 'GET') {
      const { checkpoints, ...rest } = ludant;
      return { ...rest, checkpoints: checkpoints.map(({ soma, ...meta }) => meta) };
    }
    if (!c && method === 'PUT') {
      write('ludants', b, { ...ludant, soma: body.soma, surfaces: body.surfaces, fresh: false, updated: now() });
      return {};
    }
    // Someone sits down. Remember them, and keep the ludant as it was right now, so
    // whatever changes while they're here can be undone.
    if (c === 'arrive' && method === 'POST') {
      const who = String(body.who || 'someone').slice(0, 40);
      const seen = ludant.visitors[who];
      ludant.visitors[who] = { first: seen?.first ?? now(), last: now(), visits: (seen?.visits ?? 0) + 1 };
      const n = checkpoint(ludant, `as it was when ${who} sat down`, who);
      write('ludants', b, ludant);
      return { firstVisit: !seen, visits: ludant.visitors[who].visits, checkpoint: n, people: Object.keys(ludant.visitors) };
    }
    if (c === 'checkpoints' && method === 'GET') return ludant.checkpoints.map(({ soma, ...meta }) => meta);
    if (c === 'checkpoints' && method === 'POST') {
      const n = checkpoint(ludant, body.label, body.by);
      write('ludants', b, ludant);
      return { n };
    }
    if (c === 'restore' && method === 'POST') {
      const cp = ludant.checkpoints.find((x) => x.n === Number(body.n));
      if (!cp) throw httpError(404, `no checkpoint ${body.n}`);
      checkpoint(ludant, `how it was just before ${body.by || 'someone'} went back to #${cp.n}`, body.by);
      // The body goes back; the memory stays. Being put back is something that happened to
      // it, and a ludant that forgot every restore would be forever surprised.
      const memory = ludant.soma.sections?.memory;
      ludant.soma = structuredClone(cp.soma);
      if (memory != null) ludant.soma.sections.memory = memory;
      ludant.restored = { n: cp.n, label: cp.label, by: body.by || null, at: now() };
      ludant.updated = now();
      write('ludants', b, ludant);
      return { restored: cp.n };
    }
  }

  // Publishing: anyone sitting with a ludant can publish one of its checkpoints. Anyone
  // can take a copy of a publication, and that copy can be published again.
  if (a === 'published') {
    if (!b && method === 'GET') {
      const ludants = list('ludants');
      return list('published').map(({ soma, ...p }) => ({ ...p, copies: ludants.filter((l) => l.lineage?.from?.published === p.id).length }))
        .sort((x, y) => y.at.localeCompare(x.at));
    }
    if (!b && method === 'POST') {
      const ludant = read('ludants', body.ludant);
      const n = body.n ? Number(body.n) : checkpoint(ludant, `published as "${body.title}"`, body.by);
      const cp = ludant.checkpoints.find((x) => x.n === n);
      if (!cp) throw httpError(404, `no checkpoint ${body.n}`);
      write('ludants', ludant.id, ludant);
      const id = newId(body.title || ludant.soma?.name);
      write('published', id, {
        id, title: body.title || ludant.soma?.name, name: ludant.soma?.name, by: body.by || null, note: body.note || '',
        ludant: ludant.id, n: cp.n, from: ludant.lineage?.from?.published ?? null, at: now(), soma: cp.soma,
      });
      return { id };
    }
    const pub = read('published', b);
    if (!c && method === 'GET') { const { soma, ...meta } = pub; return meta; }
    if (c === 'copy' && method === 'POST') {
      const id = newId(pub.name);
      // The soma comes whole; the surfaces start fresh. What was said and sketched belonged
      // to the people who were there.
      const ludant = {
        id, soma: structuredClone(pub.soma), surfaces: {}, checkpoints: [], visitors: {}, fresh: true, created: now(), updated: now(),
        lineage: { from: { published: pub.id, title: pub.title, by: pub.by, ludant: pub.ludant }, takenBy: body.by || null },
      };
      checkpoint(ludant, `as received: "${pub.title}"`, body.by);
      write('ludants', id, ludant);
      return { id };
    }
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

// gactant: a platform for ludants, game-shaped actants.
//
// The browser window is the frame. This server only keeps things: ludants, their
// checkpoints, and publications. It also relays inference to OpenRouter so the key never
// reaches a page. No dependencies. Ludants' code runs in a sandbox (/sandbox.html) with an
// opaque origin and no network; the API refuses anything but this site's own pages.
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
//               Its name is a given name plus its game's title: Georina-Monopoly-Clone.
//               Each published name belongs to exactly one snapshot.
//   checkpoint  a frozen copy of a ludant's soma, numbered. One is taken automatically
//               whenever someone sits down, so anything changed while they're there can be undone.
//   publication a checkpoint offered to anyone. Taking a copy makes a new ludant whose
//               lineage points back; that copy can be published again.
//
// API (JSON)
//   GET  /api/config                                -> { model, hasKey }
//   GET  /api/ludants                               -> [{ id, name, updated, checkpoints, lineage, people }]
//   POST /api/ludants        { by }                 -> { id }          seed a new one, with a fresh given name
//   GET  /api/ludants/<id>                          -> { id, soma, surfaces, lineage, visitors, checkpoints (no somas), restored, fresh, familyNames }
//   PUT  /api/ludants/<id>   { soma, surfaces, token } -> {}       409 unless this window holds it
//   POST /api/ludants/<id>/hold { token, who, takeOver? } -> { held, tookFrom }   409 { heldBy, since } if another window does
//   POST /api/ludants/<id>/heartbeat { token }      -> { held }        409 once another window took it
//   POST /api/ludants/<id>/release { token }        -> {}
//   POST /api/ludants/<id>/arrive { who }           -> { firstVisit, visits, checkpoint, people }
//   GET  /api/ludants/<id>/checkpoints              -> [{ n, label, by, at }]
//   POST /api/ludants/<id>/checkpoints { label, by } -> { n }          no-op if nothing changed
//   POST /api/ludants/<id>/restore { n, by }        -> { restored }    checkpoints the present first
//   GET  /api/published                             -> [{ id, name, given, title, by, note, ludant, n, from, fromName, at, copies }]
//   POST /api/published      { ludant, by, note? }  -> { id, name }   publishes it as it is now, under its name;
//                                                     409 if this snapshot or this name is already published
//   GET  /api/published/<id>                        -> metadata
//   POST /api/published/<id>/copy { by }            -> { id }          a new ludant, descended from it
//   POST /api/infer          { who, model?, messages, tools?, max_tokens? } -> OpenRouter chat completion
//   GET  /api/log/<who>?n=20                        -> last n inference records
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nameOf, randomGiven, titleSlug } from './public/js/names.js';
import { seedSoma } from './public/js/seed.js';

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
    // Room for a ludant to rewrite a whole game in one write_section.
    max_tokens: body.max_tokens || 32000,
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
/** Same body, ignoring title and memory: a new name or remembering being published
 *  doesn't make a different ludant. Something else has to change. */
const sameBody = (a, b) => {
  const strip = (x) => ({ ...x, sections: { ...x?.sections, memory: undefined, title: undefined } });
  return sameSoma(strip(a), strip(b));
};

/** A given name no lineage here uses yet. */
function freshGiven() {
  const used = new Set([...list('ludants'), ...list('published')].map((x) => (x.soma?.given ?? x.given)?.toLowerCase()));
  for (let i = 0; i < 1000; i++) { const g = randomGiven(); if (!used.has(g.toLowerCase())) return g; }
  throw httpError(500, 'ran out of names');
}

/** Take a checkpoint, unless the soma is exactly what the last one holds. */
function checkpoint(ludant, label, by) {
  const last = ludant.checkpoints.at(-1);
  if (last && sameSoma(last.soma, ludant.soma)) return last.n;
  const n = (last?.n ?? 0) + 1;
  ludant.checkpoints.push({ n, label: label || '', by: by || null, at: now(), soma: structuredClone(ludant.soma) });
  return n;
}

// ---------- holds: one window at a time ----------
//
// Each frame saves the whole soma, so two windows on one ludant would overwrite each
// other. A window must hold the ludant to save it. A second window can take the hold;
// the first finds out on its next heartbeat or save and stops. Holds live in memory: a
// restarted server forgets them, and the next heartbeat simply takes the hold again.

const HOLD_STALE_MS = 20000;
/** @type {Map<string, { token: string, who: string, since: string, seen: number }>} */
const holds = new Map();

function holdState(id) {
  const h = holds.get(id);
  return h && Date.now() - h.seen < HOLD_STALE_MS ? h : null;
}

function requireHold(id, token) {
  const h = holdState(id);
  if (h && h.token === token) { h.seen = Date.now(); return; }
  if (!h && token) { holds.set(id, { token, who: '?', since: now(), seen: Date.now() }); return; }
  throw Object.assign(httpError(409, `${h?.who ?? 'another window'} is holding this ludant`), { extra: { heldBy: h?.who ?? null, since: h?.since ?? null } });
}

const summary = (x) => ({
  id: x.id, name: nameOf(x.soma), given: x.soma?.given, updated: x.updated, checkpoints: x.checkpoints?.length ?? 0,
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
      const given = freshGiven();
      const id = newId(given);
      const ludant = { id, soma: seedSoma(given, body.by), surfaces: {}, checkpoints: [], visitors: {}, lineage: { seededBy: body.by || null }, fresh: true, created: now(), updated: now() };
      checkpoint(ludant, 'as seeded', body.by);
      write('ludants', id, ludant);
      return { id };
    }
    const ludant = read('ludants', b);
    if (!c && method === 'GET') {
      const { checkpoints, ...rest } = ludant;
      // The names its family has already published under, so it knows which are taken.
      const familyNames = list('published').filter((p) => p.given === ludant.soma?.given).map((p) => p.name);
      return { ...rest, familyNames, checkpoints: checkpoints.map(({ soma, ...meta }) => meta) };
    }
    if (!c && method === 'PUT') {
      requireHold(b, body.token);
      write('ludants', b, { ...ludant, soma: body.soma, surfaces: body.surfaces, fresh: false, updated: now() });
      return {};
    }
    if (c === 'hold' && method === 'POST') {
      const h = holdState(b);
      if (h && h.token !== body.token && !body.takeOver) throw Object.assign(httpError(409, `${h.who} is holding this ludant in another window`), { extra: { heldBy: h.who, since: h.since } });
      holds.set(b, { token: body.token, who: String(body.who || 'someone').slice(0, 40), since: h?.token === body.token ? h.since : now(), seen: Date.now() });
      return { held: true, tookFrom: h && h.token !== body.token ? h.who : null };
    }
    if (c === 'heartbeat' && method === 'POST') { requireHold(b, body.token); return { held: true }; }
    if (c === 'release' && method === 'POST') {
      if (holds.get(b)?.token === body.token) holds.delete(b);
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
      // A published name belongs to exactly one snapshot. So a snapshot can't be published
      // twice, and publishing again takes both a change and a new title.
      const ludant = read('ludants', body.ludant);
      const name = nameOf(ludant.soma);
      if (!titleSlug(ludant.soma.sections?.title)) throw httpError(400, `${name} needs a title before it can be published: its name is its given name and its game's title together`);
      const pubs = list('published');
      const same = pubs.find((p) => sameBody(p.soma, ludant.soma));
      if (same) throw httpError(409, `this exact ${same.given} is already published as ${same.name}. Change something first, then give it a new title`);
      const clash = pubs.find((p) => p.name.toLowerCase() === name.toLowerCase());
      if (clash) throw httpError(409, `${name} already names another snapshot. It has changed since, so it needs a new title`);
      const n = checkpoint(ludant, `published as ${name}`, body.by);
      const cp = ludant.checkpoints.find((x) => x.n === n);
      write('ludants', ludant.id, ludant);
      const id = newId(name);
      write('published', id, {
        id, name, given: ludant.soma.given, title: ludant.soma.sections.title.trim(), by: body.by || null, note: body.note || '',
        ludant: ludant.id, n: cp.n, from: ludant.lineage?.from?.published ?? null, fromName: ludant.lineage?.from?.name ?? null, at: now(), soma: cp.soma,
      });
      return { id, name };
    }
    const pub = read('published', b);
    if (!c && method === 'GET') { const { soma, ...meta } = pub; return meta; }
    if (c === 'copy' && method === 'POST') {
      const id = newId(pub.given);
      // The soma comes whole; the surfaces start fresh. What was said and sketched belonged
      // to the people who were there.
      const ludant = {
        id, soma: structuredClone(pub.soma), surfaces: {}, checkpoints: [], visitors: {}, fresh: true, created: now(), updated: now(),
        lineage: { from: { published: pub.id, name: pub.name, by: pub.by, ludant: pub.ludant }, takenBy: body.by || null },
      };
      checkpoint(ludant, `as received: ${pub.name}`, body.by);
      write('ludants', id, ludant);
      return { id };
    }
  }

  throw httpError(404, `no route ${method} /api/${parts.join('/')}`);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };

// The sandbox page: its iframe has an opaque origin, and this policy takes away the
// network (no fetch, no sockets, no images from elsewhere), so the ludant's code can't
// reach the relay, OpenRouter, or anywhere to send what it sees. It may load the
// platform's own scripts, and must be allowed eval: its code sections are compiled.
const sandboxPolicy = (host) => [
  "default-src 'none'",
  `script-src 'self' http://${host} https://${host} 'unsafe-eval'`,
  "img-src data: blob:",
  "style-src 'unsafe-inline'",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

function serveStatic(req, path, res) {
  if (path === '/') path = '/index.html';
  const f = normalize(join(PUBLIC, path));
  if (!f.startsWith(PUBLIC) || !existsSync(f)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache',
    // The sandbox's origin is opaque, so its module scripts load cross-origin. These are
    // the platform's public files, so anyone may.
    'Access-Control-Allow-Origin': '*',
    ...(path === '/sandbox.html' ? { 'Content-Security-Policy': sandboxPolicy(req.headers.host) } : {}),
  });
  res.end(readFileSync(f));
}

/** The API answers only the platform's own pages. A request from a sandbox (Origin: null)
 *  or another site is refused, so the relay can't be spent from anywhere else. */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;   // same-origin GETs don't say
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, url.pathname, res);
  if (!sameOrigin(req)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'the API answers only this site\'s own pages' }));
    return;
  }
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
    res.end(JSON.stringify({ error: err.message, ...(err.extra ?? {}) }));
  }
}).listen(PORT, () => {
  console.log(`gactant on http://lilg:${PORT}/  model ${MODEL}  key ${process.env.OPENROUTER_API_KEY ? 'present' : 'MISSING (add OPENROUTER_API_KEY to .env)'}`);
});

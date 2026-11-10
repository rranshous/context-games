// gactant, run locally: Node, files on disk, no dependencies. The API itself is core.mjs;
// this keeps the files, serves the pages, and listens. (worker.mjs is the hosted twin.)
//
//   node server.mjs [--port 7780] [--data <dir>] [--env <file> | --env none]
//
// .env (next to this file), all optional
//   OPENROUTER_API_KEY=...        thinking for anyone who hasn't connected their own OpenRouter
//   GACTANT_MODEL=anthropic/claude-sonnet-5.5
//   GACTANT_PUBLIC=1              open to anyone: no listing every ludant, no inference logs
//   GACTANT_SANDBOX=http://127.0.0.1:7780   serve the sandbox from another site, as hosted
//
// Data: data/<kind>/<id>.json, one document each (ludants, published, checkpoints, names),
// data/pictures/ the art and thumbs (served at /art/, as R2 serves them hosted),
// and data/log/<who>.jsonl, every inference with image bytes stripped. Reading those logs is
// how Claude sees what a ludant saw and did.

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SANDBOX_POLICY, createCore, pageHeaders, safe, sameOrigin } from './core.mjs';
import { createLocalMatches } from './match.mjs';
import { createRules } from './rules.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, 'public');
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const DATA = arg('--data') ?? join(HERE, 'data');   // --data <dir>: another place (tools/smoke.mjs uses a scratch one)
const PORT = Number(arg('--port')) || 7780;

// --env: settings from another file, or none at all (e.g. to see the site as a visitor does,
// with no OpenRouter key of the server's to think on).
if (arg('--env') !== 'none') loadEnv(arg('--env') ?? join(HERE, '.env'));
const MODEL = process.env.GACTANT_MODEL || 'anthropic/claude-sonnet-5.5';

for (const d of ['ludants', 'published', 'checkpoints', 'names', 'thumbs', 'reports', 'issues', 'flags', 'traffic', 'trouble', 'people', 'recoveries', 'pairings', 'drafts', 'rulebooks', 'matches', 'actions', 'match-index', 'archive', 'standings', 'log', 'pictures/a', 'pictures/t']) mkdirSync(join(DATA, d), { recursive: true });
const PICTURES = join(DATA, 'pictures');

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
  async size() {
    const kinds = {};
    let bytes = 0;
    for (const kind of readdirSync(DATA)) {
      if (kind === 'log' || !statSync(join(DATA, kind)).isDirectory()) continue;
      const files = readdirSync(join(DATA, kind));
      const chars = files.reduce((n, f) => n + statSync(join(DATA, kind, f)).size, 0);
      kinds[kind] = { docs: files.length, chars };
      bytes += chars;
    }
    return { bytes, kinds };
  },
  async get(kind, id) { const f = file(kind, id); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; },
  async put(kind, id, doc) { writeFileSync(file(kind, id), JSON.stringify(doc, null, 1)); },
  async remove(kind, id) { rmSync(file(kind, id), { force: true }); },
  async drop(kind) { rmSync(join(DATA, kind), { recursive: true, force: true }); },
  async list(kind) {
    return readdirSync(join(DATA, kind)).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(DATA, kind, f), 'utf8')));
  },
};

// ---------- pictures: files under data/pictures, named as core.mjs names them ----------

const picture = (name) => { const f = normalize(join(PICTURES, name)); if (!f.startsWith(PICTURES + '/') || !/^[at]\/[a-z0-9.-]+$/.test(name)) throw new Error(`bad picture ${name}`); return f; };
const art = {
  async put(name, bytes) { writeFileSync(picture(name), bytes); },
  async get(name) { const f = picture(name); return existsSync(f) ? { bytes: new Uint8Array(readFileSync(f)), type: TYPES[extname(f)] ?? 'application/octet-stream' } : null; },
  async remove(name) { rmSync(picture(name), { force: true }); },
};

const archive = { put: (id, doc) => store.put('archive', id, doc), get: (id) => store.get('archive', id) };

const localMatches = createLocalMatches({ store, archive, loadRules: async () => createRules(await WebAssembly.compile(readFileSync(join(HERE, 'vendor/quickjs/quickjs.wasm')))) });
const core = createCore({
  store,
  settings: {
    model: MODEL,
    key: process.env.OPENROUTER_API_KEY || '',
    public: process.env.GACTANT_PUBLIC === '1',
    adminToken: process.env.GACTANT_ADMIN_TOKEN || '',
    // Signs challenges and passes (people.mjs). Without one, a fresh one each start: passes
    // then renew after a restart, silently.
    sessionSecret: process.env.GACTANT_SESSION_SECRET || '',
    // Where the sandbox page comes from: here (its iframe's origin is opaque anyway), or
    // another site, the way the hosted install uses gactantbox.com (e.g. http://127.0.0.1:7780).
    sandbox: process.env.GACTANT_SANDBOX || '',
    art,
    artBase: '/art/',
    // Tables: every match in this process (match.mjs), its rules in QuickJS (rules.mjs, from
    // the vendored WebAssembly), and finished matches archived as data/archive/<id>.json.
    matches: localMatches,
    archive,
    archiveOverMs: process.env.GACTANT_ARCHIVE_OVER_MS ? Number(process.env.GACTANT_ARCHIVE_OVER_MS) : undefined,   // the smoke test's: at once
    log: (who, record) => appendFileSync(join(DATA, 'log', `${who}.jsonl`), JSON.stringify(record) + '\n'),
    tail: (who, n) => {
      const f = join(DATA, 'log', `${who}.jsonl`);
      return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').slice(-n).map((l) => JSON.parse(l)) : [];
    },
    opsLog: (record) => console.warn('[gactant]', JSON.stringify(record)),
  },
});

// ---------- pages ----------

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.txt': 'text/plain', '.xml': 'application/xml' };

function serveStatic(path, res, host = '') {
  if (path === '/') path = '/index.html';
  const f = normalize(join(PUBLIC, path));
  if (!f.startsWith(PUBLIC) || !existsSync(f)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache',
    // The sandbox's origin is opaque, so its module scripts load cross-origin. These are
    // the platform's public files, so anyone may.
    'Access-Control-Allow-Origin': '*',
    ...(path === '/sandbox.html' ? { 'Content-Security-Policy': SANDBOX_POLICY } : extname(f) === '.html' ? pageHeaders(process.env.GACTANT_SANDBOX || '', false, '', host) : {}),
  });
  res.end(readFileSync(f));
}

const json = (res, code, value) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/art/')) {
    const pic = await art.get(url.pathname.slice(5)).catch(() => null);
    if (!pic) { res.writeHead(404); res.end('not here'); return; }
    res.writeHead(200, { 'Content-Type': pic.type, 'Cache-Control': 'public, max-age=31536000, immutable', 'Access-Control-Allow-Origin': '*' });
    res.end(pic.bytes); return;
  }
  if (!url.pathname.startsWith('/api/')) return serveStatic(url.pathname, res, req.headers.host);
  if (!sameOrigin(req.headers.origin, req.headers.host)) return json(res, 403, { error: 'the API answers only this site\'s own pages' });
  try {
    let body = {};
    if (req.method === 'POST' || req.method === 'PUT') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    }
    json(res, 200, await core.route(req.method, url.pathname.slice(5).split('/').filter(Boolean), body, url.searchParams, { ip: req.socket.remoteAddress, pass: req.headers['x-gactant-pass'] || '' }));
  } catch (err) {
    if (!err.code || err.code >= 500) console.error(`[gactant] ${req.method} ${url.pathname}: ${err.message}`);
    json(res, typeof err.code === 'number' ? err.code : 500, { error: err.message, ...(err.extra ?? {}) });
  }
});

// Following a match live (match.mjs: pushLooks, relayShare), as the hosted Match objects do,
// with just enough WebSocket for it: text messages, ping, close. The pass comes as a
// subprotocol, since a browser can't put headers on a WebSocket.
server.on('upgrade', async (req, socket) => {
  const url = new URL(req.url, 'http://x');
  const id = url.pathname.match(/^\/api\/matches\/(m-[0-9a-f]{12})\/live$/)?.[1];
  if (!id || !sameOrigin(req.headers.origin, req.headers.host) || req.headers.upgrade?.toLowerCase() !== 'websocket') { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return; }
  const offered = String(req.headers['sec-websocket-protocol'] ?? '').split(',').map((x) => x.trim());
  const pass = offered.find((x) => x.startsWith('v1.'));
  const person = pass ? (await core.route('GET', ['people', 'me'], {}, new URLSearchParams(), { ip: '', pass }).catch(() => null))?.id ?? null : null;
  const frame = (op, payload) => {
    const n = payload.length;
    const head = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255]) : Buffer.concat([Buffer.from([0x80 | op, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; })()]);
    return Buffer.concat([head, payload]);
  };
  const me = { person, send: (t) => socket.write(frame(1, Buffer.from(t))), close: () => { try { socket.end(frame(8, Buffer.from([0x11, 0x3a]))); } catch {} } };   // 4410: archived
  let room;
  try { room = await localMatches.follow(id, me); } catch { socket.end('HTTP/1.1 404 Not Found\r\n\r\n'); return; }
  const accept = createHash('sha1').update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\nSec-WebSocket-Protocol: gactant\r\n\r\n`);
  let buf = Buffer.alloc(0);
  socket.on('data', async (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const op = buf[0] & 15, masked = buf[1] & 128;
      let n = buf[1] & 127, at = 2;
      if (n === 126) { if (buf.length < 4) return; n = buf.readUInt16BE(2); at = 4; } else if (n === 127) { if (buf.length < 10) return; n = Number(buf.readBigUInt64BE(2)); at = 10; }
      const mask = masked ? buf.subarray(at, at + 4) : null;
      if (masked) at += 4;
      if (buf.length < at + n) return;
      const data = Buffer.from(buf.subarray(at, at + n));
      if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
      buf = buf.subarray(at + n);
      if (op === 8) { room.closed(); socket.end(frame(8, Buffer.alloc(0))); return; }
      if (op === 9) { socket.write(frame(10, data)); continue; }
      if (op !== 1) continue;
      const text = data.toString('utf8');
      if (text === 'ping') { me.send('pong'); continue; }
      const said = await room.message(text);
      if (said) me.send(JSON.stringify({ type: 'error', error: said }));
    }
  });
  socket.on('close', () => room.closed());
  socket.on('error', () => room.closed());
});

server.listen(PORT, () => {
  console.log(`gactant on http://lilg:${PORT}/  model ${MODEL}  key ${process.env.OPENROUTER_API_KEY ? 'present' : 'none (people connect their own OpenRouter)'}`);
});

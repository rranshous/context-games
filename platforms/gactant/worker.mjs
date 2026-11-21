// gactant, hosted on Cloudflare: the same core.mjs as server.mjs, with a Durable Object
// keeping the data. Deploy with `npx wrangler deploy` (see wrangler.toml).
//
//   the Worker        serves the pages (static assets from public/) and passes /api/* to the world
//   World (one DO)    holds every document in its SQLite storage, and the holds in memory.
//                     Cloudflare keeps it durable and can restore it to any point in the last
//                     30 days, so there's no machine of ours to lose.
//   Match (a DO each) one match of a table: its rulebook, state and signed log (match.mjs), so
//                     a slow rulebook only slows its own match. The World indexes them and
//                     checks every action before passing it on; looking at a match goes
//                     straight there. A match that's over is archived to R2 (ARCHIVE) and its
//                     object deleted (tables.mjs). Practice runs use one object per person.
//   R2 (ART)          keeps the pictures (art and thumbs). Served from the bucket's own custom
//                     domain (ART_BASE), so they go through Cloudflare's cache, which is what
//                     the CSAM Scanning Tool looks at. /art/* here answers from R2 too, for
//                     `wrangler dev`, but isn't cached, so isn't scanned.
//
// Two hostnames: the site, and SANDBOX_ORIGIN, a different registrable domain that serves
// only the sandbox page and its scripts, so a ludant's code runs in its own browser process.

import { DurableObject } from 'cloudflare:workers';
import { makeCheck } from './check.mjs';
import { SANDBOX_POLICY, createCore, pageHeaders, sameOrigin } from './core.mjs';
import { archivedSummary, createMatch, practice, pushLooks, relayShare } from './match.mjs';
import { readPass } from './people.mjs';
import { createRules } from './rules.mjs';
// The rules engine's WebAssembly, compiled by wrangler when it bundles (a Worker can't compile it at run time).
import quickjsWasm from './vendor/quickjs/quickjs.wasm';

const artStore = (bucket) => ({
  async put(name, bytes, type) { await bucket.put(name, bytes, { httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' } }); },
  async get(name) { const o = await bucket.get(name); return o ? { bytes: new Uint8Array(await o.arrayBuffer()), type: o.httpMetadata?.contentType ?? 'application/octet-stream' } : null; },
  async remove(name) { await bucket.delete(name); },
});

const json = (code, value) => new Response(JSON.stringify(value), { status: code, headers: { 'Content-Type': 'application/json' } });

// What a slim list keeps of each kind (core.mjs's slimmed() does the same for the local store).
const SLIM = {
  ludants: `json_set(json_remove(json, '$.surfaces', '$.assets', '$.mail', '$.soma.sections'), '$.soma.sections', json_object('title', json_extract(json, '$.soma.sections.title')))`,
  published: `json_remove(json, '$.soma', '$.assets')`,
  flags: `json_remove(json, '$.image')`,
  reports: `json_remove(json, '$.report')`,
};

/** Documents in a Durable Object's own SQLite, one table of them. Made when first written to,
 *  so an object that's only read (or only runs practice) keeps nothing. */
function docStore(sql) {
  let made = false;
  const make = () => { if (!made) { sql.exec('CREATE TABLE IF NOT EXISTS docs (kind TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (kind, id))'); made = true; } };
  const has = () => made || (made = sql.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'docs'").toArray().length > 0);
  return {
    async get(kind, id) { if (!has()) return null; const rows = sql.exec('SELECT json FROM docs WHERE kind = ? AND id = ?', kind, id).toArray(); return rows.length ? JSON.parse(rows[0].json) : null; },
    async put(kind, id, doc) { make(); sql.exec('INSERT OR REPLACE INTO docs (kind, id, json) VALUES (?, ?, ?)', kind, id, JSON.stringify(doc)); },
    // slim: only the small fields lists need (SLIM), cut down by SQLite before any of it
    // reaches this object's memory: a whole kind of full documents could be more than it has.
    async list(kind, { slim } = {}) {
      if (!has()) return [];
      const what = slim && SLIM[kind] ? SLIM[kind] : 'json';
      return sql.exec(`SELECT ${what} AS json FROM docs WHERE kind = ?`, kind).toArray().map((r) => JSON.parse(r.json));
    },
    async remove(kind, id) { if (has()) sql.exec('DELETE FROM docs WHERE kind = ? AND id = ?', kind, id); },
    async drop(kind) { if (has()) sql.exec('DELETE FROM docs WHERE kind = ?', kind); },
  };
}

// The biggest body anything here takes (a ludant's save is up to 1.5M characters, a picture
// 1.1 MB as base64). Read no further than that, so one huge request can't fill the memory
// of the object that answers everyone.
const MAX_BODY = 4_000_000;
async function readBody(request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY) throw Object.assign(new Error('too big'), { code: 413 });
  if (!request.body) return {};
  const reader = request.body.getReader(), parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY) { reader.cancel().catch(() => {}); throw Object.assign(new Error('too big'), { code: 413 }); }
    parts.push(value);
  }
  try { return JSON.parse(new TextDecoder().decode(await new Blob(parts).arrayBuffer())); } catch { return {}; }
}

/** One match (match.mjs), or a person's practice runs. Asked by the World (create, act, log,
 *  archive, practice, check) and by the Worker (look, and live: a socket that hears every
 *  action as it happens). Sockets use the hibernation API, so a quiet match isn't billed
 *  for them; pings are answered without waking it. */
export class Match extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx; this.env = env;
    this.rules = createRules(quickjsWasm);
    this.match = this.rules.then((rules) => createMatch({ store: docStore(ctx.storage.sql), rules }));
    this.shares = new Map();
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  /** The sockets on this match, each with its person. One whose pass has run out is closed
   *  (the page opens another with a fresh pass), so a socket can't outlive its pass. */
  sockets() {
    const out = [];
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() ?? {};
      if (a.until && a.until < Date.now()) { try { ws.close(4401, 'pass ran out'); } catch {} continue; }
      out.push({ ws, person: a.person ?? null, send: (t) => ws.send(t) });
    }
    return out;
  }

  async webSocketMessage(ws, text) {
    const all = this.sockets();
    const said = await relayShare(await this.match, all, all.find((s) => s.ws === ws), String(text), this.shares).catch((err) => err.message);
    if (said) ws.send(JSON.stringify({ type: 'error', error: said }));
  }

  webSocketClose(ws, code) { try { ws.close(code === 1005 ? 1000 : code); } catch {} }

  async fetch(request) {
    const op = new URL(request.url).pathname.slice(1);
    try {
      if (this.gone) return json(404, { error: 'this match has been archived', gone: true });
      if (op === 'live') {
        await (await this.match).op('members');   // 404 if there's no match here
        const [client, server] = Object.values(new WebSocketPair());
        this.ctx.acceptWebSocket(server);
        server.serializeAttachment({ person: request.headers.get('x-gactant-person') || null, device: request.headers.get('x-gactant-device') || null, until: Number(request.headers.get('x-gactant-until')) || 0 });
        return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'gactant' } });
      }
      const body = await request.json().catch(() => ({}));
      // A device its person removed: its sockets close now.
      if (op === 'drop') {
        for (const ws of this.ctx.getWebSockets()) {
          const a = ws.deserializeAttachment() ?? {};
          if (a.person === body.person && a.device === body.device) { try { ws.close(4401, 'device removed'); } catch {} }
        }
        return json(200, {});
      }
      if (op === 'practice') return json(200, practice(await this.rules, body));
      if (op === 'check') return json(200, (await this.rules).check(String(body.source ?? '')));
      const match = await this.match;
      if (op === 'archive') {
        const doc = await match.op('export').catch((err) => { if (err.code === 404) return null; throw err; });
        if (doc) await this.env.ARCHIVE.put(`matches/${doc.id}.json`, JSON.stringify(doc), { httpMetadata: { contentType: 'application/json' } });
        await this.ctx.storage.deleteAll();
        this.gone = true;
        for (const ws of this.ctx.getWebSockets()) { try { ws.close(4410, 'archived'); } catch {} }
        return json(200, doc ? archivedSummary(doc) : null);
      }
      const out = await match.op(op, body);
      if (op === 'act') this.ctx.waitUntil(pushLooks(match, this.sockets()));
      return json(200, out);
    } catch (err) {
      if (!err.code || err.code >= 500) console.error({ error: err.message, match: op });
      return json(typeof err.code === 'number' ? err.code : 500, { error: err.message, ...(err.extra ?? {}) });
    }
  }
}

/** The World's way to its matches (tables.mjs: settings.matches and settings.archive). */
function matchHost(env) {
  const stub = (ref) => env.MATCH.get(typeof ref === 'string' ? env.MATCH.idFromName(ref) : env.MATCH.idFromString(ref.object));
  const practiceStub = (person) => env.MATCH.get(env.MATCH.idFromName(`practice-${person}`));
  const ask = async (s, op, body) => {
    const res = await s.fetch(`https://match/${op}`, { method: 'POST', body: JSON.stringify(body ?? {}) });
    const out = await res.json().catch(() => ({ error: `match ${res.status}` }));
    if (!res.ok) throw Object.assign(new Error(out?.error ?? `match ${res.status}`), { code: res.status, extra: out });
    return out;
  };
  return {
    matches: {
      op: (ref, name, body) => ask(stub(ref), name, body),
      practice: (person, body) => ask(practiceStub(person), 'practice', body),
      check: (person, source) => ask(practiceStub(person), 'check', { source }),
      archive: (ref) => ask(stub(ref), 'archive', {}),
    },
    // Apparent CSAM and what used it, kept apart in the private archive (core.mjs csam()).
    preserve: async (key, bytes, type) => { await env.ARCHIVE.put(`preserved/${key}`, bytes, { httpMetadata: { contentType: type } }); },
    archive: {
      async put(id, doc) { await env.ARCHIVE.put(`matches/${id}.json`, JSON.stringify(doc), { httpMetadata: { contentType: 'application/json' } }); },
      async get(id) { const o = await env.ARCHIVE.get(`matches/${id}.json`); return o ? JSON.parse(await o.text()) : null; },
    },
  };
}

export class World extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx; this.env = env;
    // Without it, passes would be signed with a secret made fresh each time the object
    // starts, and everyone would be signed out at random: refuse to run instead.
    if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET is a wrangler secret this needs');
    const sql = ctx.storage.sql;
    sql.exec('CREATE TABLE IF NOT EXISTS docs (kind TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (kind, id))');
    const store = {
      ...docStore(sql),
      async size() {
        const kinds = Object.fromEntries(sql.exec('SELECT kind, count(*) AS docs, sum(length(json)) AS chars FROM docs GROUP BY kind').toArray().map((r) => [r.kind, { docs: r.docs, chars: r.chars }]));
        return { bytes: ctx.storage.sql.databaseSize, kinds };
      },
    };
    this.core = createCore({
      store,
      settings: {
        model: env.GACTANT_MODEL || 'anthropic/claude-sonnet-5.5',
        key: env.OPENROUTER_API_KEY || '',
        public: env.GACTANT_PUBLIC === '1',
        adminToken: env.ADMIN_TOKEN || '',
        sandbox: env.SANDBOX_ORIGIN || '',
        art: artStore(env.ART),
        artBase: env.ART_BASE || '/art/',
        ...matchHost(env),
        archiveOverMs: env.ARCHIVE_OVER_MS ? Number(env.ARCHIVE_OVER_MS) : undefined,   // for testing under wrangler dev
        version: env.VERSION?.id ?? null,   // what this World runs, so a deploy can be checked
        sessionSecret: env.SESSION_SECRET,   // signs challenges and passes (people.mjs); a wrangler secret
        // A removed device's sockets on a match close (core.mjs).
        dropDevice: (id, person, device) => env.MATCH.get(env.MATCH.idFromName(id)).fetch('https://match/drop', { method: 'POST', body: JSON.stringify({ person, device }) }).catch(() => {}),
        // An object, so Cloudflare's Workers Logs index its fields (trouble, where, browser…).
        opsLog: (record) => console.warn(record),
        // Workers AI looks at each publication before it goes public (check.mjs).
        check: makeCheck(env.AI, env.IMAGES),
      },
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    // Each deploy updates the Worker at once, but a busy object can keep running the code
    // it started with. The Worker says which version it is; an object that's older lets
    // go, and the Worker asks again, reaching a fresh one on the new code.
    const want = request.headers.get('x-gactant-version');
    if (want && this.env.VERSION?.id && want !== this.env.VERSION.id) {
      await this.core.flush().catch(() => {});
      this.ctx.abort('a newer version was deployed');
    }
    if (url.pathname === '/internal/hourly') return json(200, { ...(await this.core.checkSome()), ...(await this.core.tidy()) });
    if (url.pathname === '/internal/who') return json(200, (await this.core.whoIs((await request.json().catch(() => ({}))).pass)) ?? {});
    try {
      const body = request.method === 'POST' || request.method === 'PUT' ? await readBody(request) : {};
      const from = { ip: request.headers.get('cf-connecting-ip') || '', pass: request.headers.get('x-gactant-pass') || '' };
      return json(200, await this.core.route(request.method, url.pathname.slice(5).split('/').filter(Boolean), body, url.searchParams, from));
    } catch (err) {
      if (!err.code || err.code >= 500) console.error({ error: err.message, method: request.method, path: url.pathname });
      return json(typeof err.code === 'number' ? err.code : 500, { error: err.message, ...(err.extra ?? {}) });
    }
  }
}

/** The platform's files, with what they need: anyone may load them (the sandbox's origin
 *  is opaque), and the sandbox page carries its policy. */
async function asset(request, env, path) {
  const url = new URL(request.url);
  url.pathname = path === '/' ? '/index.html' : path;
  const res = await env.ASSETS.fetch(new Request(url, request));
  const out = new Response(res.body, res);
  out.headers.set('Access-Control-Allow-Origin', '*');
  out.headers.set('X-Content-Type-Options', 'nosniff');
  // Cloudflare's Web Analytics beacon is for the site's pages, never the sandbox host's:
  // no-transform keeps Cloudflare from adding it there.
  if (env.SANDBOX_ORIGIN && url.host === new URL(env.SANDBOX_ORIGIN).host && url.pathname.endsWith('.html')) out.headers.set('Cache-Control', [res.headers.get('Cache-Control'), 'no-transform'].filter(Boolean).join(', '));
  if (url.pathname === '/sandbox.html') out.headers.set('Content-Security-Policy', SANDBOX_POLICY);
  else if (url.pathname.endsWith('.html')) for (const [k, v] of Object.entries(pageHeaders(env.SANDBOX_ORIGIN, true, env.ART_BASE, url.host))) out.headers.set(k, v);
  return out;
}

/** The one World, told which version is asking (see World.fetch); asked again once if the
 *  object it reached was an older one letting go. */
// A pass, checked here (its signature and time) and then, at most once a minute per device
// in this isolate, asked of the World: is the device still its person's? So a removed device
// stops seeing its person's matches within a minute, without the World being asked on every
// look.
const confirmed = new Map();   // `${person} ${device}` -> when the World last said yes
async function stillTheirs(env, pass) {
  const who = env.SESSION_SECRET ? await readPass(pass, env.SESSION_SECRET) : null;
  if (!who) return null;
  const k = `${who.person} ${who.device}`;
  if (Date.now() - (confirmed.get(k) ?? 0) < 60_000) return who;
  const res = await world(env, new Request('https://internal/internal/who', { method: 'POST', body: JSON.stringify({ pass }) })).catch(() => null);
  const ok = res?.ok && (await res.json().catch(() => ({}))).person === who.person;
  if (!ok) { confirmed.delete(k); return null; }
  if (confirmed.size > 5000) confirmed.clear();
  confirmed.set(k, Date.now());
  return who;
}

async function world(env, request) {
  const again = request.clone();   // the first try reads the body
  const ask = (req) => {
    const r = new Request(req);
    if (env.VERSION?.id) r.headers.set('x-gactant-version', env.VERSION.id);
    return env.WORLD.get(env.WORLD.idFromName('world')).fetch(r);
  };
  try { return await ask(request); } catch { return ask(again); }
}

// A look that waits for the next action waits here, in the Worker, asking the match every
// few seconds. An object is billed for every second something is pending in it (on Workers
// Free, about 28 hours of objects a day for the whole account), and waits that sat in the
// matches used it all up (2026-11-03); a Worker waiting on a fetch isn't billed at all.
const LOOK_EVERY_MS = 3000, LOOK_FOR_MS = 25_000;
async function lookAt(env, id, person, after) {
  const match = env.MATCH.get(env.MATCH.idFromName(id));
  const ask = (body) => match.fetch('https://match/look', { method: 'POST', body: JSON.stringify({ person, ...body }) });
  if (after == null) return ask({});
  const until = Date.now() + LOOK_FOR_MS;
  while (Date.now() < until) {
    const res = await ask({ after, wait: false });
    if (!res.ok) return res;
    const text = await res.text();
    if (!text.includes('"same":true')) return new Response(text, res);
    await new Promise((r) => setTimeout(r, LOOK_EVERY_MS));
  }
  return ask({});   // nothing new: how it is now, as a wait that ran out answers
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // One address for each site: https, and the bare domain. Plain http and www. are sent
    // there for good.
    if (!url.host.endsWith('.workers.dev') && (url.protocol === 'http:' || url.host.startsWith('www.'))) {
      return Response.redirect(`https://${url.host.replace(/^www\./, '')}${url.pathname}${url.search}`, 301);
    }
    // The workers.dev address answers only what's running, so a deploy can be checked from
    // networks that block the site's own domain (tools/deploy.mjs).
    // It also takes the admin routes (they need the admin token wherever they're asked), so
    // the tools work from those networks too.
    if (url.host.endsWith('.workers.dev')) {
      if (url.pathname === '/api/config' || url.pathname.startsWith('/api/admin/')) return world(env, request);
      return new Response('gactant lives at https://gactant.com', { status: 404 });
    }
    const sandboxHost = env.SANDBOX_ORIGIN ? new URL(env.SANDBOX_ORIGIN).host : null;
    if (sandboxHost && url.host === sandboxHost) {
      // The sandbox's own domain serves the sandbox, and a page saying what it is (to anyone
      // or anything that wanders onto it: a scanner judging a new domain, say).
      if (url.pathname === '/' || url.pathname === '/index.html') return asset(request, env, '/box/index.html');
      if (url.pathname === '/robots.txt') return asset(request, env, '/box/robots.txt');
      const ok = url.pathname === '/sandbox.html' || url.pathname === '/favicon.svg' || url.pathname.startsWith('/js/') || url.pathname.startsWith('/vendor/');
      return ok ? asset(request, env, url.pathname) : Response.redirect(`${env.SANDBOX_ORIGIN}/`, 302);
    }
    if (url.pathname.startsWith('/art/')) {
      const o = await env.ART.get(url.pathname.slice(5));
      return o ? new Response(o.body, { headers: { 'Content-Type': o.httpMetadata?.contentType ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable', 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' } }) : new Response('not here', { status: 404 });
    }
    if (url.pathname.startsWith('/api/')) {
      if (!sameOrigin(request.headers.get('origin'), url.host)) return json(403, { error: 'the API answers only this site\'s own pages' });
      // Looking at a match (and waiting for its next action) goes straight to the match, so
      // the World isn't asked every time someone's game checks in. An archived match is the
      // World's to answer.
      // Following a match live: a socket straight to it, after checking the pass (sent as a
      // subprotocol, since a browser can't put headers on a WebSocket).
      const live = request.method === 'GET' && url.pathname.match(/^\/api\/matches\/(m-[0-9a-f]{12})\/live$/);
      if (live) {
        if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return json(426, { error: 'this is a WebSocket' });
        const offered = (request.headers.get('sec-websocket-protocol') ?? '').split(',').map((x) => x.trim());
        const who = await stillTheirs(env, offered.find((x) => x.startsWith('v1.')));
        const ask = new Request('https://match/live', request);
        ask.headers.set('x-gactant-person', who?.person ?? '');
        ask.headers.set('x-gactant-device', who?.device ?? '');
        ask.headers.set('x-gactant-until', String(who?.until ?? 0));
        return env.MATCH.get(env.MATCH.idFromName(live[1])).fetch(ask);
      }
      const look = request.method === 'GET' && url.pathname.match(/^\/api\/matches\/(m-[0-9a-f]{12})$/);
      if (look && env.SESSION_SECRET) {
        const who = await stillTheirs(env, request.headers.get('x-gactant-pass'));
        const res = await lookAt(env, look[1], who?.person ?? null, url.searchParams.get('after'));
        if (res.status !== 404) return res;
      }
      return world(env, request);
    }
    return asset(request, env, url.pathname);
  },

  // Hourly: publications that haven't been checked yet get their look, and ludants nobody
  // came back to are cleared away.
  async scheduled(event, env) {
    await world(env, new Request('https://internal/internal/hourly', { method: 'POST' }));
  },
};

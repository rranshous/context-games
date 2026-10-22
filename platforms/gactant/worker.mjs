// gactant, hosted on Cloudflare: the same core.mjs as server.mjs, with a Durable Object
// keeping the data. Deploy with `npx wrangler deploy` (see wrangler.toml).
//
//   the Worker        serves the pages (static assets from public/) and passes /api/* to the world
//   World (one DO)    holds every document in its SQLite storage, and the holds in memory.
//                     Cloudflare keeps it durable and can restore it to any point in the last
//                     30 days, so there's no machine of ours to lose.
//
// Two hostnames: the site, and SANDBOX_ORIGIN, a different registrable domain that serves
// only the sandbox page and its scripts, so a ludant's code runs in its own browser process.

import { DurableObject } from 'cloudflare:workers';
import { makeCheck } from './check.mjs';
import { SANDBOX_POLICY, createCore, pageHeaders, sameOrigin } from './core.mjs';

const json = (code, value) => new Response(JSON.stringify(value), { status: code, headers: { 'Content-Type': 'application/json' } });

export class World extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx; this.env = env;
    const sql = ctx.storage.sql;
    sql.exec('CREATE TABLE IF NOT EXISTS docs (kind TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (kind, id))');
    const store = {
      async get(kind, id) { const rows = sql.exec('SELECT json FROM docs WHERE kind = ? AND id = ?', kind, id).toArray(); return rows.length ? JSON.parse(rows[0].json) : null; },
      async put(kind, id, doc) { sql.exec('INSERT OR REPLACE INTO docs (kind, id, json) VALUES (?, ?, ?)', kind, id, JSON.stringify(doc)); },
      async list(kind) { return sql.exec('SELECT json FROM docs WHERE kind = ?', kind).toArray().map((r) => JSON.parse(r.json)); },
      async remove(kind, id) { sql.exec('DELETE FROM docs WHERE kind = ? AND id = ?', kind, id); },
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
        version: env.VERSION?.id ?? null,   // what this World runs, so a deploy can be checked
        sessionSecret: env.SESSION_SECRET || '',   // signs challenges and passes (people.mjs); a wrangler secret
        // An object, so Cloudflare's Workers Logs index its fields (trouble, where, browser…).
        opsLog: (record) => console.warn(record),
        // Workers AI looks at each publication before it goes public (check.mjs).
        check: makeCheck(env.AI),
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
    try {
      const body = request.method === 'POST' || request.method === 'PUT' ? await request.json().catch(() => ({})) : {};
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
  if (url.pathname === '/sandbox.html') out.headers.set('Content-Security-Policy', SANDBOX_POLICY);
  else if (url.pathname.endsWith('.html')) for (const [k, v] of Object.entries(pageHeaders(env.SANDBOX_ORIGIN, true))) out.headers.set(k, v);
  return out;
}

/** The one World, told which version is asking (see World.fetch); asked again once if the
 *  object it reached was an older one letting go. */
async function world(env, request) {
  const again = request.clone();   // the first try reads the body
  const ask = (req) => {
    const r = new Request(req);
    if (env.VERSION?.id) r.headers.set('x-gactant-version', env.VERSION.id);
    return env.WORLD.get(env.WORLD.idFromName('world')).fetch(r);
  };
  try { return await ask(request); } catch { return ask(again); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
    if (url.pathname.startsWith('/api/')) {
      if (!sameOrigin(request.headers.get('origin'), url.host)) return json(403, { error: 'the API answers only this site\'s own pages' });
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

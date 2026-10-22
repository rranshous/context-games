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
import { SANDBOX_POLICY, createCore, sameOrigin } from './core.mjs';

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
    };
    this.core = createCore({
      store,
      settings: {
        model: env.GACTANT_MODEL || 'anthropic/claude-sonnet-5.5',
        key: env.OPENROUTER_API_KEY || '',
        public: env.GACTANT_PUBLIC === '1',
        adminToken: env.ADMIN_TOKEN || '',
        sandbox: env.SANDBOX_ORIGIN || '',
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
    if (url.pathname === '/internal/check') return json(200, await this.core.checkSome());
    try {
      const body = request.method === 'POST' || request.method === 'PUT' ? await request.json().catch(() => ({})) : {};
      const from = { ip: request.headers.get('cf-connecting-ip') || '' };
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
  if (url.pathname === '/sandbox.html') out.headers.set('Content-Security-Policy', SANDBOX_POLICY);
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
    const sandboxHost = env.SANDBOX_ORIGIN ? new URL(env.SANDBOX_ORIGIN).host : null;
    if (sandboxHost && url.host === sandboxHost) {
      // The sandbox's own domain serves the sandbox and nothing else.
      const ok = url.pathname === '/sandbox.html' || url.pathname.startsWith('/js/') || url.pathname.startsWith('/vendor/');
      return ok ? asset(request, env, url.pathname) : new Response('this domain only runs ludants; gactant is elsewhere', { status: 404 });
    }
    if (url.pathname.startsWith('/api/')) {
      if (!sameOrigin(request.headers.get('origin'), url.host)) return json(403, { error: 'the API answers only this site\'s own pages' });
      return world(env, request);
    }
    return asset(request, env, url.pathname);
  },

  // Hourly: publications that haven't been checked yet get their look.
  async scheduled(event, env) {
    await world(env, new Request('https://internal/internal/check', { method: 'POST' }));
  },
};

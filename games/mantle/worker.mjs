// Mantle, hosted on Cloudflare: the same core.mjs as server.mjs. See wrangler.toml.
//
//   the Worker      serves the pages (static assets from public/), /api/* to the World,
//                   and /art/* from R2 when the pictures have no domain of their own yet
//   World (one DO)  keeps every document (designs, art records, tallies) in its SQLite.
//                   One place for everything, so multiplayer can meet there later.
//   R2 (ART)        keeps every picture. Served from its own custom domain (ART_BASE), the
//                   pictures go through Cloudflare's cache, which is what the CSAM Scanning
//                   Tool looks at; the /art/* fallback here doesn't, so set ART_BASE before
//                   opening to the public.

import { DurableObject } from 'cloudflare:workers';
import { createCore } from './core.mjs';

const artStore = (bucket) => ({
  async put(name, bytes, type) { await bucket.put(name, bytes, { httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' } }); },
  async get(name) { const o = await bucket.get(name); return o ? { body: o.body, type: o.httpMetadata?.contentType ?? 'application/octet-stream' } : null; },
});

export class World extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
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
      art: artStore(env.ART),
      settings: {
        key: env.OPENROUTER_API_KEY || '',
        model: env.MANTLE_MODEL || 'anthropic/claude-sonnet-5.5',
        artModel: env.MANTLE_ART_MODEL || 'google/gemini-3.1-flash-lite-image',
        public: env.MANTLE_PUBLIC === '1',
        secret: env.SESSION_SECRET || '',          // signs commanders' cookies; a wrangler secret
        artBase: env.ART_BASE || '/art/',
        log: (entry) => console.log(entry),
      },
    });
  }

  async fetch(request) {
    return (await this.core.handle(request)) ?? new Response('not here', { status: 404 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // One address for the site: https.
    if (url.protocol === 'http:' && !url.hostname.endsWith('localhost') && url.hostname !== '127.0.0.1') {
      return Response.redirect(`https://${url.host}${url.pathname}${url.search}`, 301);
    }
    if (url.pathname.startsWith('/art/')) {
      const pic = await artStore(env.ART).get(url.pathname.slice(5).replace(/[^a-z0-9.-]/gi, ''));
      return pic ? new Response(pic.body, { headers: { 'content-type': pic.type, 'cache-control': 'public, max-age=31536000, immutable', 'access-control-allow-origin': '*' } }) : new Response('not here', { status: 404 });
    }
    if (url.pathname.startsWith('/api/')) return env.WORLD.get(env.WORLD.idFromName('world')).fetch(request);
    return env.ASSETS.fetch(request);
  },
};

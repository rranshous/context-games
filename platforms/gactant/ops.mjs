// What's going on, for whoever runs the install: traffic counted by the hour, and trouble
// (crashes, faults, failed thinking) grouped by what it says. Both hosts keep it in their
// store, so it costs nothing beyond the store, and every part of it is capped:
//
//   traffic    one doc an hour (`h-2026102214`): { hour, counts: { key: n }, sums: { key: total } },
//              kept 30 days. Counts are held in memory and written at most once a minute.
//   trouble    one doc per kind of trouble (`t-<hash>`): { kind, where, message, sample,
//              count, first, last, browsers, ludants }, the 400 most recently seen kept.
//
// Pages send what they notice to POST events (frame.js, telemetry.js): no names, no chat,
// no prompts, no keys. A day takes at most DAY_EVENTS of them; past that they're counted
// as dropped. Read it all with POST admin/ops (tools/ops.mjs).

const FLUSH_MS = 60_000;
const KEEP_HOURS = 30 * 24;
const KEEP_TROUBLE = 400;
const DAY_EVENTS = 5000;
const TEXT = 400;

const hourOf = (d = new Date()) => d.toISOString().slice(0, 13).replace(/[-T]/g, '');
const clip = (s, n = TEXT) => String(s ?? '').slice(0, n);
// Trouble that differs only in numbers, ids or positions is the same trouble.
const shape = (s) => String(s).replace(/\b[a-z]+-[0-9a-f]{6}\b/g, '<id>').replace(/\d+(\.\d+)?/g, '#').slice(0, 200);
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(16).padStart(8, '0'); };

export function createOps({ store, log = () => {} }) {
  let counts = {}, sums = {}, hour = hourOf(), flushed = Date.now();
  let day = hour.slice(0, 8), dayEvents = 0;

  const count = (key, n = 1) => { counts[key] = (counts[key] ?? 0) + n; };
  const sum = (key, v) => { if (Number.isFinite(v)) sums[key] = (sums[key] ?? 0) + v; };

  async function flush(force = false) {
    const h = hourOf();
    if (!force && h === hour && Date.now() - flushed < FLUSH_MS) return;
    const c = counts, s = sums, at = hour;
    counts = {}; sums = {}; flushed = Date.now();
    if (Object.keys(c).length || Object.keys(s).length) {
      const doc = (await store.get('traffic', `h-${at}`)) ?? { hour: at, counts: {}, sums: {} };
      for (const [k, v] of Object.entries(c)) doc.counts[k] = (doc.counts[k] ?? 0) + v;
      for (const [k, v] of Object.entries(s)) doc.sums[k] = (doc.sums[k] ?? 0) + v;
      await store.put('traffic', `h-${at}`, doc);
    }
    if (h !== hour) {
      hour = h;
      const oldest = hourOf(new Date(Date.now() - KEEP_HOURS * 3600_000));
      for (const d of await store.list('traffic')) if (d.hour < oldest) await store.remove('traffic', `h-${d.hour}`);
    }
  }

  /** One API request, by its route's shape (ids left out). */
  function request(method, parts, status, ms) {
    const [a, b, c] = parts;
    const route = [a, b && (a === 'ludants' || a === 'published' || a === 'log' ? ':id' : b), c].filter(Boolean).join('/');
    count(`api ${method} ${route}`);
    sum(`ms ${method} ${route}`, ms);
    if (status >= 500) count('api 5xx');
    else if (status >= 400) count(`api ${status}`);
  }

  /** Something went wrong. Grouped by kind, where and the shape of what it said. */
  async function trouble({ kind, where, message, sample, browser, ludant }) {
    kind = clip(kind, 24); where = clip(where, 60); message = clip(message);
    const id = `t-${hash(`${kind}|${where}|${shape(message)}`)}`;
    const at = new Date().toISOString();
    const doc = (await store.get('trouble', id)) ?? { id, kind, where, message, sample: clip(sample, 1500), count: 0, first: at, browsers: {}, ludants: [] };
    doc.count++; doc.last = at; doc.message = message;
    if (sample) doc.sample = clip(sample, 1500);
    if (browser) doc.browsers[browser] = (doc.browsers[browser] ?? 0) + 1;
    if (ludant && !doc.ludants.includes(ludant)) doc.ludants = [ludant, ...doc.ludants].slice(0, 5);
    const fresh = doc.count === 1;
    await store.put('trouble', id, doc);
    log({ trouble: kind, where, message, browser, ludant });
    if (fresh) {
      const all = await store.list('trouble');
      if (all.length > KEEP_TROUBLE) for (const d of all.sort((x, y) => x.last.localeCompare(y.last)).slice(0, all.length - KEEP_TROUBLE)) await store.remove('trouble', d.id);
    }
  }

  /** What a page noticed: { browser, mobile, events: [{ kind, where?, message?, sample?, ludant?, ...numbers }] } */
  async function events(body) {
    const browser = clip(body.browser, 20) || 'other';
    const list = Array.isArray(body.events) ? body.events.slice(0, 20) : [];
    const today = hourOf().slice(0, 8);
    if (today !== day) { day = today; dayEvents = 0; }
    for (const e of list) {
      if (dayEvents >= DAY_EVENTS) { count('events dropped'); continue; }
      dayEvents++;
      const kind = clip(e?.kind, 24).replace(/[^a-z0-9-]/g, '');
      if (!kind) continue;
      count(`event ${kind}`);
      count(`browser ${browser}${body.mobile ? ' mobile' : ''} ${kind}`);
      if (kind === 'perf') {
        // How the stage runs, summed so the report can average: per browser and drawing.
        const k = `perf ${browser}${body.mobile ? ' mobile' : ''} ${e.three ? '3d' : '2d'}${e.pixels ? ' pixels' : ''}`;
        count(k);
        for (const f of ['fps', 'pictures', 'trip', 'speed']) sum(`${k} ${f}`, Number(e[f]));
      } else if (['crash', 'fault', 'thinking', 'server'].includes(kind)) {
        await trouble({ kind, where: e.where, message: e.message, sample: e.sample, browser, ludant: /^[a-z0-9-]{1,60}$/.test(e.ludant ?? '') ? e.ludant : null });
      }
    }
    await flush();
    return {};
  }

  /** Everything kept, for tools/ops.mjs. */
  async function read({ days = 2 } = {}) {
    await flush(true);
    const since = hourOf(new Date(Date.now() - days * 86400_000));
    const traffic = (await store.list('traffic')).filter((d) => d.hour >= since).sort((x, y) => x.hour.localeCompare(y.hour));
    const trouble = (await store.list('trouble')).sort((x, y) => y.last.localeCompare(x.last));
    return { now: new Date().toISOString(), traffic, trouble };
  }

  return { count, request, trouble, events, read, flush };
}

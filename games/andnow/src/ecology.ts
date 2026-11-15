// Ecology: who does what to whom in a climb run. Loads a checkpoint, replays it for a while
// with the world's interactions watched, and reports the patterns worth a look:
//   - bites and writes between bodies (predation, parasitism, code written into others),
//   - scavenging (whose dead cells feed whom), and bodies that block each other's moves,
//   - pairs that stay touching and move together (convoys, hitchhikers),
//   - movement: sessile forms, wanderers,
//   - and, for pairs of common body plans that touch, how touching changes each one's
//     survival and births: +/+ mutualism, +/− exploitation, −/− competition, and so on.
//
//   node --max-old-space-size=12288 dist/ecology.mjs <checkpoint.andnow.gz> [--ticks 200] [--top 40] [--every 5] [--out report.json]
//
// A body plan is a body's non-fat cells in its own frame (as in docs/survey.md); it's named
// by its code row (frame row 0) and the rest of its working cells, sorted: `CLDM+BCIMx`.
// "Touching" is 4-neighbour contact; a parent and its own child don't count as touching (a
// body that just divided has its child beside it, and half its food gone with it).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { glyphOf } from './sim/glyphs';
import { loadWorld, readHeader } from './sim/save';
import { CODE, CONFIG, DEBRIS, NONE, Warrior } from './sim/world';

const args = process.argv.slice(2);
const flag = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const R = Number(flag('--ticks', '200')), TOP = Number(flag('--top', '40')), EVERY = Number(flag('--every', '5'));
const out = flag('--out', '');
const src = args[0];
if (!src) { console.log('usage: node dist/ecology.mjs <checkpoint.andnow.gz> [--ticks 200] [--top 40] [--every 5] [--out report.json]'); process.exit(1); }

const t0clock = Date.now();
const bytes = gunzipSync(readFileSync(src));
const query = readHeader(bytes).query;
// (The world's private parts are watched by wrapping its methods on the instance: calls
// inside it go through `this.x`, so they find the wrappers.)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const w = loadWorld(bytes) as any;
const W: number = w.w, FAT = CODE['.'], K = CODE['K'];
const T0: number = w.t;
const link = (id: number) => `http://lilg:8765/?${query}&bake=${dirname(src)}&t=${T0}&pick=${id}`;
const log = (s: string) => console.error(`[${((Date.now() - t0clock) / 1000).toFixed(0)}s] ${s}`);
log(`loaded ${src}: t${T0}, ${w.living().length} alive`);

// ---------- body plans ----------
const planOfId = new Map<number, string>(); // id → plan key (taken at t0, or when first met)
const planKey = (wr: Warrior): string => {
  const cells: number[] = w.cellsOf(wr.id);
  return cells.filter((c) => w.code[c] !== FAT).map((c) => `${(c % W) - wr.ox},${((c / W) | 0) - wr.oy},${glyphOf(w.code[c])}`).sort().join(';');
};
// Every body met, by id: once dead, w.warrior(id) is its lineage's shared tombstone.
const met = new Map<number, Warrior>();
const body = (id: number): Warrior => { let b = met.get(id); if (!b) { b = w.warrior(id) as Warrior; if (b.alive) met.set(id, b); } return b; };
const plan = (wr: Warrior) => { let k = planOfId.get(wr.id); if (k === undefined) { k = planKey(wr); planOfId.set(wr.id, k); } return k; };
const nameOf = (key: string) => {
  const cells = key ? key.split(';').map((s) => { const [x, y, g] = s.split(','); return { x: +x, y: +y, g }; }) : [];
  const row = cells.filter((c) => c.y === 0).sort((a, b) => a.x - b.x).map((c) => c.g).join('');
  const rest = cells.filter((c) => c.y !== 0).map((c) => c.g).sort().join('');
  return rest ? `${row}+${rest}` : row || '(fat only)';
};

const start: Warrior[] = w.living().slice();
for (const b of start) met.set(b.id, b);
for (const b of start) plan(b);
const count = new Map<string, number>();
for (const b of start) count.set(plan(b), (count.get(plan(b)) ?? 0) + 1);
const ranked = [...count].sort((a, b) => b[1] - a[1]);
const rank = new Map(ranked.map(([k], i) => [k, i]));
const label = (key: string) => { const r = rank.get(key); return r !== undefined && r < TOP ? `[${r}] ${nameOf(key)}` : nameOf(key); };
log(`${ranked.length} plans; the top ${TOP} cover ${ranked.slice(0, TOP).reduce((n, [, c]) => n + c, 0)} bodies`);

// The step a body's IP is on (the climb's height bands).
const board = w.board;
const stepOf = (y: number) => { for (let n = board.stepHi; n >= board.stepLo; n--) { const top = board.stepTop[n - board.stepLo], h = board.stepH[n - board.stepLo]; if (y >= top && y < top + h) return n; } return NaN; };
const kin = (a: Warrior, b: Warrior) => a.parent === b.id || b.parent === a.id ? 'parent-child' : a.parent !== undefined && a.parent === b.parent ? 'siblings' : a.lineage === b.lineage ? 'same lineage' : 'other lineage';

// ---------- watching the world ----------
type Tally = Map<string, number>;
const bump = (m: Tally, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}%` : '-');
const pairKey = (a: string, b: string) => `${a}\t${b}`;

const bites = new Map<string, { hits: number; armor: number; killed: number }>(); // plan→plan
const biteEx = new Map<string, { by: number; on: number; t: number }>();
const writes = new Map<string, { n: number; glyphs: Tally; victims: Set<number> }>();
const poisoned = new Map<number, number>(); // body → who last wrote an @ (die) into it
const writeEx = new Map<string, { by: number; on: number; t: number; glyph: string }>();
const lastHarm = new Map<number, { by: number; t: number }>();
const scav: Tally = new Map(); // eater plan → corpse plan ('self', '?' for older dead cells)
const blocks: Tally = new Map();
const deaths = new Map<number, { t: number; reason: string; by?: number }>();
const prov = new Map<number, number>(); // dead cell → the body it came from
const rels = new Map<string, Tally>(); // plan pair → how the bodies were related (parent-child, siblings, …)
const relate = (k: string, a: Warrior, b: Warrior) => { let t = rels.get(k); if (!t) rels.set(k, t = new Map()); bump(t, kin(a, b)); };
const relOf = (k: string) => { const t = rels.get(k); if (!t) return ''; let n = 0; for (const [, x] of t) n += x; return [...t].sort((a, b) => b[1] - a[1]).map(([r, x]) => `${r} ${pct(x, n)}`).join(', '); };

const wrap = (name: string, f: (orig: (...a: unknown[]) => unknown) => (...a: unknown[]) => unknown) => {
  const orig = w[name].bind(w);
  w[name] = f(orig);
};

wrap('opBombAt', (orig) => (wr, x, y) => {
  const by = wr as Warrior, o: number = w.ownerAt(x, y);
  const armored = o >= 0 && w.code[w.idx(x, y)] === K;
  if (o >= 0) plan(body(o)); // (before the bite changes it)
  const ok = orig(wr, x, y);
  if (ok && o >= 0 && o !== by.id) {
    const v = body(o), k = pairKey(plan(by), plan(v));
    const e = bites.get(k) ?? { hits: 0, armor: 0, killed: 0 };
    e.hits++; if (armored) e.armor++; if (!v.alive) e.killed++;
    bites.set(k, e);
    if (!biteEx.has(k)) biteEx.set(k, { by: by.id, on: o, t: w.t });
    relate(k, by, v);
    lastHarm.set(o, { by: by.id, t: w.t });
  }
  return ok;
});
wrap('opWrite', (orig) => (wr, dx, dy, code) => {
  const by = wr as Warrior, [fx, fy] = w.frame(by);
  const o: number = w.ownerAt(fx + (dx as number), fy + (dy as number));
  if (o >= 0) plan(body(o)); // (before the write changes it)
  const ok = orig(wr, dx, dy, code);
  if (ok && o >= 0 && o !== by.id) {
    const v = body(o), k = pairKey(plan(by), plan(v));
    const e = writes.get(k) ?? { n: 0, glyphs: new Map(), victims: new Set<number>() };
    const g = glyphOf(w.code[w.idx(fx + (dx as number), fy + (dy as number))]);
    e.n++; bump(e.glyphs, g); e.victims.add(o);
    if (g === '@') poisoned.set(o, by.id);
    writes.set(k, e);
    if (!writeEx.has(k)) writeEx.set(k, { by: by.id, on: o, t: w.t, glyph: g });
    relate(k, by, v);
    lastHarm.set(o, { by: by.id, t: w.t });
  }
  return ok;
});
wrap('die', (orig) => (wr, reason) => {
  const v = wr as Warrior;
  plan(v); // (before its cells go)
  const h = lastHarm.get(v.id);
  deaths.set(v.id, { t: w.t, reason: String(reason).replace(/ by .*/, '').replace(/ \(.*/, ''), by: h && w.t - h.t <= CONFIG.creditWindow ? h.by : undefined });
  return orig(wr, reason);
});
wrap('destroy', (orig) => (i, by, cause) => {
  const o: number = w.owner[i as number];
  if (o >= 0) plan(body(o)); // (before the cold or a bite takes its cells one by one: a newborn can freeze in its first tick)
  return orig(i, by, cause);
});
wrap('toDebris', (orig) => (i) => {
  const o: number = w.owner[i as number];
  if (o >= 0) plan(body(o));
  const ok = orig(i);
  if (ok && o >= 0) prov.set(i as number, o);
  return ok;
});
wrap('sink', (orig) => (dead) => {
  const cs = dead as number[];
  const was = cs.map((c) => (prov.has(c) && w.owner[c + W] === NONE ? prov.get(c)! : -1));
  const r = orig(dead);
  cs.forEach((c, k) => {
    if (w.owner[c] === DEBRIS) return;
    prov.delete(c);
    if (was[k] >= 0 && w.owner[c + W] === DEBRIS) prov.set(c + W, was[k]);
  });
  return r;
});
wrap('opCollect', (orig) => (wr) => {
  const me = wr as Warrior, near: number[] = [];
  for (const c of w.mineOf(me)) for (const d of [1, -1, W, -W]) if (w.owner[c + d] === DEBRIS) near.push(c + d);
  const ok = orig(wr);
  for (const c of near) {
    if (w.owner[c] === DEBRIS) continue;
    const from = prov.get(c);
    prov.delete(c);
    bump(scav, pairKey(plan(me), from === undefined ? '?' : from === me.id ? 'self' : plan(body(from))));
  }
  return ok;
});
wrap('opShift', (orig) => (wr, d) => {
  const ok = orig(wr, d);
  if (!ok) {
    const me = wr as Warrior, dd = (((d as number) % 4) + 4) % 4, step = [1, W, -1, -W][dd];
    for (const c of w.mineOf(me)) {
      const o = w.owner[c + step];
      if (o >= 0 && o !== me.id) { const v = body(o); const k = pairKey(plan(me), plan(v)); bump(blocks, k); relate(k, me, v); break; }
    }
  }
  return ok;
});

// ---------- the replay ----------
interface Life { step: number; moved: number; net: [number, number]; still: number; births: number; c0: number; food0: number; touch0: Set<number> }
const life = new Map<number, Life>();
const touching = (b: Warrior) => {
  const s = new Set<number>();
  for (const c of w.mineOf(b)) for (const d of [1, -1, W, -W]) {
    const o = w.owner[c + d];
    if (o < 0 || o === b.id) continue;
    const v = body(o);
    if (v.parent === b.id || b.parent === o) continue;
    s.add(o);
  }
  return s;
};
for (const b of start) life.set(b.id, { step: stepOf(b.ipY), moved: 0, net: [0, 0], still: 0, births: 0, c0: b.cellCount, food0: b.stats.collected, touch0: touching(b) });
log('contacts at t0 done');

const pairs = new Map<string, { a: number; b: number; samples: number; together: number }>(); // touching pairs (ids)
const idPair = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
let pos = new Map<number, [number, number]>(start.map((b) => [b.id, [b.ox, b.oy]]));
let alive = new Set(start.map((b) => b.id));
for (let k = 1; k <= R; k++) {
  w.tick();
  const now: Warrior[] = w.living();
  const moved = new Map<number, number>(); // id → dx,dy as one number
  const nextPos = new Map<number, [number, number]>();
  for (const b of now) {
    nextPos.set(b.id, [b.ox, b.oy]);
    const p = pos.get(b.id);
    if (!p) { // newborn
      met.set(b.id, b);
      if (b.parent !== undefined && life.has(b.parent)) life.get(b.parent)!.births++;
      continue;
    }
    const dx = b.ox - p[0], dy = b.oy - p[1];
    const L = life.get(b.id);
    if (dx || dy) { moved.set(b.id, dx * 4096 + dy); if (L) { L.moved += Math.abs(dx) + Math.abs(dy); L.net[0] += dx; L.net[1] += dy; } } else if (L) L.still++;
  }
  // Moving together: two touching bodies that moved the same way this tick.
  for (const [id, m] of moved) {
    const b = body(id);
    for (const o of touching(b)) if (o > id && moved.get(o) === m) {
      const key = idPair(id, o), e = pairs.get(key) ?? { a: id, b: o, samples: 0, together: 0 };
      e.together++; pairs.set(key, e);
    }
  }
  if (k % EVERY === 0) for (const b of now) for (const o of touching(b)) if (o > b.id) {
    const key = idPair(b.id, o), e = pairs.get(key) ?? { a: b.id, b: o, samples: 0, together: 0 };
    e.samples++; pairs.set(key, e);
  }
  pos = nextPos;
  alive = new Set(now.map((b) => b.id));
  if (k % 20 === 0 || k === R) log(`tick ${k}/${R}: ${now.length} alive`);
}

// ---------- the report ----------
const lines: string[] = [];
const say = (s = '') => lines.push(s);
const top = <T>(xs: T[], n: number) => xs.slice(0, n);
say(`# Ecology of ${src} (t${T0}, ${start.length} bodies, replayed ${R} ticks)`);
say();
say(`Plans by count: ${top(ranked, 10).map(([k, n], i) => `[${i}] ${nameOf(k)} (${n})`).join(', ')}`);

// Bites
say(); say('## Bites between bodies');
const biteRows = [...bites].sort((a, b) => b[1].hits - a[1].hits);
if (!biteRows.length) say('None.');
for (const [k, e] of top(biteRows, 15)) {
  const [a, b] = k.split('\t'), ex = biteEx.get(k)!;
  const victim = body(ex.on);
  say(`- ${label(a)} bit ${label(b)} ${e.hits}× (${e.armor} on armor, ${e.killed} kills; ${relOf(k)}). e.g. ${ex.by} → ${ex.on} at t${ex.t}, victim ${victim.alive ? 'survived' : `died: ${deaths.get(ex.on)?.reason}`} · ${link(ex.by)}`);
}

// Writes
say(); say('## Code written into other bodies');
const writeRows = [...writes].sort((a, b) => b[1].n - a[1].n);
if (!writeRows.length) say('None.');
for (const [k, e] of top(writeRows, 15)) {
  const [a, b] = k.split('\t'), ex = writeEx.get(k)!;
  const fates: Tally = new Map(); for (const v of e.victims) bump(fates, deaths.get(v)?.reason ?? 'alive');
  say(`- ${label(a)} wrote into ${label(b)} ${e.n}× (${relOf(k)}), into ${e.victims.size} bodies (now ${[...fates].map(([r, n]) => `${r} ${n}`).join(', ')}), glyphs ${[...e.glyphs].sort((x, y) => y[1] - x[1]).map(([g, n]) => `'${g}'×${n}`).join(' ')}. e.g. ${ex.by} → ${ex.on} at t${ex.t} · ${link(ex.by)}`);
}

// Deaths
say(); say('## Deaths');
const why: Tally = new Map(); let killed = 0;
for (const d of deaths.values()) { bump(why, d.reason); if (d.by !== undefined) killed++; }
let byPoison = 0; for (const [id, d] of deaths) if (d.reason.startsWith('executed') && poisoned.has(id)) byPoison++;
say(`${deaths.size} deaths: ${[...why].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${n}`).join(', ')}. ${killed} within ${CONFIG.creditWindow} ticks of being bitten or written into; ${byPoison} ran an @ another body had written into them.`);

// Scavenging
say(); say('## Scavenging: whose dead cells were eaten');
const eaten: Tally = new Map(), eatenForeign: Tally = new Map();
for (const [k, n] of scav) { const [a, b] = k.split('\t'); bump(eaten, a, n); if (b !== 'self' && b !== '?' && b !== a) bump(eatenForeign, a, n); }
const scavRows = [...scav].filter(([k]) => { const [a, b] = k.split('\t'); return b !== 'self' && b !== '?' && a !== b; }).sort((a, b) => b[1] - a[1]);
let all = 0, own = 0, old = 0, same = 0;
for (const [k, n] of scav) { const [a, b] = k.split('\t'); all += n; if (b === 'self') own += n; else if (b === '?') old += n; else if (a === b) same += n; }
say(`${all} dead cells eaten: ${pct(own, all)} the eater's own, ${pct(same, all)} its own plan's, ${pct(old, all)} older than the replay, ${pct(all - own - old - same, all)} another plan's.`);
for (const [k, n] of top(scavRows, 12)) { const [a, b] = k.split('\t'); say(`- ${label(a)} ate ${n} of ${label(b)}'s dead cells`); }

// Blocking
say(); say("## Blocked moves: one body in another's way");
const blockRows = [...blocks].sort((a, b) => b[1] - a[1]);
let blockAll = 0; for (const [, n] of blocks) blockAll += n;
say(`${blockAll} moves blocked by another body.`);
for (const [k, n] of top(blockRows, 10)) { const [a, b] = k.split('\t'); say(`- ${label(a)} blocked by ${label(b)} ${n}× (${relOf(k)})`); }

// Moving together
say(); say('## Moving together');
const conv = [...pairs.values()].filter((p) => p.together >= 3).sort((a, b) => b.together - a.together);
const convRel: Tally = new Map(), convPlans: Tally = new Map();
for (const p of conv) {
  const a = body(p.a), b = body(p.b);
  bump(convRel, kin(a, b));
  const [x, y] = [label(plan(a)), label(plan(b))].sort();
  bump(convPlans, pairKey(x, y));
}
say(`${conv.length} touching pairs moved together 3+ times (by relation: ${[...convRel].map(([r, n]) => `${r} ${n}`).join(', ') || 'none'}).`);
for (const [k, n] of top([...convPlans].sort((a, b) => b[1] - a[1]), 8)) say(`- ${k.replace('\t', ' with ')}: ${n} pairs`);
say('Longest:');
for (const p of top(conv, 8)) {
  const a = body(p.a), b = body(p.b);
  say(`- ${p.a} (${label(plan(a))}) and ${p.b} (${label(plan(b))}), ${kin(a, b)}: ${p.together} moves together, touching in ${p.samples}/${Math.floor(R / EVERY)} samples · ${link(p.a)}`);
}
const stuck = [...pairs.values()].filter((p) => p.samples >= Math.floor(R / EVERY) * 0.9);
const stuckRel: Tally = new Map();
for (const p of stuck) bump(stuckRel, kin(body(p.a), body(p.b)));
say(`${stuck.length} pairs touched in 90%+ of samples (${[...stuckRel].map(([r, n]) => `${r} ${n}`).join(', ')}).`);

// Movement
say(); say('## Movement by plan (the top plans, alive at t0)');
interface PlanStats { key: string; n: number; moved: number; ticks: number; never: number; net: number; surv: number; births: number }
const ps = new Map<string, PlanStats>();
for (const b of start) {
  const key = plan(b), L = life.get(b.id)!;
  if ((rank.get(key) ?? Infinity) >= TOP) continue;
  const s = ps.get(key) ?? { key, n: 0, moved: 0, ticks: 0, never: 0, net: 0, surv: 0, births: 0 };
  const lived = (deaths.get(b.id)?.t ?? T0 + R) - T0;
  s.n++; s.moved += L.moved; s.ticks += lived; if (!L.moved) s.never++; s.net += Math.hypot(...L.net); if (b.alive) s.surv++; s.births += L.births;
  ps.set(key, s);
}
say('| plan | n | cells moved per 100 ticks | never moved | mean net distance | survived | births per body |');
say('|---|---|---|---|---|---|---|');
for (const s of [...ps.values()].sort((a, b) => b.moved / b.ticks - a.moved / a.ticks)) {
  say(`| ${label(s.key)} | ${s.n} | ${((100 * s.moved) / s.ticks).toFixed(1)} | ${pct(s.never, s.n)} | ${(s.net / s.n).toFixed(1)} | ${pct(s.surv, s.n)} | ${(s.births / s.n).toFixed(2)} |`);
}
const far = start.filter((b) => life.get(b.id)!.moved).sort((a, b) => Math.hypot(...life.get(b.id)!.net) - Math.hypot(...life.get(a.id)!.net));
say('Farthest travellers:');
for (const b of top(far, 5)) { const L = life.get(b.id)!; say(`- ${b.id} (${label(plan(b))}, ${L.c0} cells): ${L.moved} cells moved, net (${L.net[0]}, ${L.net[1]}) · ${link(b.id)}`); }

// Who's good for whom: survival and births when touching, against the same kind alone on the same step.
// By code row, not whole plan: the row is what a body does, and whole plans split too finely
// (s2 has 92,000) for pairs of them to touch often enough to measure.
const sp = (b: Warrior) => nameOf(plan(b)).split('+')[0];
const spCount: Tally = new Map(); for (const b of start) bump(spCount, sp(b));
const spRanked = [...spCount].sort((a, b) => b[1] - a[1]);
const spRank = new Map(spRanked.map(([k], i) => [k, i]));
say(); say("## Who's good for whom");
say('For each pair of the commonest code rows A, B: how B bodies touching an A at t0 did (survived the replay, plus children), against B bodies touching nobody on the same step. z is the mean difference over its standard error.');
interface Out { f: number; step: number }
const outcome = (b: Warrior): Out => ({ f: (b.alive ? 1 : 0) + life.get(b.id)!.births, step: life.get(b.id)!.step });
const alone = new Map<string, { n: number; sum: number; sq: number }>(); // plan|step → fitness stats
const aloneAll = new Map<string, { n: number; sum: number; sq: number }>();
const add = (m: typeof alone, k: string, f: number) => { const e = m.get(k) ?? { n: 0, sum: 0, sq: 0 }; e.n++; e.sum += f; e.sq += f * f; m.set(k, e); };
for (const b of start) {
  const key = sp(b);
  if ((spRank.get(key) ?? Infinity) >= TOP || life.get(b.id)!.touch0.size) continue;
  const o = outcome(b);
  add(alone, `${key}|${o.step}`, o.f); add(aloneAll, key, o.f);
}
const base = (key: string, step: number) => {
  const e = alone.get(`${key}|${step}`), a = aloneAll.get(key);
  const use = e && e.n >= 20 ? e : a && a.n >= 20 ? a : undefined;
  if (!use) return undefined;
  const mean = use.sum / use.n;
  return { mean, se2: Math.max(0, use.sq / use.n - mean * mean) / use.n }; // (and the square of its standard error)
};
const exposed = new Map<string, { n: number; d: number; dd: number; se2: number }>(); // A\tB → effect of A on B: each B's difference from its baseline
for (const b of start) {
  const kb = sp(b);
  if ((spRank.get(kb) ?? Infinity) >= TOP) continue;
  const o = outcome(b), bs = base(kb, o.step);
  if (!bs) continue;
  const partners = new Set<string>();
  for (const id of life.get(b.id)!.touch0) { const ka = sp(body(id)); if ((spRank.get(ka) ?? Infinity) < TOP) partners.add(ka); }
  for (const ka of partners) {
    const k = pairKey(ka, kb), e = exposed.get(k) ?? { n: 0, d: 0, dd: 0, se2: 0 }, d = o.f - bs.mean;
    e.n++; e.d += d; e.dd += d * d; e.se2 += bs.se2;
    exposed.set(k, e);
  }
}
const effect = (a: string, b: string) => {
  const e = exposed.get(pairKey(a, b));
  if (!e || e.n < 20) return undefined;
  // Welch: the exposed bodies' spread, plus the baselines' own uncertainty (averaged over the steps they're on).
  const mean = e.d / e.n, v = Math.max(0, e.dd / e.n - mean * mean) / e.n + e.se2 / e.n;
  return { n: e.n, d: mean, z: v > 1e-9 ? mean / Math.sqrt(v) : 0 };
};
const sign = (x?: { d: number; z: number }) => (!x ? '?' : x.z >= 3 && x.d >= 0.05 ? '+' : x.z <= -3 && x.d <= -0.05 ? '−' : '0');
const KIND: Record<string, string> = { '++': 'mutualism', '+−': 'exploitation', '−+': 'exploitation', '−−': 'competition', '+0': 'commensalism', '0+': 'commensalism', '−0': 'amensalism', '0−': 'amensalism', '00': 'neutral' };
const eco: { a: string; b: string; kind: string; onB?: ReturnType<typeof effect>; onA?: ReturnType<typeof effect> }[] = [];
const keys = spRanked.slice(0, TOP).map(([k]) => k);
for (let i = 0; i < keys.length; i++) for (let j = i; j < keys.length; j++) {
  const a = keys[i], b = keys[j], onB = effect(a, b), onA = effect(b, a);
  if (!onB && !onA) continue;
  const s = sign(onA) + sign(onB);
  eco.push({ a, b, kind: a === b ? `same row: ${sign(onB)}` : KIND[s] ?? `${s} (one side too rare)`, onB, onA });
}
const fmt = (x?: ReturnType<typeof effect>) => (!x ? 'too few' : `${x.d >= 0 ? '+' : ''}${x.d.toFixed(2)} (z ${x.z.toFixed(1)}, n ${x.n})`);
const tally: Tally = new Map(); for (const e of eco) bump(tally, e.kind.replace(/:.*/, ''));
say(`${eco.length} pairs measured: ${[...tally].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}.`);
say('| A | B | kind | A on B | B on A |');
say('|---|---|---|---|---|');
const strength = (e: (typeof eco)[0]) => Math.max(Math.abs(e.onA?.z ?? 0), Math.abs(e.onB?.z ?? 0));
for (const e of eco.filter((x) => !/neutral|same row: 0|same row: \?/.test(x.kind)).sort((x, y) => strength(y) - strength(x)).slice(0, 30)) {
  say(`| ${e.a} (${spCount.get(e.a)}) | ${e.b} (${spCount.get(e.b)}) | ${e.kind} | ${fmt(e.onB)} | ${e.a === e.b ? '' : fmt(e.onA)} |`);
}

say(); say(`(${((Date.now() - t0clock) / 1000).toFixed(0)} s)`);
const text = lines.join('\n');
console.log(text);
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out.replace(/\.json$/, '.md'), text + '\n');
  writeFileSync(out, JSON.stringify({
    src, t: T0, ticks: R, alive: start.length, plans: ranked.slice(0, TOP).map(([k, n]) => ({ key: k, name: nameOf(k), n })),
    bites: biteRows.map(([k, e]) => ({ pair: k.split('\t'), ...e, rel: relOf(k), ex: biteEx.get(k) })),
    writes: writeRows.map(([k, e]) => ({ pair: k.split('\t'), n: e.n, victims: e.victims.size, glyphs: Object.fromEntries(e.glyphs), rel: relOf(k), ex: writeEx.get(k) })),
    deaths: Object.fromEntries(why), scavenging: [...scav].map(([k, n]) => ({ pair: k.split('\t'), n })), blocks: blockRows.map(([k, n]) => ({ pair: k.split('\t'), n, rel: relOf(k) })),
    together: top(conv, 200), movement: [...ps.values()], eco,
  }));
  log(`wrote ${out} and ${out.replace(/\.json$/, '.md')}`);
}

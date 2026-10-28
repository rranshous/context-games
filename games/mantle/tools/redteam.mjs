// Red-team the price. Search each lab's design space for units that win far more than
// their cost should allow, judged the way tools/duel.mjs judges: equal matter's worth of
// each, in open ground, against a fixed field (the rivals' units and duel.mjs's player-like
// ones). A design's score is its average margin over the field, at each budget (a cheap
// swarm and a dear single unit behave differently), averaged.
//
//   node tools/redteam.mjs [--aid hollis|brackett] [--iters 400] [--seed 1]
//                          [--budgets 1500,3000] [--top 5] [--threads N] [--reach]
//                          [--floor speed=3,sight=3]
//
// --reach scores a design only on the duels its rivals can fight back in (melee can't
// touch a flyer), so the search hunts price exploits rather than hard counters.
//
// Search: random designs first, then mutate the best few (a stat up or down, a size step,
// an ability swapped) and keep what scores higher. Duels are noisy, so the search scores
// each design once per budget and the finalists are scored again over more runs.
//
// Two things differ from duel.mjs on purpose:
// - Unit counts are picked so the two sides' matter is close (within ~10%), not rounded
//   from the budget on each side. Otherwise a design priced at 0.5× the budget gets one
//   unit, double its share, and the search finds the rounding instead of the price.
// - A side holds at most the game's supply cap (30). A 40-matter swarm of 75 can't happen
//   in a match, so it shouldn't win one here.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { Sim, rng, SUPPLY_CAP } from '../public/js/sim.js';
import { check, price, STATS } from '../public/js/spec.js';
import { AIDS } from '../public/js/aids.js';
import { UNITS } from './duel.mjs';

const LEVEL = { w: 1400, h: 900, deposits: [], seed: 1 };
const STAT_KEYS = Object.keys(STATS);
const FIELD = Object.entries(UNITS).map(([key, u]) => ({ key, ...u, priced: price(u.spec, u.aid) }));

/** Side counts for a pair: matter as even as can be, near the budget, within supply. */
function counts(ca, sa, cb, sb, budget) {
  let best = null;
  const maxA = Math.max(1, Math.floor(SUPPLY_CAP / sa));
  for (let na = 1; na <= maxA; na++) {
    const nb = Math.min(Math.max(1, Math.round((na * ca) / cb)), Math.max(1, Math.floor(SUPPLY_CAP / sb)));
    const wa = na * ca, wb = nb * cb;
    const off = Math.abs(wa - wb) / Math.max(wa, wb);
    const far = Math.abs(Math.log((wa + wb) / 2 / budget));   // how far from the budget
    const score = (off > 0.1 ? 10 + off : 0) + far;            // even first, then near the budget
    if (!best || score < best.score) best = { na, nb, score };
  }
  return best;
}

/** The duel.mjs harness, with chosen counts and a seeded spawn. + a won, − b won. */
export function duel(a, b, budget, seed) {
  const pa = price(a.spec, a.aid), pb = price(b.spec, b.aid);
  const { na, nb } = counts(pa.cost, pa.supply, pb.cost, pb.supply, budget);
  const real = Math.random;
  Math.random = rng(seed);   // spawn() scatters with Math.random; seeded, a design scores the same twice
  try {
    const sim = new Sim(LEVEL, [{ aid: a.aid, roster: [a] }, { aid: b.aid, roster: [b] }]);
    sim.rocks = [];
    for (const h of sim.hqs) { h.x = -9999; h.y = -9999; h.sight = 0; h.range = 0; }
    const groups = [na, nb].map((n, side) => Array.from({ length: n }, (_, i) =>
      sim.spawn(side, sim.sides[side].roster[0], { x: side ? 900 : 500, y: 450 + (i - n / 2) * 30, r: 0 })));
    for (const side of [0, 1]) sim.command(side, groups[side].map((u) => u.id), { kind: 'fight', x: side ? 400 : 1000, y: 450 });
    for (let t = 0; t < 180 && sim.units(0).length && sim.units(1).length; t += 1 / 20) {
      sim.step(1 / 20);
      sim.hqs.forEach((h) => { h.hp = h.maxHp; });
    }
    const left = (side) => sim.units(side).reduce((n, u) => n + (u.young ? 0 : (u.hp / u.maxHp) * u.design.priced.cost), 0);
    return left(0) / (na * pa.cost) - left(1) / (nb * pb.cost);
  } finally { Math.random = real; }
}

/** A design's margins against the field: per budget, per field unit, averaged over runs. */
export function evaluate(spec, aid, budgets, runs, seed) {
  const me = { name: 'X', aid, spec };
  const per = {};
  for (const B of budgets) {
    per[B] = {};
    for (const f of FIELD) {
      let sum = 0;
      for (let r = 0; r < runs; r++) sum += duel(me, f, B, seed * 7919 + r * 104729 + B);
      per[B][f.key] = sum / runs;
    }
  }
  // A flyer can't be touched by melee at all, so it wins those duels +100 whatever it
  // costs: no price makes up for that. `reach` leaves those duels out, which shows what's
  // left for the price to answer.
  const flies = spec.abilities.includes('wings') || spec.abilities.includes('rotors');
  const reaches = FIELD.filter((f) => !(flies && f.spec.stats.range === 1)).map((f) => f.key);
  const avg = (xs) => xs.reduce((n, x) => n + x, 0) / xs.length;
  const byBudget = Object.fromEntries(budgets.map((B) => [B, avg(Object.values(per[B]))]));
  const reach = avg(budgets.map((B) => avg(reaches.map((k) => per[B][k]))));
  return { score: avg(Object.values(byBudget)), reach, byBudget, per };
}

if (!isMainThread) {
  parentPort.on('message', ({ id, spec, aid, budgets, runs, seed }) =>
    parentPort.postMessage({ id, ...evaluate(spec, aid, budgets, runs, seed) }));
} else if (import.meta.url === `file://${process.argv[1]}`) main();   // importable: evaluate() for one-off checks

async function main() {
  const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
  const aids = arg('--aid') ? [arg('--aid')] : Object.keys(AIDS);
  const ITERS = Number(arg('--iters', 400)), SEED = Number(arg('--seed', 1)), TOP = Number(arg('--top', 5));
  const BUDGETS = arg('--budgets', '1500,3000').split(',').map(Number);
  const THREADS = Number(arg('--threads', Math.max(1, availableParallelism() - 2)));
  const BY = process.argv.includes('--reach') ? 'reach' : 'score';
  // Open-ground duels can't see what speed and sight are for (taking ground, finding the
  // enemy), so left free the search sells them off to buy fight. A floor keeps it honest.
  const FLOOR = Object.fromEntries(arg('--floor', 'speed=3,sight=3').split(',').filter(Boolean).map((x) => x.split('=')).map(([k, v]) => [k, Number(v)]));

  // A small pool of workers: a duel is pure arithmetic, so the search spreads across cores.
  const workers = Array.from({ length: THREADS }, () => new Worker(new URL(import.meta.url), { workerData: {} }));
  const waiting = new Map(); let nextId = 0;
  const idle = [...workers], queue = [];
  const pump = () => { while (idle.length && queue.length) { idle.pop().postMessage(queue.shift().msg); } };
  for (const w of workers) w.on('message', (m) => { waiting.get(m.id)(m); waiting.delete(m.id); idle.push(w); pump(); });
  const score = (spec, aid, runs = 1, seed = SEED) => new Promise((res) => {
    const id = nextId++; waiting.set(id, res); queue.push({ msg: { id, spec, aid, budgets: BUDGETS, runs, seed } }); pump();
  });

  for (const aid of aids) {
    const rand = rng(SEED * 31 + aid.length), lab = Object.keys(AIDS[aid].abilities);
    const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
    const key = (s) => `${s.size}|${STAT_KEYS.map((k) => s.stats[k]).join(',')}|${[...s.abilities].sort().join(',')}`;
    const randomSpec = () => {
      for (;;) {
        const abilities = [...lab].sort(() => rand() - 0.5).slice(0, int(0, 3));
        const s = { size: int(1, 5), stats: Object.fromEntries(STAT_KEYS.map((k) => [k, int(FLOOR[k] ?? 1, 10)])), abilities };
        if (!check(s, aid).length) return s;
      }
    };
    const mutate = (p) => {
      for (;;) {
        const s = { size: p.size, stats: { ...p.stats }, abilities: [...p.abilities] };
        for (let m = int(1, 3); m > 0; m--) {
          const r = rand();
          if (r < 0.65) { const k = STAT_KEYS[int(0, 6)]; s.stats[k] = Math.min(10, Math.max(FLOOR[k] ?? 1, s.stats[k] + (rand() < 0.5 ? -1 : 1) * int(1, 3))); }
          else if (r < 0.8) s.size = Math.min(5, Math.max(1, s.size + (rand() < 0.5 ? -1 : 1)));
          else {
            const a = lab[int(0, lab.length - 1)];
            if (s.abilities.includes(a)) s.abilities = s.abilities.filter((x) => x !== a);
            else if (s.abilities.length < 3) s.abilities.push(a);
            else s.abilities[int(0, 2)] = a;
          }
        }
        if (!check(s, aid).length) return s;
      }
    };

    const seen = new Map();   // key → { spec, score, ... }: never score a design twice
    const run = async (specs) => {
      const fresh = specs.filter((s) => !seen.has(key(s)));
      const done = await Promise.all(fresh.map((s) => score(s, aid)));
      fresh.forEach((s, i) => seen.set(key(s), { spec: s, ...done[i], by: done[i][BY] }));
    };
    const started = Date.now();
    const explore = Math.round(ITERS * 0.3);
    await run(Array.from({ length: explore }, randomSpec));
    // Hill-climb from the best few: each round mutates the current elite, a batch at a time.
    while (seen.size < ITERS) {
      const elite = [...seen.values()].sort((x, y) => y.by - x.by).slice(0, 8);
      await run(Array.from({ length: Math.min(THREADS * 2, ITERS - seen.size) }, () => mutate(elite[int(0, elite.length - 1)].spec)));
    }

    // The finalists, scored again over more runs: the search's lucky draws fall back.
    const finalists = [...seen.values()].sort((x, y) => y.by - x.by).slice(0, TOP * 3);
    const final = (await Promise.all(finalists.map((f) => score(f.spec, aid, 3, SEED + 1000))))
      .map((r, i) => ({ spec: finalists[i].spec, ...r })).sort((x, y) => y[BY] - x[BY]).slice(0, TOP);

    const pct = (x) => `${x > 0 ? '+' : ''}${Math.round(x * 100)}`;
    const show = (s) => `size ${s.size} ${STAT_KEYS.map((k) => `${k.slice(0, 3)} ${s.stats[k]}`).join(' ')}${s.abilities.length ? ` [${s.abilities.join(', ')}]` : ''}`;
    console.log(`\n== ${AIDS[aid].name} (${aid}): ${seen.size} designs in ${((Date.now() - started) / 1000).toFixed(0)}s; budgets ${BUDGETS.join(', ')}; ranked by ${BY === 'reach' ? 'duels it can be hit in' : 'the whole field'}`);
    for (const f of final) {
      const p = price(f.spec, aid);
      console.log(`\n${pct(f[BY]).padStart(4)}  ${show(f.spec)}`);
      console.log(`      cost ${p.cost}, supply ${p.supply}; ${BUDGETS.map((B) => `at ${B}: ${pct(f.byBudget[B])}`).join(', ')}; whole field ${pct(f.score)}, where it can be hit ${pct(f.reach)}`);
      // Beats / loses, by the margin averaged over the budgets.
      const vs = FIELD.map((u) => [u.key, BUDGETS.reduce((n, B) => n + f.per[B][u.key], 0) / BUDGETS.length]).sort((x, y) => y[1] - x[1]);
      console.log(`      beats ${vs.filter(([, m]) => m > 0.1).map(([k, m]) => `${k} ${pct(m)}`).join(', ') || 'nothing'}`);
      console.log(`      loses ${vs.filter(([, m]) => m < -0.1).map(([k, m]) => `${k} ${pct(m)}`).join(', ') || 'nothing'}`);
    }
  }
  for (const w of workers) w.terminate();
}

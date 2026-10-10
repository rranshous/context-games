// MAP-Elites: quality-diversity search for warriors. Instead of one population chasing one
// fitness, keep an archive with one slot per playstyle and the best warrior found for
// each. A poisoner only competes with other poisoners, so different strategies survive
// long enough to get good.
//
// Playstyle (averaged over an individual's games):
//   weapon    none | bomber | mixed | poisoner   (armed at ≥ 0.05 bomb hits + poison writes per game; poison's share)
//   economy   pickups collected per game          (0–½, ½–1, 1–2, 2–4, 4+)
//   mobility  share of games it left its home room (0–¼, ¼–½, ½–¾, ¾–1)
// Fitness: the same match score as evolve.ts, against the benchmarks + elites from other
// slots (duels and free-for-alls).
//
//   node dist/map.mjs --name map1 [--gens 200] [--batch 256] [--seeds 2] [--boards 6]
//                     [--ticks 3000] [--peers 6] [--ffa 4] [--bench warriors,...] [--rng 1]
//                     [--workers 8] [--farm http://host:7700] [--reeval 64]   (elites re-evaluated per generation)
//                     [--overlap 2]   (generations in flight at once, keeps the farm busy)
//
// Writes runs/<name>/log.jsonl and archive.json (every 10 generations and at the end), and
// the best warrior of each weapon class to warriors/evolved/<name>-<class>.warrior.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { basename, join } from 'node:path';
import { isMainThread } from 'node:worker_threads';
import { clone, crossover, fromSpec, Genome, mutate, randomGenome, toText } from './ga/genome';
import { duel, Job, JobResult } from './ga/job';
import { Runner, serveBatches, ThreadPool } from './ga/runner';
import { makeRng } from './sim/rng';
import { parseWarrior } from './sim/warrior-file';

const WEAPONS = ['none', 'bomber', 'mixed', 'poisoner'];
const ECONOMY = [0.5, 1, 2, 4];       // upper bounds; last bin open
const MOBILITY = [0.25, 0.5, 0.75];

interface Elite {
  g: Genome; name: string; text: string; parents: string; gen: number;
  fitness: number; wins: number; games: number;
  scoreSum: number; // fitness = scoreSum / games, over every game it has played (re-evaluations add up)
  desc: { weapon: number; economy: number; mobility: number };
  stats: { hitsPerGame: number; poisonsPerGame: number; collectedPerGame: number; leftRate: number };
}

const bin = (v: number, bounds: number[]) => { let k = 0; while (k < bounds.length && v >= bounds[k]) k++; return k; };
const keyOf = (d: Elite['desc']) => `${d.weapon}-${d.economy}-${d.mobility}`;

function describe(rs: JobResult[]): Pick<Elite, 'desc' | 'stats'> {
  const n = rs.length || 1;
  const hits = rs.reduce((a, r) => a + r.hits, 0) / n;
  const poisons = rs.reduce((a, r) => a + r.poisons, 0) / n;
  const collected = rs.reduce((a, r) => a + r.collected, 0) / n;
  const leftRate = rs.filter((r) => r.left).length / n;
  const attacks = hits + poisons;
  const share = attacks > 0 ? poisons / attacks : 0;
  // Low bar for "armed": a budding poisoner at 0.1 writes/game should get its own slot to
  // improve in, not compete with the pacifists (map1 had the bar at 0.25 and never found
  // a mixed or poisoner warrior).
  const weapon = attacks < 0.05 ? 0 : share < 0.2 ? 1 : share < 0.8 ? 2 : 3;
  return {
    desc: { weapon, economy: bin(collected, ECONOMY), mobility: bin(leftRate, MOBILITY) },
    stats: { hitsPerGame: hits, poisonsPerGame: poisons, collectedPerGame: collected, leftRate },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k: string, d: number) => { const i = args.indexOf(`--${k}`); return i >= 0 ? Number(args[i + 1]) : d; };
  const str = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
  const GENS = opt('gens', 200), BATCH = opt('batch', 256), REEVAL = opt('reeval', 64), OVERLAP = opt('overlap', 2), SEEDS = opt('seeds', 2), BOARDS = opt('boards', 6);
  const TICKS = opt('ticks', 3000), PEERS = opt('peers', 6), FFA = opt('ffa', 4), WORKERS = opt('workers', availableParallelism());
  const NAME = str('name', `map-${Date.now()}`), FARM = str('farm', '');
  const rng = makeRng(opt('rng', 1));
  const runDir = join('runs', NAME);
  mkdirSync(runDir, { recursive: true });

  const benchFiles = str('bench', 'warriors').split(',').flatMap((p) => p.endsWith('.warrior') ? [p]
    : readdirSync(p).filter((f) => f.endsWith('.warrior')).sort().map((f) => join(p, f)));
  const bench = benchFiles.map((f) => readFileSync(f, 'utf8'));

  const pool = new Runner(new ThreadPool(WORKERS), FARM);
  await pool.init();
  console.log(`map-elites ${NAME}: ${GENS} gens × ${BATCH} offspring, ${BOARDS} boards/gen, ${TICKS} ticks, ${WORKERS} threads${FARM ? ` + potluck farm ${FARM}` : ''}`);
  console.log(`niches: ${WEAPONS.length} weapon × ${ECONOMY.length + 1} economy × ${MOBILITY.length + 1} mobility = ${WEAPONS.length * (ECONOMY.length + 1) * (MOBILITY.length + 1)}; benchmarks: ${benchFiles.map((f) => basename(f, '.warrior')).join(', ')}`);

  const archive = new Map<string, Elite>();
  let serial = 0;
  const pick = <T>(xs: T[]) => xs[Math.floor(rng() * xs.length)];

  const saveArchive = () => writeFileSync(join(runDir, 'archive.json'), JSON.stringify(
    [...archive.entries()].map(([k, e]) => ({ niche: k, weapon: WEAPONS[e.desc.weapon], ...e, g: undefined })), null, 1));

  // Each generation: prepare (breed from the archive as it is now, build the jobs), run,
  // file results into the archive. Up to OVERLAP generations are in flight at once, so the
  // next one's work is already out while the last one's stragglers finish: no idle farm at
  // generation boundaries. (Breeding from a slightly older archive costs MAP-Elites nothing.)
  const prepare = (gen: number) => {
    const t0 = Date.now();
    // Candidates: the benchmarks, mutants and random bodies at first; then offspring of
    // elites picked uniformly across the filled slots.
    const cands: { g: Genome; parents: string }[] = [];
    if (archive.size === 0) {
      for (const src of bench) {
        cands.push({ g: fromSpec(parseWarrior(src)), parents: `seed:${parseWarrior(src).name}` });
        const m = fromSpec(parseWarrior(src)); mutate(m, rng);
        cands.push({ g: m, parents: `mutant:${parseWarrior(src).name}` });
      }
      while (cands.length < BATCH) cands.push({ g: randomGenome(rng), parents: 'random' });
    } else {
      const elites = [...archive.values()];
      while (cands.length < BATCH) {
        const p1 = pick(elites);
        if (rng() < 0.3) {
          const p2 = pick(elites);
          const g = crossover(p1.g, p2.g, rng);
          if (rng() < 0.5) mutate(g, rng);
          cands.push({ g, parents: `${p1.name}×${p2.name}` });
        } else {
          const g = clone(p1.g);
          cands.push({ g, parents: `${p1.name}+${mutate(g, rng).join(',')}` });
        }
      }
    }
    // Re-evaluate a sample of current elites too: a slot's score is otherwise one round of
    // games against random opponents, and a lucky round would hold the slot forever.
    const reevals = [...archive.entries()].sort(() => rng() - 0.5).slice(0, REEVAL)
      .map(([key, e]) => ({ g: e.g, parents: e.parents, name: e.name, text: e.text, reeval: key }));
    const inds: { g: Genome; parents: string; name: string; text: string; reeval?: string }[] = [
      ...reevals,
      ...cands.map((c) => { const name = `m${gen}-${serial++}`; return { ...c, name, text: toText(c.g, name) }; }),
    ];

    // Opponents: all benchmarks + PEERS elites from the archive, on rotating boards; plus
    // FFA four-player matches.
    const boardPool = Array.from({ length: BOARDS }, () => 1 + Math.floor(rng() * 1e6));
    const boardsFor = (k: number) => Array.from({ length: SEEDS }, (_, s) => boardPool[(k * SEEDS + s) % BOARDS]);
    const eliteTexts = [...archive.values()].map((e) => e.text);
    const jobs: Job[] = [];
    const counts: number[] = [];
    for (const ind of inds) {
      const opponents = [...bench];
      for (let k = 0; k < PEERS && eliteTexts.length; k++) opponents.push(pick(eliteTexts));
      opponents.forEach((opp, k) => boardsFor(k).forEach((seed, s) => jobs.push(duel(ind.text, opp, seed, s % 2 === 1, TICKS))));
      for (let k = 0; k < FFA; k++) {
        const others = Array.from({ length: 3 }, () => pick(opponents));
        const me = k % 4;
        others.splice(me, 0, ind.text);
        jobs.push({ warriors: others, me, seed: boardPool[k % BOARDS], ticks: TICKS });
      }
      counts.push(opponents.length * SEEDS + FFA);
    }
    return { gen, t0, inds, jobs, counts };
  };

  const file = ({ gen, t0, inds, counts }: ReturnType<typeof prepare>, results: JobResult[], stats: typeof pool.lastStats) => {

    // File each candidate into its slot if it beats the incumbent.
    let at = 0, added = 0, replaced = 0;
    inds.forEach((ind, i) => {
      const rs = results.slice(at, at + counts[i]);
      at += counts[i];
      const sum = rs.reduce((a, r) => a + r.score, 0);
      if (ind.reeval) {
        // Re-evaluations come first in the list, so they update incumbents before this
        // generation's candidates are compared against them.
        const cur = archive.get(ind.reeval);
        if (cur && cur.text === ind.text) {
          cur.scoreSum += sum; cur.games += rs.length; cur.wins += rs.filter((r) => r.win).length;
          cur.fitness = cur.scoreSum / cur.games;
        }
        return;
      }
      const e: Elite = {
        g: ind.g, name: ind.name, text: ind.text, parents: ind.parents, gen,
        fitness: sum / rs.length, scoreSum: sum,
        wins: rs.filter((r) => r.win).length, games: rs.length, ...describe(rs),
      };
      const k = keyOf(e.desc);
      const cur = archive.get(k);
      if (!cur) { archive.set(k, e); added++; } else if (e.fitness > cur.fitness) { archive.set(k, e); replaced++; }
    });

    const elites = [...archive.values()];
    const byWeapon = WEAPONS.map((_, w) => elites.filter((e) => e.desc.weapon === w));
    const best = elites.reduce((a, e) => (e.fitness > a.fitness ? e : a), elites[0]);
    const line = {
      gen, filled: archive.size, added, replaced, best: +best.fitness.toFixed(3),
      mean: +(elites.reduce((a, e) => a + e.fitness, 0) / elites.length).toFixed(3),
      byWeapon: Object.fromEntries(WEAPONS.map((w, k) => [w, { niches: byWeapon[k].length, best: +Math.max(0, ...byWeapon[k].map((e) => e.fitness)).toFixed(2) }])),
      ms: Date.now() - t0, batches: stats,
    };
    appendFileSync(join(runDir, 'log.jsonl'), JSON.stringify(line) + '\n');
    const wb = WEAPONS.map((w, k) => `${w} ${byWeapon[k].length}/${line.byWeapon[w].best.toFixed(2)}`).join('  ');
    console.log(`gen ${String(gen).padStart(3)}  slots ${String(archive.size).padStart(3)} (+${added}, ${replaced} better)  best ${line.best.toFixed(2)}  mean ${line.mean.toFixed(2)}  |  ${wb}  (${line.ms}ms${FARM ? `, farm ${stats.farm}/${stats.farm + stats.local}` : ''})`);
    if (gen % 10 === 9) saveArchive();
  };

  const inflight: Promise<{ p: ReturnType<typeof prepare>; results: JobResult[]; stats: typeof pool.lastStats }>[] = [];
  for (let gen = 0; gen < GENS; gen++) {
    const p = prepare(gen);
    inflight.push(pool.runDetailed(p.jobs).then((r) => ({ p, ...r })));
    if (inflight.length >= OVERLAP) { const x = await inflight.shift()!; file(x.p, x.results, x.stats); }
  }
  while (inflight.length) { const x = await inflight.shift()!; file(x.p, x.results, x.stats); }
  saveArchive();

  // The map: best fitness per slot, one table per weapon class (rows economy, columns mobility).
  console.log('\nthe map (fitness per slot; rows = pickups/game, columns = share of games it left home):');
  const ecoLabels = ['0–½', '½–1', '1–2', '2–4', '4+'], mobLabels = ['0–¼', '¼–½', '½–¾', '¾–1'];
  WEAPONS.forEach((w, wi) => {
    console.log(`\n  ${w}`);
    console.log('         ' + mobLabels.map((l) => l.padStart(6)).join(''));
    ecoLabels.forEach((el, ei) => {
      const row = mobLabels.map((_, mi) => { const e = archive.get(`${wi}-${ei}-${mi}`); return (e ? e.fitness.toFixed(2) : '  · ').padStart(6); });
      console.log(`  ${el.padEnd(6)} ${row.join('')}`);
    });
  });

  // Showcase: the best of each weapon class.
  const outDir = join('warriors', 'evolved');
  mkdirSync(outDir, { recursive: true });
  const manifestPath = join(outDir, 'manifest.json');
  const manifest: string[] = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : [];
  console.log('\nbest of each weapon class:');
  WEAPONS.forEach((w, wi) => {
    const es = [...archive.values()].filter((e) => e.desc.weapon === wi);
    if (!es.length) return;
    const e = es.reduce((a, b) => (b.fitness > a.fitness ? b : a));
    const name = `${NAME}-${w}`;
    writeFileSync(join(outDir, `${name}.warrior`), toText(e.g, name, [
      `map-elites run ${NAME}, slot ${keyOf(e.desc)} (${w}), was ${e.name} (gen ${e.gen}, parents ${e.parents})`,
      `fitness ${e.fitness.toFixed(2)}; ${e.wins}W of ${e.games}; per game: ${e.stats.hitsPerGame.toFixed(2)} bomb hits, ${e.stats.poisonsPerGame.toFixed(2)} poison writes, ${e.stats.collectedPerGame.toFixed(2)} pickups; left home in ${(100 * e.stats.leftRate).toFixed(0)}% of games`,
    ]));
    if (!manifest.includes(`${name}.warrior`)) manifest.push(`${name}.warrior`);
    console.log(`  ${name.padEnd(20)} fitness ${e.fitness.toFixed(2)}  ${e.stats.hitsPerGame.toFixed(2)} hits, ${e.stats.poisonsPerGame.toFixed(2)} poison, ${e.stats.collectedPerGame.toFixed(2)} pickups /game, left home ${(100 * e.stats.leftRate).toFixed(0)}%`);
  });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  pool.close();
}

// Entry: the same file is the main process and each worker.
if (!isMainThread) serveBatches();
else main().catch((e) => { console.error(e); process.exit(1); });

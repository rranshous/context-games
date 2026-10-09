// Genetic search for warriors. Fitness = matches against a fixed benchmark set (the
// hand-written warriors) plus a sample of the hall of fame (past champions), on a few
// fresh boards per generation. Matches run in parallel on worker threads.
//
//   node dist/evolve.mjs --name run1 [--pop 48] [--gens 40] [--seeds 2] [--ticks 1500]
//                        [--hof 3] [--workers 8] [--rng 1]
//
// Writes runs/<name>/log.jsonl (one line per generation) and best-gNNN.warrior files,
// and at the end the top warriors to warriors/evolved/ (+ manifest.json for the viewer).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { basename, join } from 'node:path';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { clone, crossover, fromSpec, Genome, mutate, randomGenome, toSpec, toText } from './ga/genome';
import { runMatch } from './sim/match';
import { makeRng } from './sim/rng';
import { parseWarrior } from './sim/warrior-file';

// ---------- one match, scored from one side ----------

interface Job { a: string; b: string; seed: number; ticks: number; swap: boolean }
interface JobResult { score: number; win: boolean; loss: boolean }

function runJob(j: Job): JobResult {
  const a = parseWarrior(j.a), b = parseWarrior(j.b);
  const specs = j.swap ? [b, a] : [a, b];
  const me = j.swap ? 1 : 0;
  try {
    const { world } = runMatch(specs, j.seed, { tickCap: j.ticks });
    const w = world.warriors[me];
    const r = world.result;
    let score = 0;
    if (r.winner === me) score = r.reason === 'last standing' ? 3 : 2;
    else if (r.winner === null) score = 1;
    // Shaping, so there's a slope before anything can win.
    score += Math.min(0.5, 0.05 * w.stats.collected);
    score += Math.min(1, 0.1 * w.stats.bombHits);
    score += Math.min(1, 0.25 * w.stats.poisonWrites);
    score += 0.5 * ((w.alive ? world.t : w.diedAt ?? 0) / world.t);
    return { score, win: r.winner === me, loss: r.winner !== null && r.winner !== me };
  } catch {
    return { score: 0, win: false, loss: true }; // e.g. doesn't fit the start room
  }
}

// ---------- worker pool ----------

class Pool {
  workers: Worker[];
  constructor(n: number) {
    this.workers = Array.from({ length: n }, () => new Worker(new URL(import.meta.url)));
  }
  async run(jobs: Job[]): Promise<JobResult[]> {
    const n = this.workers.length;
    const chunk = Math.ceil(jobs.length / n);
    const parts = await Promise.all(this.workers.map((w, i) => {
      const slice = jobs.slice(i * chunk, (i + 1) * chunk);
      if (!slice.length) return Promise.resolve([] as JobResult[]);
      return new Promise<JobResult[]>((res) => { w.once('message', res); w.postMessage(slice); });
    }));
    return parts.flat();
  }
  close() { for (const w of this.workers) w.terminate(); }
}

// ---------- the search ----------

interface Individual { g: Genome; name: string; text: string; parents: string; fitness: number; wins: number; losses: number; games: number; benchWins: number }

async function main() {
  const args = process.argv.slice(2);
  const opt = (k: string, d: number) => { const i = args.indexOf(`--${k}`); return i >= 0 ? Number(args[i + 1]) : d; };
  const str = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
  const POP = opt('pop', 48), GENS = opt('gens', 40), SEEDS = opt('seeds', 2), TICKS = opt('ticks', 1500);
  const HOF = opt('hof', 3), ELITE = opt('elite', 4), WORKERS = opt('workers', availableParallelism());
  const NAME = str('name', `run-${Date.now()}`);
  const rng = makeRng(opt('rng', 1));
  const runDir = join('runs', NAME);
  mkdirSync(runDir, { recursive: true });

  const benchFiles = readdirSync('warriors').filter((f) => f.endsWith('.warrior')).sort();
  const bench = benchFiles.map((f) => readFileSync(join('warriors', f), 'utf8'));
  const benchNames = benchFiles.map((f) => basename(f, '.warrior'));
  const hallOfFame: Individual[] = [];

  let serial = 0;
  const make = (g: Genome, parents: string, gen: number): Individual => {
    const name = `g${gen}-${serial++}`;
    return { g, name, text: toText(g, name), parents, fitness: 0, wins: 0, losses: 0, games: 0, benchWins: 0 };
  };

  // Start: mutated copies of the hand-written warriors, plus random bodies.
  let pop: Individual[] = [];
  for (const src of bench) {
    pop.push(make(fromSpec(parseWarrior(src)), `seed:${parseWarrior(src).name}`, 0));
    const m = fromSpec(parseWarrior(src)); mutate(m, rng);
    pop.push(make(m, `mutant:${parseWarrior(src).name}`, 0));
  }
  while (pop.length < POP) pop.push(make(randomGenome(rng), 'random', 0));

  const pool = new Pool(WORKERS);
  console.log(`evolving ${NAME}: pop ${POP}, ${GENS} gens, ${SEEDS} boards/gen, ${TICKS} ticks, ${WORKERS} workers`);
  console.log(`benchmarks: ${benchNames.join(', ')}`);
  let bestEver: Individual | null = null;

  for (let gen = 0; gen < GENS; gen++) {
    const t0 = Date.now();
    const seeds = Array.from({ length: SEEDS }, () => 1 + Math.floor(rng() * 1e6));
    const opponents = [...bench];
    for (let k = 0; k < Math.min(HOF, hallOfFame.length); k++) opponents.push(hallOfFame[Math.floor(rng() * hallOfFame.length)].text);

    const jobs: Job[] = [];
    for (const ind of pop) {
      for (const opp of opponents) {
        seeds.forEach((seed, s) => jobs.push({ a: ind.text, b: opp, seed, ticks: TICKS, swap: s % 2 === 1 }));
      }
    }
    const results = await pool.run(jobs);
    const per = opponents.length * seeds.length;
    pop.forEach((ind, i) => {
      const rs = results.slice(i * per, (i + 1) * per);
      ind.games = rs.length;
      ind.fitness = rs.reduce((a, r) => a + r.score, 0) / rs.length;
      ind.wins = rs.filter((r) => r.win).length;
      ind.losses = rs.filter((r) => r.loss).length;
      ind.benchWins = rs.slice(0, bench.length * seeds.length).filter((r) => r.win).length;
    });
    pop.sort((a, b) => b.fitness - a.fitness);
    const best = pop[0];
    const mean = pop.reduce((a, p) => a + p.fitness, 0) / pop.length;
    if (!bestEver || best.fitness > bestEver.fitness) {
      bestEver = { ...best, g: clone(best.g) };
      writeFileSync(join(runDir, `best-g${String(gen).padStart(3, '0')}.warrior`), toText(best.g, best.name, [
        `evolved: run ${NAME}, generation ${gen}, parents ${best.parents}`,
        `fitness ${best.fitness.toFixed(2)}; ${best.wins}W ${best.losses}L of ${best.games}`,
      ]));
    }
    hallOfFame.push({ ...best, g: clone(best.g) });

    const line = {
      gen, best: +best.fitness.toFixed(3), mean: +mean.toFixed(3), bestName: best.name,
      bestRecord: `${best.wins}W ${best.losses}L/${best.games}`, benchWins: `${best.benchWins}/${bench.length * seeds.length}`,
      cells: best.g.cells.length, parents: best.parents, ms: Date.now() - t0, text: best.text,
    };
    appendFileSync(join(runDir, 'log.jsonl'), JSON.stringify(line) + '\n');
    console.log(`gen ${String(gen).padStart(3)}  best ${line.best.toFixed(2)}  mean ${line.mean.toFixed(2)}  ${line.bestRecord.padEnd(12)} vs bench ${line.benchWins.padEnd(6)} ${line.cells} cells  ${best.parents}  (${line.ms}ms)`);

    // Next generation: elites, then tournament-selected children.
    const select = () => {
      let b = pop[Math.floor(rng() * pop.length)];
      for (let k = 0; k < 2; k++) { const c = pop[Math.floor(rng() * pop.length)]; if (c.fitness > b.fitness) b = c; }
      return b;
    };
    const next: Individual[] = pop.slice(0, ELITE).map((e) => ({ ...e }));
    while (next.length < POP) {
      const p1 = select();
      let g: Genome, parents: string;
      if (rng() < 0.3) {
        const p2 = select();
        g = crossover(p1.g, p2.g, rng);
        parents = `${p1.name}×${p2.name}`;
        if (rng() < 0.5) mutate(g, rng);
      } else {
        g = clone(p1.g);
        parents = `${p1.name}+${mutate(g, rng).join(',')}`;
      }
      next.push(make(g, parents, gen + 1));
    }
    pop = next;
  }

  // Final: re-test the hall of fame on held-out boards against the benchmarks, keep the top.
  const heldOut = Array.from({ length: 10 }, (_, i) => 900001 + i);
  const finalists = [...new Map(hallOfFame.map((h) => [h.text, h])).values()].slice(-15);
  const jobs: Job[] = [];
  for (const f of finalists) for (const b of bench) heldOut.forEach((seed, s) => jobs.push({ a: f.text, b, seed, ticks: TICKS, swap: s % 2 === 1 }));
  const results = await pool.run(jobs);
  pool.close();
  const per = bench.length * heldOut.length;
  const scored = finalists.map((f, i) => {
    const rs = results.slice(i * per, (i + 1) * per);
    const byBench = benchNames.map((n, k) => {
      const r = rs.slice(k * heldOut.length, (k + 1) * heldOut.length);
      return `${n} ${r.filter((x) => x.win).length}-${r.filter((x) => x.loss).length}`;
    });
    return { f, score: rs.reduce((a, r) => a + r.score, 0) / rs.length, wins: rs.filter((r) => r.win).length, byBench };
  }).sort((a, b) => b.score - a.score);

  console.log(`\nheld-out check (10 boards × ${bench.length} benchmarks):`);
  const outDir = join('warriors', 'evolved');
  mkdirSync(outDir, { recursive: true });
  const manifestPath = join(outDir, 'manifest.json');
  const manifest: string[] = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : [];
  scored.slice(0, 3).forEach((s, i) => {
    const name = `${NAME}-${i + 1}`;
    const file = `${name}.warrior`;
    writeFileSync(join(outDir, file), toText(s.f.g, name, [
      `evolved: run ${NAME}, was ${s.f.name} (parents ${s.f.parents})`,
      `held-out vs benchmarks: ${s.wins}/${per} wins; ${s.byBench.join(', ')}`,
    ]));
    if (!manifest.includes(file)) manifest.push(file);
    console.log(`  ${name.padEnd(16)} score ${s.score.toFixed(2)}  ${s.wins}/${per} wins  ${s.byBench.join('  ')}`);
  });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\nwrote top 3 to ${outDir}/, log in ${runDir}/`);
}

// Entry: the same file is the main process and each worker.
if (!isMainThread) {
  parentPort!.on('message', (jobs: Job[]) => parentPort!.postMessage(jobs.map(runJob)));
} else {
  main().catch((e) => { console.error(e); process.exit(1); });
}

// A GA job: one match, scored from one side. Shared by the local worker threads, the
// Potluck farm task (browsers), and anything else that runs matches for the evolver.
import { runMatch } from '../sim/match';
import { parseWarrior } from '../sim/warrior-file';

/** A match: `warriors` in seat order, and which seat is the individual being scored. */
export interface Job { warriors: string[]; me: number; seed: number; ticks: number }
export interface JobResult {
  score: number; win: boolean; loss: boolean; kill: boolean;
  // Playstyle, for quality-diversity search: what this side did in the match.
  hits: number; poisons: number; collected: number; left: boolean;
  morph: number;     // shape changes: cells oozed, flowed or grown
  squeezed: boolean; // the body was mostly inside a passage ≤ 2 wide at some point
  rooms: number;     // other rooms its whole body got into (each counted once per member)
}

export function runJob(j: Job): JobResult {
  const me = j.me;
  try {
    const specs = j.warriors.map((t) => parseWarrior(t));
    const { world } = runMatch(specs, j.seed, { tickCap: j.ticks });
    // My side is my whole lineage (the founder plus anything it DIVIDEd into).
    const team = world.warriors.filter((x) => x.lineage === me);
    const sum = (f: (x: (typeof team)[0]) => number) => team.reduce((a, x) => a + f(x), 0);
    const alive = team.some((x) => x.alive);
    const w = {
      alive, diedAt: alive ? undefined : Math.max(...team.map((x) => x.diedAt ?? 0)),
      leftHomeAt: team.some((x) => x.leftHomeAt !== undefined) ? 0 : undefined,
      stats: {
        collected: sum((x) => x.stats.collected), bombHits: sum((x) => x.stats.bombHits),
        poisonWrites: sum((x) => x.stats.poisonWrites), kills: sum((x) => x.stats.kills),
        morph: sum((x) => x.stats.oozes + x.stats.flows + x.stats.grows), squeezed: sum((x) => x.stats.squeezed), rooms: sum((x) => x.stats.rooms),
      },
    };
    const r = world.result;
    let score = 0;
    if (r.winner === me) score = r.reason === 'last standing' ? 3 : 2;
    else if (r.winner === null) score = 1;
    // Shaping, so there's a slope before anything can win.
    score += Math.min(0.5, 0.05 * w.stats.collected);
    score += Math.min(1, 0.1 * w.stats.bombHits);
    score += Math.min(1, 0.25 * w.stats.poisonWrites);
    score += Math.min(1, 0.5 * w.stats.kills);
    score += Math.min(1, 0.5 * w.stats.rooms); // getting the whole body somewhere else
    score += 0.5 * ((w.alive ? world.t : w.diedAt ?? 0) / world.t);
    return {
      score, win: r.winner === me, loss: r.winner !== null && r.winner !== me,
      kill: world.warriors.some((x) => x.gen === 0 && !world.warriors.some((y) => y.lineage === x.lineage && y.alive)), hits: w.stats.bombHits, poisons: w.stats.poisonWrites,
      collected: w.stats.collected, left: w.leftHomeAt !== undefined,
      morph: w.stats.morph, squeezed: w.stats.squeezed > 0, rooms: w.stats.rooms,
    };
  } catch {
    // e.g. doesn't fit the start room
    return { score: 0, win: false, loss: true, kill: false, hits: 0, poisons: 0, collected: 0, left: false, morph: 0, squeezed: false, rooms: 0 };
  }
}

export function duel(a: string, b: string, seed: number, swap: boolean, ticks: number): Job {
  return { warriors: swap ? [b, a] : [a, b], me: swap ? 1 : 0, seed, ticks };
}

/** A batch of jobs for sending over the wire: each distinct warrior text once, jobs refer to them by index. */
export interface Batch { warriors: string[]; jobs: { w: number[]; me: number; seed: number; ticks: number }[] }

export function toBatches(jobs: Job[], size: number): Batch[] {
  const out: Batch[] = [];
  for (let i = 0; i < jobs.length; i += size) {
    const warriors: string[] = [];
    const at = new Map<string, number>();
    const ref = (t: string) => { if (!at.has(t)) { at.set(t, warriors.length); warriors.push(t); } return at.get(t)!; };
    out.push({ warriors, jobs: jobs.slice(i, i + size).map((j) => ({ w: j.warriors.map(ref), me: j.me, seed: j.seed, ticks: j.ticks })) });
  }
  return out;
}

export function runBatch(b: Batch): JobResult[] {
  return b.jobs.map((j) => runJob({ warriors: j.w.map((k) => b.warriors[k]), me: j.me, seed: j.seed, ticks: j.ticks }));
}

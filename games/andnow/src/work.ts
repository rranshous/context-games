// Units of work that can run anywhere: on a local worker thread or in a Potluck browser
// (src/farm-task.ts). Browser-safe (no Node imports). Each item carries everything it
// needs, settings included, and runs from the default CONFIG, so a thread that ran a
// dish can run a match next.
import { Batch, JobResult, runBatch } from './ga/job';
import { applyDish, dishSnapshot, DishSnapshot, genomeOf } from './sim/dish';
import { summarize, MatchSummary } from './sim/match';
import { parseWarrior } from './sim/warrior-file';
import { CONFIG, World } from './sim/world';

export type Work =
  | { kind: 'matches'; batch: Batch }                                     // GA: one seat scored per match
  | { kind: 'match'; warriors: string[]; names?: string[]; seed: number; ticks: number } // a whole match (tournaments, FFAs)
  | { kind: 'solo'; warrior: string; seed: number; ticks: number }        // one warrior alone (probes)
  | { kind: 'dish'; warriors: string[]; seed: number; ticks: number; report: number; settings: Record<string, string> };

export interface MatchOutcome { summary: MatchSummary; kills: number[] }
export interface SoloOutcome {
  pickups: number; oozes: number; flows: number; grows: number; peak: number; final: number;
  left: boolean; squeezed: boolean; room: boolean; alive: boolean;
}
export interface DishOutcome { founder: string; snapshots: DishSnapshot[]; extinct: boolean }

const DEFAULTS = { ...CONFIG };

export function runWork(w: Work): unknown {
  Object.assign(CONFIG, DEFAULTS);
  switch (w.kind) {
    case 'matches': return runBatch(w.batch) as JobResult[];
    case 'match': return playMatch(w.warriors, w.names, w.seed, w.ticks);
    case 'solo': return playSolo(w.warrior, w.seed, w.ticks);
    case 'dish': return playDish(w);
  }
}

function playMatch(texts: string[], names: string[] | undefined, seed: number, ticks: number): MatchOutcome {
  CONFIG.tickCap = ticks;
  const world = new World(seed, texts.map((t, i) => parseWarrior(t, names?.[i])));
  while (!world.result.over) world.tick();
  return { summary: summarize(world), kills: world.warriors.map((x) => x.stats.kills) };
}

function playSolo(text: string, seed: number, ticks: number): SoloOutcome {
  CONFIG.tickCap = ticks;
  const world = new World(seed, [parseWarrior(text)]);
  let peak = 0;
  const cells = () => world.living().reduce((a, x) => a + x.cellCount, 0);
  while (!world.result.over) { world.tick(); peak = Math.max(peak, cells()); }
  const team = world.warriors, sum = (f: (x: (typeof team)[0]) => number) => team.reduce((a, x) => a + f(x), 0);
  return {
    pickups: sum((x) => x.stats.collected), oozes: sum((x) => x.stats.oozes), flows: sum((x) => x.stats.flows), grows: sum((x) => x.stats.grows),
    peak, final: cells(),
    left: team.some((x) => x.leftHomeAt !== undefined), squeezed: team.some((x) => x.stats.squeezed > 0),
    room: team.some((x) => x.stats.rooms > 0), alive: team.some((x) => x.alive),
  };
}

function playDish(w: Extract<Work, { kind: 'dish' }>): DishOutcome {
  applyDish((k) => w.settings[k] ?? null);
  const specs = w.warriors.map((t) => parseWarrior(t));
  const world = new World(w.seed, specs);
  const founder = genomeOf(world, 0);
  const snapshots: DishSnapshot[] = [];
  while (world.t < w.ticks && world.living().length) {
    world.tick();
    if (world.t % w.report === 0) snapshots.push(dishSnapshot(world, specs.length));
  }
  if (world.t % w.report !== 0) snapshots.push(dishSnapshot(world, specs.length));
  return { founder, snapshots, extinct: world.living().length === 0 };
}

// Running whole matches and round-robin tournaments, headless.
import { WarriorSpec } from './warrior-file';
import { CONFIG, World } from './world';

export interface MatchSummary {
  seed: number;
  ticks: number;
  winner: string | null;
  reason: string;
  warriors: { name: string; alive: boolean; cells: number; executed: number; death?: string }[];
}

export function runMatch(specs: WarriorSpec[], seed: number, opts: { tickCap?: number; onTick?: (w: World) => void } = {}): { world: World; summary: MatchSummary } {
  const prevCap = CONFIG.tickCap;
  if (opts.tickCap) CONFIG.tickCap = opts.tickCap;
  try {
    const world = new World(seed, specs);
    while (!world.result.over) {
      world.tick();
      opts.onTick?.(world);
    }
    return { world, summary: summarize(world) };
  } finally {
    CONFIG.tickCap = prevCap;
  }
}

export function summarize(world: World): MatchSummary {
  return {
    seed: world.seed,
    ticks: world.t,
    winner: world.result.winner === null ? null : world.warriors[world.result.winner].name,
    reason: world.result.reason,
    warriors: world.warriors.map((w) => ({
      name: w.name, alive: w.alive, cells: w.cellCount, executed: w.executed, death: w.deathReason,
    })),
  };
}

export interface TournamentRow { name: string; wins: number; losses: number; draws: number }

/** Every pair, both seatings, over `seeds` boards. */
export function runTournament(specs: WarriorSpec[], seeds: number[], tickCap?: number) {
  const table = new Map<string, TournamentRow>(specs.map((s) => [s.name, { name: s.name, wins: 0, losses: 0, draws: 0 }]));
  const pairs: Record<string, { a: number; b: number; d: number }> = {};
  for (let i = 0; i < specs.length; i++) {
    for (let j = 0; j < specs.length; j++) {
      if (i === j) continue;
      for (const seed of seeds) {
        const { summary } = runMatch([specs[i], specs[j]], seed, { tickCap });
        const a = specs[i].name, b = specs[j].name;
        const key = [a, b].sort().join(' vs ');
        pairs[key] ??= { a: 0, b: 0, d: 0 };
        const [first] = [a, b].sort();
        if (summary.winner === null) {
          table.get(a)!.draws++; table.get(b)!.draws++; pairs[key].d++;
        } else {
          const loser = summary.winner === a ? b : a;
          table.get(summary.winner)!.wins++; table.get(loser)!.losses++;
          if (summary.winner === first) pairs[key].a++; else pairs[key].b++;
        }
      }
    }
  }
  return { table: [...table.values()].sort((x, y) => y.wins - x.wins), pairs };
}

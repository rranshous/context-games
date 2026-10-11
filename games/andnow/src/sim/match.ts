// Running whole matches and round-robin tournaments, headless.
import { makeRng } from './rng';
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

/** Plays a list of matches (each: warriors in seat order, a board seed); outputs in order. */
export type PlayMatches = (games: { specs: WarriorSpec[]; seed: number }[]) => Promise<{ summary: MatchSummary; kills: number[] }[]>;

/** Every pair, both seatings, over `seeds` boards. */
export async function runTournament(specs: WarriorSpec[], seeds: number[], play: PlayMatches) {
  const table = new Map<string, TournamentRow>(specs.map((s) => [s.name, { name: s.name, wins: 0, losses: 0, draws: 0 }]));
  const pairs: Record<string, { a: number; b: number; d: number }> = {};
  const reasons: Record<string, number> = {};
  const games: { specs: WarriorSpec[]; seed: number }[] = [];
  for (let i = 0; i < specs.length; i++) {
    for (let j = 0; j < specs.length; j++) if (i !== j) for (const seed of seeds) games.push({ specs: [specs[i], specs[j]], seed });
  }
  const outcomes = await play(games);
  games.forEach((g, k) => {
    const { summary } = outcomes[k];
    const why = summary.reason.replace(/ \([^)]*\)/g, '');
    reasons[why] = (reasons[why] ?? 0) + 1;
    const a = g.specs[0].name, b = g.specs[1].name;
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
  });
  return { table: [...table.values()].sort((x, y) => y.wins - x.wins), pairs, reasons };
}

export interface FfaRow { name: string; games: number; wins: number; deaths: number; kills: number }

/** `matches` 4-player free-for-alls among random distinct warriors (seeded), seats shuffled. */
export async function runFfa(specs: WarriorSpec[], matches: number, play: PlayMatches, players = 4) {
  const rng = makeRng(12345);
  const rows = new Map<string, FfaRow>(specs.map((s) => [s.name, { name: s.name, games: 0, wins: 0, deaths: 0, kills: 0 }]));
  const reasons: Record<string, number> = {};
  const games: { specs: WarriorSpec[]; seed: number }[] = [];
  for (let m = 0; m < matches; m++) {
    const pool = [...specs];
    const picked: WarriorSpec[] = [];
    while (picked.length < Math.min(players, specs.length)) picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    games.push({ specs: picked, seed: 1000 + m });
  }
  const outcomes = await play(games);
  outcomes.forEach(({ summary, kills }) => {
    const why = summary.reason.replace(/ \([^)]*\)/g, '');
    reasons[why] = (reasons[why] ?? 0) + 1;
    summary.warriors.slice(0, kills.length).forEach((w, k) => {
      const r = rows.get(w.name);
      if (!r || k >= Math.min(players, specs.length)) return; // founders only (DIVIDE children aren't seats)
      r.games++;
      if (!w.alive) r.deaths++;
      r.kills += kills[k];
      if (summary.winner === w.name) r.wins++;
    });
  });
  return { rows: [...rows.values()].sort((a, b) => b.wins / Math.max(1, b.games) - a.wins / Math.max(1, a.games)), reasons };
}

// scoring.ts — In-memory leaderboard and point calculation.

export interface PlayerStats {
  handle: string;
  wins: number;
  losses: number;
  surrenders: number;
  points: number;
  gamesPlayed: number;
}

// Points:
//   Win (opponent dies):       +3
//   Win (opponent surrenders): +2
//   Surrender:                 -1
//   Loss (castle destroyed):   -2
//   Draw:                       0

const stats = new Map<string, PlayerStats>();

function getOrCreate(handle: string): PlayerStats {
  let s = stats.get(handle);
  if (!s) {
    s = { handle, wins: 0, losses: 0, surrenders: 0, points: 0, gamesPlayed: 0 };
    stats.set(handle, s);
  }
  return s;
}

export function recordWin(handle: string, opponentSurrendered: boolean): void {
  const s = getOrCreate(handle);
  s.wins++;
  s.gamesPlayed++;
  s.points += opponentSurrendered ? 2 : 3;
}

export function recordLoss(handle: string): void {
  const s = getOrCreate(handle);
  s.losses++;
  s.gamesPlayed++;
  s.points -= 2;
}

export function recordSurrender(handle: string): void {
  const s = getOrCreate(handle);
  s.surrenders++;
  s.gamesPlayed++;
  s.points -= 1;
}

export function recordDraw(handle: string): void {
  const s = getOrCreate(handle);
  s.gamesPlayed++;
  // 0 points for draw
}

export function getStats(handle: string): PlayerStats | null {
  return stats.get(handle) ?? null;
}

export function getLeaderboard(): PlayerStats[] {
  return Array.from(stats.values())
    .sort((a, b) => b.points - a.points);
}

export function resetScoring(): void {
  stats.clear();
}

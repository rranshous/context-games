// scoring.ts — ELO rating, match history, leaderboard.

export interface PlayerStats {
  handle: string;
  elo: number;
  wins: number;
  losses: number;
  surrenders: number;
  draws: number;
  points: number;
  gamesPlayed: number;
  winStreak: number;
  bestStreak: number;
}

export interface MatchRecord {
  id: string;         // game ID
  timestamp: number;  // Date.now()
  players: { left: string; right: string };
  winner: string | null;
  surrendered: string | null;
  duration: number;   // seconds
  mapSeed: number;
  eloChange: { left: number; right: number };
}

// Points (kept alongside ELO for simple leaderboard):
//   Win (opponent dies):       +3
//   Win (opponent surrenders): +2
//   Surrender:                 -1
//   Loss (castle destroyed):   -2
//   Draw:                       0

const STARTING_ELO = 1000;
const K_FACTOR = 32;

const stats = new Map<string, PlayerStats>();
const matchHistory: MatchRecord[] = [];

function getOrCreate(handle: string): PlayerStats {
  let s = stats.get(handle);
  if (!s) {
    s = {
      handle, elo: STARTING_ELO,
      wins: 0, losses: 0, surrenders: 0, draws: 0,
      points: 0, gamesPlayed: 0,
      winStreak: 0, bestStreak: 0,
    };
    stats.set(handle, s);
  }
  return s;
}

// ELO calculation
function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function updateElo(winner: PlayerStats, loser: PlayerStats, draw: boolean): { winnerDelta: number; loserDelta: number } {
  const expectedW = expectedScore(winner.elo, loser.elo);
  const expectedL = expectedScore(loser.elo, winner.elo);

  if (draw) {
    const deltaW = Math.round(K_FACTOR * (0.5 - expectedW));
    const deltaL = Math.round(K_FACTOR * (0.5 - expectedL));
    winner.elo += deltaW;
    loser.elo += deltaL;
    return { winnerDelta: deltaW, loserDelta: deltaL };
  }

  const deltaW = Math.round(K_FACTOR * (1 - expectedW));
  const deltaL = Math.round(K_FACTOR * (0 - expectedL));
  winner.elo += deltaW;
  loser.elo += deltaL;
  return { winnerDelta: deltaW, loserDelta: deltaL };
}

export function recordGameResult(
  gameId: string,
  leftHandle: string,
  rightHandle: string,
  winner: string | null,
  surrendered: string | null,
  duration: number,
  mapSeed: number,
): MatchRecord {
  const left = getOrCreate(leftHandle);
  const right = getOrCreate(rightHandle);
  let eloChange = { left: 0, right: 0 };

  if (winner === 'draw' || winner === null) {
    // Draw
    const { winnerDelta, loserDelta } = updateElo(left, right, true);
    eloChange = { left: winnerDelta, right: loserDelta };
    left.draws++;
    right.draws++;
    left.winStreak = 0;
    right.winStreak = 0;
  } else {
    const isLeftWinner = winner === leftHandle;
    const winnerStats = isLeftWinner ? left : right;
    const loserStats = isLeftWinner ? right : left;

    const { winnerDelta, loserDelta } = updateElo(winnerStats, loserStats, false);
    eloChange = isLeftWinner
      ? { left: winnerDelta, right: loserDelta }
      : { left: loserDelta, right: winnerDelta };

    winnerStats.wins++;
    winnerStats.winStreak++;
    if (winnerStats.winStreak > winnerStats.bestStreak) {
      winnerStats.bestStreak = winnerStats.winStreak;
    }

    if (surrendered) {
      loserStats.surrenders++;
      winnerStats.points += 2;
      loserStats.points -= 1;
    } else {
      loserStats.losses++;
      winnerStats.points += 3;
      loserStats.points -= 2;
    }
    loserStats.winStreak = 0;
  }

  left.gamesPlayed++;
  right.gamesPlayed++;

  const record: MatchRecord = {
    id: gameId,
    timestamp: Date.now(),
    players: { left: leftHandle, right: rightHandle },
    winner,
    surrendered,
    duration,
    mapSeed,
    eloChange,
  };
  matchHistory.push(record);

  console.log(`[Score] Game ${gameId}: ${winner === 'draw' ? 'draw' : `${winner} wins`} ` +
    `(ELO: ${leftHandle} ${left.elo} [${eloChange.left > 0 ? '+' : ''}${eloChange.left}], ` +
    `${rightHandle} ${right.elo} [${eloChange.right > 0 ? '+' : ''}${eloChange.right}])`);

  return record;
}

export function getStats(handle: string): PlayerStats | null {
  return stats.get(handle) ?? null;
}

export function getLeaderboard(): PlayerStats[] {
  return Array.from(stats.values())
    .sort((a, b) => b.elo - a.elo);
}

export function getMatchHistory(handle?: string, limit = 20): MatchRecord[] {
  let records = matchHistory;
  if (handle) {
    records = records.filter(r =>
      r.players.left === handle || r.players.right === handle
    );
  }
  return records.slice(-limit).reverse(); // newest first
}

export function resetScoring(): void {
  stats.clear();
  matchHistory.length = 0;
}

// bot.ts — Standalone bot process. Connects via HTTP API like any player.
// Usage: node dist/bot.js [--url http://localhost:4000] [--handle BotName] [--difficulty easy|medium|hard]

import {
  type GameState, type Unit, type UnitType, type Side, type GoldMine, type UpgradeId,
  UNIT_STATS, MAP_W, MAP_H, CASTLE_WIDTH, CASTLE_HP,
} from '../shared/types.js';

// --- Config ---
const BASE_URL = process.env.SOD_URL ?? process.argv.find(a => a.startsWith('--url='))?.split('=')[1] ?? 'http://localhost:4000';
const HANDLE = process.env.SOD_HANDLE ?? process.argv.find(a => a.startsWith('--handle='))?.split('=')[1] ?? 'SkyNet';
const DIFFICULTY = (process.env.SOD_DIFFICULTY ?? process.argv.find(a => a.startsWith('--difficulty='))?.split('=')[1] ?? 'medium') as 'easy' | 'medium' | 'hard';

const TICK_MS: Record<string, number> = { easy: 3000, medium: 1500, hard: 500 };
const POLL_MS = TICK_MS[DIFFICULTY];

let token = '';
let currentGameId: string | null = null;
let mySide: Side = 'right';

// --- HTTP helpers ---
async function api(path: string, method = 'GET', body?: any): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 304) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}

// --- Login ---
async function login(): Promise<void> {
  const result = await api('/api/auth/login', 'POST', { handle: HANDLE });
  token = result.token;
  console.log(`[Bot] Logged in as "${HANDLE}" (difficulty: ${DIFFICULTY})`);
}

// --- Find or create a game ---
async function findGame(): Promise<void> {
  // Look for a lobby game to join
  const games = await api('/api/games');
  // Find lobby game created by someone else
  const lobby = games.find((g: any) =>
    g.phase === 'lobby' &&
    g.players.left?.handle !== HANDLE &&
    g.players.right?.handle !== HANDLE
  );

  if (lobby) {
    console.log(`[Bot] Joining game ${lobby.id}...`);
    const state = await api(`/api/games/${lobby.id}/join`, 'POST');
    currentGameId = lobby.id;
    mySide = state.players.left?.handle === HANDLE ? 'left' : 'right';
    console.log(`[Bot] Joined game ${currentGameId} as ${mySide}`);
    return;
  }

  // No games to join — create one and wait
  console.log(`[Bot] No games available, creating one...`);
  const state = await api('/api/games', 'POST', { side: 'right' });
  currentGameId = state.id;
  mySide = 'right';
  console.log(`[Bot] Created game ${currentGameId}, waiting for opponent...`);
}

// --- Bot brain ---
async function think(state: GameState): Promise<void> {
  if (state.phase !== 'playing') return;

  const me = state.players[mySide];
  if (!me) return;

  const myUnits = state.units.filter(u => u.owner === mySide);
  const enemyUnits = state.units.filter(u => u.owner !== mySide && u.owner !== 'neutral');
  const idlePeasants = myUnits.filter(u => u.type === 'peasant' && u.state === 'idle');
  const miners = myUnits.filter(u => u.state === 'mining');

  // --- Economy: send idle peasants to mine ---
  if (idlePeasants.length > 0 && state.mines) {
    const availableMines = state.mines.filter(m =>
      m.remaining > 0 && m.workerIds.length < 3
    );
    if (availableMines.length > 0) {
      // Pick closest mine
      const mine = availableMines.sort((a, b) => {
        const castleX = mySide === 'left' ? CASTLE_WIDTH : MAP_W - CASTLE_WIDTH;
        const dA = Math.abs(a.x - castleX);
        const dB = Math.abs(b.x - castleX);
        return dA - dB;
      })[0];
      const toSend = idlePeasants.slice(0, 3 - mine.workerIds.length);
      if (toSend.length > 0) {
        try {
          await api(`/api/games/${currentGameId}/mine`, 'POST', {
            unitIds: toSend.map(u => u.id),
            mineId: mine.id,
          });
        } catch (_) {}
      }
    }
  }

  // --- Training: spend gold ---
  await trainUnits(state, me);

  // --- Micro: use abilities ---
  await useAbilities(state, myUnits, enemyUnits);

  // --- Upgrades ---
  await researchUpgrades(state, me, myUnits);

  // --- Tactics: redirect idle combat units ---
  await directUnits(state, myUnits, enemyUnits);

  // --- Surrender check ---
  if (DIFFICULTY !== 'easy' && me.castle < CASTLE_HP * 0.55 && me.castle > CASTLE_HP * 0.5) {
    // Consider surrendering if badly outnumbered
    const myPower = myUnits.reduce((s, u) => s + u.hp, 0);
    const enemyPower = enemyUnits.reduce((s, u) => s + u.hp, 0);
    if (enemyPower > myPower * 3) {
      try {
        await api(`/api/games/${currentGameId}/surrender`, 'POST');
        console.log(`[Bot] Surrendered — hopelessly outmatched`);
      } catch (_) {}
    }
  }
}

async function trainUnits(state: GameState, me: any): Promise<void> {
  const gold = me.gold;
  if (gold < 10) return;

  const batch: UnitType[] = [];
  let budget = gold;

  // Strategy varies by difficulty
  const strategy = pickStrategy(state, me);

  for (const unitType of strategy) {
    const cost = UNIT_STATS[unitType].cost;
    if (budget >= cost) {
      batch.push(unitType);
      budget -= cost;
    }
  }

  if (batch.length > 0) {
    try {
      await api(`/api/games/${currentGameId}/train-batch`, 'POST', { unitTypes: batch });
    } catch (_) {}
  }
}

function pickStrategy(state: GameState, me: any): UnitType[] {
  const elapsed = state.elapsed;
  const gold = me.gold;

  if (DIFFICULTY === 'easy') {
    // Random units
    const types: UnitType[] = ['peasant', 'knight', 'archer', 'catapult', 'jester'];
    const result: UnitType[] = [];
    for (let i = 0; i < 5; i++) {
      result.push(types[Math.floor(Math.random() * types.length)]);
    }
    return result;
  }

  // Medium/hard: adapt based on game phase and enemy composition
  const enemyUnits = state.units.filter(u => u.owner !== mySide && u.owner !== 'neutral');
  const enemyKnights = enemyUnits.filter(u => u.type === 'knight').length;
  const enemyArchers = enemyUnits.filter(u => u.type === 'archer').length;
  const enemyPeasants = enemyUnits.filter(u => u.type === 'peasant').length;

  const result: UnitType[] = [];

  // Early game: economy peasants + some military
  if (elapsed < 30) {
    if (gold >= 10) result.push('peasant'); // for mining
    if (gold >= 30) result.push('knight');
    if (gold >= 20) result.push('archer');
    return result;
  }

  // Counter-composition
  if (enemyKnights > 3) {
    // Knights are strong — use archers to outrange
    result.push('archer', 'archer');
    if (gold >= 50) result.push('catapult');
  } else if (enemyArchers > 3) {
    // Archers — rush with knights and peasants
    result.push('knight', 'peasant', 'peasant', 'jester');
  } else if (enemyPeasants > 5) {
    // Peasant spam — knights crush them
    result.push('knight', 'knight');
  } else {
    // Balanced
    result.push('knight', 'archer', 'peasant');
    if (gold >= 80 && elapsed > 60) result.push('catapult');
    if (Math.random() < 0.3) result.push('jester');
  }

  // Hard mode: more aggressive spending
  if (DIFFICULTY === 'hard' && gold > 100) {
    result.push('knight', 'archer');
    if (gold > 150) result.push('catapult');
  }

  return result;
}

async function useAbilities(state: GameState, myUnits: Unit[], enemyUnits: Unit[]): Promise<void> {
  if (DIFFICULTY === 'easy') return; // easy bot doesn't use abilities

  for (const unit of myUnits) {
    if (unit.abilityCooldown > 0) continue;

    switch (unit.type) {
      case 'knight': {
        // Shield wall when surrounded
        const nearbyEnemies = enemyUnits.filter(e =>
          dist(unit.x, unit.y, e.x, e.y) < 3
        ).length;
        if (nearbyEnemies >= 2 && unit.hp < unit.maxHp * 0.7) {
          try { await api(`/api/games/${currentGameId}/ability`, 'POST', { unitId: unit.id }); } catch (_) {}
        }
        break;
      }
      case 'archer': {
        // Volley into enemy clusters
        const cluster = findEnemyCluster(enemyUnits);
        if (cluster && dist(unit.x, unit.y, cluster.x, cluster.y) <= 6) {
          try {
            await api(`/api/games/${currentGameId}/ability`, 'POST', {
              unitId: unit.id, targetX: cluster.x, targetY: cluster.y,
            });
          } catch (_) {}
        }
        break;
      }
      case 'catapult': {
        // Fortify when in range of castle
        const enemyCastleX = mySide === 'left' ? MAP_W - CASTLE_WIDTH / 2 : CASTLE_WIDTH / 2;
        if (dist(unit.x, unit.y, enemyCastleX, MAP_H / 2) < 12 && unit.state !== 'fortified') {
          try { await api(`/api/games/${currentGameId}/ability`, 'POST', { unitId: unit.id }); } catch (_) {}
        }
        break;
      }
      case 'peasant': {
        // Rally when near other peasants and enemies
        const nearbyFriendlyPeasants = myUnits.filter(u =>
          u.type === 'peasant' && u.id !== unit.id && dist(unit.x, unit.y, u.x, u.y) < 5
        ).length;
        const nearbyEnemies = enemyUnits.filter(e => dist(unit.x, unit.y, e.x, e.y) < 5).length;
        if (nearbyFriendlyPeasants >= 2 && nearbyEnemies >= 1) {
          try { await api(`/api/games/${currentGameId}/ability`, 'POST', { unitId: unit.id }); } catch (_) {}
        }
        break;
      }
      case 'jester': {
        // Decoy when near enemies
        const nearbyEnemies = enemyUnits.filter(e => dist(unit.x, unit.y, e.x, e.y) < 4).length;
        if (nearbyEnemies >= 2) {
          try { await api(`/api/games/${currentGameId}/ability`, 'POST', { unitId: unit.id }); } catch (_) {}
        }
        break;
      }
    }
  }
}

async function researchUpgrades(state: GameState, me: any, myUnits: Unit[]): Promise<void> {
  if (DIFFICULTY === 'easy') return;
  if (me.researching) return;
  if (me.gold < 40) return;
  if (state.elapsed < 20) return; // don't rush upgrades

  const have = new Set(me.upgrades as UpgradeId[]);

  // Priority list based on what we're building
  const priorities: UpgradeId[] = [];
  const knightCount = myUnits.filter(u => u.type === 'knight').length;
  const archerCount = myUnits.filter(u => u.type === 'archer').length;
  const peasantCount = myUnits.filter(u => u.type === 'peasant').length;

  // Castle upgrades first
  if (!have.has('castle_reinforce') && me.castle < CASTLE_HP * 0.8) priorities.push('castle_reinforce');
  if (!have.has('castle_arrowslits')) priorities.push('castle_arrowslits');

  // Unit upgrades based on composition
  if (knightCount >= 2 && !have.has('knight_heavy') && !have.has('knight_lancer')) {
    priorities.push(DIFFICULTY === 'hard' ? 'knight_lancer' : 'knight_heavy');
  }
  if (archerCount >= 2 && !have.has('archer_longbow') && !have.has('archer_rapid')) {
    priorities.push(DIFFICULTY === 'hard' ? 'archer_longbow' : 'archer_rapid');
  }
  if (peasantCount >= 3 && !have.has('peasant_militia') && !have.has('peasant_prospector')) {
    const hasMiningPeasants = myUnits.some(u => u.type === 'peasant' && u.state === 'mining');
    priorities.push(hasMiningPeasants ? 'peasant_prospector' : 'peasant_militia');
  }

  for (const id of priorities) {
    if (have.has(id)) continue;
    try {
      await api(`/api/games/${currentGameId}/research`, 'POST', { upgradeId: id });
      console.log(`[Bot] Researching ${id}`);
      break;
    } catch (_) {}
  }
}

async function directUnits(state: GameState, myUnits: Unit[], enemyUnits: Unit[]): Promise<void> {
  // Only redirect idle combat units (not miners)
  const idleCombat = myUnits.filter(u =>
    u.state === 'idle' && u.type !== 'peasant' && !u.isDecoy
  );
  if (idleCombat.length === 0) return;

  // Find target: nearest enemy, or enemy castle
  let targetX: number, targetY: number;

  if (enemyUnits.length > 0 && DIFFICULTY !== 'easy') {
    // Attack nearest visible enemy cluster
    const cluster = findEnemyCluster(enemyUnits);
    if (cluster) {
      targetX = cluster.x;
      targetY = cluster.y;
    } else {
      targetX = enemyUnits[0].x;
      targetY = enemyUnits[0].y;
    }
  } else {
    // March toward enemy castle
    targetX = mySide === 'left' ? MAP_W - CASTLE_WIDTH / 2 : CASTLE_WIDTH / 2;
    targetY = MAP_H / 2;
  }

  try {
    await api(`/api/games/${currentGameId}/attack-move`, 'POST', {
      unitIds: idleCombat.map(u => u.id),
      x: targetX,
      y: targetY,
    });
  } catch (_) {}

  // Also redirect idle peasants that aren't mining toward enemies
  if (DIFFICULTY === 'hard') {
    const idlePeasants = myUnits.filter(u =>
      u.type === 'peasant' && u.state === 'idle' && !u.miningTargetId
    );
    if (idlePeasants.length > 2 && enemyUnits.length > 0) {
      try {
        await api(`/api/games/${currentGameId}/attack-move`, 'POST', {
          unitIds: idlePeasants.map(u => u.id),
          x: targetX,
          y: targetY,
        });
      } catch (_) {}
    }
  }
}

// --- Helpers ---
function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
}

function findEnemyCluster(enemies: Unit[]): { x: number; y: number; count: number } | null {
  if (enemies.length === 0) return null;
  // Simple: find the position with the most enemies within 4 tiles
  let best = { x: enemies[0].x, y: enemies[0].y, count: 1 };
  for (const e of enemies) {
    const nearby = enemies.filter(o => dist(e.x, e.y, o.x, o.y) < 4).length;
    if (nearby > best.count) {
      best = { x: e.x, y: e.y, count: nearby };
    }
  }
  return best;
}

// --- Main loop ---
async function main(): Promise<void> {
  console.log(`[Bot] Surrender or Die Bot starting...`);
  console.log(`[Bot] Server: ${BASE_URL}`);
  console.log(`[Bot] Handle: ${HANDLE}`);
  console.log(`[Bot] Difficulty: ${DIFFICULTY} (poll every ${POLL_MS}ms)`);

  await login();

  // Main loop: find game → play → repeat
  while (true) {
    try {
      if (!currentGameId) {
        await findGame();
      }

      const state = await api(`/api/games/${currentGameId}/state`);
      if (!state) {
        await sleep(POLL_MS);
        continue;
      }

      if (state.phase === 'lobby') {
        // While waiting for our game, check if someone else created a game we can join
        const games = await api('/api/games');
        const otherLobby = games.find((g: any) =>
          g.phase === 'lobby' && g.id !== currentGameId &&
          g.players.left?.handle !== HANDLE &&
          g.players.right?.handle !== HANDLE
        );
        if (otherLobby) {
          console.log(`[Bot] Found another game ${otherLobby.id}, joining instead...`);
          try {
            const joined = await api(`/api/games/${otherLobby.id}/join`, 'POST');
            currentGameId = otherLobby.id;
            mySide = joined.players.left?.handle === HANDLE ? 'left' : 'right';
            console.log(`[Bot] Joined game ${currentGameId} as ${mySide}`);
          } catch (_) {}
        }
        await sleep(2000);
        continue;
      }

      if (state.phase === 'finished') {
        console.log(`[Bot] Game ${currentGameId} finished — ${state.winner} wins`);
        currentGameId = null;
        await sleep(3000); // Brief pause before next game
        continue;
      }

      // Playing — think!
      await think(state);

    } catch (err: any) {
      if (err.message?.includes('not found')) {
        currentGameId = null;
      } else {
        console.error(`[Bot] Error: ${err.message}`);
      }
    }

    await sleep(POLL_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
  console.error('[Bot] Fatal:', err);
  process.exit(1);
});

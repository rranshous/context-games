// app.ts — Express server: auth, lobby, game commands, tick loop, static files

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { SurrenderOrDieServer } from './game-engine.js';
import { login, authMiddleware, resolveToken } from './auth.js';
import { recordWin, recordLoss, recordSurrender, recordDraw, getLeaderboard, getStats } from './scoring.js';
import { TICK_RATE, TICK_DT } from '../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? '4000', 10);

const app = express();
app.use(express.json());

// --- Static files ---
// __dirname is dist/ (where server.js lives). Project root is one level up.
const projectRoot = path.resolve(__dirname, '..');
app.use(express.static(path.join(projectRoot, 'src', 'public')));
app.use('/dist/client', express.static(path.join(projectRoot, 'dist', 'client')));

// --- Game engine ---
const engine = new SurrenderOrDieServer();

// Track finished games to avoid double-scoring
const scoredGames = new Set<string>();

// --- Auth routes ---
app.post('/api/auth/login', (req, res) => {
  try {
    const { handle } = req.body;
    const result = login(handle);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// --- Lobby routes ---
app.get('/api/games', (req, res) => {
  const games = engine.listGames().map(g => ({
    id: g.id,
    phase: g.phase,
    players: {
      left: g.players.left ? { handle: g.players.left.handle } : null,
      right: g.players.right ? { handle: g.players.right.handle } : null,
    },
    elapsed: g.elapsed,
    winner: g.winner,
  }));
  res.json(games);
});

app.post('/api/games', authMiddleware, (req, res) => {
  try {
    const handle = (req as any).playerHandle;
    const side = req.body.side ?? 'left';
    const game = engine.createGame(handle, side);
    res.json(game);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/games/:id/join', authMiddleware, (req, res) => {
  try {
    const handle = (req as any).playerHandle;
    const game = engine.joinGame(req.params.id, handle);
    res.json(game);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// --- Game state (fog-aware: pass auth token to get fog-filtered view) ---
app.get('/api/games/:id/state', (req, res) => {
  const since = parseInt(req.query.since as string);
  if (!isNaN(since)) {
    const currentTick = engine.getGameTick(req.params.id);
    if (currentTick >= 0 && currentTick <= since) {
      res.status(304).end();
      return;
    }
  }
  // If auth header present, return fog-filtered state
  let handle: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    handle = resolveToken(authHeader.slice(7)) ?? undefined;
  }
  const state = engine.getStatus(req.params.id, handle);
  if (!state) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }
  res.json(state);
});

// --- Game commands (all require auth) ---
app.post('/api/games/:id/train', authMiddleware, (req, res) => {
  try {
    const handle = (req as any).playerHandle;
    const { unitType } = req.body;
    const state = engine.trainUnit(req.params.id, handle, unitType);
    res.json(state);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/games/:id/train-batch', authMiddleware, (req, res) => {
  try {
    const handle = (req as any).playerHandle;
    const { unitTypes } = req.body;
    const state = engine.trainBatch(req.params.id, handle, unitTypes);
    res.json(state);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/games/:id/move', authMiddleware, (req, res) => {
  try {
    const handle = (req as any).playerHandle;
    const { unitIds, x, y } = req.body;
    const state = engine.moveUnits(req.params.id, handle, unitIds, x, y);
    res.json(state);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/games/:id/attack-move', authMiddleware, (req, res) => {
  try {
    const handle = (req as any).playerHandle;
    const { unitIds, x, y } = req.body;
    const state = engine.attackMove(req.params.id, handle, unitIds, x, y);
    res.json(state);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/games/:id/attack', authMiddleware, (req, res) => {
  try {
    const handle = (req as any).playerHandle;
    const { unitIds, targetId } = req.body;
    const state = engine.attackTarget(req.params.id, handle, unitIds, targetId);
    res.json(state);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/games/:id/surrender', authMiddleware, (req, res) => {
  try {
    const handle = (req as any).playerHandle;
    const state = engine.surrender(req.params.id, handle);
    res.json(state);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/games/:id/mine', authMiddleware, (req, res) => {
  try {
    const handle = (req as any).playerHandle;
    const { unitIds, mineId } = req.body;
    const state = engine.mineGold(req.params.id, handle, unitIds, mineId);
    res.json(state);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/games/:id/ability', authMiddleware, (req, res) => {
  try {
    const handle = (req as any).playerHandle;
    const { unitId, targetX, targetY } = req.body;
    const state = engine.useAbility(req.params.id, handle, unitId, targetX, targetY);
    res.json(state);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/games/:id/research', authMiddleware, (req, res) => {
  try {
    const handle = (req as any).playerHandle;
    const { upgradeId } = req.body;
    const state = engine.research(req.params.id, handle, upgradeId);
    res.json(state);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// --- Leaderboard ---
app.get('/api/leaderboard', (_req, res) => {
  res.json(getLeaderboard());
});

app.get('/api/players/:handle/stats', (req, res) => {
  const stats = getStats(req.params.handle);
  if (!stats) {
    res.status(404).json({ error: 'Player not found' });
    return;
  }
  res.json(stats);
});

// --- Server-side tick loop ---
function tickAllGames(): void {
  const activeIds = engine.activeGameIds();
  for (const id of activeIds) {
    engine.tick(id);

    // Check if game just ended — score it
    const state = engine.getStatus(id);
    if (state && state.phase === 'finished' && !scoredGames.has(id)) {
      scoredGames.add(id);
      scoreGame(state);
    }
  }
}

function scoreGame(state: import('../shared/types.js').GameState): void {
  const left = state.players.left;
  const right = state.players.right;
  if (!left || !right) return;

  if (state.winner === 'draw') {
    recordDraw(left.handle);
    recordDraw(right.handle);
    console.log(`[Score] Game ${state.id}: draw`);
  } else if (state.surrendered) {
    // Someone surrendered
    recordSurrender(state.surrendered);
    const winner = state.surrendered === left.handle ? right.handle : left.handle;
    recordWin(winner, true);
    console.log(`[Score] Game ${state.id}: ${state.surrendered} surrendered, ${winner} wins (+2)`);
  } else {
    // Castle destroyed
    const winner = state.winner!;
    const loser = winner === left.handle ? right.handle : left.handle;
    recordWin(winner, false);
    recordLoss(loser);
    console.log(`[Score] Game ${state.id}: ${winner} wins (+3), ${loser} loses (-2)`);
  }
}

setInterval(tickAllGames, 1000 / TICK_RATE);

// --- Start ---
app.listen(PORT, () => {
  console.log(`[SoD] Surrender or Die server running on http://localhost:${PORT}`);
  console.log(`[SoD] API: http://localhost:${PORT}/api/`);
  console.log(`[SoD] Tick rate: ${TICK_RATE} Hz`);
});

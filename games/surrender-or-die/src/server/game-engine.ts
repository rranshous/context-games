// game-engine.ts — Pure game state machine. No rendering, no AI knowledge.
// Features: terrain, fog of war, gold mines, abilities, upgrades, random events.

import {
  type GameState, type ClientGameState, type Unit, type Player, type Side, type UnitType,
  type Terrain, type GoldMine, type UpgradeId, type GameEvent, type EventType,
  UNIT_STATS, TERRAIN_PROPS, ABILITY_DEFS, UPGRADES, EVENT_DEFS, EVENT_INTERVAL,
  MAP_W, MAP_H, CASTLE_HP, CASTLE_WIDTH,
  SPAWN_LEFT_X, SPAWN_RIGHT_X,
  STARTING_GOLD, GOLD_PER_SECOND, MAX_GOLD,
  TICK_RATE, TICK_DT, GAME_DURATION,
  BASE_VISION, CASTLE_VISION,
  MINE_RATE, MAX_WORKERS_PER_MINE,
} from '../shared/types.js';
import { generateMap } from './map-gen.js';

let nextGameId = 1;

export class SurrenderOrDieServer {
  private games: Map<string, GameState> = new Map();

  // --- Lifecycle ---

  createGame(playerHandle: string, side: Side = 'left'): GameState {
    const id = `g${nextGameId++}`;
    const map = generateMap();
    const player: Player = {
      handle: playerHandle,
      side,
      gold: STARTING_GOLD,
      castle: CASTLE_HP,
      upgrades: [],
      researching: null,
    };
    const game: GameState = {
      id,
      phase: 'lobby',
      tick: 0,
      elapsed: 0,
      players: {
        left: side === 'left' ? player : null,
        right: side === 'right' ? player : null,
      },
      units: [],
      terrain: map.terrain,
      mines: map.mines,
      winner: null,
      surrendered: null,
      log: [],
      nextUnitId: 1,
      mapSeed: map.seed,
      activeEvent: null,
      nextEventTick: EVENT_INTERVAL * TICK_RATE,
    };
    this.games.set(id, game);
    this.addLog(game, `${playerHandle} created the game (${side} castle, seed ${map.seed})`);
    return this.snapshot(game);
  }

  joinGame(gameId: string, playerHandle: string): GameState {
    const game = this.getGameOrThrow(gameId);
    if (game.phase !== 'lobby') throw new Error(`Game is not in lobby`);

    const openSide: Side = game.players.left === null ? 'left' : 'right';
    if (game.players[openSide] !== null) throw new Error(`Game is full`);

    const existing = openSide === 'left' ? game.players.right : game.players.left;
    if (existing && existing.handle === playerHandle) throw new Error(`Cannot play against yourself`);

    game.players[openSide] = {
      handle: playerHandle,
      side: openSide,
      gold: STARTING_GOLD,
      castle: CASTLE_HP,
      upgrades: [],
      researching: null,
    };
    game.phase = 'playing';
    this.addLog(game, `${playerHandle} joined (${openSide} castle) — FIGHT!`);
    return this.snapshot(game);
  }

  // --- Orders ---

  trainUnit(gameId: string, playerHandle: string, unitType: UnitType): GameState {
    const game = this.getGameOrThrow(gameId);
    if (game.phase !== 'playing') throw new Error(`Game is not active`);
    const player = this.getPlayer(game, playerHandle);
    const stats = UNIT_STATS[unitType];
    if (!stats) throw new Error(`Unknown unit type: ${unitType}`);
    if (player.gold < stats.cost) throw new Error(`Not enough gold (have ${Math.floor(player.gold)}, need ${stats.cost})`);

    player.gold -= stats.cost;
    const unit = this.spawnUnit(game, unitType, player.side, player);
    this.addLog(game, `${playerHandle} trained a ${unitType} [#${unit.id}]`);
    return this.snapshot(game);
  }

  trainBatch(gameId: string, playerHandle: string, unitTypes: UnitType[]): GameState {
    const game = this.getGameOrThrow(gameId);
    if (game.phase !== 'playing') throw new Error(`Game is not active`);
    const player = this.getPlayer(game, playerHandle);
    const trained: string[] = [];

    for (const unitType of unitTypes) {
      const stats = UNIT_STATS[unitType];
      if (!stats) continue;
      if (player.gold < stats.cost) continue;
      player.gold -= stats.cost;
      this.spawnUnit(game, unitType, player.side, player);
      trained.push(unitType);
    }

    if (trained.length > 0) {
      this.addLog(game, `${playerHandle} trained: ${trained.join(', ')}`);
    }
    return this.snapshot(game);
  }

  moveUnits(gameId: string, playerHandle: string, unitIds: number[], targetX: number, targetY: number): GameState {
    const game = this.getGameOrThrow(gameId);
    if (game.phase !== 'playing') throw new Error(`Game is not active`);
    const player = this.getPlayer(game, playerHandle);

    const tx = Math.max(0, Math.min(MAP_W, targetX));
    const ty = Math.max(0, Math.min(MAP_H, targetY));

    for (const unit of game.units) {
      if (unitIds.includes(unit.id) && unit.owner === player.side) {
        unit.targetX = tx;
        unit.targetY = ty;
        unit.attackTargetId = null;
        unit.miningTargetId = null;
        unit.isAttackMove = false;
        unit.state = 'moving';
      }
    }
    return this.snapshot(game);
  }

  attackMove(gameId: string, playerHandle: string, unitIds: number[], targetX: number, targetY: number): GameState {
    const game = this.getGameOrThrow(gameId);
    if (game.phase !== 'playing') throw new Error(`Game is not active`);
    const player = this.getPlayer(game, playerHandle);

    const tx = Math.max(0, Math.min(MAP_W, targetX));
    const ty = Math.max(0, Math.min(MAP_H, targetY));

    for (const unit of game.units) {
      if (unitIds.includes(unit.id) && unit.owner === player.side) {
        unit.targetX = tx;
        unit.targetY = ty;
        unit.attackTargetId = null;
        unit.miningTargetId = null;
        unit.isAttackMove = true;
        unit.state = 'moving';
      }
    }
    return this.snapshot(game);
  }

  attackTarget(gameId: string, playerHandle: string, unitIds: number[], targetUnitId: number): GameState {
    const game = this.getGameOrThrow(gameId);
    if (game.phase !== 'playing') throw new Error(`Game is not active`);
    const player = this.getPlayer(game, playerHandle);

    const target = game.units.find(u => u.id === targetUnitId);
    if (!target) throw new Error(`Target unit ${targetUnitId} not found`);
    if (target.owner === player.side) throw new Error(`Cannot attack your own units`);

    for (const unit of game.units) {
      if (unitIds.includes(unit.id) && unit.owner === player.side) {
        unit.attackTargetId = targetUnitId;
        unit.miningTargetId = null;
        unit.state = 'moving';
      }
    }
    return this.snapshot(game);
  }

  // --- Mining ---
  mineGold(gameId: string, playerHandle: string, unitIds: number[], mineId: number): GameState {
    const game = this.getGameOrThrow(gameId);
    if (game.phase !== 'playing') throw new Error(`Game is not active`);
    const player = this.getPlayer(game, playerHandle);
    const mine = game.mines.find(m => m.id === mineId);
    if (!mine) throw new Error(`Mine ${mineId} not found`);

    for (const unit of game.units) {
      if (unitIds.includes(unit.id) && unit.owner === player.side && unit.type === 'peasant') {
        unit.miningTargetId = mineId;
        unit.attackTargetId = null;
        unit.targetX = mine.x;
        unit.targetY = mine.y;
        unit.state = 'moving';
      }
    }
    return this.snapshot(game);
  }

  // --- Abilities ---
  useAbility(gameId: string, playerHandle: string, unitId: number, targetX?: number, targetY?: number): GameState {
    const game = this.getGameOrThrow(gameId);
    if (game.phase !== 'playing') throw new Error(`Game is not active`);
    const player = this.getPlayer(game, playerHandle);
    const unit = game.units.find(u => u.id === unitId && u.owner === player.side);
    if (!unit) throw new Error(`Unit ${unitId} not found or not yours`);
    if (unit.abilityCooldown > 0) throw new Error(`Ability on cooldown (${Math.ceil(unit.abilityCooldown / TICK_RATE)}s)`);

    const abilityDef = ABILITY_DEFS[unit.type];
    unit.abilityCooldown = abilityDef.cooldown * TICK_RATE;

    switch (abilityDef.type) {
      case 'rally': {
        // Buff nearby peasants with speed boost
        for (const other of game.units) {
          if (other.owner === unit.owner && other.type === 'peasant' &&
              this.distance(unit.x, unit.y, other.x, other.y) <= 5) {
            other.abilityActive = true;
            other.abilityUntil = game.tick + abilityDef.duration * TICK_RATE;
          }
        }
        this.addLog(game, `Peasant #${unit.id} rallies nearby peasants!`);
        break;
      }
      case 'shield_wall': {
        unit.abilityActive = true;
        unit.abilityUntil = game.tick + abilityDef.duration * TICK_RATE;
        unit.state = 'fortified';
        this.addLog(game, `Knight #${unit.id} raises shield wall!`);
        break;
      }
      case 'volley': {
        // Area damage at target location
        const vx = targetX ?? unit.x;
        const vy = targetY ?? unit.y;
        const volleyRange = UNIT_STATS.archer.range + (player.upgrades.includes('archer_longbow') ? 2 : 0);
        if (this.distance(unit.x, unit.y, vx, vy) > volleyRange + 1) {
          throw new Error('Target out of range');
        }
        let hits = 0;
        for (const other of game.units) {
          if (other.owner !== unit.owner && other.hp > 0 &&
              this.distance(vx, vy, other.x, other.y) <= 3) {
            other.hp -= Math.floor(UNIT_STATS.archer.damage * 0.7);
            hits++;
          }
        }
        this.addLog(game, `Archer #${unit.id} fires volley! Hit ${hits} units`);
        break;
      }
      case 'fortify': {
        unit.abilityActive = true;
        unit.abilityUntil = game.tick + abilityDef.duration * TICK_RATE;
        unit.state = 'fortified';
        this.addLog(game, `Catapult #${unit.id} fortifies! Double range and damage`);
        break;
      }
      case 'decoy': {
        // Spawn a fake unit nearby
        const decoy = this.spawnUnit(game, 'jester', unit.owner as Side, player);
        decoy.isDecoy = true;
        decoy.decoyUntil = game.tick + abilityDef.duration * TICK_RATE;
        decoy.hp = 1;
        decoy.maxHp = 1;
        // Place near the jester
        decoy.x = unit.x + (Math.random() - 0.5) * 2;
        decoy.y = unit.y + (Math.random() - 0.5) * 2;
        decoy.targetX = unit.targetX;
        decoy.targetY = unit.targetY;
        this.addLog(game, `Jester #${unit.id} deploys a decoy!`);
        break;
      }
    }
    return this.snapshot(game);
  }

  // --- Upgrades ---
  research(gameId: string, playerHandle: string, upgradeId: UpgradeId): GameState {
    const game = this.getGameOrThrow(gameId);
    if (game.phase !== 'playing') throw new Error(`Game is not active`);
    const player = this.getPlayer(game, playerHandle);

    if (player.researching) throw new Error(`Already researching ${player.researching.id}`);
    if (player.upgrades.includes(upgradeId)) throw new Error(`Already have ${upgradeId}`);

    const def = UPGRADES.find(u => u.id === upgradeId);
    if (!def) throw new Error(`Unknown upgrade: ${upgradeId}`);
    if (def.exclusive && player.upgrades.includes(def.exclusive)) {
      throw new Error(`Cannot research — conflicts with ${def.exclusive}`);
    }
    if (def.requires && !player.upgrades.includes(def.requires)) {
      throw new Error(`Requires ${def.requires} first`);
    }
    if (player.gold < def.cost) throw new Error(`Not enough gold (have ${Math.floor(player.gold)}, need ${def.cost})`);

    player.gold -= def.cost;
    player.researching = {
      id: upgradeId,
      completeTick: game.tick + def.researchTime * TICK_RATE,
    };
    this.addLog(game, `${playerHandle} researching ${def.name}...`);
    return this.snapshot(game);
  }

  surrender(gameId: string, playerHandle: string): GameState {
    const game = this.getGameOrThrow(gameId);
    if (game.phase !== 'playing') throw new Error(`Game is not active`);
    const player = this.getPlayer(game, playerHandle);

    if (player.castle <= CASTLE_HP * 0.5) {
      throw new Error(`Cannot surrender — castle HP too low (must be above 50%). Fight or die!`);
    }

    const opponent = player.side === 'left' ? game.players.right : game.players.left;
    game.phase = 'finished';
    game.winner = opponent?.handle ?? 'draw';
    game.surrendered = playerHandle;
    this.addLog(game, `${playerHandle} SURRENDERS! ${game.winner} wins!`);
    return this.snapshot(game);
  }

  // --- Status (with fog of war) ---

  getStatus(gameId: string, forHandle?: string): GameState | null {
    const game = this.games.get(gameId);
    if (!game) return null;
    if (!forHandle || game.phase !== 'playing') return this.snapshot(game);

    // Apply fog of war
    const player = this.tryGetPlayer(game, forHandle);
    if (!player) return this.snapshot(game);

    return this.fogFilteredState(game, player.side);
  }

  // Full state (no fog) for spectators / lobby
  getStatusFull(gameId: string): GameState | null {
    const game = this.games.get(gameId);
    return game ? this.snapshot(game) : null;
  }

  listGames(): GameState[] {
    return Array.from(this.games.values()).map(g => ({
      ...this.snapshot(g),
      // Don't send full terrain/units in list — just metadata
      units: [],
      terrain: [],
      mines: [],
    }));
  }

  activeGameIds(): string[] {
    return Array.from(this.games.entries())
      .filter(([_, g]) => g.phase === 'playing')
      .map(([id]) => id);
  }

  getGameTick(gameId: string): number {
    const game = this.games.get(gameId);
    return game ? game.tick : -1;
  }

  // --- Simulation ---

  tick(gameId: string): void {
    const game = this.getGameOrThrow(gameId);
    if (game.phase !== 'playing') return;

    game.tick++;
    game.elapsed = game.tick / TICK_RATE;

    // Income (passive + mines)
    this.applyIncome(game);
    this.applyMining(game);

    // Research completion
    this.checkResearch(game);

    // Expire abilities, decoys, effects
    this.expireEffects(game);

    // Move units (terrain-aware)
    this.moveAllUnits(game);

    // Combat (with upgrade modifiers)
    this.resolveCombat(game);

    // Castle damage (with arrow slits upgrade)
    this.checkCastleDamage(game);

    // Remove dead
    this.removeDeadUnits(game);

    // Events
    this.processEvents(game);

    // Win condition
    this.checkWinCondition(game);

    // Trim log
    if (game.log.length > 30) {
      game.log = game.log.slice(-30);
    }
  }

  // --- Persistence ---

  toJSON(): { games: GameState[]; nextId: number } {
    return { games: Array.from(this.games.values()), nextId: nextGameId };
  }

  static fromJSON(data: { games: GameState[]; nextId: number }): SurrenderOrDieServer {
    const server = new SurrenderOrDieServer();
    for (const g of data.games) server.games.set(g.id, g);
    nextGameId = data.nextId;
    return server;
  }

  // ===== Private: Simulation =====

  private applyIncome(game: GameState): void {
    const isGoldRush = game.activeEvent?.type === 'gold_rush';
    const mult = isGoldRush ? 2 : 1;
    const incomePerTick = (GOLD_PER_SECOND * mult) / TICK_RATE;
    for (const side of ['left', 'right'] as Side[]) {
      const player = game.players[side];
      if (player) {
        player.gold = Math.min(MAX_GOLD, player.gold + incomePerTick);
      }
    }
  }

  private applyMining(game: GameState): void {
    for (const mine of game.mines) {
      if (mine.remaining <= 0) continue;

      // Remove dead/moved workers
      mine.workerIds = mine.workerIds.filter(id => {
        const u = game.units.find(u => u.id === id);
        return u && u.hp > 0 && u.state === 'mining' && u.miningTargetId === mine.id;
      });

      // Update claim
      if (mine.workerIds.length > 0) {
        const firstWorker = game.units.find(u => u.id === mine.workerIds[0]);
        mine.claimedBy = (firstWorker?.owner as Side) ?? null;
      } else {
        mine.claimedBy = null;
      }

      // Generate gold for workers
      for (const workerId of mine.workerIds) {
        const worker = game.units.find(u => u.id === workerId);
        if (!worker || worker.owner === 'neutral') continue;
        const player = game.players[worker.owner as Side];
        if (!player) continue;

        let rate = MINE_RATE;
        if (player.upgrades.includes('peasant_prospector')) rate *= 1.5;
        const goldPerTick = rate / TICK_RATE;
        const mined = Math.min(goldPerTick, mine.remaining);
        mine.remaining -= mined;
        player.gold = Math.min(MAX_GOLD, player.gold + mined);
      }
    }
  }

  private checkResearch(game: GameState): void {
    for (const side of ['left', 'right'] as Side[]) {
      const player = game.players[side];
      if (!player || !player.researching) continue;
      if (game.tick >= player.researching.completeTick) {
        const id = player.researching.id;
        player.upgrades.push(id);
        player.researching = null;
        const def = UPGRADES.find(u => u.id === id);
        this.addLog(game, `${player.handle} completed ${def?.name ?? id}!`);

        // Apply immediate effects
        if (id === 'castle_reinforce') {
          player.castle = Math.min(CASTLE_HP + 100, player.castle + 100);
        }
        // Stat upgrades apply dynamically in combat/movement via hasUpgrade checks
      }
    }
  }

  private expireEffects(game: GameState): void {
    for (const unit of game.units) {
      // Expire ability buffs
      if (unit.abilityActive && game.tick >= unit.abilityUntil) {
        unit.abilityActive = false;
        if (unit.state === 'fortified') unit.state = 'idle';
      }
      // Expire confusion
      if (unit.confused && game.tick >= unit.confusedUntil) {
        unit.confused = false;
      }
      // Expire slow
      if (unit.slowed && game.tick >= unit.slowedUntil) {
        unit.slowed = false;
      }
      // Expire decoys
      if (unit.isDecoy && game.tick >= unit.decoyUntil) {
        unit.hp = 0;
      }
      // Tick down ability cooldown
      if (unit.abilityCooldown > 0) {
        unit.abilityCooldown--;
      }
    }
  }

  private moveAllUnits(game: GameState): void {
    for (const unit of game.units) {
      if (unit.hp <= 0) continue;
      if (unit.state === 'fortified' || unit.state === 'mining') continue;

      // If attacking a specific target, move toward it
      if (unit.attackTargetId !== null) {
        const target = game.units.find(u => u.id === unit.attackTargetId);
        if (target && target.hp > 0) {
          const dist = this.distance(unit.x, unit.y, target.x, target.y);
          const range = this.getUnitRange(unit, game);
          if (dist <= range) {
            unit.state = 'attacking';
            continue;
          }
          this.moveUnitToward(unit, target.x, target.y, game);
          continue;
        } else {
          unit.attackTargetId = null;
        }
      }

      // Mining: move to mine, then start mining
      if (unit.miningTargetId !== null) {
        const mine = game.mines.find(m => m.id === unit.miningTargetId);
        if (mine && mine.remaining > 0) {
          const dist = this.distance(unit.x, unit.y, mine.x, mine.y);
          if (dist < 1.0) {
            // At the mine — start mining
            if (mine.workerIds.length < MAX_WORKERS_PER_MINE && !mine.workerIds.includes(unit.id)) {
              mine.workerIds.push(unit.id);
            }
            unit.state = 'mining';
            continue;
          }
          this.moveUnitToward(unit, mine.x, mine.y, game);
          continue;
        } else {
          unit.miningTargetId = null;
        }
      }

      // Moving to position
      const dist = this.distance(unit.x, unit.y, unit.targetX, unit.targetY);
      if (dist < 0.1) {
        unit.state = 'idle';
        const nearest = this.findNearestEnemy(game, unit);
        if (nearest) {
          const range = this.getUnitRange(unit, game);
          const eDist = this.distance(unit.x, unit.y, nearest.x, nearest.y);
          if (eDist <= range * 1.5) {
            unit.attackTargetId = nearest.id;
            unit.state = 'attacking';
          }
        }
        continue;
      }

      // Auto-acquire enemies while moving (only on attack-move orders)
      if (unit.isAttackMove) {
        const nearest = this.findNearestEnemy(game, unit);
        if (nearest) {
          const range = this.getUnitRange(unit, game);
          const eDist = this.distance(unit.x, unit.y, nearest.x, nearest.y);
          if (eDist <= range) {
            unit.attackTargetId = nearest.id;
            unit.state = 'attacking';
            continue;
          }
        }
      }

      this.moveUnitToward(unit, unit.targetX, unit.targetY, game);
    }
  }

  private moveUnitToward(unit: Unit, tx: number, ty: number, game: GameState): void {
    const stats = UNIT_STATS[unit.type];
    let speed = stats.speed;

    // Terrain speed modifier
    const tileX = Math.floor(Math.max(0, Math.min(MAP_W - 1, unit.x)));
    const tileY = Math.floor(Math.max(0, Math.min(MAP_H - 1, unit.y)));
    const terrain = game.terrain[tileY]?.[tileX] ?? 'open';
    speed *= TERRAIN_PROPS[terrain].speedMult;

    // Rally buff: +50% speed
    if (unit.type === 'peasant' && unit.abilityActive) speed *= 1.5;

    // Slow debuff: -50% speed
    if (unit.slowed) speed *= 0.5;

    // Heavy knight upgrade: -0.5 speed
    if (unit.type === 'knight') {
      const player = unit.owner !== 'neutral' ? game.players[unit.owner as Side] : null;
      if (player?.upgrades.includes('knight_heavy')) speed = Math.max(0.5, speed - 0.5);
    }

    const dx = tx - unit.x;
    const dy = ty - unit.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.01) return;

    const step = speed * TICK_DT;
    const move = Math.min(step, dist);
    const dir = unit.confused ? -1 : 1;

    const moveX = (dx / dist) * move * dir;
    const moveY = (dy / dist) * move * dir;

    // Try full diagonal move first
    let newX = unit.x + moveX;
    let newY = unit.y + moveY;
    let ntx = Math.floor(Math.max(0, Math.min(MAP_W - 1, newX)));
    let nty = Math.floor(Math.max(0, Math.min(MAP_H - 1, newY)));

    if (this.tileWalkable(game, ntx, nty)) {
      unit.x = Math.max(0, Math.min(MAP_W, newX));
      unit.y = Math.max(0, Math.min(MAP_H, newY));
    } else {
      // Wall slide: try X-only, then Y-only
      const slideX = unit.x + moveX;
      const stx = Math.floor(Math.max(0, Math.min(MAP_W - 1, slideX)));
      const sty = Math.floor(Math.max(0, Math.min(MAP_H - 1, unit.y)));

      const slideY = unit.y + moveY;
      const stx2 = Math.floor(Math.max(0, Math.min(MAP_W - 1, unit.x)));
      const sty2 = Math.floor(Math.max(0, Math.min(MAP_H - 1, slideY)));

      if (this.tileWalkable(game, stx, sty)) {
        unit.x = Math.max(0, Math.min(MAP_W, slideX));
      } else if (this.tileWalkable(game, stx2, sty2)) {
        unit.y = Math.max(0, Math.min(MAP_H, slideY));
      }
      // If both axes blocked, unit waits (truly boxed in)
    }

    unit.state = 'moving';
  }

  private resolveCombat(game: GameState): void {
    for (const unit of game.units) {
      if (unit.hp <= 0 || unit.isDecoy) continue;
      if (unit.attackCooldown > 0) {
        unit.attackCooldown -= TICK_DT;
        continue;
      }

      let target: Unit | undefined;
      if (unit.attackTargetId !== null) {
        target = game.units.find(u => u.id === unit.attackTargetId && u.hp > 0);
      }
      if (!target) {
        target = this.findNearestEnemy(game, unit);
      }
      if (!target) continue;

      const range = this.getUnitRange(unit, game);
      const dist = this.distance(unit.x, unit.y, target.x, target.y);
      if (dist > range) continue;

      // Check ranged line of sight (forests block ranged)
      if (range > 1 && this.isRangedBlocked(unit.x, unit.y, target.x, target.y, game)) {
        continue;
      }

      // Calculate damage
      let dmg = this.getUnitDamage(unit, game);

      // Knight armor vs peasants
      if (target.type === 'knight' && unit.type === 'peasant') {
        dmg = Math.floor(dmg / 2);
      }

      // Shield wall: 50% damage reduction
      if (target.abilityActive && target.type === 'knight') {
        dmg = Math.floor(dmg / 2);
      }

      // Lancer charge: first hit 2x
      if (unit.type === 'knight' && unit.chargeReady) {
        const player = unit.owner !== 'neutral' ? game.players[unit.owner as Side] : null;
        if (player?.upgrades.includes('knight_lancer')) {
          dmg *= 2;
          unit.chargeReady = false;
        }
      }

      target.hp -= dmg;

      // Attack speed
      let atkSpeed = UNIT_STATS[unit.type].attackSpeed;
      if (unit.type === 'archer') {
        const player = unit.owner !== 'neutral' ? game.players[unit.owner as Side] : null;
        if (player?.upgrades.includes('archer_rapid')) atkSpeed += 0.5;
      }
      unit.attackCooldown = 1 / atkSpeed;
      unit.state = 'attacking';

      // Bombard splash
      if (unit.type === 'catapult') {
        const player = unit.owner !== 'neutral' ? game.players[unit.owner as Side] : null;
        if (player?.upgrades.includes('catapult_bombard')) {
          for (const other of game.units) {
            if (other.id !== target.id && other.owner !== unit.owner && other.hp > 0 &&
                this.distance(target.x, target.y, other.x, other.y) <= 1.5) {
              other.hp -= Math.floor(dmg * 0.5);
            }
          }
        }
      }

      // Jester confusion
      if (unit.type === 'jester' && !target.confused) {
        const confDuration = this.getPlayerForUnit(game, unit)?.upgrades.includes('jester_trickster') ? 5 : 3;
        target.confused = true;
        target.confusedUntil = game.tick + confDuration * TICK_RATE;
      }

      // Saboteur slow
      if (unit.type === 'jester') {
        const player = this.getPlayerForUnit(game, unit);
        if (player?.upgrades.includes('jester_saboteur') && !target.slowed) {
          target.slowed = true;
          target.slowedUntil = game.tick + 4 * TICK_RATE;
        }
      }

      if (target.hp <= 0) {
        const owner = this.getPlayerForUnit(game, unit);
        this.addLog(game, `${owner?.handle ?? 'Neutral'}'s ${unit.type} killed a ${target.type}`);
        unit.attackTargetId = null;
        unit.state = 'idle';
      }
    }
  }

  private checkCastleDamage(game: GameState): void {
    // Arrow slits: castle damages nearby enemies
    for (const side of ['left', 'right'] as Side[]) {
      const player = game.players[side];
      if (!player || !player.upgrades.includes('castle_arrowslits')) continue;
      const castleX = side === 'left' ? CASTLE_WIDTH / 2 : MAP_W - CASTLE_WIDTH / 2;
      const castleY = MAP_H / 2;
      for (const unit of game.units) {
        if (unit.owner === side || unit.hp <= 0) continue;
        if (this.distance(unit.x, unit.y, castleX, castleY) <= CASTLE_WIDTH + 2) {
          unit.hp -= (5 / TICK_RATE); // 5 dps
        }
      }
    }

    // Units attacking castle
    for (const unit of game.units) {
      if (unit.hp <= 0 || unit.owner === 'neutral') continue;
      if (unit.attackCooldown > 0) continue;

      const stats = UNIT_STATS[unit.type];
      const enemySide: Side = unit.owner === 'left' ? 'right' : 'left';
      const castleX = enemySide === 'left' ? CASTLE_WIDTH / 2 : MAP_W - CASTLE_WIDTH / 2;
      const castleY = MAP_H / 2;
      const dist = this.distance(unit.x, unit.y, castleX, castleY);

      const range = this.getUnitRange(unit, game);
      if (dist <= range + CASTLE_WIDTH) {
        const nearestEnemy = this.findNearestEnemy(game, unit);
        const enemyDist = nearestEnemy ? this.distance(unit.x, unit.y, nearestEnemy.x, nearestEnemy.y) : Infinity;

        if (enemyDist > range || unit.type === 'catapult') {
          const player = game.players[enemySide];
          if (player && player.castle > 0) {
            let dmg = this.getUnitDamage(unit, game);
            if (unit.type === 'catapult') dmg = Math.floor(dmg * 1.5);
            player.castle = Math.max(0, player.castle - dmg);
            unit.attackCooldown = 1 / stats.attackSpeed;
            unit.state = 'attacking';
          }
        }
      }
    }
  }

  private removeDeadUnits(game: GameState): void {
    const before = game.units.length;
    game.units = game.units.filter(u => u.hp > 0);
    // Clean up mine worker lists
    if (game.units.length < before) {
      const liveIds = new Set(game.units.map(u => u.id));
      for (const mine of game.mines) {
        mine.workerIds = mine.workerIds.filter(id => liveIds.has(id));
      }
    }
  }

  private processEvents(game: GameState): void {
    // Expire active event
    if (game.activeEvent && game.tick >= game.activeEvent.startTick + game.activeEvent.duration) {
      game.activeEvent = null;
    }

    // Trigger new event
    if (game.tick >= game.nextEventTick && !game.activeEvent) {
      const eventDef = EVENT_DEFS[Math.floor(Math.random() * EVENT_DEFS.length)];
      const event: GameEvent = {
        type: eventDef.type,
        name: eventDef.name,
        description: eventDef.description,
        startTick: game.tick,
        duration: eventDef.durationSec * TICK_RATE,
      };

      // Apply instant events
      switch (eventDef.type) {
        case 'mercenaries': {
          // Spawn 3 neutral units at random open spots
          for (let i = 0; i < 3; i++) {
            const pos = this.findOpenSpot(game);
            if (pos) {
              const types: UnitType[] = ['knight', 'archer', 'peasant'];
              const type = types[Math.floor(Math.random() * types.length)];
              const stats = UNIT_STATS[type];
              const merc: Unit = {
                id: game.nextUnitId++,
                type, owner: 'neutral',
                x: pos[0], y: pos[1],
                hp: stats.hp, maxHp: stats.hp,
                targetX: pos[0], targetY: pos[1],
                attackTargetId: null, attackCooldown: 0, isAttackMove: false,
                confused: false, confusedUntil: 0,
                state: 'idle',
                abilityCooldown: 0, abilityActive: false, abilityUntil: 0,
                miningTargetId: null,
                isDecoy: false, decoyUntil: 0,
                slowed: false, slowedUntil: 0,
                chargeReady: false,
              };
              game.units.push(merc);
            }
          }
          event.duration = 1; // instant event
          break;
        }
        case 'earthquake': {
          // Randomly change a few tiles
          for (let i = 0; i < 8; i++) {
            const x = 4 + Math.floor(Math.random() * (MAP_W - 8));
            const y = 1 + Math.floor(Math.random() * (MAP_H - 2));
            const options: Terrain[] = ['open', 'open', 'open', 'forest', 'hill', 'wall'];
            game.terrain[y][x] = options[Math.floor(Math.random() * options.length)];
          }
          event.duration = 1; // instant
          break;
        }
      }

      game.activeEvent = event;
      game.nextEventTick = game.tick + EVENT_INTERVAL * TICK_RATE;
      this.addLog(game, `EVENT: ${eventDef.name} — ${eventDef.description}`);
    }
  }

  private checkWinCondition(game: GameState): void {
    const leftDead = game.players.left && game.players.left.castle <= 0;
    const rightDead = game.players.right && game.players.right.castle <= 0;

    if (leftDead && rightDead) {
      game.phase = 'finished';
      game.winner = 'draw';
      this.addLog(game, 'Both castles destroyed — DRAW!');
    } else if (leftDead) {
      game.phase = 'finished';
      game.winner = game.players.right?.handle ?? 'right';
      this.addLog(game, `${game.winner} wins — left castle destroyed!`);
    } else if (rightDead) {
      game.phase = 'finished';
      game.winner = game.players.left?.handle ?? 'left';
      this.addLog(game, `${game.winner} wins — right castle destroyed!`);
    } else if (game.elapsed >= GAME_DURATION) {
      game.phase = 'finished';
      const leftHP = game.players.left?.castle ?? 0;
      const rightHP = game.players.right?.castle ?? 0;
      if (leftHP > rightHP) game.winner = game.players.left?.handle ?? 'left';
      else if (rightHP > leftHP) game.winner = game.players.right?.handle ?? 'right';
      else game.winner = 'draw';
      this.addLog(game, `Time's up! ${game.winner} wins (${Math.ceil(leftHP)} HP vs ${Math.ceil(rightHP)} HP)`);
    }
  }

  // ===== Private: Helpers =====

  private getUnitRange(unit: Unit, game: GameState): number {
    let range = UNIT_STATS[unit.type].range;
    // Hill terrain bonus
    const tileX = Math.floor(Math.max(0, Math.min(MAP_W - 1, unit.x)));
    const tileY = Math.floor(Math.max(0, Math.min(MAP_H - 1, unit.y)));
    const terrain = game.terrain[tileY]?.[tileX] ?? 'open';
    range += TERRAIN_PROPS[terrain].rangeBonus;

    // Upgrades
    const player = this.getPlayerForUnit(game, unit);
    if (unit.type === 'archer' && player?.upgrades.includes('archer_longbow')) range += 2;
    if (unit.type === 'catapult' && player?.upgrades.includes('catapult_trebuchet')) range += 3;

    // Fortify ability: double range
    if (unit.type === 'catapult' && unit.abilityActive) range *= 2;

    return range;
  }

  private getUnitDamage(unit: Unit, game: GameState): number {
    let dmg = UNIT_STATS[unit.type].damage;
    const player = this.getPlayerForUnit(game, unit);

    if (unit.type === 'peasant' && player?.upgrades.includes('peasant_militia')) dmg += 3;
    if (unit.type === 'knight' && player?.upgrades.includes('knight_lancer')) dmg += 10;
    if (unit.type === 'catapult' && player?.upgrades.includes('catapult_trebuchet')) dmg += 10;

    // Fortify ability: double damage
    if (unit.type === 'catapult' && unit.abilityActive) dmg *= 2;

    return dmg;
  }

  private isRangedBlocked(ax: number, ay: number, bx: number, by: number, game: GameState): boolean {
    // Simple line-of-sight check through forests/walls
    const dx = bx - ax;
    const dy = by - ay;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.ceil(dist * 2);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = Math.floor(ax + dx * t);
      const y = Math.floor(ay + dy * t);
      if (x >= 0 && x < MAP_W && y >= 0 && y < MAP_H) {
        const terrain = game.terrain[y][x];
        if (TERRAIN_PROPS[terrain].blocksRanged) return true;
      }
    }
    return false;
  }

  private spawnUnit(game: GameState, type: UnitType, side: Side, player?: Player): Unit {
    const spawnX = side === 'left' ? SPAWN_LEFT_X : SPAWN_RIGHT_X;
    const spawnY = MAP_H / 2 + (Math.random() - 0.5) * 4;
    const targetX = side === 'left' ? MAP_W - CASTLE_WIDTH / 2 : CASTLE_WIDTH / 2;

    const stats = UNIT_STATS[type];
    let hp = stats.hp;

    // Militia upgrade: +10 HP
    if (type === 'peasant' && player?.upgrades.includes('peasant_militia')) hp += 10;
    // Heavy knight: +30 HP
    if (type === 'knight' && player?.upgrades.includes('knight_heavy')) hp += 30;

    const unit: Unit = {
      id: game.nextUnitId++,
      type,
      owner: side,
      x: spawnX,
      y: spawnY,
      hp,
      maxHp: hp,
      targetX,
      targetY: MAP_H / 2,
      attackTargetId: null,
      attackCooldown: 0,
      isAttackMove: true,
      confused: false,
      confusedUntil: 0,
      state: 'moving',
      abilityCooldown: 0,
      abilityActive: false,
      abilityUntil: 0,
      miningTargetId: null,
      isDecoy: false,
      decoyUntil: 0,
      slowed: false,
      slowedUntil: 0,
      chargeReady: type === 'knight' && (player?.upgrades.includes('knight_lancer') ?? false),
    };
    game.units.push(unit);
    return unit;
  }

  private findNearestEnemy(game: GameState, unit: Unit): Unit | undefined {
    let nearest: Unit | undefined;
    let nearestDist = Infinity;
    for (const other of game.units) {
      if (other.owner === unit.owner || other.owner === 'neutral' || other.hp <= 0) continue;
      const d = this.distance(unit.x, unit.y, other.x, other.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = other;
      }
    }
    return nearest;
  }

  private findOpenSpot(game: GameState): [number, number] | null {
    for (let attempt = 0; attempt < 30; attempt++) {
      const x = 4 + Math.floor(Math.random() * (MAP_W - 8));
      const y = 1 + Math.floor(Math.random() * (MAP_H - 2));
      if (TERRAIN_PROPS[game.terrain[y][x]].walkable) return [x + 0.5, y + 0.5];
    }
    return null;
  }

  private tileWalkable(game: GameState, tileX: number, tileY: number): boolean {
    if (tileX < 0 || tileX >= MAP_W || tileY < 0 || tileY >= MAP_H) return false;
    const t = game.terrain[tileY]?.[tileX] ?? 'open';
    return TERRAIN_PROPS[t].walkable;
  }

  private distance(ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax;
    const dy = by - ay;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private getGameOrThrow(gameId: string): GameState {
    const game = this.games.get(gameId);
    if (!game) throw new Error(`Game ${gameId} not found`);
    return game;
  }

  private getPlayer(game: GameState, handle: string): Player {
    if (game.players.left?.handle === handle) return game.players.left;
    if (game.players.right?.handle === handle) return game.players.right;
    throw new Error(`Player ${handle} not in this game`);
  }

  private tryGetPlayer(game: GameState, handle: string): Player | null {
    if (game.players.left?.handle === handle) return game.players.left;
    if (game.players.right?.handle === handle) return game.players.right;
    return null;
  }

  private getPlayerBySide(game: GameState, side: Side): Player | null {
    return game.players[side];
  }

  private getPlayerForUnit(game: GameState, unit: Unit): Player | null {
    if (unit.owner === 'neutral') return null;
    return game.players[unit.owner as Side] ?? null;
  }

  private addLog(game: GameState, message: string): void {
    game.log.push({ tick: game.tick, message });
  }

  private snapshot(game: GameState): GameState {
    return structuredClone(game);
  }

  // --- Fog of war ---
  private fogFilteredState(game: GameState, side: Side): GameState {
    const visibility = this.computeVisibility(game, side);
    const snapshot = structuredClone(game);

    // Filter units: only show own units + enemies in visible tiles
    snapshot.units = snapshot.units.filter(u => {
      if (u.owner === side) return true;
      const tx = Math.floor(Math.max(0, Math.min(MAP_W - 1, u.x)));
      const ty = Math.floor(Math.max(0, Math.min(MAP_H - 1, u.y)));
      return visibility[ty][tx];
    });

    // Filter mines: only show visible mines
    snapshot.mines = snapshot.mines.map(m => {
      const tx = Math.floor(Math.max(0, Math.min(MAP_W - 1, m.x)));
      const ty = Math.floor(Math.max(0, Math.min(MAP_H - 1, m.y)));
      if (visibility[ty][tx]) return m;
      // Return mine with hidden info
      return { ...m, workerIds: [], claimedBy: null, remaining: -1 };
    });

    return snapshot;
  }

  private computeVisibility(game: GameState, side: Side): boolean[][] {
    const vis: boolean[][] = [];
    for (let y = 0; y < MAP_H; y++) {
      vis.push(new Array(MAP_W).fill(false));
    }

    // Fog lifts event: full vision
    if (game.activeEvent?.type === 'fog_lifts') {
      for (let y = 0; y < MAP_H; y++) vis[y].fill(true);
      return vis;
    }

    // Castle vision
    const castleX = side === 'left' ? CASTLE_WIDTH / 2 : MAP_W - CASTLE_WIDTH / 2;
    this.revealCircle(vis, castleX, MAP_H / 2, CASTLE_VISION, game);

    // Unit vision
    for (const unit of game.units) {
      if (unit.owner !== side || unit.hp <= 0) continue;
      let visionRadius = UNIT_STATS[unit.type].vision;
      // Terrain vision bonus
      const tx = Math.floor(Math.max(0, Math.min(MAP_W - 1, unit.x)));
      const ty = Math.floor(Math.max(0, Math.min(MAP_H - 1, unit.y)));
      visionRadius += TERRAIN_PROPS[game.terrain[ty][tx]].visionBonus;
      this.revealCircle(vis, unit.x, unit.y, Math.max(1, visionRadius), game);
    }

    return vis;
  }

  private revealCircle(vis: boolean[][], cx: number, cy: number, radius: number, _game: GameState): void {
    const r2 = radius * radius;
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(MAP_H - 1, Math.ceil(cy + radius));
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(MAP_W - 1, Math.ceil(cx + radius));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r2) {
          vis[y][x] = true;
        }
      }
    }
  }
}

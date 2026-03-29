// game-engine.ts — Pure game state machine. No rendering, no AI knowledge.

import {
  type GameState, type Unit, type Player, type Side, type UnitType, type LogEntry,
  UNIT_STATS, MAP_W, MAP_H, CASTLE_HP, CASTLE_WIDTH,
  SPAWN_LEFT_X, SPAWN_RIGHT_X,
  STARTING_GOLD, GOLD_PER_SECOND, MAX_GOLD,
  TICK_RATE, TICK_DT, GAME_DURATION,
} from '../shared/types.js';

let nextGameId = 1;

export class SurrenderOrDieServer {
  private games: Map<string, GameState> = new Map();

  // --- Lifecycle ---

  createGame(playerHandle: string, side: Side = 'left'): GameState {
    const id = `g${nextGameId++}`;
    const player: Player = {
      handle: playerHandle,
      side,
      gold: STARTING_GOLD,
      castle: CASTLE_HP,
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
      winner: null,
      surrendered: null,
      log: [],
      nextUnitId: 1,
    };
    this.games.set(id, game);
    this.addLog(game, `${playerHandle} created the game (${side} castle)`);
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
    if (player.gold < stats.cost) throw new Error(`Not enough gold (have ${player.gold}, need ${stats.cost})`);

    player.gold -= stats.cost;
    const unit = this.spawnUnit(game, unitType, player.side);
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
      this.spawnUnit(game, unitType, player.side);
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

    // Clamp target to map bounds
    const tx = Math.max(0, Math.min(MAP_W, targetX));
    const ty = Math.max(0, Math.min(MAP_H, targetY));

    let moved = 0;
    for (const unit of game.units) {
      if (unitIds.includes(unit.id) && unit.owner === player.side) {
        unit.targetX = tx;
        unit.targetY = ty;
        unit.attackTargetId = null;
        unit.state = 'moving';
        moved++;
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
        unit.attackTargetId = null; // will acquire targets as they move
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
        unit.state = 'moving'; // will switch to attacking when in range
      }
    }
    return this.snapshot(game);
  }

  surrender(gameId: string, playerHandle: string): GameState {
    const game = this.getGameOrThrow(gameId);
    if (game.phase !== 'playing') throw new Error(`Game is not active`);
    const player = this.getPlayer(game, playerHandle);

    // Can only surrender while castle HP > 50%
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

  getStatus(gameId: string): GameState | null {
    const game = this.games.get(gameId);
    return game ? this.snapshot(game) : null;
  }

  listGames(): GameState[] {
    return Array.from(this.games.values()).map(g => this.snapshot(g));
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

  tick(gameId: string): GameState {
    const game = this.getGameOrThrow(gameId);
    if (game.phase !== 'playing') return this.snapshot(game);

    game.tick++;
    game.elapsed = game.tick / TICK_RATE;

    // Income
    this.applyIncome(game);

    // Move units
    this.moveAllUnits(game);

    // Combat
    this.resolveCombat(game);

    // Castle damage
    this.checkCastleDamage(game);

    // Remove dead
    this.removeDeadUnits(game);

    // Win condition
    this.checkWinCondition(game);

    // Trim log
    if (game.log.length > 30) {
      game.log = game.log.slice(-30);
    }

    return this.snapshot(game);
  }

  // --- Persistence ---

  toJSON(): { games: GameState[]; nextId: number } {
    return {
      games: Array.from(this.games.values()),
      nextId: nextGameId,
    };
  }

  static fromJSON(data: { games: GameState[]; nextId: number }): SurrenderOrDieServer {
    const server = new SurrenderOrDieServer();
    for (const g of data.games) {
      server.games.set(g.id, g);
    }
    nextGameId = data.nextId;
    return server;
  }

  // --- Private: Simulation ---

  private applyIncome(game: GameState): void {
    const incomePerTick = GOLD_PER_SECOND / TICK_RATE;
    for (const side of ['left', 'right'] as Side[]) {
      const player = game.players[side];
      if (player) {
        player.gold = Math.min(MAX_GOLD, player.gold + incomePerTick);
      }
    }
  }

  private moveAllUnits(game: GameState): void {
    for (const unit of game.units) {
      if (unit.hp <= 0) continue;

      // If attacking a specific target, move toward it
      if (unit.attackTargetId !== null) {
        const target = game.units.find(u => u.id === unit.attackTargetId);
        if (target && target.hp > 0) {
          const dist = this.distance(unit.x, unit.y, target.x, target.y);
          const range = UNIT_STATS[unit.type].range;
          if (dist <= range) {
            unit.state = 'attacking';
            continue; // in range, don't move
          }
          // Move toward target
          this.moveUnitToward(unit, target.x, target.y);
          continue;
        } else {
          // Target dead, clear
          unit.attackTargetId = null;
        }
      }

      // Moving to position
      const dist = this.distance(unit.x, unit.y, unit.targetX, unit.targetY);
      if (dist < 0.1) {
        // Arrived — auto-acquire nearest enemy if attack-moving or idle
        unit.state = 'idle';
        const nearest = this.findNearestEnemy(game, unit);
        if (nearest) {
          const range = UNIT_STATS[unit.type].range;
          const eDist = this.distance(unit.x, unit.y, nearest.x, nearest.y);
          if (eDist <= range * 1.5) {
            unit.attackTargetId = nearest.id;
            unit.state = 'attacking';
          }
        }
        continue;
      }

      // Auto-acquire enemies while moving (attack-move behavior)
      const nearest = this.findNearestEnemy(game, unit);
      if (nearest) {
        const range = UNIT_STATS[unit.type].range;
        const eDist = this.distance(unit.x, unit.y, nearest.x, nearest.y);
        if (eDist <= range) {
          unit.attackTargetId = nearest.id;
          unit.state = 'attacking';
          continue;
        }
      }

      this.moveUnitToward(unit, unit.targetX, unit.targetY);
    }
  }

  private moveUnitToward(unit: Unit, tx: number, ty: number): void {
    const stats = UNIT_STATS[unit.type];
    const dx = tx - unit.x;
    const dy = ty - unit.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.01) return;

    const step = stats.speed * TICK_DT;
    const move = Math.min(step, dist);

    // Confusion: reverse direction
    const dir = unit.confused ? -1 : 1;
    unit.x += (dx / dist) * move * dir;
    unit.y += (dy / dist) * move * dir;

    // Clamp to map
    unit.x = Math.max(0, Math.min(MAP_W, unit.x));
    unit.y = Math.max(0, Math.min(MAP_H, unit.y));
    unit.state = 'moving';
  }

  private resolveCombat(game: GameState): void {
    for (const unit of game.units) {
      if (unit.hp <= 0) continue;
      if (unit.attackCooldown > 0) {
        unit.attackCooldown -= TICK_DT;
        continue;
      }

      // Find attack target
      let target: Unit | undefined;
      if (unit.attackTargetId !== null) {
        target = game.units.find(u => u.id === unit.attackTargetId && u.hp > 0);
      }
      if (!target) {
        target = this.findNearestEnemy(game, unit);
      }
      if (!target) continue;

      const stats = UNIT_STATS[unit.type];
      const dist = this.distance(unit.x, unit.y, target.x, target.y);
      if (dist > stats.range) continue;

      // Attack!
      let dmg = stats.damage;

      // Knight: half damage from peasants
      if (target.type === 'knight' && unit.type === 'peasant') {
        dmg = Math.floor(dmg / 2);
      }

      target.hp -= dmg;
      unit.attackCooldown = 1 / stats.attackSpeed;
      unit.state = 'attacking';

      // Jester confusion
      if (unit.type === 'jester' && !target.confused) {
        target.confused = true;
        target.confusedUntil = game.tick + 3 * TICK_RATE; // 3 seconds
        this.addLog(game, `Jester #${unit.id} confused ${target.type} #${target.id}!`);
      }

      if (target.hp <= 0) {
        const owner = this.getPlayerBySide(game, unit.owner);
        this.addLog(game, `${owner?.handle}'s ${unit.type} killed a ${target.type}`);
        unit.attackTargetId = null;
        unit.state = 'idle';
      }
    }

    // Clear expired confusion
    for (const unit of game.units) {
      if (unit.confused && game.tick >= unit.confusedUntil) {
        unit.confused = false;
      }
    }
  }

  private checkCastleDamage(game: GameState): void {
    for (const unit of game.units) {
      if (unit.hp <= 0) continue;
      if (unit.attackCooldown > 0) continue;

      const stats = UNIT_STATS[unit.type];
      const enemySide: Side = unit.owner === 'left' ? 'right' : 'left';
      const castleX = enemySide === 'left' ? CASTLE_WIDTH / 2 : MAP_W - CASTLE_WIDTH / 2;
      const castleY = MAP_H / 2;
      const dist = this.distance(unit.x, unit.y, castleX, castleY);

      // Can hit castle if in range and no enemies nearby
      if (dist <= stats.range + CASTLE_WIDTH) {
        const nearestEnemy = this.findNearestEnemy(game, unit);
        const enemyDist = nearestEnemy ? this.distance(unit.x, unit.y, nearestEnemy.x, nearestEnemy.y) : Infinity;

        // Prioritize castle if no enemies in range, or if catapult
        if (enemyDist > stats.range || unit.type === 'catapult') {
          const player = game.players[enemySide];
          if (player && player.castle > 0) {
            let dmg = stats.damage;
            if (unit.type === 'catapult') dmg = Math.floor(dmg * 1.5); // siege bonus
            player.castle = Math.max(0, player.castle - dmg);
            unit.attackCooldown = 1 / stats.attackSpeed;
            unit.state = 'attacking';
          }
        }
      }
    }
  }

  private removeDeadUnits(game: GameState): void {
    game.units = game.units.filter(u => u.hp > 0);
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
      if (leftHP > rightHP) {
        game.winner = game.players.left?.handle ?? 'left';
      } else if (rightHP > leftHP) {
        game.winner = game.players.right?.handle ?? 'right';
      } else {
        game.winner = 'draw';
      }
      this.addLog(game, `Time's up! ${game.winner} wins (${leftHP} HP vs ${rightHP} HP)`);
    }
  }

  // --- Private: Helpers ---

  private spawnUnit(game: GameState, type: UnitType, side: Side): Unit {
    const spawnX = side === 'left' ? SPAWN_LEFT_X : SPAWN_RIGHT_X;
    // Spread units vertically with some randomness
    const spawnY = MAP_H / 2 + (Math.random() - 0.5) * 4;
    // Default target: march toward enemy castle
    const targetX = side === 'left' ? MAP_W - CASTLE_WIDTH / 2 : CASTLE_WIDTH / 2;

    const stats = UNIT_STATS[type];
    const unit: Unit = {
      id: game.nextUnitId++,
      type,
      owner: side,
      x: spawnX,
      y: spawnY,
      hp: stats.hp,
      maxHp: stats.hp,
      targetX,
      targetY: MAP_H / 2,
      attackTargetId: null,
      attackCooldown: 0,
      confused: false,
      confusedUntil: 0,
      state: 'moving',
    };
    game.units.push(unit);
    return unit;
  }

  private findNearestEnemy(game: GameState, unit: Unit): Unit | undefined {
    let nearest: Unit | undefined;
    let nearestDist = Infinity;
    for (const other of game.units) {
      if (other.owner === unit.owner || other.hp <= 0) continue;
      const d = this.distance(unit.x, unit.y, other.x, other.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = other;
      }
    }
    return nearest;
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

  private getPlayerBySide(game: GameState, side: Side): Player | null {
    return game.players[side];
  }

  private addLog(game: GameState, message: string): void {
    game.log.push({ tick: game.tick, message });
  }

  private snapshot(game: GameState): GameState {
    return structuredClone(game);
  }
}

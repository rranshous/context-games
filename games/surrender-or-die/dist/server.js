import { createRequire } from 'module';const require = createRequire(import.meta.url);

// src/server/app.ts
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

// src/shared/types.ts
var MAP_W = 30;
var MAP_H = 20;
var TERRAIN_PROPS = {
  open: { walkable: true, speedMult: 1, rangeBonus: 0, blocksRanged: false, visionBonus: 0 },
  forest: { walkable: true, speedMult: 0.6, rangeBonus: 0, blocksRanged: true, visionBonus: -2 },
  hill: { walkable: true, speedMult: 0.8, rangeBonus: 2, blocksRanged: false, visionBonus: 3 },
  wall: { walkable: false, speedMult: 0, rangeBonus: 0, blocksRanged: true, visionBonus: 0 },
  water: { walkable: false, speedMult: 0, rangeBonus: 0, blocksRanged: false, visionBonus: 0 }
};
var MINE_CAPACITY = 500;
var MINE_RATE = 3;
var MAX_WORKERS_PER_MINE = 3;
var STARTING_GOLD = 50;
var GOLD_PER_SECOND = 5;
var MAX_GOLD = 300;
var TICK_RATE = 20;
var TICK_DT = 1 / TICK_RATE;
var GAME_DURATION = 300;
var CASTLE_VISION = 6;
var UNIT_STATS = {
  peasant: {
    type: "peasant",
    cost: 10,
    hp: 15,
    damage: 5,
    attackSpeed: 1.5,
    speed: 3,
    range: 1,
    vision: 4,
    special: "Can mine gold. Rally: nearby peasants +50% speed for 3s"
  },
  knight: {
    type: "knight",
    cost: 30,
    hp: 60,
    damage: 15,
    attackSpeed: 0.8,
    speed: 2,
    range: 1,
    vision: 5,
    special: "Armored: half damage from peasants. Shield Wall: immobile, 50% dmg reduction 5s"
  },
  archer: {
    type: "archer",
    cost: 20,
    hp: 20,
    damage: 12,
    attackSpeed: 1,
    speed: 2.5,
    range: 4,
    vision: 7,
    special: "Ranged. Volley: area attack (3 tile radius), 10s cooldown"
  },
  catapult: {
    type: "catapult",
    cost: 50,
    hp: 30,
    damage: 25,
    attackSpeed: 0.3,
    speed: 1,
    range: 6,
    vision: 4,
    special: "Siege: 1.5x castle damage. Fortify: immobile, 2x range+damage 10s"
  },
  jester: {
    type: "jester",
    cost: 15,
    hp: 25,
    damage: 3,
    attackSpeed: 1,
    speed: 4,
    range: 1,
    vision: 6,
    special: "Confuse on hit. Decoy: spawns fake unit that draws aggro 5s"
  }
};
var ABILITY_DEFS = {
  peasant: { type: "rally", cooldown: 15, duration: 3 },
  knight: { type: "shield_wall", cooldown: 20, duration: 5 },
  archer: { type: "volley", cooldown: 10, duration: 0 },
  catapult: { type: "fortify", cooldown: 25, duration: 10 },
  jester: { type: "decoy", cooldown: 12, duration: 5 }
};
var UPGRADES = [
  // Peasant (pick one)
  { id: "peasant_militia", name: "Militia Training", cost: 40, researchTime: 10, exclusive: "peasant_prospector" },
  { id: "peasant_prospector", name: "Prospector Picks", cost: 40, researchTime: 10, exclusive: "peasant_militia" },
  // Knight (pick one)
  { id: "knight_heavy", name: "Heavy Armor", cost: 60, researchTime: 15, exclusive: "knight_lancer" },
  { id: "knight_lancer", name: "Lance Training", cost: 60, researchTime: 15, exclusive: "knight_heavy" },
  // Archer (pick one)
  { id: "archer_longbow", name: "Longbow", cost: 50, researchTime: 12, exclusive: "archer_rapid" },
  { id: "archer_rapid", name: "Rapid Fire", cost: 50, researchTime: 12, exclusive: "archer_longbow" },
  // Catapult (pick one)
  { id: "catapult_trebuchet", name: "Trebuchet", cost: 80, researchTime: 20, exclusive: "catapult_bombard" },
  { id: "catapult_bombard", name: "Bombard Shot", cost: 80, researchTime: 20, exclusive: "catapult_trebuchet" },
  // Jester (pick one)
  { id: "jester_trickster", name: "Master Trickster", cost: 35, researchTime: 8, exclusive: "jester_saboteur" },
  { id: "jester_saboteur", name: "Saboteur", cost: 35, researchTime: 8, exclusive: "jester_trickster" },
  // Castle (can get multiple, no exclusions)
  { id: "castle_reinforce", name: "Reinforce Walls", cost: 60, researchTime: 15 },
  { id: "castle_arrowslits", name: "Arrow Slits", cost: 75, researchTime: 20 },
  { id: "castle_warhorn", name: "War Horn", cost: 50, researchTime: 12 }
];
var EVENT_INTERVAL = 60;
var EVENT_DEFS = [
  { type: "gold_rush", name: "Gold Rush", description: "Double passive income!", durationSec: 15 },
  { type: "fog_lifts", name: "Fog Lifts", description: "Full map vision for all players!", durationSec: 10 },
  { type: "mercenaries", name: "Mercenaries", description: "Neutral units appear on the map!", durationSec: 0 },
  { type: "earthquake", name: "Earthquake", description: "Terrain shifts!", durationSec: 0 }
];
var CASTLE_HP = 400;
var CASTLE_WIDTH = 2;
var CASTLE_RIGHT_X = MAP_W - CASTLE_WIDTH;
var SPAWN_LEFT_X = CASTLE_WIDTH + 0.5;
var SPAWN_RIGHT_X = MAP_W - CASTLE_WIDTH - 0.5;

// src/server/map-gen.ts
function mulberry32(seed) {
  return function() {
    let t = seed += 1831565813;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function generateMap(seed) {
  const s = seed ?? Math.floor(Math.random() * 999999);
  const rng = mulberry32(s);
  const terrain = [];
  for (let y = 0; y < MAP_H; y++) {
    terrain.push(new Array(MAP_W).fill("open"));
  }
  const castleMargin = CASTLE_WIDTH + 2;
  const wallClusters = 3 + Math.floor(rng() * 3);
  for (let c = 0; c < wallClusters; c++) {
    const cx = castleMargin + Math.floor(rng() * (MAP_W - castleMargin * 2));
    const cy = 2 + Math.floor(rng() * (MAP_H - 4));
    const size = 2 + Math.floor(rng() * 3);
    const seeds = [[cx, cy]];
    for (let i = 0; i < size; i++) {
      const [sx, sy] = seeds[Math.floor(rng() * seeds.length)];
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      const [dx, dy] = dirs[Math.floor(rng() * 4)];
      const nx = sx + dx;
      const ny = sy + dy;
      if (nx >= castleMargin && nx < MAP_W - castleMargin && ny >= 1 && ny < MAP_H - 1) {
        terrain[ny][nx] = "wall";
        seeds.push([nx, ny]);
      }
    }
  }
  const forestPatches = 4 + Math.floor(rng() * 4);
  for (let f = 0; f < forestPatches; f++) {
    const fx = castleMargin + Math.floor(rng() * (MAP_W - castleMargin * 2));
    const fy = 1 + Math.floor(rng() * (MAP_H - 2));
    const radius = 1 + Math.floor(rng() * 2);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = fx + dx;
        const ny = fy + dy;
        if (nx >= castleMargin && nx < MAP_W - castleMargin && ny >= 0 && ny < MAP_H && terrain[ny][nx] === "open" && rng() < 0.7) {
          terrain[ny][nx] = "forest";
        }
      }
    }
  }
  const hillPatches = 2 + Math.floor(rng() * 3);
  for (let h = 0; h < hillPatches; h++) {
    const hx = castleMargin + Math.floor(rng() * (MAP_W - castleMargin * 2));
    const hy = 1 + Math.floor(rng() * (MAP_H - 2));
    const radius = 1 + Math.floor(rng() * 2);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = hx + dx;
        const ny = hy + dy;
        if (nx >= castleMargin && nx < MAP_W - castleMargin && ny >= 0 && ny < MAP_H && terrain[ny][nx] === "open" && rng() < 0.6) {
          terrain[ny][nx] = "hill";
        }
      }
    }
  }
  const ponds = 1 + Math.floor(rng() * 2);
  for (let p = 0; p < ponds; p++) {
    const px = castleMargin + 2 + Math.floor(rng() * (MAP_W - castleMargin * 2 - 4));
    const py = 2 + Math.floor(rng() * (MAP_H - 4));
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = px + dx;
        const ny = py + dy;
        if (nx >= castleMargin && nx < MAP_W - castleMargin && ny >= 0 && ny < MAP_H && terrain[ny][nx] === "open" && rng() < 0.5) {
          terrain[ny][nx] = "water";
        }
      }
    }
  }
  ensurePath(terrain, rng);
  const mines = [];
  let mineId = 1;
  const centerMine = placeMine(terrain, rng, MAP_W / 2 - 2, MAP_W / 2 + 2, mineId++);
  if (centerMine) mines.push(centerMine);
  const leftMine = placeMine(terrain, rng, castleMargin, MAP_W / 3, mineId++);
  if (leftMine) mines.push(leftMine);
  const rightMine = placeMine(terrain, rng, MAP_W * 2 / 3, MAP_W - castleMargin, mineId++);
  if (rightMine) mines.push(rightMine);
  return { terrain, mines, seed: s };
}
function placeMine(terrain, rng, minX, maxX, id) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const x = Math.floor(minX + rng() * (maxX - minX));
    const y = 2 + Math.floor(rng() * (MAP_H - 4));
    if (terrain[y][x] === "open") {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H) {
            terrain[ny][nx] = "open";
          }
        }
      }
      return {
        id,
        x: x + 0.5,
        y: y + 0.5,
        remaining: MINE_CAPACITY,
        claimedBy: null,
        workerIds: []
      };
    }
  }
  return null;
}
function ensurePath(terrain, rng) {
  const startX = CASTLE_WIDTH + 1;
  const endX = MAP_W - CASTLE_WIDTH - 2;
  const midY = Math.floor(MAP_H / 2);
  if (hasPath(terrain, startX, midY, endX, midY)) return;
  const carveY = midY + Math.floor((rng() - 0.5) * 4);
  const y = Math.max(1, Math.min(MAP_H - 2, carveY));
  for (let x = startX; x <= endX; x++) {
    if (!isWalkable(terrain[y][x])) {
      terrain[y][x] = "open";
    }
    const y2 = y + (rng() < 0.5 ? 1 : -1);
    if (y2 >= 0 && y2 < MAP_H && !isWalkable(terrain[y2][x])) {
      terrain[y2][x] = "open";
    }
  }
}
function isWalkable(t) {
  return t !== "wall" && t !== "water";
}
function hasPath(terrain, sx, sy, ex, ey) {
  const visited = /* @__PURE__ */ new Set();
  const queue = [[sx, sy]];
  visited.add(`${sx},${sy}`);
  while (queue.length > 0) {
    const [x, y] = queue.shift();
    if (x === ex && y === ey) return true;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H && !visited.has(key) && isWalkable(terrain[ny][nx])) {
        visited.add(key);
        queue.push([nx, ny]);
      }
    }
  }
  return false;
}

// src/server/game-engine.ts
var nextGameId = 1;
var SurrenderOrDieServer = class _SurrenderOrDieServer {
  games = /* @__PURE__ */ new Map();
  // --- Lifecycle ---
  createGame(playerHandle, side = "left") {
    const id = `g${nextGameId++}`;
    const map = generateMap();
    const player = {
      handle: playerHandle,
      side,
      gold: STARTING_GOLD,
      castle: CASTLE_HP,
      upgrades: [],
      researching: null
    };
    const game = {
      id,
      phase: "lobby",
      tick: 0,
      elapsed: 0,
      players: {
        left: side === "left" ? player : null,
        right: side === "right" ? player : null
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
      nextEventTick: EVENT_INTERVAL * TICK_RATE
    };
    this.games.set(id, game);
    this.addLog(game, `${playerHandle} created the game (${side} castle, seed ${map.seed})`);
    return this.snapshot(game);
  }
  joinGame(gameId, playerHandle) {
    const game = this.getGameOrThrow(gameId);
    if (game.phase !== "lobby") throw new Error(`Game is not in lobby`);
    const openSide = game.players.left === null ? "left" : "right";
    if (game.players[openSide] !== null) throw new Error(`Game is full`);
    const existing = openSide === "left" ? game.players.right : game.players.left;
    if (existing && existing.handle === playerHandle) throw new Error(`Cannot play against yourself`);
    game.players[openSide] = {
      handle: playerHandle,
      side: openSide,
      gold: STARTING_GOLD,
      castle: CASTLE_HP,
      upgrades: [],
      researching: null
    };
    game.phase = "playing";
    this.addLog(game, `${playerHandle} joined (${openSide} castle) \u2014 FIGHT!`);
    return this.snapshot(game);
  }
  // --- Orders ---
  trainUnit(gameId, playerHandle, unitType) {
    const game = this.getGameOrThrow(gameId);
    if (game.phase !== "playing") throw new Error(`Game is not active`);
    const player = this.getPlayer(game, playerHandle);
    const stats2 = UNIT_STATS[unitType];
    if (!stats2) throw new Error(`Unknown unit type: ${unitType}`);
    if (player.gold < stats2.cost) throw new Error(`Not enough gold (have ${Math.floor(player.gold)}, need ${stats2.cost})`);
    player.gold -= stats2.cost;
    const unit = this.spawnUnit(game, unitType, player.side, player);
    this.addLog(game, `${playerHandle} trained a ${unitType} [#${unit.id}]`);
    return this.snapshot(game);
  }
  trainBatch(gameId, playerHandle, unitTypes) {
    const game = this.getGameOrThrow(gameId);
    if (game.phase !== "playing") throw new Error(`Game is not active`);
    const player = this.getPlayer(game, playerHandle);
    const trained = [];
    for (const unitType of unitTypes) {
      const stats2 = UNIT_STATS[unitType];
      if (!stats2) continue;
      if (player.gold < stats2.cost) continue;
      player.gold -= stats2.cost;
      this.spawnUnit(game, unitType, player.side, player);
      trained.push(unitType);
    }
    if (trained.length > 0) {
      this.addLog(game, `${playerHandle} trained: ${trained.join(", ")}`);
    }
    return this.snapshot(game);
  }
  moveUnits(gameId, playerHandle, unitIds, targetX, targetY) {
    const game = this.getGameOrThrow(gameId);
    if (game.phase !== "playing") throw new Error(`Game is not active`);
    const player = this.getPlayer(game, playerHandle);
    const tx = Math.max(0, Math.min(MAP_W, targetX));
    const ty = Math.max(0, Math.min(MAP_H, targetY));
    for (const unit of game.units) {
      if (unitIds.includes(unit.id) && unit.owner === player.side) {
        unit.targetX = tx;
        unit.targetY = ty;
        unit.attackTargetId = null;
        unit.miningTargetId = null;
        unit.state = "moving";
      }
    }
    return this.snapshot(game);
  }
  attackMove(gameId, playerHandle, unitIds, targetX, targetY) {
    const game = this.getGameOrThrow(gameId);
    if (game.phase !== "playing") throw new Error(`Game is not active`);
    const player = this.getPlayer(game, playerHandle);
    const tx = Math.max(0, Math.min(MAP_W, targetX));
    const ty = Math.max(0, Math.min(MAP_H, targetY));
    for (const unit of game.units) {
      if (unitIds.includes(unit.id) && unit.owner === player.side) {
        unit.targetX = tx;
        unit.targetY = ty;
        unit.attackTargetId = null;
        unit.miningTargetId = null;
        unit.state = "moving";
      }
    }
    return this.snapshot(game);
  }
  attackTarget(gameId, playerHandle, unitIds, targetUnitId) {
    const game = this.getGameOrThrow(gameId);
    if (game.phase !== "playing") throw new Error(`Game is not active`);
    const player = this.getPlayer(game, playerHandle);
    const target = game.units.find((u) => u.id === targetUnitId);
    if (!target) throw new Error(`Target unit ${targetUnitId} not found`);
    if (target.owner === player.side) throw new Error(`Cannot attack your own units`);
    for (const unit of game.units) {
      if (unitIds.includes(unit.id) && unit.owner === player.side) {
        unit.attackTargetId = targetUnitId;
        unit.miningTargetId = null;
        unit.state = "moving";
      }
    }
    return this.snapshot(game);
  }
  // --- Mining ---
  mineGold(gameId, playerHandle, unitIds, mineId) {
    const game = this.getGameOrThrow(gameId);
    if (game.phase !== "playing") throw new Error(`Game is not active`);
    const player = this.getPlayer(game, playerHandle);
    const mine = game.mines.find((m) => m.id === mineId);
    if (!mine) throw new Error(`Mine ${mineId} not found`);
    for (const unit of game.units) {
      if (unitIds.includes(unit.id) && unit.owner === player.side && unit.type === "peasant") {
        unit.miningTargetId = mineId;
        unit.attackTargetId = null;
        unit.targetX = mine.x;
        unit.targetY = mine.y;
        unit.state = "moving";
      }
    }
    return this.snapshot(game);
  }
  // --- Abilities ---
  useAbility(gameId, playerHandle, unitId, targetX, targetY) {
    const game = this.getGameOrThrow(gameId);
    if (game.phase !== "playing") throw new Error(`Game is not active`);
    const player = this.getPlayer(game, playerHandle);
    const unit = game.units.find((u) => u.id === unitId && u.owner === player.side);
    if (!unit) throw new Error(`Unit ${unitId} not found or not yours`);
    if (unit.abilityCooldown > 0) throw new Error(`Ability on cooldown (${Math.ceil(unit.abilityCooldown / TICK_RATE)}s)`);
    const abilityDef = ABILITY_DEFS[unit.type];
    unit.abilityCooldown = abilityDef.cooldown * TICK_RATE;
    switch (abilityDef.type) {
      case "rally": {
        for (const other of game.units) {
          if (other.owner === unit.owner && other.type === "peasant" && this.distance(unit.x, unit.y, other.x, other.y) <= 5) {
            other.abilityActive = true;
            other.abilityUntil = game.tick + abilityDef.duration * TICK_RATE;
          }
        }
        this.addLog(game, `Peasant #${unit.id} rallies nearby peasants!`);
        break;
      }
      case "shield_wall": {
        unit.abilityActive = true;
        unit.abilityUntil = game.tick + abilityDef.duration * TICK_RATE;
        unit.state = "fortified";
        this.addLog(game, `Knight #${unit.id} raises shield wall!`);
        break;
      }
      case "volley": {
        const vx = targetX ?? unit.x;
        const vy = targetY ?? unit.y;
        const volleyRange = UNIT_STATS.archer.range + (player.upgrades.includes("archer_longbow") ? 2 : 0);
        if (this.distance(unit.x, unit.y, vx, vy) > volleyRange + 1) {
          throw new Error("Target out of range");
        }
        let hits = 0;
        for (const other of game.units) {
          if (other.owner !== unit.owner && other.hp > 0 && this.distance(vx, vy, other.x, other.y) <= 3) {
            other.hp -= Math.floor(UNIT_STATS.archer.damage * 0.7);
            hits++;
          }
        }
        this.addLog(game, `Archer #${unit.id} fires volley! Hit ${hits} units`);
        break;
      }
      case "fortify": {
        unit.abilityActive = true;
        unit.abilityUntil = game.tick + abilityDef.duration * TICK_RATE;
        unit.state = "fortified";
        this.addLog(game, `Catapult #${unit.id} fortifies! Double range and damage`);
        break;
      }
      case "decoy": {
        const decoy = this.spawnUnit(game, "jester", unit.owner, player);
        decoy.isDecoy = true;
        decoy.decoyUntil = game.tick + abilityDef.duration * TICK_RATE;
        decoy.hp = 1;
        decoy.maxHp = 1;
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
  research(gameId, playerHandle, upgradeId) {
    const game = this.getGameOrThrow(gameId);
    if (game.phase !== "playing") throw new Error(`Game is not active`);
    const player = this.getPlayer(game, playerHandle);
    if (player.researching) throw new Error(`Already researching ${player.researching.id}`);
    if (player.upgrades.includes(upgradeId)) throw new Error(`Already have ${upgradeId}`);
    const def = UPGRADES.find((u) => u.id === upgradeId);
    if (!def) throw new Error(`Unknown upgrade: ${upgradeId}`);
    if (def.exclusive && player.upgrades.includes(def.exclusive)) {
      throw new Error(`Cannot research \u2014 conflicts with ${def.exclusive}`);
    }
    if (def.requires && !player.upgrades.includes(def.requires)) {
      throw new Error(`Requires ${def.requires} first`);
    }
    if (player.gold < def.cost) throw new Error(`Not enough gold (have ${Math.floor(player.gold)}, need ${def.cost})`);
    player.gold -= def.cost;
    player.researching = {
      id: upgradeId,
      completeTick: game.tick + def.researchTime * TICK_RATE
    };
    this.addLog(game, `${playerHandle} researching ${def.name}...`);
    return this.snapshot(game);
  }
  surrender(gameId, playerHandle) {
    const game = this.getGameOrThrow(gameId);
    if (game.phase !== "playing") throw new Error(`Game is not active`);
    const player = this.getPlayer(game, playerHandle);
    if (player.castle <= CASTLE_HP * 0.5) {
      throw new Error(`Cannot surrender \u2014 castle HP too low (must be above 50%). Fight or die!`);
    }
    const opponent = player.side === "left" ? game.players.right : game.players.left;
    game.phase = "finished";
    game.winner = opponent?.handle ?? "draw";
    game.surrendered = playerHandle;
    this.addLog(game, `${playerHandle} SURRENDERS! ${game.winner} wins!`);
    return this.snapshot(game);
  }
  // --- Status (with fog of war) ---
  getStatus(gameId, forHandle) {
    const game = this.games.get(gameId);
    if (!game) return null;
    if (!forHandle || game.phase !== "playing") return this.snapshot(game);
    const player = this.tryGetPlayer(game, forHandle);
    if (!player) return this.snapshot(game);
    return this.fogFilteredState(game, player.side);
  }
  // Full state (no fog) for spectators / lobby
  getStatusFull(gameId) {
    const game = this.games.get(gameId);
    return game ? this.snapshot(game) : null;
  }
  listGames() {
    return Array.from(this.games.values()).map((g) => ({
      ...this.snapshot(g),
      // Don't send full terrain/units in list — just metadata
      units: [],
      terrain: [],
      mines: []
    }));
  }
  activeGameIds() {
    return Array.from(this.games.entries()).filter(([_, g]) => g.phase === "playing").map(([id]) => id);
  }
  getGameTick(gameId) {
    const game = this.games.get(gameId);
    return game ? game.tick : -1;
  }
  // --- Simulation ---
  tick(gameId) {
    const game = this.getGameOrThrow(gameId);
    if (game.phase !== "playing") return;
    game.tick++;
    game.elapsed = game.tick / TICK_RATE;
    this.applyIncome(game);
    this.applyMining(game);
    this.checkResearch(game);
    this.expireEffects(game);
    this.moveAllUnits(game);
    this.resolveCombat(game);
    this.checkCastleDamage(game);
    this.removeDeadUnits(game);
    this.processEvents(game);
    this.checkWinCondition(game);
    if (game.log.length > 30) {
      game.log = game.log.slice(-30);
    }
  }
  // --- Persistence ---
  toJSON() {
    return { games: Array.from(this.games.values()), nextId: nextGameId };
  }
  static fromJSON(data) {
    const server = new _SurrenderOrDieServer();
    for (const g of data.games) server.games.set(g.id, g);
    nextGameId = data.nextId;
    return server;
  }
  // ===== Private: Simulation =====
  applyIncome(game) {
    const isGoldRush = game.activeEvent?.type === "gold_rush";
    const mult = isGoldRush ? 2 : 1;
    const incomePerTick = GOLD_PER_SECOND * mult / TICK_RATE;
    for (const side of ["left", "right"]) {
      const player = game.players[side];
      if (player) {
        player.gold = Math.min(MAX_GOLD, player.gold + incomePerTick);
      }
    }
  }
  applyMining(game) {
    for (const mine of game.mines) {
      if (mine.remaining <= 0) continue;
      mine.workerIds = mine.workerIds.filter((id) => {
        const u = game.units.find((u2) => u2.id === id);
        return u && u.hp > 0 && u.state === "mining" && u.miningTargetId === mine.id;
      });
      if (mine.workerIds.length > 0) {
        const firstWorker = game.units.find((u) => u.id === mine.workerIds[0]);
        mine.claimedBy = firstWorker?.owner ?? null;
      } else {
        mine.claimedBy = null;
      }
      for (const workerId of mine.workerIds) {
        const worker = game.units.find((u) => u.id === workerId);
        if (!worker || worker.owner === "neutral") continue;
        const player = game.players[worker.owner];
        if (!player) continue;
        let rate = MINE_RATE;
        if (player.upgrades.includes("peasant_prospector")) rate *= 1.5;
        const goldPerTick = rate / TICK_RATE;
        const mined = Math.min(goldPerTick, mine.remaining);
        mine.remaining -= mined;
        player.gold = Math.min(MAX_GOLD, player.gold + mined);
      }
    }
  }
  checkResearch(game) {
    for (const side of ["left", "right"]) {
      const player = game.players[side];
      if (!player || !player.researching) continue;
      if (game.tick >= player.researching.completeTick) {
        const id = player.researching.id;
        player.upgrades.push(id);
        player.researching = null;
        const def = UPGRADES.find((u) => u.id === id);
        this.addLog(game, `${player.handle} completed ${def?.name ?? id}!`);
        if (id === "castle_reinforce") {
          player.castle = Math.min(CASTLE_HP + 100, player.castle + 100);
        }
      }
    }
  }
  expireEffects(game) {
    for (const unit of game.units) {
      if (unit.abilityActive && game.tick >= unit.abilityUntil) {
        unit.abilityActive = false;
        if (unit.state === "fortified") unit.state = "idle";
      }
      if (unit.confused && game.tick >= unit.confusedUntil) {
        unit.confused = false;
      }
      if (unit.slowed && game.tick >= unit.slowedUntil) {
        unit.slowed = false;
      }
      if (unit.isDecoy && game.tick >= unit.decoyUntil) {
        unit.hp = 0;
      }
      if (unit.abilityCooldown > 0) {
        unit.abilityCooldown--;
      }
    }
  }
  moveAllUnits(game) {
    for (const unit of game.units) {
      if (unit.hp <= 0) continue;
      if (unit.state === "fortified" || unit.state === "mining") continue;
      if (unit.attackTargetId !== null) {
        const target = game.units.find((u) => u.id === unit.attackTargetId);
        if (target && target.hp > 0) {
          const dist2 = this.distance(unit.x, unit.y, target.x, target.y);
          const range = this.getUnitRange(unit, game);
          if (dist2 <= range) {
            unit.state = "attacking";
            continue;
          }
          this.moveUnitToward(unit, target.x, target.y, game);
          continue;
        } else {
          unit.attackTargetId = null;
        }
      }
      if (unit.miningTargetId !== null) {
        const mine = game.mines.find((m) => m.id === unit.miningTargetId);
        if (mine && mine.remaining > 0) {
          const dist2 = this.distance(unit.x, unit.y, mine.x, mine.y);
          if (dist2 < 1) {
            if (mine.workerIds.length < MAX_WORKERS_PER_MINE && !mine.workerIds.includes(unit.id)) {
              mine.workerIds.push(unit.id);
            }
            unit.state = "mining";
            continue;
          }
          this.moveUnitToward(unit, mine.x, mine.y, game);
          continue;
        } else {
          unit.miningTargetId = null;
        }
      }
      const dist = this.distance(unit.x, unit.y, unit.targetX, unit.targetY);
      if (dist < 0.1) {
        unit.state = "idle";
        const nearest2 = this.findNearestEnemy(game, unit);
        if (nearest2) {
          const range = this.getUnitRange(unit, game);
          const eDist = this.distance(unit.x, unit.y, nearest2.x, nearest2.y);
          if (eDist <= range * 1.5) {
            unit.attackTargetId = nearest2.id;
            unit.state = "attacking";
          }
        }
        continue;
      }
      const nearest = this.findNearestEnemy(game, unit);
      if (nearest) {
        const range = this.getUnitRange(unit, game);
        const eDist = this.distance(unit.x, unit.y, nearest.x, nearest.y);
        if (eDist <= range) {
          unit.attackTargetId = nearest.id;
          unit.state = "attacking";
          continue;
        }
      }
      this.moveUnitToward(unit, unit.targetX, unit.targetY, game);
    }
  }
  moveUnitToward(unit, tx, ty, game) {
    const stats2 = UNIT_STATS[unit.type];
    let speed = stats2.speed;
    const tileX = Math.floor(Math.max(0, Math.min(MAP_W - 1, unit.x)));
    const tileY = Math.floor(Math.max(0, Math.min(MAP_H - 1, unit.y)));
    const terrain = game.terrain[tileY]?.[tileX] ?? "open";
    speed *= TERRAIN_PROPS[terrain].speedMult;
    if (unit.type === "peasant" && unit.abilityActive) speed *= 1.5;
    if (unit.slowed) speed *= 0.5;
    if (unit.type === "knight") {
      const player = unit.owner !== "neutral" ? game.players[unit.owner] : null;
      if (player?.upgrades.includes("knight_heavy")) speed = Math.max(0.5, speed - 0.5);
    }
    const dx = tx - unit.x;
    const dy = ty - unit.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.01) return;
    const step = speed * TICK_DT;
    const move = Math.min(step, dist);
    const dir = unit.confused ? -1 : 1;
    const newX = unit.x + dx / dist * move * dir;
    const newY = unit.y + dy / dist * move * dir;
    const ntx = Math.floor(Math.max(0, Math.min(MAP_W - 1, newX)));
    const nty = Math.floor(Math.max(0, Math.min(MAP_H - 1, newY)));
    const targetTerrain = game.terrain[nty]?.[ntx] ?? "open";
    if (TERRAIN_PROPS[targetTerrain].walkable) {
      unit.x = Math.max(0, Math.min(MAP_W, newX));
      unit.y = Math.max(0, Math.min(MAP_H, newY));
    }
    unit.state = "moving";
  }
  resolveCombat(game) {
    for (const unit of game.units) {
      if (unit.hp <= 0 || unit.isDecoy) continue;
      if (unit.attackCooldown > 0) {
        unit.attackCooldown -= TICK_DT;
        continue;
      }
      let target;
      if (unit.attackTargetId !== null) {
        target = game.units.find((u) => u.id === unit.attackTargetId && u.hp > 0);
      }
      if (!target) {
        target = this.findNearestEnemy(game, unit);
      }
      if (!target) continue;
      const range = this.getUnitRange(unit, game);
      const dist = this.distance(unit.x, unit.y, target.x, target.y);
      if (dist > range) continue;
      if (range > 1 && this.isRangedBlocked(unit.x, unit.y, target.x, target.y, game)) {
        continue;
      }
      let dmg = this.getUnitDamage(unit, game);
      if (target.type === "knight" && unit.type === "peasant") {
        dmg = Math.floor(dmg / 2);
      }
      if (target.abilityActive && target.type === "knight") {
        dmg = Math.floor(dmg / 2);
      }
      if (unit.type === "knight" && unit.chargeReady) {
        const player = unit.owner !== "neutral" ? game.players[unit.owner] : null;
        if (player?.upgrades.includes("knight_lancer")) {
          dmg *= 2;
          unit.chargeReady = false;
        }
      }
      target.hp -= dmg;
      let atkSpeed = UNIT_STATS[unit.type].attackSpeed;
      if (unit.type === "archer") {
        const player = unit.owner !== "neutral" ? game.players[unit.owner] : null;
        if (player?.upgrades.includes("archer_rapid")) atkSpeed += 0.5;
      }
      unit.attackCooldown = 1 / atkSpeed;
      unit.state = "attacking";
      if (unit.type === "catapult") {
        const player = unit.owner !== "neutral" ? game.players[unit.owner] : null;
        if (player?.upgrades.includes("catapult_bombard")) {
          for (const other of game.units) {
            if (other.id !== target.id && other.owner !== unit.owner && other.hp > 0 && this.distance(target.x, target.y, other.x, other.y) <= 1.5) {
              other.hp -= Math.floor(dmg * 0.5);
            }
          }
        }
      }
      if (unit.type === "jester" && !target.confused) {
        const confDuration = this.getPlayerForUnit(game, unit)?.upgrades.includes("jester_trickster") ? 5 : 3;
        target.confused = true;
        target.confusedUntil = game.tick + confDuration * TICK_RATE;
      }
      if (unit.type === "jester") {
        const player = this.getPlayerForUnit(game, unit);
        if (player?.upgrades.includes("jester_saboteur") && !target.slowed) {
          target.slowed = true;
          target.slowedUntil = game.tick + 4 * TICK_RATE;
        }
      }
      if (target.hp <= 0) {
        const owner = this.getPlayerForUnit(game, unit);
        this.addLog(game, `${owner?.handle ?? "Neutral"}'s ${unit.type} killed a ${target.type}`);
        unit.attackTargetId = null;
        unit.state = "idle";
      }
    }
  }
  checkCastleDamage(game) {
    for (const side of ["left", "right"]) {
      const player = game.players[side];
      if (!player || !player.upgrades.includes("castle_arrowslits")) continue;
      const castleX = side === "left" ? CASTLE_WIDTH / 2 : MAP_W - CASTLE_WIDTH / 2;
      const castleY = MAP_H / 2;
      for (const unit of game.units) {
        if (unit.owner === side || unit.hp <= 0) continue;
        if (this.distance(unit.x, unit.y, castleX, castleY) <= CASTLE_WIDTH + 2) {
          unit.hp -= 5 / TICK_RATE;
        }
      }
    }
    for (const unit of game.units) {
      if (unit.hp <= 0 || unit.owner === "neutral") continue;
      if (unit.attackCooldown > 0) continue;
      const stats2 = UNIT_STATS[unit.type];
      const enemySide = unit.owner === "left" ? "right" : "left";
      const castleX = enemySide === "left" ? CASTLE_WIDTH / 2 : MAP_W - CASTLE_WIDTH / 2;
      const castleY = MAP_H / 2;
      const dist = this.distance(unit.x, unit.y, castleX, castleY);
      const range = this.getUnitRange(unit, game);
      if (dist <= range + CASTLE_WIDTH) {
        const nearestEnemy = this.findNearestEnemy(game, unit);
        const enemyDist = nearestEnemy ? this.distance(unit.x, unit.y, nearestEnemy.x, nearestEnemy.y) : Infinity;
        if (enemyDist > range || unit.type === "catapult") {
          const player = game.players[enemySide];
          if (player && player.castle > 0) {
            let dmg = this.getUnitDamage(unit, game);
            if (unit.type === "catapult") dmg = Math.floor(dmg * 1.5);
            player.castle = Math.max(0, player.castle - dmg);
            unit.attackCooldown = 1 / stats2.attackSpeed;
            unit.state = "attacking";
          }
        }
      }
    }
  }
  removeDeadUnits(game) {
    const before = game.units.length;
    game.units = game.units.filter((u) => u.hp > 0);
    if (game.units.length < before) {
      const liveIds = new Set(game.units.map((u) => u.id));
      for (const mine of game.mines) {
        mine.workerIds = mine.workerIds.filter((id) => liveIds.has(id));
      }
    }
  }
  processEvents(game) {
    if (game.activeEvent && game.tick >= game.activeEvent.startTick + game.activeEvent.duration) {
      game.activeEvent = null;
    }
    if (game.tick >= game.nextEventTick && !game.activeEvent) {
      const eventDef = EVENT_DEFS[Math.floor(Math.random() * EVENT_DEFS.length)];
      const event = {
        type: eventDef.type,
        name: eventDef.name,
        description: eventDef.description,
        startTick: game.tick,
        duration: eventDef.durationSec * TICK_RATE
      };
      switch (eventDef.type) {
        case "mercenaries": {
          for (let i = 0; i < 3; i++) {
            const pos = this.findOpenSpot(game);
            if (pos) {
              const types = ["knight", "archer", "peasant"];
              const type = types[Math.floor(Math.random() * types.length)];
              const stats2 = UNIT_STATS[type];
              const merc = {
                id: game.nextUnitId++,
                type,
                owner: "neutral",
                x: pos[0],
                y: pos[1],
                hp: stats2.hp,
                maxHp: stats2.hp,
                targetX: pos[0],
                targetY: pos[1],
                attackTargetId: null,
                attackCooldown: 0,
                confused: false,
                confusedUntil: 0,
                state: "idle",
                abilityCooldown: 0,
                abilityActive: false,
                abilityUntil: 0,
                miningTargetId: null,
                isDecoy: false,
                decoyUntil: 0,
                slowed: false,
                slowedUntil: 0,
                chargeReady: false
              };
              game.units.push(merc);
            }
          }
          event.duration = 1;
          break;
        }
        case "earthquake": {
          for (let i = 0; i < 8; i++) {
            const x = 4 + Math.floor(Math.random() * (MAP_W - 8));
            const y = 1 + Math.floor(Math.random() * (MAP_H - 2));
            const options = ["open", "open", "open", "forest", "hill", "wall"];
            game.terrain[y][x] = options[Math.floor(Math.random() * options.length)];
          }
          event.duration = 1;
          break;
        }
      }
      game.activeEvent = event;
      game.nextEventTick = game.tick + EVENT_INTERVAL * TICK_RATE;
      this.addLog(game, `EVENT: ${eventDef.name} \u2014 ${eventDef.description}`);
    }
  }
  checkWinCondition(game) {
    const leftDead = game.players.left && game.players.left.castle <= 0;
    const rightDead = game.players.right && game.players.right.castle <= 0;
    if (leftDead && rightDead) {
      game.phase = "finished";
      game.winner = "draw";
      this.addLog(game, "Both castles destroyed \u2014 DRAW!");
    } else if (leftDead) {
      game.phase = "finished";
      game.winner = game.players.right?.handle ?? "right";
      this.addLog(game, `${game.winner} wins \u2014 left castle destroyed!`);
    } else if (rightDead) {
      game.phase = "finished";
      game.winner = game.players.left?.handle ?? "left";
      this.addLog(game, `${game.winner} wins \u2014 right castle destroyed!`);
    } else if (game.elapsed >= GAME_DURATION) {
      game.phase = "finished";
      const leftHP = game.players.left?.castle ?? 0;
      const rightHP = game.players.right?.castle ?? 0;
      if (leftHP > rightHP) game.winner = game.players.left?.handle ?? "left";
      else if (rightHP > leftHP) game.winner = game.players.right?.handle ?? "right";
      else game.winner = "draw";
      this.addLog(game, `Time's up! ${game.winner} wins (${Math.ceil(leftHP)} HP vs ${Math.ceil(rightHP)} HP)`);
    }
  }
  // ===== Private: Helpers =====
  getUnitRange(unit, game) {
    let range = UNIT_STATS[unit.type].range;
    const tileX = Math.floor(Math.max(0, Math.min(MAP_W - 1, unit.x)));
    const tileY = Math.floor(Math.max(0, Math.min(MAP_H - 1, unit.y)));
    const terrain = game.terrain[tileY]?.[tileX] ?? "open";
    range += TERRAIN_PROPS[terrain].rangeBonus;
    const player = this.getPlayerForUnit(game, unit);
    if (unit.type === "archer" && player?.upgrades.includes("archer_longbow")) range += 2;
    if (unit.type === "catapult" && player?.upgrades.includes("catapult_trebuchet")) range += 3;
    if (unit.type === "catapult" && unit.abilityActive) range *= 2;
    return range;
  }
  getUnitDamage(unit, game) {
    let dmg = UNIT_STATS[unit.type].damage;
    const player = this.getPlayerForUnit(game, unit);
    if (unit.type === "peasant" && player?.upgrades.includes("peasant_militia")) dmg += 3;
    if (unit.type === "knight" && player?.upgrades.includes("knight_lancer")) dmg += 10;
    if (unit.type === "catapult" && player?.upgrades.includes("catapult_trebuchet")) dmg += 10;
    if (unit.type === "catapult" && unit.abilityActive) dmg *= 2;
    return dmg;
  }
  isRangedBlocked(ax, ay, bx, by, game) {
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
  spawnUnit(game, type, side, player) {
    const spawnX = side === "left" ? SPAWN_LEFT_X : SPAWN_RIGHT_X;
    const spawnY = MAP_H / 2 + (Math.random() - 0.5) * 4;
    const targetX = side === "left" ? MAP_W - CASTLE_WIDTH / 2 : CASTLE_WIDTH / 2;
    const stats2 = UNIT_STATS[type];
    let hp = stats2.hp;
    if (type === "peasant" && player?.upgrades.includes("peasant_militia")) hp += 10;
    if (type === "knight" && player?.upgrades.includes("knight_heavy")) hp += 30;
    const unit = {
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
      confused: false,
      confusedUntil: 0,
      state: "moving",
      abilityCooldown: 0,
      abilityActive: false,
      abilityUntil: 0,
      miningTargetId: null,
      isDecoy: false,
      decoyUntil: 0,
      slowed: false,
      slowedUntil: 0,
      chargeReady: type === "knight" && (player?.upgrades.includes("knight_lancer") ?? false)
    };
    game.units.push(unit);
    return unit;
  }
  findNearestEnemy(game, unit) {
    let nearest;
    let nearestDist = Infinity;
    for (const other of game.units) {
      if (other.owner === unit.owner || other.owner === "neutral" || other.hp <= 0) continue;
      const d = this.distance(unit.x, unit.y, other.x, other.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = other;
      }
    }
    return nearest;
  }
  findOpenSpot(game) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const x = 4 + Math.floor(Math.random() * (MAP_W - 8));
      const y = 1 + Math.floor(Math.random() * (MAP_H - 2));
      if (TERRAIN_PROPS[game.terrain[y][x]].walkable) return [x + 0.5, y + 0.5];
    }
    return null;
  }
  distance(ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    return Math.sqrt(dx * dx + dy * dy);
  }
  getGameOrThrow(gameId) {
    const game = this.games.get(gameId);
    if (!game) throw new Error(`Game ${gameId} not found`);
    return game;
  }
  getPlayer(game, handle) {
    if (game.players.left?.handle === handle) return game.players.left;
    if (game.players.right?.handle === handle) return game.players.right;
    throw new Error(`Player ${handle} not in this game`);
  }
  tryGetPlayer(game, handle) {
    if (game.players.left?.handle === handle) return game.players.left;
    if (game.players.right?.handle === handle) return game.players.right;
    return null;
  }
  getPlayerBySide(game, side) {
    return game.players[side];
  }
  getPlayerForUnit(game, unit) {
    if (unit.owner === "neutral") return null;
    return game.players[unit.owner] ?? null;
  }
  addLog(game, message) {
    game.log.push({ tick: game.tick, message });
  }
  snapshot(game) {
    return structuredClone(game);
  }
  // --- Fog of war ---
  fogFilteredState(game, side) {
    const visibility = this.computeVisibility(game, side);
    const snapshot = structuredClone(game);
    snapshot.units = snapshot.units.filter((u) => {
      if (u.owner === side) return true;
      const tx = Math.floor(Math.max(0, Math.min(MAP_W - 1, u.x)));
      const ty = Math.floor(Math.max(0, Math.min(MAP_H - 1, u.y)));
      return visibility[ty][tx];
    });
    snapshot.mines = snapshot.mines.map((m) => {
      const tx = Math.floor(Math.max(0, Math.min(MAP_W - 1, m.x)));
      const ty = Math.floor(Math.max(0, Math.min(MAP_H - 1, m.y)));
      if (visibility[ty][tx]) return m;
      return { ...m, workerIds: [], claimedBy: null, remaining: -1 };
    });
    return snapshot;
  }
  computeVisibility(game, side) {
    const vis = [];
    for (let y = 0; y < MAP_H; y++) {
      vis.push(new Array(MAP_W).fill(false));
    }
    if (game.activeEvent?.type === "fog_lifts") {
      for (let y = 0; y < MAP_H; y++) vis[y].fill(true);
      return vis;
    }
    const castleX = side === "left" ? CASTLE_WIDTH / 2 : MAP_W - CASTLE_WIDTH / 2;
    this.revealCircle(vis, castleX, MAP_H / 2, CASTLE_VISION, game);
    for (const unit of game.units) {
      if (unit.owner !== side || unit.hp <= 0) continue;
      let visionRadius = UNIT_STATS[unit.type].vision;
      const tx = Math.floor(Math.max(0, Math.min(MAP_W - 1, unit.x)));
      const ty = Math.floor(Math.max(0, Math.min(MAP_H - 1, unit.y)));
      visionRadius += TERRAIN_PROPS[game.terrain[ty][tx]].visionBonus;
      this.revealCircle(vis, unit.x, unit.y, Math.max(1, visionRadius), game);
    }
    return vis;
  }
  revealCircle(vis, cx, cy, radius, _game) {
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
};

// src/server/auth.ts
import { randomUUID } from "crypto";
var tokenToHandle = /* @__PURE__ */ new Map();
var handleToToken = /* @__PURE__ */ new Map();
function login(handle) {
  if (!handle || typeof handle !== "string" || handle.trim().length === 0) {
    throw new Error("Handle is required");
  }
  handle = handle.trim().slice(0, 32);
  const existing = handleToToken.get(handle);
  if (existing) {
    return { token: existing, handle };
  }
  const token = randomUUID();
  tokenToHandle.set(token, handle);
  handleToToken.set(handle, token);
  console.log(`[Auth] "${handle}" logged in (token: ${token.slice(0, 8)}...)`);
  return { token, handle };
}
function resolveToken(token) {
  return tokenToHandle.get(token) ?? null;
}
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header (use Bearer <token>)" });
    return;
  }
  const token = authHeader.slice(7);
  const handle = resolveToken(token);
  if (!handle) {
    res.status(401).json({ error: "Invalid token \u2014 login first" });
    return;
  }
  req.playerHandle = handle;
  next();
}

// src/server/scoring.ts
var STARTING_ELO = 1e3;
var K_FACTOR = 32;
var stats = /* @__PURE__ */ new Map();
var matchHistory = [];
function getOrCreate(handle) {
  let s = stats.get(handle);
  if (!s) {
    s = {
      handle,
      elo: STARTING_ELO,
      wins: 0,
      losses: 0,
      surrenders: 0,
      draws: 0,
      points: 0,
      gamesPlayed: 0,
      winStreak: 0,
      bestStreak: 0
    };
    stats.set(handle, s);
  }
  return s;
}
function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}
function updateElo(winner, loser, draw) {
  const expectedW = expectedScore(winner.elo, loser.elo);
  const expectedL = expectedScore(loser.elo, winner.elo);
  if (draw) {
    const deltaW2 = Math.round(K_FACTOR * (0.5 - expectedW));
    const deltaL2 = Math.round(K_FACTOR * (0.5 - expectedL));
    winner.elo += deltaW2;
    loser.elo += deltaL2;
    return { winnerDelta: deltaW2, loserDelta: deltaL2 };
  }
  const deltaW = Math.round(K_FACTOR * (1 - expectedW));
  const deltaL = Math.round(K_FACTOR * (0 - expectedL));
  winner.elo += deltaW;
  loser.elo += deltaL;
  return { winnerDelta: deltaW, loserDelta: deltaL };
}
function recordGameResult(gameId, leftHandle, rightHandle, winner, surrendered, duration, mapSeed) {
  const left = getOrCreate(leftHandle);
  const right = getOrCreate(rightHandle);
  let eloChange = { left: 0, right: 0 };
  if (winner === "draw" || winner === null) {
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
    eloChange = isLeftWinner ? { left: winnerDelta, right: loserDelta } : { left: loserDelta, right: winnerDelta };
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
  const record = {
    id: gameId,
    timestamp: Date.now(),
    players: { left: leftHandle, right: rightHandle },
    winner,
    surrendered,
    duration,
    mapSeed,
    eloChange
  };
  matchHistory.push(record);
  console.log(`[Score] Game ${gameId}: ${winner === "draw" ? "draw" : `${winner} wins`} (ELO: ${leftHandle} ${left.elo} [${eloChange.left > 0 ? "+" : ""}${eloChange.left}], ${rightHandle} ${right.elo} [${eloChange.right > 0 ? "+" : ""}${eloChange.right}])`);
  return record;
}
function getStats(handle) {
  return stats.get(handle) ?? null;
}
function getLeaderboard() {
  return Array.from(stats.values()).sort((a, b) => b.elo - a.elo);
}
function getMatchHistory(handle, limit = 20) {
  let records = matchHistory;
  if (handle) {
    records = records.filter(
      (r) => r.players.left === handle || r.players.right === handle
    );
  }
  return records.slice(-limit).reverse();
}

// src/server/app.ts
var __dirname = path.dirname(fileURLToPath(import.meta.url));
var PORT = parseInt(process.env.PORT ?? "4000", 10);
var app = express();
app.use(express.json());
var projectRoot = path.resolve(__dirname, "..");
app.use(express.static(path.join(projectRoot, "src", "public")));
app.use("/dist/client", express.static(path.join(projectRoot, "dist", "client")));
var engine = new SurrenderOrDieServer();
var scoredGames = /* @__PURE__ */ new Set();
app.post("/api/auth/login", (req, res) => {
  try {
    const { handle } = req.body;
    const result = login(handle);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.get("/api/games", (req, res) => {
  const games = engine.listGames().map((g) => ({
    id: g.id,
    phase: g.phase,
    players: {
      left: g.players.left ? { handle: g.players.left.handle } : null,
      right: g.players.right ? { handle: g.players.right.handle } : null
    },
    elapsed: g.elapsed,
    winner: g.winner
  }));
  res.json(games);
});
app.post("/api/games", authMiddleware, (req, res) => {
  try {
    const handle = req.playerHandle;
    const side = req.body.side ?? "left";
    const game = engine.createGame(handle, side);
    res.json(game);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.post("/api/games/:id/join", authMiddleware, (req, res) => {
  try {
    const handle = req.playerHandle;
    const game = engine.joinGame(req.params.id, handle);
    res.json(game);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.get("/api/games/:id/state", (req, res) => {
  const since = parseInt(req.query.since);
  if (!isNaN(since)) {
    const currentTick = engine.getGameTick(req.params.id);
    if (currentTick >= 0 && currentTick <= since) {
      res.status(304).end();
      return;
    }
  }
  let handle;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    handle = resolveToken(authHeader.slice(7)) ?? void 0;
  }
  const state = engine.getStatus(req.params.id, handle);
  if (!state) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  res.json(state);
});
app.post("/api/games/:id/train", authMiddleware, (req, res) => {
  try {
    const handle = req.playerHandle;
    const { unitType } = req.body;
    const state = engine.trainUnit(req.params.id, handle, unitType);
    res.json(state);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.post("/api/games/:id/train-batch", authMiddleware, (req, res) => {
  try {
    const handle = req.playerHandle;
    const { unitTypes } = req.body;
    const state = engine.trainBatch(req.params.id, handle, unitTypes);
    res.json(state);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.post("/api/games/:id/move", authMiddleware, (req, res) => {
  try {
    const handle = req.playerHandle;
    const { unitIds, x, y } = req.body;
    const state = engine.moveUnits(req.params.id, handle, unitIds, x, y);
    res.json(state);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.post("/api/games/:id/attack-move", authMiddleware, (req, res) => {
  try {
    const handle = req.playerHandle;
    const { unitIds, x, y } = req.body;
    const state = engine.attackMove(req.params.id, handle, unitIds, x, y);
    res.json(state);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.post("/api/games/:id/attack", authMiddleware, (req, res) => {
  try {
    const handle = req.playerHandle;
    const { unitIds, targetId } = req.body;
    const state = engine.attackTarget(req.params.id, handle, unitIds, targetId);
    res.json(state);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.post("/api/games/:id/surrender", authMiddleware, (req, res) => {
  try {
    const handle = req.playerHandle;
    const state = engine.surrender(req.params.id, handle);
    res.json(state);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.post("/api/games/:id/mine", authMiddleware, (req, res) => {
  try {
    const handle = req.playerHandle;
    const { unitIds, mineId } = req.body;
    const state = engine.mineGold(req.params.id, handle, unitIds, mineId);
    res.json(state);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.post("/api/games/:id/ability", authMiddleware, (req, res) => {
  try {
    const handle = req.playerHandle;
    const { unitId, targetX, targetY } = req.body;
    const state = engine.useAbility(req.params.id, handle, unitId, targetX, targetY);
    res.json(state);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.post("/api/games/:id/research", authMiddleware, (req, res) => {
  try {
    const handle = req.playerHandle;
    const { upgradeId } = req.body;
    const state = engine.research(req.params.id, handle, upgradeId);
    res.json(state);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.get("/api/leaderboard", (_req, res) => {
  res.json(getLeaderboard());
});
app.get("/api/players/:handle/stats", (req, res) => {
  const stats2 = getStats(req.params.handle);
  if (!stats2) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  res.json(stats2);
});
app.get("/api/matches", (req, res) => {
  const handle = req.query.handle;
  const limit = parseInt(req.query.limit) || 20;
  res.json(getMatchHistory(handle, limit));
});
app.get("/api/games/:id/spectate", (req, res) => {
  const since = parseInt(req.query.since);
  if (!isNaN(since)) {
    const currentTick = engine.getGameTick(req.params.id);
    if (currentTick >= 0 && currentTick <= since) {
      res.status(304).end();
      return;
    }
  }
  const state = engine.getStatusFull(req.params.id);
  if (!state) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  res.json(state);
});
function tickAllGames() {
  const activeIds = engine.activeGameIds();
  for (const id of activeIds) {
    engine.tick(id);
    const state = engine.getStatus(id);
    if (state && state.phase === "finished" && !scoredGames.has(id)) {
      scoredGames.add(id);
      scoreGame(state);
    }
  }
}
function scoreGame(state) {
  const left = state.players.left;
  const right = state.players.right;
  if (!left || !right) return;
  recordGameResult(
    state.id,
    left.handle,
    right.handle,
    state.winner,
    state.surrendered,
    state.elapsed,
    state.mapSeed
  );
}
setInterval(tickAllGames, 1e3 / TICK_RATE);
app.listen(PORT, () => {
  console.log(`[SoD] Surrender or Die server running on http://localhost:${PORT}`);
  console.log(`[SoD] API: http://localhost:${PORT}/api/`);
  console.log(`[SoD] Tick rate: ${TICK_RATE} Hz`);
});
//# sourceMappingURL=server.js.map

// types.ts — All interfaces, unit stats, and constants

// --- Map ---
export const MAP_W = 30;  // tiles wide
export const MAP_H = 20;  // tiles tall
export const TILE_SIZE = 24; // pixels per tile for rendering

// --- Economy ---
export const STARTING_GOLD = 50;
export const GOLD_PER_SECOND = 8;
export const MAX_GOLD = 200;

// --- Game timing ---
export const TICK_RATE = 20;           // server ticks per second
export const TICK_DT = 1 / TICK_RATE;  // seconds per tick
export const GAME_DURATION = 300;      // 5 min max (in seconds)

// --- Unit types ---
export type UnitType = 'peasant' | 'knight' | 'archer' | 'catapult' | 'jester';

export interface UnitStats {
  type: UnitType;
  cost: number;
  hp: number;
  damage: number;       // per attack
  attackSpeed: number;  // attacks per second
  speed: number;        // tiles per second
  range: number;        // attack range in tiles (1 = melee)
  special: string;      // flavor description
}

export const UNIT_STATS: Record<UnitType, UnitStats> = {
  peasant: {
    type: 'peasant',
    cost: 10,
    hp: 15,
    damage: 5,
    attackSpeed: 1.5,
    speed: 3.0,
    range: 1,
    special: 'Cheap and cheerful',
  },
  knight: {
    type: 'knight',
    cost: 30,
    hp: 60,
    damage: 15,
    attackSpeed: 0.8,
    speed: 2.0,
    range: 1,
    special: 'Armored: half damage from peasants',
  },
  archer: {
    type: 'archer',
    cost: 20,
    hp: 20,
    damage: 12,
    attackSpeed: 1.0,
    speed: 2.5,
    range: 4,
    special: 'Ranged: shoots from distance',
  },
  catapult: {
    type: 'catapult',
    cost: 50,
    hp: 30,
    damage: 25,
    attackSpeed: 0.3,
    speed: 1.0,
    range: 6,
    special: 'Siege: double damage to castles',
  },
  jester: {
    type: 'jester',
    cost: 15,
    hp: 25,
    damage: 3,
    attackSpeed: 1.0,
    speed: 4.0,
    range: 1,
    special: 'Confuse: reverses enemy direction for 3s on hit',
  },
};

// --- Castle ---
export const CASTLE_HP = 250;
export const CASTLE_WIDTH = 2;  // tiles wide

// Castle positions (top-left corner of castle)
export const CASTLE_LEFT_X = 0;
export const CASTLE_RIGHT_X = MAP_W - CASTLE_WIDTH;

// Spawn points (just outside castle)
export const SPAWN_LEFT_X = CASTLE_WIDTH + 0.5;
export const SPAWN_RIGHT_X = MAP_W - CASTLE_WIDTH - 0.5;

// --- Unit ---
export interface Unit {
  id: number;
  type: UnitType;
  owner: 'left' | 'right';
  x: number;           // tile position (fractional)
  y: number;
  hp: number;
  maxHp: number;
  targetX: number;     // move target
  targetY: number;
  attackTargetId: number | null;  // specific unit to attack
  attackCooldown: number;         // seconds until next attack
  confused: boolean;
  confusedUntil: number;          // tick at which confusion ends
  state: 'moving' | 'attacking' | 'idle';
}

// --- Player ---
export type Side = 'left' | 'right';

export interface Player {
  handle: string;
  side: Side;
  gold: number;
  castle: number;  // HP
}

// --- Game ---
export type GamePhase = 'lobby' | 'playing' | 'finished';

export interface GameState {
  id: string;
  phase: GamePhase;
  tick: number;
  elapsed: number;       // seconds elapsed
  players: { left: Player | null; right: Player | null };
  units: Unit[];
  winner: string | null;      // winning handle, 'draw', or null
  surrendered: string | null; // handle of player who surrendered, or null
  log: LogEntry[];            // recent events
  nextUnitId: number;
}

export interface LogEntry {
  tick: number;
  message: string;
}

// --- API types ---
export interface MoveOrder {
  unitIds: number[];
  targetX: number;
  targetY: number;
}

export interface AttackOrder {
  unitIds: number[];
  targetUnitId: number;
}

export interface AttackMoveOrder {
  unitIds: number[];
  targetX: number;
  targetY: number;
}

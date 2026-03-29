// types.ts — All interfaces, unit stats, and constants

// --- Map ---
export const MAP_W = 30;  // tiles wide
export const MAP_H = 20;  // tiles tall
export const TILE_SIZE = 24; // pixels per tile for rendering

// --- Terrain ---
export type Terrain = 'open' | 'forest' | 'hill' | 'wall' | 'water';

export interface TerrainProps {
  walkable: boolean;
  speedMult: number;     // movement speed multiplier
  rangeBonus: number;    // added to unit range when on this terrain
  blocksRanged: boolean; // blocks ranged attacks through it
  visionBonus: number;   // added to vision radius
}

export const TERRAIN_PROPS: Record<Terrain, TerrainProps> = {
  open:   { walkable: true,  speedMult: 1.0, rangeBonus: 0, blocksRanged: false, visionBonus: 0 },
  forest: { walkable: true,  speedMult: 0.6, rangeBonus: 0, blocksRanged: true,  visionBonus: -2 },
  hill:   { walkable: true,  speedMult: 0.8, rangeBonus: 2, blocksRanged: false, visionBonus: 3 },
  wall:   { walkable: false, speedMult: 0,   rangeBonus: 0, blocksRanged: true,  visionBonus: 0 },
  water:  { walkable: false, speedMult: 0,   rangeBonus: 0, blocksRanged: false, visionBonus: 0 },
};

// --- Gold mines ---
export interface GoldMine {
  id: number;
  x: number;
  y: number;
  remaining: number;     // gold left in mine
  claimedBy: Side | null;
  workerIds: number[];   // peasant IDs currently mining
}

export const MINE_CAPACITY = 500;
export const MINE_RATE = 3;           // gold per second per worker
export const MAX_WORKERS_PER_MINE = 3;

// --- Economy ---
export const STARTING_GOLD = 50;
export const GOLD_PER_SECOND = 5;    // reduced from 8 — mines make up the difference
export const MAX_GOLD = 300;          // raised to support upgrades

// --- Game timing ---
export const TICK_RATE = 20;           // server ticks per second
export const TICK_DT = 1 / TICK_RATE;  // seconds per tick
export const GAME_DURATION = 300;      // 5 min max (in seconds)

// --- Fog of war ---
export const BASE_VISION = 5;         // tiles of vision per unit
export const CASTLE_VISION = 6;       // vision radius around castles

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
  vision: number;       // vision radius in tiles
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
    vision: 4,
    special: 'Can mine gold. Rally: nearby peasants +50% speed for 3s',
  },
  knight: {
    type: 'knight',
    cost: 30,
    hp: 60,
    damage: 15,
    attackSpeed: 0.8,
    speed: 2.0,
    range: 1,
    vision: 5,
    special: 'Armored: half damage from peasants. Shield Wall: immobile, 50% dmg reduction 5s',
  },
  archer: {
    type: 'archer',
    cost: 20,
    hp: 20,
    damage: 12,
    attackSpeed: 1.0,
    speed: 2.5,
    range: 4,
    vision: 7,
    special: 'Ranged. Volley: area attack (3 tile radius), 10s cooldown',
  },
  catapult: {
    type: 'catapult',
    cost: 50,
    hp: 30,
    damage: 25,
    attackSpeed: 0.3,
    speed: 1.0,
    range: 6,
    vision: 4,
    special: 'Siege: 1.5x castle damage. Fortify: immobile, 2x range+damage 10s',
  },
  jester: {
    type: 'jester',
    cost: 15,
    hp: 25,
    damage: 3,
    attackSpeed: 1.0,
    speed: 4.0,
    range: 1,
    vision: 6,
    special: 'Confuse on hit. Decoy: spawns fake unit that draws aggro 5s',
  },
};

// --- Abilities ---
export type AbilityType = 'rally' | 'shield_wall' | 'volley' | 'fortify' | 'decoy';

export interface AbilityCooldown {
  type: AbilityType;
  cooldown: number;     // seconds
  duration: number;     // seconds (0 = instant)
}

export const ABILITY_DEFS: Record<UnitType, AbilityCooldown> = {
  peasant:  { type: 'rally',       cooldown: 15, duration: 3 },
  knight:   { type: 'shield_wall', cooldown: 20, duration: 5 },
  archer:   { type: 'volley',      cooldown: 10, duration: 0 },
  catapult: { type: 'fortify',     cooldown: 25, duration: 10 },
  jester:   { type: 'decoy',       cooldown: 12, duration: 5 },
};

// --- Upgrades ---
export type UpgradeId =
  // Peasant
  | 'peasant_militia'      // +10 HP, +3 damage
  | 'peasant_prospector'   // +50% mine rate
  // Knight
  | 'knight_heavy'         // +30 HP, -0.5 speed
  | 'knight_lancer'        // +10 damage, charge (first hit 2x)
  // Archer
  | 'archer_longbow'       // +2 range
  | 'archer_rapid'         // +0.5 attack speed
  // Catapult
  | 'catapult_trebuchet'   // +3 range, +10 damage
  | 'catapult_bombard'     // splash damage (hits adjacent units)
  // Jester
  | 'jester_trickster'     // confusion lasts 5s (was 3)
  | 'jester_saboteur'      // on hit, reduce target speed 50% for 4s
  // Castle
  | 'castle_reinforce'     // +100 castle HP
  | 'castle_arrowslits'    // castle deals 5 dps to nearby enemies
  | 'castle_warhorn'       // units spawn 30% faster (reduced train cooldown)
  ;

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  cost: number;
  researchTime: number;  // seconds
  requires?: UpgradeId;  // prerequisite
  exclusive?: UpgradeId; // can't have both
}

export const UPGRADES: UpgradeDef[] = [
  // Peasant (pick one)
  { id: 'peasant_militia',    name: 'Militia Training',  cost: 40,  researchTime: 10, exclusive: 'peasant_prospector' },
  { id: 'peasant_prospector', name: 'Prospector Picks',  cost: 40,  researchTime: 10, exclusive: 'peasant_militia' },
  // Knight (pick one)
  { id: 'knight_heavy',       name: 'Heavy Armor',       cost: 60,  researchTime: 15, exclusive: 'knight_lancer' },
  { id: 'knight_lancer',      name: 'Lance Training',    cost: 60,  researchTime: 15, exclusive: 'knight_heavy' },
  // Archer (pick one)
  { id: 'archer_longbow',     name: 'Longbow',           cost: 50,  researchTime: 12, exclusive: 'archer_rapid' },
  { id: 'archer_rapid',       name: 'Rapid Fire',        cost: 50,  researchTime: 12, exclusive: 'archer_longbow' },
  // Catapult (pick one)
  { id: 'catapult_trebuchet', name: 'Trebuchet',         cost: 80,  researchTime: 20, exclusive: 'catapult_bombard' },
  { id: 'catapult_bombard',   name: 'Bombard Shot',      cost: 80,  researchTime: 20, exclusive: 'catapult_trebuchet' },
  // Jester (pick one)
  { id: 'jester_trickster',   name: 'Master Trickster',  cost: 35,  researchTime: 8,  exclusive: 'jester_saboteur' },
  { id: 'jester_saboteur',    name: 'Saboteur',          cost: 35,  researchTime: 8,  exclusive: 'jester_trickster' },
  // Castle (can get multiple, no exclusions)
  { id: 'castle_reinforce',   name: 'Reinforce Walls',   cost: 60,  researchTime: 15 },
  { id: 'castle_arrowslits',  name: 'Arrow Slits',       cost: 75,  researchTime: 20 },
  { id: 'castle_warhorn',     name: 'War Horn',          cost: 50,  researchTime: 12 },
];

// --- Events ---
export type EventType = 'gold_rush' | 'fog_lifts' | 'mercenaries' | 'earthquake';

export interface GameEvent {
  type: EventType;
  name: string;
  description: string;
  startTick: number;
  duration: number;      // ticks
}

export const EVENT_INTERVAL = 60;    // seconds between events
export const EVENT_DEFS: { type: EventType; name: string; description: string; durationSec: number }[] = [
  { type: 'gold_rush',    name: 'Gold Rush',     description: 'Double passive income!',           durationSec: 15 },
  { type: 'fog_lifts',    name: 'Fog Lifts',     description: 'Full map vision for all players!', durationSec: 10 },
  { type: 'mercenaries',  name: 'Mercenaries',   description: 'Neutral units appear on the map!', durationSec: 0 },
  { type: 'earthquake',   name: 'Earthquake',    description: 'Terrain shifts!',                  durationSec: 0 },
];

// --- Castle ---
export const CASTLE_HP = 400;
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
  owner: 'left' | 'right' | 'neutral';
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
  state: 'moving' | 'attacking' | 'idle' | 'mining' | 'fortified';
  // Abilities
  abilityCooldown: number;        // ticks until ability ready
  abilityActive: boolean;         // is ability currently active
  abilityUntil: number;           // tick when active ability expires
  // Mining
  miningTargetId: number | null;  // gold mine being worked
  // Decoy
  isDecoy: boolean;               // fake unit from jester ability
  decoyUntil: number;             // tick when decoy disappears
  // Upgrades applied
  slowed: boolean;                // saboteur slow effect
  slowedUntil: number;
  chargeReady: boolean;           // lancer first-hit bonus
}

// --- Player ---
export type Side = 'left' | 'right';

export interface Player {
  handle: string;
  side: Side;
  gold: number;
  castle: number;  // HP
  upgrades: UpgradeId[];
  researching: { id: UpgradeId; completeTick: number } | null;
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
  terrain: Terrain[][];  // MAP_H rows × MAP_W cols
  mines: GoldMine[];
  winner: string | null;      // winning handle, 'draw', or null
  surrendered: string | null; // handle of player who surrendered, or null
  log: LogEntry[];            // recent events
  nextUnitId: number;
  mapSeed: number;
  // Fog: per-side visibility (not sent to clients — computed per-player)
  // Events
  activeEvent: GameEvent | null;
  nextEventTick: number;
}

export interface LogEntry {
  tick: number;
  message: string;
}

// --- Client view (fog-filtered) ---
export interface ClientGameState extends Omit<GameState, 'units' | 'mines'> {
  units: Unit[];         // only visible units
  mines: GoldMine[];     // only visible mines
  visibility: boolean[][]; // MAP_H × MAP_W — which tiles this player can see
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

// types.ts — shared constants and API shapes (server + client)

export const MAP_W = 1024;
export const MAP_H = 576;

// Soldier positions are packed as Uint16 fixed-point for the wire
export const POS_SCALE = 32;

export const NO_REGION = 0xffff;
export const DEAD = 255;

export enum Terrain {
  DEEP = 0,
  WATER = 1,
  SAND = 2,
  GRASS = 3,
  FOREST = 4,
  HILLS = 5,
  MOUNTAIN = 6,
  SNOW = 7,
}

// Cost to enter a tile (integer, for flow fields). 0 = impassable.
export const TERRAIN_COST: Record<Terrain, number> = {
  [Terrain.DEEP]: 0,
  [Terrain.WATER]: 0,
  [Terrain.SAND]: 2,
  [Terrain.GRASS]: 2,
  [Terrain.FOREST]: 3,
  [Terrain.HILLS]: 4,
  [Terrain.MOUNTAIN]: 8,
  [Terrain.SNOW]: 12,
};

// Multiplier on the chance of dying in battle while standing on this terrain
export const TERRAIN_DEFENSE: Record<Terrain, number> = {
  [Terrain.DEEP]: 1,
  [Terrain.WATER]: 1,
  [Terrain.SAND]: 1.1,
  [Terrain.GRASS]: 1,
  [Terrain.FOREST]: 0.8,
  [Terrain.HILLS]: 0.7,
  [Terrain.MOUNTAIN]: 0.55,
  [Terrain.SNOW]: 0.6,
};

export const HOURS_PER_DAY = 24;
export const DAYS_PER_MONTH = 30;
export const MONTHS = [
  'Thawmonth', 'Seedmonth', 'Rainmonth', 'Bloommonth', 'Sunmonth', 'Highsun',
  'Harvest', 'Leaffall', 'Mistmonth', 'Frostmonth', 'Deepwinter', 'Longnight',
];

export function formatDate(tick: number): string {
  const day = Math.floor(tick / HOURS_PER_DAY);
  const year = Math.floor(day / (DAYS_PER_MONTH * 12)) + 1;
  const month = Math.floor(day / DAYS_PER_MONTH) % 12;
  const dom = (day % DAYS_PER_MONTH) + 1;
  return `${MONTHS[month]} ${dom}, Year ${year}`;
}

// --- API shapes ---

export interface SettlementMeta {
  id: number;
  name: string;
  x: number;
  y: number;
  capital: boolean;
}

export interface MetaResponse {
  w: number;
  h: number;
  seed: number;
  age: number;
  settlements: SettlementMeta[];
}

export interface KingdomView {
  id: number;
  name: string;
  color: string;
  king: string;
  temperament: string;
  brain: 'qwen' | 'script';
  alive: boolean;
  thinking: boolean;
  lastThought: string;
  lastDecrees: string[];
  reign: string[];
  settlements: number;
  soldiers: number;
}

export interface SettlementView {
  id: number;
  owner: number;
  garrison: number;
  siege: number; // 0..1 capture progress
}

export interface ArmyView {
  id: number;
  faction: number;
  general: string;
  size: number;
  x: number;
  y: number;
  target: number; // settlement id
  order: 'march' | 'hold';
}

export interface ChronicleEntry {
  tick: number;
  text: string;
  faction: number; // -1 for the world
}

export interface StateResponse {
  tick: number;
  date: string;
  age: number;
  stalledBy: string | null;
  kingdoms: KingdomView[];
  settlements: SettlementView[];
  armies: ArmyView[];
  chronicle: ChronicleEntry[];
}

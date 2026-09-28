// Wire protocol between a client and a dungeon process. JSON over WebSocket.
// Bigints travel as decimal strings. Nothing here is secret: journeys carry proofs, never addresses.
import type { ZkNameClaim } from '@truenames/proofs';
import type { MoveCmd } from './movement.ts';
import type { World, BastionFoe } from './balance.ts';
export type { World, BastionFoe } from './balance.ts';
export type { MoveCmd } from './movement.ts';

export type EnemyKind = 'husk' | 'runner' | 'brute' | 'shaman' | 'warden';

/** Traits on the wire (flavor as a decimal string). */
export interface WireTraits {
  form: number;
  weightIdx: number;
  generosityIdx: number;
  temperIdx: number;
  flavor: string;
}

/** What a proof revealed about a name, sent back so the client can draw it. */
export interface SlotInfo {
  spirit: string; // opaque id ("t:<traitHash>")
  element: number;
  magnitude: number;
  traits: WireTraits;
  strength: number;
}

// ---------- client → dungeon ----------
export type ClientMsg =
  | { t: 'open'; level: number; world?: World; lag?: number } // request a round; the dungeon issues the context. lag: dev-only simulated latency (ms)
  | { t: 'journey'; aura: string; bundle: { slot: number; claim: ZkNameClaim }[] }
  | { t: 'cmds'; cmds: MoveCmd[] } // numbered movement/aim commands, one per client tick
  | { t: 'cast'; slot: number; ax: number; ay: number }
  | { t: 'build'; slot: number; gx: number; gy: number } // bastion: raise a shrine to this slot's patron
  | { t: 'sell'; id: number } // bastion: let a shrine fall (partial refund)
  | { t: 'call' } // bastion: call the next wave early
  | { t: 'pause'; on: boolean }
  | { t: 'abandon' };

// ---------- dungeon → client ----------
export type ServerMsg =
  | { t: 'ticket'; context: string; level: number; world: World }
  | { t: 'welcome'; world: 'dark'; you: string; level: number; arena: { w: number; h: number }; pillars: { x: number; y: number; r: number }[]; slots: (SlotInfo | null)[]; refused: string[] }
  | { t: 'welcome'; world: 'bastion'; you: string; level: number; bastion: BastionLayout; slots: (SlotInfo | null)[]; refused: string[] }
  | Snapshot
  | BastionSnapshot
  | { t: 'end'; result: RoundResultMsg }
  | { t: 'error'; message: string };

export interface RoundResultMsg {
  world: World;
  level: number;
  won: boolean;
  wave: number;
  kills: number;
}

export interface SnapPlayer {
  id: string;
  ack: number; // last movement command the dungeon applied for this player
  x: number;
  y: number;
  hp: number;
  ward: number;
  invuln: boolean;
  strain: number;
  capacity: number;
  alive: boolean;
  slots: ({ lastBits: number | null; vessel: number; cap: number } | null)[];
}

export interface Snapshot {
  t: 'snap';
  time: number;
  paused: boolean;
  wave: number; // 0-based
  waves: number;
  breather: number;
  remaining: number;
  kills: number;
  players: SnapPlayer[];
  enemies: { id: number; kind: EnemyKind; x: number; y: number; hp: number; maxHp: number; r: number; hexed: boolean; element: number; strained: boolean }[];
  allies: { id: number; x: number; y: number; life: number; element: number }[];
  projs: { id: number; x: number; y: number; r: number; element: number; enemy: boolean }[];
  novas: { id: number; x: number; y: number; r: number; t: number; max: number; element: number; enemy: boolean }[];
  warden: { hp: number; maxHp: number; element: number; magnitude: number; traits: WireTraits } | null;
  events: SimEvent[];
}

/** Things that happened this step. The client turns them into floaters, particles, fx and sound. */
export type SimEvent =
  | { e: 'cast'; p: string; slot: number; form: number; element: number; effective: number; effect: number; thin: boolean; x: number; y: number; ax: number; ay: number }
  | { e: 'refused'; p: string; slot: number }
  | { e: 'backlash'; p: string; dmg: number }
  | { e: 'hit'; id: number; x: number; y: number; dmg: number; element: number }
  | { e: 'kill'; x: number; y: number; kind: EnemyKind; element: number }
  | { e: 'hurt'; p: string; dmg: number; why?: string }
  | { e: 'absorb'; p: string }
  | { e: 'beam'; p?: string; x: number; y: number; x2: number; y2: number; width: number; element: number; dur: number }
  | { e: 'ring'; p?: string; x: number; y: number; r: number; element: number; ward?: boolean }
  | { e: 'blink'; p?: string; x: number; y: number; x2: number; y2: number; element: number }
  | { e: 'nova'; x: number; y: number; r: number; element: number; enemy: boolean }
  | { e: 'summon'; p?: string; x: number; y: number; element: number }
  | { e: 'dismiss'; x: number; y: number; element: number }
  | { e: 'spark'; x: number; y: number; element: number } // projectile hit a pillar or target
  | { e: 'enemyCast'; x: number; y: number; effective: number; warden: boolean }
  | { e: 'spawn'; x: number; y: number }
  | { e: 'wave'; wave: number }
  | { e: 'breather'; wave: number }
  | { e: 'warden'; element: number; magnitude: number; traits: WireTraits };

// ---------- the Bastion (tower defense) ----------

export interface BastionLayout {
  cols: number;
  rows: number;
  tile: number;
  road: [number, number][]; // world-space polyline, spawn → hearth
  roadTiles: [number, number][]; // tiles no shrine may stand on
  hearth: { x: number; y: number; max: number };
}

export interface BastionSnapshot {
  t: 'bsnap';
  time: number;
  paused: boolean;
  wave: number; // 0-based: the wave running or next
  waves: number;
  breather: number; // seconds until the next wave (0 while one runs)
  running: boolean;
  hearth: number;
  resonance: number;
  shrineCost: number;
  kills: number;
  remaining: number;
  strain: number;
  capacity: number;
  slots: ({ lastBits: number | null; vessel: number; cap: number } | null)[];
  shrines: { id: number; slot: number; gx: number; gy: number; form: number; element: number; ready: number }[];
  foes: { id: number; kind: BastionFoe; x: number; y: number; hp: number; maxHp: number; r: number; slowed: boolean; hexed: boolean; blocked: boolean }[];
  bolts: { id: number; x: number; y: number; element: number }[];
  guardians: { id: number; x: number; y: number; life: number; element: number }[];
  novas: { id: number; x: number; y: number; r: number; t: number; max: number; element: number }[];
  warden: { hp: number; maxHp: number } | null;
  events: BastionEvent[];
}

export type BastionEvent =
  | { e: 'shrineCast'; id: number; slot: number; form: number; element: number; effective: number; effect: number; x: number; y: number }
  | { e: 'refused'; id: number; slot: number }
  | { e: 'backlash'; id: number; hearth: number }
  | { e: 'hit'; id: number; x: number; y: number; dmg: number; element: number }
  | { e: 'kill'; x: number; y: number; kind: BastionFoe; element: number; reward: number }
  | { e: 'leak'; x: number; y: number; dmg: number }
  | { e: 'beam'; x: number; y: number; x2: number; y2: number; width: number; element: number; dur: number }
  | { e: 'ring'; x: number; y: number; r: number; element: number; ward?: boolean }
  | { e: 'nova'; x: number; y: number; r: number; element: number }
  | { e: 'throw'; x: number; y: number; x2: number; y2: number; element: number } // blink: foe cast back along the road
  | { e: 'summon'; x: number; y: number; element: number }
  | { e: 'spark'; x: number; y: number; element: number }
  | { e: 'built'; id: number; slot: number; gx: number; gy: number }
  | { e: 'sold'; id: number; refund: number }
  | { e: 'denied'; why: string }
  | { e: 'wave'; wave: number }
  | { e: 'cleared'; wave: number; bonus: number }
  | { e: 'warden' };

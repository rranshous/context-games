// Wire protocol between a client and a dungeon process. JSON over WebSocket.
// Bigints travel as decimal strings. Nothing here is secret: journeys carry proofs, never addresses.
import type { ZkNameClaim } from '@truenames/proofs';
import type { MoveCmd } from './movement.ts';
import type { World, BastionFoe } from './balance.ts';
export type { World, BastionFoe } from './balance.ts';
export type { MoveCmd } from './movement.ts';
import type { DriveCmd } from './racing.ts';
export type { DriveCmd } from './racing.ts';

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
  | { t: 'play'; card: number; target?: CouncilTarget } // council: play a card from your hand (by card id)
  | { t: 'pass' } // council: end your turn
  | { t: 'drive'; cmds: DriveCmd[] } // racer: numbered throttle/steer commands, one per client tick
  | { t: 'pause'; on: boolean }
  | { t: 'abandon' };

// ---------- dungeon → client ----------
export type ServerMsg =
  | { t: 'ticket'; context: string; level: number; world: World }
  | { t: 'welcome'; world: 'dark'; you: string; level: number; arena: { w: number; h: number }; pillars: { x: number; y: number; r: number }[]; slots: (SlotInfo | null)[]; refused: string[] }
  | { t: 'welcome'; world: 'bastion'; you: string; level: number; bastion: BastionLayout; slots: (SlotInfo | null)[]; refused: string[] }
  | { t: 'welcome'; world: 'council'; you: string; level: number; seat: number; slots: (SlotInfo | null)[]; refused: string[] }
  | { t: 'welcome'; world: 'racer'; you: string; level: number; car: number; track: RacerTrack; rivals: RacerRival[]; slots: (SlotInfo | null)[]; refused: string[] }
  | Snapshot
  | BastionSnapshot
  | CouncilView
  | RacerSnapshot
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

// ---------- the Council (turn-based card duel) ----------

/** Target of a card: a seat's face, or a creature by id. */
export type CouncilTarget = { kind: 'face'; seat: number } | { kind: 'creature'; id: number };

/** A card as its owner sees it: one proven name. Opponents only see cards once played. */
export interface CouncilCard {
  id: number;
  slot: number; // index in the owner's deck (and journey cosmetics)
  element: number;
  magnitude: number;
  form: number;
  traits: WireTraits;
  strength: number;
  cost: number;
}

export interface CouncilCreature { id: number; seat: number; element: number; atk: number; hp: number; maxHp: number; fresh: boolean }

export interface CouncilSeatView {
  seat: number;
  aura: string; // public: persistent character identity
  life: number;
  lifeMax: number;
  shield: number;
  voice: number;
  voiceMax: number;
  strain: number;
  capacity: number;
  handCount: number;
  deckCount: number;
  hexes: number; // turns of hex remaining on this face
  novaPending: boolean;
}

/** One seat's view of the table: only YOUR hand is shown. Sent whenever something changes. */
export interface CouncilView {
  t: 'cview';
  you: number; // your seat
  turn: number;
  active: number; // whose turn
  seats: CouncilSeatView[];
  hand: CouncilCard[];
  board: CouncilCreature[];
  vessels: Record<number, { level: number; cap: number }>; // your cards' patrons, by card id
  events: CouncilEvent[];
  over: null | 'won' | 'lost';
}

export type CouncilEvent =
  | { e: 'turn'; seat: number; turn: number }
  | { e: 'draw'; seat: number }
  | { e: 'play'; seat: number; card: { element: number; magnitude: number; form: number; traits: WireTraits; strength: number; slot: number }; power: number; effective: number; target?: CouncilTarget }
  | { e: 'damage'; target: CouncilTarget; amount: number; source: 'card' | 'creature' | 'hex' | 'nova' | 'backlash'; element: number }
  | { e: 'shield'; seat: number; amount: number }
  | { e: 'summon'; creature: CouncilCreature }
  | { e: 'die'; id: number }
  | { e: 'backlash'; seat: number; amount: number }
  | { e: 'refused'; why: string };

// ---------- Dark Racer ----------

export interface RacerTrack {
  pts: [number, number][]; // closed centerline, sampled evenly; index 0 is the start line
  halfWidth: number;
  laps: number;
}

/** A rival as the client draws it: the public spirit whose name it races under. */
export interface RacerRival { car: number; element: number; magnitude: number; traits: WireTraits }

export interface RacerCar {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  spin: number;
  slide: number;
  slow: number;
  top: number;
  shield: number; // seconds of ward left
  lap: number; // completed laps (−1 before first crossing the line)
  place: number; // 1-based race position
  finished: number | null; // finishing place, once over the line
  element: number;
}

export interface RacerSnapshot {
  t: 'rsnap';
  time: number;
  paused: boolean;
  countdown: number;
  laps: number;
  ack: number; // your last drive command applied
  strain: number;
  capacity: number;
  hits: number;
  slots: ({ lastBits: number | null; vessel: number; cap: number; ready: number } | null)[];
  cars: RacerCar[];
  bolts: { id: number; x: number; y: number; element: number }[];
  mines: { id: number; x: number; y: number; armed: boolean; element: number }[];
  slicks: { id: number; x: number; y: number; r: number; life: number; element: number }[];
  drones: { id: number; x: number; y: number; element: number }[];
  events: RacerEvent[];
}

export type RacerEvent =
  | { e: 'cast'; car: number; slot: number; form: number; element: number; effective: number; power: number; x: number; y: number }
  | { e: 'refused'; car: number; slot: number; why: string }
  | { e: 'backlash'; car: number; spin: number }
  | { e: 'hit'; car: number; by: number; x: number; y: number; spin: number; element: number; what: string }
  | { e: 'absorb'; car: number; x: number; y: number }
  | { e: 'slowed'; car: number; x: number; y: number }
  | { e: 'slid'; car: number; x: number; y: number }
  | { e: 'beam'; x: number; y: number; x2: number; y2: number; width: number; element: number }
  | { e: 'ring'; x: number; y: number; r: number; element: number; ward?: boolean }
  | { e: 'blink'; car: number; x: number; y: number; x2: number; y2: number; element: number }
  | { e: 'blast'; x: number; y: number; r: number; element: number }
  | { e: 'spark'; x: number; y: number; element: number }
  | { e: 'go' }
  | { e: 'lap'; car: number; lap: number }
  | { e: 'finish'; car: number; place: number };

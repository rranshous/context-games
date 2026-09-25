// world.ts — the hands: soldiers, armies, sieges, couriers, coin, and the fates of rulers. No inference here.
//
// Soldiers are struct-of-arrays in typed arrays. Each one belongs to an army
// or to a settlement's garrison and simply walks the distance field toward
// wherever its commander points. Rulers only ever touch the world through
// orders and envoys, which travel by courier and may be misread or ignored.

import {
  MAP_W, MAP_H, NO_REGION, DEAD, Terrain, TERRAIN_DEFENSE, HOURS_PER_DAY, DAYS_PER_MONTH,
  formatDate, ChronicleEntry, StateResponse, ArmyView, CourierView,
} from '../shared/types.js';
import { WorldMap, generateMap, KINGDOM_COLORS, TEMPERAMENTS } from './mapgen.js';
import { FieldCache, UNREACHABLE } from './flow.js';
import { NameGen } from './names.js';
import { mulberry32 } from './rng.js';
import type { Turn } from './court.js';

export const SOLDIER_CAP = 1 << 17;
export const MAX_FACTIONS = 12;
export const YEAR = HOURS_PER_DAY * DAYS_PER_MONTH * 12;
const CELL = 4;
const CW = MAP_W / CELL, CH = MAP_H / CELL;

const MARCH_SPEED = 0.35;     // tiles per hour on grass
const COMBAT_K = 0.035;       // chance per hour of falling when fully surrounded by enemies
const ATTRITION = 0.0004;     // chance per hour of dying/straggling in foreign land
const COURIER_SPEED = 45;     // tiles per day
const SIEGE_CELLS = 2;        // cells around a settlement that count for its siege
const MAX_ARMIES = 6;
const MAX_ARMY = 8000;
const MAX_LIVING_REALMS = 9;  // rebellions stop when the map is this crowded
const POP_SCALE = 3;          // multiplies garrison sizes and recruitment

// Coin, per soldier per day
const PAY_FIELD = 0.05;       // a soldier in a host at home
const PAY_FORAGING = 0.025;   // a host in foreign land lives partly off it
const PAY_GARRISON = 0.02;    // garrisons farm between watches
const MUSTER_COST = 1;        // crowns per soldier called up from a garrison
const MERC_COST = 3;          // crowns per sellsword
const TRADE_SHARE = 0.12;     // of the poorer neighbor's taxes, to each side, per day of peace

export type OrderKind = 'march' | 'hold' | 'muster';

export interface Order {
  kind: OrderKind;
  kingdom: number;
  army?: number;
  target?: number;
  settlement?: number;
  sent?: number;
  arrives: number;
}

export interface Envoy {
  from: number;
  to: number;
  text: string;
  peace: boolean;  // carries an offer of peace
  alliance?: boolean; // carries an offer of alliance
  sent?: number;
  arrives: number;
}

export interface Army {
  id: number;
  faction: number;
  general: string;
  target: number;
  order: 'march' | 'hold';
  size: number;
  cx: number;
  cy: number;
  loyalty: number;   // 0..1, fixed at muster
  morale: number;    // 0..1, rises with victory, falls with idleness, defeat and empty coffers
  renown: number;    // towns taken
  idleDays: number;
  lastSize: number;  // size at the last daily count, to measure losses
  peak: number;
  merc?: string;     // company name, if these are sellswords
}

export interface Ruler {
  title: 'King' | 'Queen';
  name: string;
  born: number;      // tick
  temperament: string;
}

export interface Realm {
  id: number;
  name: string;
  color: string;
  ruler: Ruler;
  brain: string;     // 'script' or an Ollama model
  origin: string;
  founded: number;

  alive: boolean;
  capital: number;
  gold: number;
  income: number;
  upkeep: number;
  trade?: number;          // part of income from trade with neighbors at peace
  partners?: number[];     // realms trading with this one
  honor: number;

  // council
  thinking: boolean;
  lastThought: string;
  lastDecrees: string[];
  reign: string[];   // what the ruler did and what came of it, in-fiction (for viewers)
  turns: Turn[];     // the councils a ruler remembers (their rolling context)
  inbox: string[];   // envoys and tidings awaiting the next council
  lastCouncil: number;
  nextCouncil: number;
  stats?: MindStats;
}

/** How a mind has ruled, for comparing models. Reset when a new mind takes the realm. */
export interface MindStats {
  councils: number;
  seconds: number;
  tokensIn: number;
  tokensOut: number;
  tools: Record<string, number>;
  misfires: number;   // commands that named no such general, place or realm
  silent: number;     // councils with no command at all
}

interface Entry extends ChronicleEntry {
  involves: number[];
}

export interface WorldOptions {
  brains: string[];      // per founding realm
  rebelBrain: string;
}

export class World {
  map: WorldMap;
  tick = 0;
  age: number;
  endsAt = -1;

  // --- soldiers (the hands) ---
  sx = new Float32Array(SOLDIER_CAP);
  sy = new Float32Array(SOLDIER_CAP);
  sf = new Uint8Array(SOLDIER_CAP).fill(DEAD);
  sArmy = new Int32Array(SOLDIER_CAP).fill(-1);
  sHome = new Uint16Array(SOLDIER_CAP);
  sSpeed = new Float32Array(SOLDIER_CAP);
  high = 0;
  private free: number[] = [];

  // --- settlements ---
  owner: Int8Array;
  garrison: Uint16Array;
  siege: Float32Array;
  siegeBy: Int8Array;
  contested: Uint8Array;
  takenAt: Int32Array;   // tick the current owner took it (-1: held since the founding)

  // --- realms and their dealings ---
  realms: Realm[] = [];
  war = new Uint8Array(MAX_FACTIONS * MAX_FACTIONS);      // 1 = at war
  treaty = new Int32Array(MAX_FACTIONS * MAX_FACTIONS).fill(-1); // tick peace was last sworn
  warSince = new Int32Array(MAX_FACTIONS * MAX_FACTIONS).fill(-1); // tick the current war began
  peaceOffers: { from: number; to: number; tick: number }[] = [];
  allied = new Uint8Array(MAX_FACTIONS * MAX_FACTIONS);  // 1 = sworn allies
  allianceOffers: { from: number; to: number; tick: number }[] = [];
  envoys: Envoy[] = [];
  caravans: { from: number; to: number; sent: number; arrives: number }[] = [];

  armies = new Map<number, Army>();
  nextArmyId = 1;
  orders: Order[] = [];
  chronicle: Entry[] = [];
  history: { tick: number; held: number[]; soldiers: number[] }[] = [];  // monthly samples
  annals: { year: number; text: string; by: string }[] = [];             // the scribe's yearly accounts
  rebelBrain: string;

  private fields: FieldCache;
  names: NameGen;
  private cells = new Uint16Array(CW * CH * MAX_FACTIONS);
  private battle = new Map<number, { deaths: number; factions: Set<number> }>();
  private wars = new Map<number, { deaths: number; factions: Set<number>; start: number }>();
  private deserted = new Map<number, number>(); // army id -> deserters today
  private desertTally = new Map<number, number>(); // army id -> deserters not yet chronicled
  private dryLogged = new Map<number, number>();   // realm id -> tick its empty treasury was last chronicled

  constructor(seed: number, age: number, opts: WorldOptions) {
    this.age = age;
    this.rebelBrain = opts.rebelBrain;
    this.map = generateMap(seed, {
      settlements: parseInt(process.env.SETTLEMENTS ?? '96', 10),
      kingdoms: Math.min(opts.brains.length, KINGDOM_COLORS.length),
    });
    const ns = this.map.settlements.length;
    this.owner = Int8Array.from(this.map.settlements.map(s => s.kingdom));
    this.garrison = new Uint16Array(ns);
    this.siege = new Float32Array(ns);
    this.siegeBy = new Int8Array(ns).fill(-1);
    this.contested = new Uint8Array(ns);
    this.takenAt = new Int32Array(ns).fill(-1);
    this.fields = new FieldCache(this.map.cost, id => this.map.settlements[id].tile, ns + 16);
    this.names = new NameGen(mulberry32(seed ^ 0x5eed + age));
    for (const k of this.map.kingdoms) this.names.used.add(k.king);
    this.realms = this.map.kingdoms.map((k, i) => ({
      id: i,
      name: k.name,
      color: k.color,
      ruler: {
        title: Math.random() < 0.5 ? 'King' : 'Queen',
        name: k.king,
        born: -Math.floor((22 + Math.random() * 40) * YEAR),
        temperament: k.temperament,
      },
      brain: opts.brains[i] ?? 'script',
      origin: 'founded at the dawn of the age',
      founded: 0,
      alive: true,
      capital: k.capital,
      gold: 500,
      income: 0,
      upkeep: 0,
      honor: 1,
      thinking: false,
      lastThought: '',
      lastDecrees: [],
      reign: [],
      turns: [],
      inbox: [],
      lastCouncil: 0,
      nextCouncil: HOURS_PER_DAY * (3 + i * 2),
    }));
  }

  /** Give every realm a starting garrison and one host so the first year isn't empty. */
  populate() {
    for (const s of this.map.settlements) {
      const n = Math.floor(this.garrisonCap(s.id) * 0.6);
      for (let i = 0; i < n; i++) this.spawn(s.id);
    }
    this.log(-1, [], `The Age ${roman(this.age)} begins. ${this.realms.length} crowns claim the continent, each at peace, for now.`);
    for (const r of this.realms) this.muster(r.capital, r.id, 0.7, true);
  }

  /** Recompute the free list and garrison counts after loading soldier arrays. */
  rebuildDerived() {
    this.free = [];
    this.garrison.fill(0);
    for (let i = this.high - 1; i >= 0; i--) {
      if (this.sf[i] === DEAD) this.free.push(i);
      else if (this.sArmy[i] < 0) this.garrison[this.sHome[i]]++;
    }
    this.updateArmies();
  }

  // ---------------------------------------------------------------- helpers

  ruler(k: number): string {
    const r = this.realms[k].ruler;
    return `${r.title} ${r.name}`;
  }

  rulerAge(k: number): number {
    return Math.floor((this.tick - this.realms[k].ruler.born) / YEAR);
  }

  atWar(a: number, b: number): boolean {
    return a !== b && this.war[a * MAX_FACTIONS + b] === 1;
  }

  enemiesOf(k: number): number[] {
    return this.realms.filter(r => r.alive && this.atWar(k, r.id)).map(r => r.id);
  }

  held(k: number): number {
    let n = 0;
    for (let s = 0; s < this.owner.length; s++) if (this.owner[s] === k) n++;
    return n;
  }

  private capitalDistance(a: number, b: number): number {
    const A = this.map.settlements[this.realms[a].capital], B = this.map.settlements[this.realms[b].capital];
    return Math.hypot(A.x - B.x, A.y - B.y);
  }

  // ---------------------------------------------------------------- soldiers

  private spawn(home: number): number {
    const s = this.map.settlements[home];
    let i: number;
    if (this.free.length) i = this.free.pop()!;
    else if (this.high < SOLDIER_CAP) i = this.high++;
    else return -1;
    this.sx[i] = s.x + 0.5; this.sy[i] = s.y + 0.5;
    for (let tries = 0; tries < 10; tries++) {
      const x = s.x + 0.5 + (Math.random() - 0.5) * 6;
      const y = s.y + 0.5 + (Math.random() - 0.5) * 6;
      if (this.passable(x, y)) { this.sx[i] = x; this.sy[i] = y; break; }
    }
    this.sf[i] = this.owner[home];
    this.sArmy[i] = -1;
    this.sHome[i] = home;
    this.sSpeed[i] = MARCH_SPEED * (0.8 + Math.random() * 0.4);
    this.garrison[home]++;
    return i;
  }

  private enlist(i: number, army: Army) {
    if (i < 0) return;
    this.garrison[this.sHome[i]]--;
    this.sArmy[i] = army.id;
    army.size++;
  }

  private kill(i: number) {
    if (this.sArmy[i] < 0) this.garrison[this.sHome[i]]--;
    this.sf[i] = DEAD;
    this.sArmy[i] = -1;
    this.free.push(i);
  }

  private passable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return false;
    return this.map.cost[(y | 0) * MAP_W + (x | 0)] > 0;
  }

  garrisonCap(id: number): number {
    const s = this.map.settlements[id];
    const cap = (30 + s.food / 30) * POP_SCALE;
    return Math.floor(this.realms[this.owner[id]]?.capital === id ? cap * 2 : cap);
  }

  // ---------------------------------------------------------------- tick

  step() {
    this.tick++;
    this.deliverOrders();
    this.deliverEnvoys();
    this.move();
    this.fight();
    this.sieges();
    if (this.tick % 6 === 0) this.updateArmies();
    if (this.tick % HOURS_PER_DAY === 0) this.daily();
  }

  private move() {
    const { cost } = this.map;
    const fieldFor: (Uint16Array | undefined)[] = [];
    const getField = (id: number) => (fieldFor[id] ??= this.fields.get(id));

    for (let i = 0; i < this.high; i++) {
      if (this.sf[i] === DEAD) continue;
      const a = this.sArmy[i];
      let target: number, radius: number;
      if (a >= 0) {
        const army = this.armies.get(a)!;
        target = army.target;
        // Besiegers crowd the walls; friendly hosts camp around the town
        radius = this.atWar(army.faction, this.owner[target]) ? 3 : 2 * (3 + Math.sqrt(army.size) * 0.45);
      } else {
        target = this.sHome[i];
        radius = 7;
      }
      const field = getField(target);
      const x = this.sx[i], y = this.sy[i];
      const tile = (y | 0) * MAP_W + (x | 0);
      const d = field[tile];
      if (d === UNREACHABLE) continue;

      const terrainSlow = 2 / cost[tile];
      let dx: number, dy: number, step: number;
      if (d > radius) {
        // Walk downhill on the distance field (8 neighbors)
        let best = d, bx = 0, by = 0;
        const tx = x | 0, ty = y | 0;
        for (let oy = -1; oy <= 1; oy++) {
          const yy = ty + oy;
          if (yy < 0 || yy >= MAP_H) continue;
          for (let ox = -1; ox <= 1; ox++) {
            const xx = tx + ox;
            if ((ox === 0 && oy === 0) || xx < 0 || xx >= MAP_W) continue;
            const v = field[yy * MAP_W + xx];
            if (v < best) { best = v; bx = ox; by = oy; }
          }
        }
        dx = tx + bx + 0.5 - x + (Math.random() - 0.5) * 0.9;
        dy = ty + by + 0.5 - y + (Math.random() - 0.5) * 0.9;
        step = this.sSpeed[i] * terrainSlow;
      } else {
        // Arrived: mill about
        dx = Math.random() - 0.5;
        dy = Math.random() - 0.5;
        step = 0.12;
      }
      const len = Math.hypot(dx, dy) || 1;
      const nx = x + (dx / len) * step, ny = y + (dy / len) * step;
      if (this.passable(nx, ny)) {
        const nd = field[(ny | 0) * MAP_W + (nx | 0)];
        if (d > radius || nd <= radius) { this.sx[i] = nx; this.sy[i] = ny; }
      } else if (this.passable(nx, y)) this.sx[i] = nx;
      else if (this.passable(x, ny)) this.sy[i] = ny;
    }
  }

  private fight() {
    const cells = this.cells;
    cells.fill(0);
    const nr = this.realms.length;
    for (let i = 0; i < this.high; i++) {
      const f = this.sf[i];
      if (f === DEAD) continue;
      const c = ((this.sy[i] / CELL) | 0) * CW + ((this.sx[i] / CELL) | 0);
      cells[c * MAX_FACTIONS + f]++;
    }
    const foes = this.realms.map(r => this.enemiesOf(r.id));
    const { terrain, region } = this.map;
    for (let i = 0; i < this.high; i++) {
      const f = this.sf[i];
      if (f === DEAD) continue;
      const c = ((this.sy[i] / CELL) | 0) * CW + ((this.sx[i] / CELL) | 0);
      const tile = (this.sy[i] | 0) * MAP_W + (this.sx[i] | 0);
      const fs = foes[f];
      if (fs.length) {
        let enemy = 0;
        for (let j = 0; j < fs.length; j++) enemy += cells[c * MAX_FACTIONS + fs[j]];
        if (enemy > 0) {
          const own = cells[c * MAX_FACTIONS + f];
          const p = COMBAT_K * (enemy / (own + enemy)) * TERRAIN_DEFENSE[terrain[tile] as Terrain];
          if (Math.random() < p) {
            let b = this.battle.get(c);
            if (!b) this.battle.set(c, (b = { deaths: 0, factions: new Set() }));
            b.deaths++;
            b.factions.add(f);
            this.kill(i);
            continue;
          }
        }
      }
      const r = region[tile];
      if (r !== NO_REGION && this.owner[r] !== f && Math.random() < ATTRITION) this.kill(i);
    }
    void nr;
  }

  private sieges() {
    const counts = new Array<number>(MAX_FACTIONS);
    for (const s of this.map.settlements) {
      const own = this.owner[s.id];
      if (own < 0) continue;
      counts.fill(0);
      const cx = (s.x / CELL) | 0, cy = (s.y / CELL) | 0;
      for (let oy = -SIEGE_CELLS; oy <= SIEGE_CELLS; oy++) {
        for (let ox = -SIEGE_CELLS; ox <= SIEGE_CELLS; ox++) {
          const x = cx + ox, y = cy + oy;
          if (x < 0 || y < 0 || x >= CW || y >= CH) continue;
          const c = (y * CW + x) * MAX_FACTIONS;
          for (let f = 0; f < this.realms.length; f++) counts[f] += this.cells[c + f];
        }
      }
      let top = -1, topN = 0;
      for (let f = 0; f < this.realms.length; f++) {
        if (this.atWar(f, own) && counts[f] > topN) { topN = counts[f]; top = f; }
      }
      this.contested[s.id] = topN > 0 ? 1 : 0;
      if (counts[own] === 0 && topN >= 5) {
        if (this.siegeBy[s.id] !== top) { this.siegeBy[s.id] = top; this.siege[s.id] = 0; }
        this.siege[s.id] += 1 / 18;
        if (this.siege[s.id] >= 1) this.capture(s.id, top);
      } else if (this.siege[s.id] > 0) {
        this.siege[s.id] = Math.max(0, this.siege[s.id] - 1 / 36);
        if (this.siege[s.id] === 0) this.siegeBy[s.id] = -1;
      }
    }
  }

  private capture(id: number, by: number) {
    const s = this.map.settlements[id];
    const prev = this.owner[id];
    for (let i = 0; i < this.high; i++) {
      if (this.sf[i] !== DEAD && this.sArmy[i] < 0 && this.sHome[i] === id) this.kill(i);
    }
    this.owner[id] = by;
    this.takenAt[id] = this.tick;
    this.siege[id] = 0;
    this.siegeBy[id] = -1;
    const winner = this.realms[by], loser = this.realms[prev];
    const wasCapital = loser.capital === id;

    // Plunder
    const loot = Math.round(40 + s.food / 12 + Math.max(0, loser.gold) * (wasCapital ? 0.4 : 0.08));
    winner.gold += loot;
    loser.gold -= Math.min(Math.max(0, loser.gold), loot / 2);

    this.log(by, [by, prev], wasCapital
      ? `${s.name}, seat of the ${loser.name}, falls to the ${winner.name}! ${loot} crowns are carried off.`
      : `The ${winner.name} takes ${s.name} from the ${loser.name}.`);

    for (const a of this.armies.values()) {
      if (a.faction === by && a.target === id) {
        a.order = 'hold';
        a.renown++;
        a.morale = Math.min(1, a.morale + 0.2);
        a.idleDays = 0;
      }
    }
    if (wasCapital) {
      if (Math.random() < 0.3) this.succession(prev, `is slain as ${s.name} falls`);
      this.relocateCourt(prev);
    }
  }

  private relocateCourt(k: number) {
    let best = -1, bestG = -1;
    for (const s of this.map.settlements) {
      if (this.owner[s.id] === k && this.garrison[s.id] > bestG) { bestG = this.garrison[s.id]; best = s.id; }
    }
    if (best < 0) return;
    this.realms[k].capital = best;
    this.log(k, [k], `The court of ${this.ruler(k)} flees to ${this.map.settlements[best].name}.`);
  }

  private updateArmies() {
    const last = new Map<number, [number, number]>();
    for (const a of this.armies.values()) { last.set(a.id, [a.cx, a.cy]); a.size = 0; a.cx = 0; a.cy = 0; }
    for (let i = 0; i < this.high; i++) {
      if (this.sf[i] === DEAD || this.sArmy[i] < 0) continue;
      const a = this.armies.get(this.sArmy[i]);
      if (!a) { this.sArmy[i] = -1; this.garrison[this.sHome[i]]++; continue; }
      a.size++; a.cx += this.sx[i]; a.cy += this.sy[i];
    }
    for (const a of [...this.armies.values()]) {
      if (a.size === 0) {
        [a.cx, a.cy] = last.get(a.id) ?? [0, 0];
        if (a.peak >= 20) {
          this.log(a.faction, [a.faction], `The host of General ${a.general} is destroyed near ${this.nearestName(a.cx, a.cy)}.`);
        }
        this.armies.delete(a.id);
        continue;
      }
      a.cx /= a.size; a.cy /= a.size;
      a.peak = Math.max(a.peak, a.size);
      if (a.order === 'march' && this.owner[a.target] === a.faction) {
        const t = this.map.settlements[a.target];
        if (Math.hypot(t.x - a.cx, t.y - a.cy) < 8) a.order = 'hold';
      }
    }
  }

  // ---------------------------------------------------------------- daily

  private daily() {
    if ((this.tick / HOURS_PER_DAY) % DAYS_PER_MONTH === 0) this.sample();
    this.economy();
    this.recruit();
    this.morale();
    this.consolidate();
    this.sellswords();
    this.revolts();
    this.battleReports();
    this.fates();
    this.omens();
    this.fallenRealms();
  }

  private economy() {
    const { region } = this.map;
    for (const r of this.realms) { r.income = 0; r.upkeep = 0; }
    for (const s of this.map.settlements) {
      const k = this.owner[s.id];
      if (k < 0 || this.contested[s.id]) continue;
      this.realms[k].income += 1.5 + s.food / 350;
    }
    this.trade();
    for (let i = 0; i < this.high; i++) {
      const f = this.sf[i];
      if (f === DEAD) continue;
      let pay = PAY_GARRISON;
      if (this.sArmy[i] >= 0) {
        const r = region[(this.sy[i] | 0) * MAP_W + (this.sx[i] | 0)];
        pay = r !== NO_REGION && this.owner[r] !== f ? PAY_FORAGING : PAY_FIELD;
      }
      this.realms[f].upkeep += pay;
    }
    for (const r of this.realms) {
      if (!r.alive) continue;
      const wasSolvent = r.gold >= 0;
      r.gold += r.income - r.upkeep;
      if (wasSolvent && r.gold < 0 && this.tick - (this.dryLogged.get(r.id) ?? -YEAR) > 90 * HOURS_PER_DAY) {
        this.dryLogged.set(r.id, this.tick);
        this.log(r.id, [r.id], `The treasury of the ${r.name} runs dry. The soldiers go unpaid.`);
      }
    }
  }

  /** Neighbors at peace trade: each gains a share of the poorer one's taxes. War cuts it off. */
  private trade() {
    const taxes = this.realms.map(r => r.income);
    const borders = new Set<string>();
    for (const s of this.map.settlements) {
      const a = this.owner[s.id];
      for (const n of s.neighbors) {
        const b = this.owner[n];
        if (a >= 0 && b >= 0 && a < b) borders.add(`${a}:${b}`);
      }
    }
    for (const r of this.realms) { r.trade = 0; r.partners = []; }
    for (const key of borders) {
      const [a, b] = key.split(':').map(Number);
      const A = this.realms[a], B = this.realms[b];
      if (!A.alive || !B.alive || this.atWar(a, b)) continue;
      const share = TRADE_SHARE * Math.min(taxes[a], taxes[b]) * (this.isAllied(a, b) ? 1.5 : 1);
      A.income += share; B.income += share;
      A.trade! += share; B.trade! += share;
      A.partners!.push(b); B.partners!.push(a);
      // Now and then a caravan sets out
      if (Math.random() < 1 / 12) {
        const [from, to] = Math.random() < 0.5 ? [a, b] : [b, a];
        const days = Math.max(2, this.capitalDistance(from, to) / 20);
        this.caravans.push({ from, to, sent: this.tick, arrives: this.tick + Math.round(days * HOURS_PER_DAY) });
      }
    }
    this.caravans = this.caravans.filter(c => c.arrives > this.tick && this.realms[c.from].alive && this.realms[c.to].alive && !this.atWar(c.from, c.to));
  }

  private recruit() {
    for (const s of this.map.settlements) {
      const k = this.owner[s.id];
      if (k < 0 || !this.realms[k].alive || this.contested[s.id]) continue;
      const realm = this.realms[k];
      if (realm.gold < 0) {
        // Unpaid garrisons drift home to their fields
        const leave = Math.floor(this.garrison[s.id] * 0.01 + Math.random());
        let left = 0;
        for (let i = 0; i < this.high && left < leave; i++) {
          if (this.sf[i] !== DEAD && this.sArmy[i] < 0 && this.sHome[i] === s.id) { this.kill(i); left++; }
        }
        continue;
      }
      // Stewards won't hire men the crown can't pay
      if (realm.income - realm.upkeep < realm.income * 0.2) continue;
      const n = Math.floor((1 + s.food / 400) * POP_SCALE + Math.random());
      // Fill the garrison first; beyond that, recruits join a host resting here
      const resting = [...this.armies.values()].find(a =>
        a.faction === k && a.order === 'hold' && a.target === s.id && a.size < MAX_ARMY);
      for (let i = 0; i < n; i++) {
        if (this.garrison[s.id] < this.garrisonCap(s.id)) this.spawn(s.id);
        else if (resting) this.enlist(this.spawn(s.id), resting);
        else break;
      }
    }
  }

  private morale() {
    for (const a of [...this.armies.values()]) {
      const realm = this.realms[a.faction];
      // Drift toward steady
      const atWar = this.enemiesOf(a.faction).length > 0;
      a.morale += (0.6 - a.morale) * 0.02;
      // Losses in battle (desertion is counted separately)
      const lost = a.lastSize - a.size - (this.deserted.get(a.id) ?? 0);
      if (a.lastSize > 0 && lost / a.lastSize > 0.05) a.morale -= (lost / a.lastSize) * 0.6;
      // Idleness
      const idle = a.order === 'hold' && this.owner[a.target] === a.faction;
      a.idleDays = idle ? a.idleDays + 1 : 0;
      // Idleness chafes only while there is a war to be fought
      if (a.idleDays > 60 && atWar) a.morale -= 0.006;
      // Pay
      if (realm.gold < 0) a.morale -= 0.03;
      a.morale = Math.max(0, Math.min(1, a.morale));

      // Desertion
      if (a.morale < 0.3 && a.size > 0) {
        const n = Math.floor(a.size * (0.3 - a.morale) * 0.15 + Math.random());
        let gone = 0;
        for (let i = 0; i < this.high && gone < n; i++) {
          if (this.sArmy[i] === a.id) { this.kill(i); gone++; }
        }
        a.size -= gone;
        this.deserted.set(a.id, gone);
        const total = (this.desertTally.get(a.id) ?? 0) + gone;
        this.desertTally.set(a.id, total);
        if (total >= 150) {
          const why = realm.gold < 0 ? 'unpaid' : a.idleDays > 60 ? 'idle and restless' : 'broken in spirit';
          this.log(a.faction, [a.faction], `Desertion bleeds the host of General ${a.general}: ${total} men gone, ${why}.`);
          this.desertTally.set(a.id, 0);
        }
      } else {
        this.deserted.delete(a.id);
      }
      a.lastSize = a.size;

      this.maybeRebel(a);
    }
  }

  private battleReports() {
    const today = new Set<number>();
    for (const [c, b] of this.battle) {
      if (b.deaths < 5) continue;
      const x = (c % CW) * CELL, y = Math.floor(c / CW) * CELL;
      const at = this.nearest(x, y);
      if (at === null) continue;
      let w = this.wars.get(at);
      if (!w) this.wars.set(at, (w = { deaths: 0, factions: new Set(), start: this.tick }));
      w.deaths += b.deaths;
      for (const f of b.factions) w.factions.add(f);
      today.add(at);
    }
    for (const [at, w] of this.wars) {
      if (today.has(at)) continue;
      this.wars.delete(at);
      if (w.deaths < 40 || w.factions.size < 2) continue;
      const days = Math.max(1, Math.round((this.tick - w.start) / HOURS_PER_DAY));
      const fs = [...w.factions];
      const who = fs.map(f => `the ${this.realms[f].name}`).join(' and ');
      this.log(-1, fs, `The Battle of ${this.map.settlements[at].name}: ${days} day${days > 1 ? 's' : ''} of fighting between ${who}. ${w.deaths} fall.`);
    }
    this.battle.clear();
  }

  /** Remnant hosts fold into a garrison; hosts camped at the same town join under the stronger general. */
  private consolidate() {
    for (const a of [...this.armies.values()]) {
      if (a.size >= 25 || a.size === 0) continue;
      const home = this.nearestOwned(a.cx, a.cy, a.faction);
      const inOwnLand = home !== null && Math.hypot(this.map.settlements[home].x - a.cx, this.map.settlements[home].y - a.cy) < 40;
      for (let i = 0; i < this.high; i++) {
        if (this.sArmy[i] !== a.id) continue;
        if (inOwnLand) { this.sArmy[i] = -1; this.sHome[i] = home!; this.garrison[home!]++; } else this.kill(i);
      }
      this.armies.delete(a.id);
      this.log(a.faction, [a.faction], inOwnLand
        ? `The last ${a.size} of General ${a.general}'s host join the garrison of ${this.map.settlements[home!].name}. The host is no more.`
        : `The last ${a.size} of General ${a.general}'s host scatter in hostile country.`);
    }
    const camps = new Map<string, Army[]>();
    for (const a of this.armies.values()) {
      if (a.order !== 'hold' || this.owner[a.target] !== a.faction) continue;
      const t = this.map.settlements[a.target];
      if (Math.hypot(t.x - a.cx, t.y - a.cy) > 12) continue;
      const key = `${a.faction}:${a.target}`;
      (camps.get(key) ?? camps.set(key, []).get(key)!).push(a);
    }
    for (const group of camps.values()) {
      if (group.length < 2) continue;
      group.sort((p, q) => q.size - p.size);
      const [lead, ...rest] = group;
      for (const b of rest) {
        for (let i = 0; i < this.high; i++) if (this.sArmy[i] === b.id) this.sArmy[i] = lead.id;
        lead.morale = (lead.morale * lead.size + b.morale * b.size) / Math.max(1, lead.size + b.size);
        lead.size += b.size;
        lead.lastSize = lead.size;
        lead.renown = Math.max(lead.renown, b.renown);
        this.armies.delete(b.id);
        this.log(lead.faction, [lead.faction], `General ${b.general}'s ${b.size} men join the host of General ${lead.general} at ${this.map.settlements[lead.target].name}.`);
      }
    }
  }

  /** Unpaid sellswords walk — or sell their spears to a richer enemy. */
  private sellswords() {
    for (const a of [...this.armies.values()]) {
      if (!a.merc || this.realms[a.faction].gold >= 0 || Math.random() > 0.08) continue;
      const old = this.realms[a.faction];
      const buyer = this.enemiesOf(a.faction).map(e => this.realms[e]).filter(r => r.gold > a.size * 2)
        .sort((p, q) => q.gold - p.gold)[0];
      if (buyer) {
        buyer.gold -= a.size;
        for (let i = 0; i < this.high; i++) if (this.sArmy[i] === a.id) this.sf[i] = buyer.id;
        a.faction = buyer.id;
        a.target = this.nearestOwned(a.cx, a.cy, buyer.id) ?? a.target;
        a.order = 'hold';
        a.morale = 0.7;
        this.log(buyer.id, [buyer.id, old.id], `Unpaid, the ${a.merc} turn their coats: ${a.size} sellswords under General ${a.general} go over from the ${old.name} to the ${buyer.name}.`);
      } else {
        for (let i = 0; i < this.high; i++) if (this.sArmy[i] === a.id) this.kill(i);
        this.armies.delete(a.id);
        this.log(old.id, [old.id], `Unpaid, the ${a.merc} break their contract with the ${old.name} and ride away.`);
      }
    }
  }

  /** A town lately taken, thinly held, may open its gates to its old masters. */
  private revolts() {
    for (const s of this.map.settlements) {
      const own = this.owner[s.id], founder = s.kingdom;
      if (own === founder || this.takenAt[s.id] < 0 || !this.realms[founder]?.alive) continue;
      if (this.tick - this.takenAt[s.id] > 3 * YEAR || this.contested[s.id] || this.garrison[s.id] >= 40) continue;
      if (this.realms[own].capital === s.id || Math.random() > 0.004) continue;
      for (let i = 0; i < this.high; i++) {
        if (this.sf[i] !== DEAD && this.sArmy[i] < 0 && this.sHome[i] === s.id) this.kill(i);
      }
      this.owner[s.id] = founder;
      this.takenAt[s.id] = -1;
      if (!this.atWar(founder, own)) this.setWar(founder, own, true);
      this.log(founder, [founder, own], `The people of ${s.name} rise against the ${this.realms[own].name} and open their gates to the ${this.realms[founder].name}.`);
    }
  }

  /** Rulers age and die. */
  private fates() {
    for (const r of this.realms) {
      if (!r.alive) continue;
      const age = this.rulerAge(r.id);
      const perYear = 0.01 + Math.pow(Math.max(0, age - 40) / 10, 2) * 0.04;
      if (Math.random() < perYear / (DAYS_PER_MONTH * 12)) {
        const their = r.ruler.title === 'Queen' ? 'her' : 'his';
        const how = pick([`dies in ${their} sleep`, 'is taken by a fever', 'falls from a horse', 'dies at the feast table',
          'is found dead in the chapel', 'dies of a wound that never healed']);
        this.succession(r.id, `${how}, aged ${age}`);
      }
    }
  }

  private succession(k: number, how: string) {
    const r = this.realms[k];
    const old = this.ruler(k);
    const heir: Ruler = {
      title: Math.random() < 0.5 ? 'King' : 'Queen',
      name: this.names.person(),
      born: this.tick - Math.floor((16 + Math.random() * 24) * YEAR),
      temperament: Math.random() < 0.3 ? r.ruler.temperament : pick(TEMPERAMENTS),
    };
    r.ruler = heir;
    r.turns = [];
    r.reign = [];
    r.inbox = [`You have just been crowned. ${old} ${how}.`];
    r.nextCouncil = Math.min(r.nextCouncil, this.tick + HOURS_PER_DAY * 3);
    this.log(k, [k], `${old} of the ${r.name} ${how}. ${this.ruler(k)}, aged ${this.rulerAge(k)}, takes the throne.`);
  }

  /** A renowned general with little love for the crown and hungry men may take a town for his own. */
  private maybeRebel(a: Army) {
    const realm = this.realms[a.faction];
    const living = this.realms.filter(r => r.alive).length;
    if (living >= MAX_LIVING_REALMS || this.realms.length >= MAX_FACTIONS) return;
    if (a.order !== 'hold' || this.owner[a.target] !== a.faction || a.target === realm.capital) return;
    if (a.loyalty > 0.4 || a.size < 150) return;
    const grievance = realm.gold < 0 || a.morale < 0.35;
    const chance = a.renown >= 2 && grievance ? 0.02 : a.morale < 0.12 ? 0.03 : 0;
    if (Math.random() >= chance) return;

    const s = this.map.settlements[a.target];
    const id = this.realms.length;
    const name = pick([`Free March of ${s.name}`, `Dominion of ${s.name}`, `${s.name} Compact`, `Banner of ${s.name}`]);
    const rebel: Realm = {
      id, name,
      color: KINGDOM_COLORS[id % KINGDOM_COLORS.length],
      ruler: { title: 'King', name: a.general, born: this.tick - Math.floor((28 + Math.random() * 20) * YEAR), temperament: pick(['ambitious and proud', 'bitter', 'bloodthirsty', 'cunning', 'reckless']) },
      brain: this.rebelBrain,
      origin: `raised in rebellion against the ${realm.name} by General ${a.general}`,
      founded: this.tick,
      alive: true,
      capital: a.target,
      gold: 150,
      income: 0, upkeep: 0, honor: 0.6,
      thinking: false, lastThought: '', lastDecrees: [], reign: [], turns: [],
      inbox: [`You were a general of the ${realm.name}. You have just risen in rebellion and taken ${s.name} for your own.`],
      lastCouncil: this.tick,
      nextCouncil: this.tick + HOURS_PER_DAY * 4,
    };
    if (Math.random() < 0.3) rebel.ruler.title = 'Queen';
    this.realms.push(rebel);
    this.owner[a.target] = id;
    for (let i = 0; i < this.high; i++) {
      if (this.sArmy[i] === a.id || (this.sArmy[i] < 0 && this.sHome[i] === a.target && this.sf[i] === a.faction)) this.sf[i] = id;
    }
    a.faction = id;
    a.general = `${a.general}'s Guard`;
    this.setWar(id, realm.id, true);
    const why = realm.gold < 0 ? 'the crown has not paid them in months' : a.morale < 0.35 ? 'the men are sick of waiting' : 'ambition';
    this.log(id, [id, realm.id], `General ${rebel.ruler.name} rises in rebellion at ${s.name}, for ${why}, and proclaims the ${name}!`);
  }

  /** Rare events that keep the world from settling. */
  private omens() {
    for (const s of this.map.settlements) {
      const k = this.owner[s.id];
      if (k < 0) continue;
      const roll = Math.random();
      if (roll < 1 / 9000) {
        const dead = Math.floor(this.garrison[s.id] * 0.4);
        let n = 0;
        for (let i = 0; i < this.high && n < dead; i++) {
          if (this.sf[i] !== DEAD && this.sArmy[i] < 0 && this.sHome[i] === s.id) { this.kill(i); n++; }
        }
        if (n > 10) this.log(k, [k], `Plague in ${s.name}. ${n} of the garrison are buried.`);
      } else if (roll < 1 / 9000 + 1 / 14000) {
        const gain = Math.round(60 + s.food / 20);
        this.realms[k].gold += gain;
        this.log(k, [k], `A bountiful harvest at ${s.name} fills the ${this.realms[k].name}'s coffers with ${gain} crowns.`);
      }
    }
  }

  private fallenRealms() {
    for (const r of this.realms) {
      if (!r.alive || this.held(r.id) > 0) continue;
      r.alive = false;
      for (let i = 0; i < this.high; i++) if (this.sf[i] === r.id) this.kill(i);
      for (const a of [...this.armies.values()]) if (a.faction === r.id) this.armies.delete(a.id);
      for (const o of this.realms) { this.setWar(r.id, o.id, false); this.setAllied(r.id, o.id, false); }
      this.log(r.id, [r.id], `The ${r.name} is no more. ${this.ruler(r.id)} is lost to history.`);
    }
    const living = this.realms.filter(r => r.alive);
    if (living.length <= 1 && this.endsAt < 0) {
      const w = living[0];
      this.log(-1, [], w
        ? `${this.ruler(w.id)} of the ${w.name} rules the whole continent. The Age ${roman(this.age)} draws to a close.`
        : `The continent lies empty. The Age ${roman(this.age)} ends.`);
      this.endsAt = this.tick + HOURS_PER_DAY * 12;
    }
  }

  private sample() {
    const soldiers = new Array(this.realms.length).fill(0);
    for (let i = 0; i < this.high; i++) if (this.sf[i] !== DEAD) soldiers[this.sf[i]]++;
    this.history.push({ tick: this.tick, held: this.realms.map(r => this.held(r.id)), soldiers });
    if (this.history.length > 2400) this.history.splice(0, this.history.length - 2400);
  }

  /** Chronicle entries of one year, for the scribe. */
  yearEntries(year: number): string[] {
    const from = (year - 1) * YEAR, to = year * YEAR;
    return this.chronicle.filter(e => e.tick > from && e.tick <= to)
      .map(e => e.faction >= 0 && this.realms[e.faction] ? `(${this.realms[e.faction].name}) ${e.text}` : e.text);
  }

  // ---------------------------------------------------------------- diplomacy

  setWar(a: number, b: number, on: boolean) {
    this.war[a * MAX_FACTIONS + b] = on ? 1 : 0;
    this.war[b * MAX_FACTIONS + a] = on ? 1 : 0;
    this.warSince[a * MAX_FACTIONS + b] = this.warSince[b * MAX_FACTIONS + a] = on ? this.tick : -1;
  }

  /** Whole years the current war between a and b has lasted, or -1 at peace. */
  warYears(a: number, b: number): number {
    const t = this.warSince[a * MAX_FACTIONS + b];
    return this.atWar(a, b) && t >= 0 ? (this.tick - t) / YEAR : -1;
  }

  /** Returns a sentence describing what happened, for the ruler's memory. */
  declareWar(a: number, b: number): string {
    if (this.atWar(a, b)) return `You are already at war with the ${this.realms[b].name}.`;
    this.setWar(a, b, true);
    this.peaceOffers = this.peaceOffers.filter(o => !((o.from === a && o.to === b) || (o.from === b && o.to === a)));
    const sworn = this.treaty[a * MAX_FACTIONS + b];
    const betrayal = this.isAllied(a, b);
    const oathbreak = betrayal || (sworn >= 0 && this.tick - sworn < 2 * YEAR);
    if (betrayal) this.setAllied(a, b, false);
    if (oathbreak) this.realms[a].honor = Math.max(0, this.realms[a].honor - (betrayal ? 0.35 : 0.25));
    this.log(a, [a, b], betrayal
      ? `${this.ruler(a)} betrays the alliance with the ${this.realms[b].name} and declares war! Oathbreaker, they whisper.`
      : oathbreak
        ? `${this.ruler(a)} breaks the peace sworn with the ${this.realms[b].name} and declares war! Oathbreaker, they whisper.`
        : `The ${this.realms[a].name} declares war on the ${this.realms[b].name}.`);
    const called = this.callToArms(a, b);
    const tail = called.length ? ` The allies of the ${this.realms[b].name} answer: ${called.join(', ')} now war on you too.` : '';
    return (betrayal ? `You betrayed your alliance and declared war on the ${this.realms[b].name}. Your honor suffers greatly.`
      : oathbreak ? `You broke your oath of peace and declared war on the ${this.realms[b].name}. Your honor suffers.`
        : `You declared war on the ${this.realms[b].name}.`) + tail;
  }

  isAllied(a: number, b: number): boolean {
    return a !== b && this.allied[a * MAX_FACTIONS + b] === 1;
  }

  alliesOf(k: number): number[] {
    return this.realms.filter(r => r.alive && this.isAllied(k, r.id)).map(r => r.id);
  }

  setAllied(a: number, b: number, on: boolean) {
    this.allied[a * MAX_FACTIONS + b] = this.allied[b * MAX_FACTIONS + a] = on ? 1 : 0;
  }

  /** The defender's allies take up arms against the aggressor. Returns the names of those who answered. */
  private callToArms(aggressor: number, defender: number): string[] {
    const answered: string[] = [];
    for (const c of this.alliesOf(defender)) {
      if (c === aggressor || this.atWar(c, aggressor) || this.isAllied(c, aggressor)) continue;
      this.setWar(c, aggressor, true);
      answered.push(`the ${this.realms[c].name}`);
      this.log(c, [c, aggressor, defender], `The ${this.realms[c].name} honors its alliance with the ${this.realms[defender].name} and takes up arms against the ${this.realms[aggressor].name}.`);
    }
    return answered;
  }

  makePeace(a: number, b: number) {
    this.setWar(a, b, false);
    this.treaty[a * MAX_FACTIONS + b] = this.treaty[b * MAX_FACTIONS + a] = this.tick;
    this.peaceOffers = this.peaceOffers.filter(o => !((o.from === a && o.to === b) || (o.from === b && o.to === a)));
    // Hosts besieging the other side come home
    for (const h of this.armies.values()) {
      if ((h.faction === a && this.owner[h.target] === b) || (h.faction === b && this.owner[h.target] === a)) {
        h.target = this.nearestOwned(h.cx, h.cy, h.faction) ?? h.target;
        h.order = 'hold';
      }
    }
    for (const s of this.map.settlements) {
      if ((this.owner[s.id] === a && this.siegeBy[s.id] === b) || (this.owner[s.id] === b && this.siegeBy[s.id] === a)) {
        this.siege[s.id] = 0; this.siegeBy[s.id] = -1;
      }
    }
    this.log(-1, [a, b], `The ${this.realms[a].name} and the ${this.realms[b].name} swear peace.`);
  }

  sendEnvoy(from: number, to: number, text: string, peace: boolean, alliance = false) {
    const days = Math.max(1, this.capitalDistance(from, to) / COURIER_SPEED);
    this.envoys.push({ from, to, text, peace, alliance, sent: this.tick, arrives: this.tick + Math.round(days * HOURS_PER_DAY) });
    if (peace) this.peaceOffers.push({ from, to, tick: this.tick });
    if (alliance) this.allianceOffers.push({ from, to, tick: this.tick });
  }

  hasAllianceOffer(from: number, to: number): boolean {
    return this.allianceOffers.some(o => o.from === from && o.to === to && this.tick - o.tick < 180 * HOURS_PER_DAY);
  }

  makeAlliance(a: number, b: number) {
    this.setAllied(a, b, true);
    this.allianceOffers = this.allianceOffers.filter(o => !((o.from === a && o.to === b) || (o.from === b && o.to === a)));
    this.log(-1, [a, b], `The ${this.realms[a].name} and the ${this.realms[b].name} swear alliance.`);
  }

  private deliverEnvoys() {
    if (!this.envoys.length) return;
    const due = this.envoys.filter(e => e.arrives <= this.tick);
    if (!due.length) return;
    this.envoys = this.envoys.filter(e => e.arrives > this.tick);
    for (const e of due) {
      if (!this.realms[e.to].alive || !this.realms[e.from].alive) continue;
      const from = this.realms[e.from];
      const said = e.text ? `: “${e.text}”` : '.';
      const offer = e.peace ? ' They offer peace.' : e.alliance ? ' They propose an alliance.' : '';
      this.realms[e.to].inbox.push(`An envoy from ${this.ruler(e.from)} of the ${from.name} arrives${said}${offer}`);
      this.log(e.from, [], `Envoy of ${this.ruler(e.from)} to ${this.ruler(e.to)}${said}${e.peace ? ' (an offer of peace)' : e.alliance ? ' (an offer of alliance)' : ''}`);
      if (e.alliance && !this.atWar(e.from, e.to) && !this.isAllied(e.from, e.to) && this.hasAllianceOffer(e.to, e.from)) {
        this.makeAlliance(e.from, e.to);
      }
      // Two offers crossing make a treaty
      if (e.peace && this.atWar(e.from, e.to)) {
        const theirs = this.peaceOffers.find(o => o.from === e.to && o.to === e.from && this.tick - o.tick < 180 * HOURS_PER_DAY);
        if (theirs) this.makePeace(e.from, e.to);
      }
    }
  }

  /** A peace offer answered with peace: called when a ruler accepts one waiting in their inbox. */
  hasPeaceOffer(from: number, to: number): boolean {
    return this.peaceOffers.some(o => o.from === from && o.to === to && this.tick - o.tick < 180 * HOURS_PER_DAY);
  }

  // ---------------------------------------------------------------- orders

  /** Queue a royal command. It travels from the capital by courier. */
  issue(order: Omit<Order, 'arrives'>) {
    const cap = this.map.settlements[this.realms[order.kingdom].capital];
    let tx = cap.x, ty = cap.y;
    if (order.army !== undefined) {
      const a = this.armies.get(order.army);
      if (a) { tx = a.cx; ty = a.cy; }
    } else if (order.settlement !== undefined) {
      const s = this.map.settlements[order.settlement];
      tx = s.x; ty = s.y;
    }
    const days = Math.hypot(tx - cap.x, ty - cap.y) / COURIER_SPEED;
    this.orders.push({ ...order, sent: this.tick, arrives: this.tick + Math.max(1, Math.round(days * HOURS_PER_DAY)) });
  }

  private deliverOrders() {
    if (!this.orders.length) return;
    const due = this.orders.filter(o => o.arrives <= this.tick);
    if (!due.length) return;
    this.orders = this.orders.filter(o => o.arrives > this.tick);
    for (const o of due) {
      if (!this.realms[o.kingdom].alive) continue;
      if (o.kind === 'muster') {
        const s = o.settlement!;
        if (this.owner[s] !== o.kingdom) continue;
        if (this.realms[o.kingdom].gold < 0) {
          this.log(o.kingdom, [o.kingdom], `The steward of ${this.map.settlements[s].name} cannot raise a host: there is no coin to pay them.`);
          continue;
        }
        const a = this.muster(s, o.kingdom, 0.8);
        if (!a) this.log(o.kingdom, [o.kingdom], `The steward of ${this.map.settlements[s].name} cannot raise a host: too few men, too little coin, or too many hosts already in the field.`);
        continue;
      }
      const a = this.armies.get(o.army!);
      if (!a || a.faction !== o.kingdom) continue;
      if (o.kind === 'hold') {
        a.target = this.nearestOwned(a.cx, a.cy, a.faction) ?? a.target;
        a.order = 'hold';
        continue;
      }
      // March: the hands don't always do as told
      const target = o.target!;
      const r = Math.random();
      const obey = 0.5 + a.loyalty * 0.2 + a.morale * 0.3;
      const tName = this.map.settlements[target].name;
      if (r < obey) {
        a.target = target;
        a.order = 'march';
        a.idleDays = 0;
      } else if (r < obey + (1 - obey) * 0.55) {
        // Misread toward a neighbor — but never one that would start a new war
        const nbrs = this.map.settlements[target].neighbors.filter(n =>
          this.owner[n] === a.faction || this.atWar(a.faction, this.owner[n]));
        const wrong = nbrs[Math.floor(Math.random() * nbrs.length)] ?? target;
        a.target = wrong;
        a.order = 'march';
        a.idleDays = 0;
        this.log(a.faction, [a.faction], `General ${a.general} misreads the royal seal and marches on ${this.map.settlements[wrong].name} instead of ${tName}.`);
      } else {
        const why = a.morale < 0.4 ? ' The men will not march.' : '';
        this.log(a.faction, [a.faction], `General ${a.general} ignores the command to march on ${tName}.${why}`);
      }
    }
  }

  muster(settlement: number, kingdom: number, share: number, free = false): Army | null {
    const mine = [...this.armies.values()].filter(a => a.faction === kingdom).length;
    if (mine >= MAX_ARMIES || this.garrison[settlement] < 20) return null;
    const realm = this.realms[kingdom];
    const take = Math.floor(Math.min(this.garrison[settlement] * share, free ? Infinity : Math.max(0, realm.gold) / MUSTER_COST));
    if (take < 20) return null;
    if (!free) realm.gold -= take * MUSTER_COST;
    const s = this.map.settlements[settlement];
    const army: Army = {
      id: this.nextArmyId++,
      faction: kingdom,
      general: this.names.person(),
      target: settlement,
      order: 'hold',
      size: take,
      cx: s.x,
      cy: s.y,
      loyalty: Math.random(),
      morale: 0.6,
      renown: 0,
      idleDays: 0,
      lastSize: take,
      peak: take,
    };
    this.armies.set(army.id, army);
    let moved = 0;
    for (let i = 0; i < this.high && moved < take; i++) {
      if (this.sf[i] !== DEAD && this.sArmy[i] < 0 && this.sHome[i] === settlement) {
        this.sArmy[i] = army.id;
        this.garrison[settlement]--;
        moved++;
      }
    }
    army.size = army.peak = army.lastSize = moved;
    this.log(kingdom, [kingdom], `General ${army.general} raises a host of ${moved} at ${s.name}.`);
    return army;
  }

  /** Coin buys a host at once — sellswords, loyal to their purse. Returns a sentence for the ruler's memory. */
  hireMercenaries(kingdom: number, settlement: number, crowns: number): string {
    const realm = this.realms[kingdom];
    const s = this.map.settlements[settlement];
    const mine = [...this.armies.values()].filter(a => a.faction === kingdom).length;
    if (mine >= MAX_ARMIES) return 'You have too many hosts in the field to hire another.';
    const spend = Math.floor(Math.min(crowns, Math.max(0, realm.gold)));
    const n = Math.min(Math.floor(spend / MERC_COST), 3000);
    if (n < 100) return spend < crowns
      ? `You tried to hire ${Math.floor(crowns / MERC_COST)} sellswords at ${s.name}, but your treasury holds only ${Math.max(0, Math.round(realm.gold))} crowns.`
      : `You tried to hire sellswords at ${s.name}, but no company will march with fewer than 100 men.`;
    realm.gold -= n * MERC_COST;
    const company = pick(['Red', 'Grey', 'Iron', 'Free', 'Black', 'Golden', 'Broken', 'Wolf', 'Salt', 'Crow']) + ' ' + pick(['Company', 'Lances', 'Blades', 'Band', 'Spears']);
    const army: Army = {
      id: this.nextArmyId++, faction: kingdom, general: this.names.person(), target: settlement, order: 'hold',
      size: 0, cx: s.x, cy: s.y, loyalty: Math.random() * 0.35, morale: 0.7, renown: 0, idleDays: 0, lastSize: 0, peak: 0,
      merc: `${company}`,
    };
    this.armies.set(army.id, army);
    for (let i = 0; i < n; i++) {
      const j = this.spawn(settlement);
      if (j < 0) break;
      this.enlist(j, army);
    }
    army.peak = army.lastSize = army.size;
    this.log(kingdom, [kingdom], `The ${company}, ${army.size} sellswords under General ${army.general}, take the ${realm.name}'s coin at ${s.name}.`);
    return `You paid ${n * MERC_COST} crowns and the ${company} (${army.size} sellswords under General ${army.general}) joined you at ${s.name}. Sellswords are loyal to coin, not crown.`;
  }

  // ---------------------------------------------------------------- queries

  log(faction: number, involves: number[], text: string) {
    this.chronicle.push({ tick: this.tick, text, faction, involves });
    if (this.chronicle.length > 3000) this.chronicle.splice(0, this.chronicle.length - 3000);
  }

  eventsFor(k: number, since: number): string[] {
    return this.chronicle
      .filter(e => e.tick > since && (e.involves.includes(k) || e.faction === -1))
      .map(e => e.text);
  }

  nearest(x: number, y: number, filter: (id: number) => boolean = () => true): number | null {
    let best: number | null = null, bd = Infinity;
    for (const s of this.map.settlements) {
      if (!filter(s.id)) continue;
      const d = (s.x - x) ** 2 + (s.y - y) ** 2;
      if (d < bd) { bd = d; best = s.id; }
    }
    return best;
  }

  nearestName(x: number, y: number): string {
    const n = this.nearest(x, y);
    return n === null ? 'the wilds' : this.map.settlements[n].name;
  }

  nearestOwned(x: number, y: number, k: number): number | null {
    return this.nearest(x, y, id => this.owner[id] === k);
  }

  soldiersOf(k: number): number {
    let n = 0;
    for (let i = 0; i < this.high; i++) if (this.sf[i] === k) n++;
    return n;
  }

  armyView(a: Army): ArmyView {
    return {
      id: a.id, faction: a.faction, general: a.general, size: a.size, x: a.cx, y: a.cy,
      target: a.target, order: a.order, morale: +a.morale.toFixed(2), renown: a.renown,
    };
  }

  view(stalledBy: string | null): StateResponse {
    const counts = new Array(this.realms.length).fill(0);
    for (let i = 0; i < this.high; i++) if (this.sf[i] !== DEAD) counts[this.sf[i]]++;
    return {
      tick: this.tick,
      seed: this.map.seed,
      date: formatDate(this.tick),
      age: this.age,
      stalledBy,
      kingdoms: this.realms.map(r => ({
        id: r.id,
        name: r.name,
        color: r.color,
        king: r.ruler.name,
        temperament: r.ruler.temperament,
        ruler: { title: r.ruler.title, name: r.ruler.name, age: this.rulerAge(r.id), temperament: r.ruler.temperament },
        brain: r.brain,
        alive: r.alive,
        gold: Math.round(r.gold),
        income: +r.income.toFixed(1),
        upkeep: +r.upkeep.toFixed(1),
        trade: +(r.trade ?? 0).toFixed(1),
        honor: +r.honor.toFixed(2),
        wars: this.enemiesOf(r.id),
        allies: this.alliesOf(r.id),
        origin: r.origin,
        capital: r.capital,
        thinking: r.thinking,
        lastThought: r.lastThought,
        lastDecrees: r.lastDecrees,
        reign: r.reign.slice(-8),
        mind: r.stats,
        settlements: this.held(r.id),
        soldiers: counts[r.id],
      })),
      settlements: this.map.settlements.map(s => ({
        id: s.id, owner: this.owner[s.id], garrison: this.garrison[s.id], siege: this.siege[s.id],
      })),
      armies: [...this.armies.values()].map(a => this.armyView(a)),
      couriers: this.couriers(),
      battles: [...this.wars].map(([at, b]) => ({
        x: this.map.settlements[at].x, y: this.map.settlements[at].y, deaths: b.deaths,
        days: Math.max(1, Math.round((this.tick - b.start) / HOURS_PER_DAY)), factions: [...b.factions],
      })).filter(b => b.deaths >= 10),
      chronicle: this.chronicle.slice(-80).map(({ tick, text, faction }) => ({ tick, text, faction })),
    };
  }

  private couriers(): CourierView[] {
    const S = this.map.settlements;
    const out: CourierView[] = [];
    const progress = (sent: number | undefined, arrives: number) =>
      sent === undefined ? 0.5 : Math.min(1, Math.max(0, (this.tick - sent) / Math.max(1, arrives - sent)));
    for (const o of this.orders) {
      const r = this.realms[o.kingdom];
      if (!r?.alive) continue;
      const from = S[r.capital];
      let x1 = from.x, y1 = from.y;
      const a = o.army !== undefined ? this.armies.get(o.army) : undefined;
      if (a) { x1 = a.cx; y1 = a.cy; } else if (o.settlement !== undefined) { x1 = S[o.settlement].x; y1 = S[o.settlement].y; }
      out.push({ kind: 'order', faction: o.kingdom, x0: from.x, y0: from.y, x1, y1, t: progress(o.sent, o.arrives) });
    }
    for (const e of this.envoys) {
      const A = S[this.realms[e.from].capital], B = S[this.realms[e.to].capital];
      out.push({ kind: 'envoy', faction: e.from, x0: A.x, y0: A.y, x1: B.x, y1: B.y, t: progress(e.sent, e.arrives) });
    }
    for (const c of this.caravans) {
      const A = S[this.realms[c.from].capital], B = S[this.realms[c.to].capital];
      out.push({ kind: 'caravan', faction: c.from, x0: A.x, y0: A.y, x1: B.x, y1: B.y, t: progress(c.sent, c.arrives) });
    }
    return out;
  }

  /** Binary snapshot of every soldier slot: header, then x[], y[] as Uint16, then faction[] */
  soldiersBinary(): Buffer {
    const n = this.high;
    const buf = Buffer.alloc(8 + n * 5);
    buf.writeUInt32LE(this.tick, 0);
    buf.writeUInt32LE(n, 4);
    const xs = new Uint16Array(n), ys = new Uint16Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = Math.round(this.sx[i] * 32);
      ys[i] = Math.round(this.sy[i] * 32);
    }
    Buffer.from(xs.buffer).copy(buf, 8);
    Buffer.from(ys.buffer).copy(buf, 8 + n * 2);
    Buffer.from(this.sf.buffer, 0, n).copy(buf, 8 + n * 4);
    return buf;
  }
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function roman(n: number): string {
  const map: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out || 'I';
}

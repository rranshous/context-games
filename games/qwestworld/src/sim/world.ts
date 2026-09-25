// world.ts — the hands: soldiers, armies, sieges, couriers. No inference here.
//
// Soldiers are struct-of-arrays in typed arrays. Each one belongs to an army
// or to a settlement's garrison and simply walks the distance field toward
// wherever its commander points. Kings only ever touch the world through
// orders, which travel by courier and may be misread or ignored.

import {
  MAP_W, MAP_H, NO_REGION, DEAD, Terrain, TERRAIN_DEFENSE, HOURS_PER_DAY,
  formatDate, ChronicleEntry, StateResponse, ArmyView,
} from '../shared/types.js';
import { WorldMap, generateMap } from './mapgen.js';
import { FieldCache, UNREACHABLE } from './flow.js';
import { NameGen } from './names.js';
import { mulberry32 } from './rng.js';
import type { Turn } from './court.js';

export const SOLDIER_CAP = 1 << 17;
const CELL = 4;
const CW = MAP_W / CELL, CH = MAP_H / CELL;
const MAX_FACTIONS = 8;

const MARCH_SPEED = 0.35;     // tiles per hour on grass
const COMBAT_K = 0.035;       // chance per hour of falling when fully surrounded by enemies
const ATTRITION = 0.0004;     // chance per hour of deserting/dying in foreign land
const COURIER_SPEED = 45;     // tiles per day
const SIEGE_CELLS = 2;        // cells around a settlement that count for its siege
const MAX_ARMIES = 6;
const MAX_ARMY = 8000;
const POP_SCALE = 3;           // multiplies garrison sizes and recruitment

export type OrderKind = 'march' | 'hold' | 'muster';

export interface Order {
  kind: OrderKind;
  kingdom: number;
  army?: number;
  target?: number;
  settlement?: number;
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
  loyalty: number;
  peak: number;
}

export interface KingdomState {
  alive: boolean;
  capital: number;
  thinking: boolean;
  lastThought: string;
  lastDecrees: string[];
  reign: string[];    // what the king did and what came of it, in-fiction
  turns: Turn[];      // the councils a king remembers (his rolling context)
  lastCouncil: number;
  nextCouncil: number;
}

interface Entry extends ChronicleEntry {
  involves: number[];
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

  armies = new Map<number, Army>();
  nextArmyId = 1;
  orders: Order[] = [];
  kingdoms: KingdomState[];
  chronicle: Entry[] = [];

  private fields: FieldCache;
  names: NameGen;
  private cells = new Uint16Array(CW * CH * MAX_FACTIONS);
  private cellTotal = new Uint16Array(CW * CH);
  private battle = new Map<number, { deaths: number; factions: Set<number> }>();
  private wars = new Map<number, { deaths: number; factions: Set<number>; start: number }>();

  constructor(seed: number, age: number) {
    this.age = age;
    this.map = generateMap(seed);
    const ns = this.map.settlements.length;
    this.owner = Int8Array.from(this.map.settlements.map(s => s.kingdom));
    this.garrison = new Uint16Array(ns);
    this.siege = new Float32Array(ns);
    this.siegeBy = new Int8Array(ns).fill(-1);
    this.contested = new Uint8Array(ns);
    this.fields = new FieldCache(this.map.cost, id => this.map.settlements[id].tile, ns + 16);
    this.names = new NameGen(mulberry32(seed ^ 0x5eed + age));
    this.kingdoms = this.map.kingdoms.map((k, i) => ({
      alive: true,
      capital: k.capital,
      thinking: false,
      lastThought: '',
      lastDecrees: [],
      reign: [],
      turns: [],
      lastCouncil: 0,
      nextCouncil: HOURS_PER_DAY * (3 + i * 2),
    }));
  }

  /** Give every realm a starting garrison and one army so the first year isn't empty. */
  populate() {
    for (const s of this.map.settlements) {
      const n = Math.floor(this.garrisonCap(s.id) * 0.6);
      for (let i = 0; i < n; i++) this.spawn(s.id);
    }
    this.log(-1, [], `The Age ${roman(this.age)} begins. ${this.map.kingdoms.length} crowns claim the continent.`);
    for (const k of this.map.kingdoms) this.muster(k.capital, k.id, 0.7);
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

  // ---------------------------------------------------------------- soldiers

  private spawn(home: number): number {
    const s = this.map.settlements[home];
    let i: number;
    if (this.free.length) i = this.free.pop()!;
    else if (this.high < SOLDIER_CAP) i = this.high++;
    else return -1;
    for (let tries = 0; tries < 10; tries++) {
      const x = s.x + 0.5 + (Math.random() - 0.5) * 6;
      const y = s.y + 0.5 + (Math.random() - 0.5) * 6;
      if (this.passable(x, y)) { this.sx[i] = x; this.sy[i] = y; break; }
      this.sx[i] = s.x + 0.5; this.sy[i] = s.y + 0.5;
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
    return Math.floor(this.kingdoms?.[this.owner[id]]?.capital === id ? cap * 2 : cap);
  }

  // ---------------------------------------------------------------- tick

  step() {
    this.tick++;
    this.deliverOrders();
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
        radius = this.owner[target] === army.faction ? 2 * (3 + Math.sqrt(army.size) * 0.45) : 3;
      } else {
        target = this.sHome[i];
        radius = 7;
      }
      const field = getField(target);
      let x = this.sx[i], y = this.sy[i];
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
    const cells = this.cells, total = this.cellTotal;
    cells.fill(0);
    total.fill(0);
    for (let i = 0; i < this.high; i++) {
      const f = this.sf[i];
      if (f === DEAD) continue;
      const c = ((this.sy[i] / CELL) | 0) * CW + ((this.sx[i] / CELL) | 0);
      cells[c * MAX_FACTIONS + f]++;
      total[c]++;
    }
    const { terrain, region } = this.map;
    for (let i = 0; i < this.high; i++) {
      const f = this.sf[i];
      if (f === DEAD) continue;
      const c = ((this.sy[i] / CELL) | 0) * CW + ((this.sx[i] / CELL) | 0);
      const own = cells[c * MAX_FACTIONS + f];
      const enemy = total[c] - own;
      const tile = (this.sy[i] | 0) * MAP_W + (this.sx[i] | 0);
      if (enemy > 0) {
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
      const r = region[tile];
      if (r !== NO_REGION && this.owner[r] !== f && Math.random() < ATTRITION) this.kill(i);
    }
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
          for (let f = 0; f < this.kingdoms.length; f++) counts[f] += this.cells[c + f];
        }
      }
      let top = -1, topN = 0;
      for (let f = 0; f < this.kingdoms.length; f++) {
        if (f !== own && counts[f] > topN) { topN = counts[f]; top = f; }
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
    // The old garrison scatters
    for (let i = 0; i < this.high; i++) {
      if (this.sf[i] !== DEAD && this.sArmy[i] < 0 && this.sHome[i] === id) this.kill(i);
    }
    this.owner[id] = by;
    this.siege[id] = 0;
    this.siegeBy[id] = -1;
    const byName = this.map.kingdoms[by].name, prevName = this.map.kingdoms[prev].name;
    const wasCapital = this.kingdoms[prev].capital === id;
    this.log(by, [by, prev], wasCapital
      ? `${s.name}, seat of the ${prevName}, falls to the ${byName}!`
      : `The ${byName} takes ${s.name} from the ${prevName}.`);

    for (const a of this.armies.values()) {
      if (a.faction === by && a.target === id) a.order = 'hold';
    }
    if (wasCapital) this.relocateCourt(prev);
  }

  private relocateCourt(k: number) {
    let best = -1, bestG = -1;
    for (const s of this.map.settlements) {
      if (this.owner[s.id] === k && this.garrison[s.id] > bestG) { bestG = this.garrison[s.id]; best = s.id; }
    }
    if (best < 0) return;
    this.kingdoms[k].capital = best;
    this.log(k, [k], `The court of ${this.map.kingdoms[k].king} flees to ${this.map.settlements[best].name}.`);
  }

  private updateArmies() {
    const last = new Map<number, [number, number]>();
    for (const a of this.armies.values()) { last.set(a.id, [a.cx, a.cy]); a.size = 0; a.cx = 0; a.cy = 0; }
    for (let i = 0; i < this.high; i++) {
      if (this.sf[i] === DEAD || this.sArmy[i] < 0) continue;
      const a = this.armies.get(this.sArmy[i])!;
      a.size++; a.cx += this.sx[i]; a.cy += this.sy[i];
    }
    for (const a of [...this.armies.values()]) {
      if (a.size === 0) {
        [a.cx, a.cy] = last.get(a.id)!;
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

  private daily() {
    // Recruitment
    for (const s of this.map.settlements) {
      const k = this.owner[s.id];
      if (k < 0 || !this.kingdoms[k].alive || this.contested[s.id]) continue;
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

    // Battles: accumulate by nearest settlement, chronicle them once they end
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
      const who = fs.map(f => `the ${this.map.kingdoms[f].name}`).join(' and ');
      this.log(-1, fs, `The Battle of ${this.map.settlements[at].name}: ${days} day${days > 1 ? 's' : ''} of fighting between ${who}. ${w.deaths} fall.`);
    }
    this.battle.clear();

    // Fallen realms
    for (const k of this.map.kingdoms) {
      const st = this.kingdoms[k.id];
      if (!st.alive) continue;
      let held = 0;
      for (let s = 0; s < this.owner.length; s++) if (this.owner[s] === k.id) held++;
      if (held > 0) continue;
      st.alive = false;
      for (let i = 0; i < this.high; i++) if (this.sf[i] === k.id) this.kill(i);
      for (const a of [...this.armies.values()]) if (a.faction === k.id) this.armies.delete(a.id);
      this.log(k.id, [k.id], `The ${k.name} is no more. ${k.king} is lost to history.`);
    }

    const living = this.kingdoms.filter(k => k.alive).length;
    if (living <= 1 && this.endsAt < 0) {
      const w = this.map.kingdoms.find((_, i) => this.kingdoms[i].alive);
      this.log(-1, [], w
        ? `${w.king} of the ${w.name} rules the whole continent. The Age ${roman(this.age)} draws to a close.`
        : `The continent lies empty. The Age ${roman(this.age)} ends.`);
      this.endsAt = this.tick + HOURS_PER_DAY * 12;
    }
  }

  // ---------------------------------------------------------------- orders

  /** Queue a royal command. It travels from the capital by courier. */
  issue(order: Omit<Order, 'arrives'>) {
    const cap = this.map.settlements[this.kingdoms[order.kingdom].capital];
    let tx = cap.x, ty = cap.y;
    if (order.army !== undefined) {
      const a = this.armies.get(order.army);
      if (a) { tx = a.cx; ty = a.cy; }
    } else if (order.settlement !== undefined) {
      const s = this.map.settlements[order.settlement];
      tx = s.x; ty = s.y;
    }
    const days = Math.hypot(tx - cap.x, ty - cap.y) / COURIER_SPEED;
    this.orders.push({ ...order, arrives: this.tick + Math.max(1, Math.round(days * HOURS_PER_DAY)) });
  }

  private deliverOrders() {
    if (!this.orders.length) return;
    const due = this.orders.filter(o => o.arrives <= this.tick);
    if (!due.length) return;
    this.orders = this.orders.filter(o => o.arrives > this.tick);
    for (const o of due) {
      if (!this.kingdoms[o.kingdom].alive) continue;
      if (o.kind === 'muster') {
        const s = o.settlement!;
        if (this.owner[s] !== o.kingdom) continue;
        const a = this.muster(s, o.kingdom, 0.8);
        if (!a) this.log(o.kingdom, [o.kingdom], `The steward of ${this.map.settlements[s].name} has too few men to raise a host.`);
        continue;
      }
      const a = this.armies.get(o.army!);
      if (!a) continue;
      if (o.kind === 'hold') {
        a.target = this.nearestOwned(a.cx, a.cy, a.faction) ?? a.target;
        a.order = 'hold';
        continue;
      }
      // March: the hands don't always do as told
      const target = o.target!;
      const r = Math.random();
      const obey = 0.72 + a.loyalty * 0.2;
      const tName = this.map.settlements[target].name;
      if (r < obey) {
        a.target = target;
        a.order = 'march';
      } else if (r < obey + (1 - obey) * 0.55) {
        const nbrs = this.map.settlements[target].neighbors;
        const wrong = nbrs[Math.floor(Math.random() * nbrs.length)] ?? target;
        a.target = wrong;
        a.order = 'march';
        this.log(a.faction, [a.faction], `General ${a.general} misreads the royal seal and marches on ${this.map.settlements[wrong].name} instead of ${tName}.`);
      } else {
        this.log(a.faction, [a.faction], `General ${a.general} ignores the command to march on ${tName}.`);
      }
    }
  }

  muster(settlement: number, kingdom: number, share: number): Army | null {
    const mine = [...this.armies.values()].filter(a => a.faction === kingdom).length;
    if (mine >= MAX_ARMIES || this.garrison[settlement] < 20) return null;
    const take = Math.floor(this.garrison[settlement] * share);
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
    army.size = army.peak = moved;
    this.log(kingdom, [kingdom], `General ${army.general} raises a host of ${moved} at ${s.name}.`);
    return army;
  }

  // ---------------------------------------------------------------- queries

  log(faction: number, involves: number[], text: string) {
    this.chronicle.push({ tick: this.tick, text, faction, involves });
    if (this.chronicle.length > 400) this.chronicle.splice(0, this.chronicle.length - 400);
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
    return { id: a.id, faction: a.faction, general: a.general, size: a.size, x: a.cx, y: a.cy, target: a.target, order: a.order };
  }

  view(stalledBy: string | null, brains: ('qwen' | 'script')[]): StateResponse {
    const counts = new Array(this.kingdoms.length).fill(0);
    for (let i = 0; i < this.high; i++) if (this.sf[i] !== DEAD) counts[this.sf[i]]++;
    return {
      tick: this.tick,
      date: formatDate(this.tick),
      age: this.age,
      stalledBy,
      kingdoms: this.map.kingdoms.map((k, i) => {
        const st = this.kingdoms[i];
        return {
          id: i,
          name: k.name,
          color: k.color,
          king: k.king,
          temperament: k.temperament,
          brain: brains[i] ?? 'script',
          alive: st.alive,
          thinking: st.thinking,
          lastThought: st.lastThought,
          lastDecrees: st.lastDecrees,
          reign: st.reign.slice(-8),

          settlements: Array.from(this.owner).filter(o => o === i).length,
          soldiers: counts[i],
        };
      }),
      settlements: this.map.settlements.map(s => ({
        id: s.id, owner: this.owner[s.id], garrison: this.garrison[s.id], siege: this.siege[s.id],
      })),
      armies: [...this.armies.values()].map(a => this.armyView(a)),
      chronicle: this.chronicle.slice(-80).map(({ tick, text, faction }) => ({ tick, text, faction })),
    };
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

export function roman(n: number): string {
  const map: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out || 'I';
}

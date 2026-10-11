// The world: board, cells, warriors, and the tick loop. Pure logic, no DOM, so it runs
// the same in the browser viewer and the headless runner.
//
// Core rules (see docs/journal.md for why):
// - A warrior is a 4-connected cloud of cells it owns; each cell holds one glyph.
// - One IP per warrior. It runs only its own cells. It advances to the next own cell
//   in its direction, skipping gaps, and wraps to the far end of its body on that
//   row/column. It rides on its cell: if the cell moves, the IP moves with it.
// - All coordinates in instructions are relative to the warrior's body frame: an origin
//   that starts at the IP's start cell and moves with SHIFT.
// - The IP is hidden from other warriors. Losing the IP's cell, or executing `@`, kills.
// - Pieces cut off from the IP's piece become debris.
// - Max size decays all the way to 0 (slower the smaller it is) and speed toward a floor;
//   resources push them back up. A body whose max size falls below 1 starves.
// - Last standing wins; at the tick cap, the biggest body (most cells) wins.
import { Board, FLOOR, makeBoard, makePlate } from './board';
import {
  CODE, COST, DX, DY, GLYPHS, T_DEBRIS, T_ENEMY, T_NOTHING, T_RESOURCE, T_SIZE, T_SPEED, T_WALL,
} from './glyphs';
import { makeRng, Rng } from './rng';
import { WarriorSpec } from './warrior-file';

export const NONE = -1;
const K = CODE['K'];
export const DEBRIS = -2;

export const CONFIG = {
  sight: 14,            // LoS range from each cell (Chebyshev)
  bombRange: 6,         // BOMB reach from the cell that sees the target
  writeRange: 2,        // WRITE reach into foreign cells, from the cell that sees the target
  killPay: 0.25,        // a killer takes this fraction of the victim's max size and speed
  creditWindow: 500,    // a death within this many ticks of being harmed credits the harmer
  stackMax: 64,
  sizeCap: 64,
  startSize: 40,        // every warrior starts with this max size (the most cells its body may have)
  startCells: 30,       // a warrior file holds at most this many cells: the rest of max size is room to GROW
  sizeDecay: 0.004,     // per tick at the starting max size; scales with √(max size / startSize), so
                        // 40→8 takes ~11000 ticks and 8→starved another ~6000 (~17000 from 40)
  divideMin: 16,        // DIVIDE needs at least this max size (and 2× its cells)
  sizePickup: 4,
  debrisPickup: 0.5,
  speedStart: 2,
  speedFloor: 1,
  speedCap: 8,
  speedDecay: 0.001,    // per tick
  speedPickup: 1,
  spawnInterval: 120,   // ticks between respawns at an empty spot
  tickCap: 5000,
  copyError: 0.02,      // DIVIDE: chance each copied cell becomes a random glyph
  maxWarriors: 64,      // DIVIDE fails while this many warriors are alive
  reaperCap: 0,         // petri dish: with this many alive, a birth kills the oldest living warrior (0 = off)
  lifespan: 0,          // petri dish: typical lifespan in ticks; each warrior's is 50–150% of it (0 = off)
  endless: false,       // petri dish: don't end when one lineage is left (only the tick cap ends it)
  plate: 0,             // petri dish: board is a round plate this many cells across (0 = rooms board)
  plateBands: 5,        // plate: toxin levels, clean middle (0) to rim (bands-1)
  plateFood: 5,         // plate: about one food spot per this many cells squared
  toxinRate: 0.001,     // plate: each tick, a cell one toxin level above my armor (K count) dies with this chance…
  toxinStep: 10,        // …and each further level multiplies it by this (MEGA-plate bands were 10× steps)
  foodRipen: 0,         // petri dish: an uneaten size pickup grows by one pickup's worth every this many ticks (0 = off)…
  foodRipeMax: 5,       // …up to this many pickups' worth
  copyInsert: 0,        // DIVIDE: chance the child gains a fat cell (.) stuck to its body
  copyDelete: 0,        // DIVIDE: chance the child loses one cell (never its IP cell; stays connected)
};

export interface Warrior {
  id: number;
  lineage: number; // the founder's id. Decides who won and who gets scored; in play, kin are rivals like anyone else
  gen: number;    // 0 for founders, parent's + 1 for children of DIVIDE
  parent?: number;
  born: number;   // tick of birth (0 for founders)
  diesAt?: number; // petri dish: death of old age (lifespan drawn at birth, 50–150% of CONFIG.lifespan)
  name: string;
  alive: boolean;
  ipX: number;
  ipY: number;
  // Body-frame origin: instruction offsets are relative to this point. It starts at the
  // IP's start cell and moves only with SHIFT, so a SCAN result stays valid while the IP
  // walks on through the body.
  ox: number;
  oy: number;
  dir: number;
  stack: number[];
  maxSize: number;
  speed: number;
  accum: number;
  lastOk: boolean;
  lastAct: string; // glyph of the last action (M F X G C B W)
  cellCount: number;
  executed: number;
  stats: {
    collected: number; bombHits: number; poisonWrites: number; kills: number;
    // Self-modification: writes into my own cells (that changed a glyph), cells grown, swaps, flows.
    selfWrites: number; grows: number; swaps: number; flows: number;
    oozes: number;
    rooms: number;    // rooms (not its start room) its whole body has been inside, each counted once
    squeezed: number; // ticks with at least half of a 4+ cell body inside narrow passages (≤ 2 wide)
  };
  lastHarm?: { by: number; t: number }; // who last bombed or wrote into me, and when
  home: { x: number; y: number; w: number; h: number }; // start room
  leftHomeAt?: number; // first tick no cell of the body was in the start room
  roomsSeen: Set<number>; // board.rooms indices its whole body has been inside (children inherit a copy)
  deathReason?: string;
  diedAt?: number;
  spec: WarriorSpec;
}

export interface WorldEvent { t: number; kind: string; text: string; who?: number }

export interface MatchResult {
  over: boolean;
  winner: number | null; // warrior id, or null for draw / not over
  reason: string;
}

export class World {
  board: Board;
  w: number;
  h: number;
  owner: Int32Array;
  code: Uint8Array;
  resource: Uint8Array; // 0 none, 1 size, 2 speed
  ripe: Float32Array;   // size pickups: how many pickups' worth (1 when it appears; grows with foodRipen)
  /** Floor cells in a passage at most 2 wide (the floor run through them, across or down, is ≤ 2). */
  narrow: Uint8Array;
  warriors: Warrior[] = [];
  /** The living warriors (a long dish has far more dead than alive). Rebuilt lazily after deaths. */
  private livingList: Warrior[] = [];
  private livingDirty = false;
  private bornIn = new Map<number, number>(); // lineage → warriors born so far (for names)
  t = 0;
  rng: Rng;
  events: WorldEvent[] = [];
  result: MatchResult = { over: false, winner: null, reason: '' };
  private spawnTimers: number[];

  constructor(public seed: number, specs: WarriorSpec[]) {
    this.board = CONFIG.plate ? makePlate(seed, CONFIG.plate, CONFIG.plateBands, CONFIG.plateFood) : makeBoard(seed);
    this.w = this.board.w;
    this.h = this.board.h;
    this.owner = new Int32Array(this.w * this.h).fill(NONE);
    this.code = new Uint8Array(this.w * this.h);
    this.resource = new Uint8Array(this.w * this.h);
    this.ripe = new Float32Array(this.w * this.h).fill(1);
    this.rng = makeRng(seed);
    this.spawnTimers = this.board.spawns.map(() => 0);
    for (const s of this.board.spawns) this.resource[s.y * this.w + s.x] = s.kind;
    this.narrow = new Uint8Array(this.w * this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!this.isFloor(x, y)) continue;
        let a = x, b = x, c = y, d = y;
        while (this.isFloor(a - 1, y)) a--;
        while (this.isFloor(b + 1, y)) b++;
        while (this.isFloor(x, c - 1)) c--;
        while (this.isFloor(x, d + 1)) d++;
        if (b - a < 2 || d - c < 2) this.narrow[this.idx(x, y)] = 1;
      }
    }
    specs.forEach((s, i) => this.place(s, i));
  }

  // ---------- setup ----------

  private place(spec: WarriorSpec, id: number) {
    if (spec.cells.length > CONFIG.startCells) {
      throw new Error(`${spec.name} has ${spec.cells.length} cells; the limit is ${CONFIG.startCells}`);
    }
    const room = this.board.starts[id % this.board.starts.length];
    const ox = room.x + Math.floor((room.w - spec.width) / 2);
    const oy = room.y + Math.floor((room.h - spec.height) / 2);
    const wr: Warrior = {
      id, lineage: id, gen: 0, born: 0, name: spec.name, alive: true, ipX: ox + spec.ip.x, ipY: oy + spec.ip.y,
      ox: ox + spec.ip.x, oy: oy + spec.ip.y, dir: spec.dir,
      stack: [], maxSize: CONFIG.startSize, speed: CONFIG.speedStart,
      accum: 0, lastOk: true, lastAct: '', cellCount: 0, executed: 0, spec,
      stats: { collected: 0, bombHits: 0, poisonWrites: 0, kills: 0, selfWrites: 0, grows: 0, swaps: 0, flows: 0, oozes: 0, squeezed: 0, rooms: 0 }, home: room, roomsSeen: new Set(),
    };
    if (CONFIG.lifespan > 0) wr.diesAt = Math.floor(CONFIG.lifespan * (0.5 + this.rng()));
    for (const c of spec.cells) {
      const x = ox + c.x, y = oy + c.y;
      if (!this.isFloor(x, y)) throw new Error(`${spec.name} does not fit in its start room`);
      const i = this.idx(x, y);
      this.setOwner(i, id);
      this.code[i] = c.code;
      this.resource[i] = 0;
      wr.cellCount++;
    }
    this.warriors.push(wr);
    this.livingList.push(wr);
    this.bornIn.set(id, 1);
  }

  /** Living warriors, in id order. */
  living(): Warrior[] {
    if (this.livingDirty) { this.livingList = this.livingList.filter((w) => w.alive); this.livingDirty = false; }
    return this.livingList;
  }

  // ---------- helpers ----------

  idx(x: number, y: number) { return y * this.w + x; }
  inBounds(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  isFloor(x: number, y: number) { return this.inBounds(x, y) && this.board.terrain[this.idx(x, y)] === FLOOR; }
  ownerAt(x: number, y: number) { return this.inBounds(x, y) ? this.owner[this.idx(x, y)] : NONE; }
  /** Floor with nothing on it: no cell, no debris, no resource. */
  isFree(x: number, y: number) {
    if (!this.isFloor(x, y)) return false;
    const i = this.idx(x, y);
    return this.owner[i] === NONE && this.resource[i] === 0;
  }

  // Cells by owner (warrior id, or DEBRIS), kept in step with `owner` by setOwner, so
  // nothing has to scan the whole board to find a warrior's cells.
  private cellSets = new Map<number, Set<number>>();
  private sortedCells = new Map<number, number[]>();

  /** The way `owner` changes (opShift does a bulk equivalent). */
  private setOwner(i: number, v: number) {
    const o = this.owner[i];
    if (o === v) return;
    if (o !== NONE) { this.cellSets.get(o)!.delete(i); this.sortedCells.delete(o); }
    this.owner[i] = v;
    if (v !== NONE) {
      let set = this.cellSets.get(v);
      if (!set) { set = new Set(); this.cellSets.set(v, set); }
      set.add(i);
      this.sortedCells.delete(v);
    }
  }

  /** A warrior's (or DEBRIS's) cells in board order. Treat the array as read-only. */
  cellsOf(id: number): number[] {
    let out = this.sortedCells.get(id);
    if (!out) {
      // Typed-array sort is numeric and native (no comparator callback).
      out = Array.from(Int32Array.from(this.cellSets.get(id) ?? []).sort());
      this.sortedCells.set(id, out);
    }
    return out;
  }

  private log(kind: string, text: string, who?: number) {
    this.events.push({ t: this.t, kind, text, who });
    if (this.events.length > 2000) this.events.splice(0, 500);
  }

  // Walls block LoS; cells don't. Bresenham, endpoints excluded.
  clearLine(x0: number, y0: number, x1: number, y1: number): boolean {
    let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, x = x0, y = y0;
    while (true) {
      if (x === x1 && y === y1) return true;
      if (!(x === x0 && y === y0) && this.board.terrain[this.idx(x, y)] !== FLOOR) return false;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }

  /** Index of one of my cells that sees (x,y) within `range`, or -1. Own cells always count as seen. */
  seer(id: number, x: number, y: number, range = CONFIG.sight, mine?: number[]): number {
    if (this.ownerAt(x, y) === id) return this.idx(x, y);
    for (const c of mine ?? this.cellsOf(id)) {
      const cx = c % this.w, cy = (c / this.w) | 0;
      if (Math.max(Math.abs(cx - x), Math.abs(cy - y)) > range) continue;
      if (this.clearLine(cx, cy, x, y)) return c;
    }
    return -1;
  }

  /** 4-connected check of a warrior's cells from its IP. Returns unreached cells. */
  private unreached(wr: Warrior): number[] {
    const mine = this.cellsOf(wr.id);
    const seen = new Set<number>();
    const start = this.idx(wr.ipX, wr.ipY);
    if (this.owner[start] !== wr.id) return mine;
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const c = queue.pop()!;
      const x = c % this.w, y = (c / this.w) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (this.ownerAt(nx, ny) !== wr.id) continue;
        const n = this.idx(nx, ny);
        if (!seen.has(n)) { seen.add(n); queue.push(n); }
      }
    }
    return mine.filter((c) => !seen.has(c));
  }

  private toDebris(i: number) {
    const o = this.owner[i];
    if (o >= 0) this.warriors[o].cellCount--;
    this.setOwner(i, DEBRIS);
  }

  private kill(wr: Warrior, reason: string) {
    if (!wr.alive) return;
    wr.alive = false;
    this.livingDirty = true;
    wr.deathReason = reason;
    wr.diedAt = this.t;
    for (const c of this.cellsOf(wr.id)) this.toDebris(c);
    this.log('death', `${wr.name} died: ${reason}`, wr.id);
    // Killing pays: whoever harmed the victim recently (bomb or write) takes a cut of
    // its max size and speed. That includes a victim that runs into poison, or breaks
    // itself after being bombed. Killing kin pays too (petri-dish relatives are rivals), but
    // only rival kills count in the stats the GA scores, so a lineage can't farm its offspring.
    const h = wr.lastHarm;
    const killer = h && this.t - h.t <= CONFIG.creditWindow ? this.warriors[h.by] : undefined;
    if (killer && killer.alive && killer !== wr) {
      if (killer.lineage !== wr.lineage) killer.stats.kills++;
      killer.maxSize = Math.min(CONFIG.sizeCap, killer.maxSize + CONFIG.killPay * wr.maxSize);
      killer.speed = Math.min(CONFIG.speedCap, killer.speed + CONFIG.killPay * wr.speed);
      this.log('kill', `${killer.name} takes a cut of ${wr.name} (max ${Math.floor(killer.maxSize)}, speed ${killer.speed.toFixed(2)})`, killer.id);
    }
  }

  /** Destroy a cell outright (bomb). Handles core loss and disconnection. */
  /** Destroy a cell outright: a bomb (`by`), or the plate's toxin (no `by`). */
  private destroy(i: number, by?: Warrior) {
    const o = this.owner[i];
    this.setOwner(i, NONE);
    this.code[i] = 0;
    if (o < 0) return;
    const victim = this.warriors[o];
    victim.cellCount--;
    if (by) victim.lastHarm = { by: by.id, t: this.t };
    if (i === this.idx(victim.ipX, victim.ipY)) {
      this.kill(victim, by ? `core bombed by ${by.name}` : 'core poisoned by the toxin');
      return;
    }
    const cut = this.unreached(victim);
    if (cut.length) {
      for (const c of cut) this.toDebris(c);
      this.log('cut', `${victim.name} lost ${cut.length} cells cut off`, victim.id);
    }
  }

  // ---------- tick ----------

  tick() {
    if (this.result.over) return;
    this.t++;

    // Respawn resources at empty spots. A spot doesn't regrow while anything sits on or
    // touches it, so camping a spawn doesn't work: you have to leave and come back.
    const spawns = this.board.spawns;
    for (let k = 0; k < spawns.length; k++) {
      const s = spawns[k];
      const i = this.idx(s.x, s.y);
      // Food left alone ripens (petri dish): picked-over ground stays poor, untouched ground
      // gets rich, so whoever first breaks into new territory feasts.
      if (CONFIG.foodRipen > 0 && this.resource[i] === 1) this.ripe[i] = Math.min(CONFIG.foodRipeMax, this.ripe[i] + 1 / CONFIG.foodRipen);
      let touched = this.resource[i] !== 0 || this.owner[i] !== NONE;
      for (let d = 0; d < 4 && !touched; d++) touched = this.ownerAt(s.x + DX[d], s.y + DY[d]) !== NONE;
      if (touched) { this.spawnTimers[k] = 0; continue; }
      if (++this.spawnTimers[k] >= CONFIG.spawnInterval) {
        this.resource[i] = s.kind;
        this.ripe[i] = 1;
        this.spawnTimers[k] = 0;
      }
    }

    // Run warriors in a rotating order so nobody always moves first.
    const order = this.living().slice();
    const n = order.length;
    for (let k = 0; k < n; k++) {
      const wr = order[(this.t + k) % n];
      if (!wr.alive) continue;
      wr.accum += wr.speed;
      while (wr.accum >= 1 && wr.alive) wr.accum -= this.step(wr);
    }

    // Upkeep: decay toward floors; shed cells if over max size.
    for (const wr of this.living().slice()) {
      if (!wr.alive) continue;
      // Whole-body measures: a tip poking into a corridor mouth is neither leaving nor squeezing.
      const cells = this.cellSets.get(wr.id);
      if (cells) {
        const hm = wr.home;
        let home = 0, narrow = 0, x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
        for (const c of cells) {
          const x = c % this.w, y = (c / this.w) | 0;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          if (x >= hm.x && y >= hm.y && x < hm.x + hm.w && y < hm.y + hm.h) home++;
          if (this.narrow[c]) narrow++;
        }
        if (wr.leftHomeAt === undefined && home === 0 && cells.size > 0) {
          wr.leftHomeAt = this.t;
          this.log('left', `${wr.name} left its start room (whole body)`, wr.id);
        }
        if (cells.size >= 4 && 2 * narrow >= cells.size) wr.stats.squeezed++;
        if (home === 0) {
          this.board.rooms.forEach((r, k) => {
            if (x0 < r.x || y0 < r.y || x1 >= r.x + r.w || y1 >= r.y + r.h || wr.roomsSeen.has(k)) return;
            if (r.x === hm.x && r.y === hm.y) return;
            wr.roomsSeen.add(k);
            wr.stats.rooms++;
            this.log('room', `${wr.name} moved its whole body into another room`, wr.id);
          });
        }
      }
      // Plate toxin: each cell on a level above my armor (my K cells) may die.
      const tox = this.board.toxin;
      if (tox && cells) {
        let armor = 0;
        for (const c of cells) if (this.code[c] === K) armor++;
        const doomed: number[] = [];
        for (const c of cells) { const over = tox[c] - armor; if (over > 0 && this.rng() < CONFIG.toxinRate * CONFIG.toxinStep ** (over - 1)) doomed.push(c); }
        for (const c of doomed) { if (!wr.alive) break; if (this.owner[c] === wr.id) this.destroy(c); }
        if (!wr.alive) continue;
      }
      wr.maxSize = Math.max(0, wr.maxSize - CONFIG.sizeDecay * Math.sqrt(wr.maxSize / CONFIG.startSize));
      wr.speed = Math.max(CONFIG.speedFloor, wr.speed - CONFIG.speedDecay);
      if (wr.maxSize < 1) this.kill(wr, 'starved (max size fell to 0)');
      else if (wr.cellCount > Math.floor(wr.maxSize)) this.shed(wr);
      if (!wr.alive) continue;
      if (wr.cellCount <= 0) this.kill(wr, 'no cells left');
      else if (wr.diesAt !== undefined && this.t >= wr.diesAt) this.kill(wr, 'old age');
    }

    this.checkOver();
  }

  /**
   * Upkeep: lose one cell. Burn fat first: the farthest `.` (no-op) cell whose removal
   * keeps the body connected. With no fat, drop the cell farthest (by path) from the IP,
   * which can never disconnect the rest — but is usually code, so the program rots.
   */
  private shed(wr: Warrior) {
    const start = this.idx(wr.ipX, wr.ipY);
    const dist = new Map<number, number>([[start, 0]]);
    const queue = [start];
    for (let q = 0; q < queue.length; q++) {
      const c = queue[q];
      const x = c % this.w, y = (c / this.w) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (this.ownerAt(nx, ny) !== wr.id) continue;
        const ni = this.idx(nx, ny);
        if (!dist.has(ni)) { dist.set(ni, dist.get(c)! + 1); queue.push(ni); }
      }
    }
    const byFar = queue.slice(1).reverse(); // BFS order reversed = farthest first
    if (!byFar.length) return;
    let drop = byFar[0];
    for (const c of byFar) {
      if (this.code[c] !== CODE['.']) continue;
      this.setOwner(c, NONE);
      const ok = this.unreached(wr).length === 0;
      this.setOwner(c, wr.id);
      if (ok) { drop = c; break; }
    }
    // Shed cells vanish rather than becoming debris: otherwise grow → shed → collect
    // the debris is a free-size loop.
    const lost = GLYPHS[this.code[drop]] ?? '.';
    this.setOwner(drop, NONE);
    this.code[drop] = 0;
    wr.cellCount--;
    this.log('shed', `${wr.name} shed ${lost === '.' ? 'fat' : `code '${lost}'`} (max size ${Math.floor(wr.maxSize)})`, wr.id);
  }

  /** True when every living warrior is of one lineage (only possible once someone divides). */
  private oneTeamLeft(): boolean {
    let team = -1;
    for (const w of this.living()) {
      if (team === -1) team = w.lineage; else if (w.lineage !== team) return false;
    }
    return team !== -1 && this.warriors.some((w) => w.lineage !== team);
  }

  private checkOver() {
    const living = this.living().length;
    if (CONFIG.endless && this.t < CONFIG.tickCap) return;
    if (living > 1 && this.t < CONFIG.tickCap && !this.oneTeamLeft()) return; // nothing to decide
    // Lineages: each founder and everything it DIVIDEd into. Matches are won by lineages.
    const founders = this.warriors.filter((w) => w.gen === 0);
    const teams = new Map<number, Warrior[]>();
    for (const w of this.warriors) if (w.alive) teams.set(w.lineage, [...(teams.get(w.lineage) ?? []), w]);
    if (founders.length > 1 && teams.size <= 1) {
      this.result = teams.size
        ? { over: true, winner: [...teams.keys()][0], reason: 'last standing' }
        : { over: true, winner: null, reason: 'mutual destruction' };
    } else if (founders.length === 1 && teams.size === 0) {
      this.result = { over: true, winner: null, reason: 'died' };
    } else if (this.t >= CONFIG.tickCap) {
      // Bodies decide it: the lineage with the most cells on the board. Collecting only
      // raises max size (the most cells a body may have), so winning on size means both
      // feeding and GROWing into it before decay sheds it again. A lineage counts all its
      // members' cells. Ties break on max size, then speed.
      const keys = (ms: Warrior[]) => [
        ms.reduce((a, w) => a + w.cellCount, 0),
        ms.reduce((a, w) => a + w.maxSize, 0),
        ms.reduce((a, w) => a + w.speed, 0),
      ];
      const ranked = [...teams.entries()].map(([team, ms]) => ({ team, k: keys(ms) }));
      const cmp = (a: { k: number[] }, b: { k: number[] }) => {
        for (let k = 0; k < a.k.length; k++) if (Math.abs(a.k[k] - b.k[k]) >= 0.01) return b.k[k] - a.k[k];
        return 0;
      };
      ranked.sort(cmp);
      const tied = ranked.length > 1 && cmp(ranked[0], ranked[1]) === 0;
      const top = ranked[0], next = ranked[1];
      const by = !next || Math.abs(top.k[0] - next.k[0]) >= 0.01 ? `biggest body (${top.k[0]} cells)`
        : Math.abs(top.k[1] - next.k[1]) >= 0.01 ? `bodies tied, larger max size (${top.k[1].toFixed(1)})`
        : `bodies and max size tied, faster (${top.k[2].toFixed(2)})`;
      this.result = tied
        ? { over: true, winner: null, reason: 'draw at tick cap' }
        : { over: true, winner: top.team, reason: `${by} at tick cap` };
    }
    if (this.result.over) this.log('over', this.result.winner === null
      ? `Match over: ${this.result.reason}`
      : `${this.warriors[this.result.winner].name} wins: ${this.result.reason}`);
  }

  // ---------- interpreter ----------

  /** The point instruction offsets are measured from. */
  private frame(wr: Warrior): [number, number] {
    return [wr.ox, wr.oy];
  }

  private pop(wr: Warrior): number { return wr.stack.length ? wr.stack.pop()! : 0; }
  private push(wr: Warrior, v: number) {
    wr.stack.push(v | 0);
    if (wr.stack.length > CONFIG.stackMax) wr.stack.shift();
  }

  /** Move the IP to the next own cell in its direction, wrapping within the body. */
  private advance(wr: Warrior) {
    // Walk the owner grid by index along the IP's row or column.
    const { w, h, owner } = this;
    const id = wr.id, dir = wr.dir;
    const horiz = dir === 0 || dir === 2;
    const step = dir === 0 ? 1 : dir === 2 ? -1 : dir === 1 ? w : -w;
    const pos = horiz ? wr.ipX : wr.ipY;          // position along the line
    const len = horiz ? w : h;
    const fwd = dir === 0 || dir === 1;            // moving toward higher x / y
    const start = wr.ipY * w + wr.ipX;
    // Ahead of the IP, up to the board edge.
    let i = start + step;
    for (let p = pos + (fwd ? 1 : -1); fwd ? p < len : p >= 0; p += fwd ? 1 : -1, i += step) {
      if (owner[i] === id) { this.setIp(wr, i); return; }
    }
    // Wrap: from the opposite edge toward the IP.
    i = start - step * (fwd ? pos : len - 1 - pos);
    for (let p = fwd ? 0 : len - 1; p !== pos; p += fwd ? 1 : -1, i += step) {
      if (owner[i] === id) { this.setIp(wr, i); return; }
    }
  }

  private setIp(wr: Warrior, i: number) {
    wr.ipX = i % this.w;
    wr.ipY = (i / this.w) | 0;
  }

  /** Execute one instruction. Returns its cycle cost. */
  private step(wr: Warrior): number {
    const g = GLYPHS[this.code[this.idx(wr.ipX, wr.ipY)]] ?? '.';
    wr.executed++;
    let skip = false;
    let cost = COST[g] ?? 1;
    // (pop/push are called directly: closures here would allocate on every instruction.)

    switch (g) {
      case '>': wr.dir = 0; break;
      case 'v': wr.dir = 1; break;
      case '<': wr.dir = 2; break;
      case '^': wr.dir = 3; break;
      case '_': wr.dir = this.pop(wr) === 0 ? 0 : 2; break;
      case '|': wr.dir = this.pop(wr) === 0 ? 1 : 3; break;
      case '#': skip = true; break;
      case '?': wr.dir = Math.floor(this.rng() * 4); break;
      case '@': this.kill(wr, 'executed @'); return 1;
      case 'r': wr.dir = (wr.dir + 2) % 4; break;
      case '[': wr.dir = (wr.dir + 3) % 4; break;
      case ']': wr.dir = (wr.dir + 1) % 4; break;
      case ':': { const a = this.pop(wr); this.push(wr, a); this.push(wr, a); break; }
      case '\\': { const b = this.pop(wr), a = this.pop(wr); this.push(wr, b); this.push(wr, a); break; }
      case '$': this.pop(wr); break;
      case 'o': { const b = this.pop(wr), a = this.pop(wr); this.push(wr, a); this.push(wr, b); this.push(wr, a); break; }
      case '+': { const b = this.pop(wr), a = this.pop(wr); this.push(wr, a + b); break; }
      case '-': { const b = this.pop(wr), a = this.pop(wr); this.push(wr, a - b); break; }
      case '*': { const b = this.pop(wr), a = this.pop(wr); this.push(wr, a * b); break; }
      case '/': { const b = this.pop(wr), a = this.pop(wr); this.push(wr, b === 0 ? 0 : Math.trunc(a / b)); break; }
      case '%': { const b = this.pop(wr), a = this.pop(wr); this.push(wr, b === 0 ? 0 : a % b); break; }
      case '!': this.push(wr, this.pop(wr) === 0 ? 1 : 0); break;
      case '`': { const b = this.pop(wr), a = this.pop(wr); this.push(wr, a > b ? 1 : 0); break; }
      case '=': { const b = this.pop(wr), a = this.pop(wr); this.push(wr, a === b ? 1 : 0); break; }
      case "'": {
        const sx = wr.ipX, sy = wr.ipY;
        this.advance(wr);
        this.push(wr, this.code[this.idx(wr.ipX, wr.ipY)]);
        wr.ipX = sx; wr.ipY = sy;
        skip = true;
        break;
      }
      case 'y': { const n = this.pop(wr); this.push(wr, n > 0 ? Math.floor(this.rng() * n) : 0); break; }
      case 's': this.push(wr, wr.cellCount); break;
      case 'm': this.push(wr, Math.floor(wr.maxSize)); break;
      case 'f': this.push(wr, Math.floor(wr.speed * 10)); break;
      case 'd': this.push(wr, wr.dir); break;
      case 'e': this.push(wr, wr.lastOk ? 1 : 0); break;
      case 'L': this.opLook(wr); break;
      case 'S': this.opScan(wr); break;
      case 'R': this.opRead(wr); break;
      case 'T': {
        const dy = this.pop(wr), dx = this.pop(wr);
        if (dx === 0 && dy === 0) this.push(wr, Math.floor(this.rng() * 4));
        else if (Math.abs(dx) >= Math.abs(dy)) this.push(wr, dx > 0 ? 0 : 2);
        else this.push(wr, dy > 0 ? 1 : 3);
        break;
      }
      case 'M': wr.lastOk = this.opShift(wr, this.pop(wr)); break;
      case 'A': wr.lastOk = this.opOoze(wr, this.pop(wr)); break;
      case 'F': { const d = this.pop(wr), dy = this.pop(wr), dx = this.pop(wr); wr.lastOk = this.opFlow(wr, dx, dy, d); break; }
      case 'X': {
        const dy2 = this.pop(wr), dx2 = this.pop(wr), dy1 = this.pop(wr), dx1 = this.pop(wr);
        wr.lastOk = this.opSwap(wr, dx1, dy1, dx2, dy2);
        break;
      }
      case 'G': wr.lastOk = this.opGrow(wr, this.pop(wr)); break;
      case 'C': wr.lastOk = this.opCollect(wr); break;
      case 'B': { const dy = this.pop(wr), dx = this.pop(wr); wr.lastOk = this.opBomb(wr, dx, dy); break; }
      case 'W': { const c = this.pop(wr), dy = this.pop(wr), dx = this.pop(wr); wr.lastOk = this.opWrite(wr, dx, dy, c); break; }
      // Copying costs a cycle per cell; a failed attempt costs 1.
      case 'D': { const before = wr.cellCount; wr.lastOk = this.opDivide(wr, this.pop(wr)); cost = wr.lastOk ? Math.max(1, before) : 1; break; }
      default:
        if (g >= '0' && g <= '9') this.push(wr, g.charCodeAt(0) - 48);
        break;
    }
    if ('MFXGCBWDA'.includes(g)) wr.lastAct = g;
    if (!wr.alive) return cost;
    this.advance(wr);
    if (skip) this.advance(wr);
    return cost;
  }

  // ---------- sensing ----------

  private classify(x: number, y: number, me: number): number {
    if (!this.isFloor(x, y)) return T_WALL;
    const i = this.idx(x, y);
    const o = this.owner[i];
    if (o === DEBRIS) return T_DEBRIS;
    if (o >= 0 && o !== me) return T_ENEMY; // kin included: copies are rivals like anyone else
    if (this.resource[i] === 1) return T_SIZE;
    if (this.resource[i] === 2) return T_SPEED;
    return T_NOTHING;
  }

  private opLook(wr: Warrior) {
    const d = ((this.pop(wr) % 4) + 4) % 4;
    let x = wr.ipX, y = wr.ipY;
    for (let dist = 1; dist <= CONFIG.sight; dist++) {
      x += DX[d]; y += DY[d];
      if (this.ownerAt(x, y) === wr.id) continue;
      const t = this.classify(x, y, wr.id);
      if (t !== T_NOTHING) { this.push(wr, dist); this.push(wr, t); return; }
    }
    this.push(wr, 0);
    this.push(wr, T_NOTHING);
  }

  private opScan(wr: Warrior) {
    const type = this.pop(wr);
    const mine = this.cellsOf(wr.id);
    const r = CONFIG.sight;
    const [fx, fy] = this.frame(wr);
    // Candidates come from where such things can be (other warriors' cells, debris,
    // spawn points), limited to a window around the IP, nearest the frame origin first,
    // ties in board order.
    const x0 = Math.max(0, wr.ipX - r - 16), x1 = Math.min(this.w - 1, wr.ipX + r + 16);
    const y0 = Math.max(0, wr.ipY - r - 16), y1 = Math.min(this.h - 1, wr.ipY + r + 16);
    const cands: [number, number, number, number][] = []; // dist, index, x, y
    const consider = (i: number) => {
      const x = i % this.w, y = (i / this.w) | 0;
      if (x < x0 || x > x1 || y < y0 || y > y1) return;
      const t = this.classify(x, y, wr.id);
      const match = type === T_RESOURCE ? (t === T_SIZE || t === T_SPEED) : t === type;
      if (!match || t === T_WALL || t === T_NOTHING) return;
      cands.push([Math.abs(x - fx) + Math.abs(y - fy), i, x, y]);
    };
    if (type === T_ENEMY) {
      for (const other of this.living()) if (other.id !== wr.id) for (const i of this.cellSets.get(other.id) ?? []) consider(i);
    } else if (type === T_DEBRIS) {
      for (const i of this.cellSets.get(DEBRIS) ?? []) consider(i);
    } else if (type === T_SIZE || type === T_SPEED || type === T_RESOURCE) {
      for (const sp of this.board.spawns) consider(this.idx(sp.x, sp.y));
    }
    cands.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [, , x, y] of cands) {
      if (this.seer(wr.id, x, y, r, mine) >= 0) {
        this.push(wr, x - fx);
        this.push(wr, y - fy);
        this.push(wr, 1);
        return;
      }
    }
    this.push(wr, 0); this.push(wr, 0); this.push(wr, 0);
  }

  private opRead(wr: Warrior) {
    const dy = this.pop(wr), dx = this.pop(wr);
    const [fx, fy] = this.frame(wr);
    const x = fx + dx, y = fy + dy;
    if (!this.inBounds(x, y) || this.owner[this.idx(x, y)] === NONE || this.seer(wr.id, x, y) < 0) {
      this.push(wr, -1);
      return;
    }
    this.push(wr, this.code[this.idx(x, y)]);
  }

  // ---------- actions ----------

  private opShift(wr: Warrior, d: number): boolean {
    d = ((d % 4) + 4) % 4;
    const mine = this.cellsOf(wr.id);
    for (const c of mine) {
      const nx = (c % this.w) + DX[d], ny = ((c / this.w) | 0) + DY[d];
      if (this.ownerAt(nx, ny) === wr.id) continue;
      if (!this.isFree(nx, ny)) return false;
    }
    // Bulk move, bypassing setOwner: every destination was free or mine, so no other
    // owner's cells change, and a translation keeps board order, so the moved list is
    // still sorted.
    const codes = mine.map((c) => this.code[c]);
    for (const c of mine) { this.owner[c] = NONE; this.code[c] = 0; }
    const delta = DY[d] * this.w + DX[d];
    const moved = mine.map((c) => c + delta);
    for (let k = 0; k < moved.length; k++) {
      this.owner[moved[k]] = wr.id;
      this.code[moved[k]] = codes[k];
    }
    this.cellSets.set(wr.id, new Set(moved));
    this.sortedCells.set(wr.id, moved);
    wr.ipX += DX[d];
    wr.ipY += DY[d];
    wr.ox += DX[d];
    wr.oy += DY[d];
    return true;
  }

  /**
   * OOZE: amoeboid movement, one cell at a time. My rearmost cell (least far along d) that
   * can leave without splitting the body moves, code and all, to the free floor touching
   * the rest of the body that is farthest along d (ties: nearest my body's middle across
   * d). It must end up farther along d than it was. Repeated, a body pours itself through
   * any gap, its program rearranged on the way. The IP and the frame origin ride the cell
   * under them.
   */
  private opOoze(wr: Warrior, d: number): boolean {
    d = ((d % 4) + 4) % 4;
    const id = wr.id, w = this.w;
    const mine = this.cellsOf(id);
    if (mine.length < 2) return this.opShift(wr, d);
    const along = (c: number) => (c % w) * DX[d] + ((c / w) | 0) * DY[d];
    const across = (c: number) => (c % w) * DY[d] - ((c / w) | 0) * DX[d];
    let mid = 0;
    for (const c of mine) mid += across(c);
    mid /= mine.length;
    // Sources, rearmost first.
    const order = mine.slice().sort((a, b) => along(a) - along(b) || a - b);
    const mineSet = this.cellSets.get(id)!;
    for (const src of order) {
      // The rest must stay connected without src.
      const rest = mine.length - 1;
      const start = mine[0] === src ? mine[1] : mine[0];
      const seen = new Set([start]);
      const queue = [start];
      while (queue.length) {
        const c = queue.pop()!;
        const x = c % w, y = (c / w) | 0;
        for (let k = 0; k < 4; k++) {
          const nx = x + DX[k], ny = y + DY[k];
          if (!this.inBounds(nx, ny)) continue;
          const n = ny * w + nx;
          if (n !== src && mineSet.has(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
        }
      }
      if (seen.size !== rest) continue;
      // Destination: free floor touching the rest, farthest along d.
      let best = -1, bestAlong = along(src), bestAcross = Infinity;
      for (const c of mine) {
        if (c === src) continue;
        const x = c % w, y = (c / w) | 0;
        for (let k = 0; k < 4; k++) {
          const nx = x + DX[k], ny = y + DY[k];
          if (!this.isFree(nx, ny)) continue;
          const t = ny * w + nx;
          const a = along(t), off = Math.abs(across(t) - mid);
          if (a > bestAlong || (a === bestAlong && best >= 0 && (off < bestAcross || (off === bestAcross && t < best)))) {
            if (a > along(src)) { best = t; bestAlong = a; bestAcross = off; }
          }
        }
      }
      if (best < 0) return false; // the rearmost movable cell has nowhere ahead to go
      this.setOwner(best, id); this.code[best] = this.code[src];
      this.setOwner(src, NONE); this.code[src] = 0;
      const bx = best % w, by = (best / w) | 0, sx = src % w, sy = (src / w) | 0;
      if (wr.ipX === sx && wr.ipY === sy) { wr.ipX = bx; wr.ipY = by; }
      if (wr.ox === sx && wr.oy === sy) { wr.ox = bx; wr.oy = by; }
      wr.stats.oozes++;
      return true;
    }
    return false;
  }

  private opFlow(wr: Warrior, dx: number, dy: number, d: number): boolean {
    d = ((d % 4) + 4) % 4;
    const [fx, fy] = this.frame(wr);
    const x = fx + dx, y = fy + dy;
    const nx = x + DX[d], ny = y + DY[d];
    if (this.ownerAt(x, y) !== wr.id || !this.isFree(nx, ny)) return false;
    const from = this.idx(x, y), to = this.idx(nx, ny);
    const isIp = x === wr.ipX && y === wr.ipY;
    this.setOwner(to, wr.id); this.code[to] = this.code[from];
    this.setOwner(from, NONE); this.code[from] = 0;
    if (isIp) { wr.ipX = nx; wr.ipY = ny; }
    if (this.unreached(wr).length) {
      // Would disconnect: undo.
      this.setOwner(from, wr.id); this.code[from] = this.code[to];
      this.setOwner(to, NONE); this.code[to] = 0;
      if (isIp) { wr.ipX = x; wr.ipY = y; }
      return false;
    }
    wr.stats.flows++;
    return true;
  }

  private opSwap(wr: Warrior, dx1: number, dy1: number, dx2: number, dy2: number): boolean {
    const [fx, fy] = this.frame(wr);
    const a = [fx + dx1, fy + dy1], b = [fx + dx2, fy + dy2];
    if (this.ownerAt(a[0], a[1]) !== wr.id || this.ownerAt(b[0], b[1]) !== wr.id) return false;
    const ia = this.idx(a[0], a[1]), ib = this.idx(b[0], b[1]);
    if (this.code[ia] !== this.code[ib]) wr.stats.swaps++;
    [this.code[ia], this.code[ib]] = [this.code[ib], this.code[ia]];
    return true;
  }

  /** Fat only: growth is size (and a buffer that sheds first), never new code to run into. */
  private opGrow(wr: Warrior, d: number): boolean {
    d = ((d % 4) + 4) % 4;
    if (wr.cellCount >= Math.floor(wr.maxSize)) return false;
    let x = wr.ipX, y = wr.ipY;
    while (this.ownerAt(x, y) === wr.id) { x += DX[d]; y += DY[d]; }
    if (!this.isFree(x, y)) return false;
    const i = this.idx(x, y);
    this.setOwner(i, wr.id);
    this.code[i] = CODE['.'];
    wr.cellCount++;
    wr.stats.grows++;
    return true;
  }

  private opCollect(wr: Warrior): boolean {
    let got = false;
    for (const c of this.cellsOf(wr.id)) {
      const x = c % this.w, y = (c / this.w) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (!this.inBounds(nx, ny)) continue;
        const i = this.idx(nx, ny);
        if (this.resource[i] === 1) {
          wr.maxSize = Math.min(CONFIG.sizeCap, wr.maxSize + CONFIG.sizePickup * this.ripe[i]);
          this.log('collect', `${wr.name} took size (max ${Math.floor(wr.maxSize)})`, wr.id);
        } else if (this.resource[i] === 2) {
          wr.speed = Math.min(CONFIG.speedCap, wr.speed + CONFIG.speedPickup);
          this.log('collect', `${wr.name} took speed (${wr.speed.toFixed(2)})`, wr.id);
        } else if (this.owner[i] === DEBRIS) {
          wr.maxSize = Math.min(CONFIG.sizeCap, wr.maxSize + CONFIG.debrisPickup);
          this.setOwner(i, NONE);
          this.code[i] = 0;
          got = true;
          continue;
        } else continue;
        this.resource[i] = 0;
        wr.stats.collected++;
        got = true;
      }
    }
    return got;
  }

  private opBomb(wr: Warrior, dx: number, dy: number): boolean {
    const [fx, fy] = this.frame(wr);
    const x = fx + dx, y = fy + dy;
    const o = this.ownerAt(x, y);
    if (o === NONE || o === wr.id) return false;
    if (this.seer(wr.id, x, y, CONFIG.bombRange) < 0) return false;
    const victim = o >= 0 ? this.warriors[o].name : 'debris';
    if (o >= 0 && this.warriors[o].lineage !== wr.lineage) wr.stats.bombHits++; // hits on kin earn nothing
    this.destroy(this.idx(x, y), wr);
    this.log('bomb', `${wr.name} bombed ${victim}`, wr.id);
    return true;
  }

  /**
   * DIVIDE: copy my whole body beyond itself in direction d, as a new warrior of my lineage
   * (a rival like any other in play).
   * Needs max size ≥ 2× my cells (and ≥ divideMin); parent and child each get half the
   * max size, the same speed, and a fresh stack. Each copied cell becomes a random glyph
   * with chance CONFIG.copyError: variation, so a lineage can evolve within one match.
   */
  private opDivide(wr: Warrior, d: number): boolean {
    d = ((d % 4) + 4) % 4;
    if (wr.maxSize < 2 * wr.cellCount || wr.maxSize < CONFIG.divideMin) return false;
    if (CONFIG.reaperCap > 0) {
      // Petri dish: make room by reaping the oldest living warrior (not the parent).
      const living = this.living();
      if (living.length >= CONFIG.reaperCap) {
        const oldest = living.filter((w) => w !== wr).reduce((a, w) => (w.born < a.born ? w : a));
        this.kill(oldest, 'reaped (oldest)');
      }
    } else if (this.living().length >= CONFIG.maxWarriors) return false;
    const mine = this.cellsOf(wr.id);
    const xs = mine.map((c) => c % this.w), ys = mine.map((c) => (c / this.w) | 0);
    const bw = Math.max(...xs) - Math.min(...xs) + 1, bh = Math.max(...ys) - Math.min(...ys) + 1;
    const ox = DX[d] * (bw + 1), oy = DY[d] * (bh + 1); // one cell of gap beyond my body
    for (let k = 0; k < mine.length; k++) if (!this.isFree(xs[k] + ox, ys[k] + oy)) return false;
    // No copying through walls: the straight line from each cell to its copy must be open
    // floor, so a child is born in space its parent could reach, never in the next room over.
    const steps = Math.abs(ox) + Math.abs(oy);
    for (let k = 0; k < mine.length; k++) {
      for (let s = 1; s < steps; s++) if (this.board.terrain[this.idx(xs[k] + DX[d] * s, ys[k] + DY[d] * s)] !== FLOOR) return false;
    }
    const id = this.warriors.length;
    const founder = this.warriors[wr.lineage];
    const born = this.bornIn.get(wr.lineage) ?? 1;
    this.bornIn.set(wr.lineage, born + 1);
    const child: Warrior = {
      id, lineage: wr.lineage, gen: wr.gen + 1, parent: wr.id, born: this.t, name: `${founder.name}·${born}`, alive: true,
      ipX: wr.ipX + ox, ipY: wr.ipY + oy, ox: wr.ox + ox, oy: wr.oy + oy, dir: wr.dir,
      stack: [], maxSize: wr.maxSize / 2, speed: wr.speed, accum: 0, lastOk: true, lastAct: '',
      cellCount: 0, executed: 0, spec: wr.spec, home: wr.home, roomsSeen: new Set(wr.roomsSeen),
      stats: { collected: 0, bombHits: 0, poisonWrites: 0, kills: 0, selfWrites: 0, grows: 0, swaps: 0, flows: 0, oozes: 0, squeezed: 0, rooms: 0 },
    };
    if (CONFIG.lifespan > 0) child.diesAt = this.t + Math.floor(CONFIG.lifespan * (0.5 + this.rng()));
    // The room a child is born in isn't one it travelled to: no "entered another room" for it.
    const cx0 = Math.min(...xs) + ox, cx1 = Math.max(...xs) + ox, cy0 = Math.min(...ys) + oy, cy1 = Math.max(...ys) + oy;
    this.board.rooms.forEach((r, k) => {
      if (cx0 >= r.x && cy0 >= r.y && cx1 < r.x + r.w && cy1 < r.y + r.h) child.roomsSeen.add(k);
    });
    this.warriors.push(child);
    this.livingList.push(child);
    let mutations = 0;
    for (let k = 0; k < mine.length; k++) {
      const i = this.idx(xs[k] + ox, ys[k] + oy);
      let code = this.code[mine[k]];
      if (this.rng() < CONFIG.copyError) { code = Math.floor(this.rng() * GLYPHS.length); mutations++; }
      this.setOwner(i, id);
      this.code[i] = code;
      child.cellCount++;
    }
    // Size mutations (Tierra-style): gain a fat cell stuck to the body, or lose a cell. Fat
    // is neutral, so later copy errors can turn it into something (armor, say).
    if (CONFIG.copyInsert > 0 && this.rng() < CONFIG.copyInsert) {
      const kids = this.cellsOf(id);
      const c = kids[Math.floor(this.rng() * kids.length)], d2 = Math.floor(this.rng() * 4);
      const nx = (c % this.w) + DX[d2], ny = ((c / this.w) | 0) + DY[d2];
      if (this.isFree(nx, ny)) {
        const i = this.idx(nx, ny);
        this.setOwner(i, id);
        this.code[i] = CODE['.'];
        child.cellCount++;
        mutations++;
      }
    }
    if (CONFIG.copyDelete > 0 && child.cellCount > 1 && this.rng() < CONFIG.copyDelete) {
      const ip = this.idx(child.ipX, child.ipY);
      const kids = this.cellsOf(id).filter((c) => c !== ip);
      const c = kids[Math.floor(this.rng() * kids.length)];
      this.setOwner(c, NONE);
      if (this.unreached(child).length === 0) { this.code[c] = 0; child.cellCount--; mutations++; } else this.setOwner(c, id);
    }
    wr.maxSize /= 2;
    this.log('birth', `${wr.name} divided: ${child.name} (generation ${child.gen}${mutations ? `, ${mutations} mutation${mutations > 1 ? 's' : ''}` : ''})`, id);
    return true;
  }

  private opWrite(wr: Warrior, dx: number, dy: number, code: number): boolean {
    const [fx, fy] = this.frame(wr);
    const x = fx + dx, y = fy + dy;
    const o = this.ownerAt(x, y);
    if (o === NONE) return false;
    if (o !== wr.id) {
      // Foreign cells must be close to one of mine (and seen from it).
      if (this.seer(wr.id, x, y, CONFIG.writeRange) < 0) return false;
    }
    const c = ((code % GLYPHS.length) + GLYPHS.length) % GLYPHS.length;
    if (o === wr.id && this.code[this.idx(x, y)] !== c) wr.stats.selfWrites++;
    this.code[this.idx(x, y)] = c;
    if (o >= 0 && o !== wr.id) {
      if (c === CODE['@'] && this.warriors[o].lineage !== wr.lineage) wr.stats.poisonWrites++;
      if (o >= 0) this.warriors[o].lastHarm = { by: wr.id, t: this.t };
      this.log('write', `${wr.name} wrote '${GLYPHS[c]}' into ${this.warriors[o].name}`, wr.id);
    }
    return true;
  }
}

export { CODE };

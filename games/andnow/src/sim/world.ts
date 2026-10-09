// The world: board, cells, warriors, and the tick loop. Pure logic, no DOM, so it runs
// the same in the browser viewer and the headless runner.
//
// Core rules (see docs/journal.md for why):
// - A warrior is a 4-connected cloud of cells it owns; each cell holds one glyph.
// - One IP per warrior. It runs only its own cells. It advances to the next own cell
//   in its direction, skipping gaps, and wraps to the far end of its body on that
//   row/column. It rides on its cell: if the cell moves, the IP moves with it.
// - All coordinates in instructions are relative to the IP's cell.
// - The IP is hidden from other warriors. Losing the IP's cell, or executing `@`, kills.
// - Pieces cut off from the IP's piece become debris.
// - Max size and speed decay toward a floor; resources push them back up.
// - Last standing wins; at the tick cap, the largest max size wins.
import { Board, FLOOR, makeBoard } from './board';
import {
  CODE, COST, DX, DY, GLYPHS, T_DEBRIS, T_ENEMY, T_NOTHING, T_RESOURCE, T_SIZE, T_SPEED, T_WALL,
} from './glyphs';
import { makeRng, Rng } from './rng';
import { WarriorSpec } from './warrior-file';

export const NONE = -1;
export const DEBRIS = -2;

export const CONFIG = {
  sight: 14,            // LoS range from each cell (Chebyshev)
  bombRange: 6,         // BOMB reach from the cell that sees the target
  stackMax: 64,
  sizeFloor: 8,
  sizeCap: 64,
  startSize: 30,        // every warrior starts with this max size; bodies can't be bigger
  sizeDecay: 0.004,     // per tick
  sizePickup: 4,
  debrisPickup: 0.5,
  speedStart: 2,
  speedFloor: 1,
  speedCap: 8,
  speedDecay: 0.001,    // per tick
  speedPickup: 1,
  spawnInterval: 120,   // ticks between respawns at an empty spot
  tickCap: 5000,
};

export interface Warrior {
  id: number;
  name: string;
  alive: boolean;
  ipX: number;
  ipY: number;
  dir: number;
  stack: number[];
  maxSize: number;
  speed: number;
  accum: number;
  lastOk: boolean;
  cellCount: number;
  executed: number;
  stats: { collected: number; bombHits: number; poisonWrites: number; kills: number };
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
  owner: Int16Array;
  code: Uint8Array;
  resource: Uint8Array; // 0 none, 1 size, 2 speed
  warriors: Warrior[] = [];
  t = 0;
  rng: Rng;
  events: WorldEvent[] = [];
  result: MatchResult = { over: false, winner: null, reason: '' };
  private spawnTimers: number[];

  constructor(public seed: number, specs: WarriorSpec[]) {
    this.board = makeBoard(seed);
    this.w = this.board.w;
    this.h = this.board.h;
    this.owner = new Int16Array(this.w * this.h).fill(NONE);
    this.code = new Uint8Array(this.w * this.h);
    this.resource = new Uint8Array(this.w * this.h);
    this.rng = makeRng(seed);
    this.spawnTimers = this.board.spawns.map(() => 0);
    for (const s of this.board.spawns) this.resource[s.y * this.w + s.x] = s.kind;
    specs.forEach((s, i) => this.place(s, i));
  }

  // ---------- setup ----------

  private place(spec: WarriorSpec, id: number) {
    if (spec.cells.length > CONFIG.startSize) {
      throw new Error(`${spec.name} has ${spec.cells.length} cells; the limit is ${CONFIG.startSize}`);
    }
    const room = this.board.starts[id % this.board.starts.length];
    const ox = room.x + Math.floor((room.w - spec.width) / 2);
    const oy = room.y + Math.floor((room.h - spec.height) / 2);
    const wr: Warrior = {
      id, name: spec.name, alive: true, ipX: ox + spec.ip.x, ipY: oy + spec.ip.y, dir: spec.dir,
      stack: [], maxSize: CONFIG.startSize, speed: CONFIG.speedStart,
      accum: 0, lastOk: true, cellCount: 0, executed: 0, spec,
      stats: { collected: 0, bombHits: 0, poisonWrites: 0, kills: 0 },
    };
    for (const c of spec.cells) {
      const x = ox + c.x, y = oy + c.y;
      if (!this.isFloor(x, y)) throw new Error(`${spec.name} does not fit in its start room`);
      const i = this.idx(x, y);
      this.owner[i] = id;
      this.code[i] = c.code;
      this.resource[i] = 0;
      wr.cellCount++;
    }
    this.warriors.push(wr);
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

  cellsOf(id: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.owner.length; i++) if (this.owner[i] === id) out.push(i);
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
    this.owner[i] = DEBRIS;
  }

  private kill(wr: Warrior, reason: string) {
    if (!wr.alive) return;
    wr.alive = false;
    wr.deathReason = reason;
    wr.diedAt = this.t;
    for (const c of this.cellsOf(wr.id)) this.toDebris(c);
    this.log('death', `${wr.name} died: ${reason}`, wr.id);
  }

  /** Destroy a cell outright (bomb). Handles core loss and disconnection. */
  private destroy(i: number, by: Warrior) {
    const o = this.owner[i];
    this.owner[i] = NONE;
    this.code[i] = 0;
    if (o < 0) return;
    const victim = this.warriors[o];
    victim.cellCount--;
    if (i === this.idx(victim.ipX, victim.ipY)) {
      by.stats.kills++;
      this.kill(victim, `core bombed by ${by.name}`);
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

    // Respawn resources at empty spots.
    this.board.spawns.forEach((s, k) => {
      const i = this.idx(s.x, s.y);
      if (this.resource[i] || this.owner[i] !== NONE) { this.spawnTimers[k] = 0; return; }
      if (++this.spawnTimers[k] >= CONFIG.spawnInterval) {
        this.resource[i] = s.kind;
        this.spawnTimers[k] = 0;
      }
    });

    // Run warriors in a rotating order so nobody always moves first.
    const n = this.warriors.length;
    for (let k = 0; k < n; k++) {
      const wr = this.warriors[(this.t + k) % n];
      if (!wr.alive) continue;
      wr.accum += wr.speed;
      while (wr.accum >= 1 && wr.alive) wr.accum -= this.step(wr);
    }

    // Upkeep: decay toward floors; shed cells if over max size.
    for (const wr of this.warriors) {
      if (!wr.alive) continue;
      wr.maxSize = Math.max(CONFIG.sizeFloor, wr.maxSize - CONFIG.sizeDecay);
      wr.speed = Math.max(CONFIG.speedFloor, wr.speed - CONFIG.speedDecay);
      if (wr.cellCount > Math.floor(wr.maxSize)) this.shed(wr);
      if (wr.cellCount <= 0) this.kill(wr, 'no cells left');
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
      this.owner[c] = NONE;
      const ok = this.unreached(wr).length === 0;
      this.owner[c] = wr.id;
      if (ok) { drop = c; break; }
    }
    // Shed cells vanish rather than becoming debris: otherwise grow → shed → collect
    // the debris is a free-size loop.
    const lost = GLYPHS[this.code[drop]] ?? '.';
    this.owner[drop] = NONE;
    this.code[drop] = 0;
    wr.cellCount--;
    this.log('shed', `${wr.name} shed ${lost === '.' ? 'fat' : `code '${lost}'`} (max size ${Math.floor(wr.maxSize)})`, wr.id);
  }

  private checkOver() {
    const alive = this.warriors.filter((w) => w.alive);
    if (this.warriors.length > 1 && alive.length <= 1) {
      this.result = alive.length
        ? { over: true, winner: alive[0].id, reason: 'last standing' }
        : { over: true, winner: null, reason: 'mutual destruction' };
    } else if (this.warriors.length === 1 && alive.length === 0) {
      this.result = { over: true, winner: null, reason: 'died' };
    } else if (this.t >= CONFIG.tickCap) {
      // Everyone starts at the same max size and decays the same way, so the highest
      // max size at the cap is whoever kept their economy up best.
      const best = Math.max(...alive.map((w) => w.maxSize));
      const top = alive.filter((w) => best - w.maxSize < 0.01);
      this.result = top.length === 1
        ? { over: true, winner: top[0].id, reason: `largest max size at tick cap (${best.toFixed(1)})` }
        : { over: true, winner: null, reason: 'draw at tick cap' };
    }
    if (this.result.over) this.log('over', this.result.winner === null
      ? `Match over: ${this.result.reason}`
      : `${this.warriors[this.result.winner].name} wins: ${this.result.reason}`);
  }

  // ---------- interpreter ----------

  private pop(wr: Warrior): number { return wr.stack.length ? wr.stack.pop()! : 0; }
  private push(wr: Warrior, v: number) {
    wr.stack.push(v | 0);
    if (wr.stack.length > CONFIG.stackMax) wr.stack.shift();
  }

  /** Move the IP to the next own cell in its direction, wrapping within the body. */
  private advance(wr: Warrior) {
    const dx = DX[wr.dir], dy = DY[wr.dir];
    let x = wr.ipX + dx, y = wr.ipY + dy;
    while (this.inBounds(x, y)) {
      if (this.owner[this.idx(x, y)] === wr.id) { wr.ipX = x; wr.ipY = y; return; }
      x += dx; y += dy;
    }
    // Wrap: scan from the opposite edge toward the IP.
    x = dx > 0 ? 0 : dx < 0 ? this.w - 1 : wr.ipX;
    y = dy > 0 ? 0 : dy < 0 ? this.h - 1 : wr.ipY;
    while (!(x === wr.ipX && y === wr.ipY)) {
      if (this.owner[this.idx(x, y)] === wr.id) { wr.ipX = x; wr.ipY = y; return; }
      x += dx; y += dy;
    }
  }

  /** Execute one instruction. Returns its cycle cost. */
  private step(wr: Warrior): number {
    const g = GLYPHS[this.code[this.idx(wr.ipX, wr.ipY)]] ?? '.';
    wr.executed++;
    let skip = false;
    const pop = () => this.pop(wr);
    const push = (v: number) => this.push(wr, v);

    switch (g) {
      case '>': wr.dir = 0; break;
      case 'v': wr.dir = 1; break;
      case '<': wr.dir = 2; break;
      case '^': wr.dir = 3; break;
      case '_': wr.dir = pop() === 0 ? 0 : 2; break;
      case '|': wr.dir = pop() === 0 ? 1 : 3; break;
      case '#': skip = true; break;
      case '?': wr.dir = Math.floor(this.rng() * 4); break;
      case '@': this.kill(wr, 'executed @'); return 1;
      case 'r': wr.dir = (wr.dir + 2) % 4; break;
      case '[': wr.dir = (wr.dir + 3) % 4; break;
      case ']': wr.dir = (wr.dir + 1) % 4; break;
      case ':': { const a = pop(); push(a); push(a); break; }
      case '\\': { const b = pop(), a = pop(); push(b); push(a); break; }
      case '$': pop(); break;
      case 'o': { const b = pop(), a = pop(); push(a); push(b); push(a); break; }
      case '+': { const b = pop(), a = pop(); push(a + b); break; }
      case '-': { const b = pop(), a = pop(); push(a - b); break; }
      case '*': { const b = pop(), a = pop(); push(a * b); break; }
      case '/': { const b = pop(), a = pop(); push(b === 0 ? 0 : Math.trunc(a / b)); break; }
      case '%': { const b = pop(), a = pop(); push(b === 0 ? 0 : a % b); break; }
      case '!': push(pop() === 0 ? 1 : 0); break;
      case '`': { const b = pop(), a = pop(); push(a > b ? 1 : 0); break; }
      case '=': { const b = pop(), a = pop(); push(a === b ? 1 : 0); break; }
      case "'": {
        const sx = wr.ipX, sy = wr.ipY;
        this.advance(wr);
        push(this.code[this.idx(wr.ipX, wr.ipY)]);
        wr.ipX = sx; wr.ipY = sy;
        skip = true;
        break;
      }
      case 'y': { const n = pop(); push(n > 0 ? Math.floor(this.rng() * n) : 0); break; }
      case 's': push(wr.cellCount); break;
      case 'm': push(Math.floor(wr.maxSize)); break;
      case 'f': push(Math.floor(wr.speed * 10)); break;
      case 'd': push(wr.dir); break;
      case 'e': push(wr.lastOk ? 1 : 0); break;
      case 'L': this.opLook(wr); break;
      case 'S': this.opScan(wr); break;
      case 'R': this.opRead(wr); break;
      case 'T': {
        const dy = pop(), dx = pop();
        if (dx === 0 && dy === 0) push(Math.floor(this.rng() * 4));
        else if (Math.abs(dx) >= Math.abs(dy)) push(dx > 0 ? 0 : 2);
        else push(dy > 0 ? 1 : 3);
        break;
      }
      case 'M': wr.lastOk = this.opShift(wr, pop()); break;
      case 'F': { const d = pop(), dy = pop(), dx = pop(); wr.lastOk = this.opFlow(wr, dx, dy, d); break; }
      case 'X': {
        const dy2 = pop(), dx2 = pop(), dy1 = pop(), dx1 = pop();
        wr.lastOk = this.opSwap(wr, dx1, dy1, dx2, dy2);
        break;
      }
      case 'G': { const c = pop(), d = pop(); wr.lastOk = this.opGrow(wr, d, c); break; }
      case 'C': wr.lastOk = this.opCollect(wr); break;
      case 'B': { const dy = pop(), dx = pop(); wr.lastOk = this.opBomb(wr, dx, dy); break; }
      case 'W': { const c = pop(), dy = pop(), dx = pop(); wr.lastOk = this.opWrite(wr, dx, dy, c); break; }
      default:
        if (g >= '0' && g <= '9') push(g.charCodeAt(0) - 48);
        break;
    }
    if (!wr.alive) return COST[g] ?? 1;
    this.advance(wr);
    if (skip) this.advance(wr);
    return COST[g] ?? 1;
  }

  // ---------- sensing ----------

  private classify(x: number, y: number, me: number): number {
    if (!this.isFloor(x, y)) return T_WALL;
    const i = this.idx(x, y);
    const o = this.owner[i];
    if (o === DEBRIS) return T_DEBRIS;
    if (o >= 0 && o !== me) return T_ENEMY;
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
    const cands: [number, number, number][] = [];
    for (let y = Math.max(0, wr.ipY - r - 8); y <= Math.min(this.h - 1, wr.ipY + r + 8); y++) {
      for (let x = Math.max(0, wr.ipX - r - 8); x <= Math.min(this.w - 1, wr.ipX + r + 8); x++) {
        const t = this.classify(x, y, wr.id);
        const match = type === T_RESOURCE ? (t === T_SIZE || t === T_SPEED) : t === type;
        if (!match || t === T_WALL || t === T_NOTHING) continue;
        cands.push([Math.abs(x - wr.ipX) + Math.abs(y - wr.ipY), x, y]);
      }
    }
    cands.sort((a, b) => a[0] - b[0]);
    for (const [, x, y] of cands) {
      if (this.seer(wr.id, x, y, r, mine) >= 0) {
        this.push(wr, x - wr.ipX);
        this.push(wr, y - wr.ipY);
        this.push(wr, 1);
        return;
      }
    }
    this.push(wr, 0); this.push(wr, 0); this.push(wr, 0);
  }

  private opRead(wr: Warrior) {
    const dy = this.pop(wr), dx = this.pop(wr);
    const x = wr.ipX + dx, y = wr.ipY + dy;
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
    const codes = mine.map((c) => this.code[c]);
    for (const c of mine) { this.owner[c] = NONE; this.code[c] = 0; }
    mine.forEach((c, k) => {
      const ni = this.idx((c % this.w) + DX[d], ((c / this.w) | 0) + DY[d]);
      this.owner[ni] = wr.id;
      this.code[ni] = codes[k];
    });
    wr.ipX += DX[d];
    wr.ipY += DY[d];
    return true;
  }

  private opFlow(wr: Warrior, dx: number, dy: number, d: number): boolean {
    d = ((d % 4) + 4) % 4;
    const x = wr.ipX + dx, y = wr.ipY + dy;
    const nx = x + DX[d], ny = y + DY[d];
    if (this.ownerAt(x, y) !== wr.id || !this.isFree(nx, ny)) return false;
    const from = this.idx(x, y), to = this.idx(nx, ny);
    const isIp = dx === 0 && dy === 0;
    this.owner[to] = wr.id; this.code[to] = this.code[from];
    this.owner[from] = NONE; this.code[from] = 0;
    if (isIp) { wr.ipX = nx; wr.ipY = ny; }
    if (this.unreached(wr).length) {
      // Would disconnect: undo.
      this.owner[from] = wr.id; this.code[from] = this.code[to];
      this.owner[to] = NONE; this.code[to] = 0;
      if (isIp) { wr.ipX = x; wr.ipY = y; }
      return false;
    }
    return true;
  }

  private opSwap(wr: Warrior, dx1: number, dy1: number, dx2: number, dy2: number): boolean {
    const a = [wr.ipX + dx1, wr.ipY + dy1], b = [wr.ipX + dx2, wr.ipY + dy2];
    if (this.ownerAt(a[0], a[1]) !== wr.id || this.ownerAt(b[0], b[1]) !== wr.id) return false;
    const ia = this.idx(a[0], a[1]), ib = this.idx(b[0], b[1]);
    [this.code[ia], this.code[ib]] = [this.code[ib], this.code[ia]];
    return true;
  }

  private opGrow(wr: Warrior, d: number, code: number): boolean {
    d = ((d % 4) + 4) % 4;
    if (wr.cellCount >= Math.floor(wr.maxSize)) return false;
    let x = wr.ipX, y = wr.ipY;
    while (this.ownerAt(x, y) === wr.id) { x += DX[d]; y += DY[d]; }
    if (!this.isFree(x, y)) return false;
    const i = this.idx(x, y);
    this.owner[i] = wr.id;
    this.code[i] = ((code % GLYPHS.length) + GLYPHS.length) % GLYPHS.length;
    wr.cellCount++;
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
          wr.maxSize = Math.min(CONFIG.sizeCap, wr.maxSize + CONFIG.sizePickup);
          this.log('collect', `${wr.name} took size (max ${Math.floor(wr.maxSize)})`, wr.id);
        } else if (this.resource[i] === 2) {
          wr.speed = Math.min(CONFIG.speedCap, wr.speed + CONFIG.speedPickup);
          this.log('collect', `${wr.name} took speed (${wr.speed.toFixed(2)})`, wr.id);
        } else if (this.owner[i] === DEBRIS) {
          wr.maxSize = Math.min(CONFIG.sizeCap, wr.maxSize + CONFIG.debrisPickup);
          this.owner[i] = NONE;
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
    const x = wr.ipX + dx, y = wr.ipY + dy;
    const o = this.ownerAt(x, y);
    if (o === NONE || o === wr.id) return false;
    if (this.seer(wr.id, x, y, CONFIG.bombRange) < 0) return false;
    const victim = o >= 0 ? this.warriors[o].name : 'debris';
    if (o >= 0) wr.stats.bombHits++;
    this.destroy(this.idx(x, y), wr);
    this.log('bomb', `${wr.name} bombed ${victim}`, wr.id);
    return true;
  }

  private opWrite(wr: Warrior, dx: number, dy: number, code: number): boolean {
    const x = wr.ipX + dx, y = wr.ipY + dy;
    const o = this.ownerAt(x, y);
    if (o === NONE) return false;
    if (o !== wr.id) {
      // Foreign cells must touch one of mine.
      let touching = false;
      for (let d = 0; d < 4 && !touching; d++) touching = this.ownerAt(x + DX[d], y + DY[d]) === wr.id;
      if (!touching) return false;
    }
    const c = ((code % GLYPHS.length) + GLYPHS.length) % GLYPHS.length;
    this.code[this.idx(x, y)] = c;
    if (o >= 0 && o !== wr.id) {
      if (c === CODE['@']) wr.stats.poisonWrites++;
      this.log('write', `${wr.name} wrote '${GLYPHS[c]}' into ${this.warriors[o].name}`, wr.id);
    }
    return true;
  }
}

export { CODE };

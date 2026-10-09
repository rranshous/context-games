// src/headless.ts
import { readFileSync } from "node:fs";
import { basename } from "node:path";

// src/sim/glyphs.ts
var GLYPHS = ".><^v_|#?@r[]0123456789:\\$o+-*/%!`='ysmfdeLSRTMFXGCBW";
var CODE = {};
for (let i = 0; i < GLYPHS.length; i++) CODE[GLYPHS[i]] = i;
function glyphOf(code) {
  return GLYPHS[code] ?? ".";
}
var DX = [1, 0, -1, 0];
var DY = [0, 1, 0, -1];
var DIR_NAMES = ["E", "S", "W", "N"];
var COST = { M: 2, G: 2, B: 4, W: 3 };
var T_NOTHING = 0;
var T_WALL = 1;
var T_ENEMY = 2;
var T_DEBRIS = 3;
var T_SIZE = 4;
var T_SPEED = 5;
var T_RESOURCE = 6;

// src/sim/rng.ts
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function randInt(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

// src/sim/board.ts
var FLOOR = 0;
var WALL = 1;
var BOARD_W = 64;
var BOARD_H = 40;
function makeBoard(seed) {
  const w = BOARD_W, h = BOARD_H;
  const rng = makeRng(seed ^ 2654435769);
  const terrain = new Uint8Array(w * h).fill(WALL);
  const carve = (r) => {
    for (const [mx, my] of [[false, false], [true, false], [false, true], [true, true]]) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          const cx = mx ? w - 1 - x : x;
          const cy = my ? h - 1 - y : y;
          if (cx > 0 && cy > 0 && cx < w - 1 && cy < h - 1) terrain[cy * w + cx] = FLOOR;
        }
      }
    }
  };
  const tl = { w: randInt(rng, 15, 17), h: randInt(rng, 11, 14), x: 0, y: 0 };
  tl.x = randInt(rng, 2, 4);
  tl.y = randInt(rng, 2, 4);
  const tmW = randInt(rng, 6, 9) * 2;
  const tm = { w: tmW, h: randInt(rng, 10, 13), x: (w - tmW) / 2, y: randInt(rng, 3, 5) };
  carve(tl);
  carve(tm);
  const hcW = randInt(rng, 3, 5);
  const hLo = Math.max(tl.y, tm.y), hHi = Math.min(tl.y + tl.h, tm.y + tm.h) - hcW;
  const hcY = randInt(rng, hLo, Math.max(hLo, hHi));
  carve({ x: tl.x + tl.w, y: hcY, w: tm.x - (tl.x + tl.w), h: hcW });
  const vcW = randInt(rng, 2, 4);
  const vcX = randInt(rng, tl.x + 2, tl.x + tl.w - vcW - 2);
  carve({ x: vcX, y: tl.y + tl.h, w: vcW, h: h / 2 - (tl.y + tl.h) });
  const mcW = randInt(rng, 1, 2) * 2;
  carve({ x: (w - mcW) / 2, y: tm.y + tm.h, w: mcW, h: h / 2 - (tm.y + tm.h) });
  const spawns = [];
  const mirrorAll = (x, y, kind) => {
    const pts = [[x, y], [w - 1 - x, y], [x, h - 1 - y], [w - 1 - x, h - 1 - y]];
    for (const [px, py] of pts) {
      if (!spawns.some((s) => s.x === px && s.y === py)) spawns.push({ x: px, y: py, kind });
    }
  };
  mirrorAll(tm.x + tm.w / 2 - 3, tm.y + Math.floor(tm.h / 2), 2);
  mirrorAll(tm.x + 2, tm.y + 2, 1);
  const mirrorRect = (r, mx, my) => ({
    x: mx ? w - r.x - r.w : r.x,
    y: my ? h - r.y - r.h : r.y,
    w: r.w,
    h: r.h
  });
  const starts = [mirrorRect(tl, false, false), mirrorRect(tl, true, false), mirrorRect(tl, true, true), mirrorRect(tl, false, true)];
  return { w, h, terrain, spawns, starts };
}

// src/sim/world.ts
var NONE = -1;
var DEBRIS = -2;
var CONFIG = {
  sight: 14,
  // LoS range from each cell (Chebyshev)
  bombRange: 6,
  // BOMB reach from the cell that sees the target
  writeRange: 2,
  // WRITE reach into foreign cells, from the cell that sees the target
  killPay: 0.25,
  // a killer takes this fraction of the victim's max size and speed
  creditWindow: 500,
  // a death within this many ticks of being harmed credits the harmer
  stackMax: 64,
  sizeFloor: 8,
  sizeCap: 64,
  startSize: 30,
  // every warrior starts with this max size; bodies can't be bigger
  sizeDecay: 4e-3,
  // per tick
  sizePickup: 4,
  debrisPickup: 0.5,
  speedStart: 2,
  speedFloor: 1,
  speedCap: 8,
  speedDecay: 1e-3,
  // per tick
  speedPickup: 1,
  spawnInterval: 120,
  // ticks between respawns at an empty spot
  tickCap: 5e3
};
var World = class {
  constructor(seed, specs2) {
    this.seed = seed;
    this.board = makeBoard(seed);
    this.w = this.board.w;
    this.h = this.board.h;
    this.owner = new Int16Array(this.w * this.h).fill(NONE);
    this.code = new Uint8Array(this.w * this.h);
    this.resource = new Uint8Array(this.w * this.h);
    this.rng = makeRng(seed);
    this.spawnTimers = this.board.spawns.map(() => 0);
    for (const s of this.board.spawns) this.resource[s.y * this.w + s.x] = s.kind;
    specs2.forEach((s, i) => this.place(s, i));
  }
  board;
  w;
  h;
  owner;
  code;
  resource;
  // 0 none, 1 size, 2 speed
  warriors = [];
  t = 0;
  rng;
  events = [];
  result = { over: false, winner: null, reason: "" };
  spawnTimers;
  // ---------- setup ----------
  place(spec, id) {
    if (spec.cells.length > CONFIG.startSize) {
      throw new Error(`${spec.name} has ${spec.cells.length} cells; the limit is ${CONFIG.startSize}`);
    }
    const room = this.board.starts[id % this.board.starts.length];
    const ox = room.x + Math.floor((room.w - spec.width) / 2);
    const oy = room.y + Math.floor((room.h - spec.height) / 2);
    const wr = {
      id,
      name: spec.name,
      alive: true,
      ipX: ox + spec.ip.x,
      ipY: oy + spec.ip.y,
      dir: spec.dir,
      stack: [],
      maxSize: CONFIG.startSize,
      speed: CONFIG.speedStart,
      accum: 0,
      lastOk: true,
      cellCount: 0,
      executed: 0,
      spec,
      stats: { collected: 0, bombHits: 0, poisonWrites: 0, kills: 0 }
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
  idx(x, y) {
    return y * this.w + x;
  }
  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  isFloor(x, y) {
    return this.inBounds(x, y) && this.board.terrain[this.idx(x, y)] === FLOOR;
  }
  ownerAt(x, y) {
    return this.inBounds(x, y) ? this.owner[this.idx(x, y)] : NONE;
  }
  /** Floor with nothing on it: no cell, no debris, no resource. */
  isFree(x, y) {
    if (!this.isFloor(x, y)) return false;
    const i = this.idx(x, y);
    return this.owner[i] === NONE && this.resource[i] === 0;
  }
  cellsOf(id) {
    const out = [];
    for (let i = 0; i < this.owner.length; i++) if (this.owner[i] === id) out.push(i);
    return out;
  }
  log(kind, text, who) {
    this.events.push({ t: this.t, kind, text, who });
    if (this.events.length > 2e3) this.events.splice(0, 500);
  }
  // Walls block LoS; cells don't. Bresenham, endpoints excluded.
  clearLine(x0, y0, x1, y1) {
    let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, x = x0, y = y0;
    while (true) {
      if (x === x1 && y === y1) return true;
      if (!(x === x0 && y === y0) && this.board.terrain[this.idx(x, y)] !== FLOOR) return false;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }
  /** Index of one of my cells that sees (x,y) within `range`, or -1. Own cells always count as seen. */
  seer(id, x, y, range = CONFIG.sight, mine) {
    if (this.ownerAt(x, y) === id) return this.idx(x, y);
    for (const c of mine ?? this.cellsOf(id)) {
      const cx = c % this.w, cy = c / this.w | 0;
      if (Math.max(Math.abs(cx - x), Math.abs(cy - y)) > range) continue;
      if (this.clearLine(cx, cy, x, y)) return c;
    }
    return -1;
  }
  /** 4-connected check of a warrior's cells from its IP. Returns unreached cells. */
  unreached(wr) {
    const mine = this.cellsOf(wr.id);
    const seen = /* @__PURE__ */ new Set();
    const start = this.idx(wr.ipX, wr.ipY);
    if (this.owner[start] !== wr.id) return mine;
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const c = queue.pop();
      const x = c % this.w, y = c / this.w | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (this.ownerAt(nx, ny) !== wr.id) continue;
        const n = this.idx(nx, ny);
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    return mine.filter((c) => !seen.has(c));
  }
  toDebris(i) {
    const o = this.owner[i];
    if (o >= 0) this.warriors[o].cellCount--;
    this.owner[i] = DEBRIS;
  }
  kill(wr, reason) {
    if (!wr.alive) return;
    wr.alive = false;
    wr.deathReason = reason;
    wr.diedAt = this.t;
    for (const c of this.cellsOf(wr.id)) this.toDebris(c);
    this.log("death", `${wr.name} died: ${reason}`, wr.id);
    const h = wr.lastHarm;
    const killer = h && this.t - h.t <= CONFIG.creditWindow ? this.warriors[h.by] : void 0;
    if (killer && killer.alive && killer !== wr) {
      killer.stats.kills++;
      killer.maxSize = Math.min(CONFIG.sizeCap, killer.maxSize + CONFIG.killPay * wr.maxSize);
      killer.speed = Math.min(CONFIG.speedCap, killer.speed + CONFIG.killPay * wr.speed);
      this.log("kill", `${killer.name} takes a cut of ${wr.name} (max ${Math.floor(killer.maxSize)}, speed ${killer.speed.toFixed(2)})`, killer.id);
    }
  }
  /** Destroy a cell outright (bomb). Handles core loss and disconnection. */
  destroy(i, by) {
    const o = this.owner[i];
    this.owner[i] = NONE;
    this.code[i] = 0;
    if (o < 0) return;
    const victim = this.warriors[o];
    victim.cellCount--;
    victim.lastHarm = { by: by.id, t: this.t };
    if (i === this.idx(victim.ipX, victim.ipY)) {
      this.kill(victim, `core bombed by ${by.name}`);
      return;
    }
    const cut = this.unreached(victim);
    if (cut.length) {
      for (const c of cut) this.toDebris(c);
      this.log("cut", `${victim.name} lost ${cut.length} cells cut off`, victim.id);
    }
  }
  // ---------- tick ----------
  tick() {
    if (this.result.over) return;
    this.t++;
    this.board.spawns.forEach((s, k) => {
      const i = this.idx(s.x, s.y);
      let touched = this.resource[i] !== 0 || this.owner[i] !== NONE;
      for (let d = 0; d < 4 && !touched; d++) touched = this.ownerAt(s.x + DX[d], s.y + DY[d]) !== NONE;
      if (touched) {
        this.spawnTimers[k] = 0;
        return;
      }
      if (++this.spawnTimers[k] >= CONFIG.spawnInterval) {
        this.resource[i] = s.kind;
        this.spawnTimers[k] = 0;
      }
    });
    const n = this.warriors.length;
    for (let k = 0; k < n; k++) {
      const wr = this.warriors[(this.t + k) % n];
      if (!wr.alive) continue;
      wr.accum += wr.speed;
      while (wr.accum >= 1 && wr.alive) wr.accum -= this.step(wr);
    }
    for (const wr of this.warriors) {
      if (!wr.alive) continue;
      wr.maxSize = Math.max(CONFIG.sizeFloor, wr.maxSize - CONFIG.sizeDecay);
      wr.speed = Math.max(CONFIG.speedFloor, wr.speed - CONFIG.speedDecay);
      if (wr.cellCount > Math.floor(wr.maxSize)) this.shed(wr);
      if (wr.cellCount <= 0) this.kill(wr, "no cells left");
    }
    this.checkOver();
  }
  /**
   * Upkeep: lose one cell. Burn fat first: the farthest `.` (no-op) cell whose removal
   * keeps the body connected. With no fat, drop the cell farthest (by path) from the IP,
   * which can never disconnect the rest — but is usually code, so the program rots.
   */
  shed(wr) {
    const start = this.idx(wr.ipX, wr.ipY);
    const dist = /* @__PURE__ */ new Map([[start, 0]]);
    const queue = [start];
    for (let q = 0; q < queue.length; q++) {
      const c = queue[q];
      const x = c % this.w, y = c / this.w | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (this.ownerAt(nx, ny) !== wr.id) continue;
        const ni = this.idx(nx, ny);
        if (!dist.has(ni)) {
          dist.set(ni, dist.get(c) + 1);
          queue.push(ni);
        }
      }
    }
    const byFar = queue.slice(1).reverse();
    if (!byFar.length) return;
    let drop = byFar[0];
    for (const c of byFar) {
      if (this.code[c] !== CODE["."]) continue;
      this.owner[c] = NONE;
      const ok = this.unreached(wr).length === 0;
      this.owner[c] = wr.id;
      if (ok) {
        drop = c;
        break;
      }
    }
    const lost = GLYPHS[this.code[drop]] ?? ".";
    this.owner[drop] = NONE;
    this.code[drop] = 0;
    wr.cellCount--;
    this.log("shed", `${wr.name} shed ${lost === "." ? "fat" : `code '${lost}'`} (max size ${Math.floor(wr.maxSize)})`, wr.id);
  }
  checkOver() {
    const alive = this.warriors.filter((w) => w.alive);
    if (this.warriors.length > 1 && alive.length <= 1) {
      this.result = alive.length ? { over: true, winner: alive[0].id, reason: "last standing" } : { over: true, winner: null, reason: "mutual destruction" };
    } else if (this.warriors.length === 1 && alive.length === 0) {
      this.result = { over: true, winner: null, reason: "died" };
    } else if (this.t >= CONFIG.tickCap) {
      const keys = (w) => [w.maxSize, w.speed, w.cellCount];
      const cmp = (a, b) => {
        const ka = keys(a), kb = keys(b);
        for (let k = 0; k < ka.length; k++) if (Math.abs(ka[k] - kb[k]) >= 0.01) return kb[k] - ka[k];
        return 0;
      };
      const ranked = [...alive].sort(cmp);
      const tied = ranked.length > 1 && cmp(ranked[0], ranked[1]) === 0;
      const top = ranked[0];
      const by = ranked.length < 2 || Math.abs(top.maxSize - ranked[1].maxSize) >= 0.01 ? `largest max size (${top.maxSize.toFixed(1)})` : Math.abs(top.speed - ranked[1].speed) >= 0.01 ? `max size tied, faster (${top.speed.toFixed(2)})` : `max size and speed tied, more cells (${top.cellCount})`;
      this.result = tied ? { over: true, winner: null, reason: "draw at tick cap" } : { over: true, winner: top.id, reason: `${by} at tick cap` };
    }
    if (this.result.over) this.log("over", this.result.winner === null ? `Match over: ${this.result.reason}` : `${this.warriors[this.result.winner].name} wins: ${this.result.reason}`);
  }
  // ---------- interpreter ----------
  pop(wr) {
    return wr.stack.length ? wr.stack.pop() : 0;
  }
  push(wr, v) {
    wr.stack.push(v | 0);
    if (wr.stack.length > CONFIG.stackMax) wr.stack.shift();
  }
  /** Move the IP to the next own cell in its direction, wrapping within the body. */
  advance(wr) {
    const dx = DX[wr.dir], dy = DY[wr.dir];
    let x = wr.ipX + dx, y = wr.ipY + dy;
    while (this.inBounds(x, y)) {
      if (this.owner[this.idx(x, y)] === wr.id) {
        wr.ipX = x;
        wr.ipY = y;
        return;
      }
      x += dx;
      y += dy;
    }
    x = dx > 0 ? 0 : dx < 0 ? this.w - 1 : wr.ipX;
    y = dy > 0 ? 0 : dy < 0 ? this.h - 1 : wr.ipY;
    while (!(x === wr.ipX && y === wr.ipY)) {
      if (this.owner[this.idx(x, y)] === wr.id) {
        wr.ipX = x;
        wr.ipY = y;
        return;
      }
      x += dx;
      y += dy;
    }
  }
  /** Execute one instruction. Returns its cycle cost. */
  step(wr) {
    const g = GLYPHS[this.code[this.idx(wr.ipX, wr.ipY)]] ?? ".";
    wr.executed++;
    let skip = false;
    const pop = () => this.pop(wr);
    const push = (v) => this.push(wr, v);
    switch (g) {
      case ">":
        wr.dir = 0;
        break;
      case "v":
        wr.dir = 1;
        break;
      case "<":
        wr.dir = 2;
        break;
      case "^":
        wr.dir = 3;
        break;
      case "_":
        wr.dir = pop() === 0 ? 0 : 2;
        break;
      case "|":
        wr.dir = pop() === 0 ? 1 : 3;
        break;
      case "#":
        skip = true;
        break;
      case "?":
        wr.dir = Math.floor(this.rng() * 4);
        break;
      case "@":
        this.kill(wr, "executed @");
        return 1;
      case "r":
        wr.dir = (wr.dir + 2) % 4;
        break;
      case "[":
        wr.dir = (wr.dir + 3) % 4;
        break;
      case "]":
        wr.dir = (wr.dir + 1) % 4;
        break;
      case ":": {
        const a = pop();
        push(a);
        push(a);
        break;
      }
      case "\\": {
        const b = pop(), a = pop();
        push(b);
        push(a);
        break;
      }
      case "$":
        pop();
        break;
      case "o": {
        const b = pop(), a = pop();
        push(a);
        push(b);
        push(a);
        break;
      }
      case "+": {
        const b = pop(), a = pop();
        push(a + b);
        break;
      }
      case "-": {
        const b = pop(), a = pop();
        push(a - b);
        break;
      }
      case "*": {
        const b = pop(), a = pop();
        push(a * b);
        break;
      }
      case "/": {
        const b = pop(), a = pop();
        push(b === 0 ? 0 : Math.trunc(a / b));
        break;
      }
      case "%": {
        const b = pop(), a = pop();
        push(b === 0 ? 0 : a % b);
        break;
      }
      case "!":
        push(pop() === 0 ? 1 : 0);
        break;
      case "`": {
        const b = pop(), a = pop();
        push(a > b ? 1 : 0);
        break;
      }
      case "=": {
        const b = pop(), a = pop();
        push(a === b ? 1 : 0);
        break;
      }
      case "'": {
        const sx = wr.ipX, sy = wr.ipY;
        this.advance(wr);
        push(this.code[this.idx(wr.ipX, wr.ipY)]);
        wr.ipX = sx;
        wr.ipY = sy;
        skip = true;
        break;
      }
      case "y": {
        const n = pop();
        push(n > 0 ? Math.floor(this.rng() * n) : 0);
        break;
      }
      case "s":
        push(wr.cellCount);
        break;
      case "m":
        push(Math.floor(wr.maxSize));
        break;
      case "f":
        push(Math.floor(wr.speed * 10));
        break;
      case "d":
        push(wr.dir);
        break;
      case "e":
        push(wr.lastOk ? 1 : 0);
        break;
      case "L":
        this.opLook(wr);
        break;
      case "S":
        this.opScan(wr);
        break;
      case "R":
        this.opRead(wr);
        break;
      case "T": {
        const dy = pop(), dx = pop();
        if (dx === 0 && dy === 0) push(Math.floor(this.rng() * 4));
        else if (Math.abs(dx) >= Math.abs(dy)) push(dx > 0 ? 0 : 2);
        else push(dy > 0 ? 1 : 3);
        break;
      }
      case "M":
        wr.lastOk = this.opShift(wr, pop());
        break;
      case "F": {
        const d = pop(), dy = pop(), dx = pop();
        wr.lastOk = this.opFlow(wr, dx, dy, d);
        break;
      }
      case "X": {
        const dy2 = pop(), dx2 = pop(), dy1 = pop(), dx1 = pop();
        wr.lastOk = this.opSwap(wr, dx1, dy1, dx2, dy2);
        break;
      }
      case "G": {
        const c = pop(), d = pop();
        wr.lastOk = this.opGrow(wr, d, c);
        break;
      }
      case "C":
        wr.lastOk = this.opCollect(wr);
        break;
      case "B": {
        const dy = pop(), dx = pop();
        wr.lastOk = this.opBomb(wr, dx, dy);
        break;
      }
      case "W": {
        const c = pop(), dy = pop(), dx = pop();
        wr.lastOk = this.opWrite(wr, dx, dy, c);
        break;
      }
      default:
        if (g >= "0" && g <= "9") push(g.charCodeAt(0) - 48);
        break;
    }
    if (!wr.alive) return COST[g] ?? 1;
    this.advance(wr);
    if (skip) this.advance(wr);
    return COST[g] ?? 1;
  }
  // ---------- sensing ----------
  classify(x, y, me) {
    if (!this.isFloor(x, y)) return T_WALL;
    const i = this.idx(x, y);
    const o = this.owner[i];
    if (o === DEBRIS) return T_DEBRIS;
    if (o >= 0 && o !== me) return T_ENEMY;
    if (this.resource[i] === 1) return T_SIZE;
    if (this.resource[i] === 2) return T_SPEED;
    return T_NOTHING;
  }
  opLook(wr) {
    const d = (this.pop(wr) % 4 + 4) % 4;
    let x = wr.ipX, y = wr.ipY;
    for (let dist = 1; dist <= CONFIG.sight; dist++) {
      x += DX[d];
      y += DY[d];
      if (this.ownerAt(x, y) === wr.id) continue;
      const t = this.classify(x, y, wr.id);
      if (t !== T_NOTHING) {
        this.push(wr, dist);
        this.push(wr, t);
        return;
      }
    }
    this.push(wr, 0);
    this.push(wr, T_NOTHING);
  }
  opScan(wr) {
    const type = this.pop(wr);
    const mine = this.cellsOf(wr.id);
    const r = CONFIG.sight;
    const cands = [];
    for (let y = Math.max(0, wr.ipY - r - 8); y <= Math.min(this.h - 1, wr.ipY + r + 8); y++) {
      for (let x = Math.max(0, wr.ipX - r - 8); x <= Math.min(this.w - 1, wr.ipX + r + 8); x++) {
        const t = this.classify(x, y, wr.id);
        const match = type === T_RESOURCE ? t === T_SIZE || t === T_SPEED : t === type;
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
    this.push(wr, 0);
    this.push(wr, 0);
    this.push(wr, 0);
  }
  opRead(wr) {
    const dy = this.pop(wr), dx = this.pop(wr);
    const x = wr.ipX + dx, y = wr.ipY + dy;
    if (!this.inBounds(x, y) || this.owner[this.idx(x, y)] === NONE || this.seer(wr.id, x, y) < 0) {
      this.push(wr, -1);
      return;
    }
    this.push(wr, this.code[this.idx(x, y)]);
  }
  // ---------- actions ----------
  opShift(wr, d) {
    d = (d % 4 + 4) % 4;
    const mine = this.cellsOf(wr.id);
    for (const c of mine) {
      const nx = c % this.w + DX[d], ny = (c / this.w | 0) + DY[d];
      if (this.ownerAt(nx, ny) === wr.id) continue;
      if (!this.isFree(nx, ny)) return false;
    }
    const codes = mine.map((c) => this.code[c]);
    for (const c of mine) {
      this.owner[c] = NONE;
      this.code[c] = 0;
    }
    mine.forEach((c, k) => {
      const ni = this.idx(c % this.w + DX[d], (c / this.w | 0) + DY[d]);
      this.owner[ni] = wr.id;
      this.code[ni] = codes[k];
    });
    wr.ipX += DX[d];
    wr.ipY += DY[d];
    return true;
  }
  opFlow(wr, dx, dy, d) {
    d = (d % 4 + 4) % 4;
    const x = wr.ipX + dx, y = wr.ipY + dy;
    const nx = x + DX[d], ny = y + DY[d];
    if (this.ownerAt(x, y) !== wr.id || !this.isFree(nx, ny)) return false;
    const from = this.idx(x, y), to = this.idx(nx, ny);
    const isIp = dx === 0 && dy === 0;
    this.owner[to] = wr.id;
    this.code[to] = this.code[from];
    this.owner[from] = NONE;
    this.code[from] = 0;
    if (isIp) {
      wr.ipX = nx;
      wr.ipY = ny;
    }
    if (this.unreached(wr).length) {
      this.owner[from] = wr.id;
      this.code[from] = this.code[to];
      this.owner[to] = NONE;
      this.code[to] = 0;
      if (isIp) {
        wr.ipX = x;
        wr.ipY = y;
      }
      return false;
    }
    return true;
  }
  opSwap(wr, dx1, dy1, dx2, dy2) {
    const a = [wr.ipX + dx1, wr.ipY + dy1], b = [wr.ipX + dx2, wr.ipY + dy2];
    if (this.ownerAt(a[0], a[1]) !== wr.id || this.ownerAt(b[0], b[1]) !== wr.id) return false;
    const ia = this.idx(a[0], a[1]), ib = this.idx(b[0], b[1]);
    [this.code[ia], this.code[ib]] = [this.code[ib], this.code[ia]];
    return true;
  }
  opGrow(wr, d, code) {
    d = (d % 4 + 4) % 4;
    if (wr.cellCount >= Math.floor(wr.maxSize)) return false;
    let x = wr.ipX, y = wr.ipY;
    while (this.ownerAt(x, y) === wr.id) {
      x += DX[d];
      y += DY[d];
    }
    if (!this.isFree(x, y)) return false;
    const i = this.idx(x, y);
    this.owner[i] = wr.id;
    this.code[i] = (code % GLYPHS.length + GLYPHS.length) % GLYPHS.length;
    wr.cellCount++;
    return true;
  }
  opCollect(wr) {
    let got = false;
    for (const c of this.cellsOf(wr.id)) {
      const x = c % this.w, y = c / this.w | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (!this.inBounds(nx, ny)) continue;
        const i = this.idx(nx, ny);
        if (this.resource[i] === 1) {
          wr.maxSize = Math.min(CONFIG.sizeCap, wr.maxSize + CONFIG.sizePickup);
          this.log("collect", `${wr.name} took size (max ${Math.floor(wr.maxSize)})`, wr.id);
        } else if (this.resource[i] === 2) {
          wr.speed = Math.min(CONFIG.speedCap, wr.speed + CONFIG.speedPickup);
          this.log("collect", `${wr.name} took speed (${wr.speed.toFixed(2)})`, wr.id);
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
  opBomb(wr, dx, dy) {
    const x = wr.ipX + dx, y = wr.ipY + dy;
    const o = this.ownerAt(x, y);
    if (o === NONE || o === wr.id) return false;
    if (this.seer(wr.id, x, y, CONFIG.bombRange) < 0) return false;
    const victim = o >= 0 ? this.warriors[o].name : "debris";
    if (o >= 0) wr.stats.bombHits++;
    this.destroy(this.idx(x, y), wr);
    this.log("bomb", `${wr.name} bombed ${victim}`, wr.id);
    return true;
  }
  opWrite(wr, dx, dy, code) {
    const x = wr.ipX + dx, y = wr.ipY + dy;
    const o = this.ownerAt(x, y);
    if (o === NONE) return false;
    if (o !== wr.id) {
      if (this.seer(wr.id, x, y, CONFIG.writeRange) < 0) return false;
    }
    const c = (code % GLYPHS.length + GLYPHS.length) % GLYPHS.length;
    this.code[this.idx(x, y)] = c;
    if (o >= 0 && o !== wr.id) {
      if (c === CODE["@"]) wr.stats.poisonWrites++;
      if (o >= 0) this.warriors[o].lastHarm = { by: wr.id, t: this.t };
      this.log("write", `${wr.name} wrote '${GLYPHS[c]}' into ${this.warriors[o].name}`, wr.id);
    }
    return true;
  }
};

// src/sim/ascii.ts
var LETTERS = "ABCDEFGH";
function asciiMap(world, opts = {}) {
  const rows = [];
  const ips = new Map(world.warriors.filter((w) => w.alive).map((w) => [world.idx(w.ipX, w.ipY), w.id]));
  for (let y = 0; y < world.h; y++) {
    let row = "";
    for (let x = 0; x < world.w; x++) {
      const i = world.idx(x, y);
      const o = world.owner[i];
      if (!world.isFloor(x, y)) row += "#";
      else if (o >= 0) {
        if (opts.glyphs) row += glyphOf(world.code[i]);
        else row += ips.get(i) === o ? LETTERS[o].toLowerCase() : LETTERS[o];
      } else if (o === DEBRIS) row += "%";
      else if (world.resource[i] === 1) row += "+";
      else if (world.resource[i] === 2) row += "*";
      else row += o === NONE ? " " : "?";
    }
    rows.push(row);
  }
  return rows.join("\n");
}
function statusLine(world) {
  return world.warriors.map(
    (w) => `${LETTERS[w.id]}:${w.name} ${w.alive ? `cells=${w.cellCount}/${Math.floor(w.maxSize)} spd=${w.speed.toFixed(2)}` : `dead@${w.diedAt} (${w.deathReason})`}`
  ).join(" | ");
}

// src/sim/match.ts
function runMatch(specs2, seed, opts = {}) {
  const prevCap = CONFIG.tickCap;
  if (opts.tickCap) CONFIG.tickCap = opts.tickCap;
  try {
    const world = new World(seed, specs2);
    while (!world.result.over) {
      world.tick();
      opts.onTick?.(world);
    }
    return { world, summary: summarize(world) };
  } finally {
    CONFIG.tickCap = prevCap;
  }
}
function summarize(world) {
  return {
    seed: world.seed,
    ticks: world.t,
    winner: world.result.winner === null ? null : world.warriors[world.result.winner].name,
    reason: world.result.reason,
    warriors: world.warriors.map((w) => ({
      name: w.name,
      alive: w.alive,
      cells: w.cellCount,
      executed: w.executed,
      death: w.deathReason
    }))
  };
}
function runTournament(specs2, seeds, tickCap2) {
  const table = new Map(specs2.map((s) => [s.name, { name: s.name, wins: 0, losses: 0, draws: 0 }]));
  const pairs = {};
  const reasons = {};
  for (let i = 0; i < specs2.length; i++) {
    for (let j = 0; j < specs2.length; j++) {
      if (i === j) continue;
      for (const seed of seeds) {
        const { summary } = runMatch([specs2[i], specs2[j]], seed, { tickCap: tickCap2 });
        const why = summary.reason.replace(/ \([^)]*\)/g, "");
        reasons[why] = (reasons[why] ?? 0) + 1;
        const a = specs2[i].name, b = specs2[j].name;
        const key = [a, b].sort().join(" vs ");
        pairs[key] ??= { a: 0, b: 0, d: 0 };
        const [first] = [a, b].sort();
        if (summary.winner === null) {
          table.get(a).draws++;
          table.get(b).draws++;
          pairs[key].d++;
        } else {
          const loser = summary.winner === a ? b : a;
          table.get(summary.winner).wins++;
          table.get(loser).losses++;
          if (summary.winner === first) pairs[key].a++;
          else pairs[key].b++;
        }
      }
    }
  }
  return { table: [...table.values()].sort((x, y) => y.wins - x.wins), pairs, reasons };
}

// src/sim/warrior-file.ts
function parseWarrior(text, fallbackName = "warrior") {
  const lines = text.replace(/\r/g, "").split("\n");
  const sep = lines.findIndex((l) => l.trim() === "---");
  if (sep < 0) throw new Error(`${fallbackName}: missing '---' line between header and body`);
  const header = {};
  for (const l of lines.slice(0, sep)) {
    if (!l.trim() || l.trim().startsWith("#")) continue;
    const m = l.match(/^\s*(\w+)\s*:\s*(.*)$/);
    if (m) header[m[1].toLowerCase()] = m[2].trim();
  }
  const grid = lines.slice(sep + 1);
  while (grid.length && !grid[grid.length - 1].trim()) grid.pop();
  const cells = [];
  let width = 0;
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === " ") continue;
      if (!(ch in CODE)) throw new Error(`${fallbackName}: unknown glyph '${ch}' at ${x},${y}`);
      cells.push({ x, y, code: CODE[ch] });
      width = Math.max(width, x + 1);
    }
  });
  if (!cells.length) throw new Error(`${fallbackName}: empty body`);
  let ip = { x: cells[0].x, y: cells[0].y };
  if (header.ip) {
    const [x, y] = header.ip.split(/[\s,]+/).map(Number);
    ip = { x, y };
    if (!cells.some((c) => c.x === x && c.y === y)) throw new Error(`${fallbackName}: ip ${x},${y} is not a cell`);
  }
  const dir = header.dir ? DIR_NAMES.indexOf(header.dir.toUpperCase()) : 0;
  if (dir < 0) throw new Error(`${fallbackName}: bad dir '${header.dir}'`);
  return { name: header.name || fallbackName, dir, ip, cells, width, height: grid.length, source: text };
}

// src/headless.ts
var args = process.argv.slice(2);
var flag = (name) => args.includes(`--${name}`);
var opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
var valued = /* @__PURE__ */ new Set(["--seed", "--ticks", "--frames", "--seeds"]);
var files = args.filter((a, i) => !a.startsWith("--") && !valued.has(args[i - 1]));
if (!files.length) {
  console.log("usage: node dist/headless.mjs [--tournament|--solo] <warrior files> [--seed N] [--seeds N] [--ticks N] [--frames K] [--glyphs]");
  process.exit(1);
}
var specs = files.map((f) => parseWarrior(readFileSync(f, "utf8"), basename(f, ".warrior")));
var tickCap = opt("ticks", 0) || void 0;
if (flag("tournament")) {
  const n = opt("seeds", 5);
  const seeds = Array.from({ length: n }, (_, i) => i + 1);
  const { table, pairs, reasons } = runTournament(specs, seeds, tickCap);
  console.log(`Tournament: ${specs.length} warriors, ${n} boards, both seatings
`);
  for (const r of table) console.log(`${r.name.padEnd(16)} W ${String(r.wins).padStart(3)}  L ${String(r.losses).padStart(3)}  D ${String(r.draws).padStart(3)}`);
  console.log("\nhow matches ended:", Object.entries(reasons).map(([k, v]) => `${k} ${v}`).join(", "));
  console.log("");
  for (const [k, v] of Object.entries(pairs)) {
    const [a, b] = k.split(" vs ");
    console.log(`${k.padEnd(34)} ${a} ${v.a} / ${b} ${v.b} / draw ${v.d}`);
  }
} else {
  const seed = opt("seed", 1);
  const frames = opt("frames", 0);
  const { world, summary } = runMatch(specs, seed, {
    tickCap,
    onTick: (w) => {
      if (frames && w.t % frames === 0) {
        console.log(`
--- tick ${w.t} --- ${statusLine(w)}`);
        console.log(asciiMap(w, { glyphs: flag("glyphs") }));
      }
    }
  });
  if (frames) {
    console.log(`
--- final, tick ${world.t} ---`);
    console.log(asciiMap(world, { glyphs: flag("glyphs") }));
  }
  console.log(`
seed ${seed}, ${summary.ticks} ticks: ${summary.winner ?? "no winner"} (${summary.reason})`);
  console.log(statusLine(world));
  const kinds = {};
  for (const e of world.events) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
  console.log("events:", JSON.stringify(kinds));
  if (flag("events")) for (const e of world.events) console.log(`  t${e.t} ${e.text}`);
}
//# sourceMappingURL=headless.mjs.map

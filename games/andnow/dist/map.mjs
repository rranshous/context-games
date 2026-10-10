// src/map-elites.ts
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync as readFileSync2, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { basename, join } from "node:path";
import { isMainThread } from "node:worker_threads";

// src/sim/glyphs.ts
var GLYPHS = ".><^v_|#?@r[]0123456789:\\$o+-*/%!`='ysmfdeLSRTMFXGCBW";
var CODE = {};
for (let i = 0; i < GLYPHS.length; i++) CODE[GLYPHS[i]] = i;
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
  for (let k = 0; ; k++) {
    const b = makeRooms(seed, k);
    if (b) return b;
  }
}
function canvas(w, h) {
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
  const spawns = [];
  const spawnAll = (x, y, kind) => {
    for (const [px, py] of [[x, y], [w - 1 - x, y], [x, h - 1 - y], [w - 1 - x, h - 1 - y]]) {
      if (!spawns.some((s) => s.x === px && s.y === py)) spawns.push({ x: px, y: py, kind });
    }
  };
  const mirrorRect = (r, mx, my) => ({
    x: mx ? w - r.x - r.w : r.x,
    y: my ? h - r.y - r.h : r.y,
    w: r.w,
    h: r.h
  });
  const startsFrom = (r) => [mirrorRect(r, false, false), mirrorRect(r, true, false), mirrorRect(r, true, true), mirrorRect(r, false, true)];
  return { terrain, carve, spawns, spawnAll, startsFrom };
}
var WIDTHS = [1, 2, 3, 3, 4, 5];
function split(rng, total, n, first, min) {
  if (n === 1) return [total];
  const a = randInt(rng, first, Math.max(first, total - min * (n - 1)));
  const rest = total - a;
  const parts = [a];
  let left = rest;
  for (let i = 1; i < n - 1; i++) {
    const p = randInt(rng, min, Math.max(min, left - min * (n - 1 - i)));
    parts.push(p);
    left -= p;
  }
  parts.push(left);
  return parts;
}
function makeRooms(seed, attempt) {
  const w = BOARD_W, h = BOARD_H, hw = w / 2, hh = h / 2;
  const rng = makeRng(seed * 7919 + attempt * 104729 ^ 5369127);
  const { terrain, carve, spawns, spawnAll, startsFrom } = canvas(w, h);
  const qcols = randInt(rng, 2, 3), qrows = randInt(rng, 1, 2);
  const colW = split(rng, hw - 1, qcols, 18, 7);
  const rowH = split(rng, hh - 1, qrows, 10, 6);
  const rooms = [];
  let y0 = 1;
  for (let r = 0; r < qrows; r++) {
    rooms.push([]);
    let x0 = 1;
    for (let c = 0; c < qcols; c++) {
      const cw = colW[c], ch = rowH[r];
      const start = r === 0 && c === 0;
      const rw = start ? randInt(rng, 16, Math.max(16, cw - 2)) : randInt(rng, Math.max(4, Math.floor(cw * 0.4)), Math.max(4, cw - 3));
      const rh = start ? randInt(rng, Math.min(8, ch - 2), ch - 2) : randInt(rng, Math.max(3, Math.floor(ch * 0.4)), Math.max(3, ch - 3));
      const room = { x: x0 + randInt(rng, 0, cw - rw - 1) + (start ? 1 : 0), y: y0 + randInt(rng, 0, ch - rh - 1) + (start ? 1 : 0), w: rw, h: rh };
      if (start) {
        room.x = Math.min(room.x, x0 + cw - rw);
        room.y = Math.min(room.y, y0 + ch - rh);
      }
      if (c === qcols - 1 && rng() < 0.25) room.w = hw - room.x;
      if (r === qrows - 1 && rng() < 0.25) room.h = hh - room.y;
      rooms[r].push(room);
      carve(room);
      x0 += cw;
    }
    y0 += rowH[r];
  }
  const center = (a) => ({ x: a.x + Math.floor(a.w / 2), y: a.y + Math.floor(a.h / 2) });
  const corridor = (a, b, cw) => {
    const ylo = Math.max(a.y, b.y), yhi = Math.min(a.y + a.h, b.y + b.h) - cw;
    const xlo = Math.max(a.x, b.x), xhi = Math.min(a.x + a.w, b.x + b.w) - cw;
    if (yhi >= ylo && (b.x >= a.x + a.w || a.x >= b.x + b.w)) {
      const y = randInt(rng, ylo, yhi);
      const [l, r] = a.x < b.x ? [a, b] : [b, a];
      carve({ x: l.x + l.w, y, w: r.x - (l.x + l.w), h: cw });
    } else if (xhi >= xlo && (b.y >= a.y + a.h || a.y >= b.y + b.h)) {
      const x = randInt(rng, xlo, xhi);
      const [t, u] = a.y < b.y ? [a, b] : [b, a];
      carve({ x, y: t.y + t.h, w: cw, h: u.y - (t.y + t.h) });
    } else {
      const pa = center(a), pb = center(b);
      carve({ x: Math.min(pa.x, pb.x), y: pa.y, w: Math.abs(pa.x - pb.x) + cw, h: cw });
      carve({ x: pb.x, y: Math.min(pa.y, pb.y), w: cw, h: Math.abs(pa.y - pb.y) + cw });
    }
  };
  const key2 = (r, c) => r * 10 + c;
  const seen = /* @__PURE__ */ new Set([key2(0, 0)]);
  const stack = [[0, 0]];
  const edges = /* @__PURE__ */ new Set();
  const startExits = [];
  const link = (r1, c1, r2, c2) => {
    const id = [key2(r1, c1), key2(r2, c2)].sort().join("-");
    if (edges.has(id)) return;
    edges.add(id);
    const cw = WIDTHS[Math.floor(rng() * WIDTHS.length)];
    if (r1 === 0 && c1 === 0 || r2 === 0 && c2 === 0) startExits.push(cw);
    corridor(rooms[r1][c1], rooms[r2][c2], cw);
  };
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const next = [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]].filter(([a2, b2]) => a2 >= 0 && b2 >= 0 && a2 < qrows && b2 < qcols && !seen.has(key2(a2, b2)));
    if (!next.length) {
      stack.pop();
      continue;
    }
    const [a, b] = next[Math.floor(rng() * next.length)];
    seen.add(key2(a, b));
    link(r, c, a, b);
    stack.push([a, b]);
  }
  for (let r = 0; r < qrows; r++) {
    for (let c = 0; c < qcols; c++) {
      if (c + 1 < qcols && rng() < 0.4) link(r, c, r, c + 1);
      if (r + 1 < qrows && rng() < 0.4) link(r, c, r + 1, c);
    }
  }
  if (!startExits.some((cw) => cw >= 3)) {
    const [r, c] = qcols > 1 ? [0, 1] : [1, 0];
    corridor(rooms[0][0], rooms[r][c], randInt(rng, 3, 5));
  }
  const crossRight = rooms.map((row) => row[qcols - 1]);
  const crossDown = rooms[qrows - 1];
  const cross = (list, horizontal) => {
    let any = list.some((a) => horizontal ? a.x + a.w >= hw : a.y + a.h >= hh);
    list.forEach((a, i) => {
      const touches = horizontal ? a.x + a.w >= hw : a.y + a.h >= hh;
      if (touches || any && rng() < 0.5 && i !== list.length - 1) return;
      const cw = WIDTHS[Math.floor(rng() * WIDTHS.length)];
      if (horizontal) carve({ x: a.x + a.w, y: randInt(rng, a.y, a.y + a.h - Math.min(cw, a.h)), w: hw - (a.x + a.w), h: cw });
      else carve({ x: randInt(rng, a.x, a.x + a.w - Math.min(cw, a.w)), y: a.y + a.h, w: cw, h: hh - (a.y + a.h) });
      any = true;
    });
  };
  cross(crossRight, true);
  cross(crossDown, false);
  const others = rooms.flat().filter((r) => r !== rooms[0][0]);
  const inside = (a) => ({ x: a.x + randInt(rng, 1, Math.max(1, a.w - 2)), y: a.y + randInt(rng, 1, Math.max(1, a.h - 2)) });
  for (let k = 0; k < 2; k++) {
    const p = inside(others[Math.floor(rng() * others.length)]);
    spawnAll(Math.min(p.x, hw - 1), Math.min(p.y, hh - 1), 1);
  }
  {
    const p = inside(others[Math.floor(rng() * others.length)]);
    spawnAll(Math.min(p.x, hw - 1), Math.min(p.y, hh - 1), 2);
  }
  const starts = startsFrom(rooms[0][0]);
  const reach = new Uint8Array(w * h);
  const s0 = starts[0];
  const q = [(s0.y + 1) * w + s0.x + 1];
  reach[q[0]] = 1;
  while (q.length) {
    const i = q.pop();
    for (const n of [i - 1, i + 1, i - w, i + w]) {
      if (n >= 0 && n < w * h && !reach[n] && terrain[n] === FLOOR) {
        reach[n] = 1;
        q.push(n);
      }
    }
  }
  for (const s of starts) if (!reach[(s.y + 1) * w + s.x + 1]) return null;
  for (const sp of spawns) if (!reach[sp.y * w + sp.x]) return null;
  for (let i = 0; i < w * h; i++) if (terrain[i] === FLOOR && !reach[i]) terrain[i] = WALL;
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
  constructor(seed, specs) {
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
    specs.forEach((s, i) => this.place(s, i));
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
      ox: ox + spec.ip.x,
      oy: oy + spec.ip.y,
      dir: spec.dir,
      stack: [],
      maxSize: CONFIG.startSize,
      speed: CONFIG.speedStart,
      accum: 0,
      lastOk: true,
      lastAct: "",
      cellCount: 0,
      executed: 0,
      spec,
      stats: { collected: 0, bombHits: 0, poisonWrites: 0, kills: 0 },
      home: room
    };
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
  // Cells by owner (warrior id, or DEBRIS), kept in step with `owner` by setOwner, so
  // nothing has to scan the whole board to find a warrior's cells.
  cellSets = /* @__PURE__ */ new Map();
  sortedCells = /* @__PURE__ */ new Map();
  /** The way `owner` changes (opShift does a bulk equivalent). */
  setOwner(i, v) {
    const o = this.owner[i];
    if (o === v) return;
    if (o !== NONE) {
      this.cellSets.get(o).delete(i);
      this.sortedCells.delete(o);
    }
    this.owner[i] = v;
    if (v !== NONE) {
      let set = this.cellSets.get(v);
      if (!set) {
        set = /* @__PURE__ */ new Set();
        this.cellSets.set(v, set);
      }
      set.add(i);
      this.sortedCells.delete(v);
    }
  }
  /** A warrior's (or DEBRIS's) cells in board order. Treat the array as read-only. */
  cellsOf(id) {
    let out = this.sortedCells.get(id);
    if (!out) {
      out = Array.from(Int32Array.from(this.cellSets.get(id) ?? []).sort());
      this.sortedCells.set(id, out);
    }
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
    this.setOwner(i, DEBRIS);
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
    this.setOwner(i, NONE);
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
    const spawns = this.board.spawns;
    for (let k = 0; k < spawns.length; k++) {
      const s = spawns[k];
      const i = this.idx(s.x, s.y);
      let touched = this.resource[i] !== 0 || this.owner[i] !== NONE;
      for (let d = 0; d < 4 && !touched; d++) touched = this.ownerAt(s.x + DX[d], s.y + DY[d]) !== NONE;
      if (touched) {
        this.spawnTimers[k] = 0;
        continue;
      }
      if (++this.spawnTimers[k] >= CONFIG.spawnInterval) {
        this.resource[i] = s.kind;
        this.spawnTimers[k] = 0;
      }
    }
    const n = this.warriors.length;
    for (let k = 0; k < n; k++) {
      const wr = this.warriors[(this.t + k) % n];
      if (!wr.alive) continue;
      wr.accum += wr.speed;
      while (wr.accum >= 1 && wr.alive) wr.accum -= this.step(wr);
    }
    for (const wr of this.warriors) {
      if (!wr.alive) continue;
      const hm = wr.home;
      if (wr.leftHomeAt === void 0 && (wr.ipX < hm.x || wr.ipY < hm.y || wr.ipX >= hm.x + hm.w || wr.ipY >= hm.y + hm.h)) {
        wr.leftHomeAt = this.t;
        this.log("left", `${wr.name} left its start room`, wr.id);
      }
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
      this.setOwner(c, NONE);
      const ok = this.unreached(wr).length === 0;
      this.setOwner(c, wr.id);
      if (ok) {
        drop = c;
        break;
      }
    }
    const lost = GLYPHS[this.code[drop]] ?? ".";
    this.setOwner(drop, NONE);
    this.code[drop] = 0;
    wr.cellCount--;
    this.log("shed", `${wr.name} shed ${lost === "." ? "fat" : `code '${lost}'`} (max size ${Math.floor(wr.maxSize)})`, wr.id);
  }
  checkOver() {
    let living = 0;
    for (const w of this.warriors) if (w.alive) living++;
    if (living > 1 && this.t < CONFIG.tickCap) return;
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
  /** The point instruction offsets are measured from. */
  frame(wr) {
    return [wr.ox, wr.oy];
  }
  pop(wr) {
    return wr.stack.length ? wr.stack.pop() : 0;
  }
  push(wr, v) {
    wr.stack.push(v | 0);
    if (wr.stack.length > CONFIG.stackMax) wr.stack.shift();
  }
  /** Move the IP to the next own cell in its direction, wrapping within the body. */
  advance(wr) {
    const { w, h, owner } = this;
    const id = wr.id, dir = wr.dir;
    const horiz = dir === 0 || dir === 2;
    const step = dir === 0 ? 1 : dir === 2 ? -1 : dir === 1 ? w : -w;
    const pos = horiz ? wr.ipX : wr.ipY;
    const len = horiz ? w : h;
    const fwd = dir === 0 || dir === 1;
    const start = wr.ipY * w + wr.ipX;
    let i = start + step;
    for (let p = pos + (fwd ? 1 : -1); fwd ? p < len : p >= 0; p += fwd ? 1 : -1, i += step) {
      if (owner[i] === id) {
        this.setIp(wr, i);
        return;
      }
    }
    i = start - step * (fwd ? pos : len - 1 - pos);
    for (let p = fwd ? 0 : len - 1; p !== pos; p += fwd ? 1 : -1, i += step) {
      if (owner[i] === id) {
        this.setIp(wr, i);
        return;
      }
    }
  }
  setIp(wr, i) {
    wr.ipX = i % this.w;
    wr.ipY = i / this.w | 0;
  }
  /** Execute one instruction. Returns its cycle cost. */
  step(wr) {
    const g = GLYPHS[this.code[this.idx(wr.ipX, wr.ipY)]] ?? ".";
    wr.executed++;
    let skip = false;
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
        wr.dir = this.pop(wr) === 0 ? 0 : 2;
        break;
      case "|":
        wr.dir = this.pop(wr) === 0 ? 1 : 3;
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
        const a = this.pop(wr);
        this.push(wr, a);
        this.push(wr, a);
        break;
      }
      case "\\": {
        const b = this.pop(wr), a = this.pop(wr);
        this.push(wr, b);
        this.push(wr, a);
        break;
      }
      case "$":
        this.pop(wr);
        break;
      case "o": {
        const b = this.pop(wr), a = this.pop(wr);
        this.push(wr, a);
        this.push(wr, b);
        this.push(wr, a);
        break;
      }
      case "+": {
        const b = this.pop(wr), a = this.pop(wr);
        this.push(wr, a + b);
        break;
      }
      case "-": {
        const b = this.pop(wr), a = this.pop(wr);
        this.push(wr, a - b);
        break;
      }
      case "*": {
        const b = this.pop(wr), a = this.pop(wr);
        this.push(wr, a * b);
        break;
      }
      case "/": {
        const b = this.pop(wr), a = this.pop(wr);
        this.push(wr, b === 0 ? 0 : Math.trunc(a / b));
        break;
      }
      case "%": {
        const b = this.pop(wr), a = this.pop(wr);
        this.push(wr, b === 0 ? 0 : a % b);
        break;
      }
      case "!":
        this.push(wr, this.pop(wr) === 0 ? 1 : 0);
        break;
      case "`": {
        const b = this.pop(wr), a = this.pop(wr);
        this.push(wr, a > b ? 1 : 0);
        break;
      }
      case "=": {
        const b = this.pop(wr), a = this.pop(wr);
        this.push(wr, a === b ? 1 : 0);
        break;
      }
      case "'": {
        const sx = wr.ipX, sy = wr.ipY;
        this.advance(wr);
        this.push(wr, this.code[this.idx(wr.ipX, wr.ipY)]);
        wr.ipX = sx;
        wr.ipY = sy;
        skip = true;
        break;
      }
      case "y": {
        const n = this.pop(wr);
        this.push(wr, n > 0 ? Math.floor(this.rng() * n) : 0);
        break;
      }
      case "s":
        this.push(wr, wr.cellCount);
        break;
      case "m":
        this.push(wr, Math.floor(wr.maxSize));
        break;
      case "f":
        this.push(wr, Math.floor(wr.speed * 10));
        break;
      case "d":
        this.push(wr, wr.dir);
        break;
      case "e":
        this.push(wr, wr.lastOk ? 1 : 0);
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
        const dy = this.pop(wr), dx = this.pop(wr);
        if (dx === 0 && dy === 0) this.push(wr, Math.floor(this.rng() * 4));
        else if (Math.abs(dx) >= Math.abs(dy)) this.push(wr, dx > 0 ? 0 : 2);
        else this.push(wr, dy > 0 ? 1 : 3);
        break;
      }
      case "M":
        wr.lastOk = this.opShift(wr, this.pop(wr));
        break;
      case "F": {
        const d = this.pop(wr), dy = this.pop(wr), dx = this.pop(wr);
        wr.lastOk = this.opFlow(wr, dx, dy, d);
        break;
      }
      case "X": {
        const dy2 = this.pop(wr), dx2 = this.pop(wr), dy1 = this.pop(wr), dx1 = this.pop(wr);
        wr.lastOk = this.opSwap(wr, dx1, dy1, dx2, dy2);
        break;
      }
      case "G": {
        const c = this.pop(wr), d = this.pop(wr);
        wr.lastOk = this.opGrow(wr, d, c);
        break;
      }
      case "C":
        wr.lastOk = this.opCollect(wr);
        break;
      case "B": {
        const dy = this.pop(wr), dx = this.pop(wr);
        wr.lastOk = this.opBomb(wr, dx, dy);
        break;
      }
      case "W": {
        const c = this.pop(wr), dy = this.pop(wr), dx = this.pop(wr);
        wr.lastOk = this.opWrite(wr, dx, dy, c);
        break;
      }
      default:
        if (g >= "0" && g <= "9") this.push(wr, g.charCodeAt(0) - 48);
        break;
    }
    if ("MFXGCBW".includes(g)) wr.lastAct = g;
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
    const [fx, fy] = this.frame(wr);
    const x0 = Math.max(0, wr.ipX - r - 16), x1 = Math.min(this.w - 1, wr.ipX + r + 16);
    const y0 = Math.max(0, wr.ipY - r - 16), y1 = Math.min(this.h - 1, wr.ipY + r + 16);
    const cands = [];
    const consider = (i) => {
      const x = i % this.w, y = i / this.w | 0;
      if (x < x0 || x > x1 || y < y0 || y > y1) return;
      const t = this.classify(x, y, wr.id);
      const match = type === T_RESOURCE ? t === T_SIZE || t === T_SPEED : t === type;
      if (!match || t === T_WALL || t === T_NOTHING) return;
      cands.push([Math.abs(x - fx) + Math.abs(y - fy), i, x, y]);
    };
    if (type === T_ENEMY) {
      for (const other of this.warriors) if (other.id !== wr.id) for (const i of this.cellSets.get(other.id) ?? []) consider(i);
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
    this.push(wr, 0);
    this.push(wr, 0);
    this.push(wr, 0);
  }
  opRead(wr) {
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
  opFlow(wr, dx, dy, d) {
    d = (d % 4 + 4) % 4;
    const [fx, fy] = this.frame(wr);
    const x = fx + dx, y = fy + dy;
    const nx = x + DX[d], ny = y + DY[d];
    if (this.ownerAt(x, y) !== wr.id || !this.isFree(nx, ny)) return false;
    const from = this.idx(x, y), to = this.idx(nx, ny);
    const isIp = x === wr.ipX && y === wr.ipY;
    this.setOwner(to, wr.id);
    this.code[to] = this.code[from];
    this.setOwner(from, NONE);
    this.code[from] = 0;
    if (isIp) {
      wr.ipX = nx;
      wr.ipY = ny;
    }
    if (this.unreached(wr).length) {
      this.setOwner(from, wr.id);
      this.code[from] = this.code[to];
      this.setOwner(to, NONE);
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
    const [fx, fy] = this.frame(wr);
    const a = [fx + dx1, fy + dy1], b = [fx + dx2, fy + dy2];
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
    this.setOwner(i, wr.id);
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
  opBomb(wr, dx, dy) {
    const [fx, fy] = this.frame(wr);
    const x = fx + dx, y = fy + dy;
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
    const [fx, fy] = this.frame(wr);
    const x = fx + dx, y = fy + dy;
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

// src/ga/genome.ts
var WEIGHTS = {
  ".": 1,
  ">": 1,
  "<": 1,
  "^": 1,
  "v": 1,
  "_": 0.7,
  "|": 0.7,
  "#": 0.5,
  "?": 0.5,
  "@": 0.2,
  r: 0.5,
  "[": 0.5,
  "]": 0.5,
  ":": 1,
  "\\": 1,
  $: 1,
  o: 1,
  "+": 0.6,
  "-": 0.6,
  "*": 0.4,
  "/": 0.3,
  "%": 0.3,
  "!": 0.6,
  "`": 0.5,
  "=": 0.4,
  "'": 0.4,
  y: 0.6,
  s: 0.3,
  m: 0.3,
  f: 0.2,
  d: 0.5,
  e: 0.8,
  L: 0.8,
  S: 2,
  R: 0.6,
  T: 2,
  M: 2,
  F: 0.6,
  X: 0.4,
  G: 0.8,
  C: 2,
  B: 1.5,
  W: 1.5
};
for (let d = 0; d <= 9; d++) WEIGHTS[String(d)] = 0.35;
var TABLE = [...GLYPHS].map((g, i) => [i, WEIGHTS[g] ?? 0.3]);
var TOTAL = TABLE.reduce((a, [, w]) => a + w, 0);
function randomCode(rng) {
  let r = rng() * TOTAL;
  for (const [c, w] of TABLE) if ((r -= w) <= 0) return c;
  return 0;
}
var pick = (rng, xs) => xs[Math.floor(rng() * xs.length)];
var key = (x, y) => `${x},${y}`;
function clone(g) {
  return { cells: g.cells.map((c) => ({ ...c })), ip: { ...g.ip }, dir: g.dir };
}
function fromSpec(s) {
  return { cells: s.cells.map((c) => ({ ...c })), ip: { ...s.ip }, dir: s.dir };
}
function toText(g, name, comments = []) {
  const xs = g.cells.map((c) => c.x), ys = g.cells.map((c) => c.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
  const grid = Array.from({ length: y1 - y0 + 1 }, () => Array(x1 - x0 + 1).fill(" "));
  for (const c of g.cells) grid[c.y - y0][c.x - x0] = GLYPHS[c.code];
  return [
    `name: ${name}`,
    ...comments.map((c) => `# ${c}`),
    `dir: ${DIR_NAMES[g.dir]}`,
    `ip: ${g.ip.x - x0} ${g.ip.y - y0}`,
    "---",
    ...grid.map((r) => r.join("").replace(/\s+$/, "")),
    ""
  ].join("\n");
}
function repair(g) {
  const at = new Map(g.cells.map((c) => [key(c.x, c.y), c]));
  if (!at.has(key(g.ip.x, g.ip.y))) {
    const c = g.cells[0] ?? { x: 0, y: 0, code: 0 };
    if (!g.cells.length) g.cells.push(c);
    g.ip = { x: c.x, y: c.y };
    at.set(key(c.x, c.y), c);
  }
  const order = [];
  const seen = /* @__PURE__ */ new Set([key(g.ip.x, g.ip.y)]);
  const queue = [at.get(key(g.ip.x, g.ip.y))];
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q];
    order.push(c);
    for (let d = 0; d < 4; d++) {
      const k = key(c.x + DX[d], c.y + DY[d]);
      const n = at.get(k);
      if (n && !seen.has(k)) {
        seen.add(k);
        queue.push(n);
      }
    }
  }
  g.cells = order.slice(0, CONFIG.startSize);
  return g;
}
function randomGenome(rng) {
  const n = 6 + Math.floor(rng() * 15);
  const cells = [{ x: 0, y: 0, code: randomCode(rng) }];
  const taken = /* @__PURE__ */ new Set([key(0, 0)]);
  const dirW = [0.35, 0.15, 0.35, 0.15];
  while (cells.length < n) {
    const from = pick(rng, cells);
    let r = rng(), d = 0;
    while ((r -= dirW[d]) > 0) d++;
    const x = from.x + DX[d], y = from.y + DY[d];
    if (taken.has(key(x, y)) || Math.abs(y) > 3) continue;
    taken.add(key(x, y));
    cells.push({ x, y, code: randomCode(rng) });
  }
  return { cells, ip: { x: 0, y: 0 }, dir: Math.floor(rng() * 4) };
}
function freeNeighbors(g) {
  const taken = new Set(g.cells.map((c) => key(c.x, c.y)));
  const out = [];
  for (const c of g.cells) {
    for (let d = 0; d < 4; d++) {
      const x = c.x + DX[d], y = c.y + DY[d];
      if (!taken.has(key(x, y))) out.push({ x, y });
    }
  }
  return out;
}
var OPS = [
  ["point", 4],
  ["add", 2],
  ["remove", 2],
  ["dupe", 1],
  ["swap", 1],
  ["ip", 0.5],
  ["dir", 0.5]
];
var OPS_TOTAL = OPS.reduce((a, [, w]) => a + w, 0);
function mutate(g, rng) {
  const done = [];
  do {
    let r = rng() * OPS_TOTAL, op = OPS[0][0];
    for (const [name, w] of OPS) if ((r -= w) <= 0) {
      op = name;
      break;
    }
    switch (op) {
      case "point":
        pick(rng, g.cells).code = randomCode(rng);
        break;
      case "add":
      case "dupe": {
        if (g.cells.length >= CONFIG.startSize) continue;
        const spot = pick(rng, freeNeighbors(g));
        g.cells.push({ ...spot, code: op === "add" ? randomCode(rng) : pick(rng, g.cells).code });
        break;
      }
      case "remove": {
        const others = g.cells.filter((c) => c.x !== g.ip.x || c.y !== g.ip.y);
        if (!others.length) continue;
        const victim = pick(rng, others);
        g.cells = g.cells.filter((c) => c !== victim);
        repair(g);
        break;
      }
      case "swap": {
        const a = pick(rng, g.cells), b = pick(rng, g.cells);
        [a.code, b.code] = [b.code, a.code];
        break;
      }
      case "ip": {
        const c = pick(rng, g.cells);
        g.ip = { x: c.x, y: c.y };
        break;
      }
      case "dir":
        g.dir = Math.floor(rng() * 4);
        break;
    }
    done.push(op);
  } while (rng() < 0.5);
  return done;
}
function crossover(a, b, rng) {
  const child = clone(a);
  const bx = b.cells.map((c) => c.x - b.ip.x), by = b.cells.map((c) => c.y - b.ip.y);
  const rx = [Math.min(...bx), Math.max(...bx)], ry = [Math.min(...by), Math.max(...by)];
  const span = (lo, hi) => {
    const p = lo + Math.floor(rng() * (hi - lo + 1)), q = lo + Math.floor(rng() * (hi - lo + 1));
    return [Math.min(p, q), Math.max(p, q)];
  };
  const [x0, x1] = span(rx[0], rx[1]), [y0, y1] = span(ry[0], ry[1]);
  const inRect = (x, y) => x - child.ip.x >= x0 && x - child.ip.x <= x1 && y - child.ip.y >= y0 && y - child.ip.y <= y1;
  child.cells = child.cells.filter((c) => !inRect(c.x, c.y) || c.x === child.ip.x && c.y === child.ip.y);
  for (const c of b.cells) {
    const x = c.x - b.ip.x + child.ip.x, y = c.y - b.ip.y + child.ip.y;
    if (!inRect(x, y)) continue;
    const existing = child.cells.find((k) => k.x === x && k.y === y);
    if (existing) existing.code = c.code;
    else child.cells.push({ x, y, code: c.code });
  }
  return repair(child);
}

// src/sim/match.ts
function runMatch(specs, seed, opts = {}) {
  const prevCap = CONFIG.tickCap;
  if (opts.tickCap) CONFIG.tickCap = opts.tickCap;
  try {
    const world = new World(seed, specs);
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

// src/ga/job.ts
function runJob(j) {
  const me = j.me;
  try {
    const specs = j.warriors.map((t) => parseWarrior(t));
    const { world } = runMatch(specs, j.seed, { tickCap: j.ticks });
    const w = world.warriors[me];
    const r = world.result;
    let score = 0;
    if (r.winner === me) score = r.reason === "last standing" ? 3 : 2;
    else if (r.winner === null) score = 1;
    score += Math.min(0.5, 0.05 * w.stats.collected);
    score += Math.min(1, 0.1 * w.stats.bombHits);
    score += Math.min(1, 0.25 * w.stats.poisonWrites);
    score += Math.min(1, 0.5 * w.stats.kills);
    score += 0.5 * ((w.alive ? world.t : w.diedAt ?? 0) / world.t);
    return {
      score,
      win: r.winner === me,
      loss: r.winner !== null && r.winner !== me,
      kill: world.warriors.some((x) => !x.alive),
      hits: w.stats.bombHits,
      poisons: w.stats.poisonWrites,
      collected: w.stats.collected,
      left: w.leftHomeAt !== void 0
    };
  } catch {
    return { score: 0, win: false, loss: true, kill: false, hits: 0, poisons: 0, collected: 0, left: false };
  }
}
function duel(a, b, seed, swap, ticks) {
  return { warriors: swap ? [b, a] : [a, b], me: swap ? 1 : 0, seed, ticks };
}
function toBatches(jobs, size) {
  const out = [];
  for (let i = 0; i < jobs.length; i += size) {
    const warriors = [];
    const at = /* @__PURE__ */ new Map();
    const ref = (t) => {
      if (!at.has(t)) {
        at.set(t, warriors.length);
        warriors.push(t);
      }
      return at.get(t);
    };
    out.push({ warriors, jobs: jobs.slice(i, i + size).map((j) => ({ w: j.warriors.map(ref), me: j.me, seed: j.seed, ticks: j.ticks })) });
  }
  return out;
}
function runBatch(b) {
  return b.jobs.map((j) => runJob({ warriors: j.w.map((k) => b.warriors[k]), me: j.me, seed: j.seed, ticks: j.ticks }));
}

// src/ga/runner.ts
import { readFileSync } from "node:fs";
import { parentPort, Worker } from "node:worker_threads";

// ../../platforms/potluck/client.mjs
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
var Potluck = class _Potluck {
  /** @param {string} url  e.g. http://localhost:7700 */
  constructor(url, { timeoutMs = 5e3 } = {}) {
    this.url = url.replace(/\/$/, "");
    this.timeoutMs = timeoutMs;
  }
  /** A client if the server answers, else null. */
  static async connect(url, opts) {
    const p = new _Potluck(url, opts);
    try {
      await p.status();
      return p;
    } catch {
      return null;
    }
  }
  async req(method, path, body, timeoutMs = this.timeoutMs) {
    const r = await fetch(this.url + path, {
      method,
      headers: body ? { "content-type": "application/json" } : void 0,
      body: body ? JSON.stringify(body) : void 0,
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : void 0
    });
    if (!r.ok) throw new Error(`potluck ${path}: ${r.status} ${await r.text()}`);
    return r.json();
  }
  /** Register a task module (browser-safe ESM exporting run(input), optionally canary()). Returns its id. */
  async registerTask(name, code) {
    return (await this.req("POST", "/api/tasks", { name, code })).id;
  }
  status() {
    return this.req("GET", "/api/status");
  }
  /** Worker threads right now: live (seen recently), verified (passed this task's canary), leased (busy on it). */
  capacity(task) {
    return this.req("GET", `/api/capacity?task=${task}`);
  }
  async submit(task, inputs = [], leaseMs) {
    return (await this.req("POST", "/api/jobs", { task, inputs, leaseMs })).job;
  }
  async add(job, inputs) {
    return (await this.req("POST", `/api/jobs/${job}/add`, { inputs })).first;
  }
  /** Finished outputs since `cursor`: { done: [[index, output]...], cursor, remaining }. */
  poll(job, cursor = 0) {
    return this.req("GET", `/api/jobs/${job}?cursor=${cursor}`);
  }
  cancel(job) {
    return this.req("POST", `/api/jobs/${job}/cancel`);
  }
  /** Blocking: every input on the farm, nothing local. Only for when a farm is certain to have workers. */
  async run(task, inputs) {
    return (await this.req("POST", "/api/run", { task, inputs }, 0)).outputs;
  }
};
async function runHybrid({ inputs, local, concurrency, farm = null, task = null, pollMs = 250, onFarmError }) {
  const n = inputs.length;
  const outputs = new Array(n);
  const finished = new Uint8Array(n);
  const stats = { local: 0, farm: 0, rerun: 0 };
  let left = n;
  let front = 0, back = n - 1;
  const atFarm = /* @__PURE__ */ new Set();
  const rerun = /* @__PURE__ */ new Set();
  let farmOn = !!(farm && task);
  let allDone;
  const done = new Promise((r) => {
    allDone = r;
  });
  const complete = (i, out, where) => {
    if (finished[i]) return;
    finished[i] = 1;
    outputs[i] = out;
    atFarm.delete(i);
    stats[where]++;
    if (--left === 0) allDone();
  };
  if (n === 0) allDone();
  const nextLocal = () => {
    if (front <= back) return front++;
    for (const i of atFarm) if (!finished[i] && !rerun.has(i)) {
      rerun.add(i);
      stats.rerun++;
      return i;
    }
    return -1;
  };
  const runner = async () => {
    for (let i = nextLocal(); i >= 0; i = nextLocal()) complete(i, await local(inputs[i]), "local");
  };
  const feeder = async () => {
    let job = null, cursor = 0;
    const map = [];
    while (left > 0 && farmOn) {
      try {
        const cap = await farm.capacity(task);
        const target = cap.verified > 0 ? cap.verified * 2 : cap.live > 0 ? 1 : 0;
        const want = Math.min(target - atFarm.size, back - front + 1);
        if (want > 0) {
          const idx = [];
          for (let k = 0; k < want; k++) {
            idx.push(back);
            atFarm.add(back--);
          }
          const batch = idx.map((i) => inputs[i]);
          let first;
          if (!job) {
            job = await farm.submit(task, batch);
            first = 0;
          } else first = await farm.add(job, batch);
          idx.forEach((i, k) => {
            map[first + k] = i;
          });
        }
        if (job) {
          const r = await farm.poll(job, cursor);
          cursor = r.cursor;
          for (const [fi, out] of r.done) complete(map[fi], out, "farm");
        }
      } catch (e) {
        farmOn = false;
        onFarmError?.(e);
        break;
      }
      if (left > 0) await sleep(pollMs);
    }
    if (job) farm.cancel(job).catch(() => {
    });
  };
  const runners = Array.from({ length: concurrency }, runner);
  const feeding = farmOn ? feeder() : Promise.resolve();
  if (concurrency > 0) {
    await Promise.all(runners);
    farmOn = false;
  } else {
    await Promise.race([done, feeding.then(() => {
      if (left > 0) throw new Error("farm stopped with work left and no local runners");
    })]);
  }
  await done;
  return { outputs, stats };
}

// src/ga/runner.ts
function serveBatches() {
  parentPort.on("message", (batch) => parentPort.postMessage(runBatch(batch)));
}
var ThreadPool = class {
  free;
  waiting = [];
  size;
  constructor(n) {
    this.free = Array.from({ length: n }, () => new Worker(new URL(import.meta.url)));
    this.size = n;
  }
  async runBatch(batch) {
    const w = this.free.pop() ?? await new Promise((r) => this.waiting.push(r));
    try {
      return await new Promise((res) => {
        w.once("message", res);
        w.postMessage(batch);
      });
    } finally {
      const next = this.waiting.shift();
      if (next) next(w);
      else this.free.push(w);
    }
  }
  close() {
    for (const w of [...this.free]) w.terminate();
  }
};
var Runner = class {
  constructor(threads, farmUrl, batchSize = 24) {
    this.threads = threads;
    this.farmUrl = farmUrl;
    this.batchSize = batchSize;
  }
  farm = null;
  task = null;
  code = "";
  farmDown = false;
  async init() {
    if (!this.farmUrl) return;
    this.code = readFileSync(new URL("./farm-task.mjs", import.meta.url), "utf8");
    this.farm = new Potluck(this.farmUrl);
    await this.register();
  }
  /** (Re-)register the task; a restarted server has forgotten it. Fails fast if the server is down. */
  async register() {
    try {
      const wasUp = !this.farmDown && this.task !== null;
      this.task = await this.farm.registerTask("andnow-matches", this.code);
      if (!wasUp) console.log(`potluck: task ${this.task} registered at ${this.farmUrl}; open it on any machine to help`);
      this.farmDown = false;
    } catch {
      if (!this.farmDown) console.log(`potluck: ${this.farmUrl} not reachable; running locally (will keep trying)`);
      this.task = null;
      this.farmDown = true;
    }
  }
  lastStats = { local: 0, farm: 0, rerun: 0 };
  async run(jobs) {
    if (this.farm && this.farmDown) await this.register();
    const { outputs, stats } = await runHybrid({
      inputs: toBatches(jobs, this.batchSize),
      local: (b) => this.threads.runBatch(b),
      concurrency: this.threads.size,
      farm: this.farmDown ? null : this.farm,
      task: this.task,
      onFarmError: (e) => {
        console.log(`potluck: lost the farm (${e.message}); running locally (will keep trying)`);
        this.farmDown = true;
      }
    });
    this.lastStats = stats;
    return outputs.flat();
  }
  close() {
    this.threads.close();
  }
};

// src/map-elites.ts
var WEAPONS = ["none", "bomber", "mixed", "poisoner"];
var ECONOMY = [0.5, 1, 2, 4];
var MOBILITY = [0.25, 0.5, 0.75];
var bin = (v, bounds) => {
  let k = 0;
  while (k < bounds.length && v >= bounds[k]) k++;
  return k;
};
var keyOf = (d) => `${d.weapon}-${d.economy}-${d.mobility}`;
function describe(rs) {
  const n = rs.length || 1;
  const hits = rs.reduce((a, r) => a + r.hits, 0) / n;
  const poisons = rs.reduce((a, r) => a + r.poisons, 0) / n;
  const collected = rs.reduce((a, r) => a + r.collected, 0) / n;
  const leftRate = rs.filter((r) => r.left).length / n;
  const attacks = hits + poisons;
  const share = attacks > 0 ? poisons / attacks : 0;
  const weapon = attacks < 0.05 ? 0 : share < 0.2 ? 1 : share < 0.8 ? 2 : 3;
  return {
    desc: { weapon, economy: bin(collected, ECONOMY), mobility: bin(leftRate, MOBILITY) },
    stats: { hitsPerGame: hits, poisonsPerGame: poisons, collectedPerGame: collected, leftRate }
  };
}
async function main() {
  const args = process.argv.slice(2);
  const opt = (k, d) => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? Number(args[i + 1]) : d;
  };
  const str = (k, d) => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : d;
  };
  const GENS = opt("gens", 200), BATCH = opt("batch", 256), REEVAL = opt("reeval", 64), SEEDS = opt("seeds", 2), BOARDS = opt("boards", 6);
  const TICKS = opt("ticks", 3e3), PEERS = opt("peers", 6), FFA = opt("ffa", 4), WORKERS = opt("workers", availableParallelism());
  const NAME = str("name", `map-${Date.now()}`), FARM = str("farm", "");
  const rng = makeRng(opt("rng", 1));
  const runDir = join("runs", NAME);
  mkdirSync(runDir, { recursive: true });
  const benchFiles = str("bench", "warriors").split(",").flatMap((p) => p.endsWith(".warrior") ? [p] : readdirSync(p).filter((f) => f.endsWith(".warrior")).sort().map((f) => join(p, f)));
  const bench = benchFiles.map((f) => readFileSync2(f, "utf8"));
  const pool = new Runner(new ThreadPool(WORKERS), FARM);
  await pool.init();
  console.log(`map-elites ${NAME}: ${GENS} gens \xD7 ${BATCH} offspring, ${BOARDS} boards/gen, ${TICKS} ticks, ${WORKERS} threads${FARM ? ` + potluck farm ${FARM}` : ""}`);
  console.log(`niches: ${WEAPONS.length} weapon \xD7 ${ECONOMY.length + 1} economy \xD7 ${MOBILITY.length + 1} mobility = ${WEAPONS.length * (ECONOMY.length + 1) * (MOBILITY.length + 1)}; benchmarks: ${benchFiles.map((f) => basename(f, ".warrior")).join(", ")}`);
  const archive = /* @__PURE__ */ new Map();
  let serial = 0;
  const pick2 = (xs) => xs[Math.floor(rng() * xs.length)];
  const saveArchive = () => writeFileSync(join(runDir, "archive.json"), JSON.stringify(
    [...archive.entries()].map(([k, e]) => ({ niche: k, weapon: WEAPONS[e.desc.weapon], ...e, g: void 0 })),
    null,
    1
  ));
  for (let gen = 0; gen < GENS; gen++) {
    const t0 = Date.now();
    const cands = [];
    if (archive.size === 0) {
      for (const src of bench) {
        cands.push({ g: fromSpec(parseWarrior(src)), parents: `seed:${parseWarrior(src).name}` });
        const m = fromSpec(parseWarrior(src));
        mutate(m, rng);
        cands.push({ g: m, parents: `mutant:${parseWarrior(src).name}` });
      }
      while (cands.length < BATCH) cands.push({ g: randomGenome(rng), parents: "random" });
    } else {
      const elites2 = [...archive.values()];
      while (cands.length < BATCH) {
        const p1 = pick2(elites2);
        if (rng() < 0.3) {
          const p2 = pick2(elites2);
          const g = crossover(p1.g, p2.g, rng);
          if (rng() < 0.5) mutate(g, rng);
          cands.push({ g, parents: `${p1.name}\xD7${p2.name}` });
        } else {
          const g = clone(p1.g);
          cands.push({ g, parents: `${p1.name}+${mutate(g, rng).join(",")}` });
        }
      }
    }
    const reevals = [...archive.entries()].sort(() => rng() - 0.5).slice(0, REEVAL).map(([key2, e]) => ({ g: e.g, parents: e.parents, name: e.name, text: e.text, reeval: key2 }));
    const inds = [
      ...reevals,
      ...cands.map((c) => {
        const name = `m${gen}-${serial++}`;
        return { ...c, name, text: toText(c.g, name) };
      })
    ];
    const boardPool = Array.from({ length: BOARDS }, () => 1 + Math.floor(rng() * 1e6));
    const boardsFor = (k) => Array.from({ length: SEEDS }, (_, s) => boardPool[(k * SEEDS + s) % BOARDS]);
    const eliteTexts = [...archive.values()].map((e) => e.text);
    const jobs = [];
    const counts = [];
    for (const ind of inds) {
      const opponents = [...bench];
      for (let k = 0; k < PEERS && eliteTexts.length; k++) opponents.push(pick2(eliteTexts));
      opponents.forEach((opp, k) => boardsFor(k).forEach((seed, s) => jobs.push(duel(ind.text, opp, seed, s % 2 === 1, TICKS))));
      for (let k = 0; k < FFA; k++) {
        const others = Array.from({ length: 3 }, () => pick2(opponents));
        const me = k % 4;
        others.splice(me, 0, ind.text);
        jobs.push({ warriors: others, me, seed: boardPool[k % BOARDS], ticks: TICKS });
      }
      counts.push(opponents.length * SEEDS + FFA);
    }
    const results = await pool.run(jobs);
    let at = 0, added = 0, replaced = 0;
    inds.forEach((ind, i) => {
      const rs = results.slice(at, at + counts[i]);
      at += counts[i];
      const sum = rs.reduce((a, r) => a + r.score, 0);
      if (ind.reeval) {
        const cur2 = archive.get(ind.reeval);
        if (cur2 && cur2.text === ind.text) {
          cur2.scoreSum += sum;
          cur2.games += rs.length;
          cur2.wins += rs.filter((r) => r.win).length;
          cur2.fitness = cur2.scoreSum / cur2.games;
        }
        return;
      }
      const e = {
        g: ind.g,
        name: ind.name,
        text: ind.text,
        parents: ind.parents,
        gen,
        fitness: sum / rs.length,
        scoreSum: sum,
        wins: rs.filter((r) => r.win).length,
        games: rs.length,
        ...describe(rs)
      };
      const k = keyOf(e.desc);
      const cur = archive.get(k);
      if (!cur) {
        archive.set(k, e);
        added++;
      } else if (e.fitness > cur.fitness) {
        archive.set(k, e);
        replaced++;
      }
    });
    const elites = [...archive.values()];
    const byWeapon = WEAPONS.map((_, w) => elites.filter((e) => e.desc.weapon === w));
    const best = elites.reduce((a, e) => e.fitness > a.fitness ? e : a, elites[0]);
    const line = {
      gen,
      filled: archive.size,
      added,
      replaced,
      best: +best.fitness.toFixed(3),
      mean: +(elites.reduce((a, e) => a + e.fitness, 0) / elites.length).toFixed(3),
      byWeapon: Object.fromEntries(WEAPONS.map((w, k) => [w, { niches: byWeapon[k].length, best: +Math.max(0, ...byWeapon[k].map((e) => e.fitness)).toFixed(2) }])),
      ms: Date.now() - t0,
      batches: pool.lastStats
    };
    appendFileSync(join(runDir, "log.jsonl"), JSON.stringify(line) + "\n");
    const wb = WEAPONS.map((w, k) => `${w} ${byWeapon[k].length}/${line.byWeapon[w].best.toFixed(2)}`).join("  ");
    console.log(`gen ${String(gen).padStart(3)}  slots ${String(archive.size).padStart(3)} (+${added}, ${replaced} better)  best ${line.best.toFixed(2)}  mean ${line.mean.toFixed(2)}  |  ${wb}  (${line.ms}ms${FARM ? `, farm ${pool.lastStats.farm}/${pool.lastStats.farm + pool.lastStats.local}` : ""})`);
    if (gen % 10 === 9) saveArchive();
  }
  saveArchive();
  console.log("\nthe map (fitness per slot; rows = pickups/game, columns = share of games it left home):");
  const ecoLabels = ["0\u2013\xBD", "\xBD\u20131", "1\u20132", "2\u20134", "4+"], mobLabels = ["0\u2013\xBC", "\xBC\u2013\xBD", "\xBD\u2013\xBE", "\xBE\u20131"];
  WEAPONS.forEach((w, wi) => {
    console.log(`
  ${w}`);
    console.log("         " + mobLabels.map((l) => l.padStart(6)).join(""));
    ecoLabels.forEach((el, ei) => {
      const row = mobLabels.map((_, mi) => {
        const e = archive.get(`${wi}-${ei}-${mi}`);
        return (e ? e.fitness.toFixed(2) : "  \xB7 ").padStart(6);
      });
      console.log(`  ${el.padEnd(6)} ${row.join("")}`);
    });
  });
  const outDir = join("warriors", "evolved");
  mkdirSync(outDir, { recursive: true });
  const manifestPath = join(outDir, "manifest.json");
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync2(manifestPath, "utf8")) : [];
  console.log("\nbest of each weapon class:");
  WEAPONS.forEach((w, wi) => {
    const es = [...archive.values()].filter((e2) => e2.desc.weapon === wi);
    if (!es.length) return;
    const e = es.reduce((a, b) => b.fitness > a.fitness ? b : a);
    const name = `${NAME}-${w}`;
    writeFileSync(join(outDir, `${name}.warrior`), toText(e.g, name, [
      `map-elites run ${NAME}, slot ${keyOf(e.desc)} (${w}), was ${e.name} (gen ${e.gen}, parents ${e.parents})`,
      `fitness ${e.fitness.toFixed(2)}; ${e.wins}W of ${e.games}; per game: ${e.stats.hitsPerGame.toFixed(2)} bomb hits, ${e.stats.poisonsPerGame.toFixed(2)} poison writes, ${e.stats.collectedPerGame.toFixed(2)} pickups; left home in ${(100 * e.stats.leftRate).toFixed(0)}% of games`
    ]));
    if (!manifest.includes(`${name}.warrior`)) manifest.push(`${name}.warrior`);
    console.log(`  ${name.padEnd(20)} fitness ${e.fitness.toFixed(2)}  ${e.stats.hitsPerGame.toFixed(2)} hits, ${e.stats.poisonsPerGame.toFixed(2)} poison, ${e.stats.collectedPerGame.toFixed(2)} pickups /game, left home ${(100 * e.stats.leftRate).toFixed(0)}%`);
  });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  pool.close();
}
if (!isMainThread) serveBatches();
else main().catch((e) => {
  console.error(e);
  process.exit(1);
});
//# sourceMappingURL=map.mjs.map

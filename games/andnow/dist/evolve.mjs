// src/evolve.ts
import { mkdirSync, readdirSync, readFileSync as readFileSync2, writeFileSync, appendFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { basename, join } from "node:path";
import { isMainThread } from "node:worker_threads";

// src/sim/glyphs.ts
var GLYPHS = ".><^v_|#?@r[]0123456789:\\$o+-*/%!`='ysmfdeLSRTMFXGCBWDAK";
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
var WIDTHS = [1, 1, 2, 2, 3, 4];
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
function widestExit(terrain, w, r) {
  let widest = 0;
  const sides = [
    [r.x, r.y - 1, 1, 0, r.w],
    [r.x, r.y + r.h, 1, 0, r.w],
    [r.x - 1, r.y, 0, 1, r.h],
    [r.x + r.w, r.y, 0, 1, r.h]
  ];
  for (const [x0, y0, dx, dy, n] of sides) {
    let run = 0;
    for (let k = 0; k < n; k++) {
      run = terrain[(y0 + k * dy) * w + x0 + k * dx] === FLOOR ? run + 1 : 0;
      if (run > widest) widest = run;
    }
  }
  return widest;
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
        room.x = Math.min(room.x, x0 + cw - rw - 1);
        room.y = Math.min(room.y, y0 + ch - rh - 1);
      }
      if (c === qcols - 1 && rng() < 0.25 && !start) room.w = hw - room.x;
      if (r === qrows - 1 && rng() < 0.25 && !start) room.h = hh - room.y;
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
    let cw = WIDTHS[Math.floor(rng() * WIDTHS.length)];
    if (r1 === 0 && c1 === 0 || r2 === 0 && c2 === 0) {
      cw = Math.min(cw, 2);
      startExits.push(cw);
    }
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
  if (!startExits.some((cw) => cw >= 2)) {
    const [r, c] = qcols > 1 ? [0, 1] : [1, 0];
    corridor(rooms[0][0], rooms[r][c], 2);
  }
  const crossRight = rooms.map((row) => row[qcols - 1]);
  const crossDown = rooms[qrows - 1];
  const cross = (list, horizontal) => {
    let any = list.some((a) => horizontal ? a.x + a.w >= hw : a.y + a.h >= hh);
    list.forEach((a, i) => {
      const touches = horizontal ? a.x + a.w >= hw : a.y + a.h >= hh;
      if (touches || any && rng() < 0.5 && i !== list.length - 1) return;
      const cw = a === rooms[0][0] ? Math.min(2, WIDTHS[Math.floor(rng() * WIDTHS.length)]) : WIDTHS[Math.floor(rng() * WIDTHS.length)];
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
  if (widestExit(terrain, w, starts[0]) > 2) return null;
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
  const listed = /* @__PURE__ */ new Set();
  const allRooms = rooms.flat().flatMap((r) => {
    const hall = { x: r.x, y: r.y, w: r.x + r.w === hw ? 2 * r.w : r.w, h: r.y + r.h === hh ? 2 * r.h : r.h };
    return startsFrom(hall).filter((m) => {
      const k = `${m.x},${m.y},${m.w},${m.h}`;
      return !listed.has(k) && !!listed.add(k);
    });
  });
  return { w, h, terrain, spawns, starts, rooms: allRooms };
}
function makePlate(seed, size, bands, foodSpacing) {
  const w = size, h = size, c = (size - 1) / 2, R = size / 2 - 1;
  const rng = makeRng(seed ^ 2654435769);
  const terrain = new Uint8Array(w * h).fill(WALL);
  const toxin = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = Math.hypot(x - c, y - c);
      if (r > R) continue;
      terrain[y * w + x] = FLOOR;
      toxin[y * w + x] = Math.max(0, Math.min(bands - 1, Math.floor(r / R * (bands + 1)) - 1));
    }
  }
  const spawns = [];
  for (let y = 1; y < h - 1; y += foodSpacing) {
    for (let x = 1; x < w - 1; x += foodSpacing) {
      const px = x + randInt(rng, 0, foodSpacing - 1), py = y + randInt(rng, 0, foodSpacing - 1);
      if (px < w && py < h && terrain[py * w + px] === FLOOR) spawns.push({ x: px, y: py, kind: rng() < 0.2 ? 2 : 1 });
    }
  }
  const s = Math.floor(2 * R / (bands + 1));
  const start = { x: Math.round(c - s / Math.SQRT2), y: Math.round(c - s / Math.SQRT2), w: Math.floor(s * Math.SQRT2), h: Math.floor(s * Math.SQRT2) };
  return { w, h, terrain, spawns, starts: [start], rooms: [], toxin };
}

// src/sim/world.ts
var NONE = -1;
var K = CODE["K"];
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
  sizeCap: 64,
  startSize: 40,
  // every warrior starts with this max size (the most cells its body may have)
  startCells: 30,
  // a warrior file holds at most this many cells: the rest of max size is room to GROW
  sizeDecay: 4e-3,
  // per tick at the starting max size; scales with √(max size / startSize), so
  // 40→8 takes ~11000 ticks and 8→starved another ~6000 (~17000 from 40)
  divideMin: 16,
  // DIVIDE needs at least this max size (and 2× its cells)
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
  tickCap: 5e3,
  copyError: 0.02,
  // DIVIDE: chance each copied cell becomes a random glyph
  maxWarriors: 64,
  // DIVIDE fails while this many warriors are alive
  reaperCap: 0,
  // petri dish: with this many alive, a birth kills the oldest living warrior (0 = off)
  lifespan: 0,
  // petri dish: typical lifespan in ticks; each warrior's is 50–150% of it (0 = off)
  endless: false,
  // petri dish: don't end when one lineage is left (only the tick cap ends it)
  plate: 0,
  // petri dish: board is a round plate this many cells across (0 = rooms board)
  plateBands: 5,
  // plate: toxin levels, clean middle (0) to rim (bands-1)
  plateFood: 5,
  // plate: about one food spot per this many cells squared
  toxinRate: 1e-3,
  // plate: each tick, a cell one toxin level above my armor (K count) dies with this chance…
  toxinStep: 10,
  // …and each further level multiplies it by this (MEGA-plate bands were 10× steps)
  foodRipen: 0,
  // petri dish: an uneaten size pickup grows by one pickup's worth every this many ticks (0 = off)…
  foodRipeMax: 5,
  // …up to this many pickups' worth
  copyInsert: 0,
  // DIVIDE: chance the child gains a fat cell (.) stuck to its body
  copyDelete: 0
  // DIVIDE: chance the child loses one cell (never its IP cell; stays connected)
};
var World = class {
  constructor(seed, specs) {
    this.seed = seed;
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
  board;
  w;
  h;
  owner;
  code;
  resource;
  // 0 none, 1 size, 2 speed
  ripe;
  // size pickups: how many pickups' worth (1 when it appears; grows with foodRipen)
  /** Floor cells in a passage at most 2 wide (the floor run through them, across or down, is ≤ 2). */
  narrow;
  warriors = [];
  /** The living warriors (a long dish has far more dead than alive). Rebuilt lazily after deaths. */
  livingList = [];
  livingDirty = false;
  bornIn = /* @__PURE__ */ new Map();
  // lineage → warriors born so far (for names)
  t = 0;
  rng;
  events = [];
  result = { over: false, winner: null, reason: "" };
  spawnTimers;
  // ---------- setup ----------
  place(spec, id) {
    if (spec.cells.length > CONFIG.startCells) {
      throw new Error(`${spec.name} has ${spec.cells.length} cells; the limit is ${CONFIG.startCells}`);
    }
    const room = this.board.starts[id % this.board.starts.length];
    const ox = room.x + Math.floor((room.w - spec.width) / 2);
    const oy = room.y + Math.floor((room.h - spec.height) / 2);
    const wr = {
      id,
      lineage: id,
      gen: 0,
      born: 0,
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
      stats: { collected: 0, bombHits: 0, poisonWrites: 0, kills: 0, selfWrites: 0, grows: 0, swaps: 0, flows: 0, oozes: 0, squeezed: 0, rooms: 0 },
      home: room,
      roomsSeen: /* @__PURE__ */ new Set()
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
  living() {
    if (this.livingDirty) {
      this.livingList = this.livingList.filter((w) => w.alive);
      this.livingDirty = false;
    }
    return this.livingList;
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
    this.livingDirty = true;
    wr.deathReason = reason;
    wr.diedAt = this.t;
    for (const c of this.cellsOf(wr.id)) this.toDebris(c);
    this.log("death", `${wr.name} died: ${reason}`, wr.id);
    const h = wr.lastHarm;
    const killer = h && this.t - h.t <= CONFIG.creditWindow ? this.warriors[h.by] : void 0;
    if (killer && killer.alive && killer !== wr) {
      if (killer.lineage !== wr.lineage) killer.stats.kills++;
      killer.maxSize = Math.min(CONFIG.sizeCap, killer.maxSize + CONFIG.killPay * wr.maxSize);
      killer.speed = Math.min(CONFIG.speedCap, killer.speed + CONFIG.killPay * wr.speed);
      this.log("kill", `${killer.name} takes a cut of ${wr.name} (max ${Math.floor(killer.maxSize)}, speed ${killer.speed.toFixed(2)})`, killer.id);
    }
  }
  /** Destroy a cell outright (bomb). Handles core loss and disconnection. */
  /** Destroy a cell outright: a bomb (`by`), or the plate's toxin (no `by`). */
  destroy(i, by) {
    const o = this.owner[i];
    this.setOwner(i, NONE);
    this.code[i] = 0;
    if (o < 0) return;
    const victim = this.warriors[o];
    victim.cellCount--;
    if (by) victim.lastHarm = { by: by.id, t: this.t };
    if (i === this.idx(victim.ipX, victim.ipY)) {
      this.kill(victim, by ? `core bombed by ${by.name}` : "core poisoned by the toxin");
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
      if (CONFIG.foodRipen > 0 && this.resource[i] === 1) this.ripe[i] = Math.min(CONFIG.foodRipeMax, this.ripe[i] + 1 / CONFIG.foodRipen);
      let touched = this.resource[i] !== 0 || this.owner[i] !== NONE;
      for (let d = 0; d < 4 && !touched; d++) touched = this.ownerAt(s.x + DX[d], s.y + DY[d]) !== NONE;
      if (touched) {
        this.spawnTimers[k] = 0;
        continue;
      }
      if (++this.spawnTimers[k] >= CONFIG.spawnInterval) {
        this.resource[i] = s.kind;
        this.ripe[i] = 1;
        this.spawnTimers[k] = 0;
      }
    }
    const order = this.living().slice();
    const n = order.length;
    for (let k = 0; k < n; k++) {
      const wr = order[(this.t + k) % n];
      if (!wr.alive) continue;
      wr.accum += wr.speed;
      while (wr.accum >= 1 && wr.alive) wr.accum -= this.step(wr);
    }
    for (const wr of this.living().slice()) {
      if (!wr.alive) continue;
      const cells = this.cellSets.get(wr.id);
      if (cells) {
        const hm = wr.home;
        let home = 0, narrow = 0, x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
        for (const c of cells) {
          const x = c % this.w, y = c / this.w | 0;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
          if (x >= hm.x && y >= hm.y && x < hm.x + hm.w && y < hm.y + hm.h) home++;
          if (this.narrow[c]) narrow++;
        }
        if (wr.leftHomeAt === void 0 && home === 0 && cells.size > 0) {
          wr.leftHomeAt = this.t;
          this.log("left", `${wr.name} left its start room (whole body)`, wr.id);
        }
        if (cells.size >= 4 && 2 * narrow >= cells.size) wr.stats.squeezed++;
        if (home === 0) {
          this.board.rooms.forEach((r, k) => {
            if (x0 < r.x || y0 < r.y || x1 >= r.x + r.w || y1 >= r.y + r.h || wr.roomsSeen.has(k)) return;
            if (r.x === hm.x && r.y === hm.y) return;
            wr.roomsSeen.add(k);
            wr.stats.rooms++;
            this.log("room", `${wr.name} moved its whole body into another room`, wr.id);
          });
        }
      }
      const tox = this.board.toxin;
      if (tox && cells) {
        let armor = 0;
        for (const c of cells) if (this.code[c] === K) armor++;
        const doomed = [];
        for (const c of cells) {
          const over = tox[c] - armor;
          if (over > 0 && this.rng() < CONFIG.toxinRate * CONFIG.toxinStep ** (over - 1)) doomed.push(c);
        }
        for (const c of doomed) {
          if (!wr.alive) break;
          if (this.owner[c] === wr.id) this.destroy(c);
        }
        if (!wr.alive) continue;
      }
      wr.maxSize = Math.max(0, wr.maxSize - CONFIG.sizeDecay * Math.sqrt(wr.maxSize / CONFIG.startSize));
      wr.speed = Math.max(CONFIG.speedFloor, wr.speed - CONFIG.speedDecay);
      if (wr.maxSize < 1) this.kill(wr, "starved (max size fell to 0)");
      else if (wr.cellCount > Math.floor(wr.maxSize)) this.shed(wr);
      if (!wr.alive) continue;
      if (wr.cellCount <= 0) this.kill(wr, "no cells left");
      else if (wr.diesAt !== void 0 && this.t >= wr.diesAt) this.kill(wr, "old age");
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
  /** True when every living warrior is of one lineage (only possible once someone divides). */
  oneTeamLeft() {
    let team = -1;
    for (const w of this.living()) {
      if (team === -1) team = w.lineage;
      else if (w.lineage !== team) return false;
    }
    return team !== -1 && this.warriors.some((w) => w.lineage !== team);
  }
  checkOver() {
    const living = this.living().length;
    if (CONFIG.endless && this.t < CONFIG.tickCap) return;
    if (living > 1 && this.t < CONFIG.tickCap && !this.oneTeamLeft()) return;
    const founders = this.warriors.filter((w) => w.gen === 0);
    const teams = /* @__PURE__ */ new Map();
    for (const w of this.warriors) if (w.alive) teams.set(w.lineage, [...teams.get(w.lineage) ?? [], w]);
    if (founders.length > 1 && teams.size <= 1) {
      this.result = teams.size ? { over: true, winner: [...teams.keys()][0], reason: "last standing" } : { over: true, winner: null, reason: "mutual destruction" };
    } else if (founders.length === 1 && teams.size === 0) {
      this.result = { over: true, winner: null, reason: "died" };
    } else if (this.t >= CONFIG.tickCap) {
      const keys = (ms) => [
        ms.reduce((a, w) => a + w.cellCount, 0),
        ms.reduce((a, w) => a + w.maxSize, 0),
        ms.reduce((a, w) => a + w.speed, 0)
      ];
      const ranked = [...teams.entries()].map(([team, ms]) => ({ team, k: keys(ms) }));
      const cmp = (a, b) => {
        for (let k = 0; k < a.k.length; k++) if (Math.abs(a.k[k] - b.k[k]) >= 0.01) return b.k[k] - a.k[k];
        return 0;
      };
      ranked.sort(cmp);
      const tied = ranked.length > 1 && cmp(ranked[0], ranked[1]) === 0;
      const top = ranked[0], next = ranked[1];
      const by = !next || Math.abs(top.k[0] - next.k[0]) >= 0.01 ? `biggest body (${top.k[0]} cells)` : Math.abs(top.k[1] - next.k[1]) >= 0.01 ? `bodies tied, larger max size (${top.k[1].toFixed(1)})` : `bodies and max size tied, faster (${top.k[2].toFixed(2)})`;
      this.result = tied ? { over: true, winner: null, reason: "draw at tick cap" } : { over: true, winner: top.team, reason: `${by} at tick cap` };
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
    let cost = COST[g] ?? 1;
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
      case "A":
        wr.lastOk = this.opOoze(wr, this.pop(wr));
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
      case "G":
        wr.lastOk = this.opGrow(wr, this.pop(wr));
        break;
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
      // Copying costs a cycle per cell; a failed attempt costs 1.
      case "D": {
        const before = wr.cellCount;
        wr.lastOk = this.opDivide(wr, this.pop(wr));
        cost = wr.lastOk ? Math.max(1, before) : 1;
        break;
      }
      default:
        if (g >= "0" && g <= "9") this.push(wr, g.charCodeAt(0) - 48);
        break;
    }
    if ("MFXGCBWDA".includes(g)) wr.lastAct = g;
    if (!wr.alive) return cost;
    this.advance(wr);
    if (skip) this.advance(wr);
    return cost;
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
  /**
   * OOZE: amoeboid movement, one cell at a time. My rearmost cell (least far along d) that
   * can leave without splitting the body moves, code and all, to the free floor touching
   * the rest of the body that is farthest along d (ties: nearest my body's middle across
   * d). It must end up farther along d than it was. Repeated, a body pours itself through
   * any gap, its program rearranged on the way. The IP and the frame origin ride the cell
   * under them.
   */
  opOoze(wr, d) {
    d = (d % 4 + 4) % 4;
    const id = wr.id, w = this.w;
    const mine = this.cellsOf(id);
    if (mine.length < 2) return this.opShift(wr, d);
    const along = (c) => c % w * DX[d] + (c / w | 0) * DY[d];
    const across = (c) => c % w * DY[d] - (c / w | 0) * DX[d];
    let mid = 0;
    for (const c of mine) mid += across(c);
    mid /= mine.length;
    const order = mine.slice().sort((a, b) => along(a) - along(b) || a - b);
    const mineSet = this.cellSets.get(id);
    for (const src of order) {
      const rest = mine.length - 1;
      const start = mine[0] === src ? mine[1] : mine[0];
      const seen = /* @__PURE__ */ new Set([start]);
      const queue = [start];
      while (queue.length) {
        const c = queue.pop();
        const x = c % w, y = c / w | 0;
        for (let k = 0; k < 4; k++) {
          const nx = x + DX[k], ny = y + DY[k];
          if (!this.inBounds(nx, ny)) continue;
          const n = ny * w + nx;
          if (n !== src && mineSet.has(n) && !seen.has(n)) {
            seen.add(n);
            queue.push(n);
          }
        }
      }
      if (seen.size !== rest) continue;
      let best = -1, bestAlong = along(src), bestAcross = Infinity;
      for (const c of mine) {
        if (c === src) continue;
        const x = c % w, y = c / w | 0;
        for (let k = 0; k < 4; k++) {
          const nx = x + DX[k], ny = y + DY[k];
          if (!this.isFree(nx, ny)) continue;
          const t = ny * w + nx;
          const a = along(t), off = Math.abs(across(t) - mid);
          if (a > bestAlong || a === bestAlong && best >= 0 && (off < bestAcross || off === bestAcross && t < best)) {
            if (a > along(src)) {
              best = t;
              bestAlong = a;
              bestAcross = off;
            }
          }
        }
      }
      if (best < 0) return false;
      this.setOwner(best, id);
      this.code[best] = this.code[src];
      this.setOwner(src, NONE);
      this.code[src] = 0;
      const bx = best % w, by = best / w | 0, sx = src % w, sy = src / w | 0;
      if (wr.ipX === sx && wr.ipY === sy) {
        wr.ipX = bx;
        wr.ipY = by;
      }
      if (wr.ox === sx && wr.oy === sy) {
        wr.ox = bx;
        wr.oy = by;
      }
      wr.stats.oozes++;
      return true;
    }
    return false;
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
    wr.stats.flows++;
    return true;
  }
  opSwap(wr, dx1, dy1, dx2, dy2) {
    const [fx, fy] = this.frame(wr);
    const a = [fx + dx1, fy + dy1], b = [fx + dx2, fy + dy2];
    if (this.ownerAt(a[0], a[1]) !== wr.id || this.ownerAt(b[0], b[1]) !== wr.id) return false;
    const ia = this.idx(a[0], a[1]), ib = this.idx(b[0], b[1]);
    if (this.code[ia] !== this.code[ib]) wr.stats.swaps++;
    [this.code[ia], this.code[ib]] = [this.code[ib], this.code[ia]];
    return true;
  }
  /** Fat only: growth is size (and a buffer that sheds first), never new code to run into. */
  opGrow(wr, d) {
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
    this.code[i] = CODE["."];
    wr.cellCount++;
    wr.stats.grows++;
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
          wr.maxSize = Math.min(CONFIG.sizeCap, wr.maxSize + CONFIG.sizePickup * this.ripe[i]);
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
    if (o >= 0 && this.warriors[o].lineage !== wr.lineage) wr.stats.bombHits++;
    this.destroy(this.idx(x, y), wr);
    this.log("bomb", `${wr.name} bombed ${victim}`, wr.id);
    return true;
  }
  /**
   * DIVIDE: copy my whole body beyond itself in direction d, as a new warrior of my lineage
   * (a rival like any other in play).
   * Needs max size ≥ 2× my cells (and ≥ divideMin); parent and child each get half the
   * max size, the same speed, and a fresh stack. Each copied cell becomes a random glyph
   * with chance CONFIG.copyError: variation, so a lineage can evolve within one match.
   */
  opDivide(wr, d) {
    d = (d % 4 + 4) % 4;
    if (wr.maxSize < 2 * wr.cellCount || wr.maxSize < CONFIG.divideMin) return false;
    if (CONFIG.reaperCap > 0) {
      const living = this.living();
      if (living.length >= CONFIG.reaperCap) {
        const oldest = living.filter((w) => w !== wr).reduce((a, w) => w.born < a.born ? w : a);
        this.kill(oldest, "reaped (oldest)");
      }
    } else if (this.living().length >= CONFIG.maxWarriors) return false;
    const mine = this.cellsOf(wr.id);
    const xs = mine.map((c) => c % this.w), ys = mine.map((c) => c / this.w | 0);
    const bw = Math.max(...xs) - Math.min(...xs) + 1, bh = Math.max(...ys) - Math.min(...ys) + 1;
    const ox = DX[d] * (bw + 1), oy = DY[d] * (bh + 1);
    for (let k = 0; k < mine.length; k++) if (!this.isFree(xs[k] + ox, ys[k] + oy)) return false;
    const steps = Math.abs(ox) + Math.abs(oy);
    for (let k = 0; k < mine.length; k++) {
      for (let s = 1; s < steps; s++) if (this.board.terrain[this.idx(xs[k] + DX[d] * s, ys[k] + DY[d] * s)] !== FLOOR) return false;
    }
    const id = this.warriors.length;
    const founder = this.warriors[wr.lineage];
    const born = this.bornIn.get(wr.lineage) ?? 1;
    this.bornIn.set(wr.lineage, born + 1);
    const child = {
      id,
      lineage: wr.lineage,
      gen: wr.gen + 1,
      parent: wr.id,
      born: this.t,
      name: `${founder.name}\xB7${born}`,
      alive: true,
      ipX: wr.ipX + ox,
      ipY: wr.ipY + oy,
      ox: wr.ox + ox,
      oy: wr.oy + oy,
      dir: wr.dir,
      stack: [],
      maxSize: wr.maxSize / 2,
      speed: wr.speed,
      accum: 0,
      lastOk: true,
      lastAct: "",
      cellCount: 0,
      executed: 0,
      spec: wr.spec,
      home: wr.home,
      roomsSeen: new Set(wr.roomsSeen),
      stats: { collected: 0, bombHits: 0, poisonWrites: 0, kills: 0, selfWrites: 0, grows: 0, swaps: 0, flows: 0, oozes: 0, squeezed: 0, rooms: 0 }
    };
    if (CONFIG.lifespan > 0) child.diesAt = this.t + Math.floor(CONFIG.lifespan * (0.5 + this.rng()));
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
      if (this.rng() < CONFIG.copyError) {
        code = Math.floor(this.rng() * GLYPHS.length);
        mutations++;
      }
      this.setOwner(i, id);
      this.code[i] = code;
      child.cellCount++;
    }
    if (CONFIG.copyInsert > 0 && this.rng() < CONFIG.copyInsert) {
      const kids = this.cellsOf(id);
      const c = kids[Math.floor(this.rng() * kids.length)], d2 = Math.floor(this.rng() * 4);
      const nx = c % this.w + DX[d2], ny = (c / this.w | 0) + DY[d2];
      if (this.isFree(nx, ny)) {
        const i = this.idx(nx, ny);
        this.setOwner(i, id);
        this.code[i] = CODE["."];
        child.cellCount++;
        mutations++;
      }
    }
    if (CONFIG.copyDelete > 0 && child.cellCount > 1 && this.rng() < CONFIG.copyDelete) {
      const ip = this.idx(child.ipX, child.ipY);
      const kids = this.cellsOf(id).filter((c2) => c2 !== ip);
      const c = kids[Math.floor(this.rng() * kids.length)];
      this.setOwner(c, NONE);
      if (this.unreached(child).length === 0) {
        this.code[c] = 0;
        child.cellCount--;
        mutations++;
      } else this.setOwner(c, id);
    }
    wr.maxSize /= 2;
    this.log("birth", `${wr.name} divided: ${child.name} (generation ${child.gen}${mutations ? `, ${mutations} mutation${mutations > 1 ? "s" : ""}` : ""})`, id);
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
    if (o === wr.id && this.code[this.idx(x, y)] !== c) wr.stats.selfWrites++;
    this.code[this.idx(x, y)] = c;
    if (o >= 0 && o !== wr.id) {
      if (c === CODE["@"] && this.warriors[o].lineage !== wr.lineage) wr.stats.poisonWrites++;
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
  W: 1.5,
  A: 2
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
  g.cells = order.slice(0, CONFIG.startCells);
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
        if (g.cells.length >= CONFIG.startCells) continue;
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
    const team = world.warriors.filter((x) => x.lineage === me);
    const sum = (f) => team.reduce((a, x) => a + f(x), 0);
    const alive = team.some((x) => x.alive);
    const w = {
      alive,
      diedAt: alive ? void 0 : Math.max(...team.map((x) => x.diedAt ?? 0)),
      leftHomeAt: team.some((x) => x.leftHomeAt !== void 0) ? 0 : void 0,
      stats: {
        collected: sum((x) => x.stats.collected),
        bombHits: sum((x) => x.stats.bombHits),
        poisonWrites: sum((x) => x.stats.poisonWrites),
        kills: sum((x) => x.stats.kills),
        morph: sum((x) => x.stats.oozes + x.stats.flows + x.stats.grows),
        squeezed: sum((x) => x.stats.squeezed),
        rooms: sum((x) => x.stats.rooms)
      }
    };
    const r = world.result;
    let score = 0;
    if (r.winner === me) score = r.reason === "last standing" ? 3 : 2;
    else if (r.winner === null) score = 1;
    score += Math.min(0.5, 0.05 * w.stats.collected);
    score += Math.min(1, 0.1 * w.stats.bombHits);
    score += Math.min(1, 0.25 * w.stats.poisonWrites);
    score += Math.min(1, 0.5 * w.stats.kills);
    score += Math.min(1, 0.5 * w.stats.rooms);
    score += 0.5 * ((w.alive ? world.t : w.diedAt ?? 0) / world.t);
    return {
      score,
      win: r.winner === me,
      loss: r.winner !== null && r.winner !== me,
      kill: world.warriors.some((x) => x.gen === 0 && !world.warriors.some((y) => y.lineage === x.lineage && y.alive)),
      hits: w.stats.bombHits,
      poisons: w.stats.poisonWrites,
      collected: w.stats.collected,
      left: w.leftHomeAt !== void 0,
      morph: w.stats.morph,
      squeezed: w.stats.squeezed > 0,
      rooms: w.stats.rooms
    };
  } catch {
    return { score: 0, win: false, loss: true, kill: false, hits: 0, poisons: 0, collected: 0, left: false, morph: 0, squeezed: false, rooms: 0 };
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
async function runHybrid({ inputs, local, concurrency, farm = null, task = null, pollMs = 100, onFarmError }) {
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
        const target = cap.verified > 0 ? cap.verified * 3 : cap.live > 0 ? 1 : 0;
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
    return (await this.runDetailed(jobs)).results;
  }
  /** Like run, plus this call's split between local and farm (safe with concurrent calls). */
  async runDetailed(jobs) {
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
    return { results: outputs.flat(), stats };
  }
  close() {
    this.threads.close();
  }
};

// src/evolve.ts
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
  const POP = opt("pop", 48), GENS = opt("gens", 40), SEEDS = opt("seeds", 2), BOARDS = opt("boards", SEEDS), TICKS = opt("ticks", 1500);
  const HOF = opt("hof", 3), PEERS = opt("peers", 6), FFA = opt("ffa", 4), ELITE = opt("elite", 4), WORKERS = opt("workers", availableParallelism());
  const NAME = str("name", `run-${Date.now()}`);
  const rng = makeRng(opt("rng", 1));
  const runDir = join("runs", NAME);
  mkdirSync(runDir, { recursive: true });
  const benchFiles = str("bench", "warriors").split(",").flatMap((p) => p.endsWith(".warrior") ? [p] : readdirSync(p).filter((f) => f.endsWith(".warrior")).sort().map((f) => join(p, f)));
  const bench = benchFiles.map((f) => readFileSync2(f, "utf8"));
  const benchNames = benchFiles.map((f) => basename(f, ".warrior"));
  const hallOfFame = [];
  let serial = 0;
  const make = (g, parents, gen) => {
    const name = `g${gen}-${serial++}`;
    return { g, name, text: toText(g, name), parents, fitness: 0, wins: 0, losses: 0, games: 0, benchWins: 0 };
  };
  let pop = [];
  for (const src of bench) {
    pop.push(make(fromSpec(parseWarrior(src)), `seed:${parseWarrior(src).name}`, 0));
    const m = fromSpec(parseWarrior(src));
    mutate(m, rng);
    pop.push(make(m, `mutant:${parseWarrior(src).name}`, 0));
  }
  while (pop.length < POP) pop.push(make(randomGenome(rng), "random", 0));
  const FARM = str("farm", "");
  const pool = new Runner(new ThreadPool(WORKERS), FARM);
  await pool.init();
  console.log(`evolving ${NAME}: pop ${POP}, ${GENS} gens, ${BOARDS} boards/gen (${SEEDS} per opponent), ${TICKS} ticks, ${WORKERS} threads${FARM ? ` + potluck farm ${FARM}` : ""}`);
  console.log(`benchmarks: ${benchNames.join(", ")}`);
  let bestEver = null;
  for (let gen = 0; gen < GENS; gen++) {
    const t0 = Date.now();
    const boardPool = Array.from({ length: BOARDS }, () => 1 + Math.floor(rng() * 1e6));
    const boardsFor = (k) => Array.from({ length: SEEDS }, (_, s) => boardPool[(k * SEEDS + s) % BOARDS]);
    const seeds = boardsFor(0);
    const hofSample = () => Array.from({ length: Math.min(HOF, hallOfFame.length) }, () => hallOfFame[Math.floor(rng() * hallOfFame.length)].text);
    const jobs2 = [];
    const counts = [];
    for (const ind of pop) {
      const peers = [];
      while (peers.length < Math.min(PEERS, pop.length - 1)) {
        const p = pop[Math.floor(rng() * pop.length)];
        if (p !== ind) peers.push(p.text);
      }
      const opponents = [...bench, ...hofSample(), ...peers];
      opponents.forEach((opp, k) => {
        boardsFor(k).forEach((seed, s) => jobs2.push(duel(ind.text, opp, seed, s % 2 === 1, TICKS)));
      });
      for (let k = 0; k < FFA; k++) {
        const others = Array.from({ length: 3 }, () => opponents[Math.floor(rng() * opponents.length)]);
        const me = k % 4;
        others.splice(me, 0, ind.text);
        jobs2.push({ warriors: others, me, seed: boardPool[k % BOARDS], ticks: TICKS });
      }
      counts.push(opponents.length * seeds.length + FFA);
    }
    const results2 = await pool.run(jobs2);
    let at = 0;
    pop.forEach((ind, i) => {
      const rs = results2.slice(at, at + counts[i]);
      at += counts[i];
      ind.games = rs.length;
      ind.fitness = rs.reduce((a, r) => a + r.score, 0) / rs.length;
      ind.wins = rs.filter((r) => r.win).length;
      ind.losses = rs.filter((r) => r.loss).length;
      ind.benchWins = rs.slice(0, bench.length * seeds.length).filter((r) => r.win).length;
    });
    const killRate = results2.filter((r) => r.kill).length / results2.length;
    const hitsPerGame = results2.reduce((a, r) => a + r.hits, 0) / results2.length;
    const poisonsPerGame = results2.reduce((a, r) => a + r.poisons, 0) / results2.length;
    pop.sort((a, b) => b.fitness - a.fitness);
    const best = pop[0];
    const mean = pop.reduce((a, p) => a + p.fitness, 0) / pop.length;
    if (!bestEver || best.fitness > bestEver.fitness) {
      bestEver = { ...best, g: clone(best.g) };
      writeFileSync(join(runDir, `best-g${String(gen).padStart(3, "0")}.warrior`), toText(best.g, best.name, [
        `evolved: run ${NAME}, generation ${gen}, parents ${best.parents}`,
        `fitness ${best.fitness.toFixed(2)}; ${best.wins}W ${best.losses}L of ${best.games}`
      ]));
    }
    hallOfFame.push({ ...best, g: clone(best.g) });
    const line = {
      gen,
      best: +best.fitness.toFixed(3),
      mean: +mean.toFixed(3),
      bestName: best.name,
      bestRecord: `${best.wins}W ${best.losses}L/${best.games}`,
      benchWins: `${best.benchWins}/${bench.length * seeds.length}`,
      cells: best.g.cells.length,
      parents: best.parents,
      ms: Date.now() - t0,
      batches: pool.lastStats,
      killRate: +killRate.toFixed(3),
      hitsPerGame: +hitsPerGame.toFixed(2),
      poisonsPerGame: +poisonsPerGame.toFixed(2),
      text: best.text
    };
    appendFileSync(join(runDir, "log.jsonl"), JSON.stringify(line) + "\n");
    console.log(`gen ${String(gen).padStart(3)}  best ${line.best.toFixed(2)}  mean ${line.mean.toFixed(2)}  ${line.bestRecord.padEnd(12)} vs bench ${line.benchWins.padEnd(6)} ${String(line.cells).padStart(2)} cells  kills ${(killRate * 100).toFixed(0).padStart(2)}%  hits ${hitsPerGame.toFixed(2)}  poison ${poisonsPerGame.toFixed(2)}  (${line.ms}ms${FARM ? `, farm ${pool.lastStats.farm}/${pool.lastStats.farm + pool.lastStats.local} batches` : ""})`);
    const select = () => {
      let b = pop[Math.floor(rng() * pop.length)];
      for (let k = 0; k < 2; k++) {
        const c = pop[Math.floor(rng() * pop.length)];
        if (c.fitness > b.fitness) b = c;
      }
      return b;
    };
    const next = pop.slice(0, ELITE).map((e) => ({ ...e }));
    while (next.length < POP) {
      const p1 = select();
      let g, parents;
      if (rng() < 0.3) {
        const p2 = select();
        g = crossover(p1.g, p2.g, rng);
        parents = `${p1.name}\xD7${p2.name}`;
        if (rng() < 0.5) mutate(g, rng);
      } else {
        g = clone(p1.g);
        parents = `${p1.name}+${mutate(g, rng).join(",")}`;
      }
      next.push(make(g, parents, gen + 1));
    }
    pop = next;
  }
  const heldOut = Array.from({ length: 10 }, (_, i) => 900001 + i);
  const finalists = [...new Map(hallOfFame.map((h) => [h.text, h])).values()].slice(-15);
  const jobs = [];
  for (const f of finalists) for (const b of bench) heldOut.forEach((seed, s) => jobs.push(duel(f.text, b, seed, s % 2 === 1, TICKS)));
  const results = await pool.run(jobs);
  pool.close();
  const per = bench.length * heldOut.length;
  const scored = finalists.map((f, i) => {
    const rs = results.slice(i * per, (i + 1) * per);
    const byBench = benchNames.map((n, k) => {
      const r = rs.slice(k * heldOut.length, (k + 1) * heldOut.length);
      return `${n} ${r.filter((x) => x.win).length}-${r.filter((x) => x.loss).length}`;
    });
    return { f, score: rs.reduce((a, r) => a + r.score, 0) / rs.length, wins: rs.filter((r) => r.win).length, byBench };
  }).sort((a, b) => b.score - a.score);
  console.log(`
held-out check (10 boards \xD7 ${bench.length} benchmarks):`);
  const outDir = join("warriors", "evolved");
  mkdirSync(outDir, { recursive: true });
  scored.slice(0, 3).forEach((s, i) => {
    const name = `${NAME}-${i + 1}`;
    const file = `${name}.warrior`;
    writeFileSync(join(outDir, file), toText(s.f.g, name, [
      `evolved: run ${NAME}, was ${s.f.name} (parents ${s.f.parents})`,
      `held-out vs benchmarks: ${s.wins}/${per} wins; ${s.byBench.join(", ")}`
    ]));
    console.log(`  ${name.padEnd(16)} score ${s.score.toFixed(2)}  ${s.wins}/${per} wins  ${s.byBench.join("  ")}`);
  });
  console.log(`
wrote top 3 to ${outDir}/, log in ${runDir}/`);
}
if (!isMainThread) {
  serveBatches();
} else {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
//# sourceMappingURL=evolve.mjs.map

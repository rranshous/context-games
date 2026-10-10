// src/sim/glyphs.ts
var GLYPHS = ".><^v_|#?@r[]0123456789:\\$o+-*/%!`='ysmfdeLSRTMFXGCBWDA";
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
var GLYPH_DOCS = {
  ".": "no-op",
  ">": "go east",
  "<": "go west",
  "^": "go north",
  "v": "go south",
  "_": "pop; 0 \u2192 east, else west",
  "|": "pop; 0 \u2192 south, else north",
  "#": "skip the next cell",
  "?": "go in a random direction",
  "@": "DIE (the poison glyph)",
  "r": "reverse direction",
  "[": "turn left",
  "]": "turn right",
  "0": "push 0..9 (digits)",
  ":": "dup",
  "\\": "swap top two",
  "$": "drop",
  "o": "over (a b \u2192 a b a)",
  "+": "a+b",
  "-": "a-b",
  "*": "a*b",
  "/": "a/b (0 if b=0)",
  "%": "a%b (0 if b=0)",
  "!": "not",
  "`": "a>b",
  "=": "a==b",
  "'": "push the code of the next cell, and skip it",
  "y": "pop n; push random 0..n-1",
  "s": "push my cell count",
  "m": "push my max size",
  "f": "push my speed \xD710",
  "d": "push my direction",
  "e": "push 1 if the last action succeeded, else 0",
  "L": "LOOK: pop dir; push distance, type of the first thing seen that way",
  "S": "SCAN: pop type; push dx, dy, found for the nearest visible thing of that type",
  "R": "READ: pop dx dy; push the code at that cell (-1 if empty/unseen)",
  "T": "TOWARD: pop dx dy; push the direction that heads there (random if 0,0)",
  "M": "SHIFT: pop dir; move my whole body one step (only if all clear)",
  "F": "FLOW: pop dx dy dir; move one of my cells one step (must stay connected)",
  "X": "SWAP: pop dx1 dy1 dx2 dy2; swap the code of two of my cells",
  "G": "GROW: pop dir code; add a cell at the end of my line that way",
  "C": "COLLECT: take every resource or debris touching my body",
  "B": "BOMB: pop dx dy; destroy a visible foreign cell within range",
  "W": "WRITE: pop dx dy code; overwrite one of my cells, or a foreign cell within 2 of me",
  "A": "OOZE: pop dir; amoeboid move: my rearmost cell (code and all) moves to the free spot touching my body farthest that way, if that is ahead of where it was and I stay connected",
  "D": "DIVIDE: pop dir; copy my whole body beyond itself that way as a new warrior (my lineage, but a rival like any other; needs max size \u2265 2\xD7 my cells; each copied cell may mutate)"
};

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
  const key = (r, c) => r * 10 + c;
  const seen = /* @__PURE__ */ new Set([key(0, 0)]);
  const stack = [[0, 0]];
  const edges = /* @__PURE__ */ new Set();
  const startExits = [];
  const link = (r1, c1, r2, c2) => {
    const id = [key(r1, c1), key(r2, c2)].sort().join("-");
    if (edges.has(id)) return;
    edges.add(id);
    const cw = WIDTHS[Math.floor(rng() * WIDTHS.length)];
    if (r1 === 0 && c1 === 0 || r2 === 0 && c2 === 0) startExits.push(cw);
    corridor(rooms[r1][c1], rooms[r2][c2], cw);
  };
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const next = [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]].filter(([a2, b2]) => a2 >= 0 && b2 >= 0 && a2 < qrows && b2 < qcols && !seen.has(key(a2, b2)));
    if (!next.length) {
      stack.pop();
      continue;
    }
    const [a, b] = next[Math.floor(rng() * next.length)];
    seen.add(key(a, b));
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
  tickCap: 5e3,
  copyError: 0.02,
  // DIVIDE: chance each copied cell becomes a random glyph
  maxWarriors: 64,
  // DIVIDE fails once a match has this many warriors
  reaperCap: 0,
  // petri dish: with this many alive, a birth kills the oldest living warrior (0 = off)
  lifespan: 0,
  // petri dish: typical lifespan in ticks; each warrior's is 50–150% of it (0 = off)
  endless: false
  // petri dish: don't end when one lineage is left (only the tick cap ends it)
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
    specs2.forEach((s, i) => this.place(s, i));
  }
  board;
  w;
  h;
  owner;
  code;
  resource;
  // 0 none, 1 size, 2 speed
  /** Floor cells in a passage at most 2 wide (the floor run through them, across or down, is ≤ 2). */
  narrow;
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
      stats: { collected: 0, bombHits: 0, poisonWrites: 0, kills: 0, selfWrites: 0, grows: 0, swaps: 0, flows: 0, oozes: 0, squeezed: 0 },
      home: room
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
      if (this.narrow[wr.ipY * this.w + wr.ipX]) wr.stats.squeezed++;
      wr.maxSize = Math.max(CONFIG.sizeFloor, wr.maxSize - CONFIG.sizeDecay);
      wr.speed = Math.max(CONFIG.speedFloor, wr.speed - CONFIG.speedDecay);
      if (wr.cellCount > Math.floor(wr.maxSize)) this.shed(wr);
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
    for (const w of this.warriors) {
      if (!w.alive) continue;
      if (team === -1) team = w.lineage;
      else if (w.lineage !== team) return false;
    }
    return team !== -1 && this.warriors.some((w) => w.lineage !== team);
  }
  checkOver() {
    let living = 0;
    for (const w of this.warriors) if (w.alive) living++;
    if (living > 1 && this.t < CONFIG.tickCap && !this.oneTeamLeft()) return;
    if (CONFIG.endless && this.t < CONFIG.tickCap) return;
    const founders = this.warriors.filter((w) => w.gen === 0);
    const teams = /* @__PURE__ */ new Map();
    for (const w of this.warriors) if (w.alive) teams.set(w.lineage, [...teams.get(w.lineage) ?? [], w]);
    if (founders.length > 1 && teams.size <= 1) {
      this.result = teams.size ? { over: true, winner: [...teams.keys()][0], reason: "last standing" } : { over: true, winner: null, reason: "mutual destruction" };
    } else if (founders.length === 1 && teams.size === 0) {
      this.result = { over: true, winner: null, reason: "died" };
    } else if (this.t >= CONFIG.tickCap) {
      const keys = (ms) => [
        ms.reduce((a, w) => a + w.maxSize - CONFIG.sizeFloor, CONFIG.sizeFloor),
        ms.reduce((a, w) => a + w.speed, 0),
        ms.reduce((a, w) => a + w.cellCount, 0)
      ];
      const ranked = [...teams.entries()].map(([team, ms]) => ({ team, k: keys(ms) }));
      const cmp = (a, b) => {
        for (let k = 0; k < a.k.length; k++) if (Math.abs(a.k[k] - b.k[k]) >= 0.01) return b.k[k] - a.k[k];
        return 0;
      };
      ranked.sort(cmp);
      const tied = ranked.length > 1 && cmp(ranked[0], ranked[1]) === 0;
      const top = ranked[0], next = ranked[1];
      const by = !next || Math.abs(top.k[0] - next.k[0]) >= 0.01 ? `largest max size (${top.k[0].toFixed(1)})` : Math.abs(top.k[1] - next.k[1]) >= 0.01 ? `max size tied, faster (${top.k[1].toFixed(2)})` : `max size and speed tied, more cells (${top.k[2]})`;
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
  /**
   * DIVIDE: copy my whole body beyond itself in direction d, as a new warrior of my lineage
   * (a rival like any other in play).
   * Needs max size ≥ 2× my cells (and ≥ 2× the floor); parent and child each get half the
   * max size, the same speed, and a fresh stack. Each copied cell becomes a random glyph
   * with chance CONFIG.copyError: variation, so a lineage can evolve within one match.
   */
  opDivide(wr, d) {
    d = (d % 4 + 4) % 4;
    if (wr.maxSize < 2 * wr.cellCount || wr.maxSize < 2 * CONFIG.sizeFloor) return false;
    if (CONFIG.reaperCap > 0) {
      const living = this.warriors.filter((w) => w.alive);
      if (living.length >= CONFIG.reaperCap) {
        const oldest = living.filter((w) => w !== wr).reduce((a, w) => w.born < a.born ? w : a);
        this.kill(oldest, "reaped (oldest)");
      }
    } else if (this.warriors.length >= CONFIG.maxWarriors) return false;
    const mine = this.cellsOf(wr.id);
    const xs = mine.map((c) => c % this.w), ys = mine.map((c) => c / this.w | 0);
    const bw = Math.max(...xs) - Math.min(...xs) + 1, bh = Math.max(...ys) - Math.min(...ys) + 1;
    const ox = DX[d] * (bw + 1), oy = DY[d] * (bh + 1);
    for (let k = 0; k < mine.length; k++) if (!this.isFree(xs[k] + ox, ys[k] + oy)) return false;
    const id = this.warriors.length;
    const founder = this.warriors[wr.lineage];
    const born = this.warriors.filter((w) => w.lineage === wr.lineage).length;
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
      stats: { collected: 0, bombHits: 0, poisonWrites: 0, kills: 0, selfWrites: 0, grows: 0, swaps: 0, flows: 0, oozes: 0, squeezed: 0 }
    };
    if (CONFIG.lifespan > 0) child.diesAt = this.t + Math.floor(CONFIG.lifespan * (0.5 + this.rng()));
    this.warriors.push(child);
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
      if (c === CODE["@"]) wr.stats.poisonWrites++;
      if (o >= 0) this.warriors[o].lastHarm = { by: wr.id, t: this.t };
      this.log("write", `${wr.name} wrote '${GLYPHS[c]}' into ${this.warriors[o].name}`, wr.id);
    }
    return true;
  }
};

// src/sim/ascii.ts
var LETTERS = "ABCDEFGH";
function asciiMap(world2, opts = {}) {
  const rows = [];
  const ips = new Set(world2.warriors.filter((w) => w.alive).map((w) => world2.idx(w.ipX, w.ipY)));
  for (let y = 0; y < world2.h; y++) {
    let row = "";
    for (let x = 0; x < world2.w; x++) {
      const i = world2.idx(x, y);
      const o = world2.owner[i];
      if (!world2.isFloor(x, y)) row += "#";
      else if (o >= 0) {
        if (opts.glyphs) row += glyphOf(world2.code[i]);
        else {
          const L = LETTERS[world2.warriors[o].lineage] ?? "?";
          row += ips.has(i) ? L.toLowerCase() : L;
        }
      } else if (o === DEBRIS) row += "%";
      else if (world2.resource[i] === 1) row += "+";
      else if (world2.resource[i] === 2) row += "*";
      else row += o === NONE ? " " : "?";
    }
    rows.push(row);
  }
  return rows.join("\n");
}
function asciiBody(world2, id) {
  const cells = world2.cellsOf(id);
  if (!cells.length) return "(no cells)";
  const xs = cells.map((c) => c % world2.w), ys = cells.map((c) => c / world2.w | 0);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const wr = world2.warriors[id];
  const rows = [`ip at ${wr.ipX - x0},${wr.ipY - y0} dir ${"ESWN"[wr.dir]}`];
  for (let y = y0; y <= y1; y++) {
    let row = "";
    for (let x = x0; x <= x1; x++) {
      const i = world2.idx(x, y);
      row += world2.owner[i] === id ? glyphOf(world2.code[i]) : " ";
    }
    rows.push(row.replace(/\s+$/, ""));
  }
  return rows.join("\n");
}
function statusLine(world2) {
  return world2.warriors.filter((w) => w.gen === 0 || w.alive).map(
    (w) => `${LETTERS[w.lineage]}${w.gen ? `(g${w.gen})` : ""}:${w.name} ${w.alive ? `cells=${w.cellCount}/${Math.floor(w.maxSize)} spd=${w.speed.toFixed(2)}` : `dead@${w.diedAt} (${w.deathReason})`}`
  ).join(" | ");
}

// src/sim/match.ts
function summarize(world2) {
  return {
    seed: world2.seed,
    ticks: world2.t,
    winner: world2.result.winner === null ? null : world2.warriors[world2.result.winner].name,
    reason: world2.result.reason,
    warriors: world2.warriors.map((w) => ({
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

// warriors/amoeba.warrior
var amoeba_default = "name: Amoeba\n# The first replicator: a Gatherer (collect, head for the nearest resource) that DIVIDEs\n# every loop (D pops an empty stack = east): copies itself beside itself as a new\n# warrior. Seven cells, so it fits under the size floor (a 9-cell version lost genes to\n# upkeep shedding). Its descendants are rivals like anyone else.\n---\nC6S$TMD\n";

// warriors/bomber.warrior
var bomber_default = "name: Bomber\n# Like the Stalker, but bombs at range instead of poisoning by touch.\n# Found an enemy (top row): bomb it (fails quietly if out of range), step toward it.\n# Nothing in sight (bottom row): keep wandering; turn right when blocked.\nip: 0 1\n---\nv   >ooBT\\$:M\n>C2S|\n^   >$$:Me!+\n";

// warriors/gatherer.warrior
var gatherer_default = "name: Gatherer\n# One row, so the IP just loops along it forever (the row wraps within the body).\n# Collect anything touching me; find the nearest visible resource; head toward it\n# (TOWARD of 0,0 is a random direction, so with nothing in sight it wanders).\n---\nC6S$TM\n";

// warriors/roamer.warrior
var roamer_default = "name: Roamer\n# A gatherer with a memory: the wander direction lives at the bottom of the stack.\n# Found a resource (top row): head toward it, and adopt that as the wander direction.\n# Nothing in sight (bottom row): keep going the same way; turn right when blocked.\nip: 0 1\n---\nv   >T\\$:M\n>C6S|\n^   >$$:Me!+\n";

// warriors/stalker.warrior
var stalker_default = "name: Stalker\n# Hunt the nearest enemy cell; when touching it, write the poison glyph @ into it.\n# The wander direction lives at the bottom of the stack (like the Roamer).\n# Middle row decides: SCAN for an enemy, `|` sends the IP north if found, south if not.\n# Found (top row): copy dx,dy (`oo`), write @ there (`'@` pushes the code of @ and\n# skips it), then step toward it and adopt that as the wander direction.\n# Not found (bottom row): drop dx,dy, keep wandering; turn right when blocked.\n# Both rows wrap back to their first cell, which points the IP back into the middle row.\n# (Without the branch, a failed SCAN gives 0,0 = my own IP cell, and I poison myself.)\nip: 0 1\n---\nv   >oo'@WT\\$:M\n>C2S|\n^   >$$:Me!+\n";

// warriors/turtle.warrior
var turtle_default = "name: Turtle\n# Stays put. Bombs the nearest enemy in range, grows armor in a random direction,\n# collects whatever touches it. The rings of `.` are armor and do nothing.\nip: 1 1\n---\n.........\n.2S$B4y0GC\n.........\n";

// warriors/viper.warrior
var viper_default = "name: Viper\n# Poison at range 2. Like the Bomber, but the found row writes `@` (code 9) into the\n# nearest enemy cell instead of bombing. WRITE fails quietly beyond range 2.\n# 9 is pushed as a number, so the Viper carries no `@` of its own to run into.\nip: 0 1\n---\nv   >oo9WT\\$:M\n>C2S|\n^   >$$:Me!+\n";

// src/warriors.ts
var BUNDLED = { amoeba: amoeba_default, bomber: bomber_default, gatherer: gatherer_default, roamer: roamer_default, stalker: stalker_default, turtle: turtle_default, viper: viper_default };

// src/main.ts
var SOURCES = { ...BUNDLED };
var CELL = 14;
var HUES = [205, 25, 130, 290, 55, 330, 170, 0];
var SPEEDS = [1, 2, 4, 8, 16, 32, 64, 256];
var $ = (id) => document.getElementById(id);
var canvas2 = $("board");
var ctx = canvas2.getContext("2d");
var banner = $("banner");
var tip = $("tip");
var cardsEl = $("cards");
var logEl = $("log");
var tickEl = $("tick");
var seedEl = $("seed");
var speedEl = $("speed");
var showIpEl = $("showIp");
var showGlyphsEl = $("showGlyphs");
var playBtn = $("play");
var dishEl = $("dish");
var world;
var specs = [];
var playing = false;
var tickBudget = 0;
var lastFrame = performance.now();
var params = new URLSearchParams(location.search);
var PETRI = params.has("petri");
if (PETRI) {
  CONFIG.reaperCap = Number(params.get("cap") ?? 40);
  CONFIG.lifespan = Number(params.get("life") ?? 6e3);
  CONFIG.spawnInterval = Number(params.get("spawn") ?? 40);
  CONFIG.copyError = Number(params.get("error") ?? 0.05);
  CONFIG.tickCap = 1e9;
  CONFIG.endless = true;
}
var initial = (params.get("w") ?? (PETRI ? "amoeba" : "bomber,stalker")).split(",");
seedEl.value = params.get("seed") ?? "1";
var pickersEl = $("pickers");
var pickers = [];
for (let i = 0; i < 4; i++) {
  const sel = document.createElement("select");
  sel.dataset.want = initial[i] ?? "";
  sel.style.borderLeft = `4px solid hsl(${HUES[i]} 70% 55%)`;
  pickersEl.appendChild(sel);
  pickers.push(sel);
}
function fillPickers() {
  for (const sel of pickers) {
    const want = sel.value || sel.dataset.want || "";
    sel.innerHTML = `<option value="">\u2014</option>` + Object.keys(SOURCES).map((k) => `<option>${k}</option>`).join("");
    sel.value = want in SOURCES ? want : "";
  }
}
async function loadEvolved() {
  try {
    const files = await (await fetch("warriors/evolved/manifest.json", { cache: "no-store" })).json();
    await Promise.all(files.map(async (f) => {
      SOURCES[`evo:${f.replace(/\.warrior$/, "")}`] = await (await fetch(`warriors/evolved/${f}`, { cache: "no-store" })).text();
    }));
  } catch {
  }
}
function newMatch(sources, seed) {
  const srcs = sources ?? pickers.map((p) => p.value).filter(Boolean).map((k) => SOURCES[k]);
  specs = srcs.map((s, i) => parseWarrior(s, `warrior${i + 1}`));
  world = new World(seed ?? (Number(seedEl.value) || 1), specs);
  seedEl.value = String(world.seed);
  canvas2.width = world.w * CELL;
  canvas2.height = world.h * CELL;
  render();
}
$("reset").onclick = () => newMatch();
$("petri").textContent = PETRI ? "Back to matches" : "Petri dish";
$("petri").onclick = () => {
  location.search = PETRI ? "" : "?petri=1&w=amoeba";
};
dishEl.style.display = PETRI ? "block" : "none";
playBtn.onclick = () => setPlaying(!playing);
$("step").onclick = () => {
  setPlaying(false);
  world.tick();
  render();
};
showIpEl.onchange = showGlyphsEl.onchange = () => render();
function setPlaying(p) {
  playing = p;
  playBtn.textContent = p ? "Pause" : "Play";
}
function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1e3);
  lastFrame = now;
  if (playing && !world.result.over) {
    tickBudget += dt * SPEEDS[Number(speedEl.value)];
    let n = 0;
    while (tickBudget >= 1 && n < 500 && !world.result.over) {
      world.tick();
      tickBudget--;
      n++;
    }
    if (world.result.over) setPlaying(false);
    render();
  }
  requestAnimationFrame(frame);
}
function color(id, l, a = 1) {
  return `hsl(${HUES[id % HUES.length]} 60% ${l}% / ${a})`;
}
function render() {
  const { w, h } = world;
  const glyphs = showGlyphsEl.checked;
  ctx.font = `bold ${CELL - 3}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = world.idx(x, y), px = x * CELL, py = y * CELL;
      const o = world.owner[i];
      if (!world.isFloor(x, y)) {
        ctx.fillStyle = "#1a1f29";
        ctx.fillRect(px, py, CELL, CELL);
        continue;
      }
      ctx.fillStyle = "#0e1117";
      ctx.fillRect(px, py, CELL, CELL);
      if (o >= 0) {
        const wo = world.warriors[o];
        ctx.fillStyle = color(wo.lineage, 28 + Math.min(wo.gen, 5) * 4);
        ctx.fillRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);
        if (glyphs) {
          ctx.fillStyle = color(wo.lineage, 82);
          ctx.fillText(glyphOf(world.code[i]), px + CELL / 2, py + CELL / 2 + 1);
        }
      } else if (o === DEBRIS) {
        ctx.fillStyle = "#2a2d33";
        ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
        if (glyphs) {
          ctx.fillStyle = "#555b66";
          ctx.fillText(glyphOf(world.code[i]), px + CELL / 2, py + CELL / 2 + 1);
        }
      } else if (world.resource[i]) {
        const size = world.resource[i] === 1;
        ctx.fillStyle = size ? "#3fb950" : "#e3b341";
        ctx.beginPath();
        if (size) {
          ctx.arc(px + CELL / 2, py + CELL / 2, CELL / 3, 0, Math.PI * 2);
        } else {
          ctx.moveTo(px + CELL / 2, py + 2);
          ctx.lineTo(px + CELL - 2, py + CELL / 2);
          ctx.lineTo(px + CELL / 2, py + CELL - 2);
          ctx.lineTo(px + 2, py + CELL / 2);
        }
        ctx.fill();
      }
    }
  }
  if (showIpEl.checked) {
    for (const wr of world.warriors) {
      if (!wr.alive) continue;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.strokeRect(wr.ipX * CELL + 1, wr.ipY * CELL + 1, CELL - 2, CELL - 2);
    }
  }
  renderSide();
}
function renderSide() {
  tickEl.textContent = `tick ${world.t}`;
  cardsEl.innerHTML = world.warriors.filter((wr) => wr.gen === 0).map((wr) => {
    const g = wr.alive ? glyphOf(world.code[world.idx(wr.ipX, wr.ipY)]) : "";
    const kin = world.warriors.filter((k) => k.lineage === wr.id && k.gen > 0);
    const kinLine = kin.length ? `<div class="stats">lineage: ${kin.filter((k) => k.alive).length} of ${kin.length} descendants alive, up to generation ${Math.max(...kin.map((k) => k.gen))}</div>` : "";
    return `<div class="card ${wr.alive || kin.some((k) => k.alive) ? "" : "dead"}" style="border-left-color:${color(wr.id, 55)}">
      <div class="name">${LETTERS[wr.id]} \xB7 ${esc(wr.name)}</div>${kinLine}
      <div class="stats">${wr.alive ? `cells ${wr.cellCount}/${Math.floor(wr.maxSize)} \xB7 speed ${wr.speed.toFixed(2)} \xB7 ran ${wr.executed}<br>at '${esc(g)}' heading ${DIR_NAMES[wr.dir]} \xB7 last action ${wr.lastAct ? `${wr.lastAct} ` : ""}${wr.lastOk ? "ok" : "failed"}` : `died at tick ${wr.diedAt}: ${esc(wr.deathReason ?? "")}`}</div>
      <div class="stack">stack [${wr.stack.slice(-12).join(" ")}]</div>
    </div>`;
  }).join("");
  if (PETRI) renderDish();
  logEl.innerHTML = world.events.slice(-40).filter((e) => e.kind !== "shed").map((e) => `<div style="color:${e.who !== void 0 ? color(world.warriors[e.who]?.lineage ?? e.who, 65) : "#e6edf3"}">t${e.t} ${esc(e.text)}</div>`).join("");
  logEl.scrollTop = logEl.scrollHeight;
  if (world.result.over) {
    banner.style.display = "block";
    banner.textContent = world.result.winner === null ? `No winner: ${world.result.reason}` : `${world.warriors[world.result.winner].name} wins (${world.result.reason})`;
  } else banner.style.display = "none";
}
function genomeOf(id) {
  const cells = world.cellsOf(id);
  if (!cells.length) return "";
  const xs = cells.map((c) => c % world.w), ys = cells.map((c) => c / world.w | 0);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
  const rows = [];
  for (let y = y0; y <= y1; y++) {
    let r = "";
    for (let x = x0; x <= x1; x++) {
      const i = world.idx(x, y);
      r += world.owner[i] === id ? glyphOf(world.code[i]) : " ";
    }
    rows.push(r.replace(/\s+$/, ""));
  }
  return rows.join(" / ");
}
function renderDish() {
  const living = world.warriors.filter((w) => w.alive);
  const counts = /* @__PURE__ */ new Map();
  for (const w of living) {
    const g = genomeOf(w.id);
    const c = counts.get(g) ?? { n: 0, lineage: w.lineage };
    c.n++;
    counts.set(g, c);
  }
  const founders = world.warriors.filter((w) => w.gen === 0).map((w) => genomeOf(w.id) || w.spec.source.split("---")[1]?.trim().split("\n").join(" / "));
  const died = world.warriors.filter((w) => !w.alive).length;
  const top = [...counts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8);
  dishEl.innerHTML = `<div class="name">Petri dish</div>
    <div class="stats">${living.length} alive \xB7 ${world.warriors.length - world.warriors.filter((w) => w.gen === 0).length} born \xB7 ${died} died \xB7 deepest generation ${Math.max(0, ...living.map((w) => w.gen))} \xB7 ${counts.size} genomes alive</div>
    ${top.map(([g, c]) => `<div class="genome"><span style="color:${color(c.lineage, 65)}">${String(c.n).padStart(3)} \xD7</span> <code>${esc(g)}</code>${founders.includes(g) ? ' <span class="stats">(founder)</span>' : ""}</div>`).join("")}`;
}
function esc(s) {
  return s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}
canvas2.onmousemove = (ev) => {
  const r = canvas2.getBoundingClientRect();
  const x = Math.floor((ev.clientX - r.left) / CELL), y = Math.floor((ev.clientY - r.top) / CELL);
  if (!world.inBounds(x, y)) {
    tip.style.display = "none";
    return;
  }
  const i = world.idx(x, y), o = world.owner[i];
  let text = "";
  if (o >= 0 || o === DEBRIS) {
    const g = glyphOf(world.code[i]);
    text = `${o >= 0 ? world.warriors[o].name : "debris"}  '${g}'  ${GLYPH_DOCS[g] ?? (g >= "0" && g <= "9" ? `push ${g}` : "")}`;
  } else if (world.resource[i]) text = world.resource[i] === 1 ? "size pickup" : "speed pickup";
  if (!text) {
    tip.style.display = "none";
    return;
  }
  tip.textContent = text;
  tip.style.display = "block";
  tip.style.left = `${x * CELL + CELL + 4}px`;
  tip.style.top = `${y * CELL + CELL + 4}px`;
};
canvas2.onmouseleave = () => {
  tip.style.display = "none";
};
var explorer = {
  help: () => [
    "await explorer.ready                    resolves once evolved warriors are loaded",
    "explorer.warriors()                     names of bundled + evolved (evo:...) warriors",
    'explorer.load(["bomber","stalker"], 3)  new match from bundled names and a seed',
    "explorer.loadSource([text, ...], seed)  new match from warrior-file text",
    "explorer.step(n)                        advance n ticks, returns state()",
    "explorer.runUntilOver(maxTicks)         run to the end (or max), returns summary",
    "explorer.play() / pause() / setSpeed(0..7)",
    "explorer.state()                        tick, result, warriors (incl. stack, IP)",
    "explorer.ascii({glyphs})                board as text; explorer.body(id) a warrior's grid",
    "explorer.events(n)                      last n events",
    "explorer.screenshot()                   canvas as a PNG data URL"
  ].join("\n"),
  warriors: () => Object.keys(SOURCES),
  source: (name) => SOURCES[name],
  load(names, seed) {
    const unknown = names.filter((n) => !(n in SOURCES));
    if (unknown.length) throw new Error(`unknown warrior(s): ${unknown.join(", ")} (try explorer.warriors(), or await explorer.ready)`);
    names.forEach((n, i) => {
      if (pickers[i]) pickers[i].value = n;
    });
    for (let i = names.length; i < pickers.length; i++) pickers[i].value = "";
    newMatch(names.map((n) => SOURCES[n]), seed);
    return this.state();
  },
  loadSource(sources, seed) {
    newMatch(sources, seed);
    return this.state();
  },
  step(n = 1) {
    for (let i = 0; i < n && !world.result.over; i++) world.tick();
    render();
    return this.state();
  },
  runUntilOver(maxTicks = CONFIG.tickCap) {
    for (let i = 0; i < maxTicks && !world.result.over; i++) world.tick();
    render();
    return summarize(world);
  },
  play() {
    setPlaying(true);
  },
  pause() {
    setPlaying(false);
  },
  setSpeed(s) {
    speedEl.value = String(s);
  },
  state: () => ({
    tick: world.t,
    seed: world.seed,
    result: world.result,
    status: statusLine(world),
    warriors: world.warriors.map((w) => ({
      id: w.id,
      name: w.name,
      alive: w.alive,
      cells: w.cellCount,
      maxSize: +w.maxSize.toFixed(2),
      speed: +w.speed.toFixed(2),
      ip: { x: w.ipX, y: w.ipY },
      dir: DIR_NAMES[w.dir],
      glyph: w.alive ? glyphOf(world.code[world.idx(w.ipX, w.ipY)]) : null,
      stack: w.stack.slice(-16),
      lastAct: w.lastAct,
      lastOk: w.lastOk,
      executed: w.executed,
      death: w.deathReason
    }))
  }),
  ascii: (opts = {}) => asciiMap(world, opts),
  body: (id) => asciiBody(world, id),
  events: (n = 30) => world.events.slice(-n).map((e) => `t${e.t} ${e.text}`),
  screenshot: () => canvas2.toDataURL("image/png"),
  config: CONFIG,
  ready: Promise.resolve(),
  get world() {
    return world;
  }
};
window.explorer = explorer;
fillPickers();
explorer.ready = loadEvolved().then(() => {
  fillPickers();
  newMatch();
  requestAnimationFrame(frame);
});
//# sourceMappingURL=main.js.map

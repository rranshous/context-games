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
  "W": "WRITE: pop dx dy code; overwrite one of my cells, or a foreign cell within 2 of me"
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
function asciiMap(world2, opts = {}) {
  const rows = [];
  const ips = new Map(world2.warriors.filter((w) => w.alive).map((w) => [world2.idx(w.ipX, w.ipY), w.id]));
  for (let y = 0; y < world2.h; y++) {
    let row = "";
    for (let x = 0; x < world2.w; x++) {
      const i = world2.idx(x, y);
      const o = world2.owner[i];
      if (!world2.isFloor(x, y)) row += "#";
      else if (o >= 0) {
        if (opts.glyphs) row += glyphOf(world2.code[i]);
        else row += ips.get(i) === o ? LETTERS[o].toLowerCase() : LETTERS[o];
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
  return world2.warriors.map(
    (w) => `${LETTERS[w.id]}:${w.name} ${w.alive ? `cells=${w.cellCount}/${Math.floor(w.maxSize)} spd=${w.speed.toFixed(2)}` : `dead@${w.diedAt} (${w.deathReason})`}`
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

// src/warriors.ts
var BUNDLED = { bomber: bomber_default, gatherer: gatherer_default, roamer: roamer_default, stalker: stalker_default, turtle: turtle_default };

// src/main.ts
var SOURCES = { ...BUNDLED };
var CELL = 14;
var HUES = [205, 25, 130, 290, 55, 330, 170, 0];
var SPEEDS = [1, 2, 4, 8, 16, 32, 64, 256];
var $ = (id) => document.getElementById(id);
var canvas = $("board");
var ctx = canvas.getContext("2d");
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
var world;
var specs = [];
var playing = false;
var tickBudget = 0;
var lastFrame = performance.now();
var params = new URLSearchParams(location.search);
var initial = (params.get("w") ?? "bomber,stalker").split(",");
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
  canvas.width = world.w * CELL;
  canvas.height = world.h * CELL;
  render();
}
$("reset").onclick = () => newMatch();
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
        ctx.fillStyle = color(o, 28);
        ctx.fillRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);
        if (glyphs) {
          ctx.fillStyle = color(o, 78);
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
  cardsEl.innerHTML = world.warriors.map((wr) => {
    const g = wr.alive ? glyphOf(world.code[world.idx(wr.ipX, wr.ipY)]) : "";
    return `<div class="card ${wr.alive ? "" : "dead"}" style="border-left-color:${color(wr.id, 55)}">
      <div class="name">${LETTERS[wr.id]} \xB7 ${esc(wr.name)}</div>
      <div class="stats">${wr.alive ? `cells ${wr.cellCount}/${Math.floor(wr.maxSize)} \xB7 speed ${wr.speed.toFixed(2)} \xB7 ran ${wr.executed}<br>at '${esc(g)}' heading ${DIR_NAMES[wr.dir]} \xB7 last action ${wr.lastOk ? "ok" : "failed"}` : `died at tick ${wr.diedAt}: ${esc(wr.deathReason ?? "")}`}</div>
      <div class="stack">stack [${wr.stack.slice(-12).join(" ")}]</div>
    </div>`;
  }).join("");
  logEl.innerHTML = world.events.slice(-40).filter((e) => e.kind !== "shed").map((e) => `<div style="color:${e.who !== void 0 ? color(e.who, 65) : "#e6edf3"}">t${e.t} ${esc(e.text)}</div>`).join("");
  logEl.scrollTop = logEl.scrollHeight;
  if (world.result.over) {
    banner.style.display = "block";
    banner.textContent = world.result.winner === null ? `No winner: ${world.result.reason}` : `${world.warriors[world.result.winner].name} wins (${world.result.reason})`;
  } else banner.style.display = "none";
}
function esc(s) {
  return s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}
canvas.onmousemove = (ev) => {
  const r = canvas.getBoundingClientRect();
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
canvas.onmouseleave = () => {
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
      lastOk: w.lastOk,
      executed: w.executed,
      death: w.deathReason
    }))
  }),
  ascii: (opts = {}) => asciiMap(world, opts),
  body: (id) => asciiBody(world, id),
  events: (n = 30) => world.events.slice(-n).map((e) => `t${e.t} ${e.text}`),
  screenshot: () => canvas.toDataURL("image/png"),
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

// src/bake.ts
import { createWriteStream, existsSync as existsSync2, mkdirSync, readFileSync as readFileSync2, renameSync, statfsSync, statSync as statSync2, unlinkSync as unlinkSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip, gunzipSync } from "node:zlib";

// src/bake-thin.ts
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
function keeps(t, last, every2) {
  const age = last - t;
  if (age < 100 * every2) return true;
  if (age < 1100 * every2) return t % (10 * every2) === 0;
  return t % (100 * every2) === 0;
}
function toThin(marks, every2) {
  if (!marks.length) return [];
  const last = marks[marks.length - 1].t;
  return marks.filter((m, i) => m.file && i > 0 && i < marks.length - 1 && !keeps(m.t, last, every2));
}
var CHECKPOINT = /^t\d+\.andnow\.gz$/;
function dropFiles(dir, marks, gone, put2) {
  const files = gone.map((m) => m.file).filter((f) => CHECKPOINT.test(f));
  for (const m of gone) delete m.file;
  const kept = new Set(marks.map((m) => m.file).filter(Boolean));
  put2();
  let freed = 0;
  for (const f of files) {
    if (kept.has(f)) continue;
    const p = `${dir}/${f}`;
    if (!existsSync(p)) continue;
    freed += statSync(p).size;
    unlinkSync(p);
  }
  return freed;
}
function bakingPid(dir) {
  const p = `${dir}/.baking`;
  if (!existsSync(p)) return null;
  const pid = Number(readFileSync(p, "utf8"));
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}
function holdBaking(dir) {
  writeFileSync(`${dir}/.baking`, String(process.pid));
}

// src/sim/glyphs.ts
var GLYPHS = ".><^v_|#?@r[]0123456789:\\$o+-*/%!`='ysmfdeLSRTMFXGCBWDAKI~xn";
var CLASSIC_GLYPHS = GLYPHS.indexOf("I");
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
  const rng = () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  Object.defineProperty(rng, "state", { get: () => a, set: (v) => {
    a = v >>> 0;
  } });
  return rng;
}
function randInt(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}
function streamSeed(seed, t, key) {
  let h = fmix(seed ^ 2654435769);
  h = fmix(h + Math.imul(t >>> 0, 2246822507) >>> 0);
  h = fmix((h ^ Math.imul(key >>> 0, 3266489909) ^ Math.imul(key / 4294967296 | 0, 668265263)) >>> 0);
  return h;
}
function fmix(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  return (h ^ h >>> 16) >>> 0;
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
  const key = (r, c) => r * 10 + c;
  const seen = /* @__PURE__ */ new Set([key(0, 0)]);
  const stack = [[0, 0]];
  const edges = /* @__PURE__ */ new Set();
  const startExits = [];
  const link = (r1, c1, r2, c2) => {
    const id = [key(r1, c1), key(r2, c2)].sort().join("-");
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
function makeIsland(seed, w, bands, foodSpacing, shallows = 0.4, calm = 0.25, depth = 0.75) {
  const h = Math.round(w * depth);
  const rng = makeRng(seed ^ 5369127);
  const terrain = new Uint8Array(w * h).fill(WALL);
  const S = 14;
  const bedMax = h - 2, hill = Math.round((bedMax - S) * 0.12);
  const ph = [rng() * 6.28, rng() * 6.28, rng() * 6.28];
  const bed = (x) => bedMax - Math.round(hill * (0.5 + 0.25 * Math.sin(x / w * 6.28 * 1.3 + ph[0]) + 0.17 * Math.sin(x / w * 6.28 * 3.7 + ph[1]) + 0.08 * Math.sin(x / w * 6.28 * 9.1 + ph[2])));
  for (let x = 1; x < w - 1; x++) for (let y = S; y <= bed(x); y++) terrain[y * w + x] = FLOOR;
  const depthOf = (y) => (y - S) / (bedMax - S);
  const sharkLine = S + Math.round(shallows * (bedMax - S));
  const bayW = Math.max(18, Math.round(w * 0.06)), reefX = bayW + 1;
  const G = 4, gw = Math.ceil(w / G), gh = Math.ceil(h / G);
  let cg = new Uint8Array(gw * gh);
  const ok = (gx, gy) => gy * G >= sharkLine + 4 && gx * G > reefX + 2 && gx < gw - 1;
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) if (ok(gx, gy) && rng() < 0.37 + 0.13 * depthOf(gy * G)) cg[gy * gw + gx] = 1;
  for (let pass = 0; pass < 4; pass++) {
    const next = cg.slice();
    for (let gy = 1; gy < gh - 1; gy++) for (let gx = 1; gx < gw - 1; gx++) {
      if (!ok(gx, gy)) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && cg[(gy + dy) * gw + gx + dx]) n++;
      next[gy * gw + gx] = n >= 5 ? 1 : n <= 3 ? 0 : cg[gy * gw + gx];
    }
    cg = next;
  }
  const rock = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (cg[(y / G | 0) * gw + (x / G | 0)] && terrain[y * w + x] === FLOOR) rock[y * w + x] = 1;
  for (let i = 0; i < w * h; i++) if (rock[i]) terrain[i] = WALL;
  const nIsl = Math.max(3, Math.round(w / 100) | 1);
  const isl = Array.from({ length: nIsl }, (_, k) => {
    const f = (k + 0.5) / nIsl, mid = k === (nIsl - 1) / 2;
    return { cx: Math.round(w * f), hw: Math.round(w * (mid ? 0.08 : 0.045)) };
  });
  const land = new Uint8Array(w * h);
  for (const { cx, hw } of isl) {
    for (let x = cx - hw; x <= cx + hw; x++) {
      const k = (x - cx) / hw, top2 = S - Math.round((S - 2) * Math.min(1, 1.8 * (1 - k * k)));
      for (let y = top2; y < S; y++) {
        terrain[y * w + x] = FLOOR;
        land[y * w + x] = 1;
      }
    }
  }
  const seen = new Uint8Array(w * h), q = [];
  for (let x = 1; x < w - 1; x++) if (terrain[S * w + x] === FLOOR) {
    seen[S * w + x] = 1;
    q.push(S * w + x);
  }
  for (let k = 0; k < q.length; k++) {
    const i = q[k];
    for (const n of [i - 1, i + 1, i - w, i + w]) if (n >= 0 && n < w * h && !seen[n] && terrain[n] === FLOOR) {
      seen[n] = 1;
      q.push(n);
    }
  }
  for (let i = 0; i < w * h; i++) if (terrain[i] === FLOOR && !seen[i]) terrain[i] = WALL;
  const landP = new Uint8Array(w * h), seaP = new Uint8Array(w * h);
  const level = (d) => d < calm ? 0 : Math.min(bands - 1, 1 + Math.floor((d - calm) / (1 - calm) * (bands - 1)));
  for (let y = S; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (terrain[i] === FLOOR) landP[i] = level(depthOf(y));
  }
  const spawns = [];
  const has = /* @__PURE__ */ new Set();
  const add = (x, y) => {
    const i = y * w + x;
    if (terrain[i] !== FLOOR || land[i] || has.has(i) || x === reefX) return;
    has.add(i);
    spawns.push({ x, y, kind: 1 });
  };
  for (let y = S; y < h - 1; y += foodSpacing) {
    for (let x = 1; x < w - 1; x += foodSpacing) {
      const px = x + randInt(rng, 0, foodSpacing - 1), py = y + randInt(rng, 0, foodSpacing - 1);
      if (px >= w || py >= h) continue;
      if (rng() < 0.25 + 0.75 * depthOf(py)) add(px, py);
    }
  }
  for (let y = sharkLine; y < h - 1; y++) for (let x = 2; x < w - 2; x += 3) {
    if (terrain[y * w + x] === FLOOR && terrain[(y + 1) * w + x] !== FLOOR && rng() < 0.5) add(x, y);
  }
  const home = isl[nIsl - 1 >> 1], top = S - 4;
  const homeRect = { x: home.cx - 7, y: top, w: 14, h: 4 };
  const reef = [];
  for (let y = sharkLine; y < h; y++) {
    const i = y * w + reefX;
    if (terrain[i] === FLOOR) {
      terrain[i] = WALL;
      reef.push(i);
    }
  }
  const bayRect = { x: 1, y: sharkLine, w: bayW, h: bedMax - sharkLine };
  return { w, h, terrain, spawns, starts: [homeRect, bayRect], rooms: [], toxin: landP, toxinBy: [landP, seaP], startRealm: [0, 1], surface: S, land, sharkLine, reef, calmLine: S + Math.round(calm * (bedMax - S)) };
}
function climbStepH(base, n) {
  const a = Math.abs(n);
  if (a <= 2) return base * 10 ** a;
  let h = base * 100;
  for (let k = 3; k <= a; k++) h = Math.max(64, Math.round(h * 1.5 / 64) * 64);
  return h;
}
function climbRock(rng, terrain, w, t, H, gx, gy, fill) {
  const gw = Math.ceil(w / gx), gh = Math.ceil(H / gy);
  let g = new Uint8Array(gw * gh);
  for (let k = 0; k < g.length; k++) g[k] = rng() < fill ? 1 : 0;
  for (let pass = 0; pass < 4; pass++) {
    const next = g.slice();
    for (let j = 1; j < gh - 1; j++) for (let i = 1; i < gw - 1; i++) {
      let c = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if ((di || dj) && g[(j + dj) * gw + i + di]) c++;
      next[j * gw + i] = c >= 5 ? 1 : c <= 3 ? 0 : g[j * gw + i];
    }
    g = next;
  }
  for (let y = t; y < t + H; y++) {
    const j = Math.floor((y - t) / gy);
    for (let x = 1; x < w - 1; x++) if (g[j * gw + Math.floor(x / gx)]) terrain[y * w + x] = WALL;
  }
}
var rockFill = (n) => n > 0 ? 0.36 : Math.min(0.5, 0.38 + 0.04 * -n);
function makeMeadow(rng, w) {
  const ph = Array.from({ length: 4 }, () => rng() * 6.28);
  return (x) => {
    const v = Math.sin(x / w * 6.28 * 3 + ph[0]) + 0.6 * Math.sin(x / w * 6.28 * 7.3 + ph[1]) + 0.3 * Math.sin(x / w * 6.28 * 17 + ph[2]);
    return Math.max(0.08, Math.min(1, 0.5 + 0.45 * v));
  };
}
function climbPlants(rng, terrain, w, n, t, H, foodSpacing, meadow, spawns) {
  for (let y = t + 1; y < t + H - 1; y += foodSpacing) {
    for (let x = 1; x < w - 1; x += foodSpacing) {
      const px = x + randInt(rng, 0, foodSpacing - 1), py = y + randInt(rng, 0, foodSpacing - 1);
      if (px >= w - 1 || py >= t + H - 1) continue;
      const i = py * w + px;
      if (terrain[i] !== FLOOR) continue;
      const layer = n === 0 ? 0.6 : 0.25 + 0.75 * Math.sin(Math.PI * (py - t + 0.5) / H);
      const ledge = terrain[i + w] !== FLOOR ? 2 : 1;
      const sparse = n > 0 ? 0.5 : 1;
      if (rng() < 0.3 * meadow(px) * layer * ledge * sparse) spawns.push({ x: px, y: py, kind: 1 });
    }
  }
}
function makeClimbStep(seed, w, n, H, foodSpacing) {
  const rng = makeRng((seed ^ 49435) + n * 2654435761);
  const terrain = new Uint8Array(w * H);
  climbRock(rng, terrain, w, 0, H, n > 0 ? 10 : 5, n > 0 ? 3 : 5, rockFill(n));
  for (let y = 0; y < H; y++) {
    terrain[y * w] = WALL;
    terrain[y * w + w - 1] = WALL;
  }
  const spawns = [];
  climbPlants(rng, terrain, w, n, 0, H, foodSpacing, makeMeadow(rng, w), spawns);
  return { terrain, spawns };
}
function makeClimb(seed, w, base, steps, foodSpacing) {
  const stepH = [], stepTop = [];
  let h = 0;
  for (let n = steps; n >= -steps; n--) {
    stepTop[n + steps] = h;
    stepH[n + steps] = climbStepH(base, n);
    h += stepH[n + steps];
  }
  const top0 = stepTop[steps], seaLevel = top0 + (base >> 1);
  const rng = makeRng(seed ^ 49435);
  const terrain = new Uint8Array(w * h);
  const step = new Int8Array(w * h);
  for (let n = -steps; n <= steps; n++) {
    const t = stepTop[n + steps], H = stepH[n + steps];
    step.fill(n, t * w, (t + H) * w);
  }
  for (let y = 0; y < h; y++) {
    terrain[y * w] = WALL;
    terrain[y * w + w - 1] = WALL;
  }
  for (let x = 0; x < w; x++) {
    terrain[x] = WALL;
    terrain[(h - 1) * w + x] = WALL;
  }
  const rockIn = (n, gx, gy, fill) => climbRock(rng, terrain, w, stepTop[n + steps], stepH[n + steps], gx, gy, fill);
  for (let n = 1; n <= steps; n++) {
    rockIn(n, 10, 3, 0.36);
    rockIn(-n, 5, 5, 0.38 + 0.04 * n);
  }
  const seen = new Uint8Array(w * h), q = [];
  for (let x = 1; x < w - 1; x++) {
    const i = seaLevel * w + x;
    if (terrain[i] === FLOOR) {
      seen[i] = 1;
      q.push(i);
    }
  }
  for (let k = 0; k < q.length; k++) {
    const i = q[k];
    for (const nb of [i - 1, i + 1, i - w, i + w]) if (nb >= 0 && nb < w * h && !seen[nb] && terrain[nb] === FLOOR) {
      seen[nb] = 1;
      q.push(nb);
    }
  }
  for (let i = 0; i < w * h; i++) if (terrain[i] === FLOOR && !seen[i]) terrain[i] = WALL;
  const meadow = makeMeadow(rng, w);
  const spawns = [];
  for (let y = 1; y < h - 1; y += foodSpacing) {
    for (let x = 1; x < w - 1; x += foodSpacing) {
      const px = x + randInt(rng, 0, foodSpacing - 1), py = y + randInt(rng, 0, foodSpacing - 1);
      if (px >= w - 1 || py >= h - 1) continue;
      const i = py * w + px;
      if (terrain[i] !== FLOOR) continue;
      const n = step[i], t = stepTop[n + steps], H = stepH[n + steps];
      const layer = n === 0 ? 0.6 : 0.25 + 0.75 * Math.sin(Math.PI * (py - t + 0.5) / H);
      const ledge = terrain[i + w] !== FLOOR ? 2 : 1;
      const sparse = n > 0 ? 0.5 : 1;
      if (rng() < 0.3 * meadow(px) * layer * ledge * sparse) spawns.push({ x: px, y: py, kind: 1 });
    }
  }
  const s0 = { x: 2, y: top0 + 1, w: w - 4, h: base - 2 };
  const sm1 = { x: 2, y: stepTop[steps - 1] + 2, w: w - 4, h: Math.min(30, stepH[steps - 1] - 4) };
  return { w, h, terrain, spawns, starts: [s0, sm1], rooms: [], step, stepLo: -steps, stepHi: steps, stepTop, stepH, seaLevel, climbBase: base, foodSpacing };
}

// src/sim/world.ts
var RULES = 6;
var NONE = -1;
var ZONES = 64;
var CELLS = Symbol("cells");
var K = CODE["K"];
var INSUL = CODE["I"];
var FLIP = CODE["~"];
var DOUBLE = CODE["x"];
var MASK = CODE["n"];
var FAT = CODE["."];
var MOVE = CODE["M"];
var BITE = CODE["B"];
var COLLECT = CODE["C"];
var Cells = class {
  constructor(items = []) {
    this.items = items;
  }
  /** The same cells in board order (cellsOf's cache), or null once they change. */
  sorted = null;
  /**
   * The Climb: the body's `traits` still describe these cells. Cleared when a cell joins or
   * leaves, or a code in one changes (a whole-body shift keeps it: the same body one step
   * over), so upkeep recomputes traits only for bodies that changed. Not saved: a loaded
   * world recomputes everyone once.
   */
  fresh = false;
  get size() {
    return this.items.length;
  }
  add(i) {
    this.items.push(i);
    this.sorted = null;
    this.fresh = false;
    return this;
  }
  delete(i) {
    const k = this.items.indexOf(i);
    if (k < 0) return false;
    this.items.splice(k, 1);
    this.sorted = null;
    this.fresh = false;
    return true;
  }
  clear() {
    this.items.length = 0;
    this.sorted = null;
    this.fresh = false;
  }
  [Symbol.iterator]() {
    return this.items[Symbol.iterator]();
  }
};
var newCells = (id) => id === DEBRIS ? /* @__PURE__ */ new Set() : new Cells();
var DEBRIS = -2;
var OP_COST = Array.from(GLYPHS, (g) => COST[g] ?? 1);
var OP_ACTS = Uint8Array.from(GLYPHS, (g) => +"MFXGCBWDA".includes(g));
var SHIFT_CODES = new Uint8Array(1024);
var SCAN_KEYS = new Float64Array(64 * 64);
var CONFIG = {
  sight: 14,
  // LoS range from each cell (Chebyshev)
  bombRange: 6,
  // BOMB reach from the cell that sees the target
  writeRange: 2,
  // WRITE reach into foreign cells, from the cell that sees the target
  killPay: 0.25,
  // duels: a kill's corpse holds this fraction of the victim's max size on top of its debris
  creditWindow: 500,
  // a death within this many ticks of being bitten or written into is a kill: its corpse is rich (see die)
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
  copyDelete: 0,
  // DIVIDE: chance the child loses one cell (never its IP cell; stays connected)
  island: false,
  // island survival: side view, islanders vs sea creatures (board width = plate)
  climb: false,
  // The Climb: fixed width (plate), steps up (air: insulation) and down (water: armor), 10× taller and richer each
  climbBase: 20,
  // climb: step 0's height in rows (step ±n is base × 10^n)
  climbSteps: 2,
  // climb: steps each way
  crowd: 24,
  // climb: DIVIDE fails where the parent's tile already holds this many bodies (0 = no limit)
  stomach: 4,
  // climb: each cell adds this much to a body's largest max size (its store)…
  fatStore: 16,
  // …and each fat cell this much: fat is where a body keeps food (and starving sheds it first)
  climbStarve: 1500,
  // climb: ticks a full body of plain cells lasts unfed at step 0 (each cell burns stomach / this a tick)
  shellBurn: 1,
  // climb: armor (K) and insulation (I) cells burn this many times a plain cell…
  fatBurn: 0.5,
  // …and fat this many; every cell burns 2^|its step| times more (the cold and the pressure)
  tile: 64,
  // climb: food regrows only in tiles near life (the world's upkeep goes where the action is)
  starve: 600,
  // island: ticks an unfed seal with max size 20 lasts (about a tenth of a lifetime)
  sharkStarve: 6e3,
  // island: the same for a shark (10× a seal's, as is its lifespan: about 10 meals a life for both)
  sharkLife: 10,
  // island: a sea creature's lifespan is this many times CONFIG.lifespan
  paceMass: 11,
  // island: pace = (1 + M cells) / (1 + mass / this); the seal founder's mass is 11
  paceSpeed: 2,
  // island: instructions per tick at pace 1
  armorBites: 3,
  // island: bites an armor (K) cell takes before it breaks
  sharkCap: 128,
  // island: a sea creature's largest max size
  kelpFeed: 8,
  // island: max size a seal gains from a kelp (times its ripeness), a real meal
  depth: 0.75,
  // island: the sea is this many times as deep as it is wide
  calm: 0.25,
  // island: top share of the water with no pressure (seals overlap sharks below `shallows`)
  shallows: 0.4,
  // island: sea creatures can't swim into this top share of the water (blocked, never hurt)
  sharkArrive: 6e4,
  // island: the reef channel opens and the sea founders arrive at this tick (0 = at the start)
  seals: 60,
  // island: each islander founder starts with this many copies spread through the calm water
  sharkFull: 0.75,
  // island: a sea creature at this share of its size cap is full and won't bite
  biteRange: 2,
  // island: a sea creature's BOMB reach (a bite, not a shot)
  seaFeed: 2,
  // island: max size a sea creature gains per dead cell it collects
  sinkEvery: 6,
  // island: dead cells sink one row every this many ticks (marine snow)
  rot: 3e-3,
  // island: per tick, a dead cell that can't sink rots away with this chance
  corpse: 0.33
  // island: share of a dead body's cells left as dead cells (the rest dissolves)
};
function shaped(w) {
  return {
    id: w.id,
    lineage: w.lineage,
    gen: w.gen,
    zone: w.zone,
    realm: w.realm,
    parent: w.parent,
    born: w.born,
    diesAt: w.diesAt,
    aged: w.aged,
    pace: w.pace,
    traits: w.traits,
    dents: w.dents,
    name: w.name,
    alive: w.alive,
    ipX: w.ipX,
    ipY: w.ipY,
    ox: w.ox,
    oy: w.oy,
    dir: w.dir,
    stack: w.stack,
    maxSize: w.maxSize,
    speed: w.speed,
    accum: w.accum,
    lastOk: w.lastOk,
    lastAct: w.lastAct,
    cellCount: w.cellCount,
    executed: w.executed,
    stats: w.stats,
    harmedAt: w.harmedAt,
    home: w.home,
    leftHomeAt: w.leftHomeAt,
    roomsSeen: w.roomsSeen,
    deathReason: w.deathReason,
    diedAt: w.diedAt,
    spec: w.spec,
    [CELLS]: void 0
    // (not copied: a spread child must find its own)
  };
}
var World = class {
  constructor(seed, specs) {
    this.seed = seed;
    this.board = CONFIG.climb ? makeClimb(seed, CONFIG.plate || 2e3, CONFIG.climbBase, CONFIG.climbSteps, CONFIG.plateFood) : CONFIG.island ? makeIsland(seed, CONFIG.plate || 360, CONFIG.plateBands, CONFIG.plateFood, CONFIG.shallows, CONFIG.calm, CONFIG.depth) : CONFIG.plate ? makePlate(seed, CONFIG.plate, CONFIG.plateBands, CONFIG.plateFood) : makeBoard(seed);
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
    this.flesh = new Uint8Array(this.w * this.h);
    if (CONFIG.climb) this.initTiles();
    for (let y = 0; y < this.h && !CONFIG.climb; y++) {
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
    for (const s of specs) {
      if (CONFIG.island && s.realm === "sea" && CONFIG.sharkArrive > 0) this.arriving.push(s);
      else this.place(s);
    }
    if (CONFIG.island || CONFIG.climb) this.settle();
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
  /** Dead cells: what each is worth, in quarters of an ordinary dead cell (0: ordinary). A kill's corpse is rich, see die. */
  flesh;
  /** Bodies by id: the living, the founders, and the dead outside endless dishes. */
  bodies = /* @__PURE__ */ new Map();
  /**
   * An endless dish's dead (founders aside) keep only which lineage they were, as the index
   * of its shared record (see kill): deadAs[zone][n] is 1 + its place in tombList, 0 for no
   * such body. A byte a body while there are fewer than 255 lineages (a long climb has had
   * 36 million births: a slot each ran to 400 MB and most of every save).
   */
  deadAs = Array.from({ length: ZONES }, () => new Uint8Array(0));
  tombList = [];
  tombIndex = /* @__PURE__ */ new Map();
  // lineage → its place in tombList
  zoneNext = new Array(ZONES).fill(1);
  // each zone's next n (0 is a founder's)
  /** The living warriors (a long dish has far more dead than alive). Rebuilt lazily after deaths. */
  livingList = [];
  livingDirty = false;
  bornIn = /* @__PURE__ */ new Map();
  // lineage → warriors born so far (for names)
  t = 0;
  rng;
  events = [];
  /** Every bomb hit and poison write so far, kin included (the per-warrior stats count rivals only). */
  attacks = { bombs: 0, poisons: 0 };
  result = { over: false, winner: null, reason: "" };
  spawnTimers;
  /** Glyphs a copy error or WRITE can produce: The Climb's chemistry glyphs exist only there. */
  glyphCount() {
    return CONFIG.climb ? GLYPHS.length : CLASSIC_GLYPHS;
  }
  // ---------- The Climb: upkeep only near life ----------
  /** Tiles (CONFIG.tile square): which spawns each holds, whether it's active, and when it last was. */
  spawnsInTile = [];
  tileActive = new Uint8Array(0);
  tileLast = new Float64Array(0);
  activeTiles = [];
  tileCount = new Uint16Array(0);
  // bodies (by IP) per tile, recounted with the active tiles and on each birth
  tileOf(x, y) {
    return Math.floor(y / CONFIG.tile) * this.tw + Math.floor(x / CONFIG.tile);
  }
  tw = 0;
  initTiles() {
    const T = CONFIG.tile;
    this.tw = Math.ceil(this.w / T);
    const n = this.tw * Math.ceil(this.h / T);
    this.spawnsInTile = Array.from({ length: n }, () => []);
    this.tileActive = new Uint8Array(n);
    this.tileLast = new Float64Array(n);
    this.tileCount = new Uint16Array(n);
    this.board.spawns.forEach((s, k) => this.spawnsInTile[Math.floor(s.y / T) * this.tw + Math.floor(s.x / T)].push(k));
  }
  /** How many tiles the world is spending upkeep on right now (of how many). */
  tileStats() {
    return { active: this.activeTiles.length, total: this.tileActive.length };
  }
  /**
   * Mark the tiles around every living body active. A tile that wakes after a long sleep
   * catches up at once: its plants regrow and ripen as if time had passed there too.
   */
  refreshTiles() {
    const T = CONFIG.tile, th = this.tileActive.length / this.tw;
    const next = new Uint8Array(this.tileActive.length);
    this.tileCount.fill(0);
    for (const wr of this.living()) {
      this.tileCount[this.tileOf(wr.ipX, wr.ipY)]++;
      const tx = Math.floor(wr.ipX / T), ty = Math.floor(wr.ipY / T);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = tx + dx, y = ty + dy;
        if (x >= 0 && y >= 0 && x < this.tw && y < th) next[y * this.tw + x] = 1;
      }
    }
    this.activeTiles = [];
    for (let k = 0; k < next.length; k++) {
      if (!next[k]) continue;
      this.activeTiles.push(k);
      if (!this.tileActive[k]) {
        const gap = this.t - this.tileLast[k];
        for (const sk of this.spawnsInTile[k]) {
          const s = this.board.spawns[sk], i = this.idx(s.x, s.y);
          if (this.resource[i] === 0 && this.owner[i] === NONE && gap >= this.regrowAt(s.y)) {
            this.resource[i] = s.kind;
            this.ripe[i] = 1;
            this.spawnTimers[sk] = 0;
          }
          if (this.resource[i] === 1 && CONFIG.foodRipen > 0) this.ripe[i] = Math.min(CONFIG.foodRipeMax, this.ripe[i] + gap / CONFIG.foodRipen);
        }
      }
    }
    for (const k of this.activeTiles) this.tileLast[k] = this.t;
    this.tileActive = next;
  }
  // ---------- The Climb: a world that grows a step wherever life reaches its edge ----------
  /** Rows joined on above the original world so far: every y has moved down by this much (a viewer keeps its camera on the same spot with it). */
  yShift = 0;
  growClimb() {
    const M = 256;
    let top = Infinity, bottom = -1;
    for (const wr of this.living()) {
      if (wr.ipY < top) top = wr.ipY;
      if (wr.ipY > bottom) bottom = wr.ipY;
    }
    const low = bottom >= this.h - M;
    if (top < M) this.addStep(1);
    if (low) this.addStep(-1);
  }
  /**
   * Join the next step on above (dir 1) or below (dir −1), made from its own rng, and open
   * the old wall row between. Below appends rows. Above prepends them, so everything that
   * holds a row or a cell index moves down: the grids, cell sets, spawns, tiles, IPs and
   * origins, homes and starts, sea level.
   */
  addStep(dir) {
    const b = this.board, w = this.w, T = CONFIG.tile, oldH = this.h;
    const n = dir > 0 ? b.stepHi + 1 : b.stepLo - 1, H = climbStepH(b.climbBase, n), h = oldH + H;
    if (n > 127 || n < -128) return;
    if (dir > 0 && H % T) throw new Error(`step ${n} is ${H} rows, not whole ${T}-row tiles`);
    const made = makeClimbStep(this.seed, w, n, H, b.foodSpacing);
    const D = dir > 0 ? H : 0, dI = D * w, newTop = dir > 0 ? 0 : oldH;
    const grown = (a, fill) => {
      const out2 = new a.constructor(w * h);
      if (fill) out2.fill(fill);
      out2.set(a, dI);
      return out2;
    };
    const terrain = grown(b.terrain, 0), step = grown(b.step, 0);
    terrain.set(made.terrain, newTop * w);
    step.fill(n, newTop * w, (newTop + H) * w);
    const wallRow = dir > 0 ? H : oldH - 1;
    for (let x = 1; x < w - 1; x++) terrain[wallRow * w + x] = FLOOR;
    const edge = dir > 0 ? 0 : h - 1;
    for (let x = 0; x < w; x++) terrain[edge * w + x] = WALL;
    const seen = new Uint8Array(w * (H + 1)), q = [];
    const r0 = dir > 0 ? 0 : wallRow;
    for (let x = 1; x < w - 1; x++) {
      const k = (wallRow - r0) * w + x;
      seen[k] = 1;
      q.push(k);
    }
    for (let j = 0; j < q.length; j++) {
      const k = q[j], x = k % w;
      for (const nb of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, k - w, k + w]) {
        if (nb < 0 || nb >= seen.length || seen[nb] || terrain[r0 * w + nb] !== FLOOR) continue;
        seen[nb] = 1;
        q.push(nb);
      }
    }
    for (let y = newTop; y < newTop + H; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (terrain[i] === FLOOR && !seen[i - r0 * w]) terrain[i] = WALL;
    }
    this.owner = grown(this.owner, NONE);
    this.code = grown(this.code, 0);
    this.resource = grown(this.resource, 0);
    this.ripe = grown(this.ripe, 1);
    this.narrow = grown(this.narrow, 0);
    this.flesh = grown(this.flesh, 0);
    b.terrain = terrain;
    b.step = step;
    b.h = h;
    this.h = h;
    if (D) {
      const moved = /* @__PURE__ */ new Set();
      const shift = (r) => {
        if (r && !moved.has(r)) {
          moved.add(r);
          r.y += D;
        }
      };
      for (const s of b.spawns) s.y += D;
      for (const r of b.starts) shift(r);
      for (const wr of new Set(this.allWarriors())) {
        wr.ipY += D;
        wr.oy += D;
        shift(wr.home);
      }
      for (const [id, set] of this.cellSets) {
        const out2 = newCells(id);
        for (const i of set) out2.add(i + dI);
        this.cellSets.set(id, out2);
      }
      for (const wr of this.livingList) wr[CELLS] = void 0;
      this.sortedCells.clear();
      b.seaLevel += D;
      this.yShift += D;
    }
    for (const sp of made.spawns) {
      const s = { x: sp.x, y: sp.y + newTop, kind: sp.kind };
      if (terrain[s.y * w + s.x] !== FLOOR) continue;
      b.spawns.push(s);
      this.spawnTimers.push(0);
      const i = s.y * w + s.x;
      this.resource[i] = s.kind;
      this.ripe[i] = 1;
    }
    if (dir > 0) {
      b.stepTop = b.stepTop.map((t) => t + H);
      b.stepTop.push(0);
      b.stepH.push(H);
      b.stepHi = n;
    } else {
      b.stepTop.unshift(oldH);
      b.stepH.unshift(H);
      b.stepLo = n;
    }
    const tileRows = Math.ceil(h / T), dT = D / T * this.tw, nt = tileRows * this.tw;
    const tiles = (a) => {
      const out2 = new a.constructor(nt);
      out2.set(a, dT);
      return out2;
    };
    this.tileActive = tiles(this.tileActive);
    this.tileLast = tiles(this.tileLast);
    this.tileCount = tiles(this.tileCount);
    this.activeTiles = this.activeTiles.map((k) => k + dT);
    this.spawnsInTile = Array.from({ length: nt }, () => []);
    b.spawns.forEach((s, k) => this.spawnsInTile[Math.floor(s.y / T) * this.tw + Math.floor(s.x / T)].push(k));
    this.terrainVersion++;
    this.log("grow", `the world grows: step ${n > 0 ? "+" : ""}${n} joins on ${dir > 0 ? "above" : "below"} (${H} rows)`);
  }
  /** Climb: ticks for a plant to regrow; sunlight makes it faster the higher the step. */
  regrowAt(y) {
    const n = this.board.step ? this.board.step[y * this.w] : 0;
    return Math.max(1, Math.round(CONFIG.spawnInterval / (1 + Math.max(0, n))));
  }
  /** Climb: how much richer food is at this cell's step (10× per step out). */
  richness(i) {
    return this.board.step ? 10 ** Math.abs(this.board.step[i]) : 1;
  }
  // ---------- setup ----------
  arriving = [];
  /** Bumped whenever the terrain changes (the island's channel opening), so a viewer can redraw scenery. */
  terrainVersion = 0;
  place(spec, at) {
    const nth = this.bornIn.size;
    if (nth >= ZONES) throw new Error(`at most ${ZONES} founders`);
    if (spec.cells.length > CONFIG.startCells) {
      throw new Error(`${spec.name} has ${spec.cells.length} cells; the limit is ${CONFIG.startCells}`);
    }
    const realm = this.board.startRealm ? spec.realm === "sea" ? 1 : 0 : 0;
    const room = CONFIG.climb ? this.board.starts[spec.realm === "deep" ? 1 : 0] : this.board.startRealm ? this.board.starts[this.board.startRealm.indexOf(realm)] : this.board.starts[nth % this.board.starts.length];
    const before = this.board.startRealm ? this.livingList.filter((w) => w.realm === realm && w.gen === 0).length : 0;
    const shift = before ? (before % 2 ? 1 : -1) * Math.ceil(before / 2) * (spec.width + 3) : 0;
    let ox = at ? at[0] : room.x + Math.floor((room.w - spec.width) / 2) + shift;
    let oy = at ? at[1] : room.y + Math.floor((room.h - spec.height) / 2);
    if (!at) {
      const fits = (x, y) => spec.cells.every((c) => this.isFree(x + c.x, y + c.y));
      const near = (n) => Array.from({ length: n + 1 }, (_, k) => (k % 2 ? 1 : -1) * Math.ceil(k / 2));
      search: for (const dy of near(room.h)) for (const dx of near(room.w)) {
        if (fits(ox + dx, oy + dy)) {
          ox += dx;
          oy += dy;
          break search;
        }
      }
    }
    const id = nth;
    const wr = shaped({
      id,
      lineage: id,
      gen: 0,
      realm,
      zone: this.zoneOf(ox + spec.ip.x),
      born: 0,
      name: spec.name,
      alive: true,
      ipX: ox + spec.ip.x,
      ipY: oy + spec.ip.y,
      ox: ox + spec.ip.x,
      oy: oy + spec.ip.y,
      dir: spec.dir,
      stack: [],
      maxSize: CONFIG.climb ? spec.cells.reduce((n, c) => n + (c.code === FAT ? CONFIG.fatStore : CONFIG.stomach), 0) : CONFIG.island ? realm ? CONFIG.sharkCap : CONFIG.sizeCap : CONFIG.startSize,
      speed: CONFIG.speedStart,
      // island and climb founders start full
      accum: 0,
      lastOk: true,
      lastAct: "",
      cellCount: 0,
      executed: 0,
      spec,
      stats: { collected: 0, bombHits: 0, poisonWrites: 0, kills: 0, selfWrites: 0, grows: 0, swaps: 0, flows: 0, oozes: 0, squeezed: 0, rooms: 0 },
      home: room,
      roomsSeen: /* @__PURE__ */ new Set()
    });
    if (CONFIG.lifespan > 0) wr.diesAt = Math.floor(this.lifeOf(wr.realm) * (0.5 + this.rng()));
    for (const c of spec.cells) {
      const x = ox + c.x, y = oy + c.y;
      if (!this.isFloor(x, y)) throw new Error(`${spec.name} does not fit in its start room`);
      const i = this.idx(x, y);
      this.setOwner(i, id);
      this.code[i] = c.code;
      this.resource[i] = 0;
      wr.cellCount++;
    }
    this.enroll(wr);
    this.bornIn.set(id, 1);
    return wr;
  }
  /** A body by id (a dead one in an endless dish: its lineage's shared record; undefined for an id no body has). */
  warrior(id) {
    return this.bodies.get(id) ?? this.buried(id);
  }
  buried(id) {
    const k = this.deadAs[id % ZONES]?.[Math.floor(id / ZONES)];
    return k ? this.tombList[k - 1] : void 0;
  }
  /** How many bodies have ever lived. */
  everLived() {
    let n = this.bornIn.size;
    for (const k of this.zoneNext) n += k - 1;
    return n;
  }
  /** Every body on record, in id order: an endless dish's dead once each, as their lineages' shared records (after their founders). */
  allWarriors() {
    return [...this.bodies.values(), ...this.tombList].sort((a, b) => a.id - b.id);
  }
  /** The band of columns x is in. */
  zoneOf(x) {
    return Math.min(ZONES - 1, Math.max(0, Math.floor(x * ZONES / this.w)));
  }
  /** The id of a zone's next birth (taken). */
  nextId(zone) {
    return this.zoneNext[zone]++ * ZONES + zone;
  }
  /** A new body joins: under its id, and at the end of the living. */
  enroll(wr) {
    this.bodies.set(wr.id, wr);
    this.livingList.push(wr);
  }
  /** An endless dish's dead body: forgotten but for which lineage's record it now is. */
  bury(id, tomb) {
    let k = this.tombIndex.get(tomb.lineage);
    if (k === void 0) {
      k = this.tombList.push(tomb) - 1;
      this.tombIndex.set(tomb.lineage, k);
    }
    const z = id % ZONES, n = Math.floor(id / ZONES);
    let a = this.deadAs[z];
    const C = k + 1 > 65535 || a instanceof Int32Array ? Int32Array : k + 1 > 255 || a instanceof Uint16Array ? Uint16Array : Uint8Array;
    if (n >= a.length || !(a instanceof C)) {
      const b = new C(Math.max(n + 1, a.length * 2, 1024));
      b.set(a);
      a = this.deadAs[z] = b;
    }
    a[n] = k + 1;
    this.bodies.delete(id);
  }
  /** After a load: the living back in one shape (see shaped). */
  reshape() {
    const old = this;
    if (old.zoneBodies) {
      const tombs = new Set(this.tombstones.values());
      this.bodies = /* @__PURE__ */ new Map();
      this.tombList = [];
      this.tombIndex = /* @__PURE__ */ new Map();
      this.deadAs = Array.from({ length: ZONES }, () => new Uint8Array(0));
      old.zoneBodies.forEach((zb, z) => {
        for (let n = 0; n < zb.length; n++) {
          const wr = zb[n];
          if (!wr) continue;
          const id = n * ZONES + z;
          if (tombs.has(wr)) this.bury(id, wr);
          else this.bodies.set(id, wr);
        }
      });
      old.zoneBodies = void 0;
    }
    this.livingList = this.living().map((wr) => {
      const s = shaped(wr);
      this.bodies.set(wr.id, s);
      return s;
    });
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
  /** Free for this warrior to move into: free, or (island) vegetation a sea creature swims over (it stays) or a dead cell it eats. */
  passable(wr, x, y) {
    if (this.sharkBlocked(wr, y)) return false;
    if (this.isFree(x, y)) return true;
    if (!CONFIG.island || wr.realm !== 1 || !this.isFloor(x, y)) return false;
    const o = this.owner[this.idx(x, y)];
    return o === NONE || o === DEBRIS;
  }
  /** Island survival: sea creatures can't get into the shallows or onto land (blocked, never hurt). */
  sharkBlocked(wr, y) {
    return CONFIG.island && wr.realm === 1 && y < (this.board.sharkLine ?? 0);
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
  // (the dead cells' cellsOf cache: a body's is on its Cells)
  /** A code in one of a body's cells changed: its traits are stale (see Cells.fresh). */
  changed(id) {
    const s = this.cellSets.get(id);
    if (s instanceof Cells) s.fresh = false;
  }
  /** A body's cells (its Cells, or undefined with none), linked from the body to save a lookup. */
  cells(wr) {
    return wr[CELLS] ??= this.cellSets.get(wr.id);
  }
  /** The way `owner` changes (opShift does a bulk equivalent). */
  setOwner(i, v) {
    const o = this.owner[i];
    if (o === v) return;
    if (o !== NONE) {
      this.cellSets.get(o).delete(i);
      if (o === DEBRIS) {
        this.flesh[i] = 0;
        this.sortedCells.delete(DEBRIS);
      }
    }
    this.owner[i] = v;
    if (v !== NONE) {
      let set = this.cellSets.get(v);
      if (!set) {
        set = newCells(v);
        this.cellSets.set(v, set);
      }
      set.add(i);
      if (v === DEBRIS) this.sortedCells.delete(DEBRIS);
    }
  }
  /** cellsOf for a body in hand (by its link, no lookup by id). */
  mineOf(wr) {
    const c = this.cells(wr);
    return c ? c.sorted ??= Array.from(Int32Array.from(c.items).sort()) : [];
  }
  /** A warrior's (or DEBRIS's) cells in board order. Treat the array as read-only. */
  cellsOf(id) {
    const set = this.cellSets.get(id);
    if (!set) return [];
    if (set instanceof Cells) return set.sorted ??= Array.from(Int32Array.from(set.items).sort());
    let out2 = this.sortedCells.get(id);
    if (!out2) {
      out2 = Array.from(Int32Array.from(set).sort());
      this.sortedCells.set(id, out2);
    }
    return out2;
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
    const mine = this.mineOf(wr);
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
  /** A cell of a body turns to a dead cell, or (island, climb) maybe dissolves. True if it's left as a dead cell. */
  toDebris(i) {
    const o = this.owner[i];
    if (o >= 0) this.warrior(o).cellCount--;
    if ((CONFIG.island || CONFIG.climb) && (CONFIG.island && o >= 0 && this.warrior(o).realm === 1 || this.rng() >= CONFIG.corpse)) {
      this.setOwner(i, NONE);
      this.code[i] = 0;
      return false;
    }
    this.setOwner(i, DEBRIS);
    return true;
  }
  /** What eating the dead cell at i is worth, as a multiple of an ordinary one. */
  worth(i) {
    const f = this.flesh[i];
    return f ? f / 4 : 1;
  }
  /** Deaths so far by realm and cause (`0|core frozen`), kept as a tally since dishes forget the dead. */
  deaths = /* @__PURE__ */ new Map();
  tombstones = /* @__PURE__ */ new Map();
  /** A new child's name: its founder's name and its id. (Counts it in its lineage's births.) */
  childName(lineage, id) {
    this.bornIn.set(lineage, (this.bornIn.get(lineage) ?? 1) + 1);
    return `${this.warrior(lineage).name}\xB7${id}`;
  }
  /** Descendants a founder has had (alive or dead). */
  bornCount(lineage) {
    return (this.bornIn.get(lineage) ?? 1) - 1;
  }
  kill(wr, reason) {
    if (!wr.alive) return;
    this.die(wr, reason);
    this.cellSets.delete(wr.id);
    wr[CELLS] = void 0;
    const k = `${wr.realm}|${reason.replace(/ by .*/, "").replace(/ \(.*/, "")}`;
    this.deaths.set(k, (this.deaths.get(k) ?? 0) + 1);
    if (CONFIG.endless && wr.gen > 0) {
      let tomb = this.tombstones.get(wr.lineage);
      if (!tomb) {
        const f = this.warrior(wr.lineage), s = f.spec;
        tomb = {
          id: f.id,
          lineage: f.id,
          gen: 1,
          realm: f.realm,
          zone: f.zone,
          born: 0,
          name: `${f.name} (dead)`,
          alive: false,
          deathReason: "dead",
          ipX: 0,
          ipY: 0,
          ox: 0,
          oy: 0,
          dir: s.dir,
          stack: [],
          maxSize: 0,
          speed: 0,
          accum: 0,
          lastOk: true,
          lastAct: "",
          cellCount: 0,
          executed: 0,
          stats: { collected: 0, bombHits: 0, poisonWrites: 0, kills: 0, selfWrites: 0, grows: 0, swaps: 0, flows: 0, oozes: 0, squeezed: 0, rooms: 0 },
          home: f.home,
          roomsSeen: /* @__PURE__ */ new Set(),
          spec: s
        };
        this.tombstones.set(wr.lineage, tomb);
      }
      this.bury(wr.id, tomb);
    }
  }
  /**
   * A death. Its cells are left as dead cells (island, climb: some of them). A kill (a death
   * within creditWindow ticks of being bitten or written into) leaves a rich corpse: its dead
   * cells share the whole body's worth (duels: a cut of its max size on top), for whoever eats
   * them, the killer or not. Nothing is paid to anyone: a death touches only the dead.
   */
  die(wr, reason) {
    wr.alive = false;
    this.livingDirty = true;
    wr.deathReason = reason;
    wr.diedAt = this.t;
    const cells = this.mineOf(wr).slice(), kept = [];
    for (const c of cells) if (this.toDebris(c)) kept.push(c);
    const kill = wr.harmedAt !== void 0 && this.t - wr.harmedAt <= CONFIG.creditWindow;
    if (kill && kept.length) {
      const m = CONFIG.island || CONFIG.climb ? (cells.length + 1) / kept.length : 1 + CONFIG.killPay * wr.maxSize / (CONFIG.debrisPickup * kept.length);
      const q = Math.min(255, Math.round(4 * m));
      for (const c of kept) this.flesh[c] = q;
    }
    this.log("death", `${wr.name} died: ${reason}${kill && kept.length ? ", a rich corpse" : ""}`, wr.id);
  }
  /** Destroy a cell outright (bomb). Handles core loss and disconnection. */
  /** Destroy a cell outright: a bomb (`by`), or the plate's toxin (no `by`). */
  destroy(i, by, cause = "core poisoned by the toxin") {
    const o = this.owner[i];
    this.setOwner(i, NONE);
    this.code[i] = 0;
    if (o < 0) return;
    const victim = this.warrior(o);
    victim.cellCount--;
    if (by) victim.harmedAt = this.t;
    if (i === this.idx(victim.ipX, victim.ipY)) {
      if (by && by.lineage !== victim.lineage) by.stats.kills++;
      this.kill(victim, by ? `core bombed by ${by.name}` : cause);
      return;
    }
    const cut = this.unreached(victim);
    if (cut.length) {
      for (const c of cut) this.toDebris(c);
      this.log("cut", `${victim.name} lost ${cut.length} cells cut off`, victim.id);
    }
  }
  // ---------- tick ----------
  /**
   * One tick: the clock, growth and tiles; plants regrow; dead cells sink; every body's turn,
   * in a rotating order so nobody always moves first; upkeep for every body; the end check.
   */
  tick() {
    if (!this.beginTick()) return;
    this.regrow();
    this.drift();
    const living = this.living(), n = living.length;
    for (let k = 0; k < n; k++) {
      const wr = living[(this.t + k) % n];
      if (wr.alive) this.turn(wr);
    }
    const after = this.living(), m = after.length;
    for (let k = 0; k < m; k++) {
      const wr = after[k];
      if (wr.alive) this.upkeep(wr);
    }
    this.checkOver();
  }
  /** Start a tick: the clock, the climb's growth and tiles. False once the match is over. */
  beginTick() {
    if (this.result.over) return false;
    this.t++;
    if (CONFIG.climb && this.t % 100 === 0) this.growClimb();
    if (CONFIG.climb && (this.t % 20 === 1 || !this.activeTiles.length)) this.refreshTiles();
    return true;
  }
  /** Plants regrow at empty spots (the climb: only in active tiles). */
  regrow() {
    const spawns = this.board.spawns;
    if (CONFIG.climb) {
      for (const t of this.activeTiles) for (const k of this.spawnsInTile[t]) this.regrowSpawn(k);
    } else for (let k = 0; k < spawns.length; k++) this.regrowSpawn(k);
  }
  /** One spawn point's regrowth. */
  regrowSpawn(k) {
    const s = this.board.spawns[k];
    const i = this.idx(s.x, s.y);
    if (CONFIG.foodRipen > 0 && this.resource[i] === 1) this.ripe[i] = Math.min(CONFIG.foodRipeMax, this.ripe[i] + 1 / CONFIG.foodRipen);
    let touched = this.resource[i] !== 0 || this.owner[i] !== NONE;
    for (let d = 0; d < 4 && !touched; d++) touched = this.ownerAt(s.x + DX[d], s.y + DY[d]) !== NONE;
    if (touched) {
      this.spawnTimers[k] = 0;
      return;
    }
    if (++this.spawnTimers[k] >= (CONFIG.climb ? this.regrowAt(s.y) : CONFIG.spawnInterval)) {
      this.resource[i] = s.kind;
      this.ripe[i] = 1;
      this.spawnTimers[k] = 0;
    }
  }
  /** Dead cells sink (island, climb); island sharks arrive. */
  drift() {
    this.stream(-1);
    if (CONFIG.island || CONFIG.climb) this.islandTick();
    if (this.arriving.length && this.t >= CONFIG.sharkArrive) this.arrive();
  }
  /**
   * Point the rng at this tick's stream for `key` (a body's turn 2·id, its upkeep 2·id+1, the
   * drift −1). Whatever happens inside, kills and births included, draws from that stream.
   */
  stream(key) {
    this.rng.state = streamSeed(this.seed, this.t, key);
  }
  /** One body's turn. */
  turn(wr) {
    this.stream(2 * wr.id);
    wr.accum += wr.speed;
    while (wr.accum >= 1 && wr.alive) wr.accum -= this.step(wr);
  }
  /** Upkeep for one living body: whole-body stats, the climb's cold and pressure, pace, hunger, aging; shed or die. */
  upkeep(wr) {
    this.stream(2 * wr.id + 1);
    const cells = this.cells(wr);
    const tox = this.board.toxinBy ? this.board.toxinBy[wr.realm] : this.board.toxin;
    let doomed, swept = false, burn = 0;
    if (cells) {
      const hm = wr.home, w = this.w, narrowAt = this.narrow;
      let home = 0, narrow = 0, x0 = w, y0 = this.h, x1 = -1, y1 = -1;
      if (wr.leftHomeAt === void 0 || this.board.rooms.length) {
        for (const c of cells) {
          const y = c / w | 0, x = c - y * w;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
          if (x >= hm.x && y >= hm.y && x < hm.x + hm.w && y < hm.y + hm.h) home++;
          if (narrowAt[c]) narrow++;
        }
      } else if (CONFIG.climb && !tox) {
        const tr = this.freshTraits(wr, cells), st = this.board.step, insulation = tr.insulation, armor = tr.armor;
        const shell = CONFIG.shellBurn, fat = CONFIG.fatBurn;
        const items = cells.items;
        for (let j = 0; j < items.length; j++) {
          const c = items[j];
          if (narrowAt[c]) narrow++;
          const n = st[c], g = this.code[c];
          burn += (g === K || g === INSUL ? shell : g === FAT ? fat : 1) * (1 << (n < 0 ? -n : n));
          if (!n) continue;
          const over = n > 0 ? n - insulation : -n - armor;
          if (over > 0 && this.rng() < CONFIG.toxinRate * CONFIG.toxinStep ** (over - 1)) (doomed ??= []).push(c);
        }
        swept = true;
      } else for (const c of cells) if (narrowAt[c]) narrow++;
      if (wr.leftHomeAt === void 0 && home === 0 && cells.size > 0) {
        wr.leftHomeAt = this.t;
        this.log("left", `${wr.name} left its start room (whole body)`, wr.id);
      }
      if (cells.size >= 4 && 2 * narrow >= cells.size) wr.stats.squeezed++;
      const rooms = this.board.rooms;
      if (home === 0) for (let k = 0; k < rooms.length; k++) {
        const r = rooms[k];
        if (x0 < r.x || y0 < r.y || x1 >= r.x + r.w || y1 >= r.y + r.h || wr.roomsSeen.has(k)) continue;
        if (r.x === hm.x && r.y === hm.y) continue;
        wr.roomsSeen.add(k);
        wr.stats.rooms++;
        this.log("room", `${wr.name} moved its whole body into another room`, wr.id);
      }
    }
    if (tox && cells) {
      let armor = 0;
      for (const c of cells) if (this.code[c] === K) armor++;
      const doomed2 = [];
      for (const c of cells) {
        const over = tox[c] - armor;
        if (over > 0 && this.rng() < CONFIG.toxinRate * CONFIG.toxinStep ** (over - 1)) doomed2.push(c);
      }
      const cause = !this.board.toxinBy ? void 0 : wr.realm ? "core crushed (too shallow)" : "core crushed by the pressure";
      for (const c of doomed2) {
        if (!wr.alive) break;
        if (this.owner[c] === wr.id) this.destroy(c, void 0, cause);
      }
      if (!wr.alive) return;
    }
    if (CONFIG.climb && cells) {
      const st = this.board.step;
      if (!swept) {
        const tr = this.freshTraits(wr, cells), shell = CONFIG.shellBurn, fat = CONFIG.fatBurn;
        for (const c of cells) {
          const n = st[c], g = this.code[c];
          burn += (g === K || g === INSUL ? shell : g === FAT ? fat : 1) * (1 << (n < 0 ? -n : n));
          if (!n) continue;
          const over = n > 0 ? n - tr.insulation : -n - tr.armor;
          if (over > 0 && this.rng() < CONFIG.toxinRate * CONFIG.toxinStep ** (over - 1)) (doomed ??= []).push(c);
        }
      }
      if (doomed) for (const c of doomed) {
        if (!wr.alive) break;
        if (this.owner[c] === wr.id) this.destroy(c, void 0, st[c] > 0 ? "core frozen (too high)" : "core crushed by the pressure");
      }
      if (!wr.alive) return;
    }
    if (CONFIG.island || CONFIG.climb) {
      const pace = CONFIG.climb ? (wr.traits ??= this.traitsOf(wr)).pace : this.paceOf(wr);
      wr.pace = pace;
      wr.speed = CONFIG.paceSpeed * pace;
      if (CONFIG.climb) wr.maxSize = Math.max(0, wr.maxSize - burn * CONFIG.stomach / CONFIG.climbStarve);
      else {
        const hunger = pace * (Math.sqrt(20) - 1) * 2 * Math.sqrt(CONFIG.startSize) / CONFIG.sizeDecay / (wr.realm ? CONFIG.sharkStarve : CONFIG.starve);
        wr.maxSize = Math.max(0, wr.maxSize - hunger * CONFIG.sizeDecay * Math.sqrt(wr.maxSize / CONFIG.startSize));
      }
      wr.aged = (wr.aged ?? 0) + pace;
    } else {
      wr.maxSize = Math.max(0, wr.maxSize - CONFIG.sizeDecay * Math.sqrt(wr.maxSize / CONFIG.startSize));
      wr.speed = Math.max(CONFIG.speedFloor, wr.speed - CONFIG.speedDecay);
    }
    if (wr.maxSize < 1) this.kill(wr, "starved (max size fell to 0)");
    else if (wr.cellCount > Math.floor(wr.maxSize)) this.shed(wr);
    if (!wr.alive) return;
    if (wr.cellCount <= 0) this.kill(wr, "no cells left");
    else if (wr.diesAt !== void 0 && (CONFIG.island || CONFIG.climb ? (wr.aged ?? 0) >= wr.diesAt - wr.born : this.t >= wr.diesAt)) this.kill(wr, "old age");
    else wr.zone = this.zoneOf(wr.ipX);
  }
  /** The Climb: a body's traits, recomputed only if its cells changed since (see Cells.fresh). */
  freshTraits(wr, cells) {
    if (wr.traits && cells.fresh) return wr.traits;
    cells.fresh = true;
    return wr.traits = this.traitsOf(wr);
  }
  /**
   * Island survival: a settled archipelago. Each islander founder gets CONFIG.seals copies
   * of itself (its descendants, generation 1) scattered through the calm water.
   */
  settle() {
    for (const f of this.livingList.filter((w) => w.realm === 0 && w.gen === 0)) {
      const S = this.board.surface ?? 0, calm = this.board.calmLine ?? S;
      const room = this.board.starts[f.spec.realm === "deep" ? 1 : 0];
      for (let n = 0, tries = 0; n < CONFIG.seals && tries < CONFIG.seals * 50; tries++) {
        const bay = this.board.starts[1], x0 = bay.x + bay.w + 2;
        const ox = CONFIG.climb ? room.x + Math.floor(this.rng() * Math.max(1, room.w - f.spec.width)) : x0 + Math.floor(this.rng() * (this.w - 1 - x0 - f.spec.width));
        const oy = CONFIG.climb ? room.y + Math.floor(this.rng() * Math.max(1, room.h - f.spec.height)) : S + Math.floor(this.rng() * Math.max(1, calm - S - f.spec.height));
        if (!f.spec.cells.every((c) => this.isFree(ox + c.x, oy + c.y))) continue;
        const zone = this.zoneOf(ox + f.spec.ip.x), id = this.nextId(zone);
        const wr = shaped({
          ...f,
          id,
          zone,
          gen: 1,
          parent: f.id,
          name: this.childName(f.lineage, id),
          ipX: ox + f.spec.ip.x,
          ipY: oy + f.spec.ip.y,
          ox: ox + f.spec.ip.x,
          oy: oy + f.spec.ip.y,
          stack: [],
          cellCount: 0,
          executed: 0,
          roomsSeen: /* @__PURE__ */ new Set(),
          stats: { collected: 0, bombHits: 0, poisonWrites: 0, kills: 0, selfWrites: 0, grows: 0, swaps: 0, flows: 0, oozes: 0, squeezed: 0, rooms: 0 }
        });
        if (CONFIG.lifespan > 0) wr.diesAt = Math.floor(this.lifeOf(0) * (0.5 + this.rng()));
        this.enroll(wr);
        for (const c of f.spec.cells) {
          const i = this.idx(ox + c.x, oy + c.y);
          this.setOwner(i, id);
          this.code[i] = c.code;
          wr.cellCount++;
        }
        n++;
      }
    }
  }
  /**
   * Island survival: a body's pace, from what it's made of. Move cells (M) quicken it; mass
   * slows it, with armor (K) and fat (.) counting double. The seal founder is 1.
   */
  paceOf(wr) {
    let m = 0, mass = 0;
    for (const c of this.mineOf(wr)) {
      const g = this.code[c];
      if (g === CODE["M"]) m++;
      mass += g === K || g === CODE["."] ? 2 : 1;
    }
    return (1 + m) / (1 + mass / CONFIG.paceMass);
  }
  /** Size cap for a realm (island sea creatures are big and need room to breed; a climb body's store is its cells', fat holding most). */
  capOf(wr) {
    if (CONFIG.climb) {
      const cells = this.cells(wr), fat = cells ? this.freshTraits(wr, cells).fat : 0;
      return CONFIG.stomach * (wr.cellCount - fat) + CONFIG.fatStore * fat;
    }
    return CONFIG.island && wr.realm === 1 ? CONFIG.sharkCap : CONFIG.sizeCap;
  }
  /**
   * The Climb: a body's chemistry. Each cell adds to its traits: K armor, I insulation, M
   * move, B bite (and a taste for meat), C a taste for plants (if C outnumber B); K, I and fat (.) weigh 2, the
   * rest 1. Modifier cells change the cells beside them (of the same body): ~ flips K ⇄ I,
   * x doubles a cell's trait, n makes a cell weigh nothing. Pace = (1 + move) / (1 + mass / 11).
   */
  traitsOf(wr) {
    const w = this.w, id = wr.id;
    let armor = 0, insulation = 0, mass = 0, move = 0, bite = 0, plants = 0, meat = 0, fat = 0;
    const cells = this.cellSets.get(id)?.items;
    if (cells) for (let j = 0; j < cells.length; j++) {
      const c = cells[j];
      let g = this.code[c], flip = false, dbl = 1, weightless = false;
      for (let k = 0; k < 4; k++) {
        const nb = k === 0 ? c - 1 : k === 1 ? c + 1 : k === 2 ? c - w : c + w;
        if (this.owner[nb] !== id) continue;
        const m = this.code[nb];
        if (m === FLIP) flip = !flip;
        else if (m === DOUBLE) dbl *= 2;
        else if (m === MASK) weightless = true;
      }
      if (flip) g = g === K ? INSUL : g === INSUL ? K : g;
      if (!weightless) mass += g === K || g === INSUL || g === FAT ? 2 : 1;
      if (g === K) armor += dbl;
      else if (g === INSUL) insulation += dbl;
      else if (g === MOVE) move += dbl;
      else if (g === BITE) {
        bite += dbl;
        meat++;
      } else if (g === COLLECT) plants++;
      else if (g === FAT) fat++;
    }
    return { armor, insulation, mass, fat, move, bite: Math.max(1, bite), plants: plants > meat, meat: meat > 0, pace: (1 + move) / (1 + mass / CONFIG.paceMass) };
  }
  /** The Climb: how much of a food a body digests (a body that eats both gets 60% of each). */
  dietShare(wr, food) {
    const t = wr.traits;
    if (!CONFIG.climb || !t) return 1;
    if (!t[food]) return 0;
    return t.plants && t.meat ? 0.6 : 1;
  }
  /** Typical lifespan for a realm (island sea creatures live CONFIG.sharkLife times longer). */
  lifeOf(realm) {
    return CONFIG.lifespan * (CONFIG.island && realm === 1 ? CONFIG.sharkLife : 1);
  }
  /** Island survival: weather opens the reef channel and the waiting sea founders swim in, each once its spot is clear. */
  arrive() {
    if (this.board.reef?.length) {
      for (const i of this.board.reef) this.board.terrain[i] = FLOOR;
      this.board.reef = [];
      this.terrainVersion++;
      this.log("arrive", "weather opens a channel through the reef");
    }
    for (let k = 0; k < this.arriving.length; k++) {
      const spec = this.arriving[k];
      const room = this.board.starts[this.board.startRealm.indexOf(1)];
      let at = null;
      for (let oy = room.y + 1; oy + spec.height <= room.y + room.h && !at; oy += 2) {
        for (let ox = room.x; ox + spec.width <= room.x + room.w && !at; ox++) {
          if (spec.cells.every((c) => this.isFloor(ox + c.x, oy + c.y) && this.owner[this.idx(ox + c.x, oy + c.y)] === NONE)) at = [ox, oy];
        }
      }
      if (!at) continue;
      const wr = this.place(spec, at);
      wr.born = this.t;
      if (CONFIG.lifespan > 0) wr.diesAt = this.t + Math.floor(this.lifeOf(1) * (0.5 + this.rng()));
      this.arriving.splice(k--, 1);
      this.log("arrive", `${spec.name} arrives`, wr.id);
    }
  }
  /** Island survival, once a tick: dead cells sink (and rot where they can't). */
  islandTick() {
    if (this.t % CONFIG.sinkEvery === 0) this.sink(this.cellsOf(DEBRIS).slice().reverse());
  }
  /**
   * Dead cells sink, bottom rows first so a column of them falls together, and rot where they
   * can't. Each column draws from its own stream, so columns don't depend on each other.
   * `dead` is in descending index order.
   */
  sink(dead) {
    const col = /* @__PURE__ */ new Map();
    for (const c of dead) {
      const below = c + this.w, x = c % this.w;
      if (this.isFloor(x, (c / this.w | 0) + 1) && this.owner[below] === NONE) {
        this.setOwner(below, DEBRIS);
        this.code[below] = this.code[c];
        this.flesh[below] = this.flesh[c];
        this.setOwner(c, NONE);
        this.code[c] = 0;
        continue;
      }
      this.rng.state = col.get(x) ?? streamSeed(this.seed, this.t, -2 - x);
      const rot = this.rng() < CONFIG.rot * CONFIG.sinkEvery;
      col.set(x, this.rng.state);
      if (rot) {
        this.setOwner(c, NONE);
        this.code[c] = 0;
      }
    }
  }
  /**
   * Upkeep: lose one cell. Burn fat first, then plain cells, and the body's protection (K,
   * I, and an x or ~ beside one) last: within each, the farthest cell whose removal keeps
   * the body connected. If none will do, drop the cell farthest (by path) from the IP,
   * which can never disconnect the rest.
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
    const w = this.w, id = wr.id;
    const tier = (c) => {
      const g = this.code[c];
      if (g === FAT) return 0;
      if (g === K || g === INSUL) return 2;
      if (g === DOUBLE || g === FLIP) {
        for (const nb of [c - 1, c + 1, c - w, c + w]) if (this.owner[nb] === id && (this.code[nb] === K || this.code[nb] === INSUL)) return 2;
      }
      return 1;
    };
    let drop = byFar[0];
    pick: for (let t = 0; t < 3; t++) for (const c of byFar) {
      if (tier(c) !== t) continue;
      this.setOwner(c, NONE);
      const ok = this.unreached(wr).length === 0;
      this.setOwner(c, wr.id);
      if (ok) {
        drop = c;
        break pick;
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
    return team !== -1 && this.allWarriors().some((w) => w.lineage !== team);
  }
  checkOver() {
    const living = this.living().length;
    if (CONFIG.endless && this.t < CONFIG.tickCap) return;
    if (living > 1 && this.t < CONFIG.tickCap && !this.oneTeamLeft()) return;
    const founders = [...this.bornIn.keys()];
    const teams = /* @__PURE__ */ new Map();
    for (const w of this.living()) teams.set(w.lineage, [...teams.get(w.lineage) ?? [], w]);
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
    if (this.result.over) this.log("over", this.result.winner === null ? `Match over: ${this.result.reason}` : `${this.warrior(this.result.winner).name} wins: ${this.result.reason}`);
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
  /**
   * Move the IP to the next own cell in its direction, wrapping within the body: of the body's
   * cells on the IP's row (or column), the nearest ahead, counting on round the board's edge.
   * (From the body's own cells: walking the board would cross its whole width to find them.)
   */
  advance(wr) {
    const cells = this.mineOf(wr);
    const w = this.w, dir = wr.dir;
    let best = -1, bestD = Infinity;
    if (dir === 0 || dir === 2) {
      const row0 = wr.ipY * w, pos = wr.ipX, fwd = dir === 0;
      for (const c of cells) {
        const p = c - row0;
        if (p < 0 || p >= w || p === pos) continue;
        const d = fwd ? p > pos ? p - pos : p - pos + w : p < pos ? pos - p : pos - p + w;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
    } else {
      const h = this.h, x = wr.ipX, pos = wr.ipY, fwd = dir === 1;
      for (const c of cells) {
        const p = (c - x) / w;
        if (p !== (p | 0) || p === pos) continue;
        const d = fwd ? p > pos ? p - pos : p - pos + h : p < pos ? pos - p : pos - p + h;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
    }
    if (best >= 0) this.setIp(wr, best);
  }
  setIp(wr, i) {
    wr.ipX = i % this.w;
    wr.ipY = i / this.w | 0;
  }
  /** Execute one instruction. Returns its cycle cost. */
  step(wr) {
    const op = this.code[this.idx(wr.ipX, wr.ipY)], g = GLYPHS[op] ?? ".";
    wr.executed++;
    let skip = false;
    let cost = OP_COST[op] ?? 1;
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
        if (!wr.stack.length) {
          wr.lastOk = this.opBombNearest(wr);
          break;
        }
        const dy = this.pop(wr), dx = this.pop(wr);
        const [fx, fy] = this.frame(wr);
        wr.lastOk = this.opBombAt(wr, fx + dx, fy + dy);
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
    if (OP_ACTS[op]) wr.lastAct = g;
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
    const mine = this.mineOf(wr);
    const r = CONFIG.sight;
    const [fx, fy] = this.frame(wr);
    if (CONFIG.climb) {
      this.ringScan(wr, type, mine, fx, fy);
      return;
    }
    const x0 = Math.max(0, wr.ipX - r - 16), x1 = Math.min(this.w - 1, wr.ipX + r + 16);
    const y0 = Math.max(0, wr.ipY - r - 16), y1 = Math.min(this.h - 1, wr.ipY + r + 16);
    const cands = [];
    const consider = (i) => {
      const x = i % this.w, y = i / this.w | 0;
      if (x < x0 || x > x1 || y < y0 || y > y1) return;
      if (CONFIG.island && wr.realm === 1 && y < (this.board.sharkLine ?? 0)) return;
      const t = this.classify(x, y, wr.id);
      const match = type === T_RESOURCE ? t === T_SIZE || t === T_SPEED : t === type;
      if (!match || t === T_WALL || t === T_NOTHING) return;
      cands.push([Math.abs(x - fx) + Math.abs(y - fy), i, x, y]);
    };
    if (type === T_ENEMY) {
      for (const other of this.living()) if (other.id !== wr.id && !(CONFIG.island && other.realm === wr.realm)) for (const i of this.cellSets.get(other.id) ?? []) consider(i);
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
  /**
   * The Climb's SCAN: the same answer as the classic scan (nearest to the frame origin,
   * then board order, among things in sight), found by searching outward ring by ring
   * (Manhattan distance from the frame origin) and stopping at the first match it can see,
   * so its cost follows what's near, not how big the world is.
   */
  ringScan(wr, type, mine, fx, fy) {
    const r = CONFIG.sight, maxD = 2 * (r + 16), W = this.w;
    let bx0 = W, bx1 = -1;
    for (const c of mine) {
      const x = c % W;
      if (x < bx0) bx0 = x;
      if (x > bx1) bx1 = x;
    }
    const by0 = mine.length ? mine[0] / W | 0 : this.h, by1 = mine.length ? mine[mine.length - 1] / W | 0 : -1;
    const x0 = Math.max(0, wr.ipX - r - 16, bx0 - r), x1 = Math.min(W - 1, wr.ipX + r + 16, bx1 + r);
    const y0 = Math.max(0, wr.ipY - r - 16, by0 - r), y1 = Math.min(this.h - 1, wr.ipY + r + 16, by1 + r);
    const terrain = this.board.terrain, owner = this.owner, resource = this.resource, me = wr.id;
    const keys = SCAN_KEYS;
    let n = 0;
    for (let y = y0; y <= y1; y++) {
      const ady = y < fy ? fy - y : y - fy;
      if (ady > maxD) continue;
      const row = y * W;
      for (let x = x0; x <= x1; x++) {
        const i = row + x, o = owner[i], res = resource[i];
        if (o === NONE && res === 0) continue;
        if (terrain[i] !== FLOOR) continue;
        const t = o === DEBRIS ? T_DEBRIS : o >= 0 && o !== me ? T_ENEMY : res === 1 ? T_SIZE : res === 2 ? T_SPEED : T_NOTHING;
        if (t === T_NOTHING) continue;
        if (!(type === T_RESOURCE ? t === T_SIZE || t === T_SPEED : t === type)) continue;
        if (t === T_ENEMY && this.warrior(o).lineage === wr.lineage) continue;
        const d = ady + (x < fx ? fx - x : x - fx);
        if (d > maxD) continue;
        keys[n++] = d * 4294967296 + i;
      }
    }
    const found = keys.subarray(0, n).sort();
    for (let k = 0; k < n; k++) {
      const i = found[k] % 4294967296, x = i % W, y = i / W | 0;
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
    const mine = this.mineOf(wr);
    for (const c of mine) {
      const nx = c % this.w + DX[d], ny = (c / this.w | 0) + DY[d];
      if (this.ownerAt(nx, ny) === wr.id) continue;
      if (!this.passable(wr, nx, ny)) return false;
    }
    if (CONFIG.island && wr.realm === 1) {
      for (const c of mine) {
        const t = c + DY[d] * this.w + DX[d];
        if (this.owner[t] !== DEBRIS) continue;
        const feed = CONFIG.seaFeed * this.worth(t);
        this.setOwner(t, NONE);
        this.code[t] = 0;
        wr.maxSize = Math.min(this.capOf(wr), wr.maxSize + feed);
        wr.stats.collected++;
      }
    }
    const n = mine.length, codes = SHIFT_CODES.length >= n ? SHIFT_CODES : SHIFT_CODES = new Uint8Array(2 * n);
    const owner = this.owner, code = this.code, id = wr.id, delta = DY[d] * this.w + DX[d];
    for (let k = 0; k < n; k++) {
      const c = mine[k];
      codes[k] = code[c];
      owner[c] = NONE;
      code[c] = 0;
    }
    let set = this.cells(wr);
    const fresh = !!set?.fresh;
    if (set) set.clear();
    else this.cellSets.set(id, set = new Cells());
    for (let k = 0; k < n; k++) {
      const c = mine[k] += delta;
      owner[c] = id;
      code[c] = codes[k];
      set.add(c);
    }
    set.sorted = mine;
    set.fresh = fresh;
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
          if (n !== src && this.owner[n] === id && !seen.has(n)) {
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
          if (!this.isFree(nx, ny) || this.sharkBlocked(wr, ny)) continue;
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
    if (this.ownerAt(x, y) !== wr.id || !this.isFree(nx, ny) || this.sharkBlocked(wr, ny)) return false;
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
    this.changed(wr.id);
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
    if (!this.isFree(x, y) || this.sharkBlocked(wr, y)) return false;
    const i = this.idx(x, y);
    this.setOwner(i, wr.id);
    this.code[i] = CODE["."];
    wr.cellCount++;
    wr.stats.grows++;
    return true;
  }
  opCollect(wr) {
    let got = false;
    const W = this.w, H = this.h, owner = this.owner, resource = this.resource;
    const meatShare = this.dietShare(wr, "meat"), plantShare = this.dietShare(wr, "plants");
    for (const c of this.mineOf(wr)) {
      const x = c % W, y = c / W | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const i = ny * W + nx;
        if (resource[i] === 0 && owner[i] !== DEBRIS) continue;
        if (CONFIG.island && (wr.realm ? owner[i] !== DEBRIS : owner[i] === DEBRIS)) continue;
        if (CONFIG.climb && (owner[i] === DEBRIS ? !meatShare : !plantShare)) continue;
        if (this.resource[i] === 1) {
          const feed = CONFIG.climb ? CONFIG.kelpFeed * plantShare * this.richness(i) : CONFIG.island ? CONFIG.kelpFeed : CONFIG.sizePickup;
          wr.maxSize = Math.min(this.capOf(wr), wr.maxSize + feed * this.ripe[i]);
          this.log("collect", `${wr.name} took size (max ${Math.floor(wr.maxSize)})`, wr.id);
        } else if (this.resource[i] === 2) {
          wr.speed = Math.min(CONFIG.speedCap, wr.speed + CONFIG.speedPickup);
          this.log("collect", `${wr.name} took speed (${wr.speed.toFixed(2)})`, wr.id);
        } else if (this.owner[i] === DEBRIS) {
          const feed = this.worth(i) * (CONFIG.climb ? CONFIG.seaFeed * meatShare * this.richness(i) : CONFIG.island ? CONFIG.seaFeed : CONFIG.debrisPickup);
          wr.maxSize = Math.min(this.capOf(wr), wr.maxSize + feed);
          this.setOwner(i, NONE);
          this.code[i] = 0;
          if (CONFIG.island || CONFIG.climb) wr.stats.collected++;
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
  /**
   * BOMB with an empty stack: the visible foreign cell (another warrior's) nearest my IP,
   * within range, skipping cells that hold a glyph my own body has. Kin recognition: a
   * near-copy of me is immune, a stranger is hit where it differs from me (and a warrior
   * that carries my glyphs, a mimic, is spared). Island survival: only the other realm.
   */
  opBombNearest(wr) {
    const R = this.reach(wr);
    const mine = new Uint8Array(GLYPHS.length + 1);
    for (const c of this.mineOf(wr)) mine[this.code[c]] = 1;
    let best = -1, bx = 0, by = 0;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const x = wr.ipX + dx, y = wr.ipY + dy, d = Math.abs(dx) + Math.abs(dy);
        if (best >= 0 && d >= best) continue;
        const o = this.ownerAt(x, y);
        if (o < 0 || o === wr.id || mine[this.code[this.idx(x, y)]] || this.seer(wr.id, x, y, R) < 0) continue;
        if (CONFIG.island && this.warrior(o).realm === wr.realm) continue;
        if (CONFIG.climb && this.warrior(o).lineage === wr.lineage) continue;
        if (CONFIG.island && wr.realm === 1 && this.board.land?.[this.idx(x, y)]) continue;
        best = d;
        bx = x;
        by = y;
      }
    }
    return best >= 0 && this.opBombAt(wr, bx, by);
  }
  /** BOMB reach: island sharks bite (CONFIG.biteRange) rather than shoot. */
  reach(wr) {
    return CONFIG.island && wr.realm === 1 ? CONFIG.biteRange : CONFIG.bombRange;
  }
  opBombAt(wr, x, y) {
    if (CONFIG.island && wr.realm === 1 && wr.maxSize >= CONFIG.sharkFull * CONFIG.sharkCap) return false;
    const o = this.ownerAt(x, y);
    if (CONFIG.island && wr.realm === 1 && o >= 0 && this.warrior(o).realm === 1) return false;
    if (CONFIG.island && wr.realm === 1 && this.board.land?.[this.idx(x, y)]) return false;
    if (o === NONE || o === wr.id) return false;
    if (this.seer(wr.id, x, y, this.reach(wr)) < 0) return false;
    const victim = o >= 0 ? this.warrior(o).name : "debris";
    if (o >= 0) this.attacks.bombs++;
    if (o >= 0 && this.warrior(o).lineage !== wr.lineage) wr.stats.bombHits++;
    const ti = this.idx(x, y);
    if ((CONFIG.island || CONFIG.climb) && o >= 0 && this.code[ti] === K) {
      const v = this.warrior(o);
      v.dents = (v.dents ?? 0) + (CONFIG.climb ? wr.traits?.bite ?? 1 : 1);
      v.harmedAt = this.t;
      if (v.dents < CONFIG.armorBites) {
        this.log("bomb", `${wr.name}'s bite glanced off ${victim}'s armor`, wr.id);
        return true;
      }
      v.dents = 0;
    }
    this.destroy(ti, wr);
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
    if (wr.maxSize < (CONFIG.island || CONFIG.climb ? 3 : 2) * wr.cellCount || wr.maxSize < CONFIG.divideMin) return false;
    if (CONFIG.reaperCap > 0) {
      const living = this.living();
      if (living.length >= CONFIG.reaperCap) {
        const oldest = living.filter((w) => w !== wr).reduce((a, w) => w.born < a.born ? w : a);
        this.kill(oldest, "reaped (oldest)");
      }
    } else if (this.living().length >= CONFIG.maxWarriors) return false;
    if (CONFIG.climb && CONFIG.crowd > 0 && (this.tileCount[this.tileOf(wr.ipX, wr.ipY)] ?? 0) >= CONFIG.crowd) return false;
    const mine = this.mineOf(wr);
    const xs = mine.map((c) => c % this.w), ys = mine.map((c) => c / this.w | 0);
    const bw = Math.max(...xs) - Math.min(...xs) + 1, bh = Math.max(...ys) - Math.min(...ys) + 1;
    const ox = DX[d] * (bw + 1), oy = DY[d] * (bh + 1);
    for (let k = 0; k < mine.length; k++) if (!this.passable(wr, xs[k] + ox, ys[k] + oy)) return false;
    const steps = Math.abs(ox) + Math.abs(oy);
    for (let k = 0; k < mine.length; k++) {
      for (let s = 1; s < steps; s++) if (this.board.terrain[this.idx(xs[k] + DX[d] * s, ys[k] + DY[d] * s)] !== FLOOR) return false;
    }
    const id = this.nextId(wr.zone);
    const child = shaped({
      id,
      lineage: wr.lineage,
      gen: wr.gen + 1,
      realm: wr.realm,
      zone: wr.zone,
      parent: wr.id,
      born: this.t,
      name: this.childName(wr.lineage, id),
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
    });
    if (CONFIG.lifespan > 0) child.diesAt = this.t + Math.floor(this.lifeOf(child.realm) * (0.5 + this.rng()));
    const cx0 = Math.min(...xs) + ox, cx1 = Math.max(...xs) + ox, cy0 = Math.min(...ys) + oy, cy1 = Math.max(...ys) + oy;
    this.board.rooms.forEach((r, k) => {
      if (cx0 >= r.x && cy0 >= r.y && cx1 < r.x + r.w && cy1 < r.y + r.h) child.roomsSeen.add(k);
    });
    this.enroll(child);
    let mutations = 0;
    for (let k = 0; k < mine.length; k++) {
      const i = this.idx(xs[k] + ox, ys[k] + oy);
      let code = this.code[mine[k]];
      if (this.rng() < CONFIG.copyError) {
        code = Math.floor(this.rng() * this.glyphCount());
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
    if (CONFIG.climb) this.tileCount[this.tileOf(child.ipX, child.ipY)]++;
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
    const n = this.glyphCount(), c = (code % n + n) % n;
    if (o === wr.id && this.code[this.idx(x, y)] !== c) wr.stats.selfWrites++;
    this.code[this.idx(x, y)] = c;
    this.changed(o);
    if (o >= 0 && o !== wr.id) {
      if (c === CODE["@"]) this.attacks.poisons++;
      if (c === CODE["@"] && this.warrior(o).lineage !== wr.lineage) wr.stats.poisonWrites++;
      if (o >= 0) this.warrior(o).harmedAt = this.t;
      this.log("write", `${wr.name} wrote '${GLYPHS[c]}' into ${this.warrior(o).name}`, wr.id);
    }
    return true;
  }
};

// src/sim/dish.ts
var DISH_DEFAULTS = {
  size: 160,
  // plate diameter (cells)
  bands: 5,
  // toxin levels 0 (middle) … 4 (rim)
  food: 5,
  // about one food spot per food² cells
  spawn: 40,
  // ticks a food spot needs untouched to regrow
  ripen: 300,
  // an uneaten pickup grows one pickup's worth every this many ticks…
  ripemax: 5,
  // …up to this many (so fresh territory is rich, picked-over ground poor)
  toxin: 1e-3,
  // per tick, a cell's chance of dying one toxin level above its warrior's armor…
  step: 10,
  // …times this for each further level
  error: 0.02,
  // DIVIDE: chance each copied cell becomes a random glyph
  insert: 0.02,
  // DIVIDE: chance the child gains a fat cell
  delete: 0.02,
  // DIVIDE: chance the child loses a cell
  life: 6e3,
  // typical lifespan (each warrior's is 50–150% of it)
  cap: 0,
  // most warriors alive at once (DIVIDE fails at the cap); 0 = no cap: food and space decide
  island: 0,
  // 1 = island survival (side view: islanders and sea creatures; size = width)
  climb: 0,
  // 1 = The Climb (steps up into air and down into water, 10× taller and richer each; size = width)
  base: 20,
  // climb: step 0's height (step ±n is base × 10^n)
  steps: 2,
  // climb: steps each way
  crowd: 24,
  // climb: DIVIDE fails where the parent's tile (64×64) already holds this many bodies (local crowding, not a global cap)
  stomach: 4,
  // climb: each cell adds this much to the body's largest max size (its store)…
  fatstore: 16,
  // …and each fat cell this much
  hunger: 1500,
  // climb: ticks a full body of plain cells lasts unfed at step 0 (all cells burn 2^|step|× further out)
  shell: 1,
  // climb: armor (K) and insulation (I) cells burn this many times a plain cell
  fat: 0.5,
  // climb: fat cells burn this many times a plain cell
  starve: 600,
  // island: ticks an unfed seal with max size 20 lasts
  sharkstarve: 6e3,
  // island: the same for a shark (10×, like its lifespan)
  sharklife: 10,
  // island: shark lifespan, times a seal's
  kelp: 8,
  // island: max size a seal gains per kelp (times ripeness)
  seafeed: 3,
  // island: max size a sea creature gains per dead cell (and per cell of a seal it kills)
  bite: 2,
  // island: a shark's BOMB reach
  full: 0.75,
  // island: a shark at this share of its size cap is full and won't bite
  shallows: 0.4,
  // island: top share of the water sharks can't enter
  calm: 0.25,
  // island: top share of the water with no pressure
  depth: 0.75,
  // island: sea depth as a share of its width
  arrive: 6e4,
  // island: tick the reef channel opens and the sharks swim in
  seals: 60
  // island: seals already spread through the calm water at the start
};
function applyDish(get) {
  const o = {};
  for (const [k, d] of Object.entries(DISH_DEFAULTS)) {
    const v = get(k);
    o[k] = v !== null && v !== "" ? Number(v) : d;
  }
  if (o.climb > 0) {
    const unset = (k) => (get(k) ?? "") === "";
    if (unset("size")) o.size = 2e3;
    if (unset("ripen")) o.ripen = 250;
    if (unset("ripemax")) o.ripemax = 8;
    if (unset("toxin")) o.toxin = 5e-3;
    if (unset("seals")) o.seals = 40;
  }
  if (o.island > 0) {
    const unset = (k) => (get(k) ?? "") === "";
    if (unset("size")) o.size = 360;
    if (unset("ripen")) o.ripen = 250;
    if (unset("ripemax")) o.ripemax = 8;
    if (unset("toxin")) o.toxin = 5e-3;
  }
  CONFIG.plate = o.size;
  CONFIG.plateBands = o.bands;
  CONFIG.plateFood = o.food;
  CONFIG.spawnInterval = o.spawn;
  CONFIG.foodRipen = o.ripen;
  CONFIG.foodRipeMax = o.ripemax;
  CONFIG.toxinRate = o.toxin;
  CONFIG.toxinStep = o.step;
  CONFIG.copyError = o.error;
  CONFIG.copyInsert = o.insert;
  CONFIG.copyDelete = o.delete;
  CONFIG.lifespan = o.life;
  CONFIG.maxWarriors = o.cap > 0 ? o.cap : Infinity;
  CONFIG.island = o.island > 0;
  CONFIG.climb = o.climb > 0;
  CONFIG.climbBase = o.base;
  CONFIG.climbSteps = o.steps;
  CONFIG.starve = o.starve;
  CONFIG.sharkStarve = o.sharkstarve;
  CONFIG.sharkLife = o.sharklife;
  CONFIG.kelpFeed = o.kelp;
  CONFIG.seaFeed = o.seafeed;
  CONFIG.biteRange = o.bite;
  CONFIG.sharkFull = o.full;
  CONFIG.shallows = o.shallows;
  CONFIG.calm = o.calm;
  CONFIG.depth = o.depth;
  CONFIG.sharkArrive = o.arrive;
  CONFIG.seals = o.seals;
  CONFIG.reaperCap = 0;
  CONFIG.crowd = o.crowd;
  CONFIG.stomach = o.stomach;
  CONFIG.fatStore = o.fatstore;
  CONFIG.climbStarve = o.hunger;
  CONFIG.shellBurn = o.shell;
  CONFIG.fatBurn = o.fat;
  CONFIG.tickCap = 1e12;
  CONFIG.endless = true;
  return o;
}
var K2 = CODE["K"];
function genomeOf(world2, id, sep = "/") {
  const cells = world2.cellsOf(id);
  if (!cells.length) return "";
  const xs = cells.map((c) => c % world2.w), ys = cells.map((c) => c / world2.w | 0);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
  const rows = [];
  for (let y = y0; y <= y1; y++) {
    let r = "";
    for (let x = x0; x <= x1; x++) {
      const i = world2.idx(x, y);
      r += world2.owner[i] === id ? glyphOf(world2.code[i]) : " ";
    }
    rows.push(r.replace(/\s+$/, ""));
  }
  return rows.join(sep);
}
var WEAPON = { B: CODE["B"], W: CODE["W"], poison: CODE["@"] };

// src/sim/save.ts
var TYPED = { Int8Array, Uint8Array, Uint16Array, Int32Array, Float32Array, Float64Array };
function num(v) {
  return Number.isFinite(v) ? v : { $n: String(v) };
}
var MAGIC = new TextEncoder().encode("andnow save 3\n");
function* saveChunks(world2, query2) {
  const ids = /* @__PURE__ */ new Map();
  const queue = [];
  const blobs = [];
  let offset = 0;
  const ref = (v) => {
    if (v === void 0) return { $u: 1 };
    if (v === null || typeof v === "boolean" || typeof v === "string") return v;
    if (typeof v === "number") return num(v);
    if (typeof v === "function") return { $u: 1 };
    const o = v;
    let id = ids.get(o);
    if (id === void 0) {
      id = queue.length;
      ids.set(o, id);
      queue.push(o);
    }
    return { $r: id };
  };
  const entry = (o) => {
    if (ArrayBuffer.isView(o)) {
      const name = o.constructor.name;
      if (!(name in TYPED)) throw new Error(`can't save a ${name}`);
      offset = Math.ceil(offset / 8) * 8;
      const e = { $ta: name, off: offset, len: o.length };
      blobs.push(o);
      offset += o.byteLength;
      return e;
    }
    if (Array.isArray(o)) return { $a: o.map(ref) };
    if (o instanceof Map) return { $m: [...o.entries()].map(([k, x]) => [ref(k), ref(x)]) };
    if (o instanceof Set || o instanceof Cells) return { $s: [...o].map(ref) };
    const out2 = {};
    for (const [k, x] of Object.entries(o).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) if (x !== void 0 && typeof x !== "function") out2[k] = ref(x);
    return { $o: out2 };
  };
  const root = ref(world2);
  const config = ref({ ...CONFIG });
  const te = new TextEncoder();
  yield MAGIC;
  let tableBytes = 0, chunk = "";
  const flush = () => {
    const b = te.encode(chunk);
    tableBytes += b.length;
    chunk = "";
    return b;
  };
  for (let i = 0; i < queue.length; i++) {
    chunk += JSON.stringify(entry(queue[i])) + "\n";
    queue[i] = null;
    if (chunk.length > 1 << 20) yield flush();
  }
  yield flush();
  let at = MAGIC.length + tableBytes;
  const pad = (to) => {
    const z = new Uint8Array(to - at);
    at = to;
    return z;
  };
  const blobAt = Math.ceil(at / 8) * 8;
  yield pad(blobAt);
  for (const a of blobs) {
    yield pad(blobAt + Math.ceil((at - blobAt) / 8) * 8);
    yield new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    at += a.byteLength;
  }
  const header = { version: 3, query: query2, t: world2.t, config, root, tableBytes, rng: world2.rng.state };
  const json = te.encode(JSON.stringify(header));
  yield json;
  const n = new Uint8Array(4);
  new DataView(n.buffer).setUint32(0, json.length, true);
  yield n;
}
function layout(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), td = new TextDecoder();
  if (MAGIC.every((b, i) => bytes[i] === b)) {
    const n2 = dv.getUint32(bytes.length - 4, true);
    const header2 = JSON.parse(td.decode(bytes.subarray(bytes.length - 4 - n2, bytes.length - 4)));
    return { header: header2, tableAt: MAGIC.length, blobAt: Math.ceil((MAGIC.length + header2.tableBytes) / 8) * 8 };
  }
  const n = dv.getUint32(0, true);
  const header = JSON.parse(td.decode(bytes.subarray(4, 4 + n)));
  return { header, tableAt: 4 + n, blobAt: Math.ceil((4 + n + (header.tableBytes ?? 0)) / 8) * 8 };
}
function loadWorld(bytes) {
  const { header, tableAt, blobAt: start } = layout(bytes);
  if (![1, 2, 3].includes(header.version)) throw new Error(`unknown save version ${header.version}`);
  const table = header.table ?? readTable(bytes.subarray(tableAt, tableAt + header.tableBytes));
  const rootId = header.root.$r;
  const objs = table.map((e) => {
    if ("$o" in e) return e.$o;
    if ("$ta" in e) {
      const C = TYPED[e.$ta];
      const at = bytes.byteOffset + start + e.off;
      return new C(bytes.buffer.slice(at, at + e.len * C.BYTES_PER_ELEMENT));
    }
    if ("$a" in e) return [];
    if ("$m" in e) return /* @__PURE__ */ new Map();
    if ("$s" in e) return /* @__PURE__ */ new Set();
    throw new Error("bad save entry");
  });
  const dec = (v) => {
    if (v === null || typeof v !== "object") return v;
    const o = v;
    if ("$r" in o) return objs[o.$r];
    if ("$u" in o) return void 0;
    if ("$n" in o) return Number(o.$n);
    throw new Error("bad save entry");
  };
  table.forEach((e, i) => {
    const o = objs[i];
    if ("$a" in e) for (const x of e.$a) o.push(dec(x));
    else if ("$m" in e) for (const [k, x] of e.$m) o.set(dec(k), dec(x));
    else if ("$s" in e) for (const x of e.$s) o.add(dec(x));
    else if ("$o" in e) {
      const r = o;
      for (const k in r) r[k] = dec(r[k]);
    }
  });
  Object.assign(CONFIG, dec(header.config));
  const world2 = Object.setPrototypeOf(objs[rootId], World.prototype);
  world2.rng = restoreRng(header.rng);
  const b = world2.board;
  if (CONFIG.climb && b.stepLo === void 0) {
    b.stepLo = -b.climbSteps;
    b.stepHi = b.climbSteps;
    delete b.climbSteps;
    b.climbBase = CONFIG.climbBase;
    b.foodSpacing = CONFIG.plateFood;
  }
  world2.yShift ??= 0;
  const old = world2;
  const registry = "zoneBodies" in world2 || "bodies" in world2;
  if (old.warriors && !registry) Object.defineProperty(world2, "warrior", { value: (id) => old.warriors[id] });
  if (registry) world2.reshape();
  const w = world2;
  for (const [id, set] of w.cellSets) if (id !== DEBRIS) w.cellSets.set(id, new Cells([...set]));
  for (const [id, set] of w.cellSets) if (!set.size && (id < 0 || !world2.warrior(id)?.alive)) w.cellSets.delete(id);
  w.sortedCells.clear();
  return world2;
}
function readTable(bytes) {
  const td = new TextDecoder(), table = [];
  for (let i = 0; i < bytes.length; ) {
    let j = Math.min(i + (1 << 23), bytes.length);
    while (j < bytes.length && bytes[j - 1] !== 10) j++;
    const lines = td.decode(bytes.subarray(i, j)).split("\n");
    for (const l of lines) if (l) table.push(JSON.parse(l));
    i = j;
  }
  return table;
}
function restoreRng(state) {
  const r = makeRng(0);
  r.state = state;
  return r;
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
  return { name: header.name || fallbackName, dir, ip, cells, width, height: grid.length, source: text, realm: header.realm };
}

// warriors/amoeba.warrior
var amoeba_default = "name: Amoeba\n# The petri dish founder: a Gatherer (collect, head for the nearest resource) that DIVIDEs\n# every loop (D pops an empty stack = east): copies itself beside itself as a new\n# warrior. Its descendants are rivals like anyone else. The two fat cells under it are\n# spare: copy errors can turn them into armor (K) without breaking the program.\n---\nC6S$TMD\n..\n";

// warriors/bomber.warrior
var bomber_default = "name: Bomber\n# Like the Stalker, but bombs at range instead of poisoning by touch.\n# Found an enemy (top row): bomb it (fails quietly if out of range), step toward it.\n# Nothing in sight (bottom row): keep wandering; turn right when blocked.\nip: 0 1\n---\nv   >ooBT\\$:M\n>C2S|\n^   >$$:Me!+\n";

// warriors/climber.warrior
var climber_default = "name: Climber\n# The Climb's upward grazer: the petri founder (collect, head for the nearest plant, move,\n# divide) with an insulation cell (I) off its code row, so it can live in step +1 and\n# copy errors on the fat can add more.\n---\nC6S$TMD\n .I.\n";

// warriors/diver.warrior
var diver_default = "name: Diver\n# The Climb's downward grazer: the petri founder with an armor cell (K) off its code row,\n# so it can live in step -1 and copy errors on the fat can add more.\n---\nC6S$TMD\n .K.\n";

// warriors/gatherer.warrior
var gatherer_default = "name: Gatherer\n# One row, so the IP just loops along it forever (the row wraps within the body).\n# Collect anything touching me; find the nearest visible resource; head toward it\n# (TOWARD of 0,0 is a random direction, so with nothing in sight it wanders).\n---\nC6S$TM\n";

// warriors/hunter.warrior
var hunter_default = "name: Hunter\nrealm: deep\n# The Climb's hunter, kraken stock: big and slow (a row of fat), one armor (K) so it can\n# live in step -1, where it starts, under the falling dead cells. B gives it a taste for\n# meat (its single C collects dead cells, not plants). Head for the nearest warrior (2 S),\n# bite the nearest foreign cell (B), head for the nearest dead cell (3 S), divide.\n---\nC2S$TMB3S$TMD\n......K......\n";

// warriors/roamer.warrior
var roamer_default = "name: Roamer\n# A gatherer with a memory: the wander direction lives at the bottom of the stack.\n# Found a resource (top row): head toward it, and adopt that as the wander direction.\n# Nothing in sight (bottom row): keep going the same way; turn right when blocked.\nip: 0 1\n---\nv   >T\\$:M\n>C6S|\n^   >$$:Me!+\n";

// warriors/shark.warrior
var shark_default = "name: Shark\nrealm: sea\n# Island survival's hunter: big and slow by design (a row of fat makes it heavy, so its\n# pace is about 2/3 of a seal's). Eats only dead cells, so it kills to eat: head for the\n# nearest seal it can see (2 S: never sharks, and not into the shallows), bite the nearest\n# one in reach (B, empty stack), then head for the nearest dead cell (3 S), collect, divide.\n---\nC2S$TMB3S$TMD\n.............\n";

// warriors/stalker.warrior
var stalker_default = "name: Stalker\n# Hunt the nearest enemy cell; when touching it, write the poison glyph @ into it.\n# The wander direction lives at the bottom of the stack (like the Roamer).\n# Middle row decides: SCAN for an enemy, `|` sends the IP north if found, south if not.\n# Found (top row): copy dx,dy (`oo`), write @ there (`'@` pushes the code of @ and\n# skips it), then step toward it and adopt that as the wander direction.\n# Not found (bottom row): drop dx,dy, keep wandering; turn right when blocked.\n# Both rows wrap back to their first cell, which points the IP back into the middle row.\n# (Without the branch, a failed SCAN gives 0,0 = my own IP cell, and I poison myself.)\nip: 0 1\n---\nv   >oo'@WT\\$:M\n>C2S|\n^   >$$:Me!+\n";

// warriors/turtle.warrior
var turtle_default = "name: Turtle\n# Stays put. Bombs the nearest enemy in range, grows armor in a random direction,\n# collects whatever touches it. The rings of `.` are armor and do nothing.\nip: 1 1\n---\n.........\n.2S$B4y0GC\n.........\n";

// warriors/viper.warrior
var viper_default = "name: Viper\n# Poison at range 2. Like the Bomber, but the found row writes `@` (code 9) into the\n# nearest enemy cell instead of bombing. WRITE fails quietly beyond range 2.\n# 9 is pushed as a number, so the Viper carries no `@` of its own to run into.\nip: 0 1\n---\nv   >oo9WT\\$:M\n>C2S|\n^   >$$:Me!+\n";

// src/warriors.ts
var BUNDLED = { amoeba: amoeba_default, bomber: bomber_default, climber: climber_default, diver: diver_default, gatherer: gatherer_default, hunter: hunter_default, roamer: roamer_default, shark: shark_default, stalker: stalker_default, turtle: turtle_default, viper: viper_default };

// src/bake.ts
var args = process.argv.slice(2);
var flag = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args.splice(i, 2)[1] : d;
};
var every = Number(flag("--every", "1000"));
var resume = args.includes("--resume");
if (resume) args.splice(args.indexOf("--resume"), 1);
var [query, ticksArg] = args;
var out = flag("--out", "") || args[2] || `runs/bake/${query?.replace(/[^a-z0-9=,]+/gi, "_")}`;
var ticks = ticksArg === "forever" ? Infinity : Number(ticksArg);
if (!query || !ticks) {
  console.log('usage: node dist/bake.mjs "<viewer query>" <ticks> [--every 1000] [--out dir]');
  process.exit(1);
}
var params = new URLSearchParams(query);
applyDish((k) => params.get(k));
var names = (params.get("w") ?? "climber,diver,hunter").split(",");
var source = (n) => n.startsWith("evo:") ? readFileSync2(`warriors/evolved/${n.slice(4)}.warrior`, "utf8") : BUNDLED[n] ?? readFileSync2(`warriors/${n}.warrior`, "utf8");
var world = new World(Number(params.get("seed")) || 1, names.map((n, i) => parseWarrior(source(n), `warrior${i + 1}`)));
mkdirSync(out, { recursive: true });
{
  const pid = bakingPid(out);
  if (pid) throw new Error(`${out} is being baked already (pid ${pid})`);
}
holdBaking(out);
process.on("exit", () => {
  try {
    unlinkSync2(`${out}/.baking`);
  } catch {
  }
});
var index = { query, rules: RULES, every, ticks: Number.isFinite(ticks) ? ticks : null, done: false, marks: [] };
if (resume && existsSync2(`${out}/index.json`)) {
  const old = JSON.parse(readFileSync2(`${out}/index.json`, "utf8"));
  if (old.query !== query || old.every !== every) throw new Error(`${out} is a different bake (${old.query}, every ${old.every})`);
  if (old.rules !== RULES) throw new Error(`${out} was made on rules ${old.rules ?? "1 or 2"}, these are rules ${RULES}: it can't carry on`);
  index = { ...old, ticks: index.ticks, done: false };
  for (; ; ) {
    const m = index.marks[index.marks.length - 1];
    if (!m) throw new Error(`${out} has no checkpoint that reads`);
    if (!m.file) {
      index.marks.pop();
      continue;
    }
    try {
      world = loadWorld(gunzipSync(readFileSync2(`${out}/${m.file}`)));
      break;
    } catch (e) {
      console.log(`skipping ${m.file}: ${e.message}`);
      index.marks.pop();
    }
  }
  console.log(`resuming at tick ${world.t}`);
} else if (existsSync2(`${out}/index.json`)) console.log(`(overwriting ${out})`);
var put = (path, data) => {
  writeFileSync2(`${path}.tmp`, data);
  renameSync(`${path}.tmp`, path);
};
var save = async () => {
  const file = `t${String(world.t).padStart(7, "0")}.andnow.gz`, path = `${out}/${file}`;
  await pipeline(Readable.from(saveChunks(world, query)), createGzip({ level: 6 }), createWriteStream(`${path}.tmp`));
  renameSync(`${path}.tmp`, path);
  const gz = { length: statSync2(path).size };
  let big;
  for (const w of world.living()) if (!big || w.cellCount > big.cells) big = { id: w.id, cells: w.cellCount, x: w.ipX, y: w.ipY, name: w.name, genome: "" };
  if (big) big.genome = genomeOf(world, big.id);
  index.marks.push({ t: world.t, file, alive: world.living().length, kb: Math.round(gz.length / 1024), biggest: big });
  dropFiles(out, index.marks, toThin(index.marks, every), () => put(`${out}/index.json`, JSON.stringify(index)));
};
var diskLow = () => {
  const f = statfsSync(out);
  return f.bavail * f.bsize < 2e10;
};
var t0 = Date.now();
var tStart = world.t;
if (!resume || !index.marks.length) await save();
var stop = "";
while (world.t < ticks && world.living().length && !world.result.over) {
  world.tick();
  if (world.t % every === 0) {
    if (diskLow()) {
      stop = "disk under 20 GB free";
      break;
    }
    await save();
    const m = index.marks[index.marks.length - 1];
    if (world.t % (every * 10) === 0) console.log(`t${world.t} alive ${m.alive} biggest ${m.biggest?.cells ?? 0} \xB7 ${((Date.now() - t0) / (world.t - tStart)).toFixed(1)} ms/tick \xB7 ${m.kb} KB`);
  }
}
index.done = true;
if (!stop && world.t % every !== 0) await save();
else put(`${out}/index.json`, JSON.stringify(index));
console.log(`done${stop ? ` (${stop})` : world.living().length ? "" : " (died out)"}: ${index.marks.length} checkpoints in ${out}`);
//# sourceMappingURL=bake.mjs.map

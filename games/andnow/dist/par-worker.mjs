// src/par-worker.ts
import { parentPort } from "node:worker_threads";

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
  for (const [x02, y0, dx, dy, n] of sides) {
    let run = 0;
    for (let k = 0; k < n; k++) {
      run = terrain[(y0 + k * dy) * w + x02 + k * dx] === FLOOR ? run + 1 : 0;
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
    let x02 = 1;
    for (let c = 0; c < qcols; c++) {
      const cw = colW[c], ch = rowH[r];
      const start = r === 0 && c === 0;
      const rw = start ? randInt(rng, 16, Math.max(16, cw - 2)) : randInt(rng, Math.max(4, Math.floor(cw * 0.4)), Math.max(4, cw - 3));
      const rh = start ? randInt(rng, Math.min(8, ch - 2), ch - 2) : randInt(rng, Math.max(3, Math.floor(ch * 0.4)), Math.max(3, ch - 3));
      const room = { x: x02 + randInt(rng, 0, cw - rw - 1) + (start ? 1 : 0), y: y0 + randInt(rng, 0, ch - rh - 1) + (start ? 1 : 0), w: rw, h: rh };
      if (start) {
        room.x = Math.min(room.x, x02 + cw - rw - 1);
        room.y = Math.min(room.y, y0 + ch - rh - 1);
      }
      if (c === qcols - 1 && rng() < 0.25 && !start) room.w = hw - room.x;
      if (r === qrows - 1 && rng() < 0.25 && !start) room.h = hh - room.y;
      rooms[r].push(room);
      carve(room);
      x02 += cw;
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
  const inside2 = (a) => ({ x: a.x + randInt(rng, 1, Math.max(1, a.w - 2)), y: a.y + randInt(rng, 1, Math.max(1, a.h - 2)) });
  for (let k = 0; k < 2; k++) {
    const p = inside2(others[Math.floor(rng() * others.length)]);
    spawnAll(Math.min(p.x, hw - 1), Math.min(p.y, hh - 1), 1);
  }
  {
    const p = inside2(others[Math.floor(rng() * others.length)]);
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

// src/sim/glyphs.ts
var GLYPHS = ".><^v_|#?@r[]0123456789:\\$o+-*/%!`='ysmfdeLSRTMFXGCBWDAKI~xn";
var CLASSIC_GLYPHS = GLYPHS.indexOf("I");
var CODE = {};
for (let i = 0; i < GLYPHS.length; i++) CODE[GLYPHS[i]] = i;
var DX = [1, 0, -1, 0];
var DY = [0, 1, 0, -1];
var COST = { M: 2, G: 2, B: 4, W: 3 };
var T_NOTHING = 0;
var T_WALL = 1;
var T_ENEMY = 2;
var T_DEBRIS = 3;
var T_SIZE = 4;
var T_SPEED = 5;
var T_RESOURCE = 6;

// src/sim/world.ts
var NONE = -1;
var K = CODE["K"];
var INSUL = CODE["I"];
var FLIP = CODE["~"];
var DOUBLE = CODE["x"];
var MASK = CODE["n"];
var FAT = CODE["."];
var MOVE = CODE["M"];
var BITE = CODE["B"];
var COLLECT = CODE["C"];
var DEBRIS = -2;
var SCAN_KEYS = new Float64Array(64 * 64);
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
function markTiles(living, count, tw, n) {
  const T = CONFIG.tile, th = n / tw;
  const next = new Uint8Array(n);
  for (const wr of living) {
    const tx = Math.floor(wr.ipX / T), ty = Math.floor(wr.ipY / T);
    count[ty * tw + tx]++;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = tx + dx, y = ty + dy;
      if (x >= 0 && y >= 0 && x < tw && y < th) next[y * tw + x] = 1;
    }
  }
  return next;
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
      else this.place(s, this.warriors.length);
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
  warriors = [];
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
    this.tileCount.fill(0);
    this.wakeTiles(markTiles(this.living(), this.tileCount, this.tw, this.tileActive.length));
  }
  /**
   * The waking half of refreshTiles, for tile columns [tx0, tx1) (a parallel engine's worker
   * does its own strip of tiles; the marks come from every body's IP, see markTiles).
   */
  wakeTiles(next, tx0 = 0, tx1 = this.tw) {
    this.activeTiles = [];
    for (let k = 0; k < next.length; k++) {
      if (!next[k]) continue;
      const tx = k % this.tw;
      if (tx < tx0 || tx >= tx1) continue;
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
    for (let k = 0; k < next.length; k++) {
      const tx = k % this.tw;
      if (tx >= tx0 && tx < tx1) this.tileActive[k] = next[k];
    }
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
    const grown2 = (a, fill) => {
      const out = new a.constructor(w * h);
      if (fill) out.fill(fill);
      out.set(a, dI);
      return out;
    };
    const terrain = grown2(b.terrain, 0), step = grown2(b.step, 0);
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
    this.owner = grown2(this.owner, NONE);
    this.code = grown2(this.code, 0);
    this.resource = grown2(this.resource, 0);
    this.ripe = grown2(this.ripe, 1);
    this.narrow = grown2(this.narrow, 0);
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
      for (const wr of new Set(this.warriors)) {
        wr.ipY += D;
        wr.oy += D;
        shift(wr.home);
      }
      for (const [id, set] of this.cellSets) {
        const out = /* @__PURE__ */ new Set();
        for (const i of set) out.add(i + dI);
        this.cellSets.set(id, out);
      }
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
      const out = new a.constructor(nt);
      out.set(a, dT);
      return out;
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
  /** Climb: the largest max size a body can have where its IP is (2× per step out, room for krakens). */
  capAtCell(i) {
    return this.board.step ? CONFIG.sizeCap * 2 ** Math.abs(this.board.step[i]) : CONFIG.sizeCap;
  }
  // ---------- setup ----------
  arriving = [];
  /** Bumped whenever the terrain changes (the island's channel opening), so a viewer can redraw scenery. */
  terrainVersion = 0;
  place(spec, id, at) {
    if (spec.cells.length > CONFIG.startCells) {
      throw new Error(`${spec.name} has ${spec.cells.length} cells; the limit is ${CONFIG.startCells}`);
    }
    const realm = this.board.startRealm ? spec.realm === "sea" ? 1 : 0 : 0;
    const room = CONFIG.climb ? this.board.starts[spec.realm === "deep" ? 1 : 0] : this.board.startRealm ? this.board.starts[this.board.startRealm.indexOf(realm)] : this.board.starts[id % this.board.starts.length];
    const before = this.board.startRealm ? this.warriors.filter((w) => w.realm === realm).length : 0;
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
    const wr = {
      id,
      lineage: id,
      gen: 0,
      realm,
      born: 0,
      name: spec.name,
      alive: true,
      ipX: ox + spec.ip.x,
      ipY: oy + spec.ip.y,
      ox: ox + spec.ip.x,
      oy: oy + spec.ip.y,
      dir: spec.dir,
      stack: [],
      maxSize: CONFIG.climb ? this.capAtCell(this.idx(ox + spec.ip.x, oy + spec.ip.y)) : CONFIG.island ? realm ? CONFIG.sharkCap : CONFIG.sizeCap : CONFIG.startSize,
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
    };
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
  /** A parallel engine's worker sets this (see Tracker). */
  track;
  sortedCells = /* @__PURE__ */ new Map();
  /** The way `owner` changes (opShift does a bulk equivalent). */
  setOwner(i, v) {
    const o = this.owner[i];
    if (o === v) return;
    if (o !== NONE) {
      this.cellSets.get(o)?.delete(i);
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
      const set = this.cellSets.get(id);
      if (!set) return [];
      out = Array.from(Int32Array.from(set).sort());
      this.sortedCells.set(id, out);
    }
    return out;
  }
  log(kind, text, who) {
    this.events.push({ t: this.t, kind, text, who });
    if (this.events.length > 2e3) this.events.splice(0, 500);
  }
  // Walls block LoS; cells don't. Bresenham, endpoints excluded.
  clearLine(x02, y0, x12, y1) {
    let dx = Math.abs(x12 - x02), dy = -Math.abs(y1 - y0);
    const sx = x02 < x12 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, x = x02, y = y0;
    while (true) {
      if (x === x12 && y === y1) return true;
      if (!(x === x02 && y === y0) && this.board.terrain[this.idx(x, y)] !== FLOOR) return false;
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
    if ((CONFIG.island || CONFIG.climb) && (CONFIG.island && o >= 0 && this.warriors[o].realm === 1 || this.rng() >= CONFIG.corpse)) {
      this.setOwner(i, NONE);
      this.code[i] = 0;
      return;
    }
    this.setOwner(i, DEBRIS);
  }
  /** Deaths so far by realm and cause (`0|core frozen`), kept as a tally since dishes forget the dead. */
  deaths = /* @__PURE__ */ new Map();
  tombstones = /* @__PURE__ */ new Map();
  /** The next child's name in a lineage: the founder's name and its birth number. */
  childName(lineage) {
    const born = this.bornIn.get(lineage) ?? 1;
    this.bornIn.set(lineage, born + 1);
    return `${this.warriors[lineage].name}\xB7${born}`;
  }
  /** Descendants a founder has had (alive or dead). */
  bornCount(lineage) {
    return (this.bornIn.get(lineage) ?? 1) - 1;
  }
  kill(wr, reason) {
    if (!wr.alive) return;
    this.track?.died(wr.id);
    this.die(wr, reason);
    this.cellSets.delete(wr.id);
    this.sortedCells.delete(wr.id);
    const k = `${wr.realm}|${reason.replace(/ by .*/, "").replace(/ \(.*/, "")}`;
    this.deaths.set(k, (this.deaths.get(k) ?? 0) + 1);
    if (CONFIG.endless && wr.gen > 0) {
      let tomb = this.tombstones.get(wr.lineage);
      if (!tomb) {
        tomb = { ...wr, name: `${this.warriors[wr.lineage].name} (dead)`, deathReason: "dead", stack: [], roomsSeen: /* @__PURE__ */ new Set(), traits: void 0, lastHarm: void 0, cellCount: 0 };
        this.tombstones.set(wr.lineage, tomb);
      }
      this.warriors[wr.id] = tomb;
    }
  }
  die(wr, reason) {
    wr.alive = false;
    this.livingDirty = true;
    wr.deathReason = reason;
    wr.diedAt = this.t;
    const h0 = wr.lastHarm;
    const k0 = h0 && this.t - h0.t <= CONFIG.creditWindow ? this.warriors[h0.by] : void 0;
    const eatsWhole = CONFIG.island ? k0?.realm === 1 && wr.realm === 0 : CONFIG.climb && !!k0?.traits?.meat;
    if (eatsWhole && k0 && k0.alive) {
      const cells = this.cellsOf(wr.id).slice();
      k0.maxSize = Math.min(this.capOf(k0), k0.maxSize + CONFIG.seaFeed * (cells.length + 1) * this.dietShare(k0, "meat") * this.richness(this.idx(wr.ipX, wr.ipY)));
      k0.stats.kills++;
      for (const c of cells) {
        this.setOwner(c, NONE);
        this.code[c] = 0;
      }
      wr.cellCount = 0;
      this.log("death", `${wr.name} died: ${reason}; ${k0.name} ate it (max ${Math.floor(k0.maxSize)})`, wr.id);
      return;
    }
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
  destroy(i, by, cause = "core poisoned by the toxin") {
    const o = this.owner[i];
    this.setOwner(i, NONE);
    this.code[i] = 0;
    if (o < 0) return;
    const victim = this.warriors[o];
    victim.cellCount--;
    if (by) victim.lastHarm = { by: by.id, t: this.t };
    if (i === this.idx(victim.ipX, victim.ipY)) {
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
   * One tick, as phases (an engine can run them its own way, see src/sim/engine.ts):
   * begin (the clock, growth, tiles), regrow (plants), drift (dead cells sink), turns (every
   * body runs, in a rotating order), upkeep (every body, in id order), then the end check.
   */
  tick() {
    if (!this.beginTick()) return;
    this.regrow();
    this.drift();
    this.runTurns(this.turnOrder());
    for (const wr of this.living().slice()) if (wr.alive) this.upkeep(wr);
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
    const climbList = CONFIG.climb ? this.activeTiles.flatMap((k) => this.spawnsInTile[k]) : null;
    const nSpawns = climbList ? climbList.length : spawns.length;
    for (let kk = 0; kk < nSpawns; kk++) {
      const k = climbList ? climbList[kk] : kk;
      const s = spawns[k];
      const i = this.idx(s.x, s.y);
      if (CONFIG.foodRipen > 0 && this.resource[i] === 1) this.ripe[i] = Math.min(CONFIG.foodRipeMax, this.ripe[i] + 1 / CONFIG.foodRipen);
      let touched = this.resource[i] !== 0 || this.owner[i] !== NONE;
      for (let d = 0; d < 4 && !touched; d++) touched = this.ownerAt(s.x + DX[d], s.y + DY[d]) !== NONE;
      if (touched) {
        this.spawnTimers[k] = 0;
        continue;
      }
      if (++this.spawnTimers[k] >= (CONFIG.climb ? this.regrowAt(s.y) : CONFIG.spawnInterval)) {
        this.resource[i] = s.kind;
        this.ripe[i] = 1;
        this.spawnTimers[k] = 0;
      }
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
  /** This tick's turn order: the living, rotated by the tick so nobody always moves first. */
  turnOrder() {
    const living = this.living(), n = living.length, order = new Array(n);
    for (let k = 0; k < n; k++) order[k] = living[(this.t + k) % n];
    return order;
  }
  /** Every body's turn, in order: it runs as many instructions as its speed has banked. */
  runTurns(order) {
    for (const wr of order) if (wr.alive) this.turn(wr);
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
    const cells = this.cellSets.get(wr.id);
    if (cells) {
      const hm = wr.home;
      let home = 0, narrow = 0, x02 = this.w, y0 = this.h, x12 = -1, y1 = -1;
      for (const c of cells) {
        const x = c % this.w, y = c / this.w | 0;
        if (x < x02) x02 = x;
        if (x > x12) x12 = x;
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
          if (x02 < r.x || y0 < r.y || x12 >= r.x + r.w || y1 >= r.y + r.h || wr.roomsSeen.has(k)) return;
          if (r.x === hm.x && r.y === hm.y) return;
          wr.roomsSeen.add(k);
          wr.stats.rooms++;
          this.log("room", `${wr.name} moved its whole body into another room`, wr.id);
        });
      }
    }
    const tox = this.board.toxinBy ? this.board.toxinBy[wr.realm] : this.board.toxin;
    if (tox && cells) {
      let armor = 0;
      for (const c of cells) if (this.code[c] === K) armor++;
      const doomed = [];
      for (const c of cells) {
        const over = tox[c] - armor;
        if (over > 0 && this.rng() < CONFIG.toxinRate * CONFIG.toxinStep ** (over - 1)) doomed.push(c);
      }
      const cause = !this.board.toxinBy ? void 0 : wr.realm ? "core crushed (too shallow)" : "core crushed by the pressure";
      for (const c of doomed) {
        if (!wr.alive) break;
        if (this.owner[c] === wr.id) this.destroy(c, void 0, cause);
      }
      if (!wr.alive) return;
    }
    if (CONFIG.climb && cells) {
      const tr = this.traitsOf(wr);
      wr.traits = tr;
      const st = this.board.step;
      const doomed = [];
      for (const c of cells) {
        const n = st[c], over = n > 0 ? n - tr.insulation : -n - tr.armor;
        if (n && over > 0 && this.rng() < CONFIG.toxinRate * CONFIG.toxinStep ** (over - 1)) doomed.push(c);
      }
      for (const c of doomed) {
        if (!wr.alive) break;
        if (this.owner[c] === wr.id) this.destroy(c, void 0, st[c] > 0 ? "core frozen (too high)" : "core crushed by the pressure");
      }
      if (!wr.alive) return;
    }
    if (CONFIG.island || CONFIG.climb) {
      const pace = CONFIG.climb ? (wr.traits ??= this.traitsOf(wr)).pace : this.paceOf(wr);
      wr.pace = pace;
      wr.speed = CONFIG.paceSpeed * pace;
      const hunger = pace * (Math.sqrt(20) - 1) * 2 * Math.sqrt(CONFIG.startSize) / CONFIG.sizeDecay / (wr.realm ? CONFIG.sharkStarve : CONFIG.starve);
      wr.maxSize = Math.max(0, wr.maxSize - hunger * CONFIG.sizeDecay * Math.sqrt(wr.maxSize / CONFIG.startSize));
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
  }
  /**
   * Island survival: a settled archipelago. Each islander founder gets CONFIG.seals copies
   * of itself (its descendants, generation 1) scattered through the calm water.
   */
  settle() {
    for (const f of this.warriors.filter((w) => w.realm === 0 && w.gen === 0)) {
      const S = this.board.surface ?? 0, calm = this.board.calmLine ?? S;
      const room = this.board.starts[f.spec.realm === "deep" ? 1 : 0];
      for (let n = 0, tries = 0; n < CONFIG.seals && tries < CONFIG.seals * 50; tries++) {
        const bay = this.board.starts[1], x02 = bay.x + bay.w + 2;
        const ox = CONFIG.climb ? room.x + Math.floor(this.rng() * Math.max(1, room.w - f.spec.width)) : x02 + Math.floor(this.rng() * (this.w - 1 - x02 - f.spec.width));
        const oy = CONFIG.climb ? room.y + Math.floor(this.rng() * Math.max(1, room.h - f.spec.height)) : S + Math.floor(this.rng() * Math.max(1, calm - S - f.spec.height));
        if (!f.spec.cells.every((c) => this.isFree(ox + c.x, oy + c.y))) continue;
        const id = this.warriors.length;
        const born = this.bornIn.get(f.lineage) ?? 1;
        this.bornIn.set(f.lineage, born + 1);
        const wr = {
          ...f,
          id,
          gen: 1,
          parent: f.id,
          name: `${f.name}\xB7${born}`,
          ipX: ox + f.spec.ip.x,
          ipY: oy + f.spec.ip.y,
          ox: ox + f.spec.ip.x,
          oy: oy + f.spec.ip.y,
          stack: [],
          cellCount: 0,
          executed: 0,
          roomsSeen: /* @__PURE__ */ new Set(),
          stats: { collected: 0, bombHits: 0, poisonWrites: 0, kills: 0, selfWrites: 0, grows: 0, swaps: 0, flows: 0, oozes: 0, squeezed: 0, rooms: 0 }
        };
        if (CONFIG.lifespan > 0) wr.diesAt = Math.floor(this.lifeOf(0) * (0.5 + this.rng()));
        this.warriors.push(wr);
        this.livingList.push(wr);
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
    for (const c of this.cellsOf(wr.id)) {
      const g = this.code[c];
      if (g === CODE["M"]) m++;
      mass += g === K || g === CODE["."] ? 2 : 1;
    }
    return (1 + m) / (1 + mass / CONFIG.paceMass);
  }
  /** Size cap for a realm (island sea creatures are big and need room to breed). */
  capOf(wr) {
    if (CONFIG.climb) return this.capAtCell(this.idx(wr.ipX, wr.ipY));
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
    let armor = 0, insulation = 0, mass = 0, move = 0, bite = 0, plants = 0, meat = 0;
    for (const c of this.cellsOf(id)) {
      let g = this.code[c], flip = false, dbl = 1, weightless = false;
      for (const nb of [c - 1, c + 1, c - w, c + w]) {
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
    }
    return { armor, insulation, mass, move, bite: Math.max(1, bite), plants: plants > meat, meat: meat > 0, pace: (1 + move) / (1 + mass / CONFIG.paceMass) };
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
      this.place(spec, this.warriors.length, at);
      this.warriors[this.warriors.length - 1].born = this.t;
      if (CONFIG.lifespan > 0) this.warriors[this.warriors.length - 1].diesAt = this.t + Math.floor(this.lifeOf(1) * (0.5 + this.rng()));
      this.arriving.splice(k--, 1);
      this.log("arrive", `${spec.name} arrives`, this.warriors.length - 1);
    }
  }
  /** Island survival, once a tick: dead cells sink (and rot where they can't). */
  islandTick() {
    if (this.t % CONFIG.sinkEvery === 0) this.sink(this.cellsOf(DEBRIS).slice().reverse());
  }
  /**
   * Dead cells sink, bottom rows first so a column of them falls together, and rot where they
   * can't. Each column draws from its own stream, so columns don't depend on each other (a
   * parallel engine's worker sinks its own strip). `dead` is in descending index order.
   */
  sink(dead) {
    const col = /* @__PURE__ */ new Map();
    for (const c of dead) {
      const below = c + this.w, x = c % this.w;
      if (this.isFloor(x, (c / this.w | 0) + 1) && this.owner[below] === NONE) {
        this.setOwner(below, DEBRIS);
        this.code[below] = this.code[c];
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
    const pos2 = horiz ? wr.ipX : wr.ipY;
    const len = horiz ? w : h;
    const fwd = dir === 0 || dir === 1;
    const start = wr.ipY * w + wr.ipX;
    let i = start + step;
    for (let p = pos2 + (fwd ? 1 : -1); fwd ? p < len : p >= 0; p += fwd ? 1 : -1, i += step) {
      if (owner[i] === id) {
        this.setIp(wr, i);
        return;
      }
    }
    i = start - step * (fwd ? pos2 : len - 1 - pos2);
    for (let p = fwd ? 0 : len - 1; p !== pos2; p += fwd ? 1 : -1, i += step) {
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
    if ("MFXGCBWDA".includes(g)) wr.lastAct = g;
    if (!wr.alive) return cost;
    this.advance(wr);
    if (skip) this.advance(wr);
    return cost;
  }
  // ---------- sensing ----------
  classify(x, y, me2) {
    if (!this.isFloor(x, y)) return T_WALL;
    const i = this.idx(x, y);
    const o = this.owner[i];
    if (o === DEBRIS) return T_DEBRIS;
    if (o >= 0 && o !== me2) return T_ENEMY;
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
    if (CONFIG.climb) {
      this.ringScan(wr, type, mine, fx, fy);
      return;
    }
    const x02 = Math.max(0, wr.ipX - r - 16), x12 = Math.min(this.w - 1, wr.ipX + r + 16);
    const y0 = Math.max(0, wr.ipY - r - 16), y1 = Math.min(this.h - 1, wr.ipY + r + 16);
    const cands = [];
    const consider = (i) => {
      const x = i % this.w, y = i / this.w | 0;
      if (x < x02 || x > x12 || y < y0 || y > y1) return;
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
    const r = CONFIG.sight, maxD = 2 * (r + 16);
    const x02 = Math.max(0, wr.ipX - r - 16), x12 = Math.min(this.w - 1, wr.ipX + r + 16);
    const y0 = Math.max(0, wr.ipY - r - 16), y1 = Math.min(this.h - 1, wr.ipY + r + 16);
    const W = this.w, terrain = this.board.terrain, owner = this.owner, resource = this.resource, me2 = wr.id;
    const keys = SCAN_KEYS;
    let n = 0;
    for (let y = y0; y <= y1; y++) {
      const ady = y < fy ? fy - y : y - fy;
      if (ady > maxD) continue;
      const row = y * W;
      for (let x = x02; x <= x12; x++) {
        const i = row + x, o = owner[i], res = resource[i];
        if (o === NONE && res === 0) continue;
        if (terrain[i] !== FLOOR) continue;
        const t = o === DEBRIS ? T_DEBRIS : o >= 0 && o !== me2 ? T_ENEMY : res === 1 ? T_SIZE : res === 2 ? T_SPEED : T_NOTHING;
        if (t === T_NOTHING) continue;
        if (!(type === T_RESOURCE ? t === T_SIZE || t === T_SPEED : t === type)) continue;
        if (t === T_ENEMY && this.warriors[o].lineage === wr.lineage) continue;
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
    const mine = this.cellsOf(wr.id);
    for (const c of mine) {
      const nx = c % this.w + DX[d], ny = (c / this.w | 0) + DY[d];
      if (this.ownerAt(nx, ny) === wr.id) continue;
      if (!this.passable(wr, nx, ny)) return false;
    }
    if (CONFIG.island && wr.realm === 1) {
      for (const c of mine) {
        const t = c + DY[d] * this.w + DX[d];
        if (this.owner[t] !== DEBRIS) continue;
        this.setOwner(t, NONE);
        this.code[t] = 0;
        wr.maxSize = Math.min(this.capOf(wr), wr.maxSize + CONFIG.seaFeed);
        wr.stats.collected++;
      }
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
    for (const c of this.cellsOf(wr.id)) {
      const x = c % this.w, y = c / this.w | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (!this.inBounds(nx, ny)) continue;
        const i = this.idx(nx, ny);
        if (CONFIG.island && (wr.realm ? this.owner[i] !== DEBRIS : this.owner[i] === DEBRIS)) continue;
        if (CONFIG.climb && (this.owner[i] === DEBRIS ? !this.dietShare(wr, "meat") : !this.dietShare(wr, "plants"))) continue;
        if (this.resource[i] === 1) {
          const feed = CONFIG.climb ? CONFIG.kelpFeed * this.dietShare(wr, "plants") * this.richness(i) : CONFIG.island ? CONFIG.kelpFeed : CONFIG.sizePickup;
          wr.maxSize = Math.min(this.capOf(wr), wr.maxSize + feed * this.ripe[i]);
          this.log("collect", `${wr.name} took size (max ${Math.floor(wr.maxSize)})`, wr.id);
        } else if (this.resource[i] === 2) {
          wr.speed = Math.min(CONFIG.speedCap, wr.speed + CONFIG.speedPickup);
          this.log("collect", `${wr.name} took speed (${wr.speed.toFixed(2)})`, wr.id);
        } else if (this.owner[i] === DEBRIS) {
          const feed = CONFIG.climb ? CONFIG.seaFeed * this.dietShare(wr, "meat") * this.richness(i) : CONFIG.island ? CONFIG.seaFeed : CONFIG.debrisPickup;
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
    for (const c of this.cellsOf(wr.id)) mine[this.code[c]] = 1;
    let best = -1, bx = 0, by = 0;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const x = wr.ipX + dx, y = wr.ipY + dy, d = Math.abs(dx) + Math.abs(dy);
        if (best >= 0 && d >= best) continue;
        const o = this.ownerAt(x, y);
        if (o < 0 || o === wr.id || mine[this.code[this.idx(x, y)]] || this.seer(wr.id, x, y, R) < 0) continue;
        if (CONFIG.island && this.warriors[o].realm === wr.realm) continue;
        if (CONFIG.climb && this.warriors[o].lineage === wr.lineage) continue;
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
    if (CONFIG.island && wr.realm === 1 && o >= 0 && this.warriors[o].realm === 1) return false;
    if (CONFIG.island && wr.realm === 1 && this.board.land?.[this.idx(x, y)]) return false;
    if (o === NONE || o === wr.id) return false;
    if (this.seer(wr.id, x, y, this.reach(wr)) < 0) return false;
    const victim = o >= 0 ? this.warriors[o].name : "debris";
    if (o >= 0) this.attacks.bombs++;
    if (o >= 0 && this.warriors[o].lineage !== wr.lineage) wr.stats.bombHits++;
    const ti = this.idx(x, y);
    if ((CONFIG.island || CONFIG.climb) && o >= 0 && this.code[ti] === K) {
      const v = this.warriors[o];
      v.dents = (v.dents ?? 0) + (CONFIG.climb ? wr.traits?.bite ?? 1 : 1);
      v.lastHarm = { by: wr.id, t: this.t };
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
    const mine = this.cellsOf(wr.id);
    const xs = mine.map((c) => c % this.w), ys = mine.map((c) => c / this.w | 0);
    const bw = Math.max(...xs) - Math.min(...xs) + 1, bh = Math.max(...ys) - Math.min(...ys) + 1;
    const ox = DX[d] * (bw + 1), oy = DY[d] * (bh + 1);
    for (let k = 0; k < mine.length; k++) if (!this.passable(wr, xs[k] + ox, ys[k] + oy)) return false;
    const steps = Math.abs(ox) + Math.abs(oy);
    for (let k = 0; k < mine.length; k++) {
      for (let s = 1; s < steps; s++) if (this.board.terrain[this.idx(xs[k] + DX[d] * s, ys[k] + DY[d] * s)] !== FLOOR) return false;
    }
    const id = this.track ? this.track.newId() : this.warriors.length;
    const child = {
      id,
      lineage: wr.lineage,
      gen: wr.gen + 1,
      realm: wr.realm,
      parent: wr.id,
      born: this.t,
      name: this.track ? this.track.childName(id) : this.childName(wr.lineage),
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
    if (CONFIG.lifespan > 0) child.diesAt = this.t + Math.floor(this.lifeOf(child.realm) * (0.5 + this.rng()));
    const cx0 = Math.min(...xs) + ox, cx1 = Math.max(...xs) + ox, cy0 = Math.min(...ys) + oy, cy1 = Math.max(...ys) + oy;
    this.board.rooms.forEach((r, k) => {
      if (cx0 >= r.x && cy0 >= r.y && cx1 < r.x + r.w && cy1 < r.y + r.h) child.roomsSeen.add(k);
    });
    this.warriors[id] = child;
    this.livingList.push(child);
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
    if (CONFIG.climb) {
      const k = this.tileOf(child.ipX, child.ipY);
      if (this.track) this.track.tile(k);
      else this.tileCount[k]++;
    }
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
    if (o >= 0 && o !== wr.id) {
      if (c === CODE["@"]) this.attacks.poisons++;
      if (c === CODE["@"] && this.warriors[o].lineage !== wr.lineage) wr.stats.poisonWrites++;
      if (o >= 0) this.warriors[o].lastHarm = { by: wr.id, t: this.t };
      this.log("write", `${wr.name} wrote '${GLYPHS[c]}' into ${this.warriors[o].name}`, wr.id);
    }
    return true;
  }
};

// src/sim/replica.ts
var inside = (w) => w;
function packBody(w, id) {
  const wr = w.warriors[id];
  if (!wr.alive || wr.id !== id) return { id, lineage: wr.lineage, dead: true };
  const { spec, home, roomsSeen, ...rest } = wr;
  return { ...rest, roomsSeen: [...roomsSeen], cells: [...inside(w).cellSets.get(id) ?? []] };
}
function applyPack(w, p) {
  const io = inside(w);
  if ("dead" in p) {
    bury(w, p.id, p.lineage);
    return;
  }
  let wr = w.warriors[p.id];
  if (!wr || wr.id !== p.id || !("spec" in wr)) {
    const f = w.warriors[p.lineage];
    wr = { spec: f.spec, home: f.home };
    w.warriors[p.id] = wr;
  }
  const { cells, roomsSeen, ...rest } = p;
  Object.assign(wr, rest);
  wr.roomsSeen = new Set(roomsSeen);
  io.cellSets.set(p.id, new Set(cells));
  io.sortedCells.delete(p.id);
}
function bury(w, id, lineage) {
  const io = inside(w), wr = w.warriors[id];
  if (wr?.alive) {
    wr.alive = false;
    io.livingDirty = true;
  }
  io.cellSets.delete(id);
  io.sortedCells.delete(id);
  if (CONFIG.endless && (!wr || wr.gen > 0)) w.warriors[id] = io.tombstones.get(lineage);
}
function stub(id, lineage, name) {
  return { id, lineage, name, alive: true, gen: 1 };
}
var provName = (id) => `\0${id}\0`;

// src/sim/schedule.ts
var SCAN = 1;
var SIGHT = 2;
var BITE2 = 4;
var WRITE = 8;
var DIVIDE = 16;
var MOVE2 = 32;
var HALT = 64;
var CAP_OF = new Uint8Array(256);
for (const [g, c] of [["S", SCAN], ["L", SIGHT], ["R", SIGHT], ["B", BITE2], ["W", WRITE], ["D", DIVIDE], ["M", MOVE2], ["A", MOVE2], ["F", MOVE2], ["G", MOVE2], ["@", HALT]]) CAP_OF[CODE[g]] = c;
function capsOf(code, cells) {
  let c = 0;
  for (const i of cells) c |= CAP_OF[code[i]];
  return c;
}
var Buf = class {
  a = new Int32Array(1 << 12);
  n = 0;
  push(v) {
    if (this.n === this.a.length) {
      const b = new Int32Array(this.a.length * 2);
      b.set(this.a);
      this.a = b;
    }
    this.a[this.n++] = v;
  }
};
var grown = (a, n) => a.length >= n ? a : new Int32Array(Math.max(n, a.length * 2));
var Builder = class {
  lastW = new Int32Array(0);
  lastWAt = new Int32Array(0);
  // chunk → last writer + 1, and the plan that set it
  rHead = new Int32Array(0);
  // chunk → newest reader since the last write (pool index + 1)
  rPool = new Buf();
  // [pos, next] pairs
  wMark = new Int32Array(0);
  rMark = new Int32Array(0);
  objLast = new Int32Array(0);
  objAt = new Int32Array(0);
  // key → last user, and the plan that set it
  handLast = new Int32Array(0);
  handAt = new Int32Array(0);
  // (the same, walking hand-offs wave by wave)
  predMark = new Int32Array(0);
  plan = 0;
  // this plan's stamp
  g0 = 0;
  // marks this plan: g0 + item + 1
  cur = 0;
  curW = 0;
  g = 0;
  worker = new Int32Array(0);
  level = new Int32Array(0);
  predStart = new Int32Array(0);
  preds = new Buf();
  objStart = new Int32Array(0);
  objs = new Buf();
  n = 0;
  remote = 0;
  reset(nChunks, n, nKeys) {
    if (this.g0 + n + 1 > 2e9) {
      this.g0 = 0;
      this.wMark.fill(0);
      this.rMark.fill(0);
      this.predMark.fill(0);
    }
    this.g0 += this.n + 1;
    this.plan++;
    this.n = n;
    this.remote = 0;
    if (this.lastW.length < nChunks) {
      this.lastW = new Int32Array(nChunks);
      this.lastWAt = new Int32Array(nChunks);
      this.rHead = new Int32Array(nChunks);
      this.wMark = new Int32Array(nChunks);
      this.rMark = new Int32Array(nChunks);
    }
    if (this.objLast.length < nKeys) {
      this.objLast = new Int32Array(nKeys);
      this.objAt = new Int32Array(nKeys);
      this.handLast = new Int32Array(nKeys);
      this.handAt = new Int32Array(nKeys);
    }
    this.predMark = grown(this.predMark, n);
    this.worker = grown(this.worker, n);
    this.level = grown(this.level, n);
    this.predStart = grown(this.predStart, n + 1);
    this.objStart = grown(this.objStart, n + 1);
    this.preds.n = 0;
    this.objs.n = 0;
    this.rPool.n = 0;
  }
  start(i, w) {
    this.cur = i;
    this.curW = w;
    this.worker[i] = w;
    this.g = this.g0 + i + 1;
    this.predStart[i] = this.preds.n;
    this.objStart[i] = this.objs.n;
    this.level[i] = 1;
  }
  dep(j) {
    if (this.predMark[j] === this.g) return;
    this.predMark[j] = this.g;
    this.preds.push(j);
    const far = this.worker[j] !== this.curW;
    const l = this.level[j] + (far ? 1 : 0);
    if (l > this.level[this.cur]) this.level[this.cur] = l;
    if (far) this.remote++;
  }
  write(c) {
    const g = this.g;
    if (this.wMark[c] === g) return;
    this.wMark[c] = g;
    if (this.lastWAt[c] === this.plan) {
      const lw = this.lastW[c] - 1;
      if (lw !== this.cur) this.dep(lw);
      const pool = this.rPool.a;
      for (let r = this.rHead[c]; r; r = pool[r]) {
        const j = pool[r - 1];
        if (j !== this.cur) this.dep(j);
      }
    } else {
      this.lastWAt[c] = this.plan;
      const pool = this.rPool.a;
      for (let r = this.rMark[c] > this.g0 ? this.rHead[c] : 0; r; r = pool[r]) {
        const j = pool[r - 1];
        if (j !== this.cur) this.dep(j);
      }
    }
    this.rHead[c] = 0;
    this.lastW[c] = this.cur + 1;
  }
  read(c) {
    const g = this.g;
    if (this.wMark[c] === g || this.rMark[c] === g) return;
    const first = this.rMark[c] <= this.g0;
    this.rMark[c] = g;
    const written = this.lastWAt[c] === this.plan;
    if (written) this.dep(this.lastW[c] - 1);
    this.rPool.push(this.cur);
    this.rPool.push(first && !written ? 0 : this.rHead[c]);
    this.rHead[c] = this.rPool.n - 1;
  }
  object(key) {
    if (this.objAt[key] === this.plan) {
      const j = this.objLast[key];
      if (j === this.cur) return;
      this.dep(j);
    } else this.objAt[key] = this.plan;
    this.objLast[key] = this.cur;
    this.objs.push(key);
  }
  /** Items before `i` are all built (their waits and objects end here). */
  seal(i) {
    this.predStart[i] = this.preds.n;
    this.objStart[i] = this.objs.n;
  }
  used = [];
  sharesPlan = 0;
  beginShares() {
    this.sharesPlan++;
    this.used = [];
  }
  /**
   * Each worker's share of items [a, b): their waits, and which objects go where. Hand-offs
   * from, and wake-ups after, items of earlier waves go out as late ones to whoever ran them.
   */
  range(a, b, ids, K3, keyOf, holderOf) {
    const worker = this.worker, P = this.preds.a, O = this.objs.a, ps = this.predStart, os = this.objStart, m = b - a;
    const notify = new Int32Array(m);
    const lateNote = Array.from({ length: K3 }, () => []);
    for (let i = a; i < b; i++) for (let q = ps[i]; q < ps[i + 1]; q++) {
      const j = P[q], bit = 1 << worker[i];
      if (worker[j] === worker[i]) continue;
      if (j >= a) notify[j - a] |= bit;
      else lateNote[worker[j]].push(j, bit);
    }
    const outFrom = new Buf(), outKey = new Buf(), outW = new Buf(), outPos = new Buf();
    const sends = Array.from({ length: K3 }, () => []), lateOut = Array.from({ length: K3 }, () => []);
    const packsIn = new Int32Array(m), outCount = new Int32Array(m);
    const last = this.handLast, at = this.handAt, plan = this.sharesPlan;
    for (let i = a; i < b; i++) {
      const w = worker[i];
      for (let q = os[i]; q < os[i + 1]; q++) {
        const key = O[q], real = keyOf(key);
        if (real === null) continue;
        if (at[key] !== plan) {
          at[key] = plan;
          this.used.push(key);
          const h = holderOf(real);
          if (h >= 0 && h !== w) {
            sends[h].push(real, w, i);
            packsIn[i - a]++;
          }
        } else {
          const j = last[key];
          if (worker[j] !== w) {
            packsIn[i - a]++;
            if (j >= a) {
              outFrom.push(j - a);
              outKey.push(real);
              outW.push(w);
              outPos.push(i);
              outCount[j - a]++;
            } else lateOut[worker[j]].push(j, real, w, i);
          }
        }
        last[key] = i;
      }
    }
    const outStart = new Int32Array(m + 1);
    for (let i = 0; i < m; i++) outStart[i + 1] = outStart[i] + outCount[i];
    const fill = outStart.slice(0, m), oK = new Int32Array(outFrom.n), oW = new Int32Array(outFrom.n), oP = new Int32Array(outFrom.n);
    for (let q = 0; q < outFrom.n; q++) {
      const x = fill[outFrom.a[q]]++;
      oK[x] = outKey.a[q];
      oW[x] = outW.a[q];
      oP[x] = outPos.a[q];
    }
    const count = new Int32Array(K3), np = new Int32Array(K3), no = new Int32Array(K3);
    for (let i = a; i < b; i++) {
      const k = worker[i];
      count[k]++;
      np[k] += ps[i + 1] - ps[i];
      no[k] += outCount[i - a];
    }
    const shares = [];
    for (let k = 0; k < K3; k++) {
      const c = count[k], sd = sends[k];
      shares.push({
        ids: new Int32Array(c),
        pos: new Int32Array(c),
        predOff: new Int32Array(c + 1),
        preds: new Int32Array(np[k]),
        packsIn: new Int32Array(c),
        outOff: new Int32Array(c + 1),
        outKey: new Int32Array(no[k]),
        outW: new Int32Array(no[k]),
        outPos: new Int32Array(no[k]),
        notify: new Int32Array(c),
        sendKey: Int32Array.from({ length: sd.length / 3 }, (_, q) => sd[q * 3]),
        sendW: Int32Array.from({ length: sd.length / 3 }, (_, q) => sd[q * 3 + 1]),
        sendPos: Int32Array.from({ length: sd.length / 3 }, (_, q) => sd[q * 3 + 2]),
        lateOut: Int32Array.from(lateOut[k]),
        lateNote: Int32Array.from(lateNote[k])
      });
    }
    const jAt = new Int32Array(K3), pAt = new Int32Array(K3), oAt = new Int32Array(K3);
    for (let i = a; i < b; i++) {
      const k = worker[i], sh = shares[k], j = jAt[k]++, r = i - a;
      sh.ids[j] = ids[i];
      sh.pos[j] = i;
      sh.packsIn[j] = packsIn[r];
      sh.notify[j] = notify[r];
      sh.preds.set(P.subarray(ps[i], ps[i + 1]), pAt[k]);
      pAt[k] += ps[i + 1] - ps[i];
      sh.predOff[j + 1] = pAt[k];
      const o0 = outStart[r], o1 = outStart[r + 1];
      sh.outKey.set(oK.subarray(o0, o1), oAt[k]);
      sh.outW.set(oW.subarray(o0, o1), oAt[k]);
      sh.outPos.set(oP.subarray(o0, o1), oAt[k]);
      oAt[k] += o1 - o0;
      sh.outOff[j + 1] = oAt[k];
    }
    return shares;
  }
  /** Where each object ended up (its last user's worker), by dense key; −1 if unused. */
  holders(nKeys) {
    const keyHolder = new Int8Array(nKeys).fill(-1);
    for (const key of this.used) keyHolder[key] = this.worker[this.handLast[key]];
    return keyHolder;
  }
};
var turnBuilder = new Builder();
var upkeepBuilder = new Builder();

// src/sim/save.ts
var TYPED = { Int8Array, Uint8Array, Uint16Array, Int32Array, Float32Array, Float64Array };
function readHeader(bytes) {
  const n = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + n)));
}
function loadWorld(bytes) {
  const header = readHeader(bytes);
  if (header.version !== 1) throw new Error(`unknown save version ${header.version}`);
  const n = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true);
  const start = Math.ceil((4 + n) / 8) * 8;
  const table = header.table;
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
  const w = world2;
  for (const [id, set] of w.cellSets) if (!set.size && (id < 0 || !world2.warriors[id]?.alive)) w.cellSets.delete(id);
  for (const [id, cells] of w.sortedCells) if (!w.cellSets.has(id)) w.sortedCells.delete(id);
  return world2;
}
function restoreRng(state) {
  const r = makeRng(0);
  r.state = state;
  return r;
}

// src/par-worker.ts
var port = parentPort;
var debug = process.env.PAR_DEBUG ? (...a) => console.error(`[w${me} t${world?.t}]`, ...a) : () => {
};
var waitAsync = Atomics.waitAsync;
var me = 0;
var K2 = 1;
var world;
var x0 = 0;
var x1 = 0;
var done;
var wake;
var bar;
var peers = [];
var held = /* @__PURE__ */ new Set();
var children = /* @__PURE__ */ new Map();
var events = [];
var deathsOut = [];
var births = [];
var died = [];
var shadow = /* @__PURE__ */ new Map();
var attacks0 = [0, 0];
var pos = 0;
var actor = -1;
var seq = 0;
var nextId = 0;
var endId = 0;
var tracker = {
  tile: (k) => {
    Atomics.add(inside(world).tileCount, k, 1);
  },
  newId() {
    if (nextId >= endId) throw new Error(`par worker ${me}: out of child ids`);
    const id = nextId++;
    births.push(id, pos, seq++, world.warriors[actor].lineage);
    let l = children.get(actor);
    if (!l) children.set(actor, l = []);
    l.push(id);
    held.add(id);
    return id;
  },
  childName: (id) => provName(id),
  died: (id) => {
    died.push(id);
  }
};
function startOutputs() {
  world.events.length = 0;
  events = [];
  deathsOut = [];
  births = [];
  died = [];
  seq = 0;
  diedSeen = 0;
  shadow = new Map(world.deaths);
  attacks0 = [world.attacks.bombs, world.attacks.poisons];
}
var diedSeen = 0;
function afterOp(p) {
  if (world.events.length) {
    for (const e of world.events) events.push([p, e]);
    world.events.length = 0;
  }
  if (died.length === diedSeen) return;
  diedSeen = died.length;
  for (const [k, n] of world.deaths) {
    const d = n - (shadow.get(k) ?? 0);
    if (d) {
      deathsOut.push([p, k, d]);
      shadow.set(k, n);
    }
  }
}
function outputs() {
  const a = world.attacks;
  return { events, deaths: deathsOut, attacks: [a.bombs - attacks0[0], a.poisons - attacks0[1]], died };
}
var phase = null;
var early = [];
var post = (w, items) => {
  debug("send to", w, items.map((x) => `${x[0]}:${x[1]}`).join(" "));
  peers[w].postMessage({ stamp: phase.stamp, items });
};
function packKey(key) {
  if (key >= 0) {
    held.delete(key);
    return [packBody(world, key)];
  }
  const parent = -1 - key, kids = children.get(parent) ?? [];
  children.delete(parent);
  return kids.map((id) => {
    held.delete(id);
    return packBody(world, id);
  });
}
function onPacks(m) {
  debug("got", m.stamp, phase?.stamp, m.items.map((x) => `${x[0]}:${x[1]}`).join(" "));
  if (!phase || m.stamp !== phase.stamp) {
    early.push(m);
    return;
  }
  for (const [target, key, packs] of m.items) {
    for (const p of packs) {
      applyPack(world, p);
      if (!("dead" in p)) held.add(p.id);
    }
    if (key < 0) children.set(-1 - key, packs.filter((p) => !("dead" in p)).map((p) => p.id));
    phase.packIn(target);
  }
  phase.poke?.();
}
var prof = { run: 0, wait: 0, all: 0, waits: 0, yields: 0, yieldMs: 0, scans: 0 };
var Phase = class {
  constructor(stamp, upkeep) {
    this.stamp = stamp;
    this.upkeep = upkeep;
  }
  // Per item (flat, grown as waves come): body, position, bodies to come in and come so far,
  // workers to wake after, local and remote waits left, state (1 queued, 2 ran), priority.
  n = 0;
  ids = new Int32Array(1024);
  P = new Int32Array(1024);
  packsIn = new Int32Array(1024);
  arrived = new Int32Array(1024);
  notify = new Int32Array(1024);
  localLeft = new Int32Array(1024);
  remoteLeft = new Int32Array(1024);
  state = new Uint8Array(1024);
  prio = new Float64Array(1024);
  // Linked lists in flat buffers: an item's local successors, and objects to send after it.
  succHead = new Int32Array(1024);
  succ = new Buf2(2);
  // [to, next]
  outHead = new Int32Array(1024);
  out = new Buf2(4);
  // [key, worker, position, next]
  itemAt = /* @__PURE__ */ new Map();
  waitersOn = /* @__PURE__ */ new Map();
  pending = /* @__PURE__ */ new Map();
  // packs in for positions not mine yet
  heap = [];
  packsDue = 0;
  left = 0;
  all = false;
  poke = null;
  grow(m) {
    if (this.n + m <= this.ids.length) return;
    const c = Math.max(this.n + m, this.ids.length * 2);
    const g = (a) => {
      const b = new a.constructor(c);
      b.set(a);
      return b;
    };
    this.ids = g(this.ids);
    this.P = g(this.P);
    this.packsIn = g(this.packsIn);
    this.arrived = g(this.arrived);
    this.notify = g(this.notify);
    this.localLeft = g(this.localLeft);
    this.remoteLeft = g(this.remoteLeft);
    this.state = g(this.state);
    this.prio = g(this.prio);
    this.succHead = g(this.succHead);
    this.outHead = g(this.outHead);
  }
  addOut(i, key, w, p) {
    const o = this.out, at = o.add();
    o.a[at] = key;
    o.a[at + 1] = w;
    o.a[at + 2] = p;
    o.a[at + 3] = this.outHead[i];
    this.outHead[i] = at + 1;
  }
  /** A wave of items: the share, and what it adds to items I already have. */
  add(sh, last) {
    const base = this.n, m = sh.ids.length;
    this.grow(m);
    for (let q = 0; q < m; q++) {
      const j = base + q, p = sh.pos[q];
      this.itemAt.set(p, j);
      this.ids[j] = sh.ids[q];
      this.P[j] = p;
      this.packsIn[j] = sh.packsIn[q];
      this.notify[j] = sh.notify[q];
      const pre = this.pending.get(p) ?? 0;
      if (pre) this.pending.delete(p);
      this.arrived[j] = pre;
      this.packsDue += sh.packsIn[q] - pre;
      this.succHead[j] = 0;
      this.outHead[j] = 0;
      this.state[j] = 0;
      for (let r = sh.outOff[q + 1] - 1; r >= sh.outOff[q]; r--) this.addOut(j, sh.outKey[r], sh.outW[r], sh.outPos[r]);
      this.prio[j] = (sh.notify[q] ? 0 : 1e9) + p;
      let ll = 0, rl = 0;
      for (let r = sh.predOff[q]; r < sh.predOff[q + 1]; r++) {
        const pp = sh.preds[r], i = this.itemAt.get(pp);
        if (i !== void 0) {
          if (this.state[i] !== 2) {
            ll++;
            const sc = this.succ, at = sc.add();
            sc.a[at] = j;
            sc.a[at + 1] = this.succHead[i];
            this.succHead[i] = at + 1;
          }
        } else if (Atomics.load(done, pp) !== this.stamp) {
          rl++;
          let l = this.waitersOn.get(pp);
          if (!l) this.waitersOn.set(pp, l = []);
          l.push(j);
        }
      }
      this.localLeft[j] = ll;
      this.remoteLeft[j] = rl;
    }
    this.n += m;
    this.left += m;
    const first = /* @__PURE__ */ new Map();
    for (let q = 0; q < sh.sendKey.length; q++) {
      const w = sh.sendW[q];
      let l = first.get(w);
      if (!l) first.set(w, l = []);
      l.push([sh.sendPos[q], sh.sendKey[q], packKey(sh.sendKey[q])]);
    }
    for (const [w, l] of first) post(w, l);
    const lo = sh.lateOut, now = /* @__PURE__ */ new Map();
    for (let r = 0; r < lo.length; r += 4) {
      const i = this.itemAt.get(lo[r]);
      if (this.state[i] === 2) {
        let l = now.get(lo[r + 2]);
        if (!l) now.set(lo[r + 2], l = []);
        l.push([lo[r + 3], lo[r + 1], packKey(lo[r + 1])]);
      } else this.addOut(i, lo[r + 1], lo[r + 2], lo[r + 3]);
    }
    for (const [w, l] of now) post(w, l);
    const ln = sh.lateNote;
    for (let r = 0; r < ln.length; r += 2) {
      const i = this.itemAt.get(ln[r]);
      if (this.state[i] === 2) wakeAll(ln[r + 1]);
      else this.notify[i] |= ln[r + 1];
    }
    if (last) this.all = true;
    for (let q = 0; q < m; q++) this.check(base + q);
    this.poke?.();
  }
  packIn(target) {
    const j = this.itemAt.get(target);
    if (j === void 0) {
      this.pending.set(target, (this.pending.get(target) ?? 0) + 1);
      return;
    }
    this.arrived[j]++;
    this.packsDue--;
    this.check(j);
  }
  check(j) {
    if (this.state[j] || this.localLeft[j] || this.remoteLeft[j] || this.arrived[j] < this.packsIn[j]) return;
    this.state[j] = 1;
    const heap = this.heap, prio = this.prio;
    heap.push(j);
    for (let c = heap.length - 1; c > 0; ) {
      const p = c - 1 >> 1;
      if (prio[heap[p]] <= prio[heap[c]]) break;
      const x = heap[p];
      heap[p] = heap[c];
      heap[c] = x;
      c = p;
    }
  }
  pop() {
    const heap = this.heap, prio = this.prio, top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let c = 0; ; ) {
        const l = 2 * c + 1, r = l + 1;
        let b = c;
        if (l < heap.length && prio[heap[l]] < prio[heap[b]]) b = l;
        if (r < heap.length && prio[heap[r]] < prio[heap[b]]) b = r;
        if (b === c) break;
        const x = heap[b];
        heap[b] = heap[c];
        heap[c] = x;
        c = b;
      }
    }
    return top;
  }
  remoteDone() {
    let freed = false;
    for (const [p, l] of this.waitersOn) {
      prof.scans++;
      if (Atomics.load(done, p) !== this.stamp) continue;
      this.waitersOn.delete(p);
      for (const j of l) {
        this.remoteLeft[j]--;
        this.check(j);
      }
      freed = true;
    }
    return freed;
  }
  async run() {
    const tAll = performance.now(), timing = !!process.env.PAR_DEBUG;
    prof = { run: 0, wait: 0, all: 0, waits: 0, yields: 0, yieldMs: 0, scans: 0 };
    const S = this.succ.a, O = this.out;
    while (!(this.all && !this.left)) {
      let seen = Atomics.load(wake, me);
      while (this.heap.length) {
        const nw = Atomics.load(wake, me);
        if (nw !== seen) {
          seen = nw;
          this.remoteDone();
          if (this.packsDue > 0 || !this.all) {
            const ty = performance.now();
            prof.yields++;
            await new Promise((r) => setImmediate(r));
            prof.yieldMs += performance.now() - ty;
            continue;
          }
        }
        const j = this.pop();
        const p = this.P[j], id = this.ids[j], wr = world.warriors[id];
        pos = p;
        actor = id;
        const tr0 = timing ? performance.now() : 0;
        if (wr && wr.alive && wr.id === id) {
          if (this.upkeep) world.upkeep(wr);
          else world.turn(wr);
        }
        if (timing) prof.run += performance.now() - tr0;
        afterOp(p);
        if (this.outHead[j]) {
          const outs = /* @__PURE__ */ new Map();
          for (let at = this.outHead[j] - 1; at >= 0; at = O.a[at + 3] - 1) {
            const w = O.a[at + 1];
            let l = outs.get(w);
            if (!l) outs.set(w, l = []);
            l.push([O.a[at + 2], O.a[at], packKey(O.a[at])]);
          }
          for (const [w, l] of outs) post(w, l);
        }
        this.state[j] = 2;
        Atomics.store(done, p, this.stamp);
        if (this.notify[j]) wakeAll(this.notify[j]);
        this.left--;
        const sa = this.succ.a;
        for (let at = this.succHead[j] - 1; at >= 0; at = sa[at + 1] - 1) {
          const s2 = sa[at];
          this.localLeft[s2]--;
          this.check(s2);
        }
      }
      if (this.all && !this.left) break;
      if (this.remoteDone() || this.heap.length) continue;
      const tw0 = performance.now();
      prof.waits++;
      await new Promise((res) => {
        this.poke = res;
        const r = waitAsync(wake, me, seen);
        if (r.async) void r.value.then(() => res());
        else res();
      });
      this.poke = null;
      prof.wait += performance.now() - tw0;
    }
    prof.all = performance.now() - tAll;
  }
};
var Buf2 = class {
  constructor(size) {
    this.size = size;
  }
  a = new Int32Array(1 << 12);
  n = 0;
  add() {
    if (this.n + this.size > this.a.length) {
      const b = new Int32Array(this.a.length * 2);
      b.set(this.a);
      this.a = b;
    }
    const at = this.n;
    this.n += this.size;
    return at;
  }
};
function wakeAll(mask) {
  for (let w = 0; mask; mask >>= 1, w++) if (mask & 1) {
    Atomics.add(wake, w, 1);
    Atomics.notify(wake, w);
  }
}
function startPhase(stamp, upkeep) {
  phase = new Phase(stamp, upkeep);
  const now = early.filter((e) => e.stamp === stamp);
  early = early.filter((e) => e.stamp !== stamp);
  for (const e of now) onPacks(e);
  return phase;
}
async function barrier(n) {
  if (Atomics.add(bar, 0, 1) + 1 >= n * K2) {
    Atomics.notify(bar, 0);
    return;
  }
  for (; ; ) {
    const v = Atomics.load(bar, 0);
    if (v >= n * K2) return;
    const r = waitAsync(bar, 0, v);
    if (r.async) await r.value;
  }
}
var barriers = 0;
var begun = Promise.resolve();
function debrisInStrip() {
  const { owner, w, h } = world, out = [];
  for (let y = h - 1; y >= 0; y--) {
    const row = y * w;
    for (let x = x1 - 1; x >= x0; x--) if (owner[row + x] === DEBRIS) out.push(row + x);
  }
  return out;
}
var live = (id) => {
  const wr = world.warriors[id];
  return !!wr && wr.alive && wr.id === id;
};
function summaries() {
  const io = inside(world), W = world.w;
  const ids = [...held].filter(live).sort((a, b) => a - b);
  const n = ids.length, box = new Int32Array(n * 4), ip = new Int32Array(n * 2), f = new Float64Array(n * 2), harm = new Int32Array(n * 2), caps = new Uint8Array(n);
  ids.forEach((id, k) => {
    const wr = world.warriors[id];
    let bx0 = wr.ipX, by0 = wr.ipY, bx1 = wr.ipX, by1 = wr.ipY;
    for (const c of io.cellSets.get(id) ?? []) {
      const x = c % W, y = c / W | 0;
      if (x < bx0) bx0 = x;
      if (x > bx1) bx1 = x;
      if (y < by0) by0 = y;
      if (y > by1) by1 = y;
    }
    box[k * 4] = bx0;
    box[k * 4 + 1] = by0;
    box[k * 4 + 2] = bx1;
    box[k * 4 + 3] = by1;
    ip[k * 2] = wr.ipX;
    ip[k * 2 + 1] = wr.ipY;
    f[k * 2] = wr.accum;
    f[k * 2 + 1] = wr.speed;
    harm[k * 2] = wr.lastHarm ? wr.lastHarm.by : -1;
    harm[k * 2 + 1] = wr.lastHarm ? wr.lastHarm.t : 0;
    caps[k] = capsOf(world.code, io.cellSets.get(id) ?? []);
  });
  return { ids: Int32Array.from(ids), box, ip, f, harm, caps };
}
port.on("message", async (m) => {
  try {
    if (m.type === "load") {
      me = m.k;
      K2 = m.K;
      world = loadWorld(m.bytes);
      const io = inside(world), sab = m.sab;
      world.owner = new Int32Array(sab.owner);
      world.code = new Uint8Array(sab.code);
      world.resource = new Uint8Array(sab.resource);
      world.ripe = new Float32Array(sab.ripe);
      io.tileCount = new Uint16Array(sab.tileCount);
      io.tileActive = new Uint8Array(sab.tileActive);
      io.tileLast = new Float64Array(sab.tileLast);
      done = new Int32Array(sab.done);
      wake = new Int32Array(sab.wake);
      bar = new Int32Array(sab.bar);
      barriers = m.barriers;
      const cuts = m.cuts;
      x0 = me ? cuts[me - 1] : 0;
      x1 = me < cuts.length ? cuts[me] : world.w;
      for (const p of peers) p?.close();
      peers = m.peers;
      peers.forEach((p) => p?.on("message", onPacks));
      held = new Set(m.held);
      children = /* @__PURE__ */ new Map();
      world.track = tracker;
      port.postMessage({ type: "loaded" });
      return;
    }
    if (m.type === "begin") {
      world.t = m.t;
      for (const id of m.dead) if (!held.has(id) && world.warriors[id]?.alive) bury(world, id, world.warriors[id].lineage);
      begun = (async () => {
        const T = CONFIG.tile;
        if (m.next) world.wakeTiles(m.next, x0 / T, x1 / T);
        world.regrow();
        await barrier(++barriers);
        if (world.t % CONFIG.sinkEvery === 0) world.sink(debrisInStrip());
        await barrier(++barriers);
      })();
      return;
    }
    if (m.type === "turns") {
      const ph = startPhase(m.stamp, false);
      startOutputs();
      nextId = m.first;
      endId = m.end;
      for (let i = world.warriors.length; i < m.top; i++) world.warriors.push(null);
      debug("turns: waiting on begin");
      await begun;
      debug("turns: adding", m.share.ids.length);
      ph.add(m.share, m.last);
      debug("turns: running, left", ph.left, "heap", ph.heap.length, "all", ph.all);
      await ph.run();
      debug("turns: done");
      const harmed = [];
      for (const id of held) {
        const wr = world.warriors[id];
        if (live(id) && wr.lastHarm?.t === world.t) harmed.push(id, wr.lastHarm.by, wr.lastHarm.t);
      }
      port.postMessage({ type: "turned", births, harmed, prof, ...outputs() });
      return;
    }
    if (m.type === "wave") {
      const ph = phase;
      if (ph.stamp !== m.stamp) throw new Error(`par worker ${me}: a wave for ${m.stamp} during ${ph.stamp}`);
      await begun;
      ph.add(m.share, m.last);
      return;
    }
    if (m.type === "upkeep") {
      const io = inside(world), base = m.base, map = m.map, names = m.names, lin = m.lineage;
      const objs = [];
      for (let k = 0; k < map.length; k++) {
        const p = map[k], f = base + k;
        const wr = held.has(p) ? world.warriors[p] : null;
        if (wr && wr.id === p) {
          wr.id = f;
          wr.name = names[k];
          const set = io.cellSets.get(p);
          if (set) {
            for (const c of set) world.owner[c] = f;
            io.cellSets.delete(p);
            io.cellSets.set(f, set);
          }
          io.sortedCells.delete(p);
          held.delete(p);
          held.add(f);
          objs.push(wr);
        } else {
          if (wr) held.delete(p);
          objs.push(wr ?? stub(f, lin[k], names[k]));
        }
      }
      world.warriors.length = base;
      for (const wr of objs) world.warriors.push(wr);
      for (const id of m.dead) if (!held.has(id) && world.warriors[id]?.alive) bury(world, id, world.warriors[id].lineage);
      children = /* @__PURE__ */ new Map();
      const ph = startPhase(m.stamp, true);
      startOutputs();
      ph.add(m.share, true);
      await ph.run();
      port.postMessage({ type: "kept", sum: summaries(), prof, ...outputs() });
      return;
    }
    if (m.type === "dead") {
      for (const id of m.dead) if (!held.has(id) && world.warriors[id]?.alive) bury(world, id, world.warriors[id].lineage);
      return;
    }
    if (m.type === "sync") {
      const io = inside(world), T = CONFIG.tile;
      const packs = [...held].filter(live).map((id) => packBody(world, id));
      const timers = [];
      io.spawnsInTile.forEach((list, k) => {
        const tx = k % io.tw;
        if (tx * T >= x0 && tx * T < x1) for (const s of list) timers.push(s, io.spawnTimers[s]);
      });
      port.postMessage({ type: "synced", packs, timers });
      return;
    }
  } catch (e) {
    port.postMessage({ type: "error", error: String(e.stack ?? e) });
  }
});
port.postMessage({ type: "ready" });
//# sourceMappingURL=par-worker.mjs.map

// Boards: rooms joined by corridors, four-way mirror symmetric so every start corner is
// equally good. Everything is generated in the top-left quadrant and mirrored: 2–6 rooms
// per quadrant of mixed sizes, corridors 1–4 wide, mostly 1–2, and only 1–2 out of the start room (straight or L-shaped, a spanning tree
// plus extra loops), some central rooms merging with their mirror images. Resources in
// the non-start rooms.
import { makeRng, randInt, Rng } from './rng';

export const FLOOR = 0;
export const WALL = 1;

export interface Spawn { x: number; y: number; kind: 1 | 2 } // 1 = size, 2 = speed
export interface Rect { x: number; y: number; w: number; h: number }

export interface Board {
  w: number;
  h: number;
  terrain: Uint8Array;
  spawns: Spawn[];
  starts: Rect[]; // corner rooms: TL, TR, BR, BL (a 2-player match is TL vs TR)
  rooms: Rect[];  // every room (start rooms included), mirror images listed separately; a room merged with its mirror is one hall
  toxin?: Uint8Array; // petri dish plate: toxin level of each cell (0 = clean)
  // Island survival: pressure per realm (0 = islanders, 1 = sea creatures; `toxin` is the
  // islanders'), the realm each start belongs to, and the surface row.
  toxinBy?: Uint8Array[];
  startRealm?: number[];
  surface?: number;
  land?: Uint8Array;  // island: 1 on the islands (seals haul out here; sharks can't bite it)
  reef?: number[];    // island: wall cells closing the deep off at the left edge until the channel opens
  calmLine?: number;  // island: first row with pressure (seals start above it)
  sharkLine?: number; // island: the first row sharks may enter (everything above is too shallow)
}

export const BOARD_W = 64;
export const BOARD_H = 40;

export function makeBoard(seed: number): Board {
  // Re-rolled until every start and spawn is reachable.
  for (let k = 0; ; k++) {
    const b = makeRooms(seed, k);
    if (b) return b;
  }
}

function canvas(w: number, h: number) {
  const terrain = new Uint8Array(w * h).fill(WALL);
  // Carve a rect and its mirror images (left-right, top-bottom, both).
  const carve = (r: Rect) => {
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
  const spawns: Spawn[] = [];
  const spawnAll = (x: number, y: number, kind: 1 | 2) => {
    for (const [px, py] of [[x, y], [w - 1 - x, y], [x, h - 1 - y], [w - 1 - x, h - 1 - y]]) {
      if (!spawns.some((s) => s.x === px && s.y === py)) spawns.push({ x: px, y: py, kind });
    }
  };
  const mirrorRect = (r: Rect, mx: boolean, my: boolean): Rect => ({
    x: mx ? w - r.x - r.w : r.x, y: my ? h - r.y - r.h : r.y, w: r.w, h: r.h,
  });
  const startsFrom = (r: Rect) => [mirrorRect(r, false, false), mirrorRect(r, true, false), mirrorRect(r, true, true), mirrorRect(r, false, true)];
  return { terrain, carve, spawns, spawnAll, startsFrom };
}

const WIDTHS = [1, 1, 2, 2, 3, 4]; // corridor widths, mostly too narrow to SHIFT a block through

/** Split `total` into `n` parts, the first at least `first`, the rest at least `min`. */
function split(rng: Rng, total: number, n: number, first: number, min: number): number[] {
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

/** Longest run of floor along the ring of cells just outside rect `r`, side by side. */
export function widestExit(terrain: Uint8Array, w: number, r: Rect): number {
  let widest = 0;
  const sides: [number, number, number, number, number][] = [
    [r.x, r.y - 1, 1, 0, r.w], [r.x, r.y + r.h, 1, 0, r.w], [r.x - 1, r.y, 0, 1, r.h], [r.x + r.w, r.y, 0, 1, r.h],
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

function makeRooms(seed: number, attempt: number): Board | null {
  const w = BOARD_W, h = BOARD_H, hw = w / 2, hh = h / 2;
  const rng = makeRng((seed * 7919 + attempt * 104729) ^ 0x51ed27);
  const { terrain, carve, spawns, spawnAll, startsFrom } = canvas(w, h);

  const qcols = randInt(rng, 2, 3), qrows = randInt(rng, 1, 2);
  const colW = split(rng, hw - 1, qcols, 18, 7);
  const rowH = split(rng, hh - 1, qrows, 10, 6);

  // One room per grid cell. The start room (0,0) is big enough for any warrior.
  const rooms: Rect[][] = [];
  let y0 = 1;
  for (let r = 0; r < qrows; r++) {
    rooms.push([]);
    let x0 = 1;
    for (let c = 0; c < qcols; c++) {
      const cw = colW[c], ch = rowH[r];
      const start = r === 0 && c === 0;
      // Rooms sit well inside their cells, so there's wall between them and corridors have length.
      const rw = start ? randInt(rng, 16, Math.max(16, cw - 2)) : randInt(rng, Math.max(4, Math.floor(cw * 0.4)), Math.max(4, cw - 3));
      const rh = start ? randInt(rng, Math.min(8, ch - 2), ch - 2) : randInt(rng, Math.max(3, Math.floor(ch * 0.4)), Math.max(3, ch - 3));
      const room: Rect = { x: x0 + randInt(rng, 0, cw - rw - 1) + (start ? 1 : 0), y: y0 + randInt(rng, 0, ch - rh - 1) + (start ? 1 : 0), w: rw, h: rh };
      // Keep a wall between the start room and its cell's far edge: with one row of rooms that
      // edge is the mirror axis, and touching it merges the start room with its mirror image.
      if (start) { room.x = Math.min(room.x, x0 + cw - rw - 1); room.y = Math.min(room.y, y0 + ch - rh - 1); }
      // Rooms on the mirror axes sometimes stretch to the axis and merge with their mirror.
      // (Never the start room: every way out of it is a narrow corridor.)
      if (c === qcols - 1 && rng() < 0.25 && !start) room.w = hw - room.x;
      if (r === qrows - 1 && rng() < 0.25 && !start) room.h = hh - room.y;
      rooms[r].push(room);
      carve(room);
      x0 += cw;
    }
    y0 += rowH[r];
  }

  const center = (a: Rect) => ({ x: a.x + Math.floor(a.w / 2), y: a.y + Math.floor(a.h / 2) });
  const corridor = (a: Rect, b: Rect, cw: number) => {
    // Straight if the rooms overlap enough across the gap, otherwise an L.
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

  // Spanning tree over the grid (random DFS), plus extra edges for loops.
  const key = (r: number, c: number) => r * 10 + c;
  const seen = new Set([key(0, 0)]);
  const stack = [[0, 0]];
  const edges = new Set<string>();
  const startExits: number[] = [];
  const link = (r1: number, c1: number, r2: number, c2: number) => {
    const id = [key(r1, c1), key(r2, c2)].sort().join('-');
    if (edges.has(id)) return;
    edges.add(id);
    let cw = WIDTHS[Math.floor(rng() * WIDTHS.length)];
    if ((r1 === 0 && c1 === 0) || (r2 === 0 && c2 === 0)) { cw = Math.min(cw, 2); startExits.push(cw); }
    corridor(rooms[r1][c1], rooms[r2][c2], cw);
  };
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const next = [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]
      .filter(([a, b]) => a >= 0 && b >= 0 && a < qrows && b < qcols && !seen.has(key(a, b)));
    if (!next.length) { stack.pop(); continue; }
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
  // Every exit from the start room is 1–2 wide (getting out means squeezing through), and
  // at least one is 2 wide.
  if (!startExits.some((cw) => cw >= 2)) {
    const [r, c] = qcols > 1 ? [0, 1] : [1, 0];
    corridor(rooms[0][0], rooms[r][c], 2);
  }

  // Cross the mirror axes: each axis room either merges with its mirror (stretched to
  // the axis above) or gets a corridor to it. At least one crossing per axis.
  const crossRight = rooms.map((row) => row[qcols - 1]);
  const crossDown = rooms[qrows - 1];
  const cross = (list: Rect[], horizontal: boolean) => {
    let any = list.some((a) => horizontal ? a.x + a.w >= hw : a.y + a.h >= hh);
    list.forEach((a, i) => {
      const touches = horizontal ? a.x + a.w >= hw : a.y + a.h >= hh;
      if (touches || (any && rng() < 0.5 && i !== list.length - 1)) return;
      const cw = a === rooms[0][0] ? Math.min(2, WIDTHS[Math.floor(rng() * WIDTHS.length)]) : WIDTHS[Math.floor(rng() * WIDTHS.length)];
      if (horizontal) carve({ x: a.x + a.w, y: randInt(rng, a.y, a.y + a.h - Math.min(cw, a.h)), w: hw - (a.x + a.w), h: cw });
      else carve({ x: randInt(rng, a.x, a.x + a.w - Math.min(cw, a.w)), y: a.y + a.h, w: cw, h: hh - (a.y + a.h) });
      any = true;
    });
  };
  cross(crossRight, true);
  cross(crossDown, false);

  // Resources: size and speed spots in random non-start rooms (never the start room).
  const others = rooms.flat().filter((r) => r !== rooms[0][0]);
  const inside = (a: Rect) => ({ x: a.x + randInt(rng, 1, Math.max(1, a.w - 2)), y: a.y + randInt(rng, 1, Math.max(1, a.h - 2)) });
  for (let k = 0; k < 2; k++) { const p = inside(others[Math.floor(rng() * others.length)]); spawnAll(Math.min(p.x, hw - 1), Math.min(p.y, hh - 1), 1); }
  { const p = inside(others[Math.floor(rng() * others.length)]); spawnAll(Math.min(p.x, hw - 1), Math.min(p.y, hh - 1), 2); }

  const starts = startsFrom(rooms[0][0]);

  // Every way out of the start room is at most 2 wide (re-roll otherwise): the "left home"
  // and "entered another room" stats, and the fitness built on them, assume leaving means
  // squeezing through a corridor.
  if (widestExit(terrain, w, starts[0]) > 2) return null;

  // Everything must be reachable from the first start; fill in anything that isn't.
  const reach = new Uint8Array(w * h);
  const s0 = starts[0];
  const q = [(s0.y + 1) * w + s0.x + 1];
  reach[q[0]] = 1;
  while (q.length) {
    const i = q.pop()!;
    for (const n of [i - 1, i + 1, i - w, i + w]) {
      if (n >= 0 && n < w * h && !reach[n] && terrain[n] === FLOOR) { reach[n] = 1; q.push(n); }
    }
  }
  for (const s of starts) if (!reach[(s.y + 1) * w + s.x + 1]) return null;
  for (const sp of spawns) if (!reach[sp.y * w + sp.x]) return null;
  for (let i = 0; i < w * h; i++) if (terrain[i] === FLOOR && !reach[i]) terrain[i] = WALL;

  // Rooms for the "entered another room" stat. A room stretched to a mirror axis merges with
  // its mirror image into one hall, listed once (as two halves, wandering inside one hall
  // would count as two rooms).
  const listed = new Set<string>();
  const allRooms = rooms.flat().flatMap((r) => {
    const hall = { x: r.x, y: r.y, w: r.x + r.w === hw ? 2 * r.w : r.w, h: r.y + r.h === hh ? 2 * r.h : r.h };
    return startsFrom(hall).filter((m) => { const k = `${m.x},${m.y},${m.w},${m.h}`; return !listed.has(k) && !!listed.add(k); });
  });
  return { w, h, terrain, spawns, starts, rooms: allRooms };
}

/**
 * Petri dish plate (after the MEGA-plate experiment): one round open arena, clean in the
 * middle (two bands wide, so a young population can settle), then rings of rising toxin
 * out to the rim, `bands` levels in all (0 … bands-1). Food spots everywhere, about one per `foodSpacing`² cells (1 in 5 is speed).
 * The start is the middle.
 */
export function makePlate(seed: number, size: number, bands: number, foodSpacing: number): Board {
  const w = size, h = size, c = (size - 1) / 2, R = size / 2 - 1;
  const rng = makeRng(seed ^ 0x9e3779b9);
  const terrain = new Uint8Array(w * h).fill(WALL);
  const toxin = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = Math.hypot(x - c, y - c);
      if (r > R) continue;
      terrain[y * w + x] = FLOOR;
      toxin[y * w + x] = Math.max(0, Math.min(bands - 1, Math.floor((r / R) * (bands + 1)) - 1)); // the clean middle is two bands wide
    }
  }
  const spawns: Spawn[] = [];
  for (let y = 1; y < h - 1; y += foodSpacing) {
    for (let x = 1; x < w - 1; x += foodSpacing) {
      const px = x + randInt(rng, 0, foodSpacing - 1), py = y + randInt(rng, 0, foodSpacing - 1);
      if (px < w && py < h && terrain[py * w + px] === FLOOR) spawns.push({ x: px, y: py, kind: rng() < 0.2 ? 2 : 1 });
    }
  }
  const s = Math.floor((2 * R) / (bands + 1)); // the clean disc's inscribed square
  const start: Rect = { x: Math.round(c - s / Math.SQRT2), y: Math.round(c - s / Math.SQRT2), w: Math.floor(s * Math.SQRT2), h: Math.floor(s * Math.SQRT2) };
  return { w, h, terrain, spawns, starts: [start], rooms: [], toxin };
}

/**
 * Island survival: a side view. Sky (wall) on top with islands rising out of the sea (one
 * every ~100 columns); the water below is `depth` × the width deep, down to an uneven
 * seabed. The deep is rocky: cave systems, overhangs and outcrops (cellular automata,
 * thicker toward the bottom) that block sight, so groups can hide and get cut off. Water
 * that can't be reached from the open sea is filled in. Islanders (realm 0) feel pressure
 * below the `calm` top share of the water, in bands that thicken with depth, and counter
 * it with armor (K); sea creatures (realm 1) are never hurt, but can't swim into the top
 * `shallows` share or onto land. Kelp grows in the water, thicker with depth, and along
 * every rock floor. Starts: the middle island's top (realm 0), and a bay at the left edge
 * walled off by a reef until the channel opens (realm 1).
 */
export function makeIsland(seed: number, w: number, bands: number, foodSpacing: number, shallows = 0.4, calm = 0.5, depth = 0.75): Board {
  const h = Math.round(w * depth);
  const rng = makeRng(seed ^ 0x51ed27);
  const terrain = new Uint8Array(w * h).fill(WALL);
  const S = 14;                                  // first water row (the islands rise above it)
  const bedMax = h - 2, hill = Math.round((bedMax - S) * 0.12);
  const ph = [rng() * 6.28, rng() * 6.28, rng() * 6.28];
  const bed = (x: number) => bedMax - Math.round(hill * (0.5 + 0.25 * Math.sin(x / w * 6.28 * 1.3 + ph[0]) + 0.17 * Math.sin(x / w * 6.28 * 3.7 + ph[1]) + 0.08 * Math.sin(x / w * 6.28 * 9.1 + ph[2])));
  for (let x = 1; x < w - 1; x++) for (let y = S; y <= bed(x); y++) terrain[y * w + x] = FLOOR;
  const depthOf = (y: number) => (y - S) / (bedMax - S);
  const sharkLine = S + Math.round(shallows * (bedMax - S));
  const bayW = Math.max(18, Math.round(w * 0.06)), reefX = bayW + 1;
  // Rock: cellular automata on a coarse grid (4×4 cells per square, so features are big),
  // seeded more thickly the deeper it is, none above the shark line or in the sharks' bay.
  const G = 4, gw = Math.ceil(w / G), gh = Math.ceil(h / G);
  let cg = new Uint8Array(gw * gh);
  const ok = (gx: number, gy: number) => gy * G >= sharkLine + 4 && gx * G > reefX + 2 && gx < gw - 1;
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
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (cg[((y / G) | 0) * gw + ((x / G) | 0)] && terrain[y * w + x] === FLOOR) rock[y * w + x] = 1;
  for (let i = 0; i < w * h; i++) if (rock[i]) terrain[i] = WALL;
  // Islands: mounds above the surface, one every ~100 columns. The middle one is home.
  const nIsl = Math.max(3, Math.round(w / 100) | 1);
  const isl = Array.from({ length: nIsl }, (_, k) => {
    const f = (k + 0.5) / nIsl, mid = k === (nIsl - 1) / 2;
    return { cx: Math.round(w * f), hw: Math.round(w * (mid ? 0.08 : 0.045)) };
  });
  const land = new Uint8Array(w * h);
  for (const { cx, hw } of isl) {
    for (let x = cx - hw; x <= cx + hw; x++) {
      const k = (x - cx) / hw, top = S - Math.round((S - 2) * Math.min(1, 1.8 * (1 - k * k))); // flat-topped, steep shores
      for (let y = top; y < S; y++) { terrain[y * w + x] = FLOOR; land[y * w + x] = 1; }
    }
  }
  // Fill in water the open sea can't reach (flood from the surface row).
  const seen = new Uint8Array(w * h), q: number[] = [];
  for (let x = 1; x < w - 1; x++) if (terrain[S * w + x] === FLOOR) { seen[S * w + x] = 1; q.push(S * w + x); }
  for (let k = 0; k < q.length; k++) {
    const i = q[k];
    for (const n of [i - 1, i + 1, i - w, i + w]) if (n >= 0 && n < w * h && !seen[n] && terrain[n] === FLOOR) { seen[n] = 1; q.push(n); }
  }
  for (let i = 0; i < w * h; i++) if (terrain[i] === FLOOR && !seen[i]) terrain[i] = WALL;
  const landP = new Uint8Array(w * h), seaP = new Uint8Array(w * h);
  // The top `calm` share of the water has no pressure; below it, bands 1 … bands-1 split the rest.
  const level = (d: number) => (d < calm ? 0 : Math.min(bands - 1, 1 + Math.floor(((d - calm) / (1 - calm)) * (bands - 1))));
  for (let y = S; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (terrain[i] === FLOOR) landP[i] = level(depthOf(y)); // (seaP stays 0: sharks swim anywhere they can reach)
  }
  // Kelp: in the water only, thicker with depth, and along every floor (seabed and rock tops).
  const spawns: Spawn[] = [];
  const has = new Set<number>();
  const add = (x: number, y: number) => {
    const i = y * w + x;
    if (terrain[i] !== FLOOR || land[i] || has.has(i) || x === reefX) return;
    has.add(i);
    spawns.push({ x, y, kind: 1 }); // all kelp: speed comes from the body's pace
  };
  for (let y = S; y < h - 1; y += foodSpacing) {
    for (let x = 1; x < w - 1; x += foodSpacing) {
      const px = x + randInt(rng, 0, foodSpacing - 1), py = y + randInt(rng, 0, foodSpacing - 1);
      if (px >= w || py >= h) continue;
      if (rng() < 0.25 + 0.75 * depthOf(py)) add(px, py); // sparse in the shallows, rich in the deep
    }
  }
  for (let y = sharkLine; y < h - 1; y++) for (let x = 2; x < w - 2; x += 3) {
    if (terrain[y * w + x] === FLOOR && terrain[(y + 1) * w + x] !== FLOOR && rng() < 0.5) add(x, y);
  }
  // Starts: the home island's top, and the sharks' bay at the left edge, walled off by a
  // reef (below the shark line) until weather opens a channel.
  const home = isl[(nIsl - 1) >> 1], top = S - 4;
  const homeRect: Rect = { x: home.cx - 7, y: top, w: 14, h: 4 };
  const reef: number[] = [];
  for (let y = sharkLine; y < h; y++) {
    const i = y * w + reefX;
    if (terrain[i] === FLOOR) { terrain[i] = WALL; reef.push(i); }
  }
  const bayRect: Rect = { x: 1, y: sharkLine, w: bayW, h: bedMax - sharkLine };
  return { w, h, terrain, spawns, starts: [homeRect, bayRect], rooms: [], toxin: landP, toxinBy: [landP, seaP], startRealm: [0, 1], surface: S, land, sharkLine, reef, calmLine: S + Math.round(calm * (bedMax - S)) };
}

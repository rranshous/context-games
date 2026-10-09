// Boards: rooms joined by corridors, four-way mirror symmetric so every start corner is
// equally good. Everything is generated in the top-left quadrant and mirrored: 2–6 rooms
// per quadrant of mixed sizes, corridors 1–5 wide (straight or L-shaped, a spanning tree
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

const WIDTHS = [1, 2, 3, 3, 4, 5]; // corridor widths, weighted toward passable

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
      if (start) { room.x = Math.min(room.x, x0 + cw - rw); room.y = Math.min(room.y, y0 + ch - rh); }
      // Rooms on the mirror axes sometimes stretch to the axis and merge with their mirror.
      if (c === qcols - 1 && rng() < 0.25) room.w = hw - room.x;
      if (r === qrows - 1 && rng() < 0.25) room.h = hh - room.y;
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
    const cw = WIDTHS[Math.floor(rng() * WIDTHS.length)];
    if ((r1 === 0 && c1 === 0) || (r2 === 0 && c2 === 0)) startExits.push(cw);
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
  // The start room gets at least one exit a 3-row warrior can SHIFT through.
  if (!startExits.some((cw) => cw >= 3)) {
    const [r, c] = qcols > 1 ? [0, 1] : [1, 0];
    corridor(rooms[0][0], rooms[r][c], randInt(rng, 3, 5));
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
      const cw = WIDTHS[Math.floor(rng() * WIDTHS.length)];
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

  return { w, h, terrain, spawns, starts };
}

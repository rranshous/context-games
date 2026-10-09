// Board: rooms joined by corridors, four-way mirror symmetric so every start corner
// is equally good. 3×2 room layout: four corner rooms (starts) and two middle rooms.
import { makeRng, randInt } from './rng';

export const FLOOR = 0;
export const WALL = 1;

export interface Spawn { x: number; y: number; kind: 1 | 2 } // 1 = size, 2 = speed
export interface Rect { x: number; y: number; w: number; h: number }

export interface Board {
  w: number;
  h: number;
  terrain: Uint8Array;
  spawns: Spawn[];
  starts: Rect[]; // corner rooms: TL, TR, BR, BL (a 2-player match shares the top-middle room)
}

export const BOARD_W = 64;
export const BOARD_H = 40;

export function makeBoard(seed: number): Board {
  const w = BOARD_W, h = BOARD_H;
  const rng = makeRng(seed ^ 0x9e3779b9);
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

  // Top-left corner room.
  const tl: Rect = { w: randInt(rng, 15, 17), h: randInt(rng, 11, 14), x: 0, y: 0 };
  tl.x = randInt(rng, 2, 4);
  tl.y = randInt(rng, 2, 4);
  // Top-middle room, centered horizontally.
  const tmW = randInt(rng, 6, 9) * 2;
  const tm: Rect = { w: tmW, h: randInt(rng, 10, 13), x: (w - tmW) / 2, y: randInt(rng, 3, 5) };
  carve(tl);
  carve(tm);

  // Horizontal corridor TL → TM, inside both rooms' row range.
  const hcW = randInt(rng, 3, 5); // wide enough for 3-row warriors to SHIFT through
  const hLo = Math.max(tl.y, tm.y), hHi = Math.min(tl.y + tl.h, tm.y + tm.h) - hcW;
  const hcY = randInt(rng, hLo, Math.max(hLo, hHi));
  carve({ x: tl.x + tl.w, y: hcY, w: tm.x - (tl.x + tl.w), h: hcW });

  // Vertical corridors TL → BL and TM → BM (mirrored down).
  const vcW = randInt(rng, 2, 4);
  const vcX = randInt(rng, tl.x + 2, tl.x + tl.w - vcW - 2);
  carve({ x: vcX, y: tl.y + tl.h, w: vcW, h: h / 2 - (tl.y + tl.h) });
  const mcW = randInt(rng, 1, 2) * 2; // even, so it sits on the centerline
  carve({ x: (w - mcW) / 2, y: tm.y + tm.h, w: mcW, h: h / 2 - (tm.y + tm.h) });

  // Resource spawns: one size spot in each corner room (far corner from the door),
  // a speed + size pair in each middle room.
  const spawns: Spawn[] = [];
  const mirrorAll = (x: number, y: number, kind: 1 | 2) => {
    const pts = [[x, y], [w - 1 - x, y], [x, h - 1 - y], [w - 1 - x, h - 1 - y]];
    for (const [px, py] of pts) {
      if (!spawns.some((s) => s.x === px && s.y === py)) spawns.push({ x: px, y: py, kind });
    }
  };
  mirrorAll(tl.x + 1, tl.y + 1, 1);
  mirrorAll(tm.x + tm.w / 2 - 3, tm.y + Math.floor(tm.h / 2), 2);
  mirrorAll(tm.x + tm.w / 2 - 1, tm.y + 2, 1);

  const mirrorRect = (r: Rect, mx: boolean, my: boolean): Rect => ({
    x: mx ? w - r.x - r.w : r.x, y: my ? h - r.y - r.h : r.y, w: r.w, h: r.h,
  });
  const starts = [mirrorRect(tl, false, false), mirrorRect(tl, true, false), mirrorRect(tl, true, true), mirrorRect(tl, false, true)];

  return { w, h, terrain, spawns, starts };
}

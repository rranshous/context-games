// map-gen.ts — Procedural map generation with seeded RNG

import {
  type Terrain, type GoldMine,
  MAP_W, MAP_H, CASTLE_WIDTH, MINE_CAPACITY,
} from '../shared/types.js';

// --- Seeded RNG (mulberry32) ---
function mulberry32(seed: number) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GeneratedMap {
  terrain: Terrain[][];
  mines: GoldMine[];
  seed: number;
}

export function generateMap(seed?: number): GeneratedMap {
  const s = seed ?? Math.floor(Math.random() * 999999);
  const rng = mulberry32(s);

  // Init all open
  const terrain: Terrain[][] = [];
  for (let y = 0; y < MAP_H; y++) {
    terrain.push(new Array(MAP_W).fill('open'));
  }

  // Castle zones — keep clear (columns 0-CASTLE_WIDTH on each side)
  const castleMargin = CASTLE_WIDTH + 2; // extra buffer

  // --- Place walls (cliffs/rocks) ---
  // Scatter wall clusters, avoiding castle zones
  const wallClusters = 3 + Math.floor(rng() * 3); // 3-5 clusters
  for (let c = 0; c < wallClusters; c++) {
    const cx = castleMargin + Math.floor(rng() * (MAP_W - castleMargin * 2));
    const cy = 2 + Math.floor(rng() * (MAP_H - 4));
    const size = 2 + Math.floor(rng() * 3); // 2-4 tiles

    // Grow cluster organically
    const seeds: [number, number][] = [[cx, cy]];
    for (let i = 0; i < size; i++) {
      const [sx, sy] = seeds[Math.floor(rng() * seeds.length)];
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      const [dx, dy] = dirs[Math.floor(rng() * 4)];
      const nx = sx + dx;
      const ny = sy + dy;
      if (nx >= castleMargin && nx < MAP_W - castleMargin && ny >= 1 && ny < MAP_H - 1) {
        terrain[ny][nx] = 'wall';
        seeds.push([nx, ny]);
      }
    }
  }

  // --- Place forests ---
  const forestPatches = 4 + Math.floor(rng() * 4); // 4-7 patches
  for (let f = 0; f < forestPatches; f++) {
    const fx = castleMargin + Math.floor(rng() * (MAP_W - castleMargin * 2));
    const fy = 1 + Math.floor(rng() * (MAP_H - 2));
    const radius = 1 + Math.floor(rng() * 2); // 1-2 tile radius

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = fx + dx;
        const ny = fy + dy;
        if (nx >= castleMargin && nx < MAP_W - castleMargin &&
            ny >= 0 && ny < MAP_H &&
            terrain[ny][nx] === 'open' &&
            rng() < 0.7) {
          terrain[ny][nx] = 'forest';
        }
      }
    }
  }

  // --- Place hills ---
  const hillPatches = 2 + Math.floor(rng() * 3); // 2-4 patches
  for (let h = 0; h < hillPatches; h++) {
    const hx = castleMargin + Math.floor(rng() * (MAP_W - castleMargin * 2));
    const hy = 1 + Math.floor(rng() * (MAP_H - 2));
    const radius = 1 + Math.floor(rng() * 2);

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = hx + dx;
        const ny = hy + dy;
        if (nx >= castleMargin && nx < MAP_W - castleMargin &&
            ny >= 0 && ny < MAP_H &&
            terrain[ny][nx] === 'open' &&
            rng() < 0.6) {
          terrain[ny][nx] = 'hill';
        }
      }
    }
  }

  // --- Place water (small ponds) ---
  const ponds = 1 + Math.floor(rng() * 2); // 1-2 ponds
  for (let p = 0; p < ponds; p++) {
    const px = castleMargin + 2 + Math.floor(rng() * (MAP_W - castleMargin * 2 - 4));
    const py = 2 + Math.floor(rng() * (MAP_H - 4));

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = px + dx;
        const ny = py + dy;
        if (nx >= castleMargin && nx < MAP_W - castleMargin &&
            ny >= 0 && ny < MAP_H &&
            terrain[ny][nx] === 'open' &&
            rng() < 0.5) {
          terrain[ny][nx] = 'water';
        }
      }
    }
  }

  // --- Ensure paths exist ---
  // Make sure there's always a walkable path from left spawn to right spawn.
  // Simple approach: carve a path through the middle if needed.
  ensurePath(terrain, rng);

  // --- Place gold mines ---
  // Symmetrical-ish: one near each side, one near center
  const mines: GoldMine[] = [];
  let mineId = 1;

  // Center mine (contested)
  const centerMine = placeMine(terrain, rng, MAP_W / 2 - 2, MAP_W / 2 + 2, mineId++);
  if (centerMine) mines.push(centerMine);

  // Left-side mine (closer to left castle)
  const leftMine = placeMine(terrain, rng, castleMargin, MAP_W / 3, mineId++);
  if (leftMine) mines.push(leftMine);

  // Right-side mine (closer to right castle)
  const rightMine = placeMine(terrain, rng, MAP_W * 2 / 3, MAP_W - castleMargin, mineId++);
  if (rightMine) mines.push(rightMine);

  return { terrain, mines, seed: s };
}

function placeMine(
  terrain: Terrain[][],
  rng: () => number,
  minX: number, maxX: number,
  id: number
): GoldMine | null {
  // Try a few times to find an open spot
  for (let attempt = 0; attempt < 20; attempt++) {
    const x = Math.floor(minX + rng() * (maxX - minX));
    const y = 2 + Math.floor(rng() * (MAP_H - 4));
    if (terrain[y][x] === 'open') {
      // Clear a small area around the mine
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H) {
            terrain[ny][nx] = 'open';
          }
        }
      }
      return {
        id,
        x: x + 0.5,
        y: y + 0.5,
        remaining: MINE_CAPACITY,
        claimedBy: null,
        workerIds: [],
      };
    }
  }
  return null;
}

function ensurePath(terrain: Terrain[][], rng: () => number): void {
  // BFS from left spawn to right spawn
  const startX = CASTLE_WIDTH + 1;
  const endX = MAP_W - CASTLE_WIDTH - 2;
  const midY = Math.floor(MAP_H / 2);

  // Try to find a path
  if (hasPath(terrain, startX, midY, endX, midY)) return;

  // No path — carve one through the middle rows
  const carveY = midY + Math.floor((rng() - 0.5) * 4);
  const y = Math.max(1, Math.min(MAP_H - 2, carveY));
  for (let x = startX; x <= endX; x++) {
    if (!isWalkable(terrain[y][x])) {
      terrain[y][x] = 'open';
    }
    // Also clear one above or below for width
    const y2 = y + (rng() < 0.5 ? 1 : -1);
    if (y2 >= 0 && y2 < MAP_H && !isWalkable(terrain[y2][x])) {
      terrain[y2][x] = 'open';
    }
  }
}

function isWalkable(t: Terrain): boolean {
  return t !== 'wall' && t !== 'water';
}

function hasPath(terrain: Terrain[][], sx: number, sy: number, ex: number, ey: number): boolean {
  const visited = new Set<string>();
  const queue: [number, number][] = [[sx, sy]];
  visited.add(`${sx},${sy}`);

  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    if (x === ex && y === ey) return true;

    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H &&
          !visited.has(key) && isWalkable(terrain[ny][nx])) {
        visited.add(key);
        queue.push([nx, ny]);
      }
    }
  }
  return false;
}

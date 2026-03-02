// Map generation — cellular automata cave system
// Produces organic reef layout from a seeded grid

export const enum Tile {
  OPEN = 0,    // open water — passable, no cover
  WALL = 1,    // coral wall — blocks movement + LOS
  CREVICE = 2, // narrow gap — squid fits, big predators don't
  KELP = 3,    // kelp forest — passable, partial LOS cover
  DEN = 4,     // safe hideout — squid safe zone
}

export interface ReefMap {
  width: number;
  height: number;
  tiles: Tile[];
  playerSpawn: { x: number; z: number };
  dens: { x: number; z: number }[];
}

function idx(x: number, z: number, w: number): number {
  return z * w + x;
}

export function getTile(map: ReefMap, x: number, z: number): Tile {
  if (x < 0 || x >= map.width || z < 0 || z >= map.height) return Tile.WALL;
  return map.tiles[idx(x, z, map.width)];
}

export function setTile(map: ReefMap, x: number, z: number, tile: Tile) {
  if (x >= 0 && x < map.width && z >= 0 && z < map.height) {
    map.tiles[idx(x, z, map.width)] = tile;
  }
}

// Seeded RNG (same mulberry32 as main)
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Count wall neighbors in a 3x3 area (including self)
function countWallNeighbors(tiles: Tile[], x: number, z: number, w: number, h: number): number {
  let count = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nx >= w || nz < 0 || nz >= h) {
        count++; // out of bounds = wall
      } else if (tiles[idx(nx, nz, w)] === Tile.WALL) {
        count++;
      }
    }
  }
  return count;
}

// Flood fill to find connected regions
function floodFill(tiles: Tile[], x: number, z: number, w: number, h: number): Set<number> {
  const visited = new Set<number>();
  const stack = [idx(x, z, w)];
  while (stack.length > 0) {
    const i = stack.pop()!;
    if (visited.has(i)) continue;
    if (tiles[i] === Tile.WALL) continue;
    visited.add(i);
    const cx = i % w;
    const cz = Math.floor(i / w);
    if (cx > 0) stack.push(idx(cx - 1, cz, w));
    if (cx < w - 1) stack.push(idx(cx + 1, cz, w));
    if (cz > 0) stack.push(idx(cx, cz - 1, w));
    if (cz < h - 1) stack.push(idx(cx, cz + 1, w));
  }
  return visited;
}

export function generateReef(width: number, height: number, seed: number = 42): ReefMap {
  const rand = mulberry32(seed);
  const total = width * height;
  const tiles = new Array<Tile>(total);

  // Step 1: random noise — ~42% walls
  for (let i = 0; i < total; i++) {
    const x = i % width;
    const z = Math.floor(i / width);
    // Force border to be wall
    if (x === 0 || x === width - 1 || z === 0 || z === height - 1) {
      tiles[i] = Tile.WALL;
    } else {
      tiles[i] = rand() < 0.42 ? Tile.WALL : Tile.OPEN;
    }
  }

  // Step 2: cellular automata smoothing (5 iterations)
  for (let iter = 0; iter < 5; iter++) {
    const next = new Array<Tile>(total);
    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        if (x === 0 || x === width - 1 || z === 0 || z === height - 1) {
          next[idx(x, z, width)] = Tile.WALL;
        } else {
          const walls = countWallNeighbors(tiles, x, z, width, height);
          next[idx(x, z, width)] = walls >= 5 ? Tile.WALL : Tile.OPEN;
        }
      }
    }
    for (let i = 0; i < total; i++) tiles[i] = next[i];
  }

  // Step 3: ensure connectivity — keep only the largest open region, fill rest
  const cx = Math.floor(width / 2);
  const cz = Math.floor(height / 2);

  // If center is wall, find nearest open tile
  let spawnX = cx, spawnZ = cz;
  if (tiles[idx(cx, cz, width)] === Tile.WALL) {
    let found = false;
    for (let r = 1; r < Math.max(width, height) && !found; r++) {
      for (let dz = -r; dz <= r && !found; dz++) {
        for (let dx = -r; dx <= r && !found; dx++) {
          const nx = cx + dx, nz = cz + dz;
          if (nx >= 0 && nx < width && nz >= 0 && nz < height && tiles[idx(nx, nz, width)] !== Tile.WALL) {
            spawnX = nx;
            spawnZ = nz;
            found = true;
          }
        }
      }
    }
  }

  // Flood fill from spawn, find the main region
  const mainRegion = floodFill(tiles, spawnX, spawnZ, width, height);

  // Fill disconnected open areas with wall
  for (let i = 0; i < total; i++) {
    if (tiles[i] !== Tile.WALL && !mainRegion.has(i)) {
      tiles[i] = Tile.WALL;
    }
  }

  // Step 4: carve alcoves into wall edges → dens
  // Walk wall tiles bordering open space, carve 2-deep pockets, mark inner tile as DEN
  const dirs = [[0, -1], [0, 1], [1, 0], [-1, 0]] as const;
  interface AlcoveCandidate { ex: number; ez: number; dx: number; dz: number; ix: number; iz: number }
  const alcoveCandidates: AlcoveCandidate[] = [];

  for (let z = 2; z < height - 2; z++) {
    for (let x = 2; x < width - 2; x++) {
      if (tiles[idx(x, z, width)] !== Tile.WALL) continue;
      for (const [dx, dz] of dirs) {
        const ox = x + dx, oz = z + dz; // open-side neighbor
        if (ox < 1 || ox >= width - 1 || oz < 1 || oz >= height - 1) continue;
        if (tiles[idx(ox, oz, width)] !== Tile.OPEN) continue;
        // Inward direction (deeper into wall mass)
        const ix = x - dx, iz = z - dz;
        if (ix < 1 || ix >= width - 1 || iz < 1 || iz >= height - 1) continue;
        if (tiles[idx(ix, iz, width)] !== Tile.WALL) continue;
        // Check the den tile is well-enclosed: count its cardinal wall neighbors (excluding entrance direction)
        let wallCount = 0;
        for (const [ndx, ndz] of dirs) {
          const nx = ix + ndx, nz = iz + ndz;
          if (nx < 0 || nx >= width || nz < 0 || nz >= height) { wallCount++; continue; }
          if (tiles[idx(nx, nz, width)] === Tile.WALL) wallCount++;
        }
        // Den tile should have 3+ wall neighbors (the 4th side is the entrance we'll carve)
        if (wallCount >= 3) {
          alcoveCandidates.push({ ex: x, ez: z, dx, dz, ix, iz });
        }
      }
    }
  }

  // Shuffle and pick ~18 alcoves, spaced apart
  for (let i = alcoveCandidates.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [alcoveCandidates[i], alcoveCandidates[j]] = [alcoveCandidates[j], alcoveCandidates[i]];
  }

  const dens: { x: number; z: number }[] = [];
  const targetDens = 18;
  const minDenDist = 7;
  for (const c of alcoveCandidates) {
    if (dens.length >= targetDens) break;
    // Skip if too close to another den
    const tooClose = dens.some(d => Math.abs(d.x - c.ix) + Math.abs(d.z - c.iz) < minDenDist);
    if (tooClose) continue;
    // Skip if too close to spawn
    if (Math.abs(c.ix - spawnX) + Math.abs(c.iz - spawnZ) < 4) continue;
    // Carve: entrance becomes OPEN, inner tile becomes DEN
    tiles[idx(c.ex, c.ez, width)] = Tile.OPEN;
    tiles[idx(c.ix, c.iz, width)] = Tile.DEN;
    dens.push({ x: c.ix, z: c.iz });
  }

  // Step 5: identify crevices — open tiles with 2+ cardinal wall neighbors
  for (let z = 1; z < height - 1; z++) {
    for (let x = 1; x < width - 1; x++) {
      if (tiles[idx(x, z, width)] !== Tile.OPEN) continue;
      let cardinalWalls = 0;
      for (const [dx, dz] of dirs) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nx >= width || nz < 0 || nz >= height) { cardinalWalls++; continue; }
        if (tiles[idx(nx, nz, width)] === Tile.WALL) cardinalWalls++;
      }
      if (cardinalWalls >= 2) {
        tiles[idx(x, z, width)] = Tile.CREVICE;
      }
    }
  }

  // Step 7: place kelp groves — clusters in open areas away from walls
  const kelpSeeds = 6 + Math.floor(rand() * 4);
  for (let k = 0; k < kelpSeeds; k++) {
    const kx = 3 + Math.floor(rand() * (width - 6));
    const kz = 3 + Math.floor(rand() * (height - 6));
    if (tiles[idx(kx, kz, width)] !== Tile.OPEN) continue;
    // Grow a small cluster
    const size = 2 + Math.floor(rand() * 3);
    for (let dz = -size; dz <= size; dz++) {
      for (let dx = -size; dx <= size; dx++) {
        if (dx * dx + dz * dz > size * size) continue;
        const nx = kx + dx, nz = kz + dz;
        if (nx > 0 && nx < width - 1 && nz > 0 && nz < height - 1) {
          if (tiles[idx(nx, nz, width)] === Tile.OPEN && rand() < 0.6) {
            tiles[idx(nx, nz, width)] = Tile.KELP;
          }
        }
      }
    }
  }

  return {
    width,
    height,
    tiles,
    playerSpawn: { x: spawnX, z: spawnZ },
    dens,
  };
}

// Collision helpers
export function isPassable(map: ReefMap, x: number, z: number, isSmall: boolean = true): boolean {
  const tile = getTile(map, x, z);
  if (tile === Tile.WALL) return false;
  if (tile === Tile.CREVICE && !isSmall) return false;
  return true;
}

// World coords → tile coords
export function worldToTile(wx: number, wz: number, tileSize: number, mapW: number, mapH: number): { tx: number; tz: number } {
  return {
    tx: Math.floor(wx / tileSize + mapW / 2),
    tz: Math.floor(wz / tileSize + mapH / 2),
  };
}

// Tile coords → world center
export function tileToWorld(tx: number, tz: number, tileSize: number, mapW: number, mapH: number): { wx: number; wz: number } {
  return {
    wx: (tx - mapW / 2 + 0.5) * tileSize,
    wz: (tz - mapH / 2 + 0.5) * tileSize,
  };
}

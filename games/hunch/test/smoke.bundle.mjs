// src/types.ts
var WALKABLE_TILES = /* @__PURE__ */ new Set([
  0 /* ROAD */,
  2 /* ALLEY */,
  3 /* EXTRACTION */,
  4 /* SIDEWALK */,
  5 /* PARK */
]);
var DEFAULT_CONFIG = {
  tileSize: 24,
  mapCols: 40,
  mapRows: 30,
  copSpeed: 4,
  // tiles/sec (was 95 px/sec @ 24 px/tile ≈ 3.96)
  evaderSpeed: 5,
  // tiles/sec (was 120 px/sec ≈ 5.0)
  losRange: 8,
  losAngle: 60,
  survivalTime: 90,
  captureDistance: 0.75,
  // tiles — roughly 18 pixels at 24 px/tile
  viewportWidth: 320,
  viewportHeight: 240,
  tickRate: 60,
  seed: 42
};

// src/map.ts
var CITY_LAYOUT = [
  // Row 0-4: North district
  [1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 1, 1, 0, 4, 0, 1, 1, 2, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 1, 1, 0, 4, 0, 1, 1, 2, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  // Row 5-9: Upper-mid blocks
  [1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 4, 0, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1],
  [1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 0, 5, 5, 5, 0, 1, 1, 0, 4, 0, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1],
  [1, 1, 1, 0, 4, 0, 2, 2, 2, 0, 1, 1, 0, 4, 0, 1, 1, 1, 1, 0, 5, 5, 5, 0, 1, 1, 0, 4, 0, 2, 2, 0, 1, 0, 4, 0, 1, 1, 1, 1],
  [1, 1, 1, 0, 4, 0, 0, 0, 0, 0, 1, 1, 0, 4, 0, 1, 1, 1, 1, 0, 5, 5, 5, 0, 1, 1, 0, 4, 0, 0, 0, 0, 1, 0, 4, 0, 1, 1, 1, 1],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  // Row 10-14: Central district — more complex
  [1, 1, 0, 4, 0, 1, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 0, 0, 0, 4, 0, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 1],
  [1, 1, 0, 4, 0, 1, 1, 2, 1, 1, 0, 4, 0, 1, 1, 1, 0, 4, 0, 4, 0, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 0, 4, 0, 1, 1, 2, 1, 1],
  [1, 1, 0, 4, 0, 1, 1, 2, 1, 1, 0, 4, 0, 0, 0, 0, 0, 4, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 4, 0, 1, 1, 2, 1, 1],
  [1, 1, 0, 4, 0, 1, 1, 2, 0, 0, 0, 4, 0, 1, 1, 1, 0, 4, 0, 4, 0, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 0, 4, 0, 0, 0, 2, 1, 1],
  [0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0],
  // Row 15-19: South-mid district
  [1, 1, 0, 4, 0, 1, 1, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 1],
  [1, 1, 0, 4, 0, 1, 1, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 0, 4, 0, 2, 2, 2, 1, 1, 0, 4, 0, 1, 1, 1, 1, 1],
  [1, 1, 0, 4, 0, 0, 0, 0, 0, 1, 1, 0, 4, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 2, 1, 1, 0, 4, 0, 0, 0, 0, 1, 1],
  [1, 1, 0, 4, 0, 1, 1, 1, 0, 1, 1, 0, 4, 0, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 0, 4, 0, 1, 1, 2, 1, 1, 0, 4, 0, 1, 1, 0, 1, 1],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  // Row 20-24: South blocks
  [1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1],
  [1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  // Row 25-29: South edge
  [1, 1, 0, 4, 0, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 1, 0, 4, 0, 1, 1, 0, 4, 0, 1, 1, 1, 1, 0, 4, 0, 1, 1],
  [1, 1, 0, 4, 0, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 1, 0, 4, 0, 1, 1, 0, 4, 0, 1, 1, 1, 1, 0, 4, 0, 1, 1],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [1, 1, 0, 4, 0, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 0, 4, 0, 1, 1, 1, 1, 1, 0, 4, 0, 1, 1, 0, 4, 0, 1, 1, 1, 1, 0, 4, 0, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
];
var TileMap = class {
  tiles;
  cols;
  rows;
  tileSize;
  extractionPoints;
  playerSpawn;
  policeSpawns;
  constructor(config = DEFAULT_CONFIG) {
    this.tileSize = config.tileSize;
    this.cols = config.mapCols;
    this.rows = config.mapRows;
    this.tiles = CITY_LAYOUT.map((row) => row.map((t) => t));
    this.extractionPoints = [];
    this.policeSpawns = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.tiles[r][c] === 3 /* EXTRACTION */) {
          this.extractionPoints.push({ col: c, row: r });
        }
      }
    }
    this.playerSpawn = { col: 18, row: 14 };
    this.policeSpawns = [
      { col: 7, row: 0 },
      // north
      { col: 35, row: 4 },
      // east
      { col: 3, row: 24 },
      // south-west
      { col: 33, row: 24 }
      // south-east
    ];
  }
  getTile(col, row) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
      return 1 /* BUILDING */;
    }
    return this.tiles[row][col];
  }
  isWalkable(col, row) {
    return WALKABLE_TILES.has(this.getTile(col, row));
  }
  /** Check if a world-space position is walkable (for smooth movement) */
  isPositionWalkable(x, y, radius = 4) {
    const offsets = [
      { x: -radius, y: -radius },
      { x: radius, y: -radius },
      { x: -radius, y: radius },
      { x: radius, y: radius }
    ];
    for (const off of offsets) {
      const col = Math.floor((x + off.x) / this.tileSize);
      const row = Math.floor((y + off.y) / this.tileSize);
      if (!this.isWalkable(col, row)) return false;
    }
    return true;
  }
  worldToTile(pos) {
    return {
      col: Math.floor(pos.x / this.tileSize),
      row: Math.floor(pos.y / this.tileSize)
    };
  }
  tileToWorld(tile) {
    return {
      x: tile.col * this.tileSize + this.tileSize / 2,
      y: tile.row * this.tileSize + this.tileSize / 2
    };
  }
  /** A* pathfinding on tile grid */
  findPath(from, to) {
    if (!this.isWalkable(to.col, to.row)) return [];
    const key = (col, row) => `${col},${row}`;
    const startKey = key(from.col, from.row);
    const endKey = key(to.col, to.row);
    const openSet = /* @__PURE__ */ new Map();
    const cameFrom = /* @__PURE__ */ new Map();
    const gScore = /* @__PURE__ */ new Map();
    gScore.set(startKey, 0);
    const h = (c, r) => Math.abs(c - to.col) + Math.abs(r - to.row);
    openSet.set(startKey, { col: from.col, row: from.row, f: h(from.col, from.row), g: 0 });
    const neighbors = [
      { dc: 0, dr: -1 },
      { dc: 0, dr: 1 },
      { dc: -1, dr: 0 },
      { dc: 1, dr: 0 }
    ];
    let iterations = 0;
    const maxIterations = 2e3;
    while (openSet.size > 0 && iterations++ < maxIterations) {
      let bestKey = "";
      let bestF = Infinity;
      for (const [k, node] of openSet) {
        if (node.f < bestF) {
          bestF = node.f;
          bestKey = k;
        }
      }
      if (bestKey === endKey) {
        const path = [];
        let current2 = endKey;
        while (current2 !== startKey) {
          const [c, r] = current2.split(",").map(Number);
          path.unshift({ col: c, row: r });
          current2 = cameFrom.get(current2);
        }
        return path;
      }
      const current = openSet.get(bestKey);
      openSet.delete(bestKey);
      for (const n of neighbors) {
        const nc = current.col + n.dc;
        const nr = current.row + n.dr;
        if (!this.isWalkable(nc, nr)) continue;
        const nKey = key(nc, nr);
        const tentativeG = current.g + 1;
        const existingG = gScore.get(nKey);
        if (existingG === void 0 || tentativeG < existingG) {
          cameFrom.set(nKey, bestKey);
          gScore.set(nKey, tentativeG);
          openSet.set(nKey, { col: nc, row: nr, f: tentativeG + h(nc, nr), g: tentativeG });
        }
      }
    }
    return [];
  }
  /** Randomize cop spawn positions on road tiles away from evader. Deterministic via RNG. */
  randomizeCopSpawns(count, rng) {
    this.policeSpawns.length = 0;
    const minDistFromPlayer = 12;
    const minDistBetween = 8;
    const ps = this.playerSpawn;
    const candidates = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const tile = this.tiles[r][c];
        if (tile !== 0 /* ROAD */ && tile !== 4 /* SIDEWALK */) continue;
        const dist = Math.abs(c - ps.col) + Math.abs(r - ps.row);
        if (dist >= minDistFromPlayer) candidates.push({ col: c, row: r });
      }
    }
    rng.shuffle(candidates);
    for (const c of candidates) {
      if (this.policeSpawns.length >= count) break;
      const tooClose = this.policeSpawns.some(
        (p) => Math.abs(p.col - c.col) + Math.abs(p.row - c.row) < minDistBetween
      );
      if (!tooClose) this.policeSpawns.push(c);
    }
  }
  /** Randomize extraction point locations along map edges. Deterministic via RNG. */
  randomizeExtractionPoints(count, rng) {
    for (const ep of this.extractionPoints) {
      this.tiles[ep.row][ep.col] = 0 /* ROAD */;
    }
    this.extractionPoints.length = 0;
    const candidates = [];
    const edgeDepth = 2;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.tiles[r][c] !== 0 /* ROAD */) continue;
        const onEdge = r < edgeDepth || r >= this.rows - edgeDepth || c < edgeDepth || c >= this.cols - edgeDepth;
        if (onEdge) candidates.push({ col: c, row: r });
      }
    }
    const minDist = 15;
    const picked = [];
    rng.shuffle(candidates);
    for (const c of candidates) {
      if (picked.length >= count) break;
      const tooClose = picked.some(
        (p) => Math.abs(p.col - c.col) + Math.abs(p.row - c.row) < minDist
      );
      if (!tooClose) picked.push(c);
    }
    for (const p of picked) {
      this.tiles[p.row][p.col] = 3 /* EXTRACTION */;
      this.extractionPoints.push(p);
    }
  }
  /** BFS to find intersections near a center point — used for cop patrol routes. */
  generatePatrolPoints(center, count) {
    const points = [];
    const visited = /* @__PURE__ */ new Set();
    const queue = [center];
    visited.add(`${center.col},${center.row}`);
    while (queue.length > 0 && points.length < count) {
      const current = queue.shift();
      const neighbors = this.getWalkableNeighbors(current);
      if (neighbors.length >= 3) points.push(current);
      for (const n of neighbors) {
        const key = `${n.col},${n.row}`;
        if (!visited.has(key)) {
          visited.add(key);
          queue.push(n);
        }
      }
    }
    if (points.length === 0) points.push(center);
    return points;
  }
  /** Get neighbors for patrol / search pattern */
  getWalkableNeighbors(tile) {
    const neighbors = [];
    const dirs = [
      { dc: 0, dr: -1 },
      { dc: 0, dr: 1 },
      { dc: -1, dr: 0 },
      { dc: 1, dr: 0 }
    ];
    for (const d of dirs) {
      const nc = tile.col + d.dc;
      const nr = tile.row + d.dr;
      if (this.isWalkable(nc, nr)) {
        neighbors.push({ col: nc, row: nr });
      }
    }
    return neighbors;
  }
};

// src/los.ts
function hasLineOfSight(map, from, to, maxRange) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > maxRange * map.tileSize) return false;
  const steps = Math.ceil(dist / (map.tileSize * 0.4));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = from.x + dx * t;
    const y = from.y + dy * t;
    const col = Math.floor(x / map.tileSize);
    const row = Math.floor(y / map.tileSize);
    if (!map.isWalkable(col, row)) return false;
  }
  return true;
}
function isInVisionCone(from, facing, target, halfAngleDeg) {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.01) return true;
  const toDirX = dx / dist;
  const toDirY = dy / dist;
  const facingLen = Math.sqrt(facing.x * facing.x + facing.y * facing.y);
  if (facingLen < 0.01) return true;
  const facingNormX = facing.x / facingLen;
  const facingNormY = facing.y / facingLen;
  const dot = toDirX * facingNormX + toDirY * facingNormY;
  const angleRad = Math.acos(Math.max(-1, Math.min(1, dot)));
  const angleDeg = angleRad * (180 / Math.PI);
  return angleDeg <= halfAngleDeg;
}
function canSee(map, from, facing, target, range, halfAngleDeg) {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const distTiles = Math.sqrt(dx * dx + dy * dy) / map.tileSize;
  if (distTiles > range) return false;
  if (!isInVisionCone(from, facing, target, halfAngleDeg)) return false;
  return hasLineOfSight(map, from, target, range);
}

// src/coords.ts
function toTileCenter(pos, map) {
  return {
    x: pos.x / map.tileSize - map.cols / 2,
    y: pos.y / map.tileSize - map.rows / 2
  };
}
function fromTileCenter(pos, map) {
  return {
    x: (pos.x + map.cols / 2) * map.tileSize,
    y: (pos.y + map.rows / 2) * map.tileSize
  };
}

// src/rng.ts
var RNG = class _RNG {
  state;
  seed;
  constructor(seed) {
    this.seed = seed;
    this.state = seed >>> 0;
  }
  /** Next float in [0, 1) */
  next() {
    this.state = this.state + 1831565813 >>> 0;
    let t = this.state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  /** Integer in [0, n) */
  nextInt(n) {
    return Math.floor(this.next() * n);
  }
  /** Float in [min, max) */
  range(min, max) {
    return min + this.next() * (max - min);
  }
  /** Shuffle array in place (Fisher-Yates) */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  /** Pick one from array */
  pick(arr) {
    return arr[this.nextInt(arr.length)];
  }
  /** Current state — for snapshotting RNG mid-game */
  getState() {
    return this.state;
  }
  /** Restore state from snapshot */
  setState(s) {
    this.state = s >>> 0;
  }
  /** Fork: create a child RNG deterministically derived from this one */
  fork(label) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < label.length; i++) {
      h = Math.imul(h ^ label.charCodeAt(i), 16777619);
    }
    return new _RNG((this.state ^ h) >>> 0);
  }
};

// src/probes/probe-set.ts
var DEFAULT_HUNCH_VALUES = {
  threatLevel: 0.5,
  distanceUrgency: 0.5,
  terrainRead: 0.5,
  confidence: 0.5,
  readiness: 0.5
};

// src/actant.ts
function makeChassisState(rngSeed) {
  return {
    lastKnownEnemyPos: null,
    lastKnownEnemyAtTick: -1,
    currentPath: [],
    pathIndex: 0,
    currentTarget: null,
    patrolPoints: [],
    patrolIndex: 0,
    rngState: rngSeed >>> 0,
    latestActivation: null,
    latestHunch: { ...DEFAULT_HUNCH_VALUES },
    latestPriorities: null,
    lastReservoirTick: -1
  };
}

// src/actions.ts
function distance(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
function nearestEntity(from, entities) {
  if (entities.length === 0) return null;
  let best = entities[0];
  let bestD = distance(from, best.pos);
  for (let i = 1; i < entities.length; i++) {
    const d = distance(from, entities[i].pos);
    if (d < bestD) {
      bestD = d;
      best = entities[i];
    }
  }
  return best;
}
function nearestPoint(from, points) {
  if (points.length === 0) return null;
  let best = points[0];
  let bestD = distance(from, best);
  for (let i = 1; i < points.length; i++) {
    const d = distance(from, points[i]);
    if (d < bestD) {
      bestD = d;
      best = points[i];
    }
  }
  return best;
}
function directionTo(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  return { dx: dx / d, dy: dy / d };
}
var COP_ACTION_REGISTRY = [
  // ── tactical, situationally-gated ──
  {
    name: "chase_visible",
    description: "pursue the visible enemy directly",
    available: (me) => me.visibleEnemies.length > 0,
    execute: (me) => {
      const e = nearestEntity(me.pos, me.visibleEnemies);
      return { type: "moveTo", target: e.pos };
    }
  },
  {
    name: "commit_ghost",
    description: "pursue the last-known enemy position directly",
    available: (me) => me.lastKnownEnemy !== null,
    execute: (me) => ({ type: "moveTo", target: me.lastKnownEnemy })
  },
  {
    name: "intercept_extraction",
    description: "move toward the extraction point nearest the last-known enemy position",
    available: (me, world) => me.lastKnownEnemy !== null && world.extractionPoints.length > 0,
    execute: (me, world) => {
      const target = nearestPoint(me.lastKnownEnemy, world.extractionPoints);
      return { type: "moveTo", target };
    }
  },
  {
    name: "cut_off_midpoint",
    description: "move to the midpoint between the ghost and the nearest extraction",
    available: (me, world) => me.lastKnownEnemy !== null && world.extractionPoints.length > 0,
    execute: (me, world) => {
      const ghost = me.lastKnownEnemy;
      const extract = nearestPoint(ghost, world.extractionPoints);
      return { type: "moveTo", target: { x: (ghost.x + extract.x) / 2, y: (ghost.y + extract.y) / 2 } };
    }
  },
  {
    name: "guard_nearest_extraction",
    description: "move to the extraction point nearest to self",
    available: (_me, world) => world.extractionPoints.length > 0,
    execute: (me, world) => {
      const target = nearestPoint(me.pos, world.extractionPoints);
      return { type: "moveTo", target };
    }
  },
  {
    name: "converge_on_ally",
    description: "move toward the nearest visible ally (grouping behavior)",
    available: (me) => me.visibleFriends.length > 0,
    execute: (me) => {
      const ally = nearestEntity(me.pos, me.visibleFriends);
      return { type: "moveTo", target: ally.pos };
    }
  },
  {
    name: "spread_from_ally",
    description: "move away from the nearest visible ally (area coverage)",
    available: (me) => me.visibleFriends.length > 0,
    execute: (me) => {
      const ally = nearestEntity(me.pos, me.visibleFriends);
      const dir = directionTo(ally.pos, me.pos);
      return { type: "moveDir", dx: dir.dx, dy: dir.dy };
    }
  },
  // ── cardinal movement (fine-grained primitives) ──
  {
    name: "move_north",
    description: "step north",
    available: () => true,
    execute: () => ({ type: "moveDir", dx: 0, dy: -1 })
  },
  {
    name: "move_south",
    description: "step south",
    available: () => true,
    execute: () => ({ type: "moveDir", dx: 0, dy: 1 })
  },
  {
    name: "move_east",
    description: "step east",
    available: () => true,
    execute: () => ({ type: "moveDir", dx: 1, dy: 0 })
  },
  {
    name: "move_west",
    description: "step west",
    available: () => true,
    execute: () => ({ type: "moveDir", dx: -1, dy: 0 })
  },
  // ── default / fallback / state actions ──
  {
    name: "hold_position",
    description: "stop and look around",
    available: () => true,
    execute: () => ({ type: "hold" })
  },
  {
    name: "patrol_cycle",
    description: "advance along the assigned patrol route",
    available: () => true,
    execute: () => ({ type: "patrol" })
  },
  {
    name: "pursue_center",
    description: "move toward the map center",
    available: () => true,
    execute: (me) => {
      const dir = directionTo(me.pos, { x: 0, y: 0 });
      return { type: "moveDir", dx: dir.dx, dy: dir.dy };
    }
  },
  {
    name: "scatter_from_center",
    description: "move away from the map center",
    available: () => true,
    execute: (me) => {
      const dir = directionTo({ x: 0, y: 0 }, me.pos);
      return { type: "moveDir", dx: dir.dx, dy: dir.dy };
    }
  }
];
var COP_ACTION_NAMES = COP_ACTION_REGISTRY.map((a) => a.name);
var COP_ACTION_COUNT = COP_ACTION_REGISTRY.length;

// src/cops.ts
function selectCopActionIndex(me, world) {
  let bestIdx = -1;
  let bestPriority = -Infinity;
  for (let i = 0; i < COP_ACTION_REGISTRY.length; i++) {
    const action = COP_ACTION_REGISTRY[i];
    if (!action.available(me, world)) continue;
    const priority = me.priorities ? me.priorities[i] : 0.5;
    if (priority > bestPriority) {
      bestPriority = priority;
      bestIdx = i;
    }
  }
  return bestIdx;
}
var copOnTick = (me, world) => {
  const idx = selectCopActionIndex(me, world);
  if (idx < 0) return { type: "hold" };
  return COP_ACTION_REGISTRY[idx].execute(me, world);
};

// src/evaders.ts
function distance2(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
function nearestExtraction(pos, points) {
  if (points.length === 0) return null;
  let best = points[0];
  let bestD = distance2(pos, best);
  for (let i = 1; i < points.length; i++) {
    const d = distance2(pos, points[i]);
    if (d < bestD) {
      best = points[i];
      bestD = d;
    }
  }
  return best;
}
function fleeVector(me) {
  let dx = 0, dy = 0;
  for (const cop of me.visibleEnemies) {
    const rx = me.pos.x - cop.pos.x;
    const ry = me.pos.y - cop.pos.y;
    const d = Math.sqrt(rx * rx + ry * ry);
    if (d < 0.01) continue;
    const weight = 1 / (d * d + 0.1);
    dx += rx / d * weight;
    dy += ry / d * weight;
  }
  const mag = Math.sqrt(dx * dx + dy * dy);
  if (mag < 0.01) return { dx: 0, dy: 0 };
  return { dx: dx / mag, dy: dy / mag };
}
var fleeOnTick = (me, _world) => {
  if (me.visibleEnemies.length === 0) {
    return { type: "hold" };
  }
  const v = fleeVector(me);
  return { type: "moveDir", dx: v.dx, dy: v.dy };
};
function hashDir(tick, id) {
  let h = 2166136261 >>> 0;
  const s = id + ":" + tick;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  const angle = (h >>> 0) / 4294967296 * Math.PI * 2;
  return { dx: Math.cos(angle), dy: Math.sin(angle) };
}
var wanderOnTick = (me, world) => {
  const phase = Math.floor(world.tick / 15);
  const randDir = hashDir(phase, me.id);
  if (me.visibleEnemies.length > 0) {
    const flee = fleeVector(me);
    const dx = randDir.dx * 0.6 + flee.dx * 0.4;
    const dy = randDir.dy * 0.6 + flee.dy * 0.4;
    const m = Math.sqrt(dx * dx + dy * dy) || 1;
    return { type: "moveDir", dx: dx / m, dy: dy / m };
  }
  return { type: "moveDir", dx: randDir.dx, dy: randDir.dy };
};
var decoyOnTick = (me, world) => {
  const target = nearestExtraction(me.pos, world.extractionPoints);
  if (!target) return { type: "hold" };
  return { type: "moveTo", target };
};
var smartOnTick = (me, world) => {
  if (me.visibleEnemies.length > 0) {
    const flee = fleeVector(me);
    const extr = nearestExtraction(me.pos, world.extractionPoints);
    if (extr) {
      const ex = extr.x - me.pos.x;
      const ey = extr.y - me.pos.y;
      const em = Math.sqrt(ex * ex + ey * ey) || 1;
      const exN = ex / em, eyN = ey / em;
      const dx = flee.dx * 0.7 + exN * 0.3;
      const dy = flee.dy * 0.7 + eyN * 0.3;
      const m = Math.sqrt(dx * dx + dy * dy) || 1;
      return { type: "moveDir", dx: dx / m, dy: dy / m };
    }
    return { type: "moveDir", dx: flee.dx, dy: flee.dy };
  }
  const target = nearestExtraction(me.pos, world.extractionPoints);
  if (!target) return { type: "hold" };
  return { type: "moveTo", target };
};
function makeHumanOnTick(input) {
  return (_me, _world) => {
    let dx = 0, dy = 0;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    if (dx === 0 && dy === 0) return { type: "hold" };
    const m = Math.sqrt(dx * dx + dy * dy);
    return { type: "moveDir", dx: dx / m, dy: dy / m };
  };
}
var zigzagOnTick = (me, world) => {
  const target = nearestExtraction(me.pos, world.extractionPoints);
  if (!target) return { type: "hold" };
  const dx = target.x - me.pos.x;
  const dy = target.y - me.pos.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const fwdX = dx / d, fwdY = dy / d;
  const perpX = -fwdY, perpY = fwdX;
  const phase = world.tick % 40 / 40 * Math.PI * 2;
  const lateral = Math.sin(phase) * 0.7;
  const mx = fwdX + perpX * lateral;
  const my = fwdY + perpY * lateral;
  const m = Math.sqrt(mx * mx + my * my) || 1;
  return { type: "moveDir", dx: mx / m, dy: my / m };
};
var camperOnTick = (me, world) => {
  const target = nearestExtraction(me.pos, world.extractionPoints);
  if (!target) return { type: "hold" };
  const dx = target.x - me.pos.x;
  const dy = target.y - me.pos.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const LURK_RADIUS = 2.5;
  if (d > LURK_RADIUS + 0.5) {
    return { type: "moveDir", dx: dx / d, dy: dy / d };
  }
  if (d < LURK_RADIUS - 0.3) {
    return { type: "moveDir", dx: -dx / (d || 1), dy: -dy / (d || 1) };
  }
  if (me.visibleEnemies.length > 0) {
    const flee = fleeVector(me);
    return { type: "moveDir", dx: flee.dx, dy: flee.dy };
  }
  return { type: "hold" };
};
function getEvaderOnTick(flavor, input) {
  switch (flavor) {
    case "flee":
      return fleeOnTick;
    case "wander":
      return wanderOnTick;
    case "decoy":
      return decoyOnTick;
    case "smart":
      return smartOnTick;
    case "zigzag":
      return zigzagOnTick;
    case "camper":
      return camperOnTick;
    case "human":
      if (!input) throw new Error("human flavor requires InputState");
      return makeHumanOnTick(input);
  }
}

// src/reservoir/state-to-text.ts
function fmt(p) {
  return `(${p.x.toFixed(0)},${p.y.toFixed(0)})`;
}
function nearestPoint2(from, points) {
  if (points.length === 0) return null;
  let best = points[0];
  let bestD = Infinity;
  for (const p of points) {
    const dx = from.x - p.x, dy = from.y - p.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
function stateToText(me, world) {
  const parts = [];
  parts.push(`t${world.tick}.`);
  parts.push(`${me.role} at ${fmt(me.pos)}.`);
  if (me.visibleEnemies.length > 0) {
    const nearest = me.visibleEnemies.reduce((a, b) => {
      const da = (a.pos.x - me.pos.x) ** 2 + (a.pos.y - me.pos.y) ** 2;
      const db = (b.pos.x - me.pos.x) ** 2 + (b.pos.y - me.pos.y) ** 2;
      return da < db ? a : b;
    });
    parts.push(`enemy visible at ${fmt(nearest.pos)}.`);
  } else if (me.lastKnownEnemy) {
    parts.push(`enemy last seen at ${fmt(me.lastKnownEnemy)}.`);
  } else {
    parts.push("no enemy.");
  }
  const ne = nearestPoint2(me.pos, world.extractionPoints);
  if (ne) parts.push(`nearest extract ${fmt(ne)}.`);
  return parts.join(" ");
}

// src/game.ts
var Game = class {
  config;
  mode;
  map;
  rng;
  // master RNG for this round
  actants = [];
  tick = 0;
  elapsedSeconds = 0;
  startedAt = 0;
  outcome = null;
  running = false;
  accumulator = 0;
  lastFrameTime = 0;
  ticksEvaderVisible = 0;
  closestApproach = Infinity;
  snapshots = [];
  roundNumber = 1;
  opts;
  constructor(opts) {
    this.opts = opts;
    this.config = { ...DEFAULT_CONFIG, ...opts.config || {}, seed: opts.mode.seed };
    this.mode = opts.mode;
    this.rng = new RNG(this.config.seed);
    this.map = new TileMap(this.config);
    this.resetRound();
  }
  /** Reset state and spawn actants for a new round. */
  resetRound() {
    this.tick = 0;
    this.elapsedSeconds = 0;
    this.outcome = null;
    this.ticksEvaderVisible = 0;
    this.closestApproach = Infinity;
    this.snapshots = [];
    this.actants = [];
    this.rng.setState((this.config.seed ^ this.roundNumber * 2654435761) >>> 0);
    this.map.randomizeExtractionPoints(3, this.rng.fork("extractions"));
    this.map.randomizeCopSpawns(this.mode.copCount, this.rng.fork("cop-spawns"));
    const evaderSpawnTile = this.map.playerSpawn;
    const evaderPos = toTileCenter(this.map.tileToWorld(evaderSpawnTile), this.map);
    const evaderOnTick = getEvaderOnTick(this.mode.evaderFlavor, this.opts.humanInput);
    this.actants.push({
      id: "evader-0",
      role: "evader",
      flavor: "evader-" + this.mode.evaderFlavor,
      pos: evaderPos,
      facing: { x: 0, y: -1 },
      onTick: evaderOnTick,
      chassis: makeChassisState(this.rng.fork("evader-chassis").getState())
    });
    for (let i = 0; i < this.mode.copCount; i++) {
      const spawnTile = this.map.policeSpawns[i] || this.map.policeSpawns[0];
      const pos = toTileCenter(this.map.tileToWorld(spawnTile), this.map);
      const chassis = makeChassisState(this.rng.fork("cop-chassis-" + i).getState());
      chassis.patrolPoints = this.map.generatePatrolPoints(spawnTile, 6);
      this.actants.push({
        id: `cop-${i}`,
        role: "cop",
        flavor: "cop-default",
        pos,
        facing: { x: 0, y: 1 },
        onTick: copOnTick,
        chassis
      });
    }
  }
  start() {
    this.running = true;
    this.startedAt = performance.now();
    this.lastFrameTime = performance.now();
    if (this.opts.renderer) {
      requestAnimationFrame((t) => this.loop(t));
    } else {
      this.runHeadless();
    }
  }
  /** Async preTick hook — fires reservoir + probes for actants due for an update.
   *  Must be awaited before stepTick() in headless mode. In browser mode it can
   *  be fire-and-forget (stepTick will read whatever's cached). */
  async preTick() {
    if (!this.opts.reservoir || !this.opts.probeSet && !this.opts.actionProbeSet) return;
    const cadence = this.opts.reservoirCadence ?? 10;
    const nextTick = this.tick + 1;
    for (const actant of this.actants) {
      const due = nextTick % cadence === 0 || actant.chassis.lastReservoirTick < 0;
      if (!due) continue;
      const { me, world } = this.peekPerception(actant);
      const text = (this.opts.stateToTextFn ?? stateToText)(me, world);
      const activation = await this.opts.reservoir.embed(text);
      actant.chassis.latestActivation = activation;
      if (this.opts.probeSet) {
        actant.chassis.latestHunch = this.opts.probeSet.forward(activation);
      }
      if (this.opts.actionProbeSet) {
        actant.chassis.latestPriorities = this.opts.actionProbeSet.forward(activation);
      }
      actant.chassis.lastReservoirTick = nextTick;
      if (this.opts.onTrainingSample) {
        this.opts.onTrainingSample({
          roundNumber: this.roundNumber,
          tick: nextTick,
          actantId: actant.id,
          activation,
          hunch: actant.chassis.latestHunch
        });
      }
    }
  }
  /** Headless async loop: runs a round end-to-end with preTick/stepTick interleaving. */
  async runHeadlessAsync() {
    const tickDt = 1 / this.config.tickRate;
    const results = [];
    this.running = true;
    while (this.running) {
      while (this.outcome === null && this.tick < this.mode.maxTicks) {
        await this.preTick();
        this.stepTick(tickDt);
      }
      if (this.outcome === null) this.outcome = "timeout";
      const result = {
        seed: this.config.seed,
        evaderFlavor: this.mode.evaderFlavor,
        outcome: this.outcome,
        durationTicks: this.tick,
        durationSeconds: this.elapsedSeconds,
        closestApproach: this.closestApproach,
        ticksEvaderVisible: this.ticksEvaderVisible
      };
      results.push(result);
      if (this.opts.onRoundEnd) this.opts.onRoundEnd(result);
      if (this.opts.autoRestart && (!this.opts.maxRounds || this.roundNumber < this.opts.maxRounds)) {
        this.roundNumber++;
        this.resetRound();
      } else {
        this.running = false;
      }
    }
    return results;
  }
  /** Read-only perception snapshot for state-to-text — does NOT mutate chassis. */
  peekPerception(actant) {
    const evader = this.actants.find((a) => a.role === "evader");
    const cops = this.actants.filter((a) => a.role === "cop");
    const selfPixel = fromTileCenter(actant.pos, this.map);
    const visibleEnemies = [];
    const visibleFriends = [];
    if (actant.role === "cop") {
      const evaderPixel = fromTileCenter(evader.pos, this.map);
      if (canSee(this.map, selfPixel, actant.facing, evaderPixel, this.config.losRange, this.config.losAngle)) {
        visibleEnemies.push({ id: evader.id, pos: evader.pos });
      }
      for (const c of cops) {
        if (c.id === actant.id) continue;
        const cPixel = fromTileCenter(c.pos, this.map);
        if (canSee(this.map, selfPixel, actant.facing, cPixel, this.config.losRange, this.config.losAngle)) {
          visibleFriends.push({ id: c.id, pos: c.pos });
        }
      }
    } else {
      for (const c of cops) {
        const cPixel = fromTileCenter(c.pos, this.map);
        if (canSee(this.map, selfPixel, actant.facing, cPixel, this.config.losRange, this.config.losAngle)) {
          visibleEnemies.push({ id: c.id, pos: c.pos });
        }
      }
    }
    const me = {
      id: actant.id,
      role: actant.role,
      pos: actant.pos,
      facing: actant.facing,
      visibleEnemies,
      lastKnownEnemy: actant.chassis.lastKnownEnemyPos,
      visibleFriends,
      confidence: actant.chassis.latestHunch.confidence,
      readiness: actant.chassis.latestHunch.readiness,
      priorities: actant.chassis.latestPriorities
    };
    const extractionPoints = this.map.extractionPoints.map(
      (tp) => toTileCenter(this.map.tileToWorld(tp), this.map)
    );
    const world = {
      tick: this.tick,
      time: this.elapsedSeconds,
      mapCols: this.map.cols,
      mapRows: this.map.rows,
      extractionPoints,
      otherActantIds: this.actants.filter((a) => a.id !== actant.id).map((a) => a.id),
      threatLevel: actant.chassis.latestHunch.threatLevel,
      distanceUrgency: actant.chassis.latestHunch.distanceUrgency,
      terrainRead: actant.chassis.latestHunch.terrainRead
    };
    return { me, world };
  }
  stop() {
    this.running = false;
  }
  /** Main loop for windowed mode — fixed timestep. */
  loop(now) {
    if (!this.running) return;
    const frameDt = (now - this.lastFrameTime) / 1e3;
    this.lastFrameTime = now;
    this.accumulator += Math.min(frameDt, 0.1);
    const tickDt = 1 / this.config.tickRate;
    while (this.accumulator >= tickDt) {
      this.accumulator -= tickDt;
      if (this.outcome === null) {
        this.stepTick(tickDt);
      }
    }
    if (this.opts.renderer) {
      this.opts.renderer.render(this);
    }
    if (this.outcome !== null) {
      this.handleRoundEnd();
      if (!this.running) return;
    }
    requestAnimationFrame((t) => this.loop(t));
  }
  /** Headless mode: no raf, no wall clock. Runs rounds as fast as possible. */
  runHeadless() {
    const tickDt = 1 / this.config.tickRate;
    let roundsRun = 0;
    while (this.running) {
      while (this.outcome === null && this.tick < this.mode.maxTicks) {
        this.stepTick(tickDt);
      }
      if (this.outcome === null) this.outcome = "timeout";
      this.handleRoundEnd();
      roundsRun++;
      if (this.opts.maxRounds && roundsRun >= this.opts.maxRounds) {
        this.running = false;
        break;
      }
      if (!this.opts.autoRestart) {
        this.running = false;
        break;
      }
    }
  }
  /** Execute one tick: build per-actant views, call onTicks, apply movement, check outcome. */
  stepTick(dt) {
    this.tick++;
    this.elapsedSeconds = this.tick * dt;
    this.snapshots.push(this.captureSnapshot());
    const pendingActions = /* @__PURE__ */ new Map();
    for (const actant of this.actants) {
      const { me, world } = this.buildPerception(actant);
      if (actant.role === "cop" && this.opts.onActionSelection && me.priorities) {
        const idx = selectCopActionIndex(me, world);
        if (idx >= 0) {
          this.opts.onActionSelection(actant.id, this.tick, COP_ACTION_REGISTRY[idx].name, me.priorities);
        }
      }
      const action = actant.onTick(me, world);
      pendingActions.set(actant.id, action);
    }
    for (const actant of this.actants) {
      const action = pendingActions.get(actant.id);
      this.applyAction(actant, action, dt);
    }
    this.checkOutcome();
  }
  /** Build a fresh (me, world) pair from one actant's first-person perspective. */
  buildPerception(actant) {
    const evader = this.actants.find((a) => a.role === "evader");
    const cops = this.actants.filter((a) => a.role === "cop");
    const selfPixel = fromTileCenter(actant.pos, this.map);
    const visibleEnemies = [];
    const visibleFriends = [];
    if (actant.role === "cop") {
      const evaderPixel = fromTileCenter(evader.pos, this.map);
      const canSeeEvader = canSee(
        this.map,
        selfPixel,
        actant.facing,
        evaderPixel,
        this.config.losRange,
        this.config.losAngle
      );
      if (canSeeEvader) {
        visibleEnemies.push({ id: evader.id, pos: evader.pos });
        actant.chassis.lastKnownEnemyPos = { ...evader.pos };
        actant.chassis.lastKnownEnemyAtTick = this.tick;
      }
      for (const c of cops) {
        if (c.id === actant.id) continue;
        const cPixel = fromTileCenter(c.pos, this.map);
        if (canSee(this.map, selfPixel, actant.facing, cPixel, this.config.losRange, this.config.losAngle)) {
          visibleFriends.push({ id: c.id, pos: c.pos });
        }
      }
    } else {
      for (const c of cops) {
        const cPixel = fromTileCenter(c.pos, this.map);
        if (canSee(this.map, selfPixel, actant.facing, cPixel, this.config.losRange, this.config.losAngle)) {
          visibleEnemies.push({ id: c.id, pos: c.pos });
        }
      }
    }
    if (actant.chassis.lastKnownEnemyPos !== null && this.tick - actant.chassis.lastKnownEnemyAtTick > 5 * this.config.tickRate) {
      actant.chassis.lastKnownEnemyPos = null;
    }
    let threatLevel, distanceUrgency, terrainRead;
    let confidence, readiness;
    if (this.opts.reservoir && this.opts.probeSet) {
      const h = actant.chassis.latestHunch;
      threatLevel = h.threatLevel;
      distanceUrgency = h.distanceUrgency;
      terrainRead = h.terrainRead;
      confidence = h.confidence;
      readiness = h.readiness;
    } else {
      const actantRng = new RNG(actant.chassis.rngState);
      threatLevel = actantRng.next();
      distanceUrgency = actantRng.next();
      terrainRead = actantRng.next();
      confidence = actantRng.next();
      readiness = actantRng.next();
      actant.chassis.rngState = actantRng.getState();
    }
    const me = {
      id: actant.id,
      role: actant.role,
      pos: actant.pos,
      facing: actant.facing,
      visibleEnemies,
      lastKnownEnemy: actant.chassis.lastKnownEnemyPos,
      visibleFriends,
      confidence,
      readiness,
      priorities: actant.chassis.latestPriorities
    };
    const extractionPoints = this.map.extractionPoints.map(
      (tp) => toTileCenter(this.map.tileToWorld(tp), this.map)
    );
    const world = {
      tick: this.tick,
      time: this.elapsedSeconds,
      mapCols: this.map.cols,
      mapRows: this.map.rows,
      extractionPoints,
      otherActantIds: this.actants.filter((a) => a.id !== actant.id).map((a) => a.id),
      threatLevel,
      distanceUrgency,
      terrainRead
    };
    if (actant.role === "cop" && visibleEnemies.length > 0) {
      this.ticksEvaderVisible++;
    }
    return { me, world };
  }
  /** Interpret an Action as movement and update actant pos/facing + chassis state. */
  applyAction(actant, action, dt) {
    const speed = actant.role === "cop" ? this.config.copSpeed : this.config.evaderSpeed;
    const maxStep = speed * dt;
    let desiredDir = null;
    if (action.type === "moveTo") {
      const fromPixel = fromTileCenter(actant.pos, this.map);
      const toPixel = fromTileCenter(action.target, this.map);
      const fromTile = this.map.worldToTile(fromPixel);
      const toTile = this.map.worldToTile(toPixel);
      const targetChanged = !actant.chassis.currentTarget || Math.abs(actant.chassis.currentTarget.x - action.target.x) > 0.5 || Math.abs(actant.chassis.currentTarget.y - action.target.y) > 0.5;
      if (targetChanged || actant.chassis.currentPath.length === 0 || actant.chassis.pathIndex >= actant.chassis.currentPath.length) {
        actant.chassis.currentPath = this.map.findPath(fromTile, toTile);
        actant.chassis.pathIndex = 0;
        actant.chassis.currentTarget = { ...action.target };
      }
      if (actant.chassis.currentPath.length > 0 && actant.chassis.pathIndex < actant.chassis.currentPath.length) {
        const waypointTile = actant.chassis.currentPath[actant.chassis.pathIndex];
        const waypointPixel = this.map.tileToWorld(waypointTile);
        const waypointTC = toTileCenter(waypointPixel, this.map);
        const dx = waypointTC.x - actant.pos.x;
        const dy = waypointTC.y - actant.pos.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 0.15) {
          actant.chassis.pathIndex++;
        } else {
          desiredDir = { dx: dx / d, dy: dy / d };
        }
      }
    } else if (action.type === "moveDir") {
      const m = Math.sqrt(action.dx * action.dx + action.dy * action.dy);
      if (m > 0.01) desiredDir = { dx: action.dx / m, dy: action.dy / m };
    } else if (action.type === "patrol") {
      if (actant.chassis.patrolPoints.length === 0) {
        return;
      }
      const targetTile = actant.chassis.patrolPoints[actant.chassis.patrolIndex];
      const targetPixel = this.map.tileToWorld(targetTile);
      const targetTC = toTileCenter(targetPixel, this.map);
      const dx = targetTC.x - actant.pos.x;
      const dy = targetTC.y - actant.pos.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 0.5) {
        actant.chassis.patrolIndex = (actant.chassis.patrolIndex + 1) % actant.chassis.patrolPoints.length;
        actant.chassis.currentPath = [];
      } else {
        const fromTile = this.map.worldToTile(fromTileCenter(actant.pos, this.map));
        if (actant.chassis.currentPath.length === 0 || actant.chassis.pathIndex >= actant.chassis.currentPath.length) {
          actant.chassis.currentPath = this.map.findPath(fromTile, targetTile);
          actant.chassis.pathIndex = 0;
        }
        if (actant.chassis.currentPath.length > 0 && actant.chassis.pathIndex < actant.chassis.currentPath.length) {
          const wp = actant.chassis.currentPath[actant.chassis.pathIndex];
          const wpTC = toTileCenter(this.map.tileToWorld(wp), this.map);
          const wdx = wpTC.x - actant.pos.x, wdy = wpTC.y - actant.pos.y;
          const wd = Math.sqrt(wdx * wdx + wdy * wdy);
          if (wd < 0.15) actant.chassis.pathIndex++;
          else desiredDir = { dx: wdx / wd, dy: wdy / wd };
        }
      }
    }
    if (desiredDir) {
      const pixelPos = fromTileCenter(actant.pos, this.map);
      const stepPx = maxStep * this.map.tileSize;
      const nx = pixelPos.x + desiredDir.dx * stepPx;
      const ny = pixelPos.y + desiredDir.dy * stepPx;
      let newPx = pixelPos.x, newPy = pixelPos.y;
      if (this.map.isPositionWalkable(nx, pixelPos.y, 4)) newPx = nx;
      if (this.map.isPositionWalkable(newPx, ny, 4)) newPy = ny;
      actant.pos = toTileCenter({ x: newPx, y: newPy }, this.map);
      actant.facing = { x: desiredDir.dx, y: desiredDir.dy };
    }
  }
  /** Check for capture, escape, or timeout. */
  checkOutcome() {
    const evader = this.actants.find((a) => a.role === "evader");
    const evaderPixel = fromTileCenter(evader.pos, this.map);
    const evaderTile = this.map.worldToTile(evaderPixel);
    if (this.map.getTile(evaderTile.col, evaderTile.row) === 3 /* EXTRACTION */) {
      this.outcome = "escaped";
      return;
    }
    for (const cop of this.actants.filter((a) => a.role === "cop")) {
      const dx = cop.pos.x - evader.pos.x;
      const dy = cop.pos.y - evader.pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < this.closestApproach) this.closestApproach = dist;
      if (dist < this.config.captureDistance) {
        this.outcome = "captured";
        return;
      }
    }
    if (this.elapsedSeconds >= this.config.survivalTime || this.tick >= this.mode.maxTicks) {
      this.outcome = "timeout";
      return;
    }
  }
  handleRoundEnd() {
    if (this.outcome === null) return;
    const result = {
      seed: this.config.seed,
      evaderFlavor: this.mode.evaderFlavor,
      outcome: this.outcome,
      durationTicks: this.tick,
      durationSeconds: this.elapsedSeconds,
      closestApproach: this.closestApproach,
      ticksEvaderVisible: this.ticksEvaderVisible
    };
    console.log(JSON.stringify({ _hunch: "round_end", ...result, round: this.roundNumber }));
    if (this.opts.onRoundEnd) this.opts.onRoundEnd(result);
    if (this.opts.autoRestart && (!this.opts.maxRounds || this.roundNumber < this.opts.maxRounds)) {
      this.roundNumber++;
      this.resetRound();
    } else {
      this.running = false;
    }
  }
  /** Serialize current state — for replay + counterfactual Pipeline A. */
  captureSnapshot() {
    return {
      tick: this.tick,
      rngState: this.rng.getState(),
      actants: this.actants.map((a) => ({
        id: a.id,
        role: a.role,
        flavor: a.flavor,
        pos: { ...a.pos },
        facing: { ...a.facing },
        chassisRngState: a.chassis.rngState,
        lastKnownEnemyPos: a.chassis.lastKnownEnemyPos ? { ...a.chassis.lastKnownEnemyPos } : null,
        lastKnownEnemyAtTick: a.chassis.lastKnownEnemyAtTick,
        currentTarget: a.chassis.currentTarget ? { ...a.chassis.currentTarget } : null,
        patrolIndex: a.chassis.patrolIndex
      }))
    };
  }
};

// src/mode.ts
function defaultMode() {
  return {
    evaderFlavor: "flee",
    copCount: 8,
    seed: 42,
    maxTicks: 90 * 60
    // 90 seconds at 60Hz
  };
}

// test/smoke.ts
function runRound(flavor, seed) {
  const mode = defaultMode();
  mode.evaderFlavor = flavor;
  mode.seed = seed;
  const game = new Game({ mode });
  const tickDt = 1 / 60;
  while (game.outcome === null && game.tick < mode.maxTicks) {
    game.stepTick(tickDt);
  }
  if (game.outcome === null) game.outcome = "timeout";
  return game;
}
function runKey(game) {
  const parts = [`o=${game.outcome}`, `t=${game.tick}`];
  for (const a of game.actants) {
    parts.push(`${a.id}:${a.pos.x.toFixed(4)},${a.pos.y.toFixed(4)}`);
  }
  return parts.join("|");
}
var flavors = ["flee", "wander", "decoy", "smart", "zigzag", "camper"];
var seeds = [42, 1337, 9001, 7];
console.log("\u2500\u2500 Phase 1 smoke test \u2500\u2500");
console.log();
console.log("TEST 1: all flavors terminate");
for (const f of flavors) {
  const g = runRound(f, 42);
  console.log(`  ${f.padEnd(8)} seed=42 outcome=${g.outcome} ticks=${g.tick} closest=${g.closestApproach.toFixed(2)}t`);
}
console.log();
console.log("TEST 2: determinism (same seed \u2192 identical final state)");
var allDeterministic = true;
for (const f of flavors) {
  const a = runRound(f, 42);
  const b = runRound(f, 42);
  const aKey = runKey(a);
  const bKey = runKey(b);
  const match = aKey === bKey;
  if (!match) allDeterministic = false;
  console.log(`  ${f.padEnd(8)} match=${match} ${match ? "" : "\n    A: " + aKey + "\n    B: " + bKey}`);
}
console.log(allDeterministic ? "  \u2713 fully deterministic" : "  \u2717 NON-DETERMINISTIC \u2014 critical for Pipeline A");
console.log();
console.log("TEST 3: cross-seed variety (different seeds should differ)");
for (const f of flavors) {
  const runs = seeds.map((s) => runRound(f, s));
  const keys = runs.map(runKey);
  const unique = new Set(keys).size;
  console.log(`  ${f.padEnd(8)} ${seeds.length} seeds \u2192 ${unique} unique trajectories`);
}
console.log();
console.log("TEST 4: outcome distribution across seeds/flavors");
var totals = {};
for (const f of flavors) {
  totals[f] = { escaped: 0, captured: 0, timeout: 0 };
  for (const s of seeds) {
    const g = runRound(f, s);
    totals[f][g.outcome]++;
  }
}
for (const f of flavors) {
  const t = totals[f];
  console.log(`  ${f.padEnd(8)} escaped=${t.escaped} captured=${t.captured} timeout=${t.timeout}`);
}
console.log();
console.log("\u2500\u2500 smoke test done \u2500\u2500");

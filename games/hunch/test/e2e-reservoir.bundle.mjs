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

// src/probes/probe.ts
var LinearProbe = class _LinearProbe {
  name;
  inputDim;
  weights;
  // [inputDim]
  bias;
  constructor(name, inputDim, weights, bias) {
    this.name = name;
    this.inputDim = inputDim;
    this.weights = weights ?? new Float32Array(inputDim);
    this.bias = bias ?? 0;
  }
  /** Initialize weights with small random values from a seeded RNG. */
  static randomInit(name, inputDim, rng, scale = 0.01) {
    const w = new Float32Array(inputDim);
    for (let i = 0; i < inputDim; i++) {
      const u1 = Math.max(rng.next(), 1e-9);
      const u2 = rng.next();
      const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      w[i] = g * scale;
    }
    return new _LinearProbe(name, inputDim, w, 0);
  }
  /** Forward pass: sigmoid(w^T x + b). Returns scalar in (0, 1). */
  forward(x) {
    if (x.length !== this.inputDim) {
      throw new Error(`Probe ${this.name}: input dim mismatch ${x.length} vs ${this.inputDim}`);
    }
    let s = this.bias;
    for (let i = 0; i < this.inputDim; i++) s += this.weights[i] * x[i];
    return 1 / (1 + Math.exp(-s));
  }
  toJSON() {
    return {
      name: this.name,
      inputDim: this.inputDim,
      weights: Array.from(this.weights),
      bias: this.bias
    };
  }
  static fromJSON(obj) {
    return new _LinearProbe(obj.name, obj.inputDim, new Float32Array(obj.weights), obj.bias);
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
var HUNCH_NAMES = [
  "threatLevel",
  "distanceUrgency",
  "terrainRead",
  "confidence",
  "readiness"
];
var ProbeSet = class _ProbeSet {
  inputDim;
  probes;
  /** Running mean of activations — subtracted before forward pass. Optional. */
  center = null;
  constructor(inputDim, probes) {
    this.inputDim = inputDim;
    this.probes = probes;
  }
  /** Create a ProbeSet with small-random-init probes for all 5 hunch fields. */
  static randomInit(inputDim, rng) {
    const probes = {};
    for (const name of HUNCH_NAMES) {
      probes[name] = LinearProbe.randomInit(name, inputDim, rng.fork("probe-" + name));
    }
    return new _ProbeSet(inputDim, probes);
  }
  /** Run all probes over an activation vector, optionally centered. */
  forward(activation) {
    let x = activation;
    if (this.center) {
      x = new Float32Array(activation.length);
      for (let i = 0; i < activation.length; i++) x[i] = activation[i] - this.center[i];
    }
    return {
      threatLevel: this.probes.threatLevel.forward(x),
      distanceUrgency: this.probes.distanceUrgency.forward(x),
      terrainRead: this.probes.terrainRead.forward(x),
      confidence: this.probes.confidence.forward(x),
      readiness: this.probes.readiness.forward(x)
    };
  }
  toJSON() {
    return {
      inputDim: this.inputDim,
      probes: Object.fromEntries(
        Object.entries(this.probes).map(([k, p]) => [k, p.toJSON()])
      ),
      center: this.center ? Array.from(this.center) : null
    };
  }
  static fromJSON(obj) {
    const probes = {};
    for (const name of HUNCH_NAMES) {
      probes[name] = LinearProbe.fromJSON(obj.probes[name]);
    }
    const set = new _ProbeSet(obj.inputDim, probes);
    if (obj.center) set.center = new Float32Array(obj.center);
    return set;
  }
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
    lastReservoirTick: -1
  };
}

// src/cops.ts
var CONFIDENCE_CHASE_THRESHOLD = 0.4;
var copOnTick = (me, world) => {
  if (me.visibleEnemies.length > 0) {
    return { type: "moveTo", target: me.visibleEnemies[0].pos };
  }
  if (me.lastKnownEnemy !== null && me.confidence > CONFIDENCE_CHASE_THRESHOLD) {
    return { type: "moveTo", target: me.lastKnownEnemy };
  }
  return { type: "patrol" };
};

// src/evaders.ts
function distance(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
function nearestExtraction(pos, points) {
  if (points.length === 0) return null;
  let best = points[0];
  let bestD = distance(pos, best);
  for (let i = 1; i < points.length; i++) {
    const d = distance(pos, points[i]);
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
    case "human":
      if (!input) throw new Error("human flavor requires InputState");
      return makeHumanOnTick(input);
  }
}

// src/reservoir/state-to-text.ts
function fmt(p) {
  return `(${p.x.toFixed(0)},${p.y.toFixed(0)})`;
}
function nearestPoint(from, points) {
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
  const ne = nearestPoint(me.pos, world.extractionPoints);
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
    if (!this.opts.reservoir || !this.opts.probeSet) return;
    const cadence = this.opts.reservoirCadence ?? 10;
    const nextTick = this.tick + 1;
    for (const actant of this.actants) {
      const due = nextTick % cadence === 0 || actant.chassis.lastReservoirTick < 0;
      if (!due) continue;
      const { me, world } = this.peekPerception(actant);
      const text = stateToText(me, world);
      const activation = await this.opts.reservoir.embed(text);
      const hunch = this.opts.probeSet.forward(activation);
      actant.chassis.latestActivation = activation;
      actant.chassis.latestHunch = hunch;
      actant.chassis.lastReservoirTick = nextTick;
      if (this.opts.onTrainingSample) {
        this.opts.onTrainingSample({
          roundNumber: this.roundNumber,
          tick: nextTick,
          actantId: actant.id,
          activation,
          hunch
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
      readiness: actant.chassis.latestHunch.readiness
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
      readiness
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
    copCount: 4,
    seed: 42,
    maxTicks: 90 * 60
    // 90 seconds at 60Hz
  };
}

// src/reservoir/onnx-bridge.ts
var OnnxReservoirBridge = class {
  modelId;
  activationDim = 0;
  tokenizer = null;
  model = null;
  transformers = null;
  spec = null;
  cacheDir;
  constructor(modelId = "Xenova/distilgpt2", cacheDir = "./bench/models") {
    this.modelId = modelId;
    this.cacheDir = cacheDir;
  }
  async load() {
    this.transformers = await import("@huggingface/transformers");
    const { AutoTokenizer, AutoModel, env } = this.transformers;
    if (typeof process !== "undefined") {
      env.cacheDir = this.cacheDir;
      env.allowLocalModels = true;
      env.allowRemoteModels = true;
    }
    this.tokenizer = await AutoTokenizer.from_pretrained(this.modelId);
    this.model = await AutoModel.from_pretrained(this.modelId);
    const warm = await this.tokenizer("warmup", { return_tensors: "pt" });
    const out = await this.model(warm);
    this.spec = this.deriveSpec(out);
    this.activationDim = this.spec.activationDim;
  }
  async embed(text) {
    if (!this.model || !this.tokenizer || !this.spec) {
      throw new Error("OnnxReservoirBridge not loaded \u2014 call load() first");
    }
    const inputs = await this.tokenizer(text, { return_tensors: "pt" });
    const out = await this.model(inputs);
    return this.pool(out, this.spec);
  }
  /** Introspect the model output to figure out how many layers + head_dim. */
  deriveSpec(out) {
    const keys = Object.keys(out);
    let layerCount = 0;
    while (`present.${layerCount}.key` in out) layerCount++;
    if (layerCount === 0) {
      throw new Error(`No present.*.key outputs found in model. Keys: ${keys.join(",")}`);
    }
    const firstK = out["present.0.key"];
    if (!firstK.dims || firstK.dims.length !== 4) {
      throw new Error(`Unexpected key tensor shape: ${JSON.stringify(firstK.dims)}`);
    }
    const headDim = firstK.dims[3];
    const activationDim = layerCount * 2 * headDim;
    return { layerCount, headDim, activationDim };
  }
  /** Mean-pool each layer's K and V tensors across tokens + heads, concat. */
  pool(out, spec) {
    const result = new Float32Array(spec.activationDim);
    let offset = 0;
    for (let layer = 0; layer < spec.layerCount; layer++) {
      const K = out[`present.${layer}.key`];
      const V = out[`present.${layer}.value`];
      this.meanPoolTensor(K, result, offset, spec.headDim);
      offset += spec.headDim;
      this.meanPoolTensor(V, result, offset, spec.headDim);
      offset += spec.headDim;
    }
    return result;
  }
  /** Mean-pool a [1, num_heads, seq_len, head_dim] tensor to [head_dim]. */
  meanPoolTensor(t, out, offset, headDim) {
    const [, numHeads, seqLen] = t.dims;
    const data = t.data;
    for (let d = 0; d < headDim; d++) out[offset + d] = 0;
    for (let h = 0; h < numHeads; h++) {
      for (let s = 0; s < seqLen; s++) {
        const base = h * seqLen * headDim + s * headDim;
        for (let d = 0; d < headDim; d++) {
          out[offset + d] += data[base + d];
        }
      }
    }
    const n = numHeads * seqLen;
    for (let d = 0; d < headDim; d++) out[offset + d] /= n;
  }
};

// src/reservoir/bridge.ts
var NullReservoirBridge = class {
  modelId = "null";
  activationDim;
  zero;
  constructor(dim = 768) {
    this.activationDim = dim;
    this.zero = new Float32Array(dim);
  }
  async load() {
  }
  async embed(_text) {
    return this.zero;
  }
};

// test/e2e-reservoir.mjs
async function runOne(opts) {
  const game = new Game({
    mode: { ...defaultMode(), evaderFlavor: opts.flavor, seed: opts.seed, maxTicks: opts.maxTicks || 600 },
    reservoir: opts.reservoir,
    probeSet: opts.probeSet,
    reservoirCadence: opts.cadence || 10,
    onTrainingSample: opts.onSample
  });
  const t0 = Date.now();
  const results = await game.runHeadlessAsync();
  const wallMs = Date.now() - t0;
  return { game, result: results[0], wallMs };
}
function runKey(game) {
  const parts = [`o=${game.outcome}`, `t=${game.tick}`];
  for (const a of game.actants) {
    parts.push(`${a.id}:${a.pos.x.toFixed(4)},${a.pos.y.toFixed(4)}`);
  }
  return parts.join("|");
}
async function main() {
  console.log("\u2500\u2500 Phase 4 end-to-end test: reservoir + probes in game loop \u2500\u2500");
  console.log();
  const bridge = new OnnxReservoirBridge("Xenova/distilgpt2", "./bench/models");
  console.log("Loading reservoir...");
  const t0 = Date.now();
  await bridge.load();
  console.log(`  loaded  dim=${bridge.activationDim}  in ${Date.now() - t0}ms`);
  console.log();
  const rng = new RNG(123);
  const probeSet = ProbeSet.randomInit(bridge.activationDim, rng);
  console.log(`Probes initialized: ${Object.keys(probeSet.probes).join(", ")}  inputDim=${probeSet.inputDim}`);
  console.log();
  console.log("TEST 1: single round with reservoir + random probes (flee evader, seed=42, cap 600 ticks)");
  const samples = [];
  const r1 = await runOne({
    flavor: "flee",
    seed: 42,
    maxTicks: 600,
    reservoir: bridge,
    probeSet,
    cadence: 10,
    onSample: (s) => samples.push({ tick: s.tick, actantId: s.actantId, hunch: { ...s.hunch } })
  });
  console.log(`  outcome=${r1.result.outcome} ticks=${r1.result.durationTicks} closest=${r1.result.closestApproach.toFixed(2)}t`);
  console.log(`  wall time: ${r1.wallMs}ms  (${(r1.wallMs / r1.result.durationTicks).toFixed(1)}ms/tick)`);
  console.log(`  training samples collected: ${samples.length}`);
  console.log();
  console.log("TEST 2: hunch value variance across samples");
  const bySample = (name) => samples.map((s) => s.hunch[name]);
  for (const name of ["threatLevel", "distanceUrgency", "terrainRead", "confidence", "readiness"]) {
    const vals = bySample(name);
    const min = Math.min(...vals), max = Math.max(...vals);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    console.log(`  ${name.padEnd(16)} min=${min.toFixed(4)} max=${max.toFixed(4)} mean=${mean.toFixed(4)} std=${Math.sqrt(variance).toFixed(4)}`);
  }
  console.log();
  console.log("TEST 3: reservoir cadence schedule");
  const byActant = {};
  for (const s of samples) {
    if (!byActant[s.actantId]) byActant[s.actantId] = [];
    byActant[s.actantId].push(s.tick);
  }
  for (const [id, ticks] of Object.entries(byActant)) {
    const strides = ticks.slice(1).map((t, i) => t - ticks[i]);
    const uniqueStrides = [...new Set(strides)];
    console.log(`  ${id.padEnd(10)} samples=${ticks.length}  strides=${JSON.stringify(uniqueStrides)}  ticks[0..5]=${ticks.slice(0, 6).join(",")}`);
  }
  console.log();
  console.log("TEST 4: determinism \u2014 two runs with identical config should match");
  const probeSet2 = ProbeSet.randomInit(bridge.activationDim, new RNG(123));
  const a = await runOne({ flavor: "flee", seed: 42, maxTicks: 600, reservoir: bridge, probeSet: probeSet2, cadence: 10 });
  const probeSet3 = ProbeSet.randomInit(bridge.activationDim, new RNG(123));
  const b = await runOne({ flavor: "flee", seed: 42, maxTicks: 600, reservoir: bridge, probeSet: probeSet3, cadence: 10 });
  const aKey = runKey(a.game), bKey = runKey(b.game);
  console.log(`  match=${aKey === bKey}`);
  if (aKey !== bKey) {
    console.log(`  A: ${aKey}`);
    console.log(`  B: ${bKey}`);
  }
  console.log();
  console.log("TEST 5: null reservoir baseline (same shape, zero vectors \u2192 default probes from zero input)");
  const nullBridge = new NullReservoirBridge(bridge.activationDim);
  await nullBridge.load();
  const nullProbeSet = ProbeSet.randomInit(bridge.activationDim, new RNG(123));
  const nullRun = await runOne({
    flavor: "flee",
    seed: 42,
    maxTicks: 600,
    reservoir: nullBridge,
    probeSet: nullProbeSet,
    cadence: 10
  });
  console.log(`  outcome=${nullRun.result.outcome} ticks=${nullRun.result.durationTicks} wall=${nullRun.wallMs}ms`);
  console.log(`  vs real reservoir: outcome=${r1.result.outcome} ticks=${r1.result.durationTicks} wall=${r1.wallMs}ms`);
  console.log();
  console.log("\u2500\u2500 e2e test done \u2500\u2500");
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});

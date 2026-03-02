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
  playerSpeed: 120,
  policeBaseSpeed: 95,
  losRange: 8,
  losAngle: 60,
  survivalTime: 90,
  viewportWidth: 320,
  viewportHeight: 240
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
  /** Randomize police spawn positions on road tiles away from player */
  randomizePoliceSpawns(count = 4) {
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
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (const c of candidates) {
      if (this.policeSpawns.length >= count) break;
      const tooClose = this.policeSpawns.some(
        (p) => Math.abs(p.col - c.col) + Math.abs(p.row - c.row) < minDistBetween
      );
      if (!tooClose) this.policeSpawns.push(c);
    }
  }
  /** Randomize extraction point locations along map edges */
  randomizeExtractionPoints(count = 3) {
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
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
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

// src/player.ts
var Player = class {
  pos;
  facing;
  speed;
  config;
  constructor(spawnPos, config = DEFAULT_CONFIG) {
    this.pos = { ...spawnPos };
    this.facing = { x: 0, y: -1 };
    this.speed = config.playerSpeed;
    this.config = config;
  }
  update(dt, input, map) {
    let dx = 0;
    let dy = 0;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    if (dx === 0 && dy === 0) return "idle";
    const len = Math.sqrt(dx * dx + dy * dy);
    dx /= len;
    dy /= len;
    this.facing = { x: dx, y: dy };
    const moveX = dx * this.speed * dt;
    const moveY = dy * this.speed * dt;
    const newX = this.pos.x + moveX;
    const newY = this.pos.y + moveY;
    if (map.isPositionWalkable(newX, this.pos.y)) {
      this.pos.x = newX;
    }
    if (map.isPositionWalkable(this.pos.x, newY)) {
      this.pos.y = newY;
    }
    return "move";
  }
};
var InputHandler = class {
  state = {
    up: false,
    down: false,
    left: false,
    right: false,
    space: false
  };
  constructor() {
    window.addEventListener("keydown", (e) => this.onKey(e, true));
    window.addEventListener("keyup", (e) => this.onKey(e, false));
  }
  onKey(e, down) {
    switch (e.key) {
      case "ArrowUp":
      case "w":
      case "W":
        this.state.up = down;
        e.preventDefault();
        break;
      case "ArrowDown":
      case "s":
      case "S":
        this.state.down = down;
        e.preventDefault();
        break;
      case "ArrowLeft":
      case "a":
      case "A":
        this.state.left = down;
        e.preventDefault();
        break;
      case "ArrowRight":
      case "d":
      case "D":
        this.state.right = down;
        e.preventDefault();
        break;
      case " ":
        this.state.space = down;
        e.preventDefault();
        break;
    }
  }
  /** Check if any movement key is pressed */
  isMoving() {
    return this.state.up || this.state.down || this.state.left || this.state.right;
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

// src/chassis.ts
var ALLOWED_TOOLS = /* @__PURE__ */ new Set([
  "move_toward",
  "check_line_of_sight",
  "move_to_intercept",
  "hold_position",
  "map_query",
  "escape_routes_from",
  "ally_positions",
  "distance_to",
  "broadcast",
  "patrol_next",
  // Internal engine tools (prefixed with _engine_)
  "_engine_move",
  "_engine_move_direction",
  "_engine_los"
]);
function createChaseChassisAPI(entity, soma, map, config, allPolice, pendingActions, onBroadcast) {
  return {
    callTool: (name, args) => {
      if (!ALLOWED_TOOLS.has(name) && !name.startsWith("_engine_")) {
        console.log(JSON.stringify({
          _hp: "handler_violation",
          actantId: entity.id,
          tool: name,
          reason: "not_in_allowlist"
        }));
        return { success: false, error: `Tool not available: ${name}` };
      }
      const isDefaultTool = name === "move_toward" || name === "check_line_of_sight" || name === "patrol_next";
      const isEngineTool = name.startsWith("_engine_");
      if (!isDefaultTool && !isEngineTool) {
        const hasTool = soma.tools.some((t) => t.name === name);
        if (!hasTool) {
          return { success: false, error: `Tool not adopted: ${name}` };
        }
      }
      return executeToolCall(name, args || {}, entity, soma, map, config, allPolice, pendingActions, onBroadcast);
    },
    getState: () => entity.state,
    getPosition: () => ({ ...entity.pos }),
    getFacing: () => ({ ...entity.facing }),
    memory: {
      read: () => soma.memory,
      write: (_content) => {
        console.log(JSON.stringify({
          _hp: "handler_violation",
          actantId: entity.id,
          reason: "memory_write_during_chase"
        }));
      }
    },
    thinkAbout: (_thought) => {
      throw new Error("No cognition during chase. You are performing, not reasoning.");
    },
    display: (_html) => {
    }
  };
}
function executeToolCall(name, args, entity, soma, map, config, allPolice, pendingActions, onBroadcast) {
  switch (name) {
    case "move_toward": {
      const target = args.target;
      if (!target) return { success: false, error: "target required" };
      pendingActions.push({ type: "move_toward", target });
      return { success: true, data: { queued: true } };
    }
    case "move_to_intercept": {
      const target = args.target;
      const velocity = args.targetVelocity;
      if (!target) return { success: false, error: "target required" };
      pendingActions.push({
        type: "move_to_intercept",
        target,
        targetVelocity: velocity || { x: 0, y: 0 }
      });
      return { success: true, data: { queued: true } };
    }
    case "hold_position": {
      pendingActions.push({ type: "hold" });
      return { success: true };
    }
    case "patrol_next": {
      pendingActions.push({ type: "patrol_next" });
      return { success: true };
    }
    case "check_line_of_sight": {
      const target = args.target;
      if (!target) return { success: false, error: "target required" };
      const visible = canSee(
        map,
        entity.pos,
        entity.facing,
        target,
        config.losRange,
        config.losAngle
      );
      return { success: true, data: { visible } };
    }
    case "map_query": {
      const pos = args.position || entity.pos;
      const radius = args.radius || 3;
      const tile = map.worldToTile(pos);
      const terrain = [];
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const c = tile.col + dc;
          const r = tile.row + dr;
          terrain.push({ col: c, row: r, walkable: map.isWalkable(c, r) });
        }
      }
      return { success: true, data: { terrain } };
    }
    case "escape_routes_from": {
      const pos = args.position || entity.pos;
      const tile = map.worldToTile(pos);
      const neighbors = map.getWalkableNeighbors(tile);
      const routes = neighbors.map((n) => ({
        position: map.tileToWorld(n),
        tile: n
      }));
      return { success: true, data: { routes } };
    }
    case "ally_positions": {
      const allies = allPolice.filter((p) => p.id !== entity.id).map((p) => ({ id: p.id, position: { ...p.pos }, state: p.state }));
      return { success: true, data: { allies } };
    }
    case "distance_to": {
      const target = args.target;
      if (!target) return { success: false, error: "target required" };
      const dx = target.x - entity.pos.x;
      const dy = target.y - entity.pos.y;
      return { success: true, data: { distance: Math.sqrt(dx * dx + dy * dy) } };
    }
    case "broadcast": {
      const msg = {
        from: entity.id,
        fromName: soma.name,
        signalType: args.signalType,
        data: args.data || {},
        tick: 0
        // filled by game loop
      };
      console.log(JSON.stringify({
        _hp: "broadcast",
        from: entity.id,
        fromName: soma.name,
        signalType: msg.signalType,
        data: msg.data
      }));
      if (onBroadcast) {
        onBroadcast(msg);
      }
      return { success: true, data: { sent: true, recipients: allPolice.length - 1 } };
    }
    default:
      return { success: false, error: `Unknown tool: ${name}` };
  }
}

// src/handler-executor.ts
var HANDLER_TIMEOUT_MS = 50;
var handlerCache = /* @__PURE__ */ new Map();
function compileHandler(soma) {
  const cached = handlerCache.get(soma.id);
  if (cached && cached.code === soma.signalHandlers) {
    return cached.handler;
  }
  try {
    const wrappedCode = `
      ${soma.signalHandlers}
      return onSignal(type, data, me);
    `;
    const AsyncFunction = Object.getPrototypeOf(async function() {
    }).constructor;
    const fn = new AsyncFunction("type", "data", "me", wrappedCode);
    const handler = { actantId: soma.id, fn };
    handlerCache.set(soma.id, { code: soma.signalHandlers, handler });
    return handler;
  } catch (err) {
    console.log(JSON.stringify({
      _hp: "handler_compile_error",
      actantId: soma.id,
      error: String(err),
      code: soma.signalHandlers.slice(0, 200)
    }));
    return null;
  }
}
async function executeSignal(handler, signalType, signalData, entity, soma, map, config, allPolice, onBroadcast) {
  const pendingActions = [];
  const api = createChaseChassisAPI(entity, soma, map, config, allPolice, pendingActions, onBroadcast);
  try {
    const result = await Promise.race([
      handler.fn(signalType, signalData, api),
      new Promise(
        (resolve) => setTimeout(() => resolve("timeout"), HANDLER_TIMEOUT_MS)
      )
    ]);
    if (result === "timeout") {
      console.log(JSON.stringify({
        _hp: "handler_timeout",
        actantId: handler.actantId,
        signal: signalType
      }));
      return [];
    }
  } catch (err) {
    console.log(JSON.stringify({
      _hp: "handler_runtime_error",
      actantId: handler.actantId,
      signal: signalType,
      error: String(err)
    }));
    return [];
  }
  return pendingActions;
}
function clearHandlerCache() {
  handlerCache.clear();
}

// src/soma-police.ts
var busyOfficers = /* @__PURE__ */ new Set();
function createPoliceFromSoma(soma, spawn, map, config = DEFAULT_CONFIG) {
  const worldPos = map.tileToWorld(spawn);
  const patrolPoints = generatePatrolPoints(spawn, map, 6);
  return {
    id: soma.id,
    name: soma.name,
    pos: { ...worldPos },
    facing: { x: 0, y: 1 },
    speed: config.policeBaseSpeed,
    targetPos: null,
    lastKnownPlayerPos: null,
    canSeePlayer: false,
    path: [],
    pathIndex: 0,
    state: "patrol",
    patrolPoints,
    patrolIndex: 0
  };
}
function generatePatrolPoints(center, map, count) {
  const points = [];
  const visited = /* @__PURE__ */ new Set();
  const queue = [center];
  visited.add(`${center.col},${center.row}`);
  while (queue.length > 0 && points.length < count) {
    const current = queue.shift();
    const neighbors = map.getWalkableNeighbors(current);
    if (neighbors.length >= 3) {
      points.push(current);
    }
    for (const n of neighbors) {
      const key = `${n.col},${n.row}`;
      if (!visited.has(key)) {
        visited.add(key);
        queue.push(n);
      }
    }
  }
  if (points.length === 0) {
    points.push(center);
  }
  return points;
}
async function updateSomaPolice(entity, soma, playerPos, map, config, allPolice, dt, tick, radioMessages, onBroadcast) {
  if (busyOfficers.has(entity.id)) {
    moveAlongPath(entity, map, dt);
    return;
  }
  const handler = compileHandler(soma);
  if (!handler) {
    return;
  }
  const prevCanSee = entity.canSeePlayer;
  entity.canSeePlayer = canSee(
    map,
    entity.pos,
    entity.facing,
    playerPos,
    config.losRange,
    config.losAngle
  );
  busyOfficers.add(entity.id);
  try {
    let actions = [];
    if (entity.canSeePlayer && !prevCanSee) {
      entity.state = "pursuing";
      entity.lastKnownPlayerPos = { ...playerPos };
      actions = await executeSignal(
        handler,
        "player_spotted",
        {
          player_position: { ...playerPos },
          own_position: { ...entity.pos },
          map_state: { cols: map.cols, rows: map.rows, tileSize: config.tileSize }
        },
        entity,
        soma,
        map,
        config,
        allPolice,
        onBroadcast
      );
    } else if (!entity.canSeePlayer && prevCanSee) {
      entity.state = "searching";
      actions = await executeSignal(
        handler,
        "player_lost",
        {
          last_known_position: entity.lastKnownPlayerPos ? { ...entity.lastKnownPlayerPos } : { ...playerPos },
          own_position: { ...entity.pos },
          map_state: { cols: map.cols, rows: map.rows, tileSize: config.tileSize }
        },
        entity,
        soma,
        map,
        config,
        allPolice,
        onBroadcast
      );
    } else if (entity.canSeePlayer) {
      entity.lastKnownPlayerPos = { ...playerPos };
      actions = await executeSignal(
        handler,
        "player_spotted",
        {
          player_position: { ...playerPos },
          own_position: { ...entity.pos },
          map_state: { cols: map.cols, rows: map.rows, tileSize: config.tileSize }
        },
        entity,
        soma,
        map,
        config,
        allPolice,
        onBroadcast
      );
    } else if (radioMessages && radioMessages.length > 0) {
      const msg = radioMessages[radioMessages.length - 1];
      actions = await executeSignal(
        handler,
        "ally_signal",
        {
          ally_id: msg.from,
          signal_type: msg.signalType,
          signal_data: msg.data,
          own_position: { ...entity.pos },
          map_state: { cols: map.cols, rows: map.rows, tileSize: config.tileSize }
        },
        entity,
        soma,
        map,
        config,
        allPolice,
        onBroadcast
      );
      console.log(JSON.stringify({
        _hp: "radio_dispatch",
        to: entity.id,
        toName: entity.name,
        from: msg.from,
        signalType: msg.signalType,
        messageCount: radioMessages.length
      }));
    } else {
      if (entity.state === "searching" && entity.lastKnownPlayerPos) {
        const dx = entity.pos.x - entity.lastKnownPlayerPos.x;
        const dy = entity.pos.y - entity.lastKnownPlayerPos.y;
        if (Math.sqrt(dx * dx + dy * dy) < map.tileSize) {
          entity.state = "patrol";
          entity.lastKnownPlayerPos = null;
        }
      }
      actions = await executeSignal(
        handler,
        "tick",
        {
          own_position: { ...entity.pos },
          state: entity.state,
          tick,
          map_state: { cols: map.cols, rows: map.rows, tileSize: config.tileSize }
        },
        entity,
        soma,
        map,
        config,
        allPolice,
        onBroadcast
      );
    }
    applyActions(entity, actions, map, config, dt, playerPos);
  } finally {
    busyOfficers.delete(entity.id);
  }
}
function applyActions(entity, actions, map, config, dt, playerPos) {
  const action = actions[0];
  if (!action) return;
  switch (action.type) {
    case "move_toward": {
      if (!action.target) break;
      const from = map.worldToTile(entity.pos);
      const to = map.worldToTile(action.target);
      entity.path = map.findPath(from, to);
      entity.pathIndex = 0;
      moveAlongPath(entity, map, dt);
      break;
    }
    case "move_to_intercept": {
      if (!action.target) break;
      const vel = action.targetVelocity || { x: 0, y: 0 };
      const interceptTarget = {
        x: action.target.x + vel.x * 1.5,
        // look 1.5 seconds ahead
        y: action.target.y + vel.y * 1.5
      };
      const from = map.worldToTile(entity.pos);
      const to = map.worldToTile(interceptTarget);
      entity.path = map.findPath(from, to);
      entity.pathIndex = 0;
      moveAlongPath(entity, map, dt);
      break;
    }
    case "hold": {
      break;
    }
    case "patrol_next": {
      entity.patrolIndex = (entity.patrolIndex + 1) % entity.patrolPoints.length;
      const target = entity.patrolPoints[entity.patrolIndex];
      const from = map.worldToTile(entity.pos);
      entity.path = map.findPath(from, target);
      entity.pathIndex = 0;
      moveAlongPath(entity, map, dt);
      break;
    }
  }
}
function moveAlongPath(entity, map, dt) {
  if (entity.path.length === 0 || entity.pathIndex >= entity.path.length) return;
  const target = map.tileToWorld(entity.path[entity.pathIndex]);
  const dx = target.x - entity.pos.x;
  const dy = target.y - entity.pos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 2) {
    entity.pathIndex++;
    return;
  }
  const ndx = dx / dist;
  const ndy = dy / dist;
  entity.facing = { x: ndx, y: ndy };
  const step = entity.speed * dt;
  const newX = entity.pos.x + ndx * step;
  const newY = entity.pos.y + ndy * step;
  if (map.isPositionWalkable(newX, entity.pos.y, 4)) {
    entity.pos.x = newX;
  }
  if (map.isPositionWalkable(entity.pos.x, newY, 4)) {
    entity.pos.y = newY;
  }
}
function distanceToPlayer(entity, playerPos) {
  const dx = entity.pos.x - playerPos.x;
  const dy = entity.pos.y - playerPos.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// src/soma.ts
var DEFAULT_HANDLER = `
async function onSignal(type, data, me) {
  switch(type) {
    case 'tick': {
      // Patrol: move to next patrol point
      if (me.getState() === 'patrol') {
        me.callTool('patrol_next');
      }
      break;
    }
    case 'player_spotted': {
      // Chase: move directly toward player
      me.callTool('move_toward', { target: data.player_position });
      // Radio allies with sighting
      me.callTool('broadcast', { signalType: 'player_spotted', data: { position: data.player_position } });
      break;
    }
    case 'player_lost': {
      // Search: go to last known position
      me.callTool('move_toward', { target: data.last_known_position });
      break;
    }
    case 'ally_signal': {
      // Respond to ally radio \u2014 if they spotted the suspect, move toward reported position
      if (data.signal_type === 'player_spotted' && data.signal_data && data.signal_data.position) {
        me.callTool('move_toward', { target: data.signal_data.position });
      }
      break;
    }
  }
}
`;
var OFFICER_TEMPLATES = [
  {
    name: "Voss",
    nature: "Voss moves through the grid like a current through wire \u2014 always taking the shortest path, never wasting a step, arriving before you've finished deciding where to run."
  },
  {
    name: "Okafor",
    nature: "Okafor watches intersections the way a spider watches a web \u2014 still at the center, feeling for vibrations, knowing which thread to pull."
  },
  {
    name: "Tanaka",
    nature: "Tanaka doesn't pursue. Tanaka narrows. Every position Tanaka takes removes an option you thought you had."
  },
  {
    name: "Reeves",
    nature: "Reeves patrols the grid the way a hawk circles a field \u2014 patient, reading the terrain, waiting for the moment the prey commits to a direction. She doesn't chase. She arrives."
  }
];
var ALL_TOOLS = [
  {
    name: "move_toward",
    description: "Move toward a position. The most basic pursuit \u2014 go where they are.",
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "object", description: "Position {x, y} to move toward" }
      },
      required: ["target"]
    }
  },
  {
    name: "check_line_of_sight",
    description: "Look toward a position. Can you see what's there?",
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "object", description: "Position {x, y} to check" }
      },
      required: ["target"]
    }
  },
  {
    name: "move_to_intercept",
    description: "Move to where the suspect is going, not where they are.",
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "object" },
        targetVelocity: { type: "object" }
      },
      required: ["target", "targetVelocity"]
    }
  },
  {
    name: "hold_position",
    description: "Stand your ground. Sometimes the best move is not to move.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "map_query",
    description: "Study the terrain around a position. What paths exist? Where are the dead ends?",
    inputSchema: {
      type: "object",
      properties: {
        position: { type: "object" },
        radius: { type: "number" }
      },
      required: ["position"]
    }
  },
  {
    name: "escape_routes_from",
    description: "Think like the suspect \u2014 where could they run from this position?",
    inputSchema: {
      type: "object",
      properties: {
        position: { type: "object" }
      },
      required: ["position"]
    }
  },
  {
    name: "ally_positions",
    description: "Where are your fellow officers right now?",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "distance_to",
    description: "How far is a given position from you?",
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "object" }
      },
      required: ["target"]
    }
  },
  {
    name: "broadcast",
    description: "Radio all units. Share what you've seen or what you're planning.",
    inputSchema: {
      type: "object",
      properties: {
        signalType: { type: "string" },
        data: { type: "object" }
      },
      required: ["signalType", "data"]
    }
  }
];
function createDefaultSoma(index) {
  const template = OFFICER_TEMPLATES[index % OFFICER_TEMPLATES.length];
  return {
    id: `officer-${index}`,
    name: template.name,
    badgeNumber: `HPD-${String(index + 1).padStart(3, "0")}`,
    nature: template.nature,
    responsibility: "Capture the fugitive. Learn from every chase. Become harder to escape.",
    tools: [...ALL_TOOLS],
    signalHandlers: DEFAULT_HANDLER,
    memory: `Officer ${template.name} has not yet pursued anyone. No chase history.`,
    memoryMaintainer: "",
    chaseHistory: [],
    playerModel: {
      preferredRoutes: [],
      behavioralPatterns: [],
      exploitationIdeas: []
    }
  };
}

// src/persistence.ts
var STORAGE_KEY = "hot-pursuit-somas";
function saveSomas(somas) {
  try {
    const data = JSON.stringify(somas);
    localStorage.setItem(STORAGE_KEY, data);
    console.log(JSON.stringify({
      _hp: "somas_saved",
      count: somas.length,
      ids: somas.map((s) => s.id)
    }));
  } catch (err) {
    console.log(JSON.stringify({
      _hp: "somas_save_error",
      error: String(err)
    }));
  }
}
function loadSomas(count) {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(JSON.stringify({
          _hp: "somas_loaded",
          count: parsed.length,
          ids: parsed.map((s) => s.id),
          chaseHistoryLengths: parsed.map((s) => ({
            id: s.id,
            chases: s.chaseHistory.length
          }))
        }));
        while (parsed.length < count) {
          parsed.push(createDefaultSoma(parsed.length));
        }
        return parsed.slice(0, count);
      }
    }
  } catch (err) {
    console.log(JSON.stringify({
      _hp: "somas_load_error",
      error: String(err)
    }));
  }
  const defaults = Array.from({ length: count }, (_, i) => createDefaultSoma(i));
  console.log(JSON.stringify({
    _hp: "somas_created_default",
    count: defaults.length,
    ids: defaults.map((s) => s.id)
  }));
  return defaults;
}
function recordChaseInSoma(soma, entry) {
  soma.chaseHistory.push(entry);
  console.log(JSON.stringify({
    _hp: "soma_chase_recorded",
    actantId: soma.id,
    runId: entry.runId,
    outcome: entry.outcome,
    totalChases: soma.chaseHistory.length
  }));
}
function resetSomas() {
  localStorage.removeItem(STORAGE_KEY);
  console.log(JSON.stringify({
    _hp: "somas_reset"
  }));
}

// src/replay.ts
var ReplayRecorder = class {
  runId;
  startTime = 0;
  tick = 0;
  events = [];
  playerPath = [];
  actantPaths = {};
  snapshots = [];
  closestApproach = Infinity;
  timesSpotted = 0;
  timesLost = 0;
  distanceTraveled = 0;
  lastPlayerPos = null;
  snapshotInterval = 10;
  // snapshot every N ticks
  prevVisibility = /* @__PURE__ */ new Map();
  constructor(runId) {
    this.runId = runId;
  }
  start() {
    this.startTime = performance.now();
    this.tick = 0;
    this.logEvent("chase_start", void 0, {
      runId: this.runId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  recordTick(playerPos, playerAction, police) {
    this.tick++;
    if (this.tick % 3 === 0) {
      this.playerPath.push({ tick: this.tick, pos: { ...playerPos }, action: playerAction });
    }
    if (this.lastPlayerPos) {
      const dx = playerPos.x - this.lastPlayerPos.x;
      const dy = playerPos.y - this.lastPlayerPos.y;
      this.distanceTraveled += Math.sqrt(dx * dx + dy * dy);
    }
    this.lastPlayerPos = { ...playerPos };
    for (const p of police) {
      if (!this.actantPaths[p.id]) {
        this.actantPaths[p.id] = [];
      }
      if (this.tick % 3 === 0) {
        this.actantPaths[p.id].push({
          tick: this.tick,
          pos: { ...p.pos },
          state: p.state,
          canSeePlayer: p.canSeePlayer
        });
      }
      const dx = p.pos.x - playerPos.x;
      const dy = p.pos.y - playerPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < this.closestApproach) {
        this.closestApproach = dist;
      }
      const prevSaw = this.prevVisibility.get(p.id) ?? false;
      if (p.canSeePlayer && !prevSaw) {
        this.timesSpotted++;
        this.logEvent("player_spotted", p.id, {
          position: { ...playerPos },
          officerPosition: { ...p.pos }
        });
      } else if (!p.canSeePlayer && prevSaw) {
        this.timesLost++;
        this.logEvent("player_lost", p.id, {
          lastKnown: { ...playerPos },
          officerPosition: { ...p.pos }
        });
      }
      this.prevVisibility.set(p.id, p.canSeePlayer);
      if (dist < 36) {
        this.logEvent("near_capture", p.id, {
          distance: dist,
          playerPos: { ...playerPos },
          officerPos: { ...p.pos }
        });
      }
    }
    if (this.tick % this.snapshotInterval === 0) {
      this.snapshots.push({
        tick: this.tick,
        time: (performance.now() - this.startTime) / 1e3,
        playerPos: { ...playerPos },
        playerAction,
        actants: police.map((p) => ({
          id: p.id,
          pos: { ...p.pos },
          state: p.state,
          canSeePlayer: p.canSeePlayer,
          ...p.canSeePlayer ? { playerPos: { ...playerPos } } : {}
        }))
      });
    }
  }
  logEvent(type, actantId, data) {
    const event = {
      tick: this.tick,
      time: (performance.now() - this.startTime) / 1e3,
      type,
      actantId,
      data
    };
    this.events.push(event);
    console.log(JSON.stringify({
      _hp: "event",
      run: this.runId,
      ...event
    }));
  }
  finish(outcome, mapId) {
    const durationSeconds = (performance.now() - this.startTime) / 1e3;
    this.logEvent("chase_end", void 0, {
      outcome,
      durationTicks: this.tick,
      durationSeconds
    });
    const replay = {
      runId: this.runId,
      durationTicks: this.tick,
      durationSeconds,
      outcome,
      mapId,
      playerPath: this.playerPath,
      actantPaths: this.actantPaths,
      events: this.events,
      snapshots: this.snapshots,
      stats: {
        closestApproach: this.closestApproach,
        timesSpotted: this.timesSpotted,
        timesLost: this.timesLost,
        distanceTraveled: this.distanceTraveled
      }
    };
    console.log(JSON.stringify({
      _hp: "replay_summary",
      runId: this.runId,
      outcome,
      durationSeconds: Math.round(durationSeconds * 10) / 10,
      stats: replay.stats,
      eventCount: this.events.length,
      snapshotCount: this.snapshots.length
    }));
    return replay;
  }
};

// src/renderer.ts
var COLORS = {
  road: "#2a2a2a",
  roadLine: "#3a3a3a",
  building: "#1a1a2e",
  buildingEdge: "#16213e",
  alley: "#1e1e1e",
  extraction: "#0a3a0a",
  extractionGlow: "#33ff3344",
  sidewalk: "#333344",
  park: "#1a2e1a",
  parkDetail: "#224422",
  player: "#33ff33",
  playerGlow: "#33ff3366",
  police: "#ff3333",
  policeAlert: "#ff6633",
  policeSearching: "#ffaa33",
  policePatrol: "#6666aa",
  losCone: "#ff333318",
  fogOfWar: "#0a0a0aCC",
  background: "#0a0a0a",
  minimap: "#00000088",
  minimapPlayer: "#33ff33",
  minimapPolice: "#ff3333",
  minimapExtraction: "#33ff33",
  text: "#33ff33"
};
var Renderer = class {
  canvas;
  ctx;
  config;
  viewWidth;
  viewHeight;
  constructor(canvas2, config = DEFAULT_CONFIG) {
    this.canvas = canvas2;
    this.config = config;
    this.viewWidth = config.viewportWidth;
    this.viewHeight = config.viewportHeight;
    this.canvas.width = this.viewWidth;
    this.canvas.height = this.viewHeight;
    this.ctx = canvas2.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
  }
  render(map, playerPos, police, elapsedTime, runNumber) {
    const ctx = this.ctx;
    const ts = this.config.tileSize;
    const camX = playerPos.x - this.viewWidth / 2;
    const camY = playerPos.y - this.viewHeight / 2;
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);
    const startCol = Math.max(0, Math.floor(camX / ts) - 1);
    const endCol = Math.min(map.cols, Math.ceil((camX + this.viewWidth) / ts) + 1);
    const startRow = Math.max(0, Math.floor(camY / ts) - 1);
    const endRow = Math.min(map.rows, Math.ceil((camY + this.viewHeight) / ts) + 1);
    for (let r = startRow; r < endRow; r++) {
      for (let c = startCol; c < endCol; c++) {
        const tile = map.getTile(c, r);
        const sx = c * ts - camX;
        const sy = r * ts - camY;
        switch (tile) {
          case 0 /* ROAD */:
            ctx.fillStyle = COLORS.road;
            ctx.fillRect(sx, sy, ts, ts);
            if (c % 4 === 0 && r % 2 === 0) {
              ctx.fillStyle = COLORS.roadLine;
              ctx.fillRect(sx + ts / 2 - 1, sy + 2, 2, ts - 4);
            }
            break;
          case 1 /* BUILDING */:
            ctx.fillStyle = COLORS.building;
            ctx.fillRect(sx, sy, ts, ts);
            ctx.fillStyle = COLORS.buildingEdge;
            ctx.fillRect(sx, sy, ts, 2);
            ctx.fillRect(sx, sy, 2, ts);
            if ((c * 7 + r * 13) % 5 === 0) {
              ctx.fillStyle = "#ffee8833";
              ctx.fillRect(sx + 6, sy + 6, 4, 4);
            }
            if ((c * 11 + r * 3) % 7 === 0) {
              ctx.fillStyle = "#88ccff22";
              ctx.fillRect(sx + ts - 10, sy + ts - 10, 4, 4);
            }
            break;
          case 2 /* ALLEY */:
            ctx.fillStyle = COLORS.alley;
            ctx.fillRect(sx, sy, ts, ts);
            if ((c + r) % 3 === 0) {
              ctx.fillStyle = "#151515";
              ctx.fillRect(sx + 4, sy + 8, 3, 2);
            }
            break;
          case 3 /* EXTRACTION */:
            ctx.fillStyle = COLORS.extraction;
            ctx.fillRect(sx, sy, ts, ts);
            const pulse = Math.sin(elapsedTime * 3) * 0.3 + 0.7;
            ctx.fillStyle = `rgba(51, 255, 51, ${0.15 * pulse})`;
            ctx.fillRect(sx - 2, sy - 2, ts + 4, ts + 4);
            ctx.fillStyle = "#33ff33";
            ctx.fillRect(sx + ts / 2 - 2, sy + 2, 4, 4);
            ctx.fillRect(sx + ts / 2 - 4, sy + 6, 8, 2);
            break;
          case 4 /* SIDEWALK */:
            ctx.fillStyle = COLORS.sidewalk;
            ctx.fillRect(sx, sy, ts, ts);
            ctx.fillStyle = "#2a2a3a";
            ctx.fillRect(sx + ts - 1, sy, 1, ts);
            ctx.fillRect(sx, sy + ts - 1, ts, 1);
            break;
          case 5 /* PARK */:
            ctx.fillStyle = COLORS.park;
            ctx.fillRect(sx, sy, ts, ts);
            if ((c + r) % 2 === 0) {
              ctx.fillStyle = COLORS.parkDetail;
              ctx.fillRect(sx + 4, sy + 6, 2, 4);
              ctx.fillRect(sx + ts - 8, sy + 3, 2, 5);
            }
            break;
        }
      }
    }
    for (const p of police) {
      if (p.canSeePlayer) {
        this.drawLosCone(p.pos, p.facing, camX, camY);
      }
    }
    for (const p of police) {
      const sx = p.pos.x - camX;
      const sy = p.pos.y - camY;
      let color;
      switch (p.state) {
        case "pursuing":
          color = COLORS.police;
          break;
        case "searching":
          color = COLORS.policeSearching;
          break;
        default:
          color = COLORS.policePatrol;
          break;
      }
      ctx.fillStyle = color;
      ctx.fillRect(sx - 5, sy - 5, 10, 10);
      ctx.fillStyle = "#ffffff88";
      ctx.fillRect(
        sx + p.facing.x * 5 - 1.5,
        sy + p.facing.y * 5 - 1.5,
        3,
        3
      );
      if (p.state === "pursuing") {
        const alertPulse = Math.sin(elapsedTime * 8) > 0;
        if (alertPulse) {
          ctx.fillStyle = "#ff000044";
          ctx.beginPath();
          ctx.arc(sx, sy, 10, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    {
      const sx = playerPos.x - camX;
      const sy = playerPos.y - camY;
      ctx.fillStyle = COLORS.playerGlow;
      ctx.beginPath();
      ctx.arc(sx, sy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.player;
      ctx.fillRect(sx - 4, sy - 4, 8, 8);
      ctx.fillStyle = "#ffffff";
      const fx = playerPos.x + (playerPos.x !== 0 ? 0 : 0);
      ctx.fillRect(sx - 1, sy - 1, 2, 2);
    }
    this.updateHUD(runNumber, elapsedTime);
  }
  drawLosCone(pos, facing, camX, camY) {
    const ctx = this.ctx;
    const range = this.config.losRange * this.config.tileSize;
    const halfAngle = this.config.losAngle * Math.PI / 180;
    const baseAngle = Math.atan2(facing.y, facing.x);
    const sx = pos.x - camX;
    const sy = pos.y - camY;
    ctx.fillStyle = COLORS.losCone;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.arc(sx, sy, range, baseAngle - halfAngle, baseAngle + halfAngle);
    ctx.closePath();
    ctx.fill();
  }
  drawMinimap(map, playerPos, police, _camX, _camY) {
    const ctx = this.ctx;
    const mmScale = 3;
    const mmW = map.cols * mmScale;
    const mmH = map.rows * mmScale;
    const mmX = this.viewWidth - mmW - 8;
    const mmY = 8;
    ctx.fillStyle = COLORS.minimap;
    ctx.fillRect(mmX - 2, mmY - 2, mmW + 4, mmH + 4);
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        const tile = map.getTile(c, r);
        if (tile === 1 /* BUILDING */) {
          ctx.fillStyle = "#222233";
        } else if (tile === 3 /* EXTRACTION */) {
          ctx.fillStyle = COLORS.minimapExtraction;
        } else {
          ctx.fillStyle = "#111111";
        }
        ctx.fillRect(mmX + c * mmScale, mmY + r * mmScale, mmScale, mmScale);
      }
    }
    for (const p of police) {
      const px = mmX + p.pos.x / this.config.tileSize * mmScale;
      const py = mmY + p.pos.y / this.config.tileSize * mmScale;
      ctx.fillStyle = COLORS.minimapPolice;
      ctx.fillRect(px - 1, py - 1, 3, 3);
    }
    const ppx = mmX + playerPos.x / this.config.tileSize * mmScale;
    const ppy = mmY + playerPos.y / this.config.tileSize * mmScale;
    ctx.fillStyle = COLORS.minimapPlayer;
    ctx.fillRect(ppx - 1.5, ppy - 1.5, 3, 3);
  }
  updateHUD(runNumber, elapsed) {
    const statusEl = document.getElementById("hud-status");
    const timerEl = document.getElementById("hud-timer");
    if (statusEl) statusEl.textContent = `RUN: ${runNumber}`;
    if (timerEl) timerEl.textContent = `TIME: ${Math.floor(elapsed)}s`;
  }
  showGameOver(outcome, escaped) {
    const overlay = document.getElementById("game-over-overlay");
    const resultText = document.getElementById("result-text");
    if (overlay && resultText) {
      resultText.textContent = escaped ? ">> ESCAPED <<" : ">> CAPTURED <<";
      resultText.className = `result ${escaped ? "escaped" : "captured"}`;
      overlay.classList.add("visible");
      const prompt = overlay.querySelector(".prompt");
      if (prompt) prompt.textContent = "PRESS SPACE FOR DEBRIEF";
    }
  }
  hideGameOver() {
    const overlay = document.getElementById("game-over-overlay");
    if (overlay) overlay.classList.remove("visible");
  }
  // ── Reflection UI (unified live view) ──
  showReflection(_status, somas) {
    const overlay = document.getElementById("reflection-overlay");
    if (!overlay) return;
    overlay.classList.add("visible");
    const content = document.getElementById("reflection-content");
    if (content) {
      const cards = somas.map((s) => `
        <div id="reflect-card-${s.id}" class="reflection-card">
          <div class="reflection-card-header">
            <span class="reflection-card-label">${escapeHtml(s.name)}</span>
            <span id="reflect-status-${s.id}" class="reflection-card-status active">thinking...</span>
          </div>
          <div id="reflect-map-${s.id}" class="reflection-card-map"></div>
          <div id="reflect-content-${s.id}" class="reflection-card-content"></div>
        </div>
      `).join("");
      content.innerHTML = `
        <div class="reflection-title">DEBRIEF</div>
        <div class="reflection-card-grid">${cards}</div>
        <div id="reflection-done-prompt" class="reflection-prompt" style="display:none;">PRESS SPACE TO BEGIN NEXT CHASE</div>
      `;
    }
  }
  updateReflectionProgress(actantId, status, _somas, chaseMapBase64) {
    const statusEl = document.getElementById(`reflect-status-${actantId}`);
    if (statusEl) {
      if (status === "reflecting") {
        statusEl.className = "reflection-card-status active";
        statusEl.textContent = "thinking...";
      } else if (status === "sharing") {
        statusEl.className = "reflection-card-status active";
        statusEl.textContent = "sharing intel...";
      } else if (status === "complete") {
        statusEl.className = "reflection-card-status done";
        statusEl.textContent = "done";
      } else {
        statusEl.className = "reflection-card-status error";
        statusEl.textContent = "failed";
      }
    }
    const card = document.getElementById(`reflect-card-${actantId}`);
    if (card) {
      card.classList.remove("done", "error");
      if (status === "complete") card.classList.add("done");
      if (status === "failed") card.classList.add("error");
    }
    if (chaseMapBase64) {
      const mapEl = document.getElementById(`reflect-map-${actantId}`);
      if (mapEl) {
        mapEl.innerHTML = `<img src="data:image/png;base64,${chaseMapBase64}" alt="Chase map">`;
      }
    }
  }
  appendTurnContent(_update) {
  }
  setReflectionSummary(actantId, summary, fullReasoning) {
    const contentEl = document.getElementById(`reflect-content-${actantId}`);
    if (!contentEl) return;
    const summaryDiv = document.createElement("div");
    summaryDiv.className = "reflection-summary";
    summaryDiv.innerHTML = renderMarkdown(summary);
    contentEl.insertBefore(summaryDiv, contentEl.firstChild);
    if (fullReasoning.trim()) {
      const details = document.createElement("details");
      details.className = "reflection-full-reasoning";
      details.innerHTML = `<summary>full reasoning</summary><div class="reflection-reasoning-content">${renderMarkdown(fullReasoning)}</div>`;
      contentEl.appendChild(details);
    }
    const overlay = document.getElementById("reflection-overlay");
    if (overlay) overlay.scrollTop = overlay.scrollHeight;
  }
  setDebriefSummary(actantId, summary, fullReasoning) {
    const contentEl = document.getElementById(`reflect-content-${actantId}`);
    if (!contentEl) return;
    const debriefDiv = document.createElement("div");
    debriefDiv.className = "reflection-debrief-summary";
    debriefDiv.innerHTML = `<div class="debrief-label">from allies:</div>${renderMarkdown(summary)}`;
    contentEl.appendChild(debriefDiv);
    if (fullReasoning.trim()) {
      const details = document.createElement("details");
      details.className = "reflection-full-reasoning";
      details.innerHTML = `<summary>debrief reasoning</summary><div class="reflection-reasoning-content">${renderMarkdown(fullReasoning)}</div>`;
      contentEl.appendChild(details);
    }
    const overlay = document.getElementById("reflection-overlay");
    if (overlay) overlay.scrollTop = overlay.scrollHeight;
  }
  showReflectionComplete() {
    const prompt = document.getElementById("reflection-done-prompt");
    if (prompt) prompt.style.display = "";
    const overlay = document.getElementById("reflection-overlay");
    if (overlay) overlay.scrollTop = overlay.scrollHeight;
  }
  showReflectionError(error) {
    const content = document.getElementById("reflection-content");
    if (!content) return;
    content.innerHTML = `
      <div class="reflection-title">DEBRIEF FAILED</div>
      <div class="reflection-error">${escapeHtml(error.slice(0, 200))}</div>
      <div class="reflection-subtitle">Officers will use their current tactics.</div>
      <div class="reflection-prompt">PRESS SPACE TO CONTINUE</div>
    `;
  }
  hideReflection() {
    const overlay = document.getElementById("reflection-overlay");
    if (overlay) overlay.classList.remove("visible");
  }
};
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function renderMarkdown(md) {
  const escaped = escapeHtml(md);
  let html = escaped.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_m, _lang, code) => `<pre class="strategy-code">${code.trim()}</pre>`
  );
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/^### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^## (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^# (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (block) => `<ul>${block}</ul>`);
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
  html = html.replace(/\n\n+/g, "</p><p>");
  html = `<p>${html}</p>`;
  html = html.replace(/<p>\s*<\/p>/g, "");
  return html;
}

// src/chase-map-renderer.ts
var SCALE = 8;
var ALLY_COLOR = "#55aacc";
var TILE_COLORS = {
  [0 /* ROAD */]: "#2a2a2a",
  [1 /* BUILDING */]: "#1a1a2e",
  [2 /* ALLEY */]: "#1e1e1e",
  [3 /* EXTRACTION */]: "#0a3a0a",
  [4 /* SIDEWALK */]: "#333344",
  [5 /* PARK */]: "#1a2e1a"
};
var STATE_COLORS = {
  patrol: "#aa99ff",
  pursuing: "#ff4444",
  searching: "#ffcc33"
};
function drawArrow(ctx, x, y, angle, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size, -size * 0.7);
  ctx.lineTo(-size * 0.3, 0);
  ctx.lineTo(-size, size * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
function waypointAngle(points, i) {
  if (points.length < 2) return 0;
  const prev = i > 0 ? points[i - 1] : points[i];
  const next = i < points.length - 1 ? points[i + 1] : points[i];
  const ref = i > 0 ? points[i] : next;
  const from = i > 0 ? prev : points[i];
  return Math.atan2(ref.y - from.y, ref.x - from.x);
}
function renderChaseMap(tiles, cols, rows, playerWaypoints, officerWaypoints, keyMoments, tileSize, allyPaths) {
  const mapW = cols * SCALE;
  const mapH = rows * SCALE;
  const legendH = 48;
  const canvas2 = document.createElement("canvas");
  canvas2.width = mapW;
  canvas2.height = mapH + legendH;
  const ctx = canvas2.getContext("2d");
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = TILE_COLORS[tiles[r][c]] ?? "#000";
      ctx.fillRect(c * SCALE, r * SCALE, SCALE, SCALE);
    }
  }
  const toCanvas = (pos) => ({
    x: pos.x / tileSize * SCALE,
    y: pos.y / tileSize * SCALE
  });
  if (playerWaypoints.length > 0) {
    ctx.lineWidth = 3;
    ctx.globalAlpha = 1;
    for (let i = 1; i < playerWaypoints.length; i++) {
      const prev = toCanvas(playerWaypoints[i - 1].pos);
      const curr = toCanvas(playerWaypoints[i].pos);
      ctx.strokeStyle = "#33ff33";
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(curr.x, curr.y);
      ctx.stroke();
    }
    const playerCanvasPoints = playerWaypoints.map((wp) => toCanvas(wp.pos));
    for (let i = 0; i < playerCanvasPoints.length; i++) {
      const p = playerCanvasPoints[i];
      const angle = waypointAngle(playerCanvasPoints, i);
      drawArrow(ctx, p.x, p.y, angle, 5, "#33ff33");
    }
  }
  if (allyPaths) {
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    for (const ally of allyPaths) {
      if (ally.waypoints.length === 0) continue;
      for (let i = 1; i < ally.waypoints.length; i++) {
        const prev = toCanvas(ally.waypoints[i - 1].pos);
        const curr = toCanvas(ally.waypoints[i].pos);
        ctx.strokeStyle = ALLY_COLOR;
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(curr.x, curr.y);
        ctx.stroke();
      }
      const allyCanvasPoints = ally.waypoints.map((wp) => toCanvas(wp.pos));
      for (let i = 0; i < allyCanvasPoints.length; i++) {
        const p = allyCanvasPoints[i];
        const angle = waypointAngle(allyCanvasPoints, i);
        drawArrow(ctx, p.x, p.y, angle, 4, ALLY_COLOR);
      }
      const start = toCanvas(ally.waypoints[0].pos);
      ctx.fillStyle = ALLY_COLOR;
      ctx.fillRect(start.x - 2.5, start.y - 2.5, 5, 5);
      ctx.globalAlpha = 1;
      ctx.font = `${Math.max(SCALE - 1, 6)}px monospace`;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "#fff";
      ctx.fillText(ally.name, start.x + 4, start.y - 1);
      ctx.globalAlpha = 0.6;
    }
    ctx.globalAlpha = 1;
  }
  if (officerWaypoints.length > 0) {
    ctx.lineWidth = 3;
    ctx.globalAlpha = 1;
    for (let i = 1; i < officerWaypoints.length; i++) {
      const prev = toCanvas(officerWaypoints[i - 1].pos);
      const curr = toCanvas(officerWaypoints[i].pos);
      ctx.strokeStyle = STATE_COLORS[officerWaypoints[i].state] ?? "#888";
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(curr.x, curr.y);
      ctx.stroke();
    }
    const officerCanvasPoints = officerWaypoints.map((wp) => toCanvas(wp.pos));
    for (let i = 0; i < officerCanvasPoints.length; i++) {
      const p = officerCanvasPoints[i];
      const color = STATE_COLORS[officerWaypoints[i].state] ?? "#888";
      const angle = waypointAngle(officerCanvasPoints, i);
      drawArrow(ctx, p.x, p.y, angle, 5, color);
    }
  }
  ctx.font = `${Math.max(SCALE, 6)}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < keyMoments.length; i++) {
    const m = keyMoments[i];
    const pos = m.positions?.officer ?? m.positions?.player;
    if (!pos) continue;
    const p = toCanvas(pos);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, SCALE * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.fillText(String(i + 1), p.x, p.y);
  }
  if (playerWaypoints.length > 0) {
    const ps = toCanvas(playerWaypoints[0].pos);
    ctx.fillStyle = "#33ff33";
    ctx.fillRect(ps.x - 3, ps.y - 3, 6, 6);
  }
  if (officerWaypoints.length > 0) {
    const os = toCanvas(officerWaypoints[0].pos);
    ctx.fillStyle = STATE_COLORS[officerWaypoints[0].state] ?? "#888";
    ctx.fillRect(os.x - 3, os.y - 3, 6, 6);
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (tiles[r][c] === 3 /* EXTRACTION */) {
        ctx.strokeStyle = "#33ff33";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(c * SCALE + 1, r * SCALE + 1, SCALE - 2, SCALE - 2);
      }
    }
  }
  const ly = mapH + 4;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, mapH, mapW, legendH);
  ctx.font = "10px monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const items = [
    { color: "#1a1a2e", label: "Building (blocks LOS)" },
    { color: "#2a2a2a", label: "Road" },
    { color: "#1e1e1e", label: "Alley" },
    { color: "#33ff33", label: "Suspect path" },
    { color: ALLY_COLOR, label: "Ally paths" },
    { color: "#aa99ff", label: "Patrol" },
    { color: "#ff4444", label: "Pursuing" },
    { color: "#ffcc33", label: "Searching" }
  ];
  let lx = 4;
  for (const item of items) {
    ctx.fillStyle = item.color;
    ctx.fillRect(lx, ly + 2, 8, 8);
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(lx, ly + 2, 8, 8);
    ctx.fillStyle = "#999";
    ctx.fillText(item.label, lx + 11, ly + 1);
    lx += ctx.measureText(item.label).width + 18;
    if (lx > mapW - 60) {
      lx = 4;
      ctx.translate(0, 16);
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return canvas2.toDataURL("image/png").split(",")[1];
}

// src/replay-summarizer.ts
function summarizeReplayForActant(replay, soma) {
  const actantId = soma.id;
  const actantPath = replay.actantPaths[actantId] || [];
  const actantEvents = replay.events.filter((e) => e.actantId === actantId);
  let closestDist = Infinity;
  for (const snap of actantPath) {
    const nearest = findNearestPlayerPos(replay, snap.tick);
    if (nearest) {
      const dx = snap.pos.x - nearest.x;
      const dy = snap.pos.y - nearest.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < closestDist) closestDist = d;
    }
  }
  const stateBreakdown = { patrol: 0, pursuing: 0, searching: 0 };
  let prevTick = 0;
  for (const snap of actantPath) {
    const dt = (snap.tick - prevTick) / 60;
    stateBreakdown[snap.state] = (stateBreakdown[snap.state] || 0) + dt;
    prevTick = snap.tick;
  }
  let officerDistance = 0;
  for (let i = 1; i < actantPath.length; i++) {
    const dx = actantPath[i].pos.x - actantPath[i - 1].pos.x;
    const dy = actantPath[i].pos.y - actantPath[i - 1].pos.y;
    officerDistance += Math.sqrt(dx * dx + dy * dy);
  }
  const spottedPlayer = actantEvents.some((e) => e.type === "player_spotted");
  const madeCapture = replay.outcome === "captured" && actantEvents.some((e) => e.type === "near_capture");
  const keyMoments = replay.events.filter((e) => !e.actantId || e.actantId === actantId).filter((e) => e.type !== "chase_start").map((e) => ({
    tick: e.tick,
    time: e.time,
    description: describeEvent(e, actantId),
    positions: extractPositions(e)
  }));
  const playerWaypoints = replay.playerPath.filter((_, i) => i % 10 === 0).map((p) => ({ tick: p.tick, pos: p.pos }));
  const officerWaypoints = actantPath.filter((_, i) => i % 10 === 0).map((p) => ({ tick: p.tick, pos: p.pos, state: p.state }));
  const keyTicks = keyMoments.map((m) => m.tick);
  const allyPositionsAtKeyMoments = keyTicks.slice(0, 10).map((tick) => {
    const allies = [];
    for (const [id, path] of Object.entries(replay.actantPaths)) {
      if (id === actantId) continue;
      const closest = path.reduce(
        (best, p) => Math.abs(p.tick - tick) < Math.abs(best.tick - tick) ? p : best,
        path[0]
      );
      if (closest) {
        allies.push({ id, pos: closest.pos, state: closest.state });
      }
    }
    return { tick, allies };
  });
  return {
    runId: replay.runId,
    outcome: replay.outcome,
    durationSeconds: Math.round(replay.durationSeconds * 10) / 10,
    durationTicks: replay.durationTicks,
    closestApproach: replay.stats.closestApproach,
    timesSpotted: replay.stats.timesSpotted,
    timesLost: replay.stats.timesLost,
    playerDistanceTraveled: Math.round(replay.stats.distanceTraveled),
    officerSummary: {
      id: actantId,
      name: soma.name,
      spottedPlayer,
      madeCapture,
      closestDistance: Math.round(closestDist),
      distanceTraveled: Math.round(officerDistance),
      stateBreakdown: Object.fromEntries(
        Object.entries(stateBreakdown).map(([k, v]) => [k, Math.round(v * 10) / 10])
      )
    },
    keyMoments,
    playerWaypoints,
    officerWaypoints,
    allyPositionsAtKeyMoments
  };
}
function findNearestPlayerPos(replay, tick) {
  if (replay.playerPath.length === 0) return null;
  let best = replay.playerPath[0];
  for (const p of replay.playerPath) {
    if (Math.abs(p.tick - tick) < Math.abs(best.tick - tick)) {
      best = p;
    }
  }
  return best.pos;
}
function describeEvent(event, selfId) {
  const isSelf = event.actantId === selfId;
  const who = isSelf ? "You" : event.actantId || "Unknown";
  switch (event.type) {
    case "player_spotted":
      return `${who} spotted the suspect`;
    case "player_lost":
      return `${who} lost visual contact with the suspect`;
    case "near_capture":
      return `${who} nearly caught the suspect (distance: ${Math.round(event.data.distance || 0)}px)`;
    case "chase_end":
      return `Chase ended: ${event.data.outcome}`;
    default:
      return `${event.type}`;
  }
}
function extractPositions(event) {
  const result = {};
  if (event.data.playerPos) result.player = event.data.playerPos;
  if (event.data.position) result.player = event.data.position;
  if (event.data.officerPosition) result.officer = event.data.officerPosition;
  if (event.data.officerPos) result.officer = event.data.officerPos;
  if (result.player || result.officer) return result;
  return void 0;
}
function queryReplayRange(replay, actantId, startTick, endTick) {
  return {
    playerPositions: replay.playerPath.filter((p) => p.tick >= startTick && p.tick <= endTick),
    officerPositions: (replay.actantPaths[actantId] || []).filter((p) => p.tick >= startTick && p.tick <= endTick),
    events: replay.events.filter((e) => e.tick >= startTick && e.tick <= endTick)
  };
}

// src/reflection.ts
var SCAFFOLD_TOOLS = [
  {
    name: "update_signal_handlers",
    description: "Rewrite how you respond during a chase. This is your actual behavior \u2014 the code that runs when you spot the suspect, lose them, or hear from an ally. Write the full onSignal function.",
    input_schema: {
      type: "object",
      properties: {
        handlers_code: {
          type: "string",
          description: "The complete onSignal(type, data, me) function including the function declaration. Must use me.callTool() for actions."
        },
        reasoning: {
          type: "string",
          description: "Brief explanation of what you changed and why."
        }
      },
      required: ["handlers_code", "reasoning"]
    }
  },
  {
    name: "update_memory",
    description: "Update what you remember. Your memory persists across chases. Keep it focused on patterns and lessons, not raw data.",
    input_schema: {
      type: "object",
      properties: {
        memory_content: {
          type: "string",
          description: "Your updated memory. This replaces your current memory entirely."
        }
      },
      required: ["memory_content"]
    }
  },
  {
    name: "query_replay",
    description: "Look more closely at a specific moment in the chase. What happened between those ticks?",
    input_schema: {
      type: "object",
      properties: {
        start_tick: { type: "number", description: "Start tick of the range to examine." },
        end_tick: { type: "number", description: "End tick of the range to examine." }
      },
      required: ["start_tick", "end_tick"]
    }
  }
];
function buildSystemPrompt(soma) {
  return `You are Officer ${soma.name}, badge ${soma.badgeNumber}, of the Hot Pursuit Division.

<identity>
${soma.nature}
</identity>

<responsibility>
${soma.responsibility}
</responsibility>

<tools>
Your current chase tools:
${soma.tools.map((t) => `- ${t.name}: ${t.description}`).join("\n")}
</tools>

<current_signal_handlers>
This is the code that controls your behavior during chases. When you spot the suspect, lose them, or hear from an ally, this code runs.
\`\`\`javascript
${soma.signalHandlers}
\`\`\`
</current_signal_handlers>

<memory>
${soma.memory}
</memory>

<chase_history>
${soma.chaseHistory.length === 0 ? "No previous chases." : soma.chaseHistory.map(
    (h) => `Run ${h.runId}: ${h.outcome} (${Math.round(h.durationSeconds)}s) ${h.spotted ? "- spotted suspect" : ""} ${h.captured ? "- MADE CAPTURE" : ""}`
  ).join("\n")}
</chase_history>

<player_model>
Known suspect behaviors:
- Preferred routes: ${soma.playerModel.preferredRoutes.length > 0 ? soma.playerModel.preferredRoutes.join(", ") : "Unknown"}
- Behavioral patterns: ${soma.playerModel.behavioralPatterns.length > 0 ? soma.playerModel.behavioralPatterns.join(", ") : "Unknown"}
- Exploitation ideas: ${soma.playerModel.exploitationIdeas.length > 0 ? soma.playerModel.exploitationIdeas.join(", ") : "None yet"}
</player_model>

IMPORTANT: During this reflection session, you have tools to modify your own behavior. You MUST use them \u2014 thinking about improvements without calling the tools changes nothing. Your signal handler code is what runs during chases. If you don't call update_signal_handlers, your behavior stays exactly the same next chase.

Available tools during reflection:
- move_toward({target}): Move toward a position (pathfinding)
- check_line_of_sight({target}): Check if you can see a position
- patrol_next(): Move to next patrol waypoint
- hold_position(): Stay put
${soma.tools.filter((t) => t.name !== "move_toward" && t.name !== "check_line_of_sight").map((t) => `- ${t.name}: ${t.description}`).join("\n")}

When writing signal handlers, use me.callTool(name, args) for actions, me.getState() for your current state, and me.getPosition() for your position.`;
}
function buildReflectionPrompt(summary, chaseCount) {
  const isFirstChase = chaseCount <= 1;
  return `The chase is over. You're back at the precinct, replaying the night in your head.

<chase_replay>
Chase #${summary.runId} \u2014 Result: **${summary.outcome.toUpperCase()}**
Duration: ${summary.durationSeconds}s (${summary.durationTicks} ticks)

Your performance:
- ${summary.officerSummary.spottedPlayer ? "You spotted the suspect" : "You never saw the suspect"}
- ${summary.officerSummary.madeCapture ? "YOU made the capture" : "You did not make the capture"}
- Closest you got: ${summary.officerSummary.closestDistance}px
- Distance you traveled: ${summary.officerSummary.distanceTraveled}px (suspect traveled ${summary.playerDistanceTraveled}px)${summary.officerSummary.distanceTraveled < 200 ? "\n- **WARNING: You barely moved this chase! Your handler is probably NOT producing movement commands for all signal types. Check every case in your switch statement \u2014 if a case doesn't call me.callTool() with a movement action, you stand still.**" : ""}
- Time breakdown: ${Object.entries(summary.officerSummary.stateBreakdown).map(([k, v]) => `${k}: ${v}s`).join(", ")}

Overall stats:
- Suspect was spotted ${summary.timesSpotted} time(s), lost ${summary.timesLost} time(s)
- Closest any officer got: ${Math.round(summary.closestApproach)}px
- Suspect traveled ${summary.playerDistanceTraveled}px total

Key moments (numbered markers on the attached chase map):
${summary.keyMoments.map(
    (m, i) => `  ${i + 1}. [${Math.round(m.time)}s] ${m.description}`
  ).join("\n")}
</chase_replay>

The attached image is a bird's-eye view of the chase with a legend at the bottom. IMPORTANT map rules:
- Dark blue/purple rectangles = BUILDINGS. They are impassable (you cannot walk through them) and they block line of sight completely.
- Dark gray = roads, darker gray = alleys. Both are passable and do NOT block LOS.
- You can only see the suspect when there is a clear line between you and them with no buildings in the way.
- When you "lose" the suspect, it is almost always because they moved behind a building, breaking your line of sight \u2014 not because they outran you.
- Green line = suspect path. Your path is colored by state (purple=patrol, red=pursuing, orange=searching). Numbered circles mark key moments. Green squares = extraction points.
- Cyan/teal lines = your allies' paths (labeled with their names at start positions). Use these to spot coverage gaps \u2014 areas where nobody was watching.

YOUR SENSING LIMITS \u2014 this is critical:
- You have a FORWARD CONE of vision: 8 tiles range, 60\xB0 half-angle from your facing direction. You CANNOT see behind you or to your sides.
- Your facing direction is determined by your movement. Use me.getFacing() to check it.
- You are SLOWER than the suspect (${DEFAULT_CONFIG.policeBaseSpeed} vs ${DEFAULT_CONFIG.playerSpeed} px/s). You cannot simply chase them down \u2014 you must predict, cut off, or trap.
- Extraction points are randomized each chase and placed on the map edges. The suspect wins by reaching one.
- You cannot expand or improve your sensing range. Work within these limits by choosing patrol routes and facing directions strategically.

${isFirstChase ? `This was your first chase. Your default handlers are basic \u2014 move toward on sight, go to last known on lost, random patrol otherwise. There's a LOT of room to improve.` : `You've now completed ${chaseCount} chases. Review what changed since last time and whether your modifications helped.`}

Now do the following, in order:

1. **Review**: What worked? What failed? What did the suspect do that surprised you?

2. **Call update_signal_handlers**: Rewrite your onSignal function RIGHT NOW with specific improvements based on what you learned. ${isFirstChase ? "Your current handlers are naive \u2014 at minimum, add smarter search behavior when you lose the suspect instead of just walking to their last position." : "Build on your previous changes. Don't regress \u2014 keep what worked, fix what didn't."}

   Your handler receives these signals (priority order \u2014 only one fires per tick):
   - 'player_spotted': {player_position, own_position, map_state} \u2014 you can see the suspect (highest priority)
   - 'player_lost': {last_known_position, own_position, map_state} \u2014 just lost visual
   - 'ally_signal': {ally_id, signal_type, signal_data, own_position, map_state} \u2014 radio from another officer (fires instead of tick when radio arrives)
   - 'tick': {own_position, state, tick, map_state} \u2014 fires every game tick when nothing else is happening

   Available me.callTool() actions: ${[
    "move_toward({target})",
    "check_line_of_sight({target})",
    "patrol_next()",
    "hold_position()",
    "broadcast({signalType, data})",
    "ally_positions()",
    "distance_to({target})"
  ].join(", ")}

   RADIO COMMUNICATION:
   - You can call me.callTool('broadcast', {signalType: 'player_spotted', data: {position: {x, y}}}) during ANY signal handler to radio all allies.
   - Your allies receive your broadcast as an 'ally_signal' with {ally_id, signal_type, signal_data}.
   - Broadcasts are delivered on the NEXT tick (one-tick radio delay). Direct observation always takes priority \u2014 if an ally already sees the suspect, they won't process your radio.
   - Use radio to coordinate: share sightings, call for backup at chokepoints, warn allies about suspect direction.
   - Your 'ally_signal' handler case decides how you respond to radio. MAKE SURE it produces a movement action \u2014 if it doesn't call me.callTool() with a move, you'll stand still that tick.

3. **Call update_memory**: Record what you learned. Focus on patterns \u2014 "the suspect tends to..." not raw tick data.

DO NOT just describe what you would change. CALL THE TOOLS. Your written analysis means nothing if you don't call update_signal_handlers.`;
}
async function reflectActant(soma, replay, apiEndpoint, chaseMapBase64, model = "claude-sonnet-4-20250514", onTurnUpdate) {
  const result = {
    actantId: soma.id,
    success: false,
    handlersUpdated: false,
    memoryUpdated: false,
    toolsAdopted: [],
    reasoning: ""
  };
  try {
    const summary = summarizeReplayForActant(replay, soma);
    const systemPrompt = buildSystemPrompt(soma);
    const userPrompt = buildReflectionPrompt(summary, soma.chaseHistory.length);
    console.log(JSON.stringify({
      _hp: "reflection_start",
      actantId: soma.id,
      name: soma.name,
      chaseCount: soma.chaseHistory.length,
      summaryKeyMoments: summary.keyMoments.length
    }));
    let messages = [
      { role: "user", content: [
        { type: "image", source: { type: "base64", media_type: "image/png", data: chaseMapBase64 } },
        { type: "text", text: userPrompt }
      ] }
    ];
    let totalInput = 0;
    let totalOutput = 0;
    let turns = 0;
    const maxTurns = 5;
    while (turns < maxTurns) {
      turns++;
      const response = await callAnthropicAPI(apiEndpoint, {
        model,
        system: systemPrompt,
        messages,
        tools: SCAFFOLD_TOOLS,
        max_tokens: 4096
      });
      if (!response) {
        result.error = "API call failed";
        return result;
      }
      totalInput += response.usage.input_tokens;
      totalOutput += response.usage.output_tokens;
      const toolResults = [];
      let hasToolUse = false;
      let turnText = "";
      const turnToolCalls = [];
      for (const block of response.content) {
        if (block.type === "text" && block.text) {
          result.reasoning += block.text + "\n";
          turnText += block.text + "\n";
        }
        if (block.type === "tool_use" && block.name && block.input) {
          hasToolUse = true;
          const toolResult = processToolCall(
            block.name,
            block.input,
            soma,
            replay,
            result
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(toolResult)
          });
          turnToolCalls.push({
            name: block.name,
            input: block.input,
            result: toolResult
          });
        }
      }
      if (onTurnUpdate) {
        onTurnUpdate({
          actantId: soma.id,
          turnNum: turns,
          newText: turnText,
          toolCalls: turnToolCalls
        });
      }
      if (!hasToolUse || response.stop_reason === "end_turn") {
        break;
      }
      messages = [
        ...messages,
        { role: "assistant", content: response.content },
        { role: "user", content: toolResults }
      ];
    }
    result.success = true;
    result.tokenUsage = { input: totalInput, output: totalOutput };
    if (result.handlersUpdated) {
      clearHandlerCache();
    }
    console.log(JSON.stringify({
      _hp: "reflection_complete",
      actantId: soma.id,
      name: soma.name,
      handlersUpdated: result.handlersUpdated,
      memoryUpdated: result.memoryUpdated,
      toolsAdopted: result.toolsAdopted,
      turns,
      tokens: result.tokenUsage,
      handlerLength: soma.signalHandlers.length
    }));
  } catch (err) {
    result.error = String(err);
    console.log(JSON.stringify({
      _hp: "reflection_error",
      actantId: soma.id,
      error: result.error
    }));
  }
  return result;
}
async function summarizeReflection(soma, reasoning, result, apiEndpoint) {
  try {
    const changes = [
      result.handlersUpdated ? "Updated their chase behavior code" : null,
      result.memoryUpdated ? "Updated their memory" : null
    ].filter(Boolean).join(". ");
    const response = await callAnthropicAPI(apiEndpoint, {
      model: "claude-haiku-4-5-20251001",
      system: "Write concise tactical debrief summaries for police officers in a chase game. No preamble, just bullet points starting with a dash. 2-3 bullets max. Be specific about tactics, not vague.",
      messages: [{
        role: "user",
        content: `Summarize this officer's reflection in 2-3 short bullet points. What did they learn? What did they change?

Officer: ${soma.name}
Changes: ${changes || "None"}

Reflection:
${reasoning.slice(0, 3e3)}`
      }],
      max_tokens: 256
    });
    if (response?.content?.[0]?.type === "text") {
      return response.content[0].text || "";
    }
  } catch (err) {
    console.log(JSON.stringify({ _hp: "summary_error", actantId: soma.id, error: String(err) }));
  }
  return "";
}
async function summarizeDebriefSharing(soma, debriefResult, apiEndpoint) {
  try {
    const changes = [
      debriefResult.handlersUpdated ? "Updated their handler code based on ally intel" : null,
      debriefResult.memoryUpdated ? "Updated their memory with ally observations" : null
    ].filter(Boolean).join(". ");
    const response = await callAnthropicAPI(apiEndpoint, {
      model: "claude-haiku-4-5-20251001",
      system: "Write concise summaries of what a police officer learned from reviewing ally intelligence after a chase. No preamble, just bullet points starting with a dash. 1-2 bullets max. Focus on what they adopted from allies.",
      messages: [{
        role: "user",
        content: `Summarize what this officer learned from their allies in 1-2 short bullet points.

Officer: ${soma.name}
Changes: ${changes || "No changes made"}

Their reasoning:
${debriefResult.reasoning.slice(0, 2e3)}`
      }],
      max_tokens: 192
    });
    if (response?.content?.[0]?.type === "text") {
      return response.content[0].text || "";
    }
  } catch (err) {
    console.log(JSON.stringify({ _hp: "debrief_summary_error", actantId: soma.id, error: String(err) }));
  }
  return "";
}
function processToolCall(toolName, input, soma, replay, result) {
  switch (toolName) {
    case "update_signal_handlers": {
      const code = input.handlers_code;
      const reasoning = input.reasoning;
      if (!code) {
        return { success: false, error: "handlers_code is required" };
      }
      const validation = validateHandlerCode(code);
      if (!validation.valid) {
        console.log(JSON.stringify({
          _hp: "handler_validation_failed",
          actantId: soma.id,
          errors: validation.errors,
          code: code.slice(0, 300)
        }));
        return {
          success: false,
          error: `Handler validation failed: ${validation.errors.join(", ")}. Fix and try again.`
        };
      }
      soma.signalHandlers = code;
      result.handlersUpdated = true;
      console.log(JSON.stringify({
        _hp: "handlers_updated",
        actantId: soma.id,
        reasoning,
        codeLength: code.length,
        codePreview: code.slice(0, 200)
      }));
      return {
        success: true,
        data: { message: "Signal handlers updated. They will execute in the next chase." }
      };
    }
    case "update_memory": {
      const content = input.memory_content;
      if (!content) {
        return { success: false, error: "memory_content is required" };
      }
      soma.memory = content;
      result.memoryUpdated = true;
      console.log(JSON.stringify({
        _hp: "memory_updated",
        actantId: soma.id,
        memoryLength: content.length,
        memoryPreview: content.slice(0, 200)
      }));
      return {
        success: true,
        data: { message: "Memory updated." }
      };
    }
    case "query_replay": {
      const startTick = input.start_tick;
      const endTick = input.end_tick;
      if (startTick === void 0 || endTick === void 0) {
        return { success: false, error: "start_tick and end_tick are required" };
      }
      const detail = queryReplayRange(replay, soma.id, startTick, endTick);
      return { success: true, data: detail };
    }
    default:
      return { success: false, error: `Unknown reflection tool: ${toolName}` };
  }
}
var MAX_HANDLER_CODE_LENGTH = 5e4;
function validateHandlerCode(code) {
  const errors = [];
  if (code.length > MAX_HANDLER_CODE_LENGTH) {
    errors.push(`Handler code is ${code.length} chars, max is ${MAX_HANDLER_CODE_LENGTH}. Write more concise code.`);
  }
  if (!code.includes("onSignal")) {
    errors.push("Must contain an onSignal function");
  }
  if (!code.match(/(?:async\s+)?function\s+onSignal\s*\(\s*type\s*,\s*data\s*,\s*me\s*\)/)) {
    errors.push("onSignal must accept (type, data, me) parameters");
  }
  const forbidden = [
    { pattern: /\beval\s*\(/, msg: "eval() is not allowed" },
    { pattern: /\bFunction\s*\(/, msg: "Function constructor is not allowed" },
    { pattern: /\bimport\s*\(/, msg: "Dynamic import is not allowed" },
    { pattern: /\bfetch\s*\(/, msg: "fetch() is not allowed in chase handlers" },
    { pattern: /\bXMLHttpRequest\b/, msg: "XMLHttpRequest is not allowed" },
    { pattern: /\bwindow\b/, msg: "window access is not allowed" },
    { pattern: /\bdocument\b/, msg: "document access is not allowed" },
    { pattern: /\bglobalThis\b/, msg: "globalThis access is not allowed" }
  ];
  for (const { pattern, msg } of forbidden) {
    if (pattern.test(code)) {
      errors.push(msg);
    }
  }
  try {
    const AsyncFunction = Object.getPrototypeOf(async function() {
    }).constructor;
    new AsyncFunction("type", "data", "me", `${code}
return onSignal(type, data, me);`);
  } catch (err) {
    errors.push(`Syntax error: ${String(err)}`);
  }
  return { valid: errors.length === 0, errors };
}
async function callAnthropicAPI(endpoint, body) {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const errText = await response.text();
      console.log(JSON.stringify({
        _hp: "api_error",
        status: response.status,
        error: errText.slice(0, 500)
      }));
      return null;
    }
    return await response.json();
  } catch (err) {
    console.log(JSON.stringify({
      _hp: "api_error",
      error: String(err)
    }));
    return null;
  }
}
function buildDebriefContext(soma, allSomas, results) {
  const allyIntel = [];
  for (const allySoma of allSomas) {
    if (allySoma.id === soma.id) continue;
    const allyResult = results.find((r) => r.actantId === allySoma.id);
    if (!allyResult || !allyResult.success) continue;
    const handlerPreview = allySoma.signalHandlers.length > 800 ? allySoma.signalHandlers.slice(0, 800) + "\n// ... (truncated)" : allySoma.signalHandlers;
    allyIntel.push(`<ally name="${allySoma.name}">
Observations:
${allyResult.reasoning.slice(0, 1500)}

Their current handler code:
\`\`\`javascript
${handlerPreview}
\`\`\`

Their memory:
${allySoma.memory.slice(0, 500)}
</ally>`);
  }
  return allyIntel.join("\n\n");
}
async function runDebriefSharing(soma, allSomas, results, apiEndpoint, model = "claude-sonnet-4-20250514") {
  const allyContext = buildDebriefContext(soma, allSomas, results);
  if (!allyContext.trim()) return { handlersUpdated: false, memoryUpdated: false };
  const systemPrompt = `You are Officer ${soma.name}, badge ${soma.badgeNumber}, reviewing shared intelligence from your allies.

<identity>
${soma.nature}
</identity>

<your_current_handlers>
\`\`\`javascript
${soma.signalHandlers}
\`\`\`
</your_current_handlers>

<your_memory>
${soma.memory}
</your_memory>

You have tools to update your signal handlers and memory. Only use them if you see something genuinely useful in your allies' intel \u2014 don't change things just to change them.`;
  const userPrompt = `Your allies shared their observations and tactics after the chase:

${allyContext}

Review their intel. If any ally discovered a useful tactic or pattern you haven't considered:
1. **Call update_signal_handlers** to incorporate it (keep your own working tactics, merge in what's useful)
2. **Call update_memory** to note what you learned from allies

If their intel doesn't add anything new for you, that's fine \u2014 don't change things that are already working. But pay attention to:
- Ally handler patterns that could improve your ally_signal response
- Coordination ideas (radio protocols, zone assignments)
- Patterns about the suspect you missed`;
  const debriefTools = SCAFFOLD_TOOLS.filter((t) => t.name !== "query_replay");
  const result = { handlersUpdated: false, memoryUpdated: false, reasoning: "" };
  try {
    let messages = [{ role: "user", content: userPrompt }];
    let turns = 0;
    const maxTurns = 2;
    while (turns < maxTurns) {
      turns++;
      const response = await callAnthropicAPI(apiEndpoint, {
        model,
        system: systemPrompt,
        messages,
        tools: debriefTools,
        max_tokens: 2048
      });
      if (!response) break;
      const toolResults = [];
      let hasToolUse = false;
      const dummyResult = {
        actantId: soma.id,
        success: true,
        handlersUpdated: false,
        memoryUpdated: false,
        toolsAdopted: [],
        reasoning: ""
      };
      for (const block of response.content) {
        if (block.type === "text" && block.text) {
          result.reasoning += block.text + "\n";
        }
        if (block.type === "tool_use" && block.name && block.input) {
          hasToolUse = true;
          const toolResult = processToolCall(block.name, block.input, soma, null, dummyResult);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(toolResult)
          });
          if (block.name === "update_signal_handlers" && toolResult.success) result.handlersUpdated = true;
          if (block.name === "update_memory" && toolResult.success) result.memoryUpdated = true;
        }
      }
      if (!hasToolUse || response.stop_reason === "end_turn") break;
      messages = [
        ...messages,
        { role: "assistant", content: response.content },
        { role: "user", content: toolResults }
      ];
    }
    console.log(JSON.stringify({
      _hp: "debrief_share_complete",
      actantId: soma.id,
      name: soma.name,
      handlersUpdated: result.handlersUpdated,
      memoryUpdated: result.memoryUpdated
    }));
  } catch (err) {
    console.log(JSON.stringify({
      _hp: "debrief_share_error",
      actantId: soma.id,
      error: String(err)
    }));
  }
  if (result.handlersUpdated) clearHandlerCache();
  return result;
}
async function reflectAllActants(somas, replay, apiEndpoint, mapInfo, model, onProgress, onTurnUpdate, onSummary, onDebriefSummary) {
  const promises = somas.map(async (soma) => {
    const summary = summarizeReplayForActant(replay, soma);
    const allyPaths = somas.filter((s) => s.id !== soma.id).map((allySoma) => {
      const rawPath = replay.actantPaths[allySoma.id] || [];
      return {
        name: allySoma.name,
        waypoints: rawPath.filter((_, i) => i % 10 === 0).map((p) => ({ tick: p.tick, pos: p.pos, state: p.state }))
      };
    });
    const chaseMapBase64 = renderChaseMap(
      mapInfo.tiles,
      mapInfo.cols,
      mapInfo.rows,
      summary.playerWaypoints,
      summary.officerWaypoints,
      summary.keyMoments,
      mapInfo.tileSize,
      allyPaths
    );
    if (onProgress) onProgress(soma.id, "reflecting", chaseMapBase64);
    const result = await reflectActant(soma, replay, apiEndpoint, chaseMapBase64, model, onTurnUpdate);
    if (onProgress) onProgress(soma.id, result.success ? "complete" : "failed");
    if (result.success && onSummary) {
      const debrief = await summarizeReflection(soma, result.reasoning, result, apiEndpoint);
      onSummary(soma.id, debrief, result.reasoning);
    }
    return result;
  });
  const results = await Promise.all(promises);
  console.log(JSON.stringify({ _hp: "debrief_share_start", officerCount: somas.length }));
  if (onProgress) {
    for (const soma of somas) onProgress(soma.id, "sharing");
  }
  const debriefPromises = somas.map(
    (soma) => runDebriefSharing(soma, somas, results, apiEndpoint, model)
  );
  const debriefResults = await Promise.all(debriefPromises);
  const summaryPromises = somas.map(async (soma, i) => {
    const dr = debriefResults[i];
    const callback = onDebriefSummary || onSummary;
    if ((dr.handlersUpdated || dr.memoryUpdated) && dr.reasoning.trim() && callback) {
      const summary = await summarizeDebriefSharing(soma, dr, apiEndpoint);
      if (summary) {
        callback(soma.id, summary, dr.reasoning);
      }
    }
    if (onProgress) onProgress(soma.id, "complete");
  });
  await Promise.all(summaryPromises);
  console.log(JSON.stringify({
    _hp: "debrief_share_all_complete",
    updates: debriefResults.map((dr, i) => ({
      officer: somas[i].name,
      handlersUpdated: dr.handlersUpdated,
      memoryUpdated: dr.memoryUpdated
    }))
  }));
  return results;
}

// src/game.ts
var API_ENDPOINT = "/api/inference/anthropic/messages";
var CAPTURE_DISTANCE = 18;
var Game = class {
  config;
  map;
  player;
  police = [];
  somas = [];
  input;
  renderer;
  recorder;
  phase = "pregame";
  runNumber = 1;
  chaseStartTime = 0;
  elapsedTime = 0;
  replays = [];
  updateInProgress = false;
  lastReplay = null;
  reflectionInProgress = false;
  // Live radio — broadcasts queued during tick N, dispatched on tick N+1
  pendingBroadcasts = [];
  currentRadio = [];
  // Fixed timestep
  TICK_RATE = 60;
  TICK_DT = 1 / 60;
  accumulator = 0;
  lastFrameTime = 0;
  tickCount = 0;
  running = false;
  constructor(canvas2) {
    this.config = { ...DEFAULT_CONFIG };
    this.map = new TileMap(this.config);
    this.input = new InputHandler();
    this.renderer = new Renderer(canvas2, this.config);
    this.recorder = new ReplayRecorder(this.runNumber);
    const policeCount = this.map.policeSpawns.length;
    this.somas = loadSomas(policeCount);
    const spawnWorld = this.map.tileToWorld(this.map.playerSpawn);
    this.player = new Player(spawnWorld, this.config);
    const resetBtn = document.getElementById("reset-btn");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (confirm("Reset all officers to defaults? This clears all learned behavior.")) {
          resetSomas();
          location.reload();
        }
      });
    }
    console.log(JSON.stringify({
      _hp: "init",
      phase: 2,
      somasDriven: true,
      mapSize: { cols: this.map.cols, rows: this.map.rows },
      tileSize: this.config.tileSize,
      extractionPoints: this.map.extractionPoints,
      playerSpawn: this.map.playerSpawn,
      policeSpawns: this.map.policeSpawns,
      somas: this.somas.map((s) => ({
        id: s.id,
        name: s.name,
        nature: s.nature.slice(0, 80) + "...",
        tools: s.tools.map((t) => t.name),
        chaseCount: s.chaseHistory.length
      })),
      config: {
        playerSpeed: this.config.playerSpeed,
        policeSpeed: this.config.policeBaseSpeed,
        losRange: this.config.losRange,
        losAngle: this.config.losAngle,
        survivalTime: this.config.survivalTime
      }
    }));
  }
  start() {
    this.startChase();
    this.running = true;
    this.lastFrameTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }
  startChase() {
    this.phase = "chase";
    this.chaseStartTime = performance.now();
    this.elapsedTime = 0;
    this.tickCount = 0;
    this.pendingBroadcasts = [];
    this.currentRadio = [];
    this.map.randomizeExtractionPoints();
    this.map.randomizePoliceSpawns();
    const spawnWorld = this.map.tileToWorld(this.map.playerSpawn);
    this.player.pos = { ...spawnWorld };
    this.player.facing = { x: 0, y: -1 };
    this.police = this.somas.map(
      (soma, i) => createPoliceFromSoma(soma, this.map.policeSpawns[i], this.map, this.config)
    );
    this.recorder = new ReplayRecorder(this.runNumber);
    this.recorder.start();
    this.renderer.hideGameOver();
    console.log(JSON.stringify({
      _hp: "chase_start",
      run: this.runNumber,
      policeCount: this.police.length,
      police: this.police.map((p, i) => ({
        id: p.id,
        name: p.name,
        pos: p.pos,
        handlerSize: this.somas[i].signalHandlers.length,
        tools: this.somas[i].tools.map((t) => t.name)
      }))
    }));
  }
  loop(now) {
    if (!this.running) return;
    const frameDt = (now - this.lastFrameTime) / 1e3;
    this.lastFrameTime = now;
    this.accumulator += Math.min(frameDt, 0.1);
    while (this.accumulator >= this.TICK_DT) {
      this.accumulator -= this.TICK_DT;
      if (this.phase === "chase") {
        this.updateChase(this.TICK_DT);
      } else if (this.phase === "postgame") {
        this.updatePostgame();
      }
    }
    if (this.phase === "chase" || this.phase === "postgame") {
      this.renderer.render(
        this.map,
        this.player.pos,
        this.police,
        this.elapsedTime,
        this.runNumber
      );
    }
    requestAnimationFrame((t) => this.loop(t));
  }
  updateChase(dt) {
    if (this.updateInProgress) return;
    this.updateInProgress = true;
    this.tickCount++;
    this.elapsedTime = (performance.now() - this.chaseStartTime) / 1e3;
    this.currentRadio = this.pendingBroadcasts;
    this.pendingBroadcasts = [];
    const onBroadcast = (msg) => {
      msg.tick = this.tickCount;
      this.pendingBroadcasts.push(msg);
    };
    const action = this.player.update(dt, this.input.state, this.map);
    for (let i = 0; i < this.police.length; i++) {
      const radio = this.currentRadio.filter((m) => m.from !== this.police[i].id);
      updateSomaPolice(
        this.police[i],
        this.somas[i],
        this.player.pos,
        this.map,
        this.config,
        this.police,
        dt,
        this.tickCount,
        radio.length > 0 ? radio : void 0,
        onBroadcast
      );
    }
    this.recorder.recordTick(this.player.pos, action, this.police);
    const outcome = this.checkOutcome();
    if (outcome) {
      this.endChase(outcome);
    }
    this.updateInProgress = false;
  }
  checkOutcome() {
    const playerTile = this.map.worldToTile(this.player.pos);
    if (this.map.getTile(playerTile.col, playerTile.row) === 3 /* EXTRACTION */) {
      return "escaped";
    }
    for (const p of this.police) {
      if (distanceToPlayer(p, this.player.pos) < CAPTURE_DISTANCE) {
        return "captured";
      }
    }
    if (this.elapsedTime >= this.config.survivalTime) {
      return "timeout";
    }
    return null;
  }
  endChase(outcome) {
    this.phase = "postgame";
    const replay = this.recorder.finish(outcome, "city-grid-v1");
    this.replays.push(replay);
    this.lastReplay = replay;
    for (let i = 0; i < this.somas.length; i++) {
      const p = this.police[i];
      recordChaseInSoma(this.somas[i], {
        runId: this.runNumber,
        outcome,
        durationSeconds: this.elapsedTime,
        spotted: p.canSeePlayer || p.lastKnownPlayerPos !== null,
        captured: outcome === "captured" && distanceToPlayer(p, this.player.pos) < CAPTURE_DISTANCE
      });
    }
    saveSomas(this.somas);
    const escaped = outcome === "escaped" || outcome === "timeout";
    this.renderer.showGameOver(outcome, escaped);
    console.log(JSON.stringify({
      _hp: "chase_end",
      run: this.runNumber,
      outcome,
      durationSeconds: Math.round(this.elapsedTime * 10) / 10,
      stats: replay.stats,
      somaState: this.somas.map((s) => ({
        id: s.id,
        chaseCount: s.chaseHistory.length,
        memory: s.memory.slice(0, 100)
      }))
    }));
    console.log(JSON.stringify({
      _hp: "full_replay",
      replay
    }));
  }
  updatePostgame() {
    if (this.input.state.space) {
      this.input.state.space = false;
      this.startReflection();
    }
  }
  async startReflection() {
    if (this.reflectionInProgress || !this.lastReplay) {
      this.runNumber++;
      this.startChase();
      return;
    }
    this.phase = "reflecting";
    this.reflectionInProgress = true;
    this.renderer.hideGameOver();
    this.renderer.showReflection("starting", this.somas);
    console.log(JSON.stringify({
      _hp: "reflection_phase_start",
      run: this.runNumber,
      somaCount: this.somas.length
    }));
    try {
      const results = await reflectAllActants(
        this.somas,
        this.lastReplay,
        API_ENDPOINT,
        {
          tiles: this.map.tiles,
          cols: this.map.cols,
          rows: this.map.rows,
          tileSize: this.map.tileSize
        },
        void 0,
        // use default model
        (actantId, status, chaseMapBase64) => {
          this.renderer.updateReflectionProgress(actantId, status, this.somas, chaseMapBase64);
        },
        (update) => {
          this.renderer.appendTurnContent(update);
        },
        (actantId, summary, fullReasoning) => {
          this.renderer.setReflectionSummary(actantId, summary, fullReasoning);
        },
        (actantId, summary, fullReasoning) => {
          this.renderer.setDebriefSummary(actantId, summary, fullReasoning);
        }
      );
      saveSomas(this.somas);
      clearHandlerCache();
      console.log(JSON.stringify({
        _hp: "reflection_phase_complete",
        run: this.runNumber,
        results: results.map((r) => ({
          actantId: r.actantId,
          success: r.success,
          handlersUpdated: r.handlersUpdated,
          memoryUpdated: r.memoryUpdated,
          toolsAdopted: r.toolsAdopted,
          tokens: r.tokenUsage
        }))
      }));
      this.renderer.showReflectionComplete();
      await this.waitForSpace();
    } catch (err) {
      console.log(JSON.stringify({
        _hp: "reflection_phase_error",
        run: this.runNumber,
        error: String(err)
      }));
      this.renderer.showReflectionError(String(err));
      await this.waitForSpace();
    }
    this.reflectionInProgress = false;
    this.renderer.hideReflection();
    this.runNumber++;
    this.startChase();
  }
  waitForSpace() {
    return new Promise((resolve) => {
      const check = () => {
        if (this.input.state.space) {
          this.input.state.space = false;
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      setTimeout(check, 300);
    });
  }
};

// src/main.ts
console.log(JSON.stringify({
  _hp: "boot",
  version: "0.1.0",
  phase: 1,
  description: "Hot Pursuit \u2014 Phase 1: The Grid and the Chase",
  timestamp: (/* @__PURE__ */ new Date()).toISOString()
}));
var canvas = document.getElementById("game-canvas");
if (!canvas) {
  throw new Error("Canvas element not found");
}
var game = new Game(canvas);
game.start();
//# sourceMappingURL=main.js.map

// ── Tile Map: City Grid + A* Pathfinding ──

import { TileType, TilePosition, Position, WALKABLE_TILES, GameConfig, DEFAULT_CONFIG } from './types';

// City map: 40 cols x 30 rows
// Legend:
//   0 = road, 1 = building, 2 = alley, 3 = extraction, 4 = sidewalk, 5 = park
// Designed for interesting chases: wide roads, narrow alleys, dead ends, plazas, multiple extraction routes

const CITY_LAYOUT: number[][] = [
  // Row 0-4: North district
  [1,1,1,1,1,1,1,0,0,0,1,1,1,1,1,1,0,0,0,1,1,1,1,1,1,1,0,0,0,1,1,1,1,1,0,0,0,1,1,1],
  [1,1,1,1,1,1,1,0,4,0,1,1,1,1,1,1,0,4,0,1,1,1,1,1,1,1,0,4,0,1,1,1,1,1,0,4,0,1,1,1],
  [1,1,1,1,1,1,1,0,4,0,1,1,1,1,1,1,0,4,0,1,1,2,1,1,1,1,0,4,0,1,1,1,1,1,0,4,0,1,1,1],
  [1,1,1,1,1,1,1,0,4,0,1,1,1,1,1,1,0,4,0,1,1,2,1,1,1,1,0,4,0,1,1,1,1,1,0,4,0,1,1,1],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  // Row 5-9: Upper-mid blocks
  [1,1,1,0,4,0,1,1,1,1,1,1,0,4,0,1,1,1,1,0,0,0,0,0,1,1,0,4,0,1,1,1,1,0,4,0,1,1,1,1],
  [1,1,1,0,4,0,1,1,1,1,1,1,0,4,0,1,1,1,1,0,5,5,5,0,1,1,0,4,0,1,1,1,1,0,4,0,1,1,1,1],
  [1,1,1,0,4,0,2,2,2,0,1,1,0,4,0,1,1,1,1,0,5,5,5,0,1,1,0,4,0,2,2,0,1,0,4,0,1,1,1,1],
  [1,1,1,0,4,0,0,0,0,0,1,1,0,4,0,1,1,1,1,0,5,5,5,0,1,1,0,4,0,0,0,0,1,0,4,0,1,1,1,1],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  // Row 10-14: Central district — more complex
  [1,1,0,4,0,1,1,1,1,1,0,4,0,1,1,1,0,0,0,4,0,1,1,1,1,0,4,0,1,1,1,1,0,4,0,1,1,1,1,1],
  [1,1,0,4,0,1,1,2,1,1,0,4,0,1,1,1,0,4,0,4,0,1,1,1,1,0,4,0,1,1,1,1,0,4,0,1,1,2,1,1],
  [1,1,0,4,0,1,1,2,1,1,0,4,0,0,0,0,0,4,0,4,0,0,0,0,0,0,0,0,0,0,1,1,0,4,0,1,1,2,1,1],
  [1,1,0,4,0,1,1,2,0,0,0,4,0,1,1,1,0,4,0,4,0,1,1,1,1,0,4,0,1,1,1,1,0,4,0,0,0,2,1,1],
  [0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0],
  // Row 15-19: South-mid district
  [1,1,0,4,0,1,1,1,1,1,1,0,4,0,1,1,1,0,4,0,1,1,1,1,0,4,0,1,1,1,1,1,0,4,0,1,1,1,1,1],
  [1,1,0,4,0,1,1,1,1,1,1,0,4,0,1,1,1,0,4,0,1,1,1,1,0,4,0,2,2,2,1,1,0,4,0,1,1,1,1,1],
  [1,1,0,4,0,0,0,0,0,1,1,0,4,0,0,0,0,0,4,0,0,0,0,0,0,4,0,0,0,2,1,1,0,4,0,0,0,0,1,1],
  [1,1,0,4,0,1,1,1,0,1,1,0,4,0,1,1,1,0,4,0,1,1,1,1,0,4,0,1,1,2,1,1,0,4,0,1,1,0,1,1],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0,0],
  // Row 20-24: South blocks
  [1,1,1,0,4,0,1,1,1,1,0,4,0,1,1,1,1,0,4,0,1,1,1,1,1,0,4,0,1,1,1,0,4,0,1,1,1,1,1,1],
  [1,1,1,0,4,0,1,1,1,1,0,4,0,1,1,1,1,0,4,0,1,1,1,1,1,0,4,0,1,1,1,0,4,0,1,1,1,1,1,1],
  [1,1,1,0,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1],
  [1,1,1,0,4,0,1,1,1,1,0,4,0,1,1,1,1,0,4,0,1,1,1,1,1,0,4,0,1,1,1,0,4,0,1,1,1,1,1,1],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  // Row 25-29: South edge
  [1,1,0,4,0,1,1,1,0,4,0,1,1,1,1,0,4,0,1,1,1,1,1,0,4,0,1,1,0,4,0,1,1,1,1,0,4,0,1,1],
  [1,1,0,4,0,1,1,1,0,4,0,1,1,1,1,0,4,0,1,1,1,1,1,0,4,0,1,1,0,4,0,1,1,1,1,0,4,0,1,1],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [1,1,0,4,0,1,1,1,0,4,0,1,1,1,1,0,4,0,1,1,1,1,1,0,4,0,1,1,0,4,0,1,1,1,1,0,4,0,1,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

export class TileMap {
  readonly tiles: TileType[][];
  readonly cols: number;
  readonly rows: number;
  readonly tileSize: number;
  readonly extractionPoints: TilePosition[];
  readonly playerSpawn: TilePosition;
  readonly policeSpawns: TilePosition[];

  constructor(config: GameConfig = DEFAULT_CONFIG) {
    this.tileSize = config.tileSize;
    this.cols = config.mapCols;
    this.rows = config.mapRows;
    this.tiles = CITY_LAYOUT.map(row => row.map(t => t as TileType));
    this.extractionPoints = [];
    this.policeSpawns = [];

    // Scan for extraction points
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.tiles[r][c] === TileType.EXTRACTION) {
          this.extractionPoints.push({ col: c, row: r });
        }
      }
    }

    // Player spawns center-ish
    this.playerSpawn = { col: 18, row: 14 };

    // Police spawn at corners of the map (on roads)
    this.policeSpawns = [
      { col: 7, row: 0 },  // north
      { col: 35, row: 4 }, // east
      { col: 3, row: 24 }, // south-west
      { col: 33, row: 24 },// south-east
    ];
  }

  getTile(col: number, row: number): TileType {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
      return TileType.BUILDING;
    }
    return this.tiles[row][col];
  }

  isWalkable(col: number, row: number): boolean {
    return WALKABLE_TILES.has(this.getTile(col, row));
  }

  /** Check if a world-space position is walkable (for smooth movement) */
  isPositionWalkable(x: number, y: number, radius: number = 4): boolean {
    // Check corners of the entity's bounding box
    const offsets = [
      { x: -radius, y: -radius },
      { x: radius, y: -radius },
      { x: -radius, y: radius },
      { x: radius, y: radius },
    ];
    for (const off of offsets) {
      const col = Math.floor((x + off.x) / this.tileSize);
      const row = Math.floor((y + off.y) / this.tileSize);
      if (!this.isWalkable(col, row)) return false;
    }
    return true;
  }

  worldToTile(pos: Position): TilePosition {
    return {
      col: Math.floor(pos.x / this.tileSize),
      row: Math.floor(pos.y / this.tileSize),
    };
  }

  tileToWorld(tile: TilePosition): Position {
    return {
      x: tile.col * this.tileSize + this.tileSize / 2,
      y: tile.row * this.tileSize + this.tileSize / 2,
    };
  }

  /** A* pathfinding on tile grid */
  findPath(from: TilePosition, to: TilePosition): TilePosition[] {
    if (!this.isWalkable(to.col, to.row)) return [];

    const key = (col: number, row: number) => `${col},${row}`;
    const startKey = key(from.col, from.row);
    const endKey = key(to.col, to.row);

    const openSet = new Map<string, { col: number; row: number; f: number; g: number }>();
    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>();

    gScore.set(startKey, 0);
    const h = (c: number, r: number) => Math.abs(c - to.col) + Math.abs(r - to.row);
    openSet.set(startKey, { col: from.col, row: from.row, f: h(from.col, from.row), g: 0 });

    const neighbors = [
      { dc: 0, dr: -1 }, { dc: 0, dr: 1 },
      { dc: -1, dr: 0 }, { dc: 1, dr: 0 },
    ];

    let iterations = 0;
    const maxIterations = 2000;

    while (openSet.size > 0 && iterations++ < maxIterations) {
      // Find node with lowest f score
      let bestKey = '';
      let bestF = Infinity;
      for (const [k, node] of openSet) {
        if (node.f < bestF) {
          bestF = node.f;
          bestKey = k;
        }
      }

      if (bestKey === endKey) {
        // Reconstruct path
        const path: TilePosition[] = [];
        let current = endKey;
        while (current !== startKey) {
          const [c, r] = current.split(',').map(Number);
          path.unshift({ col: c, row: r });
          current = cameFrom.get(current)!;
        }
        return path;
      }

      const current = openSet.get(bestKey)!;
      openSet.delete(bestKey);

      for (const n of neighbors) {
        const nc = current.col + n.dc;
        const nr = current.row + n.dr;
        if (!this.isWalkable(nc, nr)) continue;

        const nKey = key(nc, nr);
        const tentativeG = current.g + 1;
        const existingG = gScore.get(nKey);

        if (existingG === undefined || tentativeG < existingG) {
          cameFrom.set(nKey, bestKey);
          gScore.set(nKey, tentativeG);
          openSet.set(nKey, { col: nc, row: nr, f: tentativeG + h(nc, nr), g: tentativeG });
        }
      }
    }

    return []; // no path found
  }

  /** Randomize police spawn positions on road tiles away from player */
  randomizePoliceSpawns(count: number = 4): void {
    this.policeSpawns.length = 0;

    // Collect walkable road/sidewalk tiles far enough from player spawn
    const minDistFromPlayer = 12;
    const minDistBetween = 8;
    const ps = this.playerSpawn;
    const candidates: TilePosition[] = [];

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const tile = this.tiles[r][c];
        if (tile !== TileType.ROAD && tile !== TileType.SIDEWALK) continue;
        const dist = Math.abs(c - ps.col) + Math.abs(r - ps.row);
        if (dist >= minDistFromPlayer) candidates.push({ col: c, row: r });
      }
    }

    // Shuffle
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    for (const c of candidates) {
      if (this.policeSpawns.length >= count) break;
      const tooClose = this.policeSpawns.some(p =>
        Math.abs(p.col - c.col) + Math.abs(p.row - c.row) < minDistBetween
      );
      if (!tooClose) this.policeSpawns.push(c);
    }
  }

  /** Randomize extraction point locations along map edges */
  randomizeExtractionPoints(count: number = 3): void {
    // Clear old extraction tiles
    for (const ep of this.extractionPoints) {
      this.tiles[ep.row][ep.col] = TileType.ROAD;
    }
    this.extractionPoints.length = 0;

    // Collect candidate road tiles on the map border (first/last 2 rows and cols)
    const candidates: TilePosition[] = [];
    const edgeDepth = 2;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.tiles[r][c] !== TileType.ROAD) continue;
        const onEdge = r < edgeDepth || r >= this.rows - edgeDepth ||
                       c < edgeDepth || c >= this.cols - edgeDepth;
        if (onEdge) candidates.push({ col: c, row: r });
      }
    }

    // Pick `count` points that are well-spaced apart
    const minDist = 15; // minimum tile distance between extraction points
    const picked: TilePosition[] = [];
    // Shuffle candidates
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    for (const c of candidates) {
      if (picked.length >= count) break;
      // Check distance from all already-picked points
      const tooClose = picked.some(p =>
        Math.abs(p.col - c.col) + Math.abs(p.row - c.row) < minDist
      );
      if (!tooClose) picked.push(c);
    }

    // Apply to tile grid
    for (const p of picked) {
      this.tiles[p.row][p.col] = TileType.EXTRACTION;
      this.extractionPoints.push(p);
    }
  }

  /** Get neighbors for patrol / search pattern */
  getWalkableNeighbors(tile: TilePosition): TilePosition[] {
    const neighbors: TilePosition[] = [];
    const dirs = [
      { dc: 0, dr: -1 }, { dc: 0, dr: 1 },
      { dc: -1, dr: 0 }, { dc: 1, dr: 0 },
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
}

import type { CellState, TerrainType } from '../interface/state.js';

// ── Value noise for terrain generation ───────────────────

function makeNoise2D(seed: number) {
  // Simple hash-based noise — no deps needed
  function hash(x: number, y: number): number {
    let h = seed;
    h ^= x * 374761393;
    h ^= y * 668265263;
    h = Math.imul(h, 1274126177);
    h ^= h >>> 16;
    return (h & 0x7fffffff) / 0x7fffffff;
  }

  function smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
  }

  return function noise(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = smoothstep(x - ix);
    const fy = smoothstep(y - iy);

    const v00 = hash(ix, iy);
    const v10 = hash(ix + 1, iy);
    const v01 = hash(ix, iy + 1);
    const v11 = hash(ix + 1, iy + 1);

    const top = v00 + fx * (v10 - v00);
    const bot = v01 + fx * (v11 - v01);
    return top + fy * (bot - top);
  };
}

function fbm(noise: (x: number, y: number) => number, x: number, y: number, octaves: number): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxAmp = 0;
  for (let i = 0; i < octaves; i++) {
    value += noise(x * frequency, y * frequency) * amplitude;
    maxAmp += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / maxAmp;
}

// ── Terrain classification ───────────────────────────────

function classifyTerrain(elevation: number, moisture: number): TerrainType {
  if (elevation < 0.3) return 'water';
  if (elevation < 0.4) return 'sand';
  if (elevation > 0.8) return 'rock';
  if (moisture > 0.55) return 'forest';
  return 'grass';
}

// ── World ────────────────────────────────────────────────

export interface WorldConfig {
  width: number;
  height: number;
  foodSpawnRate: number;   // chance per eligible cell per tick
  maxFoodPerCell: number;
  seed?: number;
}

const DEFAULT_CONFIG: WorldConfig = {
  width: 64,
  height: 64,
  foodSpawnRate: 0.006,
  maxFoodPerCell: 5,
};

export class World {
  readonly width: number;
  readonly height: number;
  readonly cells: CellState[];
  readonly config: WorldConfig;

  constructor(config: Partial<WorldConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.width = this.config.width;
    this.height = this.config.height;
    this.cells = new Array(this.width * this.height);
    this.generate();
  }

  private generate(): void {
    const seed = this.config.seed ?? Math.floor(Math.random() * 100000);
    const elevNoise = makeNoise2D(seed);
    const moistNoise = makeNoise2D(seed + 12345);

    const scale = 0.08;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const elevation = fbm(elevNoise, x * scale, y * scale, 4);
        const moisture = fbm(moistNoise, x * scale * 1.3, y * scale * 1.3, 3);
        const terrain = classifyTerrain(elevation, moisture);

        this.cells[y * this.width + x] = {
          terrain,
          elevation,
          food: terrain === 'grass' || terrain === 'forest'
            ? Math.random() < 0.15 ? Math.floor(Math.random() * 3) + 1 : 0
            : 0,
          danger: 0,
        };
      }
    }

    this.generateHazards(seed);
  }

  /** Place hazard zones — clusters of danger near rocky/edge terrain */
  private generateHazards(seed: number): void {
    const hazardNoise = makeNoise2D(seed + 99999);
    const scale = 0.12;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = this.cellAt(x, y);
        if (cell.terrain === 'water') continue;

        const noise = fbm(hazardNoise, x * scale, y * scale, 3);

        // Hazards form in pockets where noise is high + near rock/edges
        const nearEdge = Math.min(x, y, this.width - 1 - x, this.height - 1 - y) < 4 ? 0.15 : 0;
        const nearRock = cell.terrain === 'rock' ? 0.2 : 0;
        const hazardChance = noise + nearEdge + nearRock;

        if (hazardChance > 0.78) {
          cell.danger = 1 + Math.floor((hazardChance - 0.78) * 15);
        }
      }
    }
  }

  cellAt(x: number, y: number): CellState {
    return this.cells[y * this.width + x];
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  isWalkable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    return this.cellAt(x, y).terrain !== 'water';
  }

  /** Spawn food on eligible cells. Rate modulated by seasonal multiplier. */
  spawnFood(rateMultiplier: number = 1): Array<{ x: number; y: number; value: number }> {
    const spawned: Array<{ x: number; y: number; value: number }> = [];
    const rate = this.config.foodSpawnRate * rateMultiplier;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = this.cellAt(x, y);
        if ((cell.terrain === 'grass' || cell.terrain === 'forest') &&
            cell.food < this.config.maxFoodPerCell &&
            Math.random() < rate) {
          const value = cell.terrain === 'forest' ? 2 : 1;
          cell.food += value;
          spawned.push({ x, y, value });
        }
      }
    }
    return spawned;
  }

  consumeFood(x: number, y: number): number {
    const cell = this.cellAt(x, y);
    if (cell.food <= 0) return 0;
    const eaten = Math.min(cell.food, 3); // max eat per action
    cell.food -= eaten;
    return eaten;
  }

  setFood(x: number, y: number, value: number): void {
    if (this.inBounds(x, y)) {
      this.cellAt(x, y).food = Math.max(0, value);
    }
  }
}

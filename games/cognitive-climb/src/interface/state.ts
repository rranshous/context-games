// ── Terrain ──────────────────────────────────────────────

export type TerrainType = 'grass' | 'forest' | 'water' | 'rock' | 'sand';

export interface CellState {
  terrain: TerrainType;
  elevation: number;   // 0-1
  food: number;        // 0 = none, >0 = food value
  danger: number;      // 0 = safe, >0 = damage per tick
}

// ── Genome ───────────────────────────────────────────────

export interface GenomeState {
  speed: number;        // tiles per tick (0.5 – 2)
  senseRange: number;   // perception radius in tiles (2 – 8)
  size: number;         // 0.5 – 2, affects energy burn and interactions
  metabolism: number;   // energy efficiency multiplier (0.5 – 1.5)
  diet: number;         // 0 = herbivore, 1 = carnivore
  wakeInterval: number; // ticks between periodic consciousness wake-ups (30 – 200)
  maxEmbodimentSize: number; // max total chars across all embodiment sections (500 – 8000)
  reflexWeights: ReflexWeights;
}

export interface ReflexWeights {
  foodAttraction: number;    // how strongly drawn to food
  dangerAvoidance: number;   // how strongly repelled by hazards
  curiosity: number;         // tendency to explore vs stay
  restThreshold: number;     // energy level below which resting is prioritized
  sociality: number;         // attraction/repulsion to other creatures
}

// ── Embodiment ──────────────────────────────────────────

export interface EmbodimentState {
  identity: string;   // self-narrative, goals, strategy notes
  sensors: string;    // JS function — perception processing
  on_tick: string;    // JS function — per-tick logic, wake decisions
  memory: string;     // JSON string — working state for one lifetime
  tools: string;      // JSON string — custom tool definitions
}

// ── Creature ─────────────────────────────────────────────

export interface CreatureState {
  id: number;
  x: number;
  y: number;
  energy: number;
  maxEnergy: number;
  age: number;           // ticks alive
  generation: number;
  genome: GenomeState;
  parentId: number | null;
  thinking?: boolean;    // true while consciousness API call in-flight
  embodiment: EmbodimentState;
  reflexAdjustments: ReflexWeights;  // additive deltas on top of genome base
  recentEvents: string[];        // recent event buffer
  ticksSinceAte: number;         // ticks since last meal
}

// ── World snapshot ───────────────────────────────────────

export interface WorldState {
  width: number;
  height: number;
  tick: number;
  /** Flat array, row-major: index = y * width + x */
  cells: CellState[];
  creatures: CreatureState[];
  stats: SimStats;
}

export interface SimStats {
  tick: number;
  creatureCount: number;
  totalBirths: number;
  totalDeaths: number;
  avgEnergy: number;
  maxGeneration: number;
  /** Average genome traits across living population — tracks evolution */
  avgTraits: {
    speed: number;
    senseRange: number;
    size: number;
    metabolism: number;
    diet: number;
  } | null;
  deathsByStarvation: number;
  deathsByHazard: number;
}

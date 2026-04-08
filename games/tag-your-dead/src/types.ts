export interface Position {
  x: number;
  y: number;
}

export interface SandPatch {
  x: number;
  y: number;
  radius: number;
}

export interface Obstacle {
  x: number;
  y: number;
  radius: number;
  type: 'rock' | 'cactus' | 'barrel';
}

export interface CarState {
  id: string;
  x: number;
  y: number;
  angle: number;
  speed: number;
  hp: number;
  score: number;
  isIt: boolean;
  alive: boolean;
  itTimer: number;
  immuneTimer: number;
  respawnTimer: number;
  color: CarColor;
}

export type CarColor = 'red' | 'blue' | 'green' | 'yellow' | 'police' | 'npc';

export interface SomaSection {
  content: string;
}

export interface CarSoma {
  identity: SomaSection;
  on_tick: SomaSection;
  memory: SomaSection;
}

// Per-life position sample (for bird's-eye replay map)
export interface TrailPoint {
  time: number;
  x: number;
  y: number;
  isIt: boolean;
}

// Per-life significant event (for reflection context)
export interface LifeEvent {
  time: number;
  x: number;
  y: number;
  description: string;
}

// Performance snapshot for reflection (when a car dies)
export interface LifeResult {
  score: number;
  survivedSeconds: number;
  tagsGiven: number;
  tagsReceived: number;
  damageDealt: number;
  damageTaken: number;
  kills: number;
  deathCause: 'destroyed' | 'timeout';
  // Hit summary
  rockHits: number;
  cactusHits: number;
  barrelHits: number;
  wallHits: number;
  carCollisions: number;
  timeAtWall: number;
  avgSpeed: number;
  // Per-life trail + events for reflection map
  trail: TrailPoint[];
  lifeEvents: LifeEvent[];
  // ── Experiment behavioral metrics ──
  timeAsIt: number;           // seconds spent as IT during this life
  tagShedTimes: number[];     // seconds from becoming IT to passing it, each instance
  boostCount: number;         // total boosts fired
  effectiveBoosts: number;    // boosts that led to a tag or kill within 3s
  obstacleCollisions: number; // total obstacle hits (rock + cactus + barrel + wall)
  scorePerSecond: number;     // score gained this life / survivedSeconds
}

// ── Experiment types ──

export type ExperimentGroup = 'reflex' | 'control';

export interface ExperimentLifeRecord {
  carId: string;
  carName: string;
  group: ExperimentGroup;
  lifeIndex: number;
  life: LifeResult;
  onTickLength: number;  // code size at death — tracks evolution
  gameTime: number;       // when this death occurred
}

export interface ExperimentSummary {
  group: ExperimentGroup;
  carIds: string[];
  lives: number;
  avgSurvival: number;
  avgScorePerSecond: number;
  avgTimeAsIt: number;
  avgTagShedTime: number;
  avgObstacleCollisions: number;
  avgBoostEfficiency: number;  // effectiveBoosts / boostCount
  avgCodeGrowth: number;       // final onTickLength / initial onTickLength
}

export type GamePhase = 'title' | 'playing' | 'paused';

export interface ScoreSnapshot {
  time: number;
  scores: Record<string, number>;
}

export interface GameEvent {
  time: number;
  carId: string;
  type: 'kill' | 'death' | 'tagged_it' | 'big_hit';
  detail: string;
  relatedCarId?: string; // killer for deaths
}

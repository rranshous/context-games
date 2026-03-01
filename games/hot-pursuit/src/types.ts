// ── Shared Types ──

export interface Position {
  x: number;
  y: number;
}

export interface TilePosition {
  col: number;
  row: number;
}

export enum TileType {
  ROAD = 0,
  BUILDING = 1,
  ALLEY = 2,        // narrow walkable path
  EXTRACTION = 3,   // player win point
  SIDEWALK = 4,     // walkable area beside roads
  PARK = 5,         // open area
}

export const WALKABLE_TILES = new Set([
  TileType.ROAD,
  TileType.ALLEY,
  TileType.EXTRACTION,
  TileType.SIDEWALK,
  TileType.PARK,
]);

export interface GameConfig {
  tileSize: number;
  mapCols: number;
  mapRows: number;
  playerSpeed: number;       // pixels per second
  policeBaseSpeed: number;   // pixels per second (slower than player)
  losRange: number;          // tiles
  losAngle: number;          // degrees (cone half-angle)
  survivalTime: number;      // seconds to survive for timer win
  viewportWidth: number;
  viewportHeight: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  tileSize: 24,
  mapCols: 40,
  mapRows: 30,
  playerSpeed: 120,
  policeBaseSpeed: 95,
  losRange: 8,
  losAngle: 60,
  survivalTime: 90,
  viewportWidth: 640,
  viewportHeight: 480,
};

export interface Entity {
  pos: Position;
  facing: Position;  // normalized direction vector
  speed: number;
}

export interface PoliceEntity extends Entity {
  id: string;
  name: string;
  targetPos: Position | null;
  lastKnownPlayerPos: Position | null;
  canSeePlayer: boolean;
  path: TilePosition[];
  pathIndex: number;
  state: 'patrol' | 'pursuing' | 'searching';
  patrolPoints: TilePosition[];
  patrolIndex: number;
}

export type ChaseOutcome = 'escaped' | 'captured' | 'timeout';

export interface ChaseEvent {
  tick: number;
  time: number;
  type: 'player_spotted' | 'player_lost' | 'near_capture' |
        'extraction_reached' | 'timer_expired' | 'player_cornered' |
        'chase_start' | 'chase_end';
  actantId?: string;
  data: Record<string, unknown>;
}

export interface TickSnapshot {
  tick: number;
  time: number;
  playerPos: Position;
  playerAction: string;
  actants: Array<{
    id: string;
    pos: Position;
    state: string;
    canSeePlayer: boolean;
    playerPos?: Position;  // only if visible
  }>;
}

export interface ChaseReplay {
  runId: number;
  durationTicks: number;
  durationSeconds: number;
  outcome: ChaseOutcome;
  mapId: string;
  playerPath: Array<{ tick: number; pos: Position; action: string }>;
  actantPaths: Record<string, Array<{ tick: number; pos: Position; state: string; canSeePlayer: boolean }>>;
  events: ChaseEvent[];
  snapshots: TickSnapshot[];  // sampled every N ticks for summary
  stats: {
    closestApproach: number;
    timesSpotted: number;
    timesLost: number;
    distanceTraveled: number;
  };
}

export type GamePhase = 'pregame' | 'chase' | 'postgame' | 'reflecting';

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  space: boolean;
}

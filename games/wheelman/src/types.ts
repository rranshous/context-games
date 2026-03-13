export interface Position { x: number; y: number; }
export interface Velocity { x: number; y: number; }

// Terrain types for the desert world
export type TerrainType = 'sand' | 'textured_sand' | 'rock' | 'water' | 'cactus' | 'road';

export interface TerrainEffect {
  type: TerrainType;
  x: number;
  y: number;
  radius: number;
  slowdown: number; // 0-1, where 1 = no slowdown
}

export interface Obstacle {
  x: number;
  y: number;
  radius: number;
  type: 'rock' | 'water';
}

export interface Objective {
  position: Position;
  type: 'delivery' | 'escape' | 'border';
  label: string;
}

// Run recording for after-action replay
export interface RunRecording {
  driverPath: Array<{ tick: number; pos: Position; speed: number; angle: number }>;
  pursuerPaths: Record<string, Array<{ tick: number; pos: Position }>>;
  radioTranscript: Array<{ time: number; text: string }>; // timestamped boss speech
  pursuerRadioLog: Array<{ time: number; from: string; type: string; data: string }>; // inter-pursuer radio
  events: Array<{ tick: number; type: string; description: string; pos?: Position }>;
  startTime: number;
  endTime: number;
  outcome: 'delivered' | 'caught' | 'crashed' | 'timeout';
  durationSeconds: number;
  distanceCovered: number;
  objectiveDistance: number; // how far from objective at end
  terrainSummary: string; // human-readable summary of terrain encountered
  incidentSummary: string; // human-readable summary of collisions and notable events
}

// Driver soma
export interface DriverSoma {
  identity: string;
  on_tick: string;
  memory: string;
  boss_radio: string; // transcript of boss speech during this run
  runHistory: Array<{
    runId: number;
    outcome: string;
    durationSeconds: number;
    distanceCovered: number;
    reachedObjective: boolean;
  }>;
}

// Pursuer soma — signal-driven, like hot-pursuit officers
export interface PursuerSoma {
  id: string;
  name: string;
  nature: string; // poetic analogy for their style
  identity: string;
  on_tick: string; // onSignal(type, data, me) function
  memory: string;
  chaseHistory: Array<{
    runId: number;
    outcome: string;
    durationSeconds: number;
    spotted: boolean;
    captured: boolean;
  }>;
}

// Pursuer signal types — priority order
export type PursuerSignal = 'driver_spotted' | 'driver_lost' | 'ally_signal' | 'tick';

// Pursuer state during a run
export type PursuerMode = 'patrol' | 'pursuing' | 'searching';

// Radio broadcast from a pursuer
export interface PursuerBroadcast {
  from: string;
  signalType: string;
  data: Record<string, unknown>;
}

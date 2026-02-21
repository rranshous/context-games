import type { GenomeState } from './state.js';

// ── Commands: main thread → sim worker ──────────────────

export type SimCommand =
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'setSpeed'; ticksPerSecond: number }
  | { type: 'getState' }
  | { type: 'spawnFood'; x: number; y: number; value: number }
  | { type: 'spawnCreature'; x: number; y: number; genome?: Partial<GenomeState> }
  | { type: 'modifyTerrain'; x: number; y: number; terrain: string }
  | { type: 'toggleConsciousness'; enabled: boolean };

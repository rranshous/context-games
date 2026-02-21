import type { CreatureState, SimStats, WorldState } from './state.js';

// ── Events: sim worker → main thread ────────────────────

export type SimEvent =
  | { type: 'state'; state: WorldState }
  | { type: 'stats'; stats: SimStats }
  | { type: 'creature:spawned'; creature: CreatureState; tick: number }
  | { type: 'creature:died'; id: number; cause: DeathCause; tick: number }
  | { type: 'creature:ate'; id: number; foodValue: number; x: number; y: number; tick: number }
  | { type: 'creature:reproduced'; parentId: number; childId: number; tick: number }
  | { type: 'creature:woke'; id: number; reason: string; thoughts: string; toolsUsed: string[]; tick: number }
  | { type: 'log'; message: string };

export type DeathCause = 'starvation' | 'hazard' | 'predation';

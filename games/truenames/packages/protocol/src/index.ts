// Shared message types between game, authority and (later) server.
export * from './altar.ts';
export type { NameClaim } from '@truenames/universe';

export type TargetSpec =
  | { kind: 'self' }
  | { kind: 'point'; x: number; y: number }
  | { kind: 'entity'; id: string };

export interface CastIntent {
  aura: string;
  /** Which spirit: an address for public spirits, or an opaque id (e.g. "t:<traitHash>") for proven ones. */
  spirit: string;
  /** Which facet's word (default 0). All of a being's words share its vessel. */
  facet?: number;
  request: number; // power requested
  target: TargetSpec;
  tick: number;
  /** Opaque tag the client uses to match results back to its own casts. */
  tag?: string;
}

export type Backlash = 'fizzle' | 'misfire' | 'recoil';

export interface CastResult {
  aura: string;
  spirit: string;
  tag?: string;
  target: TargetSpec;
  strength: number; // the name's strength
  effective: number; // "your evocation rang at N bits"
  grant: number;
  strainAfter: number;
  capacity: number;
  backlash?: Backlash;
  /** Self-damage from recoil, if any. */
  recoil?: number;
  /** Why nothing happened, if nothing did. */
  refused?: 'unknown-name' | 'no-spirit' | 'duplicate';
}

export interface PoolInfo {
  level: number;
  cap: number;
}

export interface TickResult {
  tick: number;
  casts: CastResult[];
  /** Vessels touched this tick, keyed by aura|spirit. */
  pools: Record<string, PoolInfo>;
}

export interface AuraState {
  strain: number;
  capacity: number;
}

export interface NameSubmitResult {
  accepted: boolean;
  strength?: number;
  reason?: string;
}

// InstinctAPI — the `me` object passed to predator instinct code.
// Provides movement primitives, sensing, state management, and memory.
// Parallels hot-pursuit's ChassisAPI but with biological framing.

import { ReefMap, Tile, getTile, worldToTile, tileToWorld } from './map.js';
import { Predator, hasLineOfSight } from './predator.js';

// --- Stimulus data passed to onStimulus ---

export interface StimulusData {
  prey_position?: { x: number; z: number };
  prey_distance?: number;
  last_known_position?: { x: number; z: number };
  own_position?: { x: number; z: number };
  current_state?: string;
  time_since_lost?: number;
}

// --- Pending actions queued by instinct code ---

export interface PendingAction {
  type: 'pursue' | 'patrol_to' | 'patrol_random' | 'hold';
  target?: { x: number; z: number };
}

// --- The me object ---

export interface InstinctAPI {
  // Movement commands (queue a PendingAction — first one wins per tick)
  pursue: (target: { x: number; z: number }) => void;
  patrol_to: (target: { x: number; z: number }) => void;
  patrol_random: () => void;
  hold: () => void;

  // Sensing
  check_los: (target: { x: number; z: number }) => boolean;
  nearby_tiles: (tileType: string) => Array<{ x: number; z: number; dist: number }>;
  distance_to: (target: { x: number; z: number }) => number;

  // State
  getState: () => string;
  setState: (s: string) => void;
  getLastKnown: () => { x: number; z: number } | null;
  setLastKnown: (pos: { x: number; z: number } | null) => void;
  getTimeSinceLost: () => number;
  getPosition: () => { x: number; z: number };

  // Memory
  memory: {
    read: () => string;
    write: (s: string) => void;
  };
}

// --- Tile name lookup ---

const TILE_NAMES: Record<string, Tile> = {
  open: Tile.OPEN,
  wall: Tile.WALL,
  crevice: Tile.CREVICE,
  kelp: Tile.KELP,
  den: Tile.DEN,
};

// --- Factory ---

export function createInstinctAPI(
  pred: Predator,
  map: ReefMap,
  tileSize: number,
  actions: PendingAction[],
): InstinctAPI {
  const px = () => pred.group.position.x;
  const pz = () => pred.group.position.z;

  return {
    pursue(target) {
      actions.push({ type: 'pursue', target: { x: target.x, z: target.z } });
    },
    patrol_to(target) {
      actions.push({ type: 'patrol_to', target: { x: target.x, z: target.z } });
    },
    patrol_random() {
      actions.push({ type: 'patrol_random' });
    },
    hold() {
      actions.push({ type: 'hold' });
    },

    check_los(target) {
      const pt = worldToTile(px(), pz(), tileSize, map.width, map.height);
      const st = worldToTile(target.x, target.z, tileSize, map.width, map.height);
      return hasLineOfSight(map, pt.tx, pt.tz, st.tx, st.tz);
    },

    nearby_tiles(tileType: string) {
      const tileEnum = TILE_NAMES[tileType.toLowerCase()];
      if (tileEnum === undefined) return [];

      const results: Array<{ x: number; z: number; dist: number }> = [];
      const center = worldToTile(px(), pz(), tileSize, map.width, map.height);
      const rangeTiles = Math.ceil(pred.chassis.sensorRange / tileSize);

      for (let dtz = -rangeTiles; dtz <= rangeTiles; dtz++) {
        for (let dtx = -rangeTiles; dtx <= rangeTiles; dtx++) {
          const ttx = center.tx + dtx;
          const ttz = center.tz + dtz;
          if (ttx < 0 || ttx >= map.width || ttz < 0 || ttz >= map.height) continue;
          if (getTile(map, ttx, ttz) !== tileEnum) continue;
          const { wx, wz } = tileToWorld(ttx, ttz, tileSize, map.width, map.height);
          const ddx = wx - px(), ddz = wz - pz();
          const dist = Math.sqrt(ddx * ddx + ddz * ddz);
          if (dist <= pred.chassis.sensorRange) {
            results.push({ x: wx, z: wz, dist });
          }
        }
      }

      results.sort((a, b) => a.dist - b.dist);
      return results;
    },

    distance_to(target) {
      const ddx = target.x - px(), ddz = target.z - pz();
      return Math.sqrt(ddx * ddx + ddz * ddz);
    },

    getState: () => pred.physical.state,
    setState: (s: string) => { pred.physical.state = s; },
    getLastKnown: () => pred.physical.lastSeenPos
      ? { x: pred.physical.lastSeenPos.x, z: pred.physical.lastSeenPos.z }
      : null,
    setLastKnown: (pos) => {
      pred.physical.lastSeenPos = pos ? { x: pos.x, z: pos.z } : null;
    },
    getTimeSinceLost: () => pred.physical.lostTime,
    getPosition: () => ({ x: px(), z: pz() }),

    memory: {
      read: () => pred.predatorSoma.memory,
      write: (s: string) => { pred.predatorSoma.memory = s; },
    },
  };
}

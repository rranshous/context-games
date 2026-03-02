// TickAPI — the `me` object passed to on_tick code.
// Provides movement primitives, sensing, and section access.

import { ReefMap, Tile, getTile, worldToTile, tileToWorld } from './map.js';
import { Predator, hasLineOfSight } from './predator.js';

// --- World data passed to on_tick ---

export interface WorldData {
  squidDetected: boolean;
  squidPos: { x: number; z: number };
  squidDist: number;
  dt: number;
  t: number;  // elapsed game time
}

// --- Pending actions queued by on_tick code ---

export interface PendingAction {
  type: 'pursue' | 'patrol_to' | 'patrol_random' | 'hold';
  target?: { x: number; z: number };
}

// --- The me object ---

export interface TickAPI {
  // Movement commands (queue a PendingAction — first one wins per tick)
  pursue: (target: { x: number; z: number }) => void;
  patrol_to: (target: { x: number; z: number }) => void;
  patrol_random: () => void;
  hold: () => void;

  // Sensing
  check_los: (target: { x: number; z: number }) => boolean;
  nearby_tiles: (tileType: string) => Array<{ x: number; z: number; dist: number }>;
  distance_to: (target: { x: number; z: number }) => number;
  getPosition: () => { x: number; z: number };

  // Section access
  memory: { read: () => string; write: (s: string) => void };
  hunt_journal: { read: () => string; write: (s: string) => void };
  on_tick: { read: () => string };
  identity: { read: () => string };
}

// --- Tile name lookup ---

const TILE_NAMES: Record<string, Tile> = {
  open: Tile.OPEN,
  wall: Tile.WALL,
  crevice: Tile.CREVICE,
  kelp: Tile.KELP,
  den: Tile.DEN,
};

const MAX_JOURNAL_LENGTH = 5000;

// --- Factory ---

export function createTickAPI(
  pred: Predator,
  map: ReefMap,
  tileSize: number,
  actions: PendingAction[],
): TickAPI {
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

    getPosition: () => ({ x: px(), z: pz() }),

    memory: {
      read: () => pred.predatorSoma.memory,
      write: (s: string) => { pred.predatorSoma.memory = s; },
    },

    hunt_journal: {
      read: () => pred.predatorSoma.hunt_journal,
      write: (s: string) => {
        // Cap journal length — truncate from front if over limit
        if (s.length > MAX_JOURNAL_LENGTH) {
          const trimPoint = s.indexOf('\n', s.length - MAX_JOURNAL_LENGTH);
          s = trimPoint > 0 ? s.slice(trimPoint + 1) : s.slice(s.length - MAX_JOURNAL_LENGTH);
        }
        pred.predatorSoma.hunt_journal = s;
      },
    },

    on_tick: {
      read: () => pred.predatorSoma.on_tick,
    },

    identity: {
      read: () => pred.predatorSoma.identity,
    },
  };
}

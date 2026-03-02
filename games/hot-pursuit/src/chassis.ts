// ── Chassis: The me API ──
// Provides the primitive surface that actant signal handlers compose.
// During chase mode, thinkAbout() is disabled. During reflection (Phase 3),
// the full API including cognition tools will be available.

import { Position, TilePosition, PoliceEntity, GameConfig, RadioMessage } from './types';
import { TileMap } from './map';
import { canSee } from './los';
import { Soma } from './soma';

/** Result from a tool call */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/** Signal data passed to handlers */
export interface SignalData {
  // tick signal
  own_position?: Position;
  map_state?: { cols: number; rows: number; tileSize: number };
  state?: string;
  tick?: number;

  // player_spotted
  player_position?: Position;

  // player_lost
  last_known_position?: Position;

  // ally_signal
  ally_id?: string;
  signal_type?: string;
  signal_data?: Record<string, unknown>;
}

/** The me API — what the actant's handlers can call */
export interface ChassisAPI {
  callTool: (name: string, args?: Record<string, unknown>) => ToolResult;
  getState: () => string;
  getPosition: () => Position;
  getFacing: () => Position;
  memory: {
    read: () => string;
    write: (content: string) => void;
  };
  thinkAbout: (thought: string) => never;
  display: (html: string) => void;
}

// Allowlisted tool names — handlers can ONLY call these
const ALLOWED_TOOLS = new Set([
  'move_toward',
  'check_line_of_sight',
  'move_to_intercept',
  'hold_position',
  'map_query',
  'escape_routes_from',
  'ally_positions',
  'distance_to',
  'broadcast',
  'patrol_next',
  // Internal engine tools (prefixed with _engine_)
  '_engine_move',
  '_engine_move_direction',
  '_engine_los',
]);

/**
 * Create the chassis API for a police actant during chase mode.
 * The API provides movement/observation primitives and blocks cognition.
 */
export function createChaseChassisAPI(
  entity: PoliceEntity,
  soma: Soma,
  map: TileMap,
  config: GameConfig,
  allPolice: PoliceEntity[],
  pendingActions: PendingAction[],
  onBroadcast?: (msg: RadioMessage) => void,
): ChassisAPI {
  return {
    callTool: (name: string, args?: Record<string, unknown>): ToolResult => {
      // Validate against allowlist
      if (!ALLOWED_TOOLS.has(name) && !name.startsWith('_engine_')) {
        console.log(JSON.stringify({
          _hp: 'handler_violation',
          actantId: entity.id,
          tool: name,
          reason: 'not_in_allowlist',
        }));
        return { success: false, error: `Tool not available: ${name}` };
      }

      // Also check the actant has adopted non-default tools
      const isDefaultTool = name === 'move_toward' || name === 'check_line_of_sight' || name === 'patrol_next';
      const isEngineTool = name.startsWith('_engine_');
      if (!isDefaultTool && !isEngineTool) {
        const hasTool = soma.tools.some(t => t.name === name);
        if (!hasTool) {
          return { success: false, error: `Tool not adopted: ${name}` };
        }
      }

      // Dispatch to engine primitives
      return executeToolCall(name, args || {}, entity, soma, map, config, allPolice, pendingActions, onBroadcast);
    },

    getState: () => entity.state,
    getPosition: () => ({ ...entity.pos }),
    getFacing: () => ({ ...entity.facing }),

    memory: {
      read: () => soma.memory,
      write: (_content: string) => {
        // Blocked during chase mode — memory is read-only in the field
        console.log(JSON.stringify({
          _hp: 'handler_violation',
          actantId: entity.id,
          reason: 'memory_write_during_chase',
        }));
      },
    },

    thinkAbout: (_thought: string) => {
      throw new Error('No cognition during chase. You are performing, not reasoning.');
    },

    display: (_html: string) => {
      // No-op during chase
    },
  };
}

/** Actions queued by handler execution, applied by the game engine after */
export interface PendingAction {
  type: 'move_toward' | 'move_to_intercept' | 'hold' | 'patrol_next';
  target?: Position;
  targetVelocity?: Position;
}

function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  entity: PoliceEntity,
  soma: Soma,
  map: TileMap,
  config: GameConfig,
  allPolice: PoliceEntity[],
  pendingActions: PendingAction[],
  onBroadcast?: (msg: RadioMessage) => void,
): ToolResult {
  switch (name) {
    case 'move_toward': {
      const target = args.target as Position | undefined;
      if (!target) return { success: false, error: 'target required' };
      pendingActions.push({ type: 'move_toward', target });
      return { success: true, data: { queued: true } };
    }

    case 'move_to_intercept': {
      const target = args.target as Position | undefined;
      const velocity = args.targetVelocity as Position | undefined;
      if (!target) return { success: false, error: 'target required' };
      pendingActions.push({
        type: 'move_to_intercept',
        target,
        targetVelocity: velocity || { x: 0, y: 0 },
      });
      return { success: true, data: { queued: true } };
    }

    case 'hold_position': {
      pendingActions.push({ type: 'hold' });
      return { success: true };
    }

    case 'patrol_next': {
      pendingActions.push({ type: 'patrol_next' });
      return { success: true };
    }

    case 'check_line_of_sight': {
      const target = args.target as Position | undefined;
      if (!target) return { success: false, error: 'target required' };
      const visible = canSee(
        map, entity.pos, entity.facing, target,
        config.losRange, config.losAngle,
      );
      return { success: true, data: { visible } };
    }

    case 'map_query': {
      const pos = args.position as Position || entity.pos;
      const radius = (args.radius as number) || 3;
      const tile = map.worldToTile(pos);
      const terrain: Array<{ col: number; row: number; walkable: boolean }> = [];
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const c = tile.col + dc;
          const r = tile.row + dr;
          terrain.push({ col: c, row: r, walkable: map.isWalkable(c, r) });
        }
      }
      return { success: true, data: { terrain } };
    }

    case 'escape_routes_from': {
      const pos = args.position as Position || entity.pos;
      const tile = map.worldToTile(pos);
      const neighbors = map.getWalkableNeighbors(tile);
      const routes = neighbors.map(n => ({
        position: map.tileToWorld(n),
        tile: n,
      }));
      return { success: true, data: { routes } };
    }

    case 'ally_positions': {
      const allies = allPolice
        .filter(p => p.id !== entity.id)
        .map(p => ({ id: p.id, position: { ...p.pos }, state: p.state }));
      return { success: true, data: { allies } };
    }

    case 'distance_to': {
      const target = args.target as Position | undefined;
      if (!target) return { success: false, error: 'target required' };
      const dx = target.x - entity.pos.x;
      const dy = target.y - entity.pos.y;
      return { success: true, data: { distance: Math.sqrt(dx * dx + dy * dy) } };
    }

    case 'broadcast': {
      const msg: RadioMessage = {
        from: entity.id,
        fromName: soma.name,
        signalType: args.signalType as string,
        data: (args.data as Record<string, unknown>) || {},
        tick: 0, // filled by game loop
      };
      console.log(JSON.stringify({
        _hp: 'broadcast',
        from: entity.id,
        fromName: soma.name,
        signalType: msg.signalType,
        data: msg.data,
      }));
      if (onBroadcast) {
        onBroadcast(msg);
      }
      return { success: true, data: { sent: true, recipients: allPolice.length - 1 } };
    }

    default:
      return { success: false, error: `Unknown tool: ${name}` };
  }
}

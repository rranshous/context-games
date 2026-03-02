// ── Soma-Driven Police: Phase 2 ──
// Police entities are now driven by signal handlers from their soma.
// The game engine dispatches signals, handlers queue actions via me.callTool(),
// and the engine applies those actions to the entity.

import { PoliceEntity, Position, TilePosition, GameConfig, DEFAULT_CONFIG, RadioMessage } from './types';
import { TileMap } from './map';
import { canSee } from './los';
import { Soma } from './soma';
import { PendingAction } from './chassis';
import { compileHandler, executeSignal } from './handler-executor';
import { toTileCenter } from './coords';

// Track which officers are currently executing a handler.
// Prevents pileup when handlers are slow — if the previous tick's handler
// is still running, the officer continues their current movement instead
// of firing a new handler on top of the old one.
const busyOfficers = new Set<string>();

/**
 * Create a police entity from a soma.
 * The entity is the physical body; the soma is the mind.
 */
export function createPoliceFromSoma(
  soma: Soma,
  spawn: TilePosition,
  map: TileMap,
  config: GameConfig = DEFAULT_CONFIG,
): PoliceEntity {
  const worldPos = map.tileToWorld(spawn);
  const patrolPoints = generatePatrolPoints(spawn, map, 6);

  return {
    id: soma.id,
    name: soma.name,
    pos: { ...worldPos },
    facing: { x: 0, y: 1 },
    speed: config.policeBaseSpeed,
    targetPos: null,
    lastKnownPlayerPos: null,
    canSeePlayer: false,
    path: [],
    pathIndex: 0,
    state: 'patrol',
    patrolPoints,
    patrolIndex: 0,
  };
}

function generatePatrolPoints(center: TilePosition, map: TileMap, count: number): TilePosition[] {
  const points: TilePosition[] = [];
  const visited = new Set<string>();
  const queue: TilePosition[] = [center];
  visited.add(`${center.col},${center.row}`);

  while (queue.length > 0 && points.length < count) {
    const current = queue.shift()!;
    const neighbors = map.getWalkableNeighbors(current);
    if (neighbors.length >= 3) {
      points.push(current);
    }
    for (const n of neighbors) {
      const key = `${n.col},${n.row}`;
      if (!visited.has(key)) {
        visited.add(key);
        queue.push(n);
      }
    }
  }

  if (points.length === 0) {
    points.push(center);
  }
  return points;
}

/**
 * Update a soma-driven police entity for one tick.
 * 1. Check LOS → determine signal type
 * 2. Fire the soma's signal handler
 * 3. Apply the pending actions to the entity
 */
export async function updateSomaPolice(
  entity: PoliceEntity,
  soma: Soma,
  playerPos: Position,
  map: TileMap,
  config: GameConfig,
  allPolice: PoliceEntity[],
  dt: number,
  tick: number,
  radioMessages?: RadioMessage[],
  onBroadcast?: (msg: RadioMessage) => void,
): Promise<void> {
  // If this officer's previous handler is still running, just continue current movement
  if (busyOfficers.has(entity.id)) {
    moveAlongPath(entity, map, dt);
    return;
  }

  // Compile handler (cached after first call)
  const handler = compileHandler(soma);
  if (!handler) {
    // Fallback: sit still if handler won't compile
    return;
  }

  // Check LOS to player
  const prevCanSee = entity.canSeePlayer;
  entity.canSeePlayer = canSee(
    map, entity.pos, entity.facing, playerPos,
    config.losRange, config.losAngle,
  );

  // Mark busy before async handler execution
  busyOfficers.add(entity.id);

  try {
    // Signal priority: direct observation > radio > tick
    let actions: PendingAction[] = [];

    // Tile-center conversions — handlers see tile-center coords, not pixels
    const ownTC = toTileCenter(entity.pos, map);
    const mapState = { halfWidth: map.cols / 2, halfHeight: map.rows / 2 };

    if (entity.canSeePlayer && !prevCanSee) {
      // Just spotted the player — top priority
      entity.state = 'pursuing';
      entity.lastKnownPlayerPos = { ...playerPos };
      actions = await executeSignal(
        handler, 'player_spotted',
        {
          player_position: toTileCenter(playerPos, map),
          own_position: ownTC,
          map_state: mapState,
        },
        entity, soma, map, config, allPolice, onBroadcast,
      );
    } else if (!entity.canSeePlayer && prevCanSee) {
      // Just lost the player — top priority
      entity.state = 'searching';
      const lastKnown = entity.lastKnownPlayerPos || playerPos;
      actions = await executeSignal(
        handler, 'player_lost',
        {
          last_known_position: toTileCenter(lastKnown, map),
          own_position: ownTC,
          map_state: mapState,
        },
        entity, soma, map, config, allPolice, onBroadcast,
      );
    } else if (entity.canSeePlayer) {
      // Still have eyes on — re-fire player_spotted
      entity.lastKnownPlayerPos = { ...playerPos };
      actions = await executeSignal(
        handler, 'player_spotted',
        {
          player_position: toTileCenter(playerPos, map),
          own_position: ownTC,
          map_state: mapState,
        },
        entity, soma, map, config, allPolice, onBroadcast,
      );
    } else if (radioMessages && radioMessages.length > 0) {
      // No direct observation but have radio — dispatch ally_signal
      // Use the most recent message (if multiple, latest wins)
      // Radio data is already in tile-center (handlers put tile-center into broadcasts)
      const msg = radioMessages[radioMessages.length - 1];
      actions = await executeSignal(
        handler, 'ally_signal',
        {
          ally_id: msg.from,
          signal_type: msg.signalType,
          signal_data: msg.data,
          own_position: ownTC,
          map_state: mapState,
        },
        entity, soma, map, config, allPolice, onBroadcast,
      );
      console.log(JSON.stringify({
        _hp: 'radio_dispatch',
        to: entity.id,
        toName: entity.name,
        from: msg.from,
        signalType: msg.signalType,
        messageCount: radioMessages.length,
      }));
    } else {
      // No player visible, no radio — fire tick signal
      // Check if we've reached search target
      if (entity.state === 'searching' && entity.lastKnownPlayerPos) {
        const dx = entity.pos.x - entity.lastKnownPlayerPos.x;
        const dy = entity.pos.y - entity.lastKnownPlayerPos.y;
        if (Math.sqrt(dx * dx + dy * dy) < map.tileSize) {
          entity.state = 'patrol';
          entity.lastKnownPlayerPos = null;
        }
      }

      actions = await executeSignal(
        handler, 'tick',
        {
          own_position: ownTC,
          state: entity.state,
          tick,
          map_state: mapState,
        },
        entity, soma, map, config, allPolice, onBroadcast,
      );
    }

    // Apply the queued actions
    applyActions(entity, actions, map, config, dt, playerPos);
  } finally {
    busyOfficers.delete(entity.id);
  }
}

/**
 * Apply pending actions from handler execution to the entity.
 * Only the first movement action is applied (one move per tick).
 */
function applyActions(
  entity: PoliceEntity,
  actions: PendingAction[],
  map: TileMap,
  config: GameConfig,
  dt: number,
  playerPos: Position,
): void {
  // Take the first movement action
  const action = actions[0];
  if (!action) return;

  switch (action.type) {
    case 'move_toward': {
      if (!action.target) break;
      // A* pathfind then move along path
      const from = map.worldToTile(entity.pos);
      const to = map.worldToTile(action.target);
      entity.path = map.findPath(from, to);
      entity.pathIndex = 0;
      moveAlongPath(entity, map, dt);
      break;
    }
    case 'move_to_intercept': {
      if (!action.target) break;
      // Predictive: aim ahead of the target based on velocity
      const vel = action.targetVelocity || { x: 0, y: 0 };
      const interceptTarget: Position = {
        x: action.target.x + vel.x * 1.5, // look 1.5 seconds ahead
        y: action.target.y + vel.y * 1.5,
      };
      const from = map.worldToTile(entity.pos);
      const to = map.worldToTile(interceptTarget);
      entity.path = map.findPath(from, to);
      entity.pathIndex = 0;
      moveAlongPath(entity, map, dt);
      break;
    }
    case 'hold': {
      // Do nothing — hold position
      break;
    }
    case 'patrol_next': {
      entity.patrolIndex = (entity.patrolIndex + 1) % entity.patrolPoints.length;
      const target = entity.patrolPoints[entity.patrolIndex];
      const from = map.worldToTile(entity.pos);
      entity.path = map.findPath(from, target);
      entity.pathIndex = 0;
      moveAlongPath(entity, map, dt);
      break;
    }
  }
}

function moveAlongPath(entity: PoliceEntity, map: TileMap, dt: number): void {
  if (entity.path.length === 0 || entity.pathIndex >= entity.path.length) return;

  const target = map.tileToWorld(entity.path[entity.pathIndex]);
  const dx = target.x - entity.pos.x;
  const dy = target.y - entity.pos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 2) {
    entity.pathIndex++;
    return;
  }

  const ndx = dx / dist;
  const ndy = dy / dist;
  entity.facing = { x: ndx, y: ndy };

  const step = entity.speed * dt;
  const newX = entity.pos.x + ndx * step;
  const newY = entity.pos.y + ndy * step;

  if (map.isPositionWalkable(newX, entity.pos.y, 4)) {
    entity.pos.x = newX;
  }
  if (map.isPositionWalkable(entity.pos.x, newY, 4)) {
    entity.pos.y = newY;
  }
}

/** Distance between police and player in pixels */
export function distanceToPlayer(entity: PoliceEntity, playerPos: Position): number {
  const dx = entity.pos.x - playerPos.x;
  const dy = entity.pos.y - playerPos.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ── Police AI: Naive Phase 1 ──
// Move toward player when visible, search last known position when not,
// patrol waypoints otherwise. Uses A* pathfinding on tile grid.

import { PoliceEntity, Position, TilePosition, GameConfig, DEFAULT_CONFIG } from './types';
import { TileMap } from './map';
import { canSee } from './los';

const POLICE_NAMES = ['Voss', 'Okafor', 'Tanaka', 'Reeves'];

export function createPolice(
  index: number,
  spawn: TilePosition,
  map: TileMap,
  config: GameConfig = DEFAULT_CONFIG,
): PoliceEntity {
  const worldPos = map.tileToWorld(spawn);

  // Generate patrol points: nearby intersections (road tiles with multiple walkable neighbors)
  const patrolPoints = generatePatrolPoints(spawn, map, 6);

  return {
    id: `officer-${index}`,
    name: POLICE_NAMES[index % POLICE_NAMES.length],
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

  // BFS to find road tiles for patrol
  while (queue.length > 0 && points.length < count) {
    const current = queue.shift()!;
    const neighbors = map.getWalkableNeighbors(current);

    // Intersections (3+ walkable neighbors) make good patrol points
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

  // If we didn't find enough intersections, just use what we have
  if (points.length === 0) {
    points.push(center);
  }

  return points;
}

export function updatePolice(
  police: PoliceEntity,
  playerPos: Position,
  map: TileMap,
  config: GameConfig,
  dt: number,
): void {
  // Check LOS to player
  const prevCanSee = police.canSeePlayer;
  police.canSeePlayer = canSee(
    map,
    police.pos,
    police.facing,
    playerPos,
    config.losRange,
    config.losAngle,
  );

  // State transitions
  if (police.canSeePlayer) {
    police.state = 'pursuing';
    police.lastKnownPlayerPos = { ...playerPos };
    police.targetPos = { ...playerPos };
    // Recalculate path to player
    const from = map.worldToTile(police.pos);
    const to = map.worldToTile(playerPos);
    police.path = map.findPath(from, to);
    police.pathIndex = 0;
  } else if (prevCanSee && !police.canSeePlayer) {
    // Just lost sight — switch to searching
    police.state = 'searching';
    // Keep heading to last known position
    if (police.lastKnownPlayerPos) {
      const from = map.worldToTile(police.pos);
      const to = map.worldToTile(police.lastKnownPlayerPos);
      police.path = map.findPath(from, to);
      police.pathIndex = 0;
    }
  } else if (police.state === 'searching') {
    // Check if we've reached the last known position
    if (police.lastKnownPlayerPos) {
      const dx = police.pos.x - police.lastKnownPlayerPos.x;
      const dy = police.pos.y - police.lastKnownPlayerPos.y;
      if (Math.sqrt(dx * dx + dy * dy) < map.tileSize) {
        // Reached last known position, go back to patrol
        police.state = 'patrol';
        police.lastKnownPlayerPos = null;
        police.targetPos = null;
        advancePatrol(police, map);
      }
    }
  } else if (police.state === 'patrol') {
    // Check if reached current patrol point
    if (police.path.length === 0 || police.pathIndex >= police.path.length) {
      advancePatrol(police, map);
    }
  }

  // Move along path
  moveAlongPath(police, map, dt);
}

function advancePatrol(police: PoliceEntity, map: TileMap): void {
  police.patrolIndex = (police.patrolIndex + 1) % police.patrolPoints.length;
  const target = police.patrolPoints[police.patrolIndex];
  const from = map.worldToTile(police.pos);
  police.path = map.findPath(from, target);
  police.pathIndex = 0;
}

function moveAlongPath(police: PoliceEntity, map: TileMap, dt: number): void {
  if (police.path.length === 0 || police.pathIndex >= police.path.length) return;

  const target = map.tileToWorld(police.path[police.pathIndex]);
  const dx = target.x - police.pos.x;
  const dy = target.y - police.pos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 2) {
    // Reached this waypoint, advance
    police.pathIndex++;
    return;
  }

  // Move toward target
  const ndx = dx / dist;
  const ndy = dy / dist;

  police.facing = { x: ndx, y: ndy };

  const step = police.speed * dt;
  const newX = police.pos.x + ndx * step;
  const newY = police.pos.y + ndy * step;

  // Wall sliding like player
  if (map.isPositionWalkable(newX, police.pos.y, 4)) {
    police.pos.x = newX;
  }
  if (map.isPositionWalkable(police.pos.x, newY, 4)) {
    police.pos.y = newY;
  }
}

/** Distance between police and player in pixels */
export function distanceToPlayer(police: PoliceEntity, playerPos: Position): number {
  const dx = police.pos.x - playerPos.x;
  const dy = police.pos.y - playerPos.y;
  return Math.sqrt(dx * dx + dy * dy);
}

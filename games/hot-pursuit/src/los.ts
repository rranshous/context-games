// ── Line of Sight ──
// Raycasting against tile walls

import { Position, TilePosition } from './types';
import { TileMap } from './map';

/** Cast a ray from origin to target, return true if no wall blocks the path */
export function hasLineOfSight(
  map: TileMap,
  from: Position,
  to: Position,
  maxRange: number,
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Beyond range
  if (dist > maxRange * map.tileSize) return false;

  // Step along the ray in small increments
  const steps = Math.ceil(dist / (map.tileSize * 0.4));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = from.x + dx * t;
    const y = from.y + dy * t;
    const col = Math.floor(x / map.tileSize);
    const row = Math.floor(y / map.tileSize);
    if (!map.isWalkable(col, row)) return false;
  }

  return true;
}

/** Check if a target is within a vision cone */
export function isInVisionCone(
  from: Position,
  facing: Position,
  target: Position,
  halfAngleDeg: number,
): boolean {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.01) return true; // on top of each other

  // Normalize direction to target
  const toDirX = dx / dist;
  const toDirY = dy / dist;

  // Dot product with facing direction
  const facingLen = Math.sqrt(facing.x * facing.x + facing.y * facing.y);
  if (facingLen < 0.01) return true; // no facing = can see all around

  const facingNormX = facing.x / facingLen;
  const facingNormY = facing.y / facingLen;

  const dot = toDirX * facingNormX + toDirY * facingNormY;
  const angleRad = Math.acos(Math.max(-1, Math.min(1, dot)));
  const angleDeg = angleRad * (180 / Math.PI);

  return angleDeg <= halfAngleDeg;
}

/** Full LOS check: in cone + not blocked by walls */
export function canSee(
  map: TileMap,
  from: Position,
  facing: Position,
  target: Position,
  range: number,
  halfAngleDeg: number,
): boolean {
  // First check range (cheap)
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const distTiles = Math.sqrt(dx * dx + dy * dy) / map.tileSize;
  if (distTiles > range) return false;

  // Then check cone
  if (!isInVisionCone(from, facing, target, halfAngleDeg)) return false;

  // Then raycast
  return hasLineOfSight(map, from, target, range);
}

/** Get all tiles visible from a position (for debug rendering) */
export function getVisibleTiles(
  map: TileMap,
  from: Position,
  facing: Position,
  range: number,
  halfAngleDeg: number,
): TilePosition[] {
  const visible: TilePosition[] = [];
  const centerTile = map.worldToTile(from);

  for (let dr = -range; dr <= range; dr++) {
    for (let dc = -range; dc <= range; dc++) {
      const col = centerTile.col + dc;
      const row = centerTile.row + dr;
      if (col < 0 || col >= map.cols || row < 0 || row >= map.rows) continue;

      const tileCenter = map.tileToWorld({ col, row });
      if (canSee(map, from, facing, tileCenter, range, halfAngleDeg)) {
        visible.push({ col, row });
      }
    }
  }

  return visible;
}

// ── Coordinate Conversion: Tile-Center System ──
// Officers think in tile-center coordinates: {x:0, y:0} = map center, units = tiles.
// The engine uses pixel coordinates internally. This module converts at the boundary.

import { Position } from './types';
import { TileMap } from './map';

/** Convert pixel position to tile-center coords (center-origin, tile units). */
export function toTileCenter(pos: Position, map: TileMap): Position {
  return {
    x: pos.x / map.tileSize - map.cols / 2,
    y: pos.y / map.tileSize - map.rows / 2,
  };
}

/** Convert tile-center coords back to pixel position. */
export function fromTileCenter(pos: Position, map: TileMap): Position {
  return {
    x: (pos.x + map.cols / 2) * map.tileSize,
    y: (pos.y + map.rows / 2) * map.tileSize,
  };
}

/** Distance in tile units between two pixel positions. */
export function distInTiles(a: Position, b: Position, tileSize: number): number {
  const dx = (a.x - b.x) / tileSize;
  const dy = (a.y - b.y) / tileSize;
  return Math.sqrt(dx * dx + dy * dy);
}

// ── Bird's-Eye Chase Map Renderer ──
// Renders an off-screen overview of the chase for AI reflection.
// Shows map layout, player path, officer path, and key moments.

import { TileType, Position } from './types';
import { ReplaySummary } from './replay-summarizer';

export interface AllyPath {
  name: string;
  waypoints: Array<{ tick: number; pos: Position; state: string }>;
}

const SCALE = 8; // pixels per tile
const ALLY_COLOR = '#55aacc'; // muted cyan for all ally paths

const TILE_COLORS: Record<TileType, string> = {
  [TileType.ROAD]: '#2a2a2a',
  [TileType.BUILDING]: '#1a1a2e',
  [TileType.ALLEY]: '#1e1e1e',
  [TileType.EXTRACTION]: '#0a3a0a',
  [TileType.SIDEWALK]: '#333344',
  [TileType.PARK]: '#1a2e1a',
};

const STATE_COLORS: Record<string, string> = {
  patrol: '#aa99ff',
  pursuing: '#ff4444',
  searching: '#ffcc33',
};

/** Draw a small filled arrowhead pointing in the direction of travel. */
function drawArrow(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  angle: number,
  size: number,
  color: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size, -size * 0.7);
  ctx.lineTo(-size * 0.3, 0);
  ctx.lineTo(-size, size * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Get travel angle at waypoint i (radians). Uses next point for first, prev for last. */
function waypointAngle(points: Array<{ x: number; y: number }>, i: number): number {
  if (points.length < 2) return 0;
  const prev = i > 0 ? points[i - 1] : points[i];
  const next = i < points.length - 1 ? points[i + 1] : points[i];
  const ref = i > 0 ? points[i] : next; // use current→next for first, prev→current for rest
  const from = i > 0 ? prev : points[i];
  return Math.atan2(ref.y - from.y, ref.x - from.x);
}

/**
 * Render a bird's-eye chase map as a base64 PNG.
 * Returns raw base64 (no data: prefix).
 */
export function renderChaseMap(
  tiles: TileType[][],
  cols: number,
  rows: number,
  playerWaypoints: ReplaySummary['playerWaypoints'],
  officerWaypoints: ReplaySummary['officerWaypoints'],
  keyMoments: ReplaySummary['keyMoments'],
  tileSize: number,
  allyPaths?: AllyPath[],
): string {
  const mapW = cols * SCALE;
  const mapH = rows * SCALE;
  const legendH = 48; // space for legend below map
  const canvas = document.createElement('canvas');
  canvas.width = mapW;
  canvas.height = mapH + legendH;
  const ctx = canvas.getContext('2d')!;

  // 1. Draw tile grid
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = TILE_COLORS[tiles[r][c]] ?? '#000';
      ctx.fillRect(c * SCALE, r * SCALE, SCALE, SCALE);
    }
  }

  // Helper: world position → canvas position
  const toCanvas = (pos: Position) => ({
    x: (pos.x / tileSize) * SCALE,
    y: (pos.y / tileSize) * SCALE,
  });

  // 2. Draw player path (green) + dots at each waypoint
  if (playerWaypoints.length > 0) {
    ctx.lineWidth = 3;
    ctx.globalAlpha = 1;
    for (let i = 1; i < playerWaypoints.length; i++) {
      const prev = toCanvas(playerWaypoints[i - 1].pos);
      const curr = toCanvas(playerWaypoints[i].pos);
      ctx.strokeStyle = '#33ff33';
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(curr.x, curr.y);
      ctx.stroke();
    }
    const playerCanvasPoints = playerWaypoints.map(wp => toCanvas(wp.pos));
    for (let i = 0; i < playerCanvasPoints.length; i++) {
      const p = playerCanvasPoints[i];
      const angle = waypointAngle(playerCanvasPoints, i);
      drawArrow(ctx, p.x, p.y, angle, 5, '#33ff33');
    }
  }

  // 2b. Draw ally paths (muted cyan, thinner) + name labels at start
  if (allyPaths) {
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    for (const ally of allyPaths) {
      if (ally.waypoints.length === 0) continue;
      // Path line
      for (let i = 1; i < ally.waypoints.length; i++) {
        const prev = toCanvas(ally.waypoints[i - 1].pos);
        const curr = toCanvas(ally.waypoints[i].pos);
        ctx.strokeStyle = ALLY_COLOR;
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(curr.x, curr.y);
        ctx.stroke();
      }
      // Waypoint arrows
      const allyCanvasPoints = ally.waypoints.map(wp => toCanvas(wp.pos));
      for (let i = 0; i < allyCanvasPoints.length; i++) {
        const p = allyCanvasPoints[i];
        const angle = waypointAngle(allyCanvasPoints, i);
        drawArrow(ctx, p.x, p.y, angle, 4, ALLY_COLOR);
      }
      // Name label at start position
      const start = toCanvas(ally.waypoints[0].pos);
      ctx.fillStyle = ALLY_COLOR;
      ctx.fillRect(start.x - 2.5, start.y - 2.5, 5, 5);
      ctx.globalAlpha = 1;
      ctx.font = `${Math.max(SCALE - 1, 6)}px monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#fff';
      ctx.fillText(ally.name, start.x + 4, start.y - 1);
      ctx.globalAlpha = 0.6;
    }
    ctx.globalAlpha = 1;
  }

  // 3. Draw officer path (colored by state) + dots at each waypoint
  if (officerWaypoints.length > 0) {
    ctx.lineWidth = 3;
    ctx.globalAlpha = 1;
    for (let i = 1; i < officerWaypoints.length; i++) {
      const prev = toCanvas(officerWaypoints[i - 1].pos);
      const curr = toCanvas(officerWaypoints[i].pos);
      ctx.strokeStyle = STATE_COLORS[officerWaypoints[i].state] ?? '#888';
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(curr.x, curr.y);
      ctx.stroke();
    }
    const officerCanvasPoints = officerWaypoints.map(wp => toCanvas(wp.pos));
    for (let i = 0; i < officerCanvasPoints.length; i++) {
      const p = officerCanvasPoints[i];
      const color = STATE_COLORS[officerWaypoints[i].state] ?? '#888';
      const angle = waypointAngle(officerCanvasPoints, i);
      drawArrow(ctx, p.x, p.y, angle, 5, color);
    }
  }

  // 4. Draw key moment markers (numbered circles)
  ctx.font = `${Math.max(SCALE, 6)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < keyMoments.length; i++) {
    const m = keyMoments[i];
    const pos = m.positions?.officer ?? m.positions?.player;
    if (!pos) continue;
    const p = toCanvas(pos);
    // White circle with number
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, SCALE * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.fillText(String(i + 1), p.x, p.y);
  }

  // 5. Mark start positions
  if (playerWaypoints.length > 0) {
    const ps = toCanvas(playerWaypoints[0].pos);
    ctx.fillStyle = '#33ff33';
    ctx.fillRect(ps.x - 3, ps.y - 3, 6, 6);
  }
  if (officerWaypoints.length > 0) {
    const os = toCanvas(officerWaypoints[0].pos);
    ctx.fillStyle = STATE_COLORS[officerWaypoints[0].state] ?? '#888';
    ctx.fillRect(os.x - 3, os.y - 3, 6, 6);
  }

  // 6. Mark extraction points
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (tiles[r][c] === TileType.EXTRACTION) {
        ctx.strokeStyle = '#33ff33';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(c * SCALE + 1, r * SCALE + 1, SCALE - 2, SCALE - 2);
      }
    }
  }

  // 7. Draw legend below map
  const ly = mapH + 4;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, mapH, mapW, legendH);
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const items: Array<{ color: string; label: string }> = [
    { color: '#1a1a2e', label: 'Building (blocks LOS)' },
    { color: '#2a2a2a', label: 'Road' },
    { color: '#1e1e1e', label: 'Alley' },
    { color: '#33ff33', label: 'Suspect path' },
    { color: ALLY_COLOR, label: 'Ally paths' },
    { color: '#aa99ff', label: 'Patrol' },
    { color: '#ff4444', label: 'Pursuing' },
    { color: '#ffcc33', label: 'Searching' },
  ];

  let lx = 4;
  for (const item of items) {
    ctx.fillStyle = item.color;
    ctx.fillRect(lx, ly + 2, 8, 8);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(lx, ly + 2, 8, 8);
    ctx.fillStyle = '#999';
    ctx.fillText(item.label, lx + 11, ly + 1);
    lx += ctx.measureText(item.label).width + 18;
    // Wrap to second row if needed
    if (lx > mapW - 60) {
      lx = 4;
      ctx.translate(0, 16);
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform

  return canvas.toDataURL('image/png').split(',')[1];
}

// ── Bird's-Eye Chase Map Renderer ──
// Renders an off-screen overview of the chase for AI reflection.
// Shows map layout, player path, officer path, and key moments.

import { TileType, Position } from './types';
import { ReplaySummary } from './replay-summarizer';

const SCALE = 4; // pixels per tile

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
): string {
  const mapW = cols * SCALE;
  const mapH = rows * SCALE;
  const legendH = 36; // space for legend below map
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
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 1;
    // Lines between waypoints
    for (let i = 1; i < playerWaypoints.length; i++) {
      const prev = toCanvas(playerWaypoints[i - 1].pos);
      const curr = toCanvas(playerWaypoints[i].pos);
      ctx.strokeStyle = '#33ff33';
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(curr.x, curr.y);
      ctx.stroke();
    }
    // Dots at each waypoint
    for (const wp of playerWaypoints) {
      const p = toCanvas(wp.pos);
      ctx.fillStyle = '#33ff33';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 3. Draw officer path (colored by state) + dots at each waypoint
  if (officerWaypoints.length > 0) {
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 1;
    // Lines between waypoints
    for (let i = 1; i < officerWaypoints.length; i++) {
      const prev = toCanvas(officerWaypoints[i - 1].pos);
      const curr = toCanvas(officerWaypoints[i].pos);
      ctx.strokeStyle = STATE_COLORS[officerWaypoints[i].state] ?? '#888';
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(curr.x, curr.y);
      ctx.stroke();
    }
    // Dots at each waypoint
    for (const wp of officerWaypoints) {
      const p = toCanvas(wp.pos);
      ctx.fillStyle = STATE_COLORS[wp.state] ?? '#888';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
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
    ctx.fillRect(ps.x - 2, ps.y - 2, 4, 4);
  }
  if (officerWaypoints.length > 0) {
    const os = toCanvas(officerWaypoints[0].pos);
    ctx.fillStyle = STATE_COLORS[officerWaypoints[0].state] ?? '#888';
    ctx.fillRect(os.x - 2, os.y - 2, 4, 4);
  }

  // 6. Mark extraction points
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (tiles[r][c] === TileType.EXTRACTION) {
        ctx.strokeStyle = '#33ff33';
        ctx.lineWidth = 1;
        ctx.strokeRect(c * SCALE, r * SCALE, SCALE, SCALE);
      }
    }
  }

  // 7. Draw legend below map
  const ly = mapH + 2;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, mapH, mapW, legendH);
  ctx.font = '7px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const items: Array<{ color: string; label: string }> = [
    { color: '#1a1a2e', label: 'Building (blocks LOS)' },
    { color: '#2a2a2a', label: 'Road' },
    { color: '#33ff33', label: 'Player path' },
    { color: '#ff4444', label: 'Pursuing' },
    { color: '#ffcc33', label: 'Searching' },
    { color: '#aa99ff', label: 'Patrol' },
  ];

  let lx = 3;
  for (const item of items) {
    ctx.fillStyle = item.color;
    ctx.fillRect(lx, ly + 2, 6, 6);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(lx, ly + 2, 6, 6);
    ctx.fillStyle = '#999';
    ctx.fillText(item.label, lx + 8, ly + 1);
    lx += ctx.measureText(item.label).width + 14;
    // Wrap to second row if needed
    if (lx > mapW - 40) {
      lx = 3;
      ctx.translate(0, 12);
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform

  return canvas.toDataURL('image/png').split(',')[1];
}

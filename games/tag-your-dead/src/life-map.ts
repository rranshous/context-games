// ── Life Map Renderer ──
// Renders a bird's-eye view of a car's last life for AI reflection.
// Shows arena, obstacles, position trail (colored by IT status), and key moment markers.

import { TrailPoint, LifeEvent, Obstacle, SandPatch } from './types.js';

const MAP_SIZE = 400; // output image size in pixels

interface LifeMapInput {
  arenaWidth: number;
  arenaHeight: number;
  obstacles: Obstacle[];
  sandPatches: SandPatch[];
  trail: TrailPoint[];
  events: LifeEvent[];
  carColor: string;  // this car's color
  carName: string;
}

/**
 * Render a bird's-eye life map as base64 PNG (no data: prefix).
 */
export function renderLifeMap(input: LifeMapInput): string {
  const { arenaWidth, arenaHeight, obstacles, sandPatches, trail, events, carColor, carName } = input;

  const scaleX = MAP_SIZE / arenaWidth;
  const scaleY = MAP_SIZE / arenaHeight;
  const scale = Math.min(scaleX, scaleY);
  const mapW = Math.round(arenaWidth * scale);
  const mapH = Math.round(arenaHeight * scale);
  const legendH = 36;

  const canvas = document.createElement('canvas');
  canvas.width = mapW;
  canvas.height = mapH + legendH;
  const ctx = canvas.getContext('2d')!;

  const tx = (x: number) => x * scale;
  const ty = (y: number) => y * scale;

  // 1. Background — desert sand
  ctx.fillStyle = '#d4b088';
  ctx.fillRect(0, 0, mapW, mapH);

  // 2. Sand patches — darker sand circles
  ctx.fillStyle = '#c4a070';
  for (const sp of sandPatches) {
    ctx.beginPath();
    ctx.arc(tx(sp.x), ty(sp.y), sp.radius * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. Obstacles
  for (const obs of obstacles) {
    const ox = tx(obs.x);
    const oy = ty(obs.y);
    const or = Math.max(obs.radius * scale, 2);
    if (obs.type === 'rock') {
      ctx.fillStyle = '#666';
      ctx.beginPath();
      ctx.arc(ox, oy, or, 0, Math.PI * 2);
      ctx.fill();
    } else if (obs.type === 'cactus') {
      ctx.fillStyle = '#4a7a3a';
      ctx.beginPath();
      ctx.arc(ox, oy, or, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#cc6633';
      ctx.beginPath();
      ctx.arc(ox, oy, or, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 4. Position trail — colored by IT status
  if (trail.length > 1) {
    ctx.lineWidth = 2.5;
    for (let i = 1; i < trail.length; i++) {
      const prev = trail[i - 1];
      const curr = trail[i];
      // Skip if segment wraps across seam (large jump)
      if (Math.abs(curr.x - prev.x) > arenaWidth / 2 || Math.abs(curr.y - prev.y) > arenaHeight / 2) continue;
      ctx.strokeStyle = curr.isIt ? '#ff3333' : carColor;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(tx(prev.x), ty(prev.y));
      ctx.lineTo(tx(curr.x), ty(curr.y));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Start marker — green square
    ctx.fillStyle = '#33ff33';
    const sx = tx(trail[0].x);
    const sy = ty(trail[0].y);
    ctx.fillRect(sx - 4, sy - 4, 8, 8);

    // Death marker — red X at end
    const last = trail[trail.length - 1];
    const dx = tx(last.x);
    const dy = ty(last.y);
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(dx - 5, dy - 5); ctx.lineTo(dx + 5, dy + 5);
    ctx.moveTo(dx + 5, dy - 5); ctx.lineTo(dx - 5, dy + 5);
    ctx.stroke();
  }

  // 5. Key moment markers — numbered circles
  ctx.font = 'bold 10px "tEggst", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const ex = tx(ev.x);
    const ey = ty(ev.y);
    // White circle
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ex, ey, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Number
    ctx.fillStyle = '#000';
    ctx.fillText(String(i + 1), ex, ey);
  }

  // 6. Legend
  const ly = mapH + 4;
  ctx.fillStyle = '#1a0f08';
  ctx.fillRect(0, mapH, mapW, legendH);
  ctx.font = '10px "tEggst", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  let lx = 6;
  const items = [
    { color: '#33ff33', label: 'Spawn' },
    { color: '#ff0000', label: 'Death' },
    { color: carColor, label: `${carName} (normal)` },
    { color: '#ff3333', label: `${carName} (IT)` },
    { color: '#666', label: 'Rock' },
    { color: '#4a7a3a', label: 'Cactus' },
    { color: '#fff', label: '# = Event' },
  ];
  for (const item of items) {
    ctx.fillStyle = item.color;
    ctx.fillRect(lx, ly + 2, 8, 8);
    ctx.fillStyle = '#999';
    ctx.fillText(item.label, lx + 11, ly + 1);
    lx += ctx.measureText(item.label).width + 22;
    if (lx > mapW - 50) { lx = 6; ctx.translate(0, 14); }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  return canvas.toDataURL('image/png').split(',')[1];
}

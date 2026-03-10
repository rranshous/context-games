// ── Run Map Renderer ──
// Renders a bird's-eye composite map of the run.
// Shows driver path (green), each pursuer path (distinct colors, labeled),
// terrain, objective, and events on a scaled-down canvas.

import { RunRecording, Position } from './types';
import { DesertWorld } from './desert-world';

// Distinct colors for up to 4 pursuers
const PURSUER_COLORS = ['#ff4444', '#ff8800', '#aa44ff', '#ff44aa'];

/** Render a bird's-eye composite run map as base64 PNG (no data: prefix). */
export function renderRunMap(
  recording: RunRecording,
  world: DesertWorld,
  objective: Position,
  pursuerNames?: Record<string, string>, // id -> name for labels
): string {
  // Find bounding box of all paths + objective + margin
  let minX = objective.x;
  let maxX = objective.x;
  let minY = objective.y;
  let maxY = objective.y;

  for (const wp of recording.driverPath) {
    if (wp.pos.x < minX) minX = wp.pos.x;
    if (wp.pos.x > maxX) maxX = wp.pos.x;
    if (wp.pos.y < minY) minY = wp.pos.y;
    if (wp.pos.y > maxY) maxY = wp.pos.y;
  }

  // Include pursuer paths in bounding box
  for (const id of Object.keys(recording.pursuerPaths)) {
    for (const wp of recording.pursuerPaths[id]) {
      if (wp.pos.x < minX) minX = wp.pos.x;
      if (wp.pos.x > maxX) maxX = wp.pos.x;
      if (wp.pos.y < minY) minY = wp.pos.y;
      if (wp.pos.y > maxY) maxY = wp.pos.y;
    }
  }

  // Add generous margin
  const margin = 200;
  minX = Math.max(0, minX - margin);
  maxX = Math.min(world.width, maxX + margin);
  minY = Math.max(0, minY - margin);
  maxY = Math.min(world.height, maxY + margin);

  const regionW = maxX - minX;
  const regionH = maxY - minY;

  // Scale to fit ~600px wide
  const targetW = 600;
  const scale = targetW / regionW;
  const canvasW = Math.ceil(regionW * scale);
  const canvasH = Math.ceil(regionH * scale);
  const legendH = 50;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH + legendH;
  const ctx = canvas.getContext('2d')!;

  // World-to-canvas coordinate transform
  const toCanvas = (pos: Position) => ({
    x: (pos.x - minX) * scale,
    y: (pos.y - minY) * scale,
  });

  // 1. Desert background — matches sprite tile palette
  ctx.fillStyle = '#efb681';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // 2. Sample terrain features
  const sampleStep = Math.max(8, Math.floor(1 / scale));
  for (let wy = minY; wy < maxY; wy += sampleStep) {
    for (let wx = minX; wx < maxX; wx += sampleStep) {
      const effect = world.getTerrainEffect(wx, wy);
      if (effect < 0.2) {
        const p = toCanvas({ x: wx, y: wy });
        ctx.fillStyle = '#4a90c4';
        ctx.fillRect(p.x, p.y, Math.max(2, sampleStep * scale), Math.max(2, sampleStep * scale));
      } else if (effect < 0.5) {
        const p = toCanvas({ x: wx, y: wy });
        ctx.fillStyle = '#d9a06a';
        ctx.fillRect(p.x, p.y, Math.max(2, sampleStep * scale), Math.max(2, sampleStep * scale));
      } else if (effect > 0.85 && effect < 0.95) {
        const p = toCanvas({ x: wx, y: wy });
        ctx.fillStyle = '#f5cfa0';
        ctx.fillRect(p.x, p.y, Math.max(2, sampleStep * scale), Math.max(2, sampleStep * scale));
      }
    }
  }

  // Rocks
  for (let wy = minY; wy < maxY; wy += sampleStep * 2) {
    for (let wx = minX; wx < maxX; wx += sampleStep * 2) {
      const obs = world.checkObstacleCollision(wx, wy, 1);
      if (obs) {
        const p = toCanvas({ x: obs.x, y: obs.y });
        ctx.fillStyle = obs.type === 'rock' ? '#5a5a5a' : '#2a6496';
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(3, obs.radius * scale), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 3. Pursuer paths — draw BEFORE driver path so driver is on top
  const pursuerIds = Object.keys(recording.pursuerPaths);
  for (let pi = 0; pi < pursuerIds.length; pi++) {
    const id = pursuerIds[pi];
    const path = recording.pursuerPaths[id];
    const color = PURSUER_COLORS[pi % PURSUER_COLORS.length];
    const name = pursuerNames?.[id] || id;

    if (path.length > 1) {
      // Path line
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      const first = toCanvas(path[0].pos);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < path.length; i++) {
        const p = toCanvas(path[i].pos);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Direction arrows
      for (let i = 30; i < path.length; i += 30) {
        const wp = path[i];
        const prev = path[i - 1];
        const p = toCanvas(wp.pos);
        const angle = Math.atan2(wp.pos.y - prev.pos.y, wp.pos.x - prev.pos.x);
        drawArrow(ctx, p.x, p.y, angle, 4, color);
      }

      // Name label at start position
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = color;
      ctx.fillText(name, first.x, first.y - 8);

      // Start dot
      ctx.beginPath();
      ctx.arc(first.x, first.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 4. Driver's path as green line (on top)
  if (recording.driverPath.length > 1) {
    ctx.strokeStyle = '#33ff33';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const first = toCanvas(recording.driverPath[0].pos);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < recording.driverPath.length; i++) {
      const p = toCanvas(recording.driverPath[i].pos);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // Direction arrows
    ctx.fillStyle = '#33ff33';
    for (let i = 20; i < recording.driverPath.length; i += 20) {
      const wp = recording.driverPath[i];
      const prev = recording.driverPath[i - 1];
      const p = toCanvas(wp.pos);
      const angle = Math.atan2(wp.pos.y - prev.pos.y, wp.pos.x - prev.pos.x);
      drawArrow(ctx, p.x, p.y, angle, 5, '#33ff33');
    }
  }

  // 5. Start position: green circle
  if (recording.driverPath.length > 0) {
    const start = toCanvas(recording.driverPath[0].pos);
    ctx.fillStyle = '#33ff33';
    ctx.beginPath();
    ctx.arc(start.x, start.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // 6. End position
  if (recording.driverPath.length > 0) {
    const endWp = recording.driverPath[recording.driverPath.length - 1];
    const end = toCanvas(endWp.pos);
    if (recording.outcome === 'delivered') {
      drawStar(ctx, end.x, end.y, 8, '#ffd700');
    } else {
      ctx.fillStyle = '#ff3333';
      ctx.beginPath();
      ctx.arc(end.x, end.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // 7. Objective: gold diamond
  const objP = toCanvas(objective);
  ctx.save();
  ctx.translate(objP.x, objP.y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#ffd700';
  ctx.fillRect(-6, -6, 12, 12);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(-6, -6, 12, 12);
  ctx.restore();

  // 8. Key events: numbered white circles
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < recording.events.length; i++) {
    const event = recording.events[i];
    if (!event.pos) continue;
    const p = toCanvas(event.pos);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.fillText(String(i + 1), p.x, p.y);
  }

  // 9. Legend at bottom
  const ly = canvasH + 6;
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, canvasH, canvasW, legendH);

  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const legendItems: Array<{ color: string; label: string }> = [
    { color: '#33ff33', label: 'Driver' },
    { color: '#ffd700', label: 'Objective' },
  ];

  // Add pursuer legend items
  for (let pi = 0; pi < pursuerIds.length; pi++) {
    const id = pursuerIds[pi];
    const color = PURSUER_COLORS[pi % PURSUER_COLORS.length];
    const name = pursuerNames?.[id] || id;
    legendItems.push({ color, label: name });
  }

  legendItems.push(
    { color: '#4a90c4', label: 'Water' },
    { color: '#5a5a5a', label: 'Rock' },
    { color: '#f5cfa0', label: 'Road' },
  );

  let lx = 6;
  for (const item of legendItems) {
    ctx.fillStyle = item.color;
    ctx.fillRect(lx, ly, 8, 8);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(lx, ly, 8, 8);
    ctx.fillStyle = '#aaa';
    ctx.fillText(item.label, lx + 11, ly - 1);
    lx += ctx.measureText(item.label).width + 20;
    if (lx > canvasW - 60) {
      lx = 6;
    }
  }

  return canvas.toDataURL('image/png').split(',')[1];
}

// ── Drawing Helpers ──

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  angle: number,
  size: number,
  color: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size, -size * 0.6);
  ctx.lineTo(-size * 0.3, 0);
  ctx.lineTo(-size, size * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  radius: number,
  color: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const outerAngle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
    const innerAngle = outerAngle + Math.PI / 5;
    if (i === 0) {
      ctx.moveTo(Math.cos(outerAngle) * radius, Math.sin(outerAngle) * radius);
    } else {
      ctx.lineTo(Math.cos(outerAngle) * radius, Math.sin(outerAngle) * radius);
    }
    ctx.lineTo(Math.cos(innerAngle) * radius * 0.4, Math.sin(innerAngle) * radius * 0.4);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

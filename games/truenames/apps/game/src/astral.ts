// Ambient backdrop for menus: the eightfold division, drifting. Brighter with more hum.
const motes = Array.from({ length: 140 }, (_, i) => ({
  x: Math.random(),
  y: Math.random(),
  z: 0.2 + Math.random() * 0.8,
  d: String(i % 8),
}));

export function drawAstral(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, hum: number) {
  ctx.fillStyle = '#07060d';
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  const intensity = Math.min(1, 0.25 + Math.log10(1 + hum) / 6);
  // nested octagons
  ctx.save();
  ctx.translate(cx, cy);
  for (let k = 0; k < 7; k++) {
    const r = ((t * 12 + k * 90) % 630) + 20;
    ctx.strokeStyle = `rgba(231,194,107,${(0.09 * intensity * (1 - r / 650)).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI * 2 + t * 0.02 * (k % 2 ? 1 : -1) + Math.PI / 8;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
  // drifting octal motes
  ctx.font = '12px JetBrains Mono, monospace';
  for (const m of motes) {
    m.y -= 0.004 * m.z * (0.3 + intensity) * 0.3;
    if (m.y < -0.02) {
      m.y = 1.02;
      m.x = Math.random();
    }
    ctx.fillStyle = `rgba(231,194,107,${(0.08 + 0.22 * m.z * intensity).toFixed(3)})`;
    ctx.fillText(m.d, m.x * w, m.y * h);
  }
}

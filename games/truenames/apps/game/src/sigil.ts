// Procedural sigils: every spirit's seal, drawn from its flavor bits. Display only.
import type { Spirit } from '@truenames/universe';
import { ELEMENT_COLOR } from './lore.ts';

const cache = new Map<string, HTMLCanvasElement>();

class Bits {
  constructor(private f: bigint) {}
  take(n: number): number {
    const v = Number(this.f & ((1n << BigInt(n)) - 1n));
    this.f >>= BigInt(n);
    return v;
  }
}

export function sigilCanvas(s: Spirit, size = 64): HTMLCanvasElement {
  const key = `${s.cell}@${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const dpr = 2;
  const c = document.createElement('canvas');
  c.width = c.height = size * dpr;
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  drawSigil(g, s, size / 2, size / 2, size * 0.46);
  cache.set(key, c);
  return c;
}

export function sigilURL(s: Spirit, size = 64): string {
  return sigilCanvas(s, size).toDataURL();
}

export function drawSigil(g: CanvasRenderingContext2D, s: Spirit, cx: number, cy: number, R: number, color = ELEMENT_COLOR[s.element]!) {
  const b = new Bits(s.traits.flavor >> 60n); // skip bits used by the epithet
  g.save();
  g.translate(cx, cy);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const lw = Math.max(1, R / 18);
  g.lineWidth = lw;
  // outer boundary: circle or n-gon; mightier spirits get more rings
  const sides = [0, 3, 4, 5, 6, 7, 8, 0][b.take(3)]!;
  const rings = 1 + Math.min(3, s.magnitude >> 1);
  for (let k = 0; k < rings; k++) {
    const r = R * (1 - k * 0.09);
    g.globalAlpha = k === 0 ? 1 : 0.5;
    poly(g, sides, r, b.take(1) ? Math.PI / sides : 0);
    g.stroke();
  }
  g.globalAlpha = 1;
  // spokes
  const n = 3 + b.take(3);
  const rot = (b.take(4) / 16) * Math.PI * 2;
  const inner = R * (0.18 + b.take(2) * 0.06);
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const len = R * (0.55 + b.take(2) * 0.1);
    const ex = Math.cos(a) * len, ey = Math.sin(a) * len;
    g.beginPath();
    g.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    g.lineTo(ex, ey);
    g.stroke();
    // terminal
    const term = b.take(2);
    if (term === 0) { g.beginPath(); g.arc(ex, ey, R * 0.07, 0, Math.PI * 2); g.fill(); }
    else if (term === 1) { const px = -Math.sin(a) * R * 0.1, py = Math.cos(a) * R * 0.1; g.beginPath(); g.moveTo(ex - px, ey - py); g.lineTo(ex + px, ey + py); g.stroke(); }
    else if (term === 2) {
      const f = R * 0.12;
      g.beginPath();
      g.moveTo(ex, ey); g.lineTo(ex + Math.cos(a + 0.6) * f, ey + Math.sin(a + 0.6) * f);
      g.moveTo(ex, ey); g.lineTo(ex + Math.cos(a - 0.6) * f, ey + Math.sin(a - 0.6) * f);
      g.stroke();
    } else { g.beginPath(); g.arc(ex, ey, R * 0.08, 0, Math.PI * 2); g.stroke(); }
  }
  // heart
  const heart = b.take(2);
  if (heart === 0) { g.beginPath(); g.arc(0, 0, inner * 0.8, 0, Math.PI * 2); g.stroke(); }
  else if (heart === 1) { poly(g, 3, inner, rot); g.fill(); }
  else if (heart === 2) { poly(g, 4, inner, rot + Math.PI / 4); g.stroke(); g.beginPath(); g.arc(0, 0, lw * 1.2, 0, Math.PI * 2); g.fill(); }
  else { g.beginPath(); g.arc(0, 0, inner * 0.45, 0, Math.PI * 2); g.fill(); }
  // chord across the seal
  if (b.take(1)) {
    const a = (b.take(3) / 8) * Math.PI;
    g.globalAlpha = 0.6;
    g.beginPath();
    g.moveTo(Math.cos(a) * R * 0.85, Math.sin(a) * R * 0.85);
    g.lineTo(-Math.cos(a) * R * 0.85, -Math.sin(a) * R * 0.85);
    g.stroke();
  }
  g.restore();
}

function poly(g: CanvasRenderingContext2D, sides: number, r: number, rot: number) {
  g.beginPath();
  if (sides < 3) { g.arc(0, 0, r, 0, Math.PI * 2); return; }
  for (let i = 0; i <= sides; i++) {
    const a = rot - Math.PI / 2 + (i / sides) * Math.PI * 2;
    if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
}

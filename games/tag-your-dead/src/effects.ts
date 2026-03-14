// ── Effects ──
// Dust particles, collision sparks, screen shake.

import { Camera } from './camera.js';

// ── Screen Shake ──
let shakeIntensity = 0;
let shakeDuration = 0;

export function triggerShake(intensity: number, duration: number): void {
  shakeIntensity = Math.max(shakeIntensity, intensity);
  shakeDuration = Math.max(shakeDuration, duration);
}

export function updateShake(dt: number): { dx: number; dy: number } {
  if (shakeDuration <= 0) return { dx: 0, dy: 0 };
  shakeDuration -= dt;
  const decay = Math.max(0, shakeDuration) / 0.3;
  const dx = (Math.random() - 0.5) * shakeIntensity * decay * 2;
  const dy = (Math.random() - 0.5) * shakeIntensity * decay * 2;
  if (shakeDuration <= 0) { shakeIntensity = 0; }
  return { dx, dy };
}

// ── Particles ──
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

const particles: Particle[] = [];

export function spawnDust(x: number, y: number, angle: number, speed: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const spread = (Math.random() - 0.5) * 1.5;
    const backAngle = angle + Math.PI + spread;
    const v = speed * (0.1 + Math.random() * 0.2);
    particles.push({
      x: x + (Math.random() - 0.5) * 8,
      y: y + (Math.random() - 0.5) * 8,
      vx: Math.cos(backAngle) * v,
      vy: Math.sin(backAngle) * v,
      life: 0.3 + Math.random() * 0.4,
      maxLife: 0.7,
      color: '#c8b080',
      size: 2 + Math.random() * 3,
    });
  }
}

export function spawnTagSparks(x: number, y: number): void {
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * Math.PI * 2;
    const v = 40 + Math.random() * 80;
    particles.push({
      x, y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      life: 0.4 + Math.random() * 0.3,
      maxLife: 0.7,
      color: Math.random() > 0.5 ? '#ff4444' : '#ffaa22',
      size: 2 + Math.random() * 3,
    });
  }
}

export function spawnEliminationExplosion(x: number, y: number): void {
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const v = 30 + Math.random() * 120;
    particles.push({
      x, y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      life: 0.5 + Math.random() * 0.5,
      maxLife: 1.0,
      color: ['#ff2222', '#ff8800', '#ffcc00', '#888888'][Math.floor(Math.random() * 4)],
      size: 3 + Math.random() * 5,
    });
  }
}

export function updateParticles(dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.95;
    p.vy *= 0.95;
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

export function renderParticles(ctx: CanvasRenderingContext2D, camera: Camera): void {
  for (const p of particles) {
    if (!camera.isVisible(p.x, p.y, 10)) continue;
    const s = camera.worldToScreen(p.x, p.y);
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ── Tire Tracks ──
interface TireTrack {
  x: number;
  y: number;
  angle: number;
  age: number;
}

const tracks: TireTrack[] = [];
const MAX_TRACKS = 400;

export function addTireTrack(x: number, y: number, angle: number): void {
  tracks.push({ x, y, angle, age: 0 });
  if (tracks.length > MAX_TRACKS) tracks.shift();
}

export function updateTracks(dt: number): void {
  for (let i = tracks.length - 1; i >= 0; i--) {
    tracks[i].age += dt;
    if (tracks[i].age > 4) {
      tracks.splice(i, 1);
    }
  }
}

export function renderTracks(ctx: CanvasRenderingContext2D, camera: Camera): void {
  for (const t of tracks) {
    if (!camera.isVisible(t.x, t.y, 5)) continue;
    const s = camera.worldToScreen(t.x, t.y);
    const alpha = Math.max(0, 1 - t.age / 4) * 0.15;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(s.x, s.y);
    ctx.rotate(t.angle);
    ctx.fillStyle = '#a09070';
    ctx.fillRect(-1, -4, 2, 8);
    ctx.restore();
  }
}

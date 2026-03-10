// ── Visual Effects ──
// Tire tracks, dust particles, screen shake — ported from raceon patterns.

import { Camera } from './camera';

// ── Particles ──

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  r: number;
  g: number;
  b: number;
  alpha: number;
}

const MAX_PARTICLES = 200;
const GRAVITY = 50;
const FRICTION = 0.98;

const particles: Particle[] = [];

export function spawnDust(
  x: number, y: number,
  vehicleAngle: number,
  vehicleSpeed: number,
  count: number = 3,
): void {
  for (let i = 0; i < count; i++) {
    if (particles.length >= MAX_PARTICLES) {
      // Recycle oldest
      particles.shift();
    }

    // Spawn behind the vehicle (offset ~14px back from center)
    const behindDist = 14 + Math.random() * 4;
    const spawnX = x - Math.cos(vehicleAngle) * behindDist + (Math.random() - 0.5) * 6;
    const spawnY = y - Math.sin(vehicleAngle) * behindDist + (Math.random() - 0.5) * 6;

    // Eject behind the vehicle
    const spread = Math.PI * 0.6;
    const ejectAngle = vehicleAngle + Math.PI + (Math.random() - 0.5) * spread;
    const ejectSpeed = 20 + Math.random() * 40 + vehicleSpeed * 0.15;

    particles.push({
      x: spawnX,
      y: spawnY,
      vx: Math.cos(ejectAngle) * ejectSpeed,
      vy: Math.sin(ejectAngle) * ejectSpeed,
      size: 2 + Math.random() * 4,
      life: 0.6 + Math.random() * 0.5,
      maxLife: 0.6 + Math.random() * 0.5,
      r: 160 + Math.random() * 30,
      g: 140 + Math.random() * 20,
      b: 80 + Math.random() * 30,
      alpha: 0.5 + Math.random() * 0.3,
    });
  }
}

export function spawnCollisionParticles(x: number, y: number, count: number = 8): void {
  for (let i = 0; i < count; i++) {
    if (particles.length >= MAX_PARTICLES) particles.shift();

    const angle = Math.random() * Math.PI * 2;
    const speed = 30 + Math.random() * 70;

    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 2 + Math.random() * 3,
      life: 0.4 + Math.random() * 0.4,
      maxLife: 0.4 + Math.random() * 0.4,
      r: 100 + Math.random() * 50,
      g: 80 + Math.random() * 40,
      b: 60,
      alpha: 0.7 + Math.random() * 0.3,
    });
  }
}

export function spawnWaterSplash(x: number, y: number, count: number = 10): void {
  for (let i = 0; i < count; i++) {
    if (particles.length >= MAX_PARTICLES) particles.shift();

    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
    const speed = 30 + Math.random() * 50;

    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 2 + Math.random() * 3,
      life: 0.3 + Math.random() * 0.3,
      maxLife: 0.3 + Math.random() * 0.3,
      r: 100,
      g: 150,
      b: 200,
      alpha: 0.6 + Math.random() * 0.4,
    });
  }
}

export function updateParticles(dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.vx *= FRICTION;
    p.vy *= FRICTION;
    p.vy += GRAVITY * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.size *= 0.995; // shrink slightly
  }
}

export function renderParticles(ctx: CanvasRenderingContext2D, camera: Camera): void {
  for (const p of particles) {
    if (!camera.isVisible(p.x, p.y, p.size + 10)) continue;
    const screen = camera.worldToScreen(p.x, p.y);
    const fade = p.life / p.maxLife;
    ctx.fillStyle = `rgba(${Math.round(p.r)},${Math.round(p.g)},${Math.round(p.b)},${(p.alpha * fade).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, p.size * fade, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function clearParticles(): void {
  particles.length = 0;
}

// ── Tire Tracks ──

interface TireTrack {
  x: number;
  y: number;
  angle: number;
  life: number;
  maxLife: number;
  vehicleType: 'player' | 'pursuer';
}

const MAX_TRACKS = 600;
const TRACK_SPEED_THRESHOLD = 30;
const TRACK_SEGMENT_DISTANCE = 10;

const tracks: TireTrack[] = [];

// Track where we last placed a track for each vehicle
const lastTrackPos = new Map<string, { x: number; y: number }>();

export function addTireTrack(
  id: string,
  x: number,
  y: number,
  angle: number,
  speed: number,
  vehicleType: 'player' | 'pursuer',
): void {
  if (speed < TRACK_SPEED_THRESHOLD) return;

  const last = lastTrackPos.get(id);
  if (last) {
    const dx = x - last.x;
    const dy = y - last.y;
    if (dx * dx + dy * dy < TRACK_SEGMENT_DISTANCE * TRACK_SEGMENT_DISTANCE) return;
  }
  lastTrackPos.set(id, { x, y });

  // Life scales with speed
  const life = 4.0 * Math.min(speed / 100, 1.5);

  // Left and right tracks (offset perpendicular to angle)
  const perpX = Math.cos(angle + Math.PI / 2) * 5;
  const perpY = Math.sin(angle + Math.PI / 2) * 5;

  if (tracks.length >= MAX_TRACKS) tracks.shift();
  tracks.push({ x: x + perpX, y: y + perpY, angle, life, maxLife: life, vehicleType });

  if (tracks.length >= MAX_TRACKS) tracks.shift();
  tracks.push({ x: x - perpX, y: y - perpY, angle, life, maxLife: life, vehicleType });
}

export function updateTireTracks(dt: number): void {
  for (let i = tracks.length - 1; i >= 0; i--) {
    tracks[i].life -= dt;
    if (tracks[i].life <= 0) {
      tracks.splice(i, 1);
    }
  }
}

export function renderTireTracks(ctx: CanvasRenderingContext2D, camera: Camera): void {
  for (const track of tracks) {
    if (!camera.isVisible(track.x, track.y, 50)) continue;
    const screen = camera.worldToScreen(track.x, track.y);
    const alpha = (track.life / track.maxLife);

    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(track.angle);

    if (track.vehicleType === 'player') {
      ctx.fillStyle = `rgba(140,100,60,${(alpha * 0.45).toFixed(2)})`;
    } else {
      ctx.fillStyle = `rgba(100,80,50,${(alpha * 0.35).toFixed(2)})`;
    }
    ctx.fillRect(-3, -1.5, 6, 3);
    ctx.restore();
  }
}

export function clearTireTracks(): void {
  tracks.length = 0;
  lastTrackPos.clear();
}

// ── Screen Shake ──

let shakeIntensity = 0;
let shakeDuration = 0;
let shakeMaxDuration = 0;

export function triggerShake(intensity: number, duration: number): void {
  shakeIntensity = intensity;
  shakeDuration = duration;
  shakeMaxDuration = duration;
}

export function updateShake(dt: number): { offsetX: number; offsetY: number } {
  if (shakeDuration <= 0) return { offsetX: 0, offsetY: 0 };

  shakeDuration -= dt;
  const decay = shakeDuration / shakeMaxDuration;
  const currentIntensity = shakeIntensity * decay;

  return {
    offsetX: (Math.random() - 0.5) * currentIntensity,
    offsetY: (Math.random() - 0.5) * currentIntensity,
  };
}

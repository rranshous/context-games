// ── Arena ──
// Procedural desert arena with rocks, cacti, and barrels.
// Toroidal world — edges wrap around seamlessly.

import { CONFIG } from './config.js';
import { Obstacle, Position, SandPatch } from './types.js';

const A = CONFIG.ARENA;

function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export class Arena {
  readonly width = A.WIDTH;
  readonly height = A.HEIGHT;
  obstacles: Obstacle[] = [];

  // Rough sand patches — slow cars that drive through them
  sandPatches: SandPatch[] = [];

  constructor(seed: number = 42) {
    const rng = seededRng(seed);
    this.generate(rng);
  }

  private generate(rng: () => number): void {
    const center = { x: this.width / 2, y: this.height / 2 };
    const clearRadius = 400;

    for (let i = 0; i < A.ROCK_COUNT; i++) {
      const x = rng() * this.width;
      const y = rng() * this.height;
      if (this.wrapDistance(x, y, center.x, center.y) < clearRadius) continue;
      this.obstacles.push({ x, y, radius: 14 + rng() * 12, type: 'rock' });
    }

    for (let i = 0; i < A.CACTUS_COUNT; i++) {
      const x = rng() * this.width;
      const y = rng() * this.height;
      if (this.wrapDistance(x, y, center.x, center.y) < clearRadius) continue;
      this.obstacles.push({ x, y, radius: 8 + rng() * 6, type: 'cactus' });
    }

    for (let i = 0; i < A.BARREL_COUNT; i++) {
      const x = rng() * this.width;
      const y = rng() * this.height;
      if (this.wrapDistance(x, y, center.x, center.y) < clearRadius) continue;
      this.obstacles.push({ x, y, radius: 10, type: 'barrel' });
    }

    for (let i = 0; i < 50; i++) {
      const x = rng() * this.width;
      const y = rng() * this.height;
      if (this.wrapDistance(x, y, center.x, center.y) < clearRadius) continue;
      this.sandPatches.push({ x, y, radius: 30 + rng() * 40 });
    }
  }

  checkObstacleCollision(x: number, y: number, radius: number): Obstacle | null {
    for (const obs of this.obstacles) {
      const dx = this.wrapDx(x - obs.x);
      const dy = this.wrapDy(y - obs.y);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < obs.radius + radius) {
        return obs;
      }
    }
    return null;
  }

  // Check if position is in rough sand (returns true if in any patch)
  isInSand(x: number, y: number): boolean {
    for (const sp of this.sandPatches) {
      const dx = this.wrapDx(x - sp.x);
      const dy = this.wrapDy(y - sp.y);
      if (dx * dx + dy * dy < sp.radius * sp.radius) return true;
    }
    return false;
  }

  // Toroidal wrapping — position modulo arena size
  wrapX(x: number): number {
    return ((x % this.width) + this.width) % this.width;
  }

  wrapY(y: number): number {
    return ((y % this.height) + this.height) % this.height;
  }

  wrapPosition(x: number, y: number): Position {
    return { x: this.wrapX(x), y: this.wrapY(y) };
  }

  // Shortest-path delta (for distance/angle calculations across seam)
  wrapDx(dx: number): number {
    if (dx > this.width / 2) return dx - this.width;
    if (dx < -this.width / 2) return dx + this.width;
    return dx;
  }

  wrapDy(dy: number): number {
    if (dy > this.height / 2) return dy - this.height;
    if (dy < -this.height / 2) return dy + this.height;
    return dy;
  }

  wrapDistance(x1: number, y1: number, x2: number, y2: number): number {
    const dx = this.wrapDx(x1 - x2);
    const dy = this.wrapDy(y1 - y2);
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Check if a rock blocks the line of sight between two points (wrap-aware). */
  hasLineOfSight(x1: number, y1: number, x2: number, y2: number): boolean {
    const dx = this.wrapDx(x2 - x1);
    const dy = this.wrapDy(y2 - y1);
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return true;

    // Unit direction
    const ux = dx / len;
    const uy = dy / len;

    for (const obs of this.obstacles) {
      if (obs.type !== 'rock') continue;

      // Vector from line start to obstacle center (wrap-aware)
      const ox = this.wrapDx(obs.x - x1);
      const oy = this.wrapDy(obs.y - y1);

      // Project onto line — closest point parameter t
      const t = ox * ux + oy * uy;
      if (t < 0 || t > len) continue; // rock center not alongside the segment

      // Perpendicular distance from obstacle center to line
      const perpX = ox - ux * t;
      const perpY = oy - uy * t;
      const perpDist = Math.sqrt(perpX * perpX + perpY * perpY);

      if (perpDist < obs.radius) return false; // rock blocks the view
    }
    return true;
  }
}

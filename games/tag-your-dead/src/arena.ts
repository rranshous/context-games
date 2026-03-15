// ── Arena ──
// Procedural desert arena with rocks, cacti, and barrels.
// Smaller than wheelman's world — tight quarters for derby action.

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
    const margin = 120;
    const center = { x: this.width / 2, y: this.height / 2 };

    // Rocks — scattered, some in clusters
    for (let i = 0; i < A.ROCK_COUNT; i++) {
      const x = margin + rng() * (this.width - 2 * margin);
      const y = margin + rng() * (this.height - 2 * margin);
      // Keep center clear for spawning
      const dx = x - center.x;
      const dy = y - center.y;
      if (Math.sqrt(dx * dx + dy * dy) < 200) continue;
      this.obstacles.push({ x, y, radius: 14 + rng() * 12, type: 'rock' });
    }

    // Cacti — smaller, mostly cosmetic but still collidable
    for (let i = 0; i < A.CACTUS_COUNT; i++) {
      const x = margin + rng() * (this.width - 2 * margin);
      const y = margin + rng() * (this.height - 2 * margin);
      const dx = x - center.x;
      const dy = y - center.y;
      if (Math.sqrt(dx * dx + dy * dy) < 200) continue;
      this.obstacles.push({ x, y, radius: 8 + rng() * 6, type: 'cactus' });
    }

    // Barrels — small, dense, bounce you hard
    for (let i = 0; i < A.BARREL_COUNT; i++) {
      const x = margin + rng() * (this.width - 2 * margin);
      const y = margin + rng() * (this.height - 2 * margin);
      const dx = x - center.x;
      const dy = y - center.y;
      if (Math.sqrt(dx * dx + dy * dy) < 200) continue;
      this.obstacles.push({ x, y, radius: 10, type: 'barrel' });
    }

    // Rough sand patches — clusters of textured sand that slow cars
    for (let i = 0; i < 20; i++) {
      const x = margin + rng() * (this.width - 2 * margin);
      const y = margin + rng() * (this.height - 2 * margin);
      // Keep center clear
      const dx2 = x - center.x;
      const dy2 = y - center.y;
      if (Math.sqrt(dx2 * dx2 + dy2 * dy2) < 200) continue;
      this.sandPatches.push({ x, y, radius: 30 + rng() * 40 });
    }
  }

  checkObstacleCollision(x: number, y: number, radius: number): Obstacle | null {
    for (const obs of this.obstacles) {
      const dx = x - obs.x;
      const dy = y - obs.y;
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
      const dx = x - sp.x;
      const dy = y - sp.y;
      if (dx * dx + dy * dy < sp.radius * sp.radius) return true;
    }
    return false;
  }

  // Clamp position to arena bounds
  clampPosition(x: number, y: number, margin: number = 10): Position {
    return {
      x: Math.max(margin, Math.min(this.width - margin, x)),
      y: Math.max(margin, Math.min(this.height - margin, y)),
    };
  }
}

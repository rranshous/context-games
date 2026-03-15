// ── Car ──
// Shared vehicle physics for player and AI cars.
// Each car has position, angle, speed, controls, and tag state.

import { CONFIG } from './config.js';
import { Arena } from './arena.js';
import { CarState, CarColor } from './types.js';

const V = CONFIG.VEHICLE;
const T = CONFIG.TAG;
const D = CONFIG.DAMAGE;

let nextId = 0;

export class Car implements CarState {
  id: string;
  x: number;
  y: number;
  angle: number = 0;
  speed: number = 0;
  hp: number = D.MAX_HP;
  isIt: boolean = false;
  alive: boolean = true;
  itTimer: number = 0;
  immuneTimer: number = 0;
  color: CarColor;

  // Stats for round
  tagsGiven: number = 0;
  tagsReceived: number = 0;
  damageDealt: number = 0;
  damageTaken: number = 0;
  eliminatedAt: number = 0; // timestamp when eliminated (0 = alive)

  // Controls — set each frame by player input or AI on_tick
  steerInput: number = 0;   // -1 to 1
  accelInput: number = 0;   // 0 to 1
  brakeInput: number = 0;   // 0 to 1

  constructor(x: number, y: number, color: CarColor, id?: string) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.id = id ?? `car_${nextId++}`;
  }

  steer(dir: number): void {
    this.steerInput = Math.max(-1, Math.min(1, dir));
  }

  accelerate(amount: number): void {
    this.accelInput = Math.max(0, Math.min(1, amount));
  }

  brake(amount: number): void {
    this.brakeInput = Math.max(0, Math.min(1, amount));
  }

  update(dt: number, arena: Arena): void {
    if (!this.alive) return;

    // Update timers
    if (this.immuneTimer > 0) {
      this.immuneTimer -= dt;
      if (this.immuneTimer < 0) this.immuneTimer = 0;
    }

    if (this.isIt) {
      this.itTimer -= dt;
      if (this.itTimer <= 0) {
        // Eliminated!
        this.alive = false;
        this.isIt = false;
        this.itTimer = 0;
        this.eliminatedAt = performance.now();
        return;
      }
    }

    // Acceleration
    if (this.accelInput > 0) {
      if (this.speed < 0) {
        // Accelerating while reversing — brake first
        this.speed += V.BRAKING * this.accelInput * dt;
        if (this.speed > 0) this.speed = 0;
      } else {
        this.speed += V.ACCELERATION * this.accelInput * dt;
      }
    }

    // Braking / Reverse
    if (this.brakeInput > 0) {
      if (this.speed > 0) {
        this.speed -= V.BRAKING * this.brakeInput * dt;
        if (this.speed < 0) this.speed = 0;
      } else {
        // Already stopped or reversing — go into reverse
        this.speed -= V.ACCELERATION * 0.5 * this.brakeInput * dt;
      }
    }

    // Friction (applies in both directions)
    if (this.speed > 0) {
      this.speed -= V.FRICTION * dt;
      if (this.speed < 0) this.speed = 0;
    } else if (this.speed < 0) {
      this.speed += V.FRICTION * dt;
      if (this.speed > 0) this.speed = 0;
    }

    // Cap speed (forward and reverse)
    const maxReverse = V.MAX_SPEED * 0.4;
    if (this.speed > V.MAX_SPEED) this.speed = V.MAX_SPEED;
    if (this.speed < -maxReverse) this.speed = -maxReverse;

    // Steering — always works, scales with speed
    const absSpeed = Math.abs(this.speed);
    const speedFactor = Math.max(0.3, Math.min(1, absSpeed / (V.MAX_SPEED * 0.5)));
    const steerDir = this.speed < 0 ? -1 : 1; // reverse steering when reversing
    this.angle += this.steerInput * V.TURN_SPEED * speedFactor * steerDir * dt;

    // Move
    const vx = Math.cos(this.angle) * this.speed * dt;
    const vy = Math.sin(this.angle) * this.speed * dt;
    let newX = this.x + vx;
    let newY = this.y + vy;

    // Obstacle collision
    const collision = arena.checkObstacleCollision(newX, newY, V.COLLISION_RADIUS);
    if (collision) {
      const dx = newX - collision.x;
      const dy = newY - collision.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;

      const overlap = collision.radius + V.COLLISION_RADIUS - dist;
      this.x += nx * (overlap + V.BOUNCE_DISTANCE);
      this.y += ny * (overlap + V.BOUNCE_DISTANCE);
      this.speed *= Math.abs(V.BOUNCE_FACTOR);
    } else {
      this.x = newX;
      this.y = newY;
    }

    // Arena bounds
    const pos = arena.clampPosition(this.x, this.y, V.COLLISION_RADIUS);
    if (pos.x !== this.x || pos.y !== this.y) {
      // Bounce off wall — reverse speed slightly instead of just slowing
      if (Math.abs(this.speed) > 10) {
        this.speed *= -0.3;
      } else {
        this.speed = 0;
      }
    }
    this.x = pos.x;
    this.y = pos.y;

    // Reset controls each frame
    this.steerInput = 0;
    this.accelInput = 0;
    this.brakeInput = 0;
  }

  // Check distance to another car
  distanceTo(other: Car): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Check if this car can tag another (transfer "it")
  canTag(other: Car): boolean {
    if (!this.isIt || !this.alive || !other.alive) return false;
    if (other.immuneTimer > 0) return false;
    if (this.speed < T.MIN_SPEED_TO_TAG) return false;
    return this.distanceTo(other) < T.TAG_DISTANCE;
  }

  // Tag another car — transfer "it" status
  tagCar(other: Car): void {
    this.isIt = false;
    this.itTimer = 0;
    this.tagsGiven++;
    this.immuneTimer = T.TAG_IMMUNITY;

    other.isIt = true;
    other.itTimer = T.IT_TIMEOUT;
    other.tagsReceived++;
    other.immuneTimer = T.TAG_IMMUNITY;
  }

  // Take damage, return true if eliminated
  takeDamage(amount: number): boolean {
    this.hp -= amount;
    this.damageTaken += amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.isIt = false;
      this.eliminatedAt = performance.now();
      return true;
    }
    return false;
  }
}

// ── Car-to-car collision ──
// Returns pairs that collided this frame (for game.ts to handle effects)

export interface CollisionResult {
  a: Car;
  b: Car;
  damageToA: number;
  damageToB: number;
  tagTransfer: boolean; // true if "it" transferred
}

// Track per-pair cooldowns to prevent repeated hits from same contact
const collisionCooldowns = new Map<string, number>();

function pairKey(a: Car, b: Car): string {
  return a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
}

export function updateCollisionCooldowns(dt: number): void {
  for (const [key, remaining] of collisionCooldowns) {
    const next = remaining - dt;
    if (next <= 0) {
      collisionCooldowns.delete(key);
    } else {
      collisionCooldowns.set(key, next);
    }
  }
}

export function resetCollisionCooldowns(): void {
  collisionCooldowns.clear();
}

export function checkCarCollisions(cars: Car[], arena: Arena): CollisionResult[] {
  const results: CollisionResult[] = [];

  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (!a.alive) continue;

    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (!b.alive) continue;

      const dist = a.distanceTo(b);
      if (dist >= D.COLLISION_DISTANCE) continue;

      // Skip if either car is invulnerable (grace period)
      if (a.immuneTimer > 0 || b.immuneTimer > 0) continue;

      const key = pairKey(a, b);
      if (collisionCooldowns.has(key)) continue;

      // Collision! Set cooldown
      collisionCooldowns.set(key, D.COLLISION_COOLDOWN);

      // Capture speeds BEFORE bump for damage + tag checks
      const speedA = Math.abs(a.speed);
      const speedB = Math.abs(b.speed);

      // Bump apart
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = dist || 1;
      const nx = dx / d;
      const ny = dy / d;
      const overlap = D.COLLISION_DISTANCE - dist;
      const push = (overlap / 2) + D.BUMP_FORCE;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;

      // Clamp bumped positions to arena
      const posA = arena.clampPosition(a.x, a.y, V.COLLISION_RADIUS);
      a.x = posA.x; a.y = posA.y;
      const posB = arena.clampPosition(b.x, b.y, V.COLLISION_RADIUS);
      b.x = posB.x; b.y = posB.y;

      // Speed exchange — both slow down
      a.speed *= (1 - D.BUMP_SPEED_TRANSFER);
      b.speed *= (1 - D.BUMP_SPEED_TRANSFER);

      // Damage based on pre-bump speed + "it" multiplier
      const damageFromA = speedA * D.DAMAGE_FACTOR * (a.isIt ? D.IT_DAMAGE_MULTIPLIER : 1);
      const damageFromB = speedB * D.DAMAGE_FACTOR * (b.isIt ? D.IT_DAMAGE_MULTIPLIER : 1);

      // Track damage dealt
      a.damageDealt += damageFromA;
      b.damageDealt += damageFromB;

      // Tag transfer — check with pre-bump speed (canTag uses this.speed but
      // speed was already reduced, so check directly)
      let tagTransfer = false;
      if (a.isIt && a.alive && b.alive && speedA >= T.MIN_SPEED_TO_TAG) {
        a.tagCar(b);
        tagTransfer = true;
      } else if (b.isIt && b.alive && a.alive && speedB >= T.MIN_SPEED_TO_TAG) {
        b.tagCar(a);
        tagTransfer = true;
      }

      // Apply damage
      b.takeDamage(damageFromA);
      a.takeDamage(damageFromB);

      // 1 second grace period after being hit
      a.immuneTimer = Math.max(a.immuneTimer, D.HIT_GRACE_PERIOD);
      b.immuneTimer = Math.max(b.immuneTimer, D.HIT_GRACE_PERIOD);

      results.push({ a, b, damageToA: damageFromB, damageToB: damageFromA, tagTransfer });
    }
  }

  return results;
}

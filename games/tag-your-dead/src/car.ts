// ── Car ──
// Shared vehicle physics for player and AI cars.
// Score-based stat scaling: higher score = more HP and speed.

import { CONFIG } from './config.js';
import { Arena } from './arena.js';
import { CarState, CarColor } from './types.js';

const V = CONFIG.VEHICLE;
const T = CONFIG.TAG;
const D = CONFIG.DAMAGE;
const S = CONFIG.SCORE;
const R = CONFIG.RESPAWN;

let nextId = 0;

export class Car implements CarState {
  id: string;
  x: number;
  y: number;
  angle: number = 0;
  speed: number = 0;
  hp: number;
  isIt: boolean = false;
  alive: boolean = true;
  itTimer: number = 0;
  immuneTimer: number = 0;
  color: CarColor;

  // Persistent score — survives across lives
  score: number = 0;

  // Respawn
  respawnTimer: number = 0; // countdown when dead (0 = not respawning)

  // Stats for current life (reset on respawn)
  tagsGiven: number = 0;
  tagsReceived: number = 0;
  damageDealt: number = 0;
  damageTaken: number = 0;
  kills: number = 0;

  // Controls — set each frame by player input or AI on_tick
  steerInput: number = 0;   // -1 to 1
  accelInput: number = 0;   // 0 to 1
  brakeInput: number = 0;   // 0 to 1

  constructor(x: number, y: number, color: CarColor, id?: string) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.id = id ?? `car_${nextId++}`;
    this.hp = this.maxHp;
  }

  // Score-scaled stats
  get maxHp(): number {
    return D.BASE_MAX_HP + Math.min(this.score, S.SCALE_CAP) * S.HP_FACTOR;
  }

  get maxSpeed(): number {
    return V.BASE_MAX_SPEED + Math.min(this.score, S.SCALE_CAP) * S.SPEED_FACTOR;
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
        // Eliminated by timeout!
        this.die();
        return;
      }
    }

    // Score: +points per second alive
    this.score += S.PER_SECOND * dt;

    // Acceleration
    if (this.accelInput > 0) {
      if (this.speed < 0) {
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
        this.speed -= V.ACCELERATION * 0.5 * this.brakeInput * dt;
      }
    }

    // Friction
    if (this.speed > 0) {
      this.speed -= V.FRICTION * dt;
      if (this.speed < 0) this.speed = 0;
    } else if (this.speed < 0) {
      this.speed += V.FRICTION * dt;
      if (this.speed > 0) this.speed = 0;
    }

    // Cap speed (score-scaled)
    const ms = this.maxSpeed;
    const maxReverse = ms * 0.4;
    if (this.speed > ms) this.speed = ms;
    if (this.speed < -maxReverse) this.speed = -maxReverse;

    // Steering — always works, scales with speed
    const absSpeed = Math.abs(this.speed);
    const speedFactor = Math.max(0.3, Math.min(1, absSpeed / (ms * 0.5)));
    const steerDir = this.speed < 0 ? -1 : 1;
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

  // Die — score halved, start respawn timer
  die(): void {
    this.alive = false;
    this.isIt = false;
    this.itTimer = 0;
    this.speed = 0;
    this.score = Math.floor(this.score * S.DEATH_PENALTY);
    this.respawnTimer = R.TIMER;
  }

  // Take damage, return true if eliminated
  takeDamage(amount: number): boolean {
    this.hp -= amount;
    this.damageTaken += amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
      return true;
    }
    return false;
  }

  // Respawn at a position
  respawn(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.angle = Math.random() * Math.PI * 2;
    this.speed = 0;
    this.hp = this.maxHp;
    this.alive = true;
    this.isIt = false;
    this.itTimer = 0;
    this.immuneTimer = R.SPAWN_IMMUNITY;
    this.respawnTimer = 0;
    // Reset per-life stats
    this.tagsGiven = 0;
    this.tagsReceived = 0;
    this.damageDealt = 0;
    this.damageTaken = 0;
    this.kills = 0;
  }
}

// ── Car-to-car collision ──

export interface CollisionResult {
  a: Car;
  b: Car;
  damageToA: number;
  damageToB: number;
  tagTransfer: boolean;
}

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

      // Skip if either car is invulnerable
      if (a.immuneTimer > 0 || b.immuneTimer > 0) continue;

      const key = pairKey(a, b);
      if (collisionCooldowns.has(key)) continue;

      collisionCooldowns.set(key, D.COLLISION_COOLDOWN);

      // Capture speeds BEFORE bump
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

      // Clamp to arena
      const posA = arena.clampPosition(a.x, a.y, V.COLLISION_RADIUS);
      a.x = posA.x; a.y = posA.y;
      const posB = arena.clampPosition(b.x, b.y, V.COLLISION_RADIUS);
      b.x = posB.x; b.y = posB.y;

      // Speed reduction
      a.speed *= (1 - D.BUMP_SPEED_TRANSFER);
      b.speed *= (1 - D.BUMP_SPEED_TRANSFER);

      // Determine if each car is hitting with its front bumper
      // Front = angle from car toward the other is within ±FRONT_HIT_ANGLE of car's facing
      const angleAtoB = Math.atan2(dy, dx);   // dx,dy = b - a
      const angleBtoA = Math.atan2(-dy, -dx);
      const diffA = Math.abs(((angleAtoB - a.angle) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      const diffB = Math.abs(((angleBtoA - b.angle) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      const aFrontHit = diffA < D.FRONT_HIT_ANGLE;
      const bFrontHit = diffB < D.FRONT_HIT_ANGLE;

      // Damage based on pre-bump speed + "it" multiplier
      const damageFromA = speedA * D.DAMAGE_FACTOR * (a.isIt ? D.IT_DAMAGE_MULTIPLIER : 1);
      const damageFromB = speedB * D.DAMAGE_FACTOR * (b.isIt ? D.IT_DAMAGE_MULTIPLIER : 1);

      // Front-bumper rammers take reduced self-damage
      const selfDamageToA = damageFromB * (aFrontHit ? D.FRONT_HIT_SELF_DAMAGE : 1);
      const selfDamageToB = damageFromA * (bFrontHit ? D.FRONT_HIT_SELF_DAMAGE : 1);

      // Track damage dealt + score (full damage dealt counts for scoring)
      a.damageDealt += damageFromA;
      a.score += damageFromA * S.PER_DAMAGE;
      b.damageDealt += damageFromB;
      b.score += damageFromB * S.PER_DAMAGE;

      // Tag transfer
      let tagTransfer = false;
      if (a.isIt && a.alive && b.alive && speedA >= T.MIN_SPEED_TO_TAG) {
        a.tagCar(b);
        tagTransfer = true;
      } else if (b.isIt && b.alive && a.alive && speedB >= T.MIN_SPEED_TO_TAG) {
        b.tagCar(a);
        tagTransfer = true;
      }

      // Apply damage (reduced for front-bumper hits)
      const killedB = b.takeDamage(selfDamageToB);
      const killedA = a.takeDamage(selfDamageToA);

      // Kill bonus
      if (killedB) { a.kills++; a.score += S.KILL_BONUS; }
      if (killedA) { b.kills++; b.score += S.KILL_BONUS; }

      // Grace period
      a.immuneTimer = Math.max(a.immuneTimer, D.HIT_GRACE_PERIOD);
      b.immuneTimer = Math.max(b.immuneTimer, D.HIT_GRACE_PERIOD);

      results.push({ a, b, damageToA: selfDamageToA, damageToB: selfDamageToB, tagTransfer });
    }
  }

  return results;
}

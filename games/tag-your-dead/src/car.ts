// ── Car ──
// Shared vehicle physics for player and AI cars.
// Each car has position, angle, speed, controls, and tag state.

import { CONFIG } from './config.js';
import { Arena } from './arena.js';
import { CarState, CarColor } from './types.js';

const V = CONFIG.VEHICLE;
const T = CONFIG.TAG;

let nextId = 0;

export class Car implements CarState {
  id: string;
  x: number;
  y: number;
  angle: number = 0;
  speed: number = 0;
  isIt: boolean = false;
  alive: boolean = true;
  itTimer: number = 0;
  immuneTimer: number = 0;
  color: CarColor;

  // Stats for round
  tagsGiven: number = 0;
  tagsReceived: number = 0;
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
      this.speed += V.ACCELERATION * this.accelInput * dt;
    }

    // Braking
    if (this.brakeInput > 0) {
      this.speed -= V.BRAKING * this.brakeInput * dt;
      if (this.speed < 0) this.speed = 0;
    }

    // Friction
    if (this.speed > 0) {
      this.speed -= V.FRICTION * dt;
      if (this.speed < 0) this.speed = 0;
    }

    // Cap speed
    if (this.speed > V.MAX_SPEED) this.speed = V.MAX_SPEED;

    // Steering — scales with speed
    if (this.speed > 10) {
      const speedFactor = Math.min(1, this.speed / (V.MAX_SPEED * 0.5));
      this.angle += this.steerInput * V.TURN_SPEED * speedFactor * dt;
    }

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
      this.speed *= 0.5;
    }
    this.x = pos.x;
    this.y = pos.y;

    // Reset controls each frame
    this.steerInput = 0;
    this.accelInput = 0;
    this.brakeInput = 0;
  }

  // Check if this car can tag another
  canTag(other: Car): boolean {
    if (!this.isIt || !this.alive || !other.alive) return false;
    if (other.immuneTimer > 0) return false;
    if (this.speed < T.MIN_SPEED_TO_TAG) return false;

    const dx = this.x - other.x;
    const dy = this.y - other.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist < T.TAG_DISTANCE;
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

    // Bump both cars apart
    const dx = other.x - this.x;
    const dy = other.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    other.x += nx * 30;
    other.y += ny * 30;
    other.speed = Math.max(other.speed, 60);
    this.speed *= 0.3;
  }
}

import { CONFIG } from './config';
import { DesertWorld } from './desert-world';
import { Camera } from './camera';
import { renderPlayerCar, spritesLoaded } from './sprites';
import { spawnDust, spawnCollisionParticles, spawnWaterSplash, addTireTrack, triggerShake } from './effects';

const V = CONFIG.VEHICLE;
const DUST_SPEED_THRESHOLD = 80;

export class Vehicle {
  x: number;
  y: number;
  angle: number = 0;  // radians
  speed: number = 0;
  width: number = V.WIDTH;
  height: number = V.HEIGHT;

  // Pending controls set by soma on_tick
  private steerInput: number = 0;  // -1 to 1
  private accelInput: number = 0;  // 0 to 1
  private brakeInput: number = 0;  // 0 to 1

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  // Called by soma on_tick via me.steer/accelerate/brake
  steer(dir: number): void {
    this.steerInput = Math.max(-1, Math.min(1, dir));
  }

  accelerate(amount: number): void {
    this.accelInput = Math.max(0, Math.min(1, amount));
  }

  brake(amount: number): void {
    this.brakeInput = Math.max(0, Math.min(1, amount));
  }

  // Physics update
  update(dt: number, world: DesertWorld): void {
    // Terrain effect at current position
    const terrainSlowdown = world.getTerrainEffect(this.x, this.y);

    // Acceleration
    if (this.accelInput > 0) {
      this.speed += V.ACCELERATION * this.accelInput * dt;
    }

    // Braking
    if (this.brakeInput > 0) {
      this.speed -= V.BRAKING * this.brakeInput * dt;
      if (this.speed < 0) this.speed = 0;
    }

    // Friction (natural deceleration)
    if (this.speed > 0) {
      this.speed -= V.FRICTION * dt;
      if (this.speed < 0) this.speed = 0;
    }

    // Terrain friction — pulls speed toward terrain max
    const terrainMaxSpeed = V.MAX_SPEED * Math.max(V.MIN_SPEED_MULT, terrainSlowdown);
    if (this.speed > terrainMaxSpeed) {
      this.speed -= V.TERRAIN_FRICTION_MULT * (1 - terrainSlowdown) * dt;
      if (this.speed < terrainMaxSpeed) this.speed = terrainMaxSpeed;
    }

    // Cap at max speed
    if (this.speed > V.MAX_SPEED) {
      this.speed = V.MAX_SPEED;
    }

    // Steering — only when moving
    if (Math.abs(this.speed) > 10) {
      // Turn rate scales with speed (tighter at low speed would be weird for a car)
      const speedFactor = Math.min(1, this.speed / (V.MAX_SPEED * 0.5));
      this.angle += this.steerInput * V.TURN_SPEED * speedFactor * dt;
    }

    // Move
    const vx = Math.cos(this.angle) * this.speed * dt;
    const vy = Math.sin(this.angle) * this.speed * dt;
    const newX = this.x + vx;
    const newY = this.y + vy;

    // Obstacle collision
    const collision = world.checkObstacleCollision(newX, newY, Math.max(this.width, this.height) / 2);
    if (collision) {
      // Bounce
      const dx = newX - collision.x;
      const dy = newY - collision.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;

      // Push out
      const overlap = collision.radius + Math.max(this.width, this.height) / 2 - dist;
      this.x += nx * (overlap + V.BOUNCE_DISTANCE);
      this.y += ny * (overlap + V.BOUNCE_DISTANCE);

      // Effects
      const impactSpeed = this.speed;
      this.speed *= Math.abs(V.BOUNCE_FACTOR);

      if (impactSpeed > 40) {
        if (collision.type === 'water') {
          spawnWaterSplash(this.x, this.y, 10);
        } else {
          spawnCollisionParticles(this.x, this.y, 6);
        }
        triggerShake(Math.min(impactSpeed / 20, 8), 0.2);
      }
    } else {
      this.x = newX;
      this.y = newY;
    }

    // Tire tracks + dust
    if (this.speed > DUST_SPEED_THRESHOLD) {
      spawnDust(this.x, this.y, this.angle, this.speed, 2);
    }
    addTireTrack('player', this.x, this.y, this.angle, this.speed, 'player');

    // World bounds
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    if (this.x < halfW) { this.x = halfW; this.speed *= 0.5; }
    if (this.x > world.width - halfW) { this.x = world.width - halfW; this.speed *= 0.5; }
    if (this.y < halfH) { this.y = halfH; this.speed *= 0.5; }
    if (this.y > world.height - halfH) { this.y = world.height - halfH; this.speed *= 0.5; }
  }

  resetControls(): void {
    this.steerInput = 0;
    this.accelInput = 0;
    this.brakeInput = 0;
  }

  render(ctx: CanvasRenderingContext2D, camera: Camera): void {
    if (!camera.isVisible(this.x, this.y, 40)) return;

    const screen = camera.worldToScreen(this.x, this.y);

    if (spritesLoaded()) {
      renderPlayerCar(ctx, screen.x, screen.y, this.angle);
    } else {
      // Fallback: colored rectangle
      ctx.save();
      ctx.translate(screen.x, screen.y);
      ctx.rotate(this.angle);
      ctx.fillStyle = '#c03030';
      ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
      ctx.fillStyle = '#ff8080';
      ctx.beginPath();
      ctx.moveTo(this.width / 2, 0);
      ctx.lineTo(this.width / 2 - 6, -4);
      ctx.lineTo(this.width / 2 - 6, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

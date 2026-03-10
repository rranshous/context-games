// ── Pursuer Entity ──
// A cop vehicle with soma-driven signal handling.
// Same vehicle physics as the driver. Signal-based on_tick execution.

import { Position, PursuerSoma, PursuerSignal, PursuerMode, PursuerBroadcast } from './types';
import { DesertWorld } from './desert-world';
import { CONFIG } from './config';
import { Camera } from './camera';

const P = CONFIG.PURSUER;

// ── Compiled handler cache ──

const _handlerCache = new Map<string, {
  code: string;
  fn: ((type: string, data: any, me: any) => Promise<void>) | null;
}>();

function compileHandler(soma: PursuerSoma): ((type: string, data: any, me: any) => Promise<void>) | null {
  const cached = _handlerCache.get(soma.id);
  if (cached && cached.code === soma.on_tick) return cached.fn;

  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction(
      'type', 'data', 'me',
      `${soma.on_tick}\nreturn onSignal(type, data, me);`,
    );
    _handlerCache.set(soma.id, { code: soma.on_tick, fn });
    return fn;
  } catch (err) {
    console.error(`[PURSUER ${soma.name}] Compilation error:`, err);
    _handlerCache.set(soma.id, { code: soma.on_tick, fn: null });
    return null;
  }
}

export function clearPursuerCompileCache(): void {
  _handlerCache.clear();
}

// ── Pursuer Entity ──

export class Pursuer {
  readonly soma: PursuerSoma;

  // Physics state
  x: number;
  y: number;
  angle: number = Math.random() * Math.PI * 2;
  speed: number = 0;

  // Controls (set by signal handler each frame)
  private steerInput: number = 0;
  private accelInput: number = 0;
  private brakeInput: number = 0;

  // Signal state
  mode: PursuerMode = 'patrol';
  private canSeeDriver: boolean = false;
  private lastDriverPos: Position | null = null;
  private lostTimer: number = 0; // seconds since lost sight

  // Patrol
  private patrolWaypoints: Position[] = [];
  private patrolIndex: number = 0;

  // Radio — outbound broadcasts this tick
  pendingBroadcasts: PursuerBroadcast[] = [];

  constructor(soma: PursuerSoma, spawnX: number, spawnY: number, world: DesertWorld) {
    this.soma = soma;
    this.x = spawnX;
    this.y = spawnY;
    this.generatePatrolWaypoints(world);
  }

  private generatePatrolWaypoints(world: DesertWorld): void {
    // Generate 4-6 waypoints spread across the map
    const count = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const margin = 300;
      let x: number, y: number;
      let attempts = 0;
      do {
        x = margin + Math.random() * (world.width - margin * 2);
        y = margin + Math.random() * (world.height - margin * 2);
        attempts++;
      } while (world.checkObstacleCollision(x, y, 30) && attempts < 20);
      this.patrolWaypoints.push({ x, y });
    }
  }

  // ── Signal Dispatch ──

  update(
    dt: number,
    driverPos: Position,
    driverSpeed: number,
    driverAngle: number,
    world: DesertWorld,
    incomingRadio: PursuerBroadcast[],
    runTimer: number,
  ): void {
    // Clear outbound broadcasts
    this.pendingBroadcasts = [];

    // Reset controls
    this.steerInput = 0;
    this.accelInput = 0;
    this.brakeInput = 0;

    // Detection check
    const dx = driverPos.x - this.x;
    const dy = driverPos.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const wasVisible = this.canSeeDriver;
    this.canSeeDriver = dist < P.SPOT_RANGE;

    // Determine signal
    let signal: PursuerSignal;
    let signalData: any;

    if (!wasVisible && this.canSeeDriver) {
      // Just spotted
      signal = 'driver_spotted';
      this.mode = 'pursuing';
      this.lastDriverPos = { ...driverPos };
      this.lostTimer = 0;
      signalData = {
        driverPosition: { ...driverPos },
        driverSpeed,
        driverAngle,
        ownPosition: { x: this.x, y: this.y },
        distance: dist,
      };
    } else if (wasVisible && !this.canSeeDriver) {
      // Just lost
      signal = 'driver_lost';
      this.mode = 'searching';
      this.lostTimer = 0;
      signalData = {
        lastKnownPosition: this.lastDriverPos ? { ...this.lastDriverPos } : { ...driverPos },
        ownPosition: { x: this.x, y: this.y },
        distance: dist,
      };
    } else if (this.canSeeDriver) {
      // Still tracking
      signal = 'driver_spotted';
      this.mode = 'pursuing';
      this.lastDriverPos = { ...driverPos };
      this.lostTimer = 0;
      signalData = {
        driverPosition: { ...driverPos },
        driverSpeed,
        driverAngle,
        ownPosition: { x: this.x, y: this.y },
        distance: dist,
      };
    } else if (incomingRadio.length > 0) {
      // Radio from ally — use latest
      const msg = incomingRadio[incomingRadio.length - 1];
      signal = 'ally_signal';
      signalData = {
        allyId: msg.from,
        signalType: msg.signalType,
        signalData: msg.data,
        ownPosition: { x: this.x, y: this.y },
      };
    } else {
      // Default tick
      signal = 'tick';
      if (this.mode === 'searching') {
        this.lostTimer += dt;
        if (this.lostTimer > P.LOSE_TIME) {
          this.mode = 'patrol';
        }
      }

      // Advance patrol waypoint if close
      if (this.mode === 'patrol' && this.patrolWaypoints.length > 0) {
        const wp = this.patrolWaypoints[this.patrolIndex];
        const wdx = wp.x - this.x;
        const wdy = wp.y - this.y;
        if (Math.sqrt(wdx * wdx + wdy * wdy) < 80) {
          this.patrolIndex = (this.patrolIndex + 1) % this.patrolWaypoints.length;
        }
      }

      signalData = {
        ownPosition: { x: this.x, y: this.y },
        state: this.mode,
        tick: runTimer,
        patrolWaypoint: this.patrolWaypoints[this.patrolIndex] || null,
      };
    }

    // Execute signal handler
    this.executeSignal(signal, signalData);

    // Apply physics
    this.applyPhysics(dt, world);
  }

  private executeSignal(signal: PursuerSignal, data: any): void {
    const fn = compileHandler(this.soma);
    if (!fn) return;

    const me = this.buildMeAPI();

    try {
      // Fire and forget — we don't await the full promise since it's per-frame
      // Instead, run synchronously with a microtask timeout
      const promise = fn(signal, data, me);

      // Race against timeout
      Promise.race([
        promise,
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('signal handler timeout')), P.SIGNAL_TIMEOUT),
        ),
      ]).catch(err => {
        console.warn(`[PURSUER ${this.soma.name}] Signal handler error:`, err);
      });
    } catch (err) {
      console.warn(`[PURSUER ${this.soma.name}] Signal handler error:`, err);
    }
  }

  private buildMeAPI(): any {
    const self = this;
    return {
      position: { x: self.x, y: self.y },
      speed: self.speed,
      angle: self.angle,

      steer: (dir: number) => { self.steerInput = Math.max(-1, Math.min(1, dir)); },
      accelerate: (amt: number) => { self.accelInput = Math.max(0, Math.min(1, amt)); },
      brake: (amt: number) => { self.brakeInput = Math.max(0, Math.min(1, amt)); },

      memory: {
        read: () => self.soma.memory,
        write: (text: string) => { self.soma.memory = text; },
      },
      identity: {
        read: () => self.soma.identity,
      },
      on_tick: {
        read: () => self.soma.on_tick,
      },

      // Helpers
      distanceTo: (pos: Position) => {
        const dx = pos.x - self.x;
        const dy = pos.y - self.y;
        return Math.sqrt(dx * dx + dy * dy);
      },
      angleTo: (pos: Position) => {
        return Math.atan2(pos.y - self.y, pos.x - self.x);
      },

      // Radio broadcast
      broadcast: (msg: { type: string; position?: Position; data?: any }) => {
        self.pendingBroadcasts.push({
          from: self.soma.id,
          signalType: msg.type,
          data: msg as Record<string, unknown>,
        });
      },
    };
  }

  // ── Physics (same as Vehicle but with pursuer speed caps) ──

  private applyPhysics(dt: number, world: DesertWorld): void {
    const maxSpeed = this.mode === 'pursuing' ? P.CHASE_SPEED : P.PATROL_SPEED;
    const V = CONFIG.VEHICLE;

    // Terrain
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

    // Friction
    if (this.speed > 0) {
      this.speed -= V.FRICTION * dt;
      if (this.speed < 0) this.speed = 0;
    }

    // Terrain friction
    const terrainMax = maxSpeed * Math.max(V.MIN_SPEED_MULT, terrainSlowdown);
    if (this.speed > terrainMax) {
      this.speed -= V.TERRAIN_FRICTION_MULT * (1 - terrainSlowdown) * dt;
      if (this.speed < terrainMax) this.speed = terrainMax;
    }

    // Cap
    if (this.speed > maxSpeed) this.speed = maxSpeed;

    // Steering
    if (Math.abs(this.speed) > 10) {
      const speedFactor = Math.min(1, this.speed / (maxSpeed * 0.5));
      this.angle += this.steerInput * V.TURN_SPEED * speedFactor * dt;
    }

    // Move
    const vx = Math.cos(this.angle) * this.speed * dt;
    const vy = Math.sin(this.angle) * this.speed * dt;
    const newX = this.x + vx;
    const newY = this.y + vy;

    // Obstacle collision
    const collision = world.checkObstacleCollision(newX, newY, Math.max(P.WIDTH, P.HEIGHT) / 2);
    if (collision) {
      const cdx = newX - collision.x;
      const cdy = newY - collision.y;
      const cdist = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
      const nx = cdx / cdist;
      const ny = cdy / cdist;
      const overlap = collision.radius + Math.max(P.WIDTH, P.HEIGHT) / 2 - cdist;
      this.x += nx * (overlap + V.BOUNCE_DISTANCE);
      this.y += ny * (overlap + V.BOUNCE_DISTANCE);
      this.speed *= Math.abs(V.BOUNCE_FACTOR);
    } else {
      this.x = newX;
      this.y = newY;
    }

    // World bounds
    const halfW = P.WIDTH / 2;
    const halfH = P.HEIGHT / 2;
    if (this.x < halfW) { this.x = halfW; this.speed *= 0.5; }
    if (this.x > world.width - halfW) { this.x = world.width - halfW; this.speed *= 0.5; }
    if (this.y < halfH) { this.y = halfH; this.speed *= 0.5; }
    if (this.y > world.height - halfH) { this.y = world.height - halfH; this.speed *= 0.5; }
  }

  // ── Rendering ──

  render(ctx: CanvasRenderingContext2D, camera: Camera): void {
    if (!camera.isVisible(this.x, this.y, 40)) return;

    const screen = camera.worldToScreen(this.x, this.y);

    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(this.angle);

    // Cop car body — dark blue
    ctx.fillStyle = this.mode === 'pursuing' ? '#cc2222' : '#2244aa';
    ctx.fillRect(-P.WIDTH / 2, -P.HEIGHT / 2, P.WIDTH, P.HEIGHT);

    // Direction indicator
    ctx.fillStyle = this.mode === 'pursuing' ? '#ff6666' : '#6688cc';
    ctx.beginPath();
    ctx.moveTo(P.WIDTH / 2, 0);
    ctx.lineTo(P.WIDTH / 2 - 6, -4);
    ctx.lineTo(P.WIDTH / 2 - 6, 4);
    ctx.closePath();
    ctx.fill();

    // Outline
    ctx.strokeStyle = this.mode === 'pursuing' ? '#881111' : '#112255';
    ctx.lineWidth = 1;
    ctx.strokeRect(-P.WIDTH / 2, -P.HEIGHT / 2, P.WIDTH, P.HEIGHT);

    ctx.restore();

    // Name label above
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = this.mode === 'pursuing' ? '#ff6666' : '#6688cc';
    ctx.fillText(this.soma.name, screen.x, screen.y - 14);
  }

  // ── Catch check ──

  distanceToDriver(driverX: number, driverY: number): number {
    const dx = this.x - driverX;
    const dy = this.y - driverY;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

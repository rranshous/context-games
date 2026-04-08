// ── Car ──
// Shared vehicle physics for player and AI cars.
// Score-based stat scaling: higher score = more HP and speed.

import { CONFIG } from './config.js';
import { Arena } from './arena.js';
import { CarState, CarColor, TrailPoint, LifeEvent } from './types.js';

const V = CONFIG.VEHICLE;
const T = CONFIG.TAG;
const D = CONFIG.DAMAGE;
const S = CONFIG.SCORE;
const R = CONFIG.RESPAWN;
const B = CONFIG.BOOST;

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
  rockHits: number = 0;
  cactusHits: number = 0;
  barrelHits: number = 0;
  wallHits: number = 0;
  carCollisions: number = 0;
  timeAtWall: number = 0;      // seconds spent pressed against arena edge
  speedAccum: number = 0;      // accumulated |speed| for averaging
  speedSamples: number = 0;    // frame count for speed averaging

  // ── Experiment behavioral metrics ──
  timeAsIt: number = 0;        // seconds spent as IT this life
  private _itStartTime: number = 0;  // gameTime when became IT (0 = not tracking)
  tagShedTimes: number[] = [];  // seconds from becoming IT to passing it
  boostCount: number = 0;       // total boosts fired this life
  effectiveBoosts: number = 0;  // boosts that led to tag/kill within 3s
  private _recentBoostTime: number = -999;  // last boost gameTime (for effectiveness tracking)
  lifeStartTime: number = 0;   // gameTime when this life started (set on spawn)

  // Kill attribution — who last dealt damage to this car
  lastAttackerId: string | null = null;

  // Obstacle hit tracking (for event log)
  _lastObstacleHit: string | null = null;
  private _obstacleCooldown: number = 0; // prevent counting same obstacle multiple frames

  // Per-life trail + events (for reflection map)
  trail: TrailPoint[] = [];
  lifeEvents: LifeEvent[] = [];
  private _trailTimer: number = 0;

  // Boost
  boostTimer: number = 0;     // remaining boost duration (0 = not boosting)
  boostCooldown: number = 0;  // cooldown before next boost

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
    const base = V.BASE_MAX_SPEED + Math.min(this.score, S.SCALE_CAP) * S.SPEED_FACTOR;
    return this.isIt ? base * CONFIG.IT.SPEED_BONUS : base;
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

  boost(): void {
    if (this.boostCooldown <= 0 && this.boostTimer <= 0) {
      this.boostTimer = B.DURATION;
      this.boostCooldown = this.isIt ? B.COOLDOWN * B.IT_COOLDOWN_MULT : B.COOLDOWN;
    }
  }

  get isBoosting(): boolean {
    return this.boostTimer > 0;
  }

  /** 0 = ready, 1 = full cooldown */
  get boostCooldownFrac(): number {
    const cd = this.isIt ? B.COOLDOWN * B.IT_COOLDOWN_MULT : B.COOLDOWN;
    return Math.max(0, this.boostCooldown / cd);
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

    // Boost timers
    if (this.boostTimer > 0) this.boostTimer -= dt;
    if (this.boostCooldown > 0) this.boostCooldown -= dt;

    // Score: +points per second alive
    this.score += S.PER_SECOND * dt;

    // Acceleration (boosted when boosting)
    const accelMult = this.boostTimer > 0 ? B.ACCEL_MULT : 1;
    if (this.accelInput > 0) {
      if (this.speed < 0) {
        this.speed += V.BRAKING * this.accelInput * dt;
        if (this.speed > 0) this.speed = 0;
      } else {
        this.speed += V.ACCELERATION * accelMult * this.accelInput * dt;
      }
    }
    // Boost also accelerates even without throttle input
    if (this.boostTimer > 0 && this.accelInput === 0) {
      this.speed += V.ACCELERATION * B.ACCEL_MULT * dt;
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

    // Friction (increased in rough sand)
    const inSand = arena.isInSand(this.x, this.y);
    const friction = V.FRICTION * (inSand ? D.SAND_FRICTION_MULT : 1);
    if (this.speed > 0) {
      this.speed -= friction * dt;
      if (this.speed < 0) this.speed = 0;
    } else if (this.speed < 0) {
      this.speed += friction * dt;
      if (this.speed > 0) this.speed = 0;
    }

    // HP-based speed penalty: up to 20% slower at critical HP
    const hpFrac = this.hp / this.maxHp;
    const hpSpeedMult = 0.8 + 0.2 * Math.min(1, hpFrac / 0.5); // 1.0 above 50% HP, drops to 0.8 at 0 HP

    // Cap speed (score-scaled, higher cap during boost, reduced when damaged)
    const ms = this.maxSpeed * (this.boostTimer > 0 ? B.SPEED_MULT : 1) * hpSpeedMult;
    const maxReverse = this.maxSpeed * 0.4 * hpSpeedMult;
    if (this.speed > ms) this.speed = ms;
    if (this.speed < -maxReverse) this.speed = -maxReverse;

    // Steering — always works, scales with speed
    const absSpeed = Math.abs(this.speed);
    const speedFactor = Math.max(0.3, Math.min(1, absSpeed / (ms * 0.5)));
    const steerDir = this.speed < 0 ? -1 : 1;
    // Damaged cars pull to one side (deterministic per car ID)
    const listBias = hpFrac < 0.5 ? (1 - hpFrac * 2) * 0.15 * (parseInt(this.id.replace(/\D/g, '') || '0') % 2 === 0 ? 1 : -1) : 0;
    this.angle += (this.steerInput + listBias) * V.TURN_SPEED * speedFactor * steerDir * dt;

    // Move
    const vx = Math.cos(this.angle) * this.speed * dt;
    const vy = Math.sin(this.angle) * this.speed * dt;
    let newX = this.x + vx;
    let newY = this.y + vy;

    // Obstacle collision — rocks bounce + damage, cacti/barrels slow + pass through
    if (this._obstacleCooldown > 0) this._obstacleCooldown -= dt;
    const collision = arena.checkObstacleCollision(newX, newY, V.COLLISION_RADIUS);
    if (collision) {
      if (collision.type === 'rock') {
        // Rock: solid bounce + damage (wrap-aware delta for normal)
        const dx = arena.wrapDx(newX - collision.x);
        const dy = arena.wrapDy(newY - collision.y);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;

        const overlap = collision.radius + V.COLLISION_RADIUS - dist;
        this.x += nx * (overlap + V.BOUNCE_DISTANCE);
        this.y += ny * (overlap + V.BOUNCE_DISTANCE);

        // Rock damage: 20% of what a car collision would deal, front bumper applies
        const impactSpeed = Math.abs(this.speed);
        const rockDamage = impactSpeed * D.DAMAGE_FACTOR * D.ROCK_DAMAGE_FACTOR;
        const angleToRock = Math.atan2(arena.wrapDy(collision.y - this.y), arena.wrapDx(collision.x - this.x));
        const angleDiff = Math.abs(((angleToRock - this.angle) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
        const frontHit = angleDiff < D.FRONT_HIT_ANGLE;
        const finalDamage = rockDamage * (frontHit ? D.FRONT_HIT_SELF_DAMAGE : 1) * (this.isIt ? CONFIG.IT.DAMAGE_TAKEN_MULT : 1);
        if (finalDamage > 0.5) {
          this.takeDamage(finalDamage);
          this.damageTaken += finalDamage;
        }

        this.speed *= Math.abs(V.BOUNCE_FACTOR);
        if (this._obstacleCooldown <= 0) { this.rockHits++; this._obstacleCooldown = 0.5; }
        this._lastObstacleHit = collision.type;
      } else {
        // Cactus/barrel: one-time slowdown on entry, then drive through
        this.x = newX;
        this.y = newY;
        if (this._obstacleCooldown <= 0) {
          this.speed *= D.SOFT_OBSTACLE_SPEED_MULT;
          if (collision.type === 'cactus') this.cactusHits++;
          else this.barrelHits++;
          this._obstacleCooldown = 0.5;
        }
        this._lastObstacleHit = collision.type;
      }
    } else {
      this.x = newX;
      this.y = newY;
      this._lastObstacleHit = null;
    }

    // Toroidal wrapping — drive off one edge, appear on the opposite
    const wrapped = arena.wrapPosition(this.x, this.y);
    this.x = wrapped.x;
    this.y = wrapped.y;

    // Track average speed
    this.speedAccum += Math.abs(this.speed);
    this.speedSamples++;

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

  /** Track IT time accumulation — call every frame from game loop */
  updateItTracking(dt: number, gameTime: number): void {
    if (!this.alive) return;
    if (this.isIt) {
      this.timeAsIt += dt;
      if (this._itStartTime === 0) {
        this._itStartTime = gameTime; // just became IT
      }
    } else if (this._itStartTime > 0) {
      // Was IT, now not — shed the tag
      this.tagShedTimes.push(gameTime - this._itStartTime);
      this._itStartTime = 0;
    }
  }

  /** Record a boost for effectiveness tracking */
  recordBoost(gameTime: number): void {
    this.boostCount++;
    this._recentBoostTime = gameTime;
  }

  /** Check if a recent boost led to this event (tag or kill within 3s) */
  checkBoostEffectiveness(gameTime: number): void {
    if (gameTime - this._recentBoostTime <= 3) {
      this.effectiveBoosts++;
      this._recentBoostTime = -999; // don't double-count
    }
  }

  /** Sample position for reflection trail — call from game loop */
  sampleTrail(gameTime: number, dt: number): void {
    if (!this.alive) return;
    this._trailTimer += dt;
    if (this._trailTimer >= 0.5) {
      this._trailTimer -= 0.5;
      // Cap at 200 samples (100s of life — more than enough)
      if (this.trail.length < 200) {
        this.trail.push({ time: gameTime, x: this.x, y: this.y, isIt: this.isIt });
      }
    }
  }

  /** Record a significant life event */
  addLifeEvent(time: number, description: string): void {
    // Cap at 30 events per life
    if (this.lifeEvents.length < 30) {
      this.lifeEvents.push({ time, x: this.x, y: this.y, description });
    }
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
    this.rockHits = 0;
    this.cactusHits = 0;
    this.barrelHits = 0;
    this.wallHits = 0;
    this.carCollisions = 0;
    this.timeAtWall = 0;
    this.speedAccum = 0;
    this.speedSamples = 0;
    this.lastAttackerId = null;
    this.boostTimer = 0;
    this.boostCooldown = 0;
    this.trail = [];
    this.lifeEvents = [];
    this._trailTimer = 0;
    // Experiment metrics
    this.timeAsIt = 0;
    this._itStartTime = 0;
    this.tagShedTimes = [];
    this.boostCount = 0;
    this.effectiveBoosts = 0;
    this._recentBoostTime = -999;
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

      // Wrap-aware distance
      const dx = arena.wrapDx(b.x - a.x);
      const dy = arena.wrapDy(b.y - a.y);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= D.COLLISION_DISTANCE) continue;

      // Skip if either car is invulnerable
      if (a.immuneTimer > 0 || b.immuneTimer > 0) continue;

      const key = pairKey(a, b);
      if (collisionCooldowns.has(key)) continue;

      collisionCooldowns.set(key, D.COLLISION_COOLDOWN);
      a.carCollisions++;
      b.carCollisions++;

      // Capture speeds BEFORE bump
      const speedA = Math.abs(a.speed);
      const speedB = Math.abs(b.speed);

      // Bump apart (using wrapped normal)
      const d = dist || 1;
      const nx = dx / d;
      const ny = dy / d;
      const overlap = D.COLLISION_DISTANCE - dist;
      const push = (overlap / 2) + D.BUMP_FORCE;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;

      // Wrap to arena (toroidal)
      const posA = arena.wrapPosition(a.x, a.y);
      a.x = posA.x; a.y = posA.y;
      const posB = arena.wrapPosition(b.x, b.y);
      b.x = posB.x; b.y = posB.y;

      // Speed reduction
      a.speed *= (1 - D.BUMP_SPEED_TRANSFER);
      b.speed *= (1 - D.BUMP_SPEED_TRANSFER);

      // Determine if each car is hitting with its front bumper
      // Front = angle from car toward the other is within ±FRONT_HIT_ANGLE of car's facing
      // dx,dy already wrap-aware (computed above)
      const angleAtoB = Math.atan2(dy, dx);
      const angleBtoA = Math.atan2(-dy, -dx);
      const diffA = Math.abs(((angleAtoB - a.angle) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      const diffB = Math.abs(((angleBtoA - b.angle) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      const aFrontHit = diffA < D.FRONT_HIT_ANGLE;
      const bFrontHit = diffB < D.FRONT_HIT_ANGLE;

      // Damage based on pre-bump speed + "it" multiplier
      const damageFromA = speedA * D.DAMAGE_FACTOR * (a.isIt ? D.IT_DAMAGE_MULTIPLIER : 1);
      const damageFromB = speedB * D.DAMAGE_FACTOR * (b.isIt ? D.IT_DAMAGE_MULTIPLIER : 1);

      // Front-bumper rammers take reduced self-damage; IT cars take +35% more
      const itVuln = CONFIG.IT.DAMAGE_TAKEN_MULT;
      const selfDamageToA = damageFromB * (aFrontHit ? D.FRONT_HIT_SELF_DAMAGE : 1) * (a.isIt ? itVuln : 1);
      const selfDamageToB = damageFromA * (bFrontHit ? D.FRONT_HIT_SELF_DAMAGE : 1) * (b.isIt ? itVuln : 1);

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

      // Capture "it" status before damage (die() clears isIt)
      const bWasIt = b.isIt;
      const aWasIt = a.isIt;

      // Track last attacker for kill attribution
      if (selfDamageToB > 0) b.lastAttackerId = a.id;
      if (selfDamageToA > 0) a.lastAttackerId = b.id;

      // Apply damage (reduced for front-bumper hits)
      const killedB = b.takeDamage(selfDamageToB);
      const killedA = a.takeDamage(selfDamageToA);

      // Kill bonus (3x for killing the "it" car)
      if (killedB) { a.kills++; a.score += S.KILL_BONUS * (bWasIt ? 3 : 1); }
      if (killedA) { b.kills++; b.score += S.KILL_BONUS * (aWasIt ? 3 : 1); }

      // Grace period
      a.immuneTimer = Math.max(a.immuneTimer, D.HIT_GRACE_PERIOD);
      b.immuneTimer = Math.max(b.immuneTimer, D.HIT_GRACE_PERIOD);

      results.push({ a, b, damageToA: selfDamageToA, damageToB: selfDamageToB, tagTransfer });
    }
  }

  return results;
}

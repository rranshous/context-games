// src/config.ts
var CONFIG = {
  CANVAS: { WIDTH: 960, HEIGHT: 720 },
  // Tighter arena for derby action
  ARENA: {
    WIDTH: 2e3,
    HEIGHT: 1500,
    TILE_SIZE: 32,
    ROCK_COUNT: 25,
    CACTUS_COUNT: 15,
    BARREL_COUNT: 8
  },
  VEHICLE: {
    BASE_MAX_SPEED: 200,
    ACCELERATION: 300,
    BRAKING: 400,
    FRICTION: 80,
    TURN_SPEED: 3,
    WIDTH: 20,
    HEIGHT: 12,
    COLLISION_RADIUS: 12,
    BOUNCE_FACTOR: -0.4,
    BOUNCE_DISTANCE: 4
  },
  TAG: {
    IT_TIMEOUT: 25,
    // seconds before "it" is eliminated
    TAG_DISTANCE: 30,
    // how close to tag someone
    TAG_IMMUNITY: 1.5,
    // seconds of immunity after being tagged
    MIN_SPEED_TO_TAG: 40,
    // must be moving to tag
    CAR_COUNT: 5
    // AI cars
  },
  DAMAGE: {
    BASE_MAX_HP: 100,
    COLLISION_DISTANCE: 28,
    // car-to-car collision check radius
    DAMAGE_FACTOR: 0.15,
    // damage = speed * factor (200 speed = 30 base damage)
    IT_DAMAGE_MULTIPLIER: 3,
    // "it" cars deal 3x damage
    COLLISION_COOLDOWN: 0.3,
    // seconds between damage from same pair
    BUMP_FORCE: 20,
    // push-apart distance on collision
    BUMP_SPEED_TRANSFER: 0.3,
    // speed reduction on bump
    HIT_GRACE_PERIOD: 1,
    // seconds of invulnerability after being hit
    FRONT_HIT_ANGLE: Math.PI / 3,
    // ±60° cone counts as "front bumper"
    FRONT_HIT_SELF_DAMAGE: 0.1,
    // front-bumper rammer takes only 10% damage
    ROCK_DAMAGE_FACTOR: 0.2,
    // rock hit damage = 20% of equivalent car collision
    SOFT_OBSTACLE_SPEED_MULT: 0.6,
    // cacti/barrels slow you to 60% speed on pass-through (one-time)
    SAND_FRICTION_MULT: 3
    // rough sand multiplies friction by 3x (gradual slowdown)
  },
  RESPAWN: {
    TIMER: 5,
    // seconds before respawn
    MIN_DISTANCE: 200,
    // minimum distance from other cars on respawn
    SPAWN_IMMUNITY: 2
    // seconds of immunity after respawn
  },
  SCORE: {
    PER_SECOND: 1,
    // points per second alive
    PER_DAMAGE: 0.5,
    // points per damage dealt
    KILL_BONUS: 50,
    // points for destroying a car
    DEATH_PENALTY: 0.5,
    // multiply score by this on death
    // Stat scaling: stat = base + min(score, CAP) * FACTOR
    HP_FACTOR: 0.5,
    // score 200 → +100 HP (200 total)
    SPEED_FACTOR: 0.15,
    // score 200 → +30 speed (230 total)
    SCALE_CAP: 200
    // score above this doesn't increase stats further
  },
  BOOST: {
    SPEED_MULT: 1.8,
    // boost multiplies max speed by this
    DURATION: 0.4,
    // seconds of boost
    COOLDOWN: 3,
    // seconds before boost recharges
    ACCEL_MULT: 3,
    // acceleration multiplier during boost
    IT_COOLDOWN_MULT: 0.5
    // IT cars recharge boost 2x faster
  },
  IT: {
    SPEED_BONUS: 1.15
    // IT car gets 15% higher max speed
  },
  CAMERA: {
    SMOOTHING: 0.08
  },
  SOMA: {
    ON_TICK_TIMEOUT: 50
    // ms max for on_tick execution
  },
  API_ENDPOINT: "/api/inference/anthropic/messages"
};

// src/arena.ts
var A = CONFIG.ARENA;
function seededRng(seed) {
  let s = seed;
  return () => {
    s = s * 1664525 + 1013904223 & 4294967295;
    return (s >>> 0) / 4294967295;
  };
}
var Arena = class {
  width = A.WIDTH;
  height = A.HEIGHT;
  obstacles = [];
  // Rough sand patches — slow cars that drive through them
  sandPatches = [];
  constructor(seed = 42) {
    const rng = seededRng(seed);
    this.generate(rng);
  }
  generate(rng) {
    const center = { x: this.width / 2, y: this.height / 2 };
    const clearRadius = 200;
    for (let i = 0; i < A.ROCK_COUNT; i++) {
      const x = rng() * this.width;
      const y = rng() * this.height;
      if (this.wrapDistance(x, y, center.x, center.y) < clearRadius) continue;
      this.obstacles.push({ x, y, radius: 14 + rng() * 12, type: "rock" });
    }
    for (let i = 0; i < A.CACTUS_COUNT; i++) {
      const x = rng() * this.width;
      const y = rng() * this.height;
      if (this.wrapDistance(x, y, center.x, center.y) < clearRadius) continue;
      this.obstacles.push({ x, y, radius: 8 + rng() * 6, type: "cactus" });
    }
    for (let i = 0; i < A.BARREL_COUNT; i++) {
      const x = rng() * this.width;
      const y = rng() * this.height;
      if (this.wrapDistance(x, y, center.x, center.y) < clearRadius) continue;
      this.obstacles.push({ x, y, radius: 10, type: "barrel" });
    }
    for (let i = 0; i < 20; i++) {
      const x = rng() * this.width;
      const y = rng() * this.height;
      if (this.wrapDistance(x, y, center.x, center.y) < clearRadius) continue;
      this.sandPatches.push({ x, y, radius: 30 + rng() * 40 });
    }
  }
  checkObstacleCollision(x, y, radius) {
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
  isInSand(x, y) {
    for (const sp of this.sandPatches) {
      const dx = this.wrapDx(x - sp.x);
      const dy = this.wrapDy(y - sp.y);
      if (dx * dx + dy * dy < sp.radius * sp.radius) return true;
    }
    return false;
  }
  // Toroidal wrapping — position modulo arena size
  wrapX(x) {
    return (x % this.width + this.width) % this.width;
  }
  wrapY(y) {
    return (y % this.height + this.height) % this.height;
  }
  wrapPosition(x, y) {
    return { x: this.wrapX(x), y: this.wrapY(y) };
  }
  // Shortest-path delta (for distance/angle calculations across seam)
  wrapDx(dx) {
    if (dx > this.width / 2) return dx - this.width;
    if (dx < -this.width / 2) return dx + this.width;
    return dx;
  }
  wrapDy(dy) {
    if (dy > this.height / 2) return dy - this.height;
    if (dy < -this.height / 2) return dy + this.height;
    return dy;
  }
  wrapDistance(x1, y1, x2, y2) {
    const dx = this.wrapDx(x1 - x2);
    const dy = this.wrapDy(y1 - y2);
    return Math.sqrt(dx * dx + dy * dy);
  }
};

// src/car.ts
var V = CONFIG.VEHICLE;
var T = CONFIG.TAG;
var D = CONFIG.DAMAGE;
var S = CONFIG.SCORE;
var R = CONFIG.RESPAWN;
var B = CONFIG.BOOST;
var nextId = 0;
var Car = class {
  id;
  x;
  y;
  angle = 0;
  speed = 0;
  hp;
  isIt = false;
  alive = true;
  itTimer = 0;
  immuneTimer = 0;
  color;
  // Persistent score — survives across lives
  score = 0;
  // Respawn
  respawnTimer = 0;
  // countdown when dead (0 = not respawning)
  // Stats for current life (reset on respawn)
  tagsGiven = 0;
  tagsReceived = 0;
  damageDealt = 0;
  damageTaken = 0;
  kills = 0;
  rockHits = 0;
  cactusHits = 0;
  barrelHits = 0;
  wallHits = 0;
  carCollisions = 0;
  timeAtWall = 0;
  // seconds spent pressed against arena edge
  speedAccum = 0;
  // accumulated |speed| for averaging
  speedSamples = 0;
  // frame count for speed averaging
  // Kill attribution — who last dealt damage to this car
  lastAttackerId = null;
  // Obstacle hit tracking (for event log)
  _lastObstacleHit = null;
  _obstacleCooldown = 0;
  // prevent counting same obstacle multiple frames
  // Per-life trail + events (for reflection map)
  trail = [];
  lifeEvents = [];
  _trailTimer = 0;
  // Boost
  boostTimer = 0;
  // remaining boost duration (0 = not boosting)
  boostCooldown = 0;
  // cooldown before next boost
  // Controls — set each frame by player input or AI on_tick
  steerInput = 0;
  // -1 to 1
  accelInput = 0;
  // 0 to 1
  brakeInput = 0;
  // 0 to 1
  constructor(x, y, color, id) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.id = id ?? `car_${nextId++}`;
    this.hp = this.maxHp;
  }
  // Score-scaled stats
  get maxHp() {
    return D.BASE_MAX_HP + Math.min(this.score, S.SCALE_CAP) * S.HP_FACTOR;
  }
  get maxSpeed() {
    const base = V.BASE_MAX_SPEED + Math.min(this.score, S.SCALE_CAP) * S.SPEED_FACTOR;
    return this.isIt ? base * CONFIG.IT.SPEED_BONUS : base;
  }
  steer(dir) {
    this.steerInput = Math.max(-1, Math.min(1, dir));
  }
  accelerate(amount) {
    this.accelInput = Math.max(0, Math.min(1, amount));
  }
  brake(amount) {
    this.brakeInput = Math.max(0, Math.min(1, amount));
  }
  boost() {
    if (this.boostCooldown <= 0 && this.boostTimer <= 0) {
      this.boostTimer = B.DURATION;
      this.boostCooldown = this.isIt ? B.COOLDOWN * B.IT_COOLDOWN_MULT : B.COOLDOWN;
    }
  }
  get isBoosting() {
    return this.boostTimer > 0;
  }
  /** 0 = ready, 1 = full cooldown */
  get boostCooldownFrac() {
    const cd = this.isIt ? B.COOLDOWN * B.IT_COOLDOWN_MULT : B.COOLDOWN;
    return Math.max(0, this.boostCooldown / cd);
  }
  update(dt, arena) {
    if (!this.alive) return;
    if (this.immuneTimer > 0) {
      this.immuneTimer -= dt;
      if (this.immuneTimer < 0) this.immuneTimer = 0;
    }
    if (this.isIt) {
      this.itTimer -= dt;
      if (this.itTimer <= 0) {
        this.die();
        return;
      }
    }
    if (this.boostTimer > 0) this.boostTimer -= dt;
    if (this.boostCooldown > 0) this.boostCooldown -= dt;
    this.score += S.PER_SECOND * dt;
    const accelMult = this.boostTimer > 0 ? B.ACCEL_MULT : 1;
    if (this.accelInput > 0) {
      if (this.speed < 0) {
        this.speed += V.BRAKING * this.accelInput * dt;
        if (this.speed > 0) this.speed = 0;
      } else {
        this.speed += V.ACCELERATION * accelMult * this.accelInput * dt;
      }
    }
    if (this.boostTimer > 0 && this.accelInput === 0) {
      this.speed += V.ACCELERATION * B.ACCEL_MULT * dt;
    }
    if (this.brakeInput > 0) {
      if (this.speed > 0) {
        this.speed -= V.BRAKING * this.brakeInput * dt;
        if (this.speed < 0) this.speed = 0;
      } else {
        this.speed -= V.ACCELERATION * 0.5 * this.brakeInput * dt;
      }
    }
    const inSand = arena.isInSand(this.x, this.y);
    const friction = V.FRICTION * (inSand ? D.SAND_FRICTION_MULT : 1);
    if (this.speed > 0) {
      this.speed -= friction * dt;
      if (this.speed < 0) this.speed = 0;
    } else if (this.speed < 0) {
      this.speed += friction * dt;
      if (this.speed > 0) this.speed = 0;
    }
    const ms = this.maxSpeed * (this.boostTimer > 0 ? B.SPEED_MULT : 1);
    const maxReverse = this.maxSpeed * 0.4;
    if (this.speed > ms) this.speed = ms;
    if (this.speed < -maxReverse) this.speed = -maxReverse;
    const absSpeed = Math.abs(this.speed);
    const speedFactor = Math.max(0.3, Math.min(1, absSpeed / (ms * 0.5)));
    const steerDir = this.speed < 0 ? -1 : 1;
    this.angle += this.steerInput * V.TURN_SPEED * speedFactor * steerDir * dt;
    const vx = Math.cos(this.angle) * this.speed * dt;
    const vy = Math.sin(this.angle) * this.speed * dt;
    let newX = this.x + vx;
    let newY = this.y + vy;
    if (this._obstacleCooldown > 0) this._obstacleCooldown -= dt;
    const collision = arena.checkObstacleCollision(newX, newY, V.COLLISION_RADIUS);
    if (collision) {
      if (collision.type === "rock") {
        const dx = arena.wrapDx(newX - collision.x);
        const dy = arena.wrapDy(newY - collision.y);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = collision.radius + V.COLLISION_RADIUS - dist;
        this.x += nx * (overlap + V.BOUNCE_DISTANCE);
        this.y += ny * (overlap + V.BOUNCE_DISTANCE);
        const impactSpeed = Math.abs(this.speed);
        const rockDamage = impactSpeed * D.DAMAGE_FACTOR * D.ROCK_DAMAGE_FACTOR;
        const angleToRock = Math.atan2(arena.wrapDy(collision.y - this.y), arena.wrapDx(collision.x - this.x));
        const angleDiff = Math.abs(((angleToRock - this.angle) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
        const frontHit = angleDiff < D.FRONT_HIT_ANGLE;
        const finalDamage = rockDamage * (frontHit ? D.FRONT_HIT_SELF_DAMAGE : 1);
        if (finalDamage > 0.5) {
          this.takeDamage(finalDamage);
          this.damageTaken += finalDamage;
        }
        this.speed *= Math.abs(V.BOUNCE_FACTOR);
        if (this._obstacleCooldown <= 0) {
          this.rockHits++;
          this._obstacleCooldown = 0.5;
        }
        this._lastObstacleHit = collision.type;
      } else {
        this.x = newX;
        this.y = newY;
        if (this._obstacleCooldown <= 0) {
          this.speed *= D.SOFT_OBSTACLE_SPEED_MULT;
          if (collision.type === "cactus") this.cactusHits++;
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
    const wrapped = arena.wrapPosition(this.x, this.y);
    this.x = wrapped.x;
    this.y = wrapped.y;
    this.speedAccum += Math.abs(this.speed);
    this.speedSamples++;
    this.steerInput = 0;
    this.accelInput = 0;
    this.brakeInput = 0;
  }
  // Check distance to another car
  distanceTo(other) {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  // Tag another car — transfer "it" status
  tagCar(other) {
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
  die() {
    this.alive = false;
    this.isIt = false;
    this.itTimer = 0;
    this.speed = 0;
    this.score = Math.floor(this.score * S.DEATH_PENALTY);
    this.respawnTimer = R.TIMER;
  }
  // Take damage, return true if eliminated
  takeDamage(amount) {
    this.hp -= amount;
    this.damageTaken += amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
      return true;
    }
    return false;
  }
  /** Sample position for reflection trail — call from game loop */
  sampleTrail(gameTime, dt) {
    if (!this.alive) return;
    this._trailTimer += dt;
    if (this._trailTimer >= 0.5) {
      this._trailTimer -= 0.5;
      if (this.trail.length < 200) {
        this.trail.push({ time: gameTime, x: this.x, y: this.y, isIt: this.isIt });
      }
    }
  }
  /** Record a significant life event */
  addLifeEvent(time, description) {
    if (this.lifeEvents.length < 30) {
      this.lifeEvents.push({ time, x: this.x, y: this.y, description });
    }
  }
  // Respawn at a position
  respawn(x, y) {
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
  }
};
var collisionCooldowns = /* @__PURE__ */ new Map();
function pairKey(a, b) {
  return a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
}
function updateCollisionCooldowns(dt) {
  for (const [key, remaining] of collisionCooldowns) {
    const next = remaining - dt;
    if (next <= 0) {
      collisionCooldowns.delete(key);
    } else {
      collisionCooldowns.set(key, next);
    }
  }
}
function resetCollisionCooldowns() {
  collisionCooldowns.clear();
}
function checkCarCollisions(cars, arena) {
  const results = [];
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (!b.alive) continue;
      const dx = arena.wrapDx(b.x - a.x);
      const dy = arena.wrapDy(b.y - a.y);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= D.COLLISION_DISTANCE) continue;
      if (a.immuneTimer > 0 || b.immuneTimer > 0) continue;
      const key = pairKey(a, b);
      if (collisionCooldowns.has(key)) continue;
      collisionCooldowns.set(key, D.COLLISION_COOLDOWN);
      a.carCollisions++;
      b.carCollisions++;
      const speedA = Math.abs(a.speed);
      const speedB = Math.abs(b.speed);
      const d = dist || 1;
      const nx = dx / d;
      const ny = dy / d;
      const overlap = D.COLLISION_DISTANCE - dist;
      const push = overlap / 2 + D.BUMP_FORCE;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const posA = arena.wrapPosition(a.x, a.y);
      a.x = posA.x;
      a.y = posA.y;
      const posB = arena.wrapPosition(b.x, b.y);
      b.x = posB.x;
      b.y = posB.y;
      a.speed *= 1 - D.BUMP_SPEED_TRANSFER;
      b.speed *= 1 - D.BUMP_SPEED_TRANSFER;
      const angleAtoB = Math.atan2(dy, dx);
      const angleBtoA = Math.atan2(-dy, -dx);
      const diffA = Math.abs(((angleAtoB - a.angle) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      const diffB = Math.abs(((angleBtoA - b.angle) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      const aFrontHit = diffA < D.FRONT_HIT_ANGLE;
      const bFrontHit = diffB < D.FRONT_HIT_ANGLE;
      const damageFromA = speedA * D.DAMAGE_FACTOR * (a.isIt ? D.IT_DAMAGE_MULTIPLIER : 1);
      const damageFromB = speedB * D.DAMAGE_FACTOR * (b.isIt ? D.IT_DAMAGE_MULTIPLIER : 1);
      const selfDamageToA = damageFromB * (aFrontHit ? D.FRONT_HIT_SELF_DAMAGE : 1);
      const selfDamageToB = damageFromA * (bFrontHit ? D.FRONT_HIT_SELF_DAMAGE : 1);
      a.damageDealt += damageFromA;
      a.score += damageFromA * S.PER_DAMAGE;
      b.damageDealt += damageFromB;
      b.score += damageFromB * S.PER_DAMAGE;
      let tagTransfer = false;
      if (a.isIt && a.alive && b.alive && speedA >= T.MIN_SPEED_TO_TAG) {
        a.tagCar(b);
        tagTransfer = true;
      } else if (b.isIt && b.alive && a.alive && speedB >= T.MIN_SPEED_TO_TAG) {
        b.tagCar(a);
        tagTransfer = true;
      }
      const bWasIt = b.isIt;
      const aWasIt = a.isIt;
      if (selfDamageToB > 0) b.lastAttackerId = a.id;
      if (selfDamageToA > 0) a.lastAttackerId = b.id;
      const killedB = b.takeDamage(selfDamageToB);
      const killedA = a.takeDamage(selfDamageToA);
      if (killedB) {
        a.kills++;
        a.score += S.KILL_BONUS * (bWasIt ? 3 : 1);
      }
      if (killedA) {
        b.kills++;
        b.score += S.KILL_BONUS * (aWasIt ? 3 : 1);
      }
      a.immuneTimer = Math.max(a.immuneTimer, D.HIT_GRACE_PERIOD);
      b.immuneTimer = Math.max(b.immuneTimer, D.HIT_GRACE_PERIOD);
      results.push({ a, b, damageToA: selfDamageToA, damageToB: selfDamageToB, tagTransfer });
    }
  }
  return results;
}

// src/camera.ts
var C = CONFIG.CAMERA;
var CW = CONFIG.CANVAS.WIDTH;
var CH = CONFIG.CANVAS.HEIGHT;
var Camera = class {
  x = 0;
  y = 0;
  worldW = 1;
  worldH = 1;
  update(targetX, targetY, worldW, worldH) {
    this.worldW = worldW;
    this.worldH = worldH;
    let dx = targetX - this.x;
    let dy = targetY - this.y;
    if (dx > worldW / 2) dx -= worldW;
    if (dx < -worldW / 2) dx += worldW;
    if (dy > worldH / 2) dy -= worldH;
    if (dy < -worldH / 2) dy += worldH;
    this.x += dx * C.SMOOTHING;
    this.y += dy * C.SMOOTHING;
    this.x = (this.x % worldW + worldW) % worldW;
    this.y = (this.y % worldH + worldH) % worldH;
  }
  worldToScreen(wx, wy) {
    let dx = wx - this.x;
    let dy = wy - this.y;
    if (dx > this.worldW / 2) dx -= this.worldW;
    if (dx < -this.worldW / 2) dx += this.worldW;
    if (dy > this.worldH / 2) dy -= this.worldH;
    if (dy < -this.worldH / 2) dy += this.worldH;
    return { x: dx + CW / 2, y: dy + CH / 2 };
  }
  isVisible(wx, wy, margin = 50) {
    let dx = wx - this.x;
    let dy = wy - this.y;
    if (dx > this.worldW / 2) dx -= this.worldW;
    if (dx < -this.worldW / 2) dx += this.worldW;
    if (dy > this.worldH / 2) dy -= this.worldH;
    if (dy < -this.worldH / 2) dy += this.worldH;
    const sx = dx + CW / 2;
    const sy = dy + CH / 2;
    return sx > -margin && sx < CW + margin && sy > -margin && sy < CH + margin;
  }
  snap(targetX, targetY, worldW, worldH) {
    this.worldW = worldW;
    this.worldH = worldH;
    this.x = targetX;
    this.y = targetY;
  }
};

// src/input.ts
var held = /* @__PURE__ */ new Set();
var justPressed = /* @__PURE__ */ new Set();
window.addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Escape"].includes(e.key)) {
    e.preventDefault();
  }
  if (!held.has(e.key)) {
    justPressed.add(e.key);
  }
  held.add(e.key);
});
window.addEventListener("keyup", (e) => {
  held.delete(e.key);
});
function isHeld(key) {
  return held.has(key);
}
function wasPressed(key) {
  return justPressed.has(key);
}
function clearFrame() {
  justPressed.clear();
  _gamepadButtonJustPressed = false;
}
var DEADZONE = 0.15;
var _gamepadButtonJustPressed = false;
var _prevButtons = [];
function getActiveGamepad() {
  const gamepads = navigator.getGamepads();
  for (const gp of gamepads) {
    if (gp && gp.connected) return gp;
  }
  return null;
}
function pollGamepad() {
  const gp = getActiveGamepad();
  if (!gp) {
    _prevButtons = [];
    return;
  }
  const curr = gp.buttons.map((b) => b.pressed);
  if (_prevButtons.length > 0) {
    for (const idx of [0, 9]) {
      if (curr[idx] && !_prevButtons[idx]) {
        _gamepadButtonJustPressed = true;
      }
    }
  }
  _prevButtons = curr;
}
function gamepadWasPressed() {
  return _gamepadButtonJustPressed;
}
function getPlayerControls() {
  let steer = 0;
  let accel = 0;
  let brake = 0;
  if (isHeld("ArrowLeft") || isHeld("a")) steer -= 1;
  if (isHeld("ArrowRight") || isHeld("d")) steer += 1;
  if (isHeld("ArrowUp") || isHeld("w")) accel = 1;
  if (isHeld("ArrowDown") || isHeld("s")) brake = 1;
  const boost = isHeld(" ");
  const gp = getActiveGamepad();
  if (gp) {
    const lx = gp.axes[0] ?? 0;
    if (Math.abs(lx) > DEADZONE) {
      const gpSteer = Math.sign(lx) * ((Math.abs(lx) - DEADZONE) / (1 - DEADZONE));
      if (Math.abs(gpSteer) > Math.abs(steer)) steer = gpSteer;
    }
    const rt = gp.buttons[7]?.value ?? 0;
    const lt = gp.buttons[6]?.value ?? 0;
    if (rt > accel) accel = rt;
    if (lt > brake) brake = lt;
    if (gp.buttons[12]?.pressed && accel < 1) accel = 1;
    if (gp.buttons[13]?.pressed && brake < 1) brake = 1;
    if (gp.buttons[14]?.pressed && steer > -1) steer = -1;
    if (gp.buttons[15]?.pressed && steer > -1) steer = 1;
  }
  const gpBoost = gp ? gp.buttons[1]?.pressed ?? false : false;
  return { steer, accel, brake, boost: boost || gpBoost };
}

// src/sprites.ts
var ASSET_BASE = "assets/mini-pixel-pack-2";
var FRAME_SIZE = 16;
var CAR_SCALE = 1.8;
var carImages = {};
var desertDetailsImg = null;
var miscPropsImg = null;
var loaded = false;
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}
async function loadSprites() {
  try {
    const [red, blue, green, yellow, police, npc, desert, props] = await Promise.all([
      loadImage(`${ASSET_BASE}/Cars/Player_red%20(16%20x%2016).png`),
      loadImage(`${ASSET_BASE}/Cars/Player_blue%20(16%20x%2016).png`),
      loadImage(`${ASSET_BASE}/Cars/Player_green%20(16%20x%2016).png`),
      loadImage(`${ASSET_BASE}/Cars/Player_yellow%20(16%20x%2016).png`),
      loadImage(`${ASSET_BASE}/Cars/Police%20(16%20x%2016).png`),
      loadImage(`${ASSET_BASE}/Cars/NPC_cars%20(16%20x%2016).png`),
      loadImage(`${ASSET_BASE}/Levels/Desert_details%20(16%20x%2016).png`),
      loadImage(`${ASSET_BASE}/Props/Misc_props%20(16%20x%2016).png`)
    ]);
    carImages = { red, blue, green, yellow, police, npc };
    desertDetailsImg = desert;
    miscPropsImg = props;
    loaded = true;
    console.log("[SPRITES] All sprites loaded");
  } catch (err) {
    console.warn("[SPRITES] Failed to load sprites, using shape fallbacks:", err);
  }
}
var COLOR_MAP = {
  red: "#c03030",
  blue: "#3050c0",
  green: "#30a040",
  yellow: "#c0a020",
  police: "#2060a0",
  npc: "#808080"
};
function renderCar(ctx, screenX, screenY, angle, color, isIt, immuneTimer) {
  const scaledW = FRAME_SIZE * CAR_SCALE;
  const scaledH = FRAME_SIZE * CAR_SCALE;
  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.rotate(angle + Math.PI / 2);
  const img = carImages[color];
  if (img) {
    ctx.drawImage(
      img,
      0,
      0,
      FRAME_SIZE,
      FRAME_SIZE,
      -scaledW / 2,
      -scaledH / 2,
      scaledW,
      scaledH
    );
  } else {
    ctx.fillStyle = COLOR_MAP[color] || "#888";
    ctx.fillRect(-10, -6, 20, 12);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(6, -3);
    ctx.lineTo(6, 3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  if (isIt) {
    ctx.save();
    ctx.strokeStyle = "#ff2222";
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(performance.now() / 150);
    ctx.beginPath();
    ctx.arc(screenX, screenY, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (immuneTimer > 0) {
    ctx.save();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.3 + 0.3 * Math.sin(performance.now() / 80);
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(screenX, screenY, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
var DETAIL_SCALE = 2;
var DETAIL_TILE = FRAME_SIZE * DETAIL_SCALE;
function renderRock(ctx, sx, sy, radius) {
  if (desertDetailsImg) {
    const scale = radius * 2 / FRAME_SIZE;
    const size = FRAME_SIZE * scale;
    ctx.drawImage(
      desertDetailsImg,
      3 * FRAME_SIZE,
      0,
      FRAME_SIZE,
      FRAME_SIZE,
      sx - size / 2,
      sy - size / 2,
      size,
      size
    );
  } else {
    ctx.fillStyle = "#8b7355";
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}
function renderCactus(ctx, sx, sy) {
  if (desertDetailsImg) {
    ctx.drawImage(
      desertDetailsImg,
      2 * FRAME_SIZE,
      0,
      FRAME_SIZE,
      FRAME_SIZE,
      sx - DETAIL_TILE / 2,
      sy - DETAIL_TILE / 2,
      DETAIL_TILE,
      DETAIL_TILE
    );
  } else {
    ctx.fillStyle = "#2d5a1e";
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}
function renderBarrel(ctx, sx, sy) {
  if (miscPropsImg) {
    ctx.drawImage(
      miscPropsImg,
      2 * FRAME_SIZE,
      0,
      FRAME_SIZE,
      FRAME_SIZE,
      sx - DETAIL_TILE / 2,
      sy - DETAIL_TILE / 2,
      DETAIL_TILE,
      DETAIL_TILE
    );
  } else {
    ctx.fillStyle = "#a05020";
    ctx.beginPath();
    ctx.arc(sx, sy, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#604020";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
function renderSandPatch(ctx, sx, sy) {
  if (desertDetailsImg) {
    ctx.drawImage(
      desertDetailsImg,
      1 * FRAME_SIZE,
      0,
      FRAME_SIZE,
      FRAME_SIZE,
      sx - DETAIL_TILE / 2,
      sy - DETAIL_TILE / 2,
      DETAIL_TILE,
      DETAIL_TILE
    );
  }
}

// src/soma.ts
var PERSONALITIES = [
  {
    name: "Viper",
    color: "blue",
    identity: `I am Viper. I strike fast and vanish. When I'm it, I'm a wrecking ball \u2014 3x damage means I can destroy cars fast. When not it, I ram weakened targets to finish them off, but dodge the "it" car. Low HP? Play cautious.`,
    on_tick: `
      // When "it": chase nearest to pass tag AND deal massive damage
      // When not "it": hunt low-HP cars, dodge "it" car
      const alive = world.otherCars.filter(c => c.alive);
      const itCar = alive.find(c => c.isIt);

      if (me.isIt) {
        // Target nearest non-immune car (preferring low HP)
        let best = null;
        let bestScore = -Infinity;
        for (const c of alive) {
          if (c.immuneTimer > 0) continue;
          const d = me.distanceTo(c.x, c.y);
          const score = (100 - c.hp) - d * 0.3; // prefer low HP + close
          if (score > bestScore) { bestScore = score; best = c; }
        }
        if (best) {
          const angle = me.angleTo(best.x, best.y);
          const diff = angle - me.angle;
          me.steer(Math.atan2(Math.sin(diff), Math.cos(diff)) * 2);
          me.accelerate(1);
          // Boost when closing in for the kill
          if (me.distanceTo(best.x, best.y) < 120) me.boost();
        }
      } else {
        // Dodge "it" car if close
        if (itCar && me.distanceTo(itCar.x, itCar.y) < 200) {
          const awayAngle = me.angleTo(itCar.x, itCar.y) + Math.PI;
          const diff = awayAngle - me.angle;
          me.steer(Math.atan2(Math.sin(diff), Math.cos(diff)) * 2);
          me.accelerate(1);
          // Boost to escape if "it" is very close
          if (me.distanceTo(itCar.x, itCar.y) < 100) me.boost();
        } else {
          // Ram weakened cars if we're healthy
          const weak = alive.filter(c => !c.isIt && c.hp < 40);
          if (me.hp > 50 && weak.length > 0) {
            const target = weak.reduce((a, b) => me.distanceTo(a.x, a.y) < me.distanceTo(b.x, b.y) ? a : b);
            const angle = me.angleTo(target.x, target.y);
            const diff = angle - me.angle;
            me.steer(Math.atan2(Math.sin(diff), Math.cos(diff)) * 2);
            me.accelerate(0.8);
          } else {
            me.steer(Math.sin(world.time * 0.5) * 0.3);
            me.accelerate(0.6);
          }
        }
      }
    `
  },
  {
    name: "Bruiser",
    color: "green",
    identity: `I am Bruiser. Big hits, no finesse. I charge straight at targets to deal maximum damage. When I'm it, I'm devastating \u2014 3x damage with full-speed rams. I never back down.`,
    on_tick: `
      const alive = world.otherCars.filter(c => c.alive);
      const itCar = alive.find(c => c.isIt);

      if (me.isIt) {
        // Charge closest non-immune car at full speed
        let closestDist = Infinity;
        let target = null;
        for (const c of alive) {
          if (c.immuneTimer > 0) continue;
          const d = me.distanceTo(c.x, c.y);
          if (d < closestDist) { closestDist = d; target = c; }
        }
        if (target) {
          const angle = me.angleTo(target.x, target.y);
          const diff = angle - me.angle;
          me.steer(Math.atan2(Math.sin(diff), Math.cos(diff)) * 3);
          me.accelerate(1);
          // Bruiser always boosts when charging
          me.boost();
        }
      } else {
        // Zigzag away from "it", but ram anyone in our path
        if (itCar && me.distanceTo(itCar.x, itCar.y) < 200) {
          const away = me.angleTo(itCar.x, itCar.y) + Math.PI;
          const diff = away - me.angle;
          me.steer(Math.atan2(Math.sin(diff), Math.cos(diff)) * 2 + Math.sin(world.time * 3) * 0.5);
          me.accelerate(0.9);
        } else {
          // Hunt weakest car
          const weakest = alive.filter(c => !c.isIt).sort((a, b) => a.hp - b.hp)[0];
          if (weakest && me.hp > 30) {
            const angle = me.angleTo(weakest.x, weakest.y);
            const diff = angle - me.angle;
            me.steer(Math.atan2(Math.sin(diff), Math.cos(diff)) * 3);
            me.accelerate(1);
          } else {
            me.steer(Math.sin(world.time * 0.8) * 0.5);
            me.accelerate(0.5);
          }
        }
      }
    `
  },
  {
    name: "Ghost",
    color: "yellow",
    identity: `I am Ghost. I drift near the center for maximum escape routes. I avoid damage when healthy and only engage when I have the advantage. When it, I herd targets into corners for devastating 3x hits.`,
    on_tick: `
      const centerX = world.arenaWidth / 2;
      const centerY = world.arenaHeight / 2;
      const alive = world.otherCars.filter(c => c.alive);
      const itCar = alive.find(c => c.isIt);

      if (me.isIt) {
        // Herd nearest non-immune target
        let target = null;
        let minD = Infinity;
        for (const c of alive) {
          if (c.immuneTimer > 0) continue;
          const d = me.distanceTo(c.x, c.y);
          if (d < minD) { minD = d; target = c; }
        }
        if (target) {
          const angle = me.angleTo(target.x, target.y);
          const diff = angle - me.angle;
          me.steer(Math.atan2(Math.sin(diff), Math.cos(diff)) * 2.5);
          me.accelerate(minD < 100 ? 1 : 0.7);
          // Boost for the final approach
          if (minD < 80) me.boost();
        }
      } else {
        // Orbit center, dodge "it" and high-speed cars
        const toCenter = me.angleTo(centerX, centerY);
        let targetAngle = toCenter;

        if (itCar && me.distanceTo(itCar.x, itCar.y) < 180) {
          targetAngle = me.angleTo(itCar.x, itCar.y) + Math.PI;
          // Boost away from danger
          if (me.distanceTo(itCar.x, itCar.y) < 100) me.boost();
        }

        const diff = targetAngle - me.angle;
        me.steer(Math.atan2(Math.sin(diff), Math.cos(diff)) * 2);
        // Slow down when low HP to reduce collision damage taken
        me.accelerate(me.hp < 30 ? 0.4 : 0.65);
      }
    `
  },
  {
    name: "Rattler",
    color: "police",
    identity: `I am Rattler. I intercept targets by predicting their path. When it, I lead my target for high-speed 3x damage impacts. When not it, I lurk and strike low-HP cars opportunistically.`,
    on_tick: `
      const alive = world.otherCars.filter(c => c.alive);
      const itCar = alive.find(c => c.isIt);

      if (me.isIt) {
        // Intercept: aim ahead of target's path (prioritize low HP)
        let target = null;
        let bestScore = -Infinity;
        for (const c of alive) {
          if (c.immuneTimer > 0) continue;
          const d = me.distanceTo(c.x, c.y);
          const score = (100 - c.hp) * 2 - d;
          if (score > bestScore) { bestScore = score; target = c; }
        }
        if (target) {
          const d = me.distanceTo(target.x, target.y);
          const lead = Math.min(d / 200, 1.5);
          const futureX = target.x + Math.cos(target.angle) * target.speed * lead;
          const futureY = target.y + Math.sin(target.angle) * target.speed * lead;
          const angle = me.angleTo(futureX, futureY);
          const diff = angle - me.angle;
          me.steer(Math.atan2(Math.sin(diff), Math.cos(diff)) * 2.5);
          me.accelerate(1);
          // Boost when intercept is close
          if (d < 150) me.boost();
        }
      } else {
        // Dodge "it", opportunistically ram low-HP cars
        if (itCar && me.distanceTo(itCar.x, itCar.y) < 220) {
          const away = me.angleTo(itCar.x, itCar.y) + Math.PI;
          const diff = away - me.angle;
          me.steer(Math.atan2(Math.sin(diff), Math.cos(diff)) * 2.5);
          me.accelerate(1);
        } else {
          const weak = alive.filter(c => !c.isIt && c.hp < 50);
          if (weak.length > 0 && me.hp > 40) {
            const t = weak[0];
            const d = me.distanceTo(t.x, t.y);
            const lead = Math.min(d / 200, 1);
            const fx = t.x + Math.cos(t.angle) * t.speed * lead;
            const fy = t.y + Math.sin(t.angle) * t.speed * lead;
            const angle = me.angleTo(fx, fy);
            const diff = angle - me.angle;
            me.steer(Math.atan2(Math.sin(diff), Math.cos(diff)) * 2.5);
            me.accelerate(0.8);
          } else {
            me.steer(Math.sin(world.time * 0.4 + 1.5) * 0.4);
            me.accelerate(0.55);
          }
        }
      }
    `
  },
  {
    name: "Dust Devil",
    color: "npc",
    identity: `I am Dust Devil. Chaotic and unpredictable. I change direction constantly to be hard to catch and hard to predict. When it, I pick random targets and slam them with 3x damage. Chaos is my advantage.`,
    on_tick: `
      const alive = world.otherCars.filter(c => c.alive);
      const itCar = alive.find(c => c.isIt);

      if (me.isIt) {
        // Random target, switch every few seconds \u2014 chaos with 3x damage
        const targets = alive.filter(c => c.immuneTimer <= 0);
        if (targets.length > 0) {
          const idx = Math.floor(world.time * 0.3) % targets.length;
          const target = targets[idx];
          const angle = me.angleTo(target.x, target.y);
          const diff = angle - me.angle;
          me.steer(Math.atan2(Math.sin(diff), Math.cos(diff)) * 2 + Math.sin(world.time * 5) * 0.3);
          me.accelerate(1);
          // Chaotic boost \u2014 whenever it's ready, use it
          me.boost();
        }
      } else {
        // Erratic \u2014 dodge "it", crash into everyone else
        if (itCar && me.distanceTo(itCar.x, itCar.y) < 200) {
          const away = me.angleTo(itCar.x, itCar.y) + Math.PI + (Math.random() - 0.5) * 1.5;
          const diff = away - me.angle;
          me.steer(Math.atan2(Math.sin(diff), Math.cos(diff)) * 3);
          me.accelerate(1);
        } else {
          me.steer(Math.sin(world.time * 2.5) * 0.8 + Math.cos(world.time * 1.7) * 0.4);
          me.accelerate(0.5 + Math.sin(world.time * 3) * 0.3);
        }
      }
    `
  }
];
var STORAGE_KEY = "tag-your-dead-somas";
function saveSomas(somas) {
  const obj = {};
  somas.forEach((soma, id) => {
    obj[id] = soma;
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}
function loadSomas() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return /* @__PURE__ */ new Map();
  try {
    const obj = JSON.parse(raw);
    const map = /* @__PURE__ */ new Map();
    for (const [id, soma] of Object.entries(obj)) {
      map.set(id, soma);
    }
    return map;
  } catch {
    return /* @__PURE__ */ new Map();
  }
}
var compiledCache = /* @__PURE__ */ new Map();
function compileOnTick(code) {
  const cached = compiledCache.get(code);
  if (cached) return cached;
  try {
    const fn = new Function("me", "world", code);
    compiledCache.set(code, fn);
    return fn;
  } catch (err) {
    console.warn("[SOMA] Failed to compile on_tick:", err);
    return () => {
    };
  }
}
function buildMeAPI(car, soma, arena) {
  return {
    get x() {
      return car.x;
    },
    get y() {
      return car.y;
    },
    get angle() {
      return car.angle;
    },
    get speed() {
      return car.speed;
    },
    get hp() {
      return car.hp;
    },
    get maxHp() {
      return car.maxHp;
    },
    get maxSpeed() {
      return car.maxSpeed;
    },
    get score() {
      return Math.floor(car.score);
    },
    get isIt() {
      return car.isIt;
    },
    get itTimer() {
      return car.itTimer;
    },
    get immuneTimer() {
      return car.immuneTimer;
    },
    get alive() {
      return car.alive;
    },
    steer(dir) {
      car.steer(dir);
    },
    accelerate(amt) {
      car.accelerate(amt);
    },
    brake(amt) {
      car.brake(amt);
    },
    boost() {
      car.boost();
    },
    get isBoosting() {
      return car.isBoosting;
    },
    get boostCooldownFrac() {
      return car.boostCooldownFrac;
    },
    distanceTo(x, y) {
      const dx = arena.wrapDx(car.x - x);
      const dy = arena.wrapDy(car.y - y);
      return Math.sqrt(dx * dx + dy * dy);
    },
    angleTo(x, y) {
      const dx = arena.wrapDx(x - car.x);
      const dy = arena.wrapDy(y - car.y);
      return Math.atan2(dy, dx);
    },
    memory: {
      read() {
        return soma.memory.content;
      },
      write(s) {
        soma.memory.content = s;
      }
    },
    identity: {
      read() {
        return soma.identity.content;
      }
    },
    on_tick: {
      read() {
        return soma.on_tick.content;
      }
    }
  };
}
function buildWorldAPI(time, arena, allCars, selfId) {
  return {
    time,
    arenaWidth: arena.width,
    arenaHeight: arena.height,
    otherCars: allCars.filter((c) => c.id !== selfId).map((c) => ({
      id: c.id,
      x: c.x,
      y: c.y,
      angle: c.angle,
      speed: c.speed,
      hp: c.hp,
      score: Math.floor(c.score),
      isIt: c.isIt,
      alive: c.alive,
      immuneTimer: c.immuneTimer
    })),
    obstacles: arena.obstacles.map((o) => ({
      x: o.x,
      y: o.y,
      radius: o.radius,
      type: o.type
    }))
  };
}
function runOnTick(car, soma, time, arena, allCars) {
  const fn = compileOnTick(soma.on_tick.content);
  const me = buildMeAPI(car, soma, arena);
  const world = buildWorldAPI(time, arena, allCars, car.id);
  try {
    fn(me, world);
  } catch (err) {
    console.warn(`[SOMA] on_tick error for ${car.id}:`, err);
  }
}
function createSoma(personality) {
  return {
    identity: { content: personality.identity },
    on_tick: { content: personality.on_tick.trim() },
    memory: { content: "" }
  };
}

// src/life-map.ts
var MAP_SIZE = 400;
function renderLifeMap(input) {
  const { arenaWidth, arenaHeight, obstacles, sandPatches, trail, events, carColor, carName } = input;
  const scaleX = MAP_SIZE / arenaWidth;
  const scaleY = MAP_SIZE / arenaHeight;
  const scale = Math.min(scaleX, scaleY);
  const mapW = Math.round(arenaWidth * scale);
  const mapH = Math.round(arenaHeight * scale);
  const legendH = 36;
  const canvas2 = document.createElement("canvas");
  canvas2.width = mapW;
  canvas2.height = mapH + legendH;
  const ctx = canvas2.getContext("2d");
  const tx = (x) => x * scale;
  const ty = (y) => y * scale;
  ctx.fillStyle = "#d4b088";
  ctx.fillRect(0, 0, mapW, mapH);
  ctx.fillStyle = "#c4a070";
  for (const sp of sandPatches) {
    ctx.beginPath();
    ctx.arc(tx(sp.x), ty(sp.y), sp.radius * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const obs of obstacles) {
    const ox = tx(obs.x);
    const oy = ty(obs.y);
    const or = Math.max(obs.radius * scale, 2);
    if (obs.type === "rock") {
      ctx.fillStyle = "#666";
      ctx.beginPath();
      ctx.arc(ox, oy, or, 0, Math.PI * 2);
      ctx.fill();
    } else if (obs.type === "cactus") {
      ctx.fillStyle = "#4a7a3a";
      ctx.beginPath();
      ctx.arc(ox, oy, or, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "#cc6633";
      ctx.beginPath();
      ctx.arc(ox, oy, or, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (trail.length > 1) {
    ctx.lineWidth = 2.5;
    for (let i = 1; i < trail.length; i++) {
      const prev = trail[i - 1];
      const curr = trail[i];
      if (Math.abs(curr.x - prev.x) > arenaWidth / 2 || Math.abs(curr.y - prev.y) > arenaHeight / 2) continue;
      ctx.strokeStyle = curr.isIt ? "#ff3333" : carColor;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(tx(prev.x), ty(prev.y));
      ctx.lineTo(tx(curr.x), ty(curr.y));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#33ff33";
    const sx = tx(trail[0].x);
    const sy = ty(trail[0].y);
    ctx.fillRect(sx - 4, sy - 4, 8, 8);
    const last = trail[trail.length - 1];
    const dx = tx(last.x);
    const dy = ty(last.y);
    ctx.strokeStyle = "#ff0000";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(dx - 5, dy - 5);
    ctx.lineTo(dx + 5, dy + 5);
    ctx.moveTo(dx + 5, dy - 5);
    ctx.lineTo(dx - 5, dy + 5);
    ctx.stroke();
  }
  ctx.font = "bold 10px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const ex = tx(ev.x);
    const ey = ty(ev.y);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ex, ey, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#000";
    ctx.fillText(String(i + 1), ex, ey);
  }
  const ly = mapH + 4;
  ctx.fillStyle = "#1a0f08";
  ctx.fillRect(0, mapH, mapW, legendH);
  ctx.font = "10px monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  let lx = 6;
  const items = [
    { color: "#33ff33", label: "Spawn" },
    { color: "#ff0000", label: "Death" },
    { color: carColor, label: `${carName} (normal)` },
    { color: "#ff3333", label: `${carName} (IT)` },
    { color: "#666", label: "Rock" },
    { color: "#4a7a3a", label: "Cactus" },
    { color: "#fff", label: "# = Event" }
  ];
  for (const item of items) {
    ctx.fillStyle = item.color;
    ctx.fillRect(lx, ly + 2, 8, 8);
    ctx.fillStyle = "#999";
    ctx.fillText(item.label, lx + 11, ly + 1);
    lx += ctx.measureText(item.label).width + 22;
    if (lx > mapW - 50) {
      lx = 6;
      ctx.translate(0, 14);
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return canvas2.toDataURL("image/png").split(",")[1];
}

// src/reflection.ts
var API = CONFIG.API_ENDPOINT;
async function callAPI(model, system, userContent, tools, maxTokens = 1024) {
  const body = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userContent }]
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = { type: "auto" };
  }
  const resp = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`API ${resp.status}: ${text}`);
  }
  return resp.json();
}
var REFLECTION_TOOLS = [
  {
    name: "edit_on_tick",
    description: "Replace your driving code. Runs every frame with (me, world). me: x, y, angle, speed, hp, maxHp, maxSpeed, score, isIt, itTimer, immuneTimer, alive, steer(dir), accelerate(amt), brake(amt), boost() (short speed burst, 3s cooldown), isBoosting, boostCooldownFrac (0=ready, 1=full cooldown), distanceTo(x,y), angleTo(x,y), memory.read()/write(), identity.read(), on_tick.read(). world: time, arenaWidth, arenaHeight, otherCars[{id,x,y,angle,speed,hp,score,isIt,alive,immuneTimer}], obstacles[{x,y,radius,type}].",
    input_schema: {
      type: "object",
      properties: {
        code: { type: "string", description: "New JavaScript code for on_tick" }
      },
      required: ["code"],
      additionalProperties: false
    }
  },
  {
    name: "edit_memory",
    description: "Update your persistent memory. Survives across lives. Track strategies, observations, what works.",
    input_schema: {
      type: "object",
      properties: {
        content: { type: "string", description: "New memory content" }
      },
      required: ["content"],
      additionalProperties: false
    }
  },
  {
    name: "edit_identity",
    description: "Update your identity description \u2014 who you are, your driving philosophy.",
    input_schema: {
      type: "object",
      properties: {
        content: { type: "string", description: "New identity content" }
      },
      required: ["content"],
      additionalProperties: false
    }
  }
];
function buildHitSummary(r) {
  const parts = [];
  if (r.carCollisions > 0) parts.push(`${r.carCollisions} car collision(s)`);
  if (r.rockHits > 0) parts.push(`hit ${r.rockHits} rock(s)`);
  if (r.cactusHits > 0) parts.push(`drove through ${r.cactusHits} cactus(es)`);
  if (r.barrelHits > 0) parts.push(`drove through ${r.barrelHits} barrel(s)`);
  if (r.wallHits > 0) parts.push(`hit arena wall ${r.wallHits} time(s)`);
  if (r.timeAtWall > 0) parts.push(`spent ${r.timeAtWall}s pressed against arena edge`);
  return parts.length > 0 ? parts.join(", ") : "clean run \u2014 no obstacle collisions";
}
async function reflectOnLife(carName, soma, result, arena) {
  const system = `You are ${carName}, a car in a desert demolition derby. You just died and are reflecting on your last life.

<identity>${soma.identity.content}</identity>
<on_tick>${soma.on_tick.content}</on_tick>
<memory>${soma.memory.content || "(empty)"}</memory>

GAME MECHANICS:
- Continuous demolition derby. No rounds \u2014 die, respawn in 5s, keep fighting.
- Damage from collisions: speed \xD7 0.15. Being "it" multiplies YOUR damage output by 3x.
- Being "it" also gives +15% max speed and 2x faster boost recharge \u2014 use this advantage to chase down targets.
- Front-bumper hits (ramming nose-first, within \xB160\xB0 of your facing direction) only deal 10% damage to YOU. Side and rear hits take full damage. Facing your target when you ram is much safer.
- Die (HP=0 or IT timer expires) \u2192 score halved, then respawn.
- Score: +1/sec alive, +0.5 per damage dealt, +50 per kill (+150 for killing the "it" car). Higher score \u2192 more HP and speed (caps at score 200).
- Tag transfer: ram the "it" car or get rammed by it (must be moving) to transfer the tag. 1.5s immunity after tag transfer.
- boost(): short speed burst (1.8x max speed, 3x accel) on 3s cooldown. IT cars recharge 2x faster.

ARENA:
- Flat desert, ${CONFIG.ARENA.WIDTH}\xD7${CONFIG.ARENA.HEIGHT}, toroidal \u2014 driving off one edge puts you on the opposite side (no walls).
- Obstacles: rocks (solid \u2014 bounce off, take some damage), cacti and barrels (slow you down but you drive through them). Rough sand patches increase friction and slow you down gradually.
- Other cars visible via world.otherCars with their position, angle, speed, HP, score, and "it" status.
- Coordinates: (0,0) is top-left, (${CONFIG.ARENA.WIDTH},${CONFIG.ARENA.HEIGHT}) is bottom-right.

The attached image shows a bird's-eye map of your last life. Your path is shown in your color (red when IT). Numbered circles mark key events listed below. Green square = spawn, red X = death.

Call ALL tools you want to use in a single response.`;
  const moments = result.lifeEvents.length > 0 ? "\nKEY MOMENTS:\n" + result.lifeEvents.map(
    (ev, i) => `${i + 1}. [${Math.round(ev.time)}s] ${ev.description}`
  ).join("\n") : "";
  const userText = `You died. Cause: ${result.deathCause === "destroyed" ? "HP reached 0" : "IT timer ran out"}.

Score before death: ${result.score} (now halved). Average speed: ${result.avgSpeed}.
Damage dealt: ${result.damageDealt}. Damage taken: ${result.damageTaken}. Kills: ${result.kills}.
Tags given: ${result.tagsGiven}. Tags received: ${result.tagsReceived}.
Collisions: ${buildHitSummary(result)}.
${moments}
Analyze what went wrong and IMPROVE your on_tick driving code. Don't resubmit the same code \u2014 make a specific tactical change based on how you died. Also update memory with what you learned.`;
  let userContent = userText;
  if (result.trail.length > 2) {
    try {
      const mapBase64 = renderLifeMap({
        arenaWidth: arena.arenaWidth,
        arenaHeight: arena.arenaHeight,
        obstacles: arena.obstacles,
        sandPatches: arena.sandPatches,
        trail: result.trail,
        events: result.lifeEvents,
        carColor: arena.carColor,
        carName
      });
      userContent = [
        { type: "image", source: { type: "base64", media_type: "image/png", data: mapBase64 } },
        { type: "text", text: userText }
      ];
      console.log(`[REFLECT] ${carName} life map rendered (${result.trail.length} trail points, ${result.lifeEvents.length} events)`);
    } catch (err) {
      console.warn(`[REFLECT] ${carName} life map failed, using text-only:`, err);
    }
  }
  try {
    const resp = await callAPI("claude-sonnet-4-5-20250929", system, userContent, REFLECTION_TOOLS);
    const updated = { ...soma };
    for (const block of resp.content) {
      if (block.type === "tool_use" && block.input) {
        const input = block.input;
        if (block.name === "edit_on_tick" && input.code) {
          updated.on_tick = { content: input.code };
        } else if (name === "edit_memory" && input.content) {
          updated.memory = { content: input.content };
        } else if (name === "edit_identity" && input.content) {
          updated.identity = { content: input.content };
        }
      }
    }
    const toolsCalled = resp.content.filter((b) => b.type === "tool_use").map((b) => b.name);
    console.log(`[REFLECT] ${carName} reflection complete \u2014 tools: ${toolsCalled.join(", ") || "none"}`);
    const codeChanged = updated.on_tick.content !== soma.on_tick.content;
    let brag = null;
    if (codeChanged) {
      console.log(`[REFLECT] ${carName} on_tick changed, generating brag...`);
      brag = await generateBrag(carName, updated.identity.content, soma.on_tick.content, updated.on_tick.content);
      console.log(`[REFLECT] ${carName} brag: ${brag ?? "(failed)"}`);
    } else {
      console.log(`[REFLECT] ${carName} on_tick unchanged \u2014 no brag`);
    }
    return { soma: updated, brag };
  } catch (err) {
    console.warn(`[REFLECT] ${carName} reflection failed:`, err);
    return { soma, brag: null };
  }
}
async function generateBrag(name2, identity, oldCode, newCode) {
  try {
    const resp = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 100,
        messages: [{
          role: "user",
          content: `You are ${name2}, a demolition derby driver. Your identity: "${identity}"

You just updated your driving code after dying. Write a short, cocky, in-character brag about what you changed (1 sentence, max 15 words). Be specific about the tactical change, not generic. No quotes.

OLD CODE (snippet):
${oldCode.slice(0, 400)}

NEW CODE (snippet):
${newCode.slice(0, 400)}`
        }]
      })
    });
    if (!resp.ok) {
      console.warn(`[BRAG] API ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    const text = data.content?.[0]?.text?.trim();
    if (!text) console.warn("[BRAG] empty response", data);
    return text || null;
  } catch (err) {
    console.warn("[BRAG] failed:", err);
    return null;
  }
}

// src/effects.ts
var shakeIntensity = 0;
var shakeDuration = 0;
function triggerShake(intensity, duration) {
  shakeIntensity = Math.max(shakeIntensity, intensity);
  shakeDuration = Math.max(shakeDuration, duration);
}
function updateShake(dt) {
  if (shakeDuration <= 0) return { dx: 0, dy: 0 };
  shakeDuration -= dt;
  const decay = Math.max(0, shakeDuration) / 0.3;
  const dx = (Math.random() - 0.5) * shakeIntensity * decay * 2;
  const dy = (Math.random() - 0.5) * shakeIntensity * decay * 2;
  if (shakeDuration <= 0) {
    shakeIntensity = 0;
  }
  return { dx, dy };
}
var particles = [];
function spawnDust(x, y, angle, speed, count) {
  for (let i = 0; i < count; i++) {
    const spread = (Math.random() - 0.5) * 1.5;
    const backAngle = angle + Math.PI + spread;
    const v = speed * (0.1 + Math.random() * 0.2);
    const spawnDist = 14 + Math.random() * 4;
    const bx = x + Math.cos(angle + Math.PI) * spawnDist;
    const by = y + Math.sin(angle + Math.PI) * spawnDist;
    particles.push({
      x: bx + (Math.random() - 0.5) * 6,
      y: by + (Math.random() - 0.5) * 6,
      vx: Math.cos(backAngle) * v,
      vy: Math.sin(backAngle) * v,
      life: 0.3 + Math.random() * 0.4,
      maxLife: 0.7,
      color: "#c8b080",
      size: 2 + Math.random() * 3
    });
  }
}
function spawnTagSparks(x, y) {
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * Math.PI * 2;
    const v = 40 + Math.random() * 80;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      life: 0.4 + Math.random() * 0.3,
      maxLife: 0.7,
      color: Math.random() > 0.5 ? "#ff4444" : "#ffaa22",
      size: 2 + Math.random() * 3
    });
  }
}
function spawnEliminationExplosion(x, y) {
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const v = 30 + Math.random() * 120;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      life: 0.5 + Math.random() * 0.5,
      maxLife: 1,
      color: ["#ff2222", "#ff8800", "#ffcc00", "#888888"][Math.floor(Math.random() * 4)],
      size: 3 + Math.random() * 5
    });
  }
}
function updateParticles(dt) {
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
function renderParticles(ctx, camera) {
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
var tracks = [];
var MAX_TRACKS = 400;
function addTireTrack(x, y, angle) {
  tracks.push({ x, y, angle, age: 0 });
  if (tracks.length > MAX_TRACKS) tracks.shift();
}
function updateTracks(dt) {
  for (let i = tracks.length - 1; i >= 0; i--) {
    tracks[i].age += dt;
    if (tracks[i].age > 4) {
      tracks.splice(i, 1);
    }
  }
}
function renderTracks(ctx, camera) {
  for (const t of tracks) {
    if (!camera.isVisible(t.x, t.y, 5)) continue;
    const s = camera.worldToScreen(t.x, t.y);
    const alpha = Math.max(0, 1 - t.age / 4) * 0.15;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(s.x, s.y);
    ctx.rotate(t.angle);
    ctx.fillStyle = "#a09070";
    ctx.fillRect(-1, -4, 2, 8);
    ctx.restore();
  }
}

// src/game.ts
var CW2 = CONFIG.CANVAS.WIDTH;
var CH2 = CONFIG.CANVAS.HEIGHT;
var T2 = CONFIG.TAG;
var Game = class {
  canvas;
  ctx;
  arena;
  camera = new Camera();
  player;
  aiCars = [];
  allCars = [];
  phase = "title";
  gameTime = 0;
  // total elapsed play time
  // Persisted somas
  savedSomas;
  // Persisted scores
  savedScores;
  // Score history for pause screen graph
  scoreHistory = [];
  gameEvents = [];
  lastSnapshotTime = 0;
  // Pause screen AI summaries
  tacticsSummaries = null;
  tacticsFetching = false;
  // Mouse tracking for pause screen tooltips
  mouseX = 0;
  mouseY = 0;
  eventMarkers = [];
  // Ticker banner for driver brags
  tickerMessages = [];
  tickerSpeed = 60;
  // pixels per second
  lastTime = 0;
  constructor(canvas2) {
    this.canvas = canvas2;
    this.ctx = canvas2.getContext("2d");
    canvas2.width = CW2;
    canvas2.height = CH2;
    canvas2.addEventListener("mousemove", (e) => {
      const rect = canvas2.getBoundingClientRect();
      this.mouseX = (e.clientX - rect.left) * (CW2 / rect.width);
      this.mouseY = (e.clientY - rect.top) * (CH2 / rect.height);
    });
    this.savedSomas = loadSomas();
    this.savedScores = this.loadScores();
    window.__tagYourDead = {
      game: this,
      resetSomas: () => {
        localStorage.removeItem("tag-your-dead-somas");
        location.reload();
      },
      resetScores: () => {
        localStorage.removeItem("tag-your-dead-scores");
        location.reload();
      },
      resetAll: () => {
        localStorage.removeItem("tag-your-dead-somas");
        localStorage.removeItem("tag-your-dead-scores");
        location.reload();
      }
    };
  }
  async start() {
    await loadSprites();
    this.phase = "title";
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }
  loop(timestamp) {
    const dt = Math.min((timestamp - this.lastTime) / 1e3, 0.05);
    this.lastTime = timestamp;
    pollGamepad();
    this.update(dt);
    this.render();
    clearFrame();
    requestAnimationFrame((t) => this.loop(t));
  }
  // ── Update ──
  update(dt) {
    switch (this.phase) {
      case "title":
        if (wasPressed(" ") || wasPressed("Enter") || gamepadWasPressed()) {
          this.startGame();
        }
        break;
      case "playing":
        if (wasPressed("Escape") || wasPressed("p") || wasPressed("P")) {
          this.phase = "paused";
          this.tacticsSummaries = null;
          this.fetchTacticsSummaries();
          break;
        }
        this.updatePlaying(dt);
        break;
      case "paused":
        if (wasPressed("Escape") || wasPressed("p") || wasPressed("P") || wasPressed(" ") || wasPressed("Enter") || gamepadWasPressed()) {
          this.phase = "playing";
        }
        break;
    }
  }
  updatePlaying(dt) {
    this.gameTime += dt;
    if (this.player.alive) {
      const controls = getPlayerControls();
      this.player.steer(controls.steer);
      this.player.accelerate(controls.accel);
      this.player.brake(controls.brake);
      if (controls.boost) this.player.boost();
    }
    for (const ai of this.aiCars) {
      if (!ai.car.alive) continue;
      runOnTick(ai.car, ai.soma, this.gameTime, this.arena, this.allCars);
    }
    const wasAlive = /* @__PURE__ */ new Map();
    for (const car of this.allCars) {
      wasAlive.set(car.id, car.alive);
    }
    for (const car of this.allCars) {
      car.update(dt, this.arena);
    }
    for (const car of this.allCars) {
      car.sampleTrail(this.gameTime, dt);
    }
    for (const car of this.allCars) {
      if (!car.alive) continue;
      if (Math.abs(car.speed) > 60) {
        const dustCount = car.isBoosting ? 4 : 1;
        spawnDust(car.x, car.y, car.angle, Math.abs(car.speed), dustCount);
      }
      if (Math.abs(car.speed) > 30) {
        addTireTrack(car.x, car.y, car.angle);
      }
    }
    updateCollisionCooldowns(dt);
    const collisions = checkCarCollisions(this.allCars, this.arena);
    for (const col of collisions) {
      const midX = col.a.x + this.arena.wrapDx(col.b.x - col.a.x) / 2;
      const midY = col.a.y + this.arena.wrapDy(col.b.y - col.a.y) / 2;
      if (col.tagTransfer) {
        spawnTagSparks(midX, midY);
        triggerShake(6, 0.3);
        console.log(`[TAG] tag transferred between ${col.a.id} and ${col.b.id}!`);
        const newIt = col.a.isIt ? col.a : col.b;
        const gaveIt = col.a.isIt ? col.b : col.a;
        this.gameEvents.push({
          time: this.gameTime,
          carId: newIt.id,
          type: "tagged_it",
          detail: `Tagged IT`
        });
        newIt.addLifeEvent(this.gameTime, `Tagged ${this.carDisplayName(gaveIt.id)} \u2014 became IT`);
        gaveIt.addLifeEvent(this.gameTime, `Got tagged by ${this.carDisplayName(newIt.id)} \u2014 now IT`);
      } else if (col.damageToA > 5 || col.damageToB > 5) {
        spawnTagSparks(midX, midY);
        triggerShake(3, 0.15);
      }
      if (col.damageToB > 25) {
        this.gameEvents.push({
          time: this.gameTime,
          carId: col.a.id,
          type: "big_hit",
          detail: `Hit ${this.carDisplayName(col.b.id)} for ${Math.round(col.damageToB)} dmg`
        });
        col.a.addLifeEvent(this.gameTime, `Rammed ${this.carDisplayName(col.b.id)} for ${Math.round(col.damageToB)} dmg`);
        col.b.addLifeEvent(this.gameTime, `Got rammed by ${this.carDisplayName(col.a.id)} for ${Math.round(col.damageToB)} dmg`);
      }
      if (col.damageToA > 25) {
        this.gameEvents.push({
          time: this.gameTime,
          carId: col.b.id,
          type: "big_hit",
          detail: `Hit ${this.carDisplayName(col.a.id)} for ${Math.round(col.damageToA)} dmg`
        });
        col.b.addLifeEvent(this.gameTime, `Rammed ${this.carDisplayName(col.a.id)} for ${Math.round(col.damageToA)} dmg`);
        col.a.addLifeEvent(this.gameTime, `Got rammed by ${this.carDisplayName(col.b.id)} for ${Math.round(col.damageToA)} dmg`);
      }
    }
    for (const car of this.allCars) {
      if (wasAlive.get(car.id) && !car.alive) {
        spawnEliminationExplosion(car.x, car.y);
        triggerShake(10, 0.5);
        const reason = car.hp <= 0 ? "destroyed" : "timed out";
        console.log(`[ELIMINATED] ${car.id} ${reason}! Score halved to ${Math.floor(car.score)}`);
        const killerId = car.lastAttackerId;
        const killerName = killerId ? this.carDisplayName(killerId) : null;
        this.gameEvents.push({
          time: this.gameTime,
          carId: car.id,
          type: "death",
          detail: reason === "destroyed" ? killerName ? `Killed by ${killerName}` : "Destroyed" : "IT timeout",
          relatedCarId: killerId ?? void 0
        });
        car.addLifeEvent(this.gameTime, reason === "destroyed" ? killerName ? `Destroyed by ${killerName}` : "Destroyed (HP=0)" : "Died \u2014 IT timer ran out");
        if (reason === "destroyed" && killerId) {
          this.gameEvents.push({
            time: this.gameTime,
            carId: killerId,
            type: "kill",
            detail: `Destroyed ${this.carDisplayName(car.id)}`
          });
        }
        const alive = this.allCars.filter((c) => c.alive);
        if (alive.length > 0 && !alive.some((c) => c.isIt)) {
          const next = alive[Math.floor(Math.random() * alive.length)];
          next.isIt = true;
          next.itTimer = T2.IT_TIMEOUT;
          console.log(`[TAG] ${next.id} is now IT!`);
        }
        const ai = this.aiCars.find((a) => a.car === car);
        if (ai && !ai.reflecting) {
          this.triggerBackgroundReflection(ai, reason === "destroyed" ? "destroyed" : "timeout");
        }
      }
    }
    for (const car of this.allCars) {
      if (!car.alive && car.respawnTimer > 0) {
        car.respawnTimer -= dt;
        if (car.respawnTimer <= 0) {
          this.respawnCar(car);
        }
      }
    }
    updateParticles(dt);
    updateTracks(dt);
    this.updateTicker(dt);
    if (this.player.alive) {
      this.camera.update(this.player.x, this.player.y, this.arena.width, this.arena.height);
    } else {
      const firstAlive = this.allCars.find((c) => c.alive);
      if (firstAlive) {
        this.camera.update(firstAlive.x, firstAlive.y, this.arena.width, this.arena.height);
      }
    }
    if (this.gameTime - this.lastSnapshotTime >= 1) {
      this.lastSnapshotTime = this.gameTime;
      const scores = {};
      for (const car of this.allCars) {
        scores[car.id] = Math.floor(car.score);
      }
      this.scoreHistory.push({ time: this.gameTime, scores });
    }
    if (Math.floor(this.gameTime) % 5 === 0 && Math.floor(this.gameTime) !== Math.floor(this.gameTime - dt)) {
      this.saveScores();
      saveSomas(this.savedSomas);
    }
  }
  // ── Game Setup ──
  startGame() {
    this.gameTime = 0;
    this.scoreHistory = [];
    this.gameEvents = [];
    this.lastSnapshotTime = 0;
    this.tacticsSummaries = null;
    this.arena = new Arena(42);
    const cx = this.arena.width / 2;
    const cy = this.arena.height / 2;
    const totalCars = T2.CAR_COUNT + 1;
    const spawnRadius = 150;
    this.player = new Car(
      cx + Math.cos(0) * spawnRadius,
      cy + Math.sin(0) * spawnRadius,
      "red",
      "player"
    );
    this.player.angle = Math.PI;
    this.player.score = this.savedScores.get("player") ?? 0;
    this.player.hp = this.player.maxHp;
    this.aiCars = [];
    for (let i = 0; i < T2.CAR_COUNT; i++) {
      const p = PERSONALITIES[i % PERSONALITIES.length];
      const spawnAngle = (i + 1) / totalCars * Math.PI * 2;
      const car = new Car(
        cx + Math.cos(spawnAngle) * spawnRadius,
        cy + Math.sin(spawnAngle) * spawnRadius,
        p.color,
        p.name.toLowerCase()
      );
      car.angle = spawnAngle + Math.PI;
      car.score = this.savedScores.get(car.id) ?? 0;
      car.hp = car.maxHp;
      const soma = this.savedSomas.get(car.id) ?? createSoma(p);
      this.aiCars.push({ car, personality: p, soma, reflecting: false });
    }
    this.allCars = [this.player, ...this.aiCars.map((a) => a.car)];
    const itIndex = Math.floor(Math.random() * this.allCars.length);
    this.allCars[itIndex].isIt = true;
    this.allCars[itIndex].itTimer = T2.IT_TIMEOUT;
    resetCollisionCooldowns();
    this.camera.snap(this.player.x, this.player.y, this.arena.width, this.arena.height);
    this.phase = "playing";
  }
  respawnCar(car) {
    const alive = this.allCars.filter((c) => c.alive);
    const margin = CONFIG.RESPAWN.MIN_DISTANCE;
    let bestX = this.arena.width / 2;
    let bestY = this.arena.height / 2;
    let bestMinDist = 0;
    for (let attempt = 0; attempt < 20; attempt++) {
      const x = Math.random() * this.arena.width;
      const y = Math.random() * this.arena.height;
      if (this.arena.checkObstacleCollision(x, y, CONFIG.VEHICLE.COLLISION_RADIUS)) continue;
      let minDist = Infinity;
      for (const other of alive) {
        const d = this.arena.wrapDistance(x, y, other.x, other.y);
        if (d < minDist) minDist = d;
      }
      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestX = x;
        bestY = y;
      }
      if (minDist >= margin) break;
    }
    car.respawn(bestX, bestY);
    const allAlive = this.allCars.filter((c) => c.alive);
    if (allAlive.length > 0 && !allAlive.some((c) => c.isIt)) {
      car.isIt = true;
      car.itTimer = T2.IT_TIMEOUT;
    }
    console.log(`[RESPAWN] ${car.id} respawned at (${Math.round(bestX)}, ${Math.round(bestY)}) with ${Math.round(car.maxHp)} HP, score ${Math.floor(car.score)}`);
  }
  // ── Background Reflection ──
  async triggerBackgroundReflection(ai, deathCause) {
    ai.reflecting = true;
    const lifeResult = {
      score: Math.floor(ai.car.score),
      survivedSeconds: 0,
      // we don't track per-life time currently
      tagsGiven: ai.car.tagsGiven,
      tagsReceived: ai.car.tagsReceived,
      damageDealt: Math.round(ai.car.damageDealt),
      damageTaken: Math.round(ai.car.damageTaken),
      kills: ai.car.kills,
      deathCause,
      rockHits: ai.car.rockHits,
      cactusHits: ai.car.cactusHits,
      barrelHits: ai.car.barrelHits,
      wallHits: ai.car.wallHits,
      carCollisions: ai.car.carCollisions,
      timeAtWall: Math.round(ai.car.timeAtWall),
      avgSpeed: ai.car.speedSamples > 0 ? Math.round(ai.car.speedAccum / ai.car.speedSamples) : 0,
      trail: ai.car.trail,
      lifeEvents: ai.car.lifeEvents
    };
    try {
      const result = await reflectOnLife(ai.personality.name, ai.soma, lifeResult, {
        arenaWidth: this.arena.width,
        arenaHeight: this.arena.height,
        obstacles: this.arena.obstacles,
        sandPatches: this.arena.sandPatches,
        carColor: this.CAR_COLORS[ai.car.id] ?? "#888"
      });
      ai.soma = result.soma;
      this.savedSomas.set(ai.car.id, result.soma);
      saveSomas(this.savedSomas);
      console.log(`[REFLECTION] ${ai.personality.name} updated their code`);
      if (result.brag) {
        console.log(`[TICKER] ${ai.personality.name}: ${result.brag}`);
        this.pushTickerMessage(ai.personality.name, ai.car.id, result.brag);
      } else {
        console.log(`[TICKER] ${ai.personality.name}: no brag returned`);
      }
    } catch (err) {
      console.warn(`[REFLECTION] ${ai.personality.name} failed:`, err);
    }
    ai.reflecting = false;
  }
  // ── Score Persistence ──
  loadScores() {
    const raw = localStorage.getItem("tag-your-dead-scores");
    if (!raw) return /* @__PURE__ */ new Map();
    try {
      const obj = JSON.parse(raw);
      return new Map(Object.entries(obj));
    } catch {
      return /* @__PURE__ */ new Map();
    }
  }
  saveScores() {
    const obj = {};
    for (const car of this.allCars) {
      obj[car.id] = Math.floor(car.score);
    }
    localStorage.setItem("tag-your-dead-scores", JSON.stringify(obj));
  }
  // ── Render ──
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CW2, CH2);
    switch (this.phase) {
      case "title":
        this.renderTitle();
        break;
      case "playing":
        this.renderArena();
        this.renderHUD();
        this.renderTicker();
        break;
      case "paused":
        this.renderPauseScreen();
        break;
    }
  }
  renderArena() {
    const ctx = this.ctx;
    const cam = this.camera;
    const shake = updateShake(0.016);
    ctx.save();
    ctx.translate(shake.dx, shake.dy);
    ctx.fillStyle = "#efb681";
    ctx.fillRect(0, 0, CW2, CH2);
    for (const sp of this.arena.sandPatches) {
      if (!cam.isVisible(sp.x, sp.y, sp.radius + 32)) continue;
      const step = 28;
      for (let ox = -sp.radius; ox <= sp.radius; ox += step) {
        for (let oy = -sp.radius; oy <= sp.radius; oy += step) {
          if (ox * ox + oy * oy > sp.radius * sp.radius) continue;
          const wx = sp.x + ox;
          const wy = sp.y + oy;
          if (!cam.isVisible(wx, wy, 16)) continue;
          const s = cam.worldToScreen(wx, wy);
          renderSandPatch(ctx, s.x, s.y);
        }
      }
    }
    renderTracks(ctx, cam);
    for (const obs of this.arena.obstacles) {
      if (!cam.isVisible(obs.x, obs.y, obs.radius + 10)) continue;
      const s = cam.worldToScreen(obs.x, obs.y);
      if (obs.type === "rock") renderRock(ctx, s.x, s.y, obs.radius);
      else if (obs.type === "cactus") renderCactus(ctx, s.x, s.y);
      else if (obs.type === "barrel") renderBarrel(ctx, s.x, s.y);
    }
    for (const car of this.allCars) {
      if (car.alive) continue;
      if (!cam.isVisible(car.x, car.y, 30)) continue;
      const s = cam.worldToScreen(car.x, car.y);
      ctx.save();
      ctx.globalAlpha = 0.3;
      renderCar(ctx, s.x, s.y, car.angle, car.color, false, 0);
      ctx.restore();
      if (car.respawnTimer > 0) {
        ctx.save();
        ctx.font = "bold 12px monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = "#ff8844";
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        const text = car.respawnTimer.toFixed(1);
        ctx.strokeText(text, s.x, s.y - 15);
        ctx.fillText(text, s.x, s.y - 15);
        ctx.restore();
      }
    }
    for (const car of this.allCars) {
      if (!car.alive) continue;
      if (!cam.isVisible(car.x, car.y, 30)) continue;
      const s = cam.worldToScreen(car.x, car.y);
      renderCar(ctx, s.x, s.y, car.angle, car.color, car.isIt, car.immuneTimer);
    }
    renderParticles(ctx, cam);
    for (const car of this.allCars) {
      if (!car.alive) continue;
      if (!cam.isVisible(car.x, car.y, 40)) continue;
      const s = cam.worldToScreen(car.x, car.y);
      const name2 = car.id === "player" ? "YOU" : this.aiCars.find((a) => a.car.id === car.id)?.personality.name.toUpperCase() ?? car.id;
      ctx.save();
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      const nameColor = car.isIt ? "#ff4444" : this.CAR_COLORS[car.id] ?? "#ffffff";
      ctx.fillStyle = nameColor;
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.strokeText(name2, s.x, s.y - 20);
      ctx.fillText(name2, s.x, s.y - 20);
      if (car.isIt) {
        ctx.font = "bold 9px monospace";
        ctx.fillStyle = "#ff8888";
        ctx.strokeText(`IT ${car.itTimer.toFixed(0)}s`, s.x, s.y - 32);
        ctx.fillText(`IT ${car.itTimer.toFixed(0)}s`, s.x, s.y - 32);
      }
      const barW = 24;
      const barH = 3;
      const barX = s.x - barW / 2;
      const barY = car.isIt ? s.y - 44 : s.y - 38;
      const hpFrac = car.hp / car.maxHp;
      ctx.fillStyle = "#000";
      ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
      ctx.fillStyle = hpFrac > 0.5 ? "#44cc44" : hpFrac > 0.25 ? "#ccaa22" : "#cc2222";
      ctx.fillRect(barX, barY, barW * hpFrac, barH);
      ctx.restore();
    }
    ctx.restore();
  }
  renderHUD() {
    const ctx = this.ctx;
    ctx.save();
    const sorted = [...this.allCars].sort((a, b) => b.score - a.score);
    const sbX = 10;
    const sbY = 10;
    const lineH = 18;
    const sbW = 180;
    const sbH = 14 + sorted.length * lineH + 6;
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(sbX, sbY, sbW, sbH);
    ctx.strokeStyle = "#8b4513";
    ctx.lineWidth = 1;
    ctx.strokeRect(sbX, sbY, sbW, sbH);
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffaa22";
    ctx.fillText("SCOREBOARD", sbX + 6, sbY + 12);
    ctx.font = "10px monospace";
    for (let i = 0; i < sorted.length; i++) {
      const car = sorted[i];
      const name2 = car.id === "player" ? "YOU" : this.aiCars.find((a) => a.car.id === car.id)?.personality.name.toUpperCase() ?? car.id;
      const y = sbY + 14 + (i + 1) * lineH;
      const baseColor = this.CAR_COLORS[car.id] ?? "#ccc";
      ctx.fillStyle = car.alive ? baseColor : "#555";
      const status = car.alive ? "" : " \u2620";
      const ai = this.aiCars.find((a) => a.car.id === car.id);
      const reflecting = ai?.reflecting ? " \u2699" : "";
      ctx.fillText(`${Math.floor(car.score).toString().padStart(4)} ${name2}${status}${reflecting}`, sbX + 6, y);
      if (car.alive) {
        const bx = sbX + sbW - 40;
        const bw = 30;
        const bh = 4;
        const by = y - 4;
        const hpFrac = car.hp / car.maxHp;
        ctx.fillStyle = "#333";
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = hpFrac > 0.5 ? "#44cc44" : hpFrac > 0.25 ? "#ccaa22" : "#cc2222";
        ctx.fillRect(bx, by, bw * hpFrac, bh);
      }
    }
    ctx.textAlign = "center";
    if (this.player.isIt) {
      ctx.font = "bold 20px monospace";
      ctx.fillStyle = "#ff2222";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 3;
      const itText = `YOU'RE IT! ${this.player.itTimer.toFixed(1)}s`;
      ctx.strokeText(itText, CW2 / 2, 30);
      ctx.fillText(itText, CW2 / 2, 30);
    } else if (!this.player.alive) {
      ctx.font = "bold 20px monospace";
      ctx.fillStyle = "#ff4444";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 3;
      const text = this.player.respawnTimer > 0 ? `RESPAWNING IN ${this.player.respawnTimer.toFixed(1)}s` : "ELIMINATED \u2014 WATCHING";
      ctx.strokeText(text, CW2 / 2, 30);
      ctx.fillText(text, CW2 / 2, 30);
    }
    if (this.player.alive) {
      const bw = 80;
      const bh = 8;
      const bx = CW2 / 2 - bw / 2;
      const by = CH2 - 30;
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      if (this.player.isBoosting) {
        const frac = this.player.boostTimer / CONFIG.BOOST.DURATION;
        ctx.fillStyle = "#ffaa00";
        ctx.fillRect(bx, by, bw * frac, bh);
      } else if (this.player.boostCooldownFrac > 0) {
        const frac = 1 - this.player.boostCooldownFrac;
        ctx.fillStyle = "#555";
        ctx.fillRect(bx, by, bw * frac, bh);
      } else {
        ctx.fillStyle = "#ffaa00";
        ctx.fillRect(bx, by, bw, bh);
      }
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = this.player.boostCooldownFrac > 0 && !this.player.isBoosting ? "#666" : "#fff";
      ctx.fillText("BOOST [SPACE]", CW2 / 2, by - 4);
    }
    this.renderMinimap();
    ctx.restore();
  }
  renderMinimap() {
    const ctx = this.ctx;
    const mmW = 140;
    const mmH = Math.round(mmW * (this.arena.height / this.arena.width));
    const mmX = CW2 - mmW - 10;
    const mmY = 10;
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = "#2a1f14";
    ctx.fillRect(mmX, mmY, mmW, mmH);
    ctx.strokeStyle = "#8b4513";
    ctx.lineWidth = 1;
    ctx.strokeRect(mmX, mmY, mmW, mmH);
    ctx.fillStyle = "#666";
    for (const obs of this.arena.obstacles) {
      const ox = mmX + obs.x / this.arena.width * mmW;
      const oy = mmY + obs.y / this.arena.height * mmH;
      ctx.fillRect(ox - 1, oy - 1, 2, 2);
    }
    for (const car of this.allCars) {
      if (!car.alive) continue;
      const cx = mmX + car.x / this.arena.width * mmW;
      const cy = mmY + car.y / this.arena.height * mmH;
      ctx.fillStyle = car.isIt ? "#ff2222" : this.CAR_COLORS[car.id] ?? "#4488ff";
      ctx.beginPath();
      ctx.arc(cx, cy, car.id === "player" ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  // ── Pause Screen ──
  CAR_COLORS = {
    player: "#ff4444",
    viper: "#4488ff",
    bruiser: "#44cc44",
    ghost: "#cccc44",
    rattler: "#8888ff",
    "dust devil": "#999999"
  };
  carDisplayName(id) {
    if (id === "player") return "YOU";
    return this.aiCars.find((a) => a.car.id === id)?.personality.name.toUpperCase() ?? id.toUpperCase();
  }
  renderPauseScreen() {
    const ctx = this.ctx;
    ctx.fillStyle = "#1a0f08";
    ctx.fillRect(0, 0, CW2, CH2);
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffaa22";
    ctx.font = "bold 24px monospace";
    ctx.fillText("PAUSED", CW2 / 2, 30);
    ctx.fillStyle = "#888";
    ctx.font = "10px monospace";
    ctx.fillText("Press ESC / P / SPACE to resume", CW2 / 2, 48);
    this.renderScoreGraph(ctx, 20, 60, CW2 - 40, 260);
    this.renderTactics(ctx, 20, 340, CW2 - 40, CH2 - 360);
    ctx.restore();
  }
  renderScoreGraph(ctx, gx, gy, gw, gh) {
    const history = this.scoreHistory;
    if (history.length < 2) {
      ctx.fillStyle = "#666";
      ctx.font = "12px monospace";
      ctx.textAlign = "center";
      ctx.fillText("Not enough data yet \u2014 play for a few seconds", gx + gw / 2, gy + gh / 2);
      return;
    }
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(gx, gy, gw, gh);
    ctx.strokeStyle = "#8b4513";
    ctx.lineWidth = 1;
    ctx.strokeRect(gx, gy, gw, gh);
    const pad = { left: 45, right: 15, top: 20, bottom: 25 };
    const plotX = gx + pad.left;
    const plotY = gy + pad.top;
    const plotW = gw - pad.left - pad.right;
    const plotH = gh - pad.top - pad.bottom;
    const minTime = history[0].time;
    const maxTime = history[history.length - 1].time;
    const timeRange = maxTime - minTime || 1;
    let maxScore = 0;
    for (const snap of history) {
      for (const s of Object.values(snap.scores)) {
        if (s > maxScore) maxScore = s;
      }
    }
    maxScore = Math.max(maxScore, 10);
    const toX = (t) => plotX + (t - minTime) / timeRange * plotW;
    const toY = (s) => plotY + plotH - s / maxScore * plotH;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const y = plotY + i / gridLines * plotH;
      ctx.beginPath();
      ctx.moveTo(plotX, y);
      ctx.lineTo(plotX + plotW, y);
      ctx.stroke();
      const val = Math.round(maxScore * (1 - i / gridLines));
      ctx.fillStyle = "#666";
      ctx.font = "9px monospace";
      ctx.textAlign = "right";
      ctx.fillText(String(val), plotX - 5, y + 3);
    }
    ctx.textAlign = "center";
    const timeSteps = Math.min(6, Math.floor(timeRange / 10));
    for (let i = 0; i <= timeSteps; i++) {
      const t = minTime + i / Math.max(timeSteps, 1) * timeRange;
      const x = toX(t);
      ctx.fillStyle = "#666";
      ctx.font = "9px monospace";
      const mins = Math.floor(t / 60);
      const secs = Math.floor(t % 60);
      ctx.fillText(`${mins}:${secs.toString().padStart(2, "0")}`, x, plotY + plotH + 14);
    }
    const carIds = Object.keys(history[0].scores);
    for (const carId of carIds) {
      const color = this.CAR_COLORS[carId] ?? "#888";
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false;
      for (const snap of history) {
        const x = toX(snap.time);
        const y = toY(snap.scores[carId] ?? 0);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    this.eventMarkers = [];
    for (const ev of this.gameEvents) {
      if (ev.time < minTime || ev.time > maxTime) continue;
      const color = this.CAR_COLORS[ev.carId] ?? "#888";
      const name2 = this.carDisplayName(ev.carId);
      let evScore = 0;
      for (let i = 0; i < history.length; i++) {
        if (history[i].time >= ev.time) {
          evScore = history[i].scores[ev.carId] ?? 0;
          break;
        }
      }
      const ex = toX(ev.time);
      const ey = toY(evScore);
      const mins = Math.floor(ev.time / 60);
      const secs = Math.floor(ev.time % 60);
      const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`;
      if (ev.type === "death") {
        const killerColor = ev.relatedCarId ? this.CAR_COLORS[ev.relatedCarId] ?? color : color;
        ctx.font = "bold 22px monospace";
        ctx.textAlign = "center";
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 3;
        ctx.strokeText("\u2620", ex, ey - 2);
        ctx.fillStyle = killerColor;
        ctx.fillText("\u2620", ex, ey - 2);
        this.eventMarkers.push({ x: ex, y: ey - 8, label: `${name2} \u2014 ${ev.detail} [${timeStr}]`, color: killerColor });
      } else if (ev.type === "kill") {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ex, ey, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ex - 5, ey);
        ctx.lineTo(ex + 5, ey);
        ctx.moveTo(ex, ey - 5);
        ctx.lineTo(ex, ey + 5);
        ctx.stroke();
        this.eventMarkers.push({ x: ex, y: ey, label: `${name2} \u2014 ${ev.detail} [${timeStr}]`, color });
      } else if (ev.type === "big_hit") {
        ctx.fillStyle = color;
        ctx.font = "bold 14px monospace";
        ctx.textAlign = "center";
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        ctx.strokeText("\u2737", ex, ey + 1);
        ctx.fillText("\u2737", ex, ey + 1);
        this.eventMarkers.push({ x: ex, y: ey, label: `${name2} \u2014 ${ev.detail} [${timeStr}]`, color });
      } else if (ev.type === "tagged_it") {
        const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 300);
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = "#ff4444";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ex, ey, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = "#ff4444";
        ctx.beginPath();
        ctx.arc(ex, ey, 3, 0, Math.PI * 2);
        ctx.fill();
        this.eventMarkers.push({ x: ex, y: ey, label: `${name2} \u2014 ${ev.detail} [${timeStr}]`, color });
      }
    }
    const hitRadius = 14;
    for (const marker of this.eventMarkers) {
      const dx = this.mouseX - marker.x;
      const dy = this.mouseY - marker.y;
      if (dx * dx + dy * dy < hitRadius * hitRadius) {
        ctx.font = "10px monospace";
        const tw = ctx.measureText(marker.label).width + 12;
        const tooltipX = Math.min(marker.x + 10, plotX + plotW - tw);
        const tooltipY = Math.max(marker.y - 24, plotY);
        ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
        ctx.fillRect(tooltipX, tooltipY, tw, 18);
        ctx.strokeStyle = marker.color;
        ctx.lineWidth = 1;
        ctx.strokeRect(tooltipX, tooltipY, tw, 18);
        ctx.fillStyle = "#fff";
        ctx.textAlign = "left";
        ctx.fillText(marker.label, tooltipX + 6, tooltipY + 13);
        break;
      }
    }
    ctx.textAlign = "left";
    ctx.font = "9px monospace";
    let legendX = plotX;
    for (const carId of carIds) {
      const color = this.CAR_COLORS[carId] ?? "#888";
      ctx.fillStyle = color;
      ctx.fillRect(legendX, plotY - 12, 8, 3);
      const name2 = this.carDisplayName(carId);
      ctx.fillText(name2, legendX + 11, plotY - 8);
      legendX += ctx.measureText(name2).width + 22;
    }
    ctx.fillStyle = "#888";
    ctx.fillText("\u2620=death", legendX + 4, plotY - 8);
    legendX += 55;
    ctx.fillText("\u2295=kill", legendX + 4, plotY - 8);
    legendX += 45;
    ctx.fillText("\u2737=hit", legendX + 4, plotY - 8);
    legendX += 40;
    ctx.strokeStyle = "#ff4444";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(legendX + 4, plotY - 10, 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#ff4444";
    ctx.fillText("=IT", legendX + 11, plotY - 8);
  }
  renderTactics(ctx, tx, ty, tw, th) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(tx, ty, tw, th);
    ctx.strokeStyle = "#8b4513";
    ctx.lineWidth = 1;
    ctx.strokeRect(tx, ty, tw, th);
    ctx.fillStyle = "#ffaa22";
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "left";
    ctx.fillText("DRIVER INTEL", tx + 10, ty + 18);
    if (this.tacticsFetching) {
      ctx.fillStyle = "#888";
      ctx.font = "11px monospace";
      ctx.textAlign = "center";
      ctx.fillText("Analyzing driver tactics...", tx + tw / 2, ty + th / 2);
      return;
    }
    if (!this.tacticsSummaries) {
      ctx.fillStyle = "#666";
      ctx.font = "11px monospace";
      ctx.textAlign = "center";
      ctx.fillText("No intel available", tx + tw / 2, ty + th / 2);
      return;
    }
    const colCount = this.aiCars.length;
    const colW = Math.floor((tw - 20) / colCount);
    const startX = tx + 10;
    const startY = ty + 32;
    for (let i = 0; i < this.aiCars.length; i++) {
      const ai = this.aiCars[i];
      const cx = startX + i * colW;
      const summary = this.tacticsSummaries[ai.car.id] ?? "Unknown";
      const color = this.CAR_COLORS[ai.car.id] ?? "#888";
      ctx.fillStyle = color;
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "left";
      ctx.fillText(ai.personality.name.toUpperCase(), cx + 4, startY);
      ctx.fillStyle = "#aaa";
      ctx.font = "9px monospace";
      ctx.fillText(`Score: ${Math.floor(ai.car.score)}`, cx + 4, startY + 13);
      ctx.fillStyle = "#ccc";
      ctx.font = "9px monospace";
      const maxLineW = colW - 12;
      const lines = this.wrapText(ctx, summary, maxLineW);
      let ly = startY + 28;
      for (const line of lines.slice(0, 12)) {
        ctx.fillText(line, cx + 4, ly);
        ly += 11;
      }
    }
  }
  wrapText(ctx, text, maxWidth) {
    const words = text.split(" ");
    const lines = [];
    let current = "";
    for (const word of words) {
      const test = current ? current + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  }
  async fetchTacticsSummaries() {
    if (this.tacticsFetching) return;
    this.tacticsFetching = true;
    const drivers = this.aiCars.map((ai) => ({
      id: ai.car.id,
      name: ai.personality.name,
      score: Math.floor(ai.car.score),
      identity: ai.soma.identity.content,
      on_tick: ai.soma.on_tick.content,
      memory: ai.soma.memory.content
    }));
    const prompt = drivers.map(
      (d) => `<driver id="${d.id}" name="${d.name}" score="${d.score}">
<identity>${d.identity}</identity>
<on_tick>${d.on_tick}</on_tick>
<memory>${d.memory}</memory>
</driver>`
    ).join("\n\n");
    const schema = {
      type: "object",
      properties: Object.fromEntries(drivers.map((d) => [
        d.id,
        { type: "string", description: `2-3 sentence tactics summary for ${d.name}` }
      ])),
      required: drivers.map((d) => d.id),
      additionalProperties: false
    };
    try {
      const resp = await fetch(CONFIG.API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: `Demolition derby driver analysis. For each driver, write a 1-2 sentence summary of their driving tactics based on their code. Be specific and concise \u2014 what do they target, how do they dodge, what's their style? Max 30 words each.

${prompt}`
            }
          ],
          output_config: {
            format: {
              type: "json_schema",
              schema: {
                type: "object",
                properties: schema.properties,
                required: schema.required,
                additionalProperties: false
              }
            }
          }
        })
      });
      if (!resp.ok) throw new Error(`API ${resp.status}`);
      const data = await resp.json();
      const text = data.content?.[0]?.text;
      if (text) {
        this.tacticsSummaries = JSON.parse(text);
      }
    } catch (err) {
      console.warn("[TACTICS] Failed to fetch summaries:", err);
      this.tacticsSummaries = {};
      for (const ai of this.aiCars) {
        this.tacticsSummaries[ai.car.id] = ai.soma.identity.content;
      }
    }
    this.tacticsFetching = false;
  }
  pushTickerMessage(name2, carId, text) {
    const color = this.CAR_COLORS[carId] ?? "#888";
    this.tickerMessages.push({ name: name2.toUpperCase(), color, text, x: CW2 + 10 });
  }
  updateTicker(dt) {
    for (const msg of this.tickerMessages) {
      msg.x -= this.tickerSpeed * dt;
    }
    this.tickerMessages = this.tickerMessages.filter(
      (msg) => msg.x > -(msg.name.length + msg.text.length + 10) * 7
    );
  }
  renderTicker() {
    if (this.tickerMessages.length === 0) return;
    const ctx = this.ctx;
    const y = CH2 - 12;
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, y - 11, CW2, 18);
    ctx.font = "bold 10px monospace";
    for (const msg of this.tickerMessages) {
      ctx.fillStyle = msg.color;
      ctx.textAlign = "left";
      ctx.fillText(`${msg.name}:`, msg.x, y);
      const nameW = ctx.measureText(`${msg.name}: `).width;
      ctx.fillStyle = "#ccc";
      ctx.fillText(msg.text, msg.x + nameW, y);
    }
    ctx.restore();
  }
  renderTitle() {
    const ctx = this.ctx;
    ctx.fillStyle = "#1a0f08";
    ctx.fillRect(0, 0, CW2, CH2);
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "#ff4444";
    ctx.font = "bold 48px monospace";
    ctx.fillText("TAG YOU'RE DEAD", CW2 / 2, CH2 / 3);
    ctx.fillStyle = "#d4b896";
    ctx.font = "18px monospace";
    ctx.fillText("Desert Demolition Derby", CW2 / 2, CH2 / 3 + 40);
    ctx.fillStyle = "#888";
    ctx.font = "14px monospace";
    ctx.fillText("Arrow keys / WASD / Gamepad to drive \u2014 SPACE to boost", CW2 / 2, CH2 / 2 + 20);
    ctx.fillText("Ram cars to deal damage \u2014 being IT means 3x damage output", CW2 / 2, CH2 / 2 + 45);
    ctx.fillText("Higher score = more HP and speed", CW2 / 2, CH2 / 2 + 70);
    ctx.fillText("No walls \u2014 edges wrap around. Die? Score halved. Keep fighting.", CW2 / 2, CH2 / 2 + 95);
    if (this.savedScores.size > 0) {
      ctx.fillStyle = "#aaa";
      ctx.font = "bold 14px monospace";
      ctx.fillText("\u2500\u2500\u2500 CAREER SCORES \u2500\u2500\u2500", CW2 / 2, CH2 / 2 + 140);
      ctx.font = "12px monospace";
      let y = CH2 / 2 + 160;
      const entries = [...this.savedScores.entries()].sort((a, b) => b[1] - a[1]);
      for (const [id, score] of entries.slice(0, 6)) {
        const name2 = id === "player" ? "YOU" : PERSONALITIES.find((p) => p.name.toLowerCase() === id)?.name ?? id;
        ctx.fillText(`${name2}: ${score}`, CW2 / 2, y);
        y += 18;
      }
    }
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(performance.now() / 400);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px monospace";
    ctx.fillText("PRESS SPACE / A TO START", CW2 / 2, CH2 - 60);
    ctx.restore();
  }
};

// src/main.ts
var canvas = document.getElementById("game-canvas");
var game = new Game(canvas);
game.start();
//# sourceMappingURL=main.js.map

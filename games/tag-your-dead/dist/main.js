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
    SOFT_OBSTACLE_SPEED_MULT: 0.5
    // cacti/barrels slow you to 50% speed on pass-through
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
  // Pre-baked sand texture positions (cosmetic only)
  sandPatches = [];
  constructor(seed = 42) {
    const rng = seededRng(seed);
    this.generate(rng);
  }
  generate(rng) {
    const margin = 120;
    const center = { x: this.width / 2, y: this.height / 2 };
    for (let i = 0; i < A.ROCK_COUNT; i++) {
      const x = margin + rng() * (this.width - 2 * margin);
      const y = margin + rng() * (this.height - 2 * margin);
      const dx = x - center.x;
      const dy = y - center.y;
      if (Math.sqrt(dx * dx + dy * dy) < 200) continue;
      this.obstacles.push({ x, y, radius: 14 + rng() * 12, type: "rock" });
    }
    for (let i = 0; i < A.CACTUS_COUNT; i++) {
      const x = margin + rng() * (this.width - 2 * margin);
      const y = margin + rng() * (this.height - 2 * margin);
      const dx = x - center.x;
      const dy = y - center.y;
      if (Math.sqrt(dx * dx + dy * dy) < 200) continue;
      this.obstacles.push({ x, y, radius: 8 + rng() * 6, type: "cactus" });
    }
    for (let i = 0; i < A.BARREL_COUNT; i++) {
      const x = margin + rng() * (this.width - 2 * margin);
      const y = margin + rng() * (this.height - 2 * margin);
      const dx = x - center.x;
      const dy = y - center.y;
      if (Math.sqrt(dx * dx + dy * dy) < 200) continue;
      this.obstacles.push({ x, y, radius: 10, type: "barrel" });
    }
    for (let i = 0; i < 60; i++) {
      this.sandPatches.push({
        x: rng() * this.width,
        y: rng() * this.height
      });
    }
  }
  checkObstacleCollision(x, y, radius) {
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
  // Clamp position to arena bounds
  clampPosition(x, y, margin = 10) {
    return {
      x: Math.max(margin, Math.min(this.width - margin, x)),
      y: Math.max(margin, Math.min(this.height - margin, y))
    };
  }
};

// src/car.ts
var V = CONFIG.VEHICLE;
var T = CONFIG.TAG;
var D = CONFIG.DAMAGE;
var S = CONFIG.SCORE;
var R = CONFIG.RESPAWN;
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
  // Obstacle hit tracking (for event log)
  _lastObstacleHit = null;
  _obstacleCooldown = 0;
  // prevent counting same obstacle multiple frames
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
    return V.BASE_MAX_SPEED + Math.min(this.score, S.SCALE_CAP) * S.SPEED_FACTOR;
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
    this.score += S.PER_SECOND * dt;
    if (this.accelInput > 0) {
      if (this.speed < 0) {
        this.speed += V.BRAKING * this.accelInput * dt;
        if (this.speed > 0) this.speed = 0;
      } else {
        this.speed += V.ACCELERATION * this.accelInput * dt;
      }
    }
    if (this.brakeInput > 0) {
      if (this.speed > 0) {
        this.speed -= V.BRAKING * this.brakeInput * dt;
        if (this.speed < 0) this.speed = 0;
      } else {
        this.speed -= V.ACCELERATION * 0.5 * this.brakeInput * dt;
      }
    }
    if (this.speed > 0) {
      this.speed -= V.FRICTION * dt;
      if (this.speed < 0) this.speed = 0;
    } else if (this.speed < 0) {
      this.speed += V.FRICTION * dt;
      if (this.speed > 0) this.speed = 0;
    }
    const ms = this.maxSpeed;
    const maxReverse = ms * 0.4;
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
        const dx = newX - collision.x;
        const dy = newY - collision.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = collision.radius + V.COLLISION_RADIUS - dist;
        this.x += nx * (overlap + V.BOUNCE_DISTANCE);
        this.y += ny * (overlap + V.BOUNCE_DISTANCE);
        const impactSpeed = Math.abs(this.speed);
        const rockDamage = impactSpeed * D.DAMAGE_FACTOR * D.ROCK_DAMAGE_FACTOR;
        const angleToRock = Math.atan2(collision.y - this.y, collision.x - this.x);
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
        this.speed *= D.SOFT_OBSTACLE_SPEED_MULT;
        if (this._obstacleCooldown <= 0) {
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
    const pos = arena.clampPosition(this.x, this.y, V.COLLISION_RADIUS);
    if (pos.x !== this.x || pos.y !== this.y) {
      this.timeAtWall += dt;
      if (Math.abs(this.speed) > 10) {
        this.speed *= -0.3;
        this.wallHits++;
      } else {
        this.speed = 0;
      }
    }
    this.speedAccum += Math.abs(this.speed);
    this.speedSamples++;
    this.x = pos.x;
    this.y = pos.y;
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
      const dist = a.distanceTo(b);
      if (dist >= D.COLLISION_DISTANCE) continue;
      if (a.immuneTimer > 0 || b.immuneTimer > 0) continue;
      const key = pairKey(a, b);
      if (collisionCooldowns.has(key)) continue;
      collisionCooldowns.set(key, D.COLLISION_COOLDOWN);
      a.carCollisions++;
      b.carCollisions++;
      const speedA = Math.abs(a.speed);
      const speedB = Math.abs(b.speed);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = dist || 1;
      const nx = dx / d;
      const ny = dy / d;
      const overlap = D.COLLISION_DISTANCE - dist;
      const push = overlap / 2 + D.BUMP_FORCE;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const posA = arena.clampPosition(a.x, a.y, V.COLLISION_RADIUS);
      a.x = posA.x;
      a.y = posA.y;
      const posB = arena.clampPosition(b.x, b.y, V.COLLISION_RADIUS);
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
      const killedB = b.takeDamage(selfDamageToB);
      const killedA = a.takeDamage(selfDamageToA);
      if (killedB) {
        a.kills++;
        a.score += S.KILL_BONUS;
      }
      if (killedA) {
        b.kills++;
        b.score += S.KILL_BONUS;
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
  update(targetX, targetY, worldW, worldH) {
    this.x += (targetX - this.x) * C.SMOOTHING;
    this.y += (targetY - this.y) * C.SMOOTHING;
    this.x = Math.max(CW / 2, Math.min(worldW - CW / 2, this.x));
    this.y = Math.max(CH / 2, Math.min(worldH - CH / 2, this.y));
  }
  worldToScreen(wx, wy) {
    return {
      x: wx - this.x + CW / 2,
      y: wy - this.y + CH / 2
    };
  }
  isVisible(wx, wy, margin = 50) {
    const sx = wx - this.x + CW / 2;
    const sy = wy - this.y + CH / 2;
    return sx > -margin && sx < CW + margin && sy > -margin && sy < CH + margin;
  }
  snap(targetX, targetY, worldW, worldH) {
    this.x = Math.max(CW / 2, Math.min(worldW - CW / 2, targetX));
    this.y = Math.max(CH / 2, Math.min(worldH - CH / 2, targetY));
  }
};

// src/input.ts
var held = /* @__PURE__ */ new Set();
var justPressed = /* @__PURE__ */ new Set();
window.addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
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
}
function getPlayerControls() {
  let steer = 0;
  let accel = 0;
  let brake = 0;
  if (isHeld("ArrowLeft") || isHeld("a")) steer -= 1;
  if (isHeld("ArrowRight") || isHeld("d")) steer += 1;
  if (isHeld("ArrowUp") || isHeld("w")) accel = 1;
  if (isHeld("ArrowDown") || isHeld("s")) brake = 1;
  if (isHeld(" ")) brake = 1;
  return { steer, accel, brake };
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
      0,
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
        }
      } else {
        // Dodge "it" car if close
        if (itCar && me.distanceTo(itCar.x, itCar.y) < 200) {
          const awayAngle = me.angleTo(itCar.x, itCar.y) + Math.PI;
          const diff = awayAngle - me.angle;
          me.steer(Math.atan2(Math.sin(diff), Math.cos(diff)) * 2);
          me.accelerate(1);
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
        }
      } else {
        // Orbit center, dodge "it" and high-speed cars
        const toCenter = me.angleTo(centerX, centerY);
        let targetAngle = toCenter;

        if (itCar && me.distanceTo(itCar.x, itCar.y) < 180) {
          targetAngle = me.angleTo(itCar.x, itCar.y) + Math.PI;
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
function buildMeAPI(car, soma) {
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
    distanceTo(x, y) {
      const dx = car.x - x;
      const dy = car.y - y;
      return Math.sqrt(dx * dx + dy * dy);
    },
    angleTo(x, y) {
      return Math.atan2(y - car.y, x - car.x);
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
  const me = buildMeAPI(car, soma);
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

// src/reflection.ts
var API = CONFIG.API_ENDPOINT;
async function callAPI(model, system, userMsg, tools, maxTokens = 1024) {
  const body = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userMsg }]
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = { type: "any" };
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
    description: "Replace your driving code. Runs every frame with (me, world). me: x, y, angle, speed, hp, maxHp, maxSpeed, score, isIt, itTimer, immuneTimer, alive, steer(dir), accelerate(amt), brake(amt), distanceTo(x,y), angleTo(x,y), memory.read()/write(), identity.read(), on_tick.read(). world: time, arenaWidth, arenaHeight, otherCars[{id,x,y,angle,speed,hp,score,isIt,alive,immuneTimer}], obstacles[{x,y,radius,type}].",
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
async function reflectOnLife(carName, soma, result) {
  const system = `You are ${carName}, a car in a desert demolition derby. You just died and are reflecting on your last life.

<identity>${soma.identity.content}</identity>
<on_tick>${soma.on_tick.content}</on_tick>
<memory>${soma.memory.content || "(empty)"}</memory>

GAME MECHANICS:
- Continuous demolition derby. No rounds \u2014 die, respawn in 5s, keep fighting.
- Damage from collisions: speed \xD7 0.15. Being "it" multiplies YOUR damage output by 3x.
- Front-bumper hits (ramming nose-first, within \xB160\xB0 of your facing direction) only deal 10% damage to YOU. Side and rear hits take full damage. Facing your target when you ram is much safer.
- Die (HP=0 or IT timer expires) \u2192 score halved, then respawn.
- Score: +1/sec alive, +0.5 per damage dealt, +50 per kill. Higher score \u2192 more HP and speed (caps at score 200).
- Tag transfer: ram the "it" car or get rammed by it (must be moving) to transfer the tag. 1.5s immunity after tag transfer.

ARENA:
- Flat desert, ${CONFIG.ARENA.WIDTH}\xD7${CONFIG.ARENA.HEIGHT} with hard walls at the edges.
- Obstacles: rocks (solid \u2014 bounce off, take some damage), cacti and barrels (slow you down but you drive through them).
- Other cars visible via world.otherCars with their position, angle, speed, HP, score, and "it" status.

Call ALL tools you want to use in a single response.`;
  const userMsg = `You died. Cause: ${result.deathCause === "destroyed" ? "HP reached 0" : "IT timer ran out"}.

Score before death: ${result.score} (now halved). Average speed: ${result.avgSpeed}.
Damage dealt: ${result.damageDealt}. Damage taken: ${result.damageTaken}. Kills: ${result.kills}.
Tags given: ${result.tagsGiven}. Tags received: ${result.tagsReceived}.
Collisions: ${buildHitSummary(result)}.

Reflect on this life and update your soma.`;
  try {
    const resp = await callAPI("claude-sonnet-4-5-20250929", system, userMsg, REFLECTION_TOOLS);
    const updated = { ...soma };
    for (const block of resp.content) {
      if (block.type === "tool_use" && block.input) {
        const input = block.input;
        const name = block.name;
        if (name === "edit_on_tick" && input.code) {
          updated.on_tick = { content: input.code };
        } else if (name === "edit_memory" && input.content) {
          updated.memory = { content: input.content };
        } else if (name === "edit_identity" && input.content) {
          updated.identity = { content: input.content };
        }
      }
    }
    console.log(`[REFLECT] ${carName} reflection complete`);
    return updated;
  } catch (err) {
    console.warn(`[REFLECT] ${carName} reflection failed:`, err);
    return soma;
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
  lastTime = 0;
  constructor(canvas2) {
    this.canvas = canvas2;
    this.ctx = canvas2.getContext("2d");
    canvas2.width = CW2;
    canvas2.height = CH2;
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
    this.update(dt);
    this.render();
    clearFrame();
    requestAnimationFrame((t) => this.loop(t));
  }
  // ── Update ──
  update(dt) {
    switch (this.phase) {
      case "title":
        if (wasPressed(" ") || wasPressed("Enter")) {
          this.startGame();
        }
        break;
      case "playing":
        this.updatePlaying(dt);
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
      if (!car.alive) continue;
      if (Math.abs(car.speed) > 60) {
        spawnDust(car.x, car.y, car.angle, Math.abs(car.speed), 1);
      }
      if (Math.abs(car.speed) > 30) {
        addTireTrack(car.x, car.y, car.angle);
      }
    }
    updateCollisionCooldowns(dt);
    const collisions = checkCarCollisions(this.allCars, this.arena);
    for (const col of collisions) {
      const midX = (col.a.x + col.b.x) / 2;
      const midY = (col.a.y + col.b.y) / 2;
      if (col.tagTransfer) {
        spawnTagSparks(midX, midY);
        triggerShake(6, 0.3);
        console.log(`[TAG] tag transferred between ${col.a.id} and ${col.b.id}!`);
      } else if (col.damageToA > 5 || col.damageToB > 5) {
        spawnTagSparks(midX, midY);
        triggerShake(3, 0.15);
      }
    }
    for (const car of this.allCars) {
      if (wasAlive.get(car.id) && !car.alive) {
        spawnEliminationExplosion(car.x, car.y);
        triggerShake(10, 0.5);
        const reason = car.hp <= 0 ? "destroyed" : "timed out";
        console.log(`[ELIMINATED] ${car.id} ${reason}! Score halved to ${Math.floor(car.score)}`);
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
    if (this.player.alive) {
      this.camera.update(this.player.x, this.player.y, this.arena.width, this.arena.height);
    } else {
      const firstAlive = this.allCars.find((c) => c.alive);
      if (firstAlive) {
        this.camera.update(firstAlive.x, firstAlive.y, this.arena.width, this.arena.height);
      }
    }
    if (Math.floor(this.gameTime) % 5 === 0 && Math.floor(this.gameTime) !== Math.floor(this.gameTime - dt)) {
      this.saveScores();
      saveSomas(this.savedSomas);
    }
  }
  // ── Game Setup ──
  startGame() {
    this.gameTime = 0;
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
      const x = 100 + Math.random() * (this.arena.width - 200);
      const y = 100 + Math.random() * (this.arena.height - 200);
      if (this.arena.checkObstacleCollision(x, y, CONFIG.VEHICLE.COLLISION_RADIUS)) continue;
      let minDist = Infinity;
      for (const other of alive) {
        const dx = other.x - x;
        const dy = other.y - y;
        const d = Math.sqrt(dx * dx + dy * dy);
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
      avgSpeed: ai.car.speedSamples > 0 ? Math.round(ai.car.speedAccum / ai.car.speedSamples) : 0
    };
    try {
      const updated = await reflectOnLife(ai.personality.name, ai.soma, lifeResult);
      ai.soma = updated;
      this.savedSomas.set(ai.car.id, updated);
      saveSomas(this.savedSomas);
      console.log(`[REFLECTION] ${ai.personality.name} updated their code`);
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
        break;
    }
  }
  renderArena() {
    const ctx = this.ctx;
    const cam = this.camera;
    const shake = updateShake(0.016);
    ctx.save();
    ctx.translate(shake.dx, shake.dy);
    ctx.fillStyle = "#d4b896";
    ctx.fillRect(0, 0, CW2, CH2);
    for (const sp of this.arena.sandPatches) {
      if (cam.isVisible(sp.x, sp.y, 20)) {
        const s = cam.worldToScreen(sp.x, sp.y);
        renderSandPatch(ctx, s.x, s.y);
      }
    }
    renderTracks(ctx, cam);
    const tl = cam.worldToScreen(0, 0);
    const br = cam.worldToScreen(this.arena.width, this.arena.height);
    ctx.strokeStyle = "#8b4513";
    ctx.lineWidth = 4;
    ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
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
      const name = car.id === "player" ? "YOU" : this.aiCars.find((a) => a.car.id === car.id)?.personality.name.toUpperCase() ?? car.id;
      ctx.save();
      const barW = 24;
      const barH = 3;
      const barX = s.x - barW / 2;
      const barY = s.y - 38;
      const hpFrac = car.hp / car.maxHp;
      ctx.fillStyle = "#000";
      ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
      ctx.fillStyle = hpFrac > 0.5 ? "#44cc44" : hpFrac > 0.25 ? "#ccaa22" : "#cc2222";
      ctx.fillRect(barX, barY, barW * hpFrac, barH);
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = car.isIt ? "#ff4444" : "#ffffff";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.strokeText(name, s.x, s.y - 20);
      ctx.fillText(name, s.x, s.y - 20);
      if (car.isIt) {
        ctx.font = "bold 9px monospace";
        ctx.fillStyle = "#ff8888";
        ctx.strokeText(`IT ${car.itTimer.toFixed(0)}s`, s.x, s.y - 30);
        ctx.fillText(`IT ${car.itTimer.toFixed(0)}s`, s.x, s.y - 30);
      }
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
      const name = car.id === "player" ? "YOU" : this.aiCars.find((a) => a.car.id === car.id)?.personality.name.toUpperCase() ?? car.id;
      const y = sbY + 14 + (i + 1) * lineH;
      if (car.id === "player") {
        ctx.fillStyle = "#ff8888";
      } else if (!car.alive) {
        ctx.fillStyle = "#666";
      } else {
        ctx.fillStyle = "#ccc";
      }
      const status = car.alive ? "" : " \u2620";
      const ai = this.aiCars.find((a) => a.car.id === car.id);
      const reflecting = ai?.reflecting ? " \u2699" : "";
      ctx.fillText(`${Math.floor(car.score).toString().padStart(4)} ${name}${status}${reflecting}`, sbX + 6, y);
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
      ctx.fillStyle = car.isIt ? "#ff2222" : car.id === "player" ? "#ff6666" : "#4488ff";
      ctx.beginPath();
      ctx.arc(cx, cy, car.id === "player" ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
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
    ctx.fillText("Arrow keys / WASD to drive", CW2 / 2, CH2 / 2 + 20);
    ctx.fillText("Ram cars to deal damage \u2014 being IT means 3x damage", CW2 / 2, CH2 / 2 + 45);
    ctx.fillText("Higher score = more HP and speed", CW2 / 2, CH2 / 2 + 70);
    ctx.fillText("Die? Score halved. Respawn. Keep fighting.", CW2 / 2, CH2 / 2 + 95);
    if (this.savedScores.size > 0) {
      ctx.fillStyle = "#aaa";
      ctx.font = "bold 14px monospace";
      ctx.fillText("\u2500\u2500\u2500 CAREER SCORES \u2500\u2500\u2500", CW2 / 2, CH2 / 2 + 140);
      ctx.font = "12px monospace";
      let y = CH2 / 2 + 160;
      const entries = [...this.savedScores.entries()].sort((a, b) => b[1] - a[1]);
      for (const [id, score] of entries.slice(0, 6)) {
        const name = id === "player" ? "YOU" : PERSONALITIES.find((p) => p.name.toLowerCase() === id)?.name ?? id;
        ctx.fillText(`${name}: ${score}`, CW2 / 2, y);
        y += 18;
      }
    }
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(performance.now() / 400);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px monospace";
    ctx.fillText("PRESS SPACE TO START", CW2 / 2, CH2 - 60);
    ctx.restore();
  }
};

// src/main.ts
var canvas = document.getElementById("game-canvas");
var game = new Game(canvas);
game.start();
//# sourceMappingURL=main.js.map

export const CONFIG = {
  CANVAS: { WIDTH: 960, HEIGHT: 720 },

  // Tighter arena for derby action
  ARENA: {
    WIDTH: 2000,
    HEIGHT: 1500,
    TILE_SIZE: 32,
    ROCK_COUNT: 25,
    CACTUS_COUNT: 15,
    BARREL_COUNT: 8,
  },

  VEHICLE: {
    BASE_MAX_SPEED: 200,
    ACCELERATION: 300,
    BRAKING: 400,
    FRICTION: 80,
    TURN_SPEED: 3.0,
    WIDTH: 20,
    HEIGHT: 12,
    COLLISION_RADIUS: 12,
    BOUNCE_FACTOR: -0.4,
    BOUNCE_DISTANCE: 4,
  },

  TAG: {
    IT_TIMEOUT: 25,          // seconds before "it" is eliminated
    TAG_DISTANCE: 30,        // how close to tag someone
    TAG_IMMUNITY: 1.5,       // seconds of immunity after being tagged
    MIN_SPEED_TO_TAG: 40,    // must be moving to tag
    CAR_COUNT: 5,            // AI cars
  },

  DAMAGE: {
    BASE_MAX_HP: 100,
    COLLISION_DISTANCE: 28,    // car-to-car collision check radius
    DAMAGE_FACTOR: 0.15,       // damage = speed * factor (200 speed = 30 base damage)
    IT_DAMAGE_MULTIPLIER: 3,   // "it" cars deal 3x damage
    COLLISION_COOLDOWN: 0.3,   // seconds between damage from same pair
    BUMP_FORCE: 20,            // push-apart distance on collision
    BUMP_SPEED_TRANSFER: 0.3,  // speed reduction on bump
    HIT_GRACE_PERIOD: 1.0,     // seconds of invulnerability after being hit
    FRONT_HIT_ANGLE: Math.PI / 3,  // ±60° cone counts as "front bumper"
    FRONT_HIT_SELF_DAMAGE: 0.1,    // front-bumper rammer takes only 10% damage
    ROCK_DAMAGE_FACTOR: 0.2,       // rock hit damage = 20% of equivalent car collision
    SOFT_OBSTACLE_SPEED_MULT: 0.6, // cacti/barrels slow you to 60% speed on pass-through (one-time)
    SAND_FRICTION_MULT: 3.0,       // rough sand multiplies friction by 3x (gradual slowdown)
  },

  RESPAWN: {
    TIMER: 5,                  // seconds before respawn
    MIN_DISTANCE: 200,         // minimum distance from other cars on respawn
    SPAWN_IMMUNITY: 2.0,       // seconds of immunity after respawn
  },

  SCORE: {
    PER_SECOND: 1,             // points per second alive
    PER_DAMAGE: 0.5,           // points per damage dealt
    KILL_BONUS: 50,            // points for destroying a car
    DEATH_PENALTY: 0.5,        // multiply score by this on death
    // Stat scaling: stat = base + min(score, CAP) * FACTOR
    HP_FACTOR: 0.5,            // score 200 → +100 HP (200 total)
    SPEED_FACTOR: 0.15,        // score 200 → +30 speed (230 total)
    SCALE_CAP: 200,            // score above this doesn't increase stats further
  },

  CAMERA: {
    SMOOTHING: 0.08,
  },

  SOMA: {
    ON_TICK_TIMEOUT: 50,     // ms max for on_tick execution
  },

  API_ENDPOINT: '/api/inference/anthropic/messages',
};

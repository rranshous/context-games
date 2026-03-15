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
    MAX_SPEED: 200,
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
    ROUND_PAUSE: 3,          // seconds between rounds
    MIN_SPEED_TO_TAG: 40,    // must be moving to tag
    INITIAL_CAR_COUNT: 5,    // AI cars per round
  },

  DAMAGE: {
    MAX_HP: 100,
    COLLISION_DISTANCE: 28,    // car-to-car collision check radius
    DAMAGE_FACTOR: 0.15,       // damage = speed * factor (200 speed = 30 base damage)
    IT_DAMAGE_MULTIPLIER: 3,   // "it" cars deal 3x damage
    COLLISION_COOLDOWN: 0.3,   // seconds between damage from same pair
    BUMP_FORCE: 20,            // push-apart distance on collision
    BUMP_SPEED_TRANSFER: 0.3,  // speed reduction on bump
    HIT_GRACE_PERIOD: 1.0,     // seconds of invulnerability after being hit
  },

  CAMERA: {
    SMOOTHING: 0.08,
  },

  SOMA: {
    ON_TICK_TIMEOUT: 50,     // ms max for on_tick execution
  },

  API_ENDPOINT: '/api/inference/anthropic/messages',
};

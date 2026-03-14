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

  CAMERA: {
    SMOOTHING: 0.08,
  },

  SOMA: {
    ON_TICK_TIMEOUT: 50,     // ms max for on_tick execution
  },

  API_ENDPOINT: '/api/inference/anthropic/messages',
};

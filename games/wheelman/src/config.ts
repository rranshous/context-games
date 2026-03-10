export const CONFIG = {
  WORLD: { WIDTH: 8000, HEIGHT: 6000, TILE_SIZE: 32 },
  CANVAS: { WIDTH: 960, HEIGHT: 720 },

  VEHICLE: {
    MAX_SPEED: 220,
    ACCELERATION: 280,
    BRAKING: 400,
    FRICTION: 90,
    TURN_SPEED: 2.8,
    WIDTH: 20,
    HEIGHT: 12,
    BOUNCE_FACTOR: -0.3,
    BOUNCE_DISTANCE: 3,
    TERRAIN_FRICTION_MULT: 600,
    MIN_SPEED_MULT: 0.2,
    SENSOR_RANGE: 300, // pixels, how far driver "sees"
  },

  RUN: {
    MAX_DURATION: 60, // seconds
    OBJECTIVE_REACH_DIST: 40, // pixels to count as "arrived"
  },

  CAMERA: {
    SMOOTHING: 0.08,
  },

  // Desert generation
  DESERT: {
    WATER_COUNT: 20,
    ROCK_COUNT: 80,
    CACTUS_GROVE_COUNT: 30,
    TEXTURED_SAND_COUNT: 60,
    ROAD_SEGMENTS: 8, // rough roads connecting areas
  },

  API_ENDPOINT: '/api/inference/anthropic/messages',
};

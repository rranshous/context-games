export const CONFIG = {
  WORLD: { WIDTH: 14000, HEIGHT: 10000, TILE_SIZE: 32 },
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
    MAX_DURATION: 240, // seconds
    OBJECTIVE_REACH_DIST: 40, // pixels to count as "arrived"
  },

  CAMERA: {
    SMOOTHING: 0.08,
  },

  // Desert generation
  DESERT: {
    WATER_COUNT: 50,
    ROCK_COUNT: 300,       // feeds formations (~37 clusters + 60 scatter)
    CACTUS_GROVE_COUNT: 80,
    TEXTURED_SAND_COUNT: 100,
    ROAD_SEGMENTS: 18,     // more roads = more route choices
  },

  PURSUER: {
    PATROL_SPEED: 160,       // slower than driver max (220)
    CHASE_SPEED: 200,        // fast but driver can outrun on roads
    SPOT_RANGE: 400,         // pixels — detection radius
    CATCH_DISTANCE: 30,      // pixels — close enough = caught
    LOSE_DISTANCE: 600,      // pixels — escapes detection
    LOSE_TIME: 3,            // seconds out of range before giving up chase
    WIDTH: 20,
    HEIGHT: 12,
    PATROL_WAYPOINT_SPREAD: 2000, // how far apart patrol waypoints are
    SIGNAL_TIMEOUT: 50,      // ms max for on_tick execution
  },

  // Escalation: how many pursuers per win count
  // Only ticks up on successful deliveries. After 4 cops, +1 per win.
  ESCALATION_BASE: [
    { minWins: 0, count: 1 },
    { minWins: 2, count: 2 },
    { minWins: 4, count: 3 },
    { minWins: 6, count: 4 },
  ],
  ESCALATION_UNCAPPED_FROM: 7, // wins >= this: count = 4 + (wins - 6)

  // Display units — pixels to human-readable
  // 220 px/s max → ~120 mph, 14000px world → ~9.5 miles across
  UNITS: {
    PX_TO_MPH: 120 / 220,      // multiply px/s by this for mph
    PX_TO_MILES: 9.5 / 14000,  // multiply px by this for miles
  },

  API_ENDPOINT: '/api/inference/anthropic/messages',
};

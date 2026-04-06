// ── Action Vocabulary (Tendency System) ──
// Each action is a DIRECTIONAL FUNCTION: given (me, world), it returns the
// direction this tendency wants to pull the car. The magnitude comes from
// elsewhere — either the tendency probe (learned) or the on_tick code
// (authored). Both use the same vocabulary.
//
// Every action fires every tick. The net movement is a softmax-weighted
// composition of all active tendencies. There is no argmax, no selection.

import { MeAPI, WorldAPI, OtherCarAPI } from '../soma';

/** A tendency's directional contribution: where it wants to steer and
 *  how much it wants to accelerate. Values are unbounded unit-direction
 *  type numbers (the softmax + clamping happens downstream). */
export interface TendencyVector {
  steer: number;   // negative = left, positive = right (relative to car facing)
  accel: number;   // positive = forward, negative = brake/reverse
}

export interface TendencyDef {
  /** Short name — used in on_tick API as me.{name}(magnitude). */
  name: string;
  /** Human-readable description for Claude reflection context. */
  description: string;
  /** Is this tendency applicable right now? If false, it contributes
   *  nothing regardless of magnitude. */
  available: (me: MeAPI, world: WorldAPI) => boolean;
  /** The directional pull of this tendency. Returns a unit-ish direction;
   *  magnitude is applied externally. */
  direction: (me: MeAPI, world: WorldAPI) => TendencyVector;
}

// ── Helpers ──

function nearestCar(me: MeAPI, cars: OtherCarAPI[], filter?: (c: OtherCarAPI) => boolean): OtherCarAPI | null {
  let best: OtherCarAPI | null = null;
  let bestD = Infinity;
  for (const c of cars) {
    if (!c.alive) continue;
    if (filter && !filter(c)) continue;
    const d = me.distanceTo(c.x, c.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function steerToward(me: MeAPI, tx: number, ty: number): TendencyVector {
  const targetAngle = me.angleTo(tx, ty);
  let diff = targetAngle - me.angle;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return { steer: Math.max(-1, Math.min(1, diff * 3)), accel: 1 };
}

function steerAway(me: MeAPI, tx: number, ty: number): TendencyVector {
  const v = steerToward(me, tx, ty);
  return { steer: -v.steer, accel: 1 };
}

// ── The vocabulary ──

export const TENDENCY_DEFS: TendencyDef[] = [
  // ── Pursuit ──
  {
    name: 'ram_nearest',
    description: 'steer toward the nearest visible car and accelerate',
    available: (_me, world) => world.otherCars.some(c => c.alive),
    direction: (me, world) => {
      const t = nearestCar(me, world.otherCars);
      return t ? steerToward(me, t.x, t.y) : { steer: 0, accel: 0 };
    },
  },
  {
    name: 'ram_it_car',
    description: 'steer toward the car that is IT',
    available: (_me, world) => world.otherCars.some(c => c.alive && c.isIt),
    direction: (me, world) => {
      const t = nearestCar(me, world.otherCars, c => c.isIt);
      return t ? steerToward(me, t.x, t.y) : { steer: 0, accel: 0 };
    },
  },
  {
    name: 'ram_weakest',
    description: 'steer toward the car with the lowest HP',
    available: (_me, world) => world.otherCars.some(c => c.alive),
    direction: (me, world) => {
      const alive = world.otherCars.filter(c => c.alive);
      if (alive.length === 0) return { steer: 0, accel: 0 };
      const weakest = alive.reduce((a, b) => a.hp < b.hp ? a : b);
      return steerToward(me, weakest.x, weakest.y);
    },
  },

  // ── Evasion ──
  {
    name: 'flee_nearest',
    description: 'steer away from the nearest visible car',
    available: (_me, world) => world.otherCars.some(c => c.alive),
    direction: (me, world) => {
      const t = nearestCar(me, world.otherCars);
      return t ? steerAway(me, t.x, t.y) : { steer: 0, accel: 0 };
    },
  },
  {
    name: 'flee_it_car',
    description: 'steer away from the car that is IT',
    available: (_me, world) => world.otherCars.some(c => c.alive && c.isIt),
    direction: (me, world) => {
      const t = nearestCar(me, world.otherCars, c => c.isIt);
      return t ? steerAway(me, t.x, t.y) : { steer: 0, accel: 0 };
    },
  },

  // ── Positioning ──
  {
    name: 'circle_nearest',
    description: 'orbit around the nearest car at medium distance',
    available: (_me, world) => world.otherCars.some(c => c.alive),
    direction: (me, world) => {
      const t = nearestCar(me, world.otherCars);
      if (!t) return { steer: 0, accel: 0 };
      const angle = me.angleTo(t.x, t.y);
      const orbitAngle = angle + Math.PI / 2;
      let diff = orbitAngle - me.angle;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      return { steer: Math.max(-1, Math.min(1, diff * 2)), accel: 0.7 };
    },
  },
  {
    name: 'cruise_forward',
    description: 'drive straight ahead',
    available: () => true,
    direction: () => ({ steer: 0, accel: 1 }),
  },
  {
    name: 'steer_left',
    description: 'turn left',
    available: () => true,
    direction: () => ({ steer: -1, accel: 0.5 }),
  },
  {
    name: 'steer_right',
    description: 'turn right',
    available: () => true,
    direction: () => ({ steer: 1, accel: 0.5 }),
  },
  {
    name: 'brake',
    description: 'slow down',
    available: () => true,
    direction: () => ({ steer: 0, accel: -1 }),
  },
  {
    name: 'reverse',
    description: 'back up',
    available: () => true,
    direction: () => ({ steer: 0, accel: -0.8 }),
  },

  // ── IT-specific ──
  {
    name: 'hunt_non_immune',
    description: 'chase the nearest non-immune car to pass the IT tag',
    available: (me, world) => me.isIt && world.otherCars.some(c => c.alive && c.immuneTimer <= 0),
    direction: (me, world) => {
      const t = nearestCar(me, world.otherCars, c => c.immuneTimer <= 0);
      return t ? steerToward(me, t.x, t.y) : { steer: 0, accel: 0 };
    },
  },

  // ── Ally-relative ──
  {
    name: 'spread_out',
    description: 'move away from the nearest visible car to spread coverage',
    available: (_me, world) => world.otherCars.some(c => c.alive),
    direction: (me, world) => {
      const t = nearestCar(me, world.otherCars);
      return t ? steerAway(me, t.x, t.y) : { steer: 0, accel: 0 };
    },
  },
];

export const TENDENCY_NAMES: string[] = TENDENCY_DEFS.map(t => t.name);
export const TENDENCY_COUNT: number = TENDENCY_DEFS.length;

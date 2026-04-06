// ── Action Vocabulary for Derby Cars ──
// Each action maps to a specific driving behavior. The reflex layer scores
// all available actions and the highest-priority one fires.
//
// The actions here produce CONTROL INPUTS (steer, accel, brake, boost) on the
// `me` API — they don't bypass physics. They compose with whatever the soma's
// on_tick code is doing.
//
// Design intent: broad vocabulary, let training discover what's useful. Dead
// actions are diagnostic signal for the cognition layer (reflection).

import { MeAPI, WorldAPI, OtherCarAPI } from '../soma';

export interface DerbyAction {
  name: string;
  description: string;
  available: (me: MeAPI, world: WorldAPI) => boolean;
  execute: (me: MeAPI, world: WorldAPI) => void;
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

function steerToward(me: MeAPI, tx: number, ty: number): void {
  const targetAngle = me.angleTo(tx, ty);
  let diff = targetAngle - me.angle;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  me.steer(Math.max(-1, Math.min(1, diff * 3)));
  me.accelerate(1);
}

function steerAway(me: MeAPI, tx: number, ty: number): void {
  const awayAngle = me.angleTo(tx, ty) + Math.PI;
  let diff = awayAngle - me.angle;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  me.steer(Math.max(-1, Math.min(1, diff * 3)));
  me.accelerate(1);
}

// ── The action vocabulary ──

export const DERBY_ACTIONS: DerbyAction[] = [
  // ── Pursuit ──
  {
    name: 'ram_nearest',
    description: 'charge the nearest visible car at full speed',
    available: (_me, world) => world.otherCars.some(c => c.alive),
    execute: (me, world) => {
      const t = nearestCar(me, world.otherCars);
      if (t) { steerToward(me, t.x, t.y); }
    },
  },
  {
    name: 'ram_it_car',
    description: 'charge the car that is IT',
    available: (_me, world) => world.otherCars.some(c => c.alive && c.isIt),
    execute: (me, world) => {
      const t = nearestCar(me, world.otherCars, c => c.isIt);
      if (t) { steerToward(me, t.x, t.y); }
    },
  },
  {
    name: 'ram_weakest',
    description: 'charge the car with the lowest HP',
    available: (_me, world) => world.otherCars.some(c => c.alive),
    execute: (me, world) => {
      const alive = world.otherCars.filter(c => c.alive);
      if (alive.length === 0) return;
      const weakest = alive.reduce((a, b) => a.hp < b.hp ? a : b);
      steerToward(me, weakest.x, weakest.y);
    },
  },
  {
    name: 'boost_ram_nearest',
    description: 'boost and charge the nearest car',
    available: (me, world) => me.boostCooldownFrac >= 1 && world.otherCars.some(c => c.alive),
    execute: (me, world) => {
      const t = nearestCar(me, world.otherCars);
      if (t) { steerToward(me, t.x, t.y); me.boost(); }
    },
  },

  // ── Evasion ──
  {
    name: 'flee_nearest',
    description: 'drive away from the nearest visible car',
    available: (_me, world) => world.otherCars.some(c => c.alive),
    execute: (me, world) => {
      const t = nearestCar(me, world.otherCars);
      if (t) { steerAway(me, t.x, t.y); }
    },
  },
  {
    name: 'flee_it_car',
    description: 'drive away from the car that is IT',
    available: (_me, world) => world.otherCars.some(c => c.alive && c.isIt),
    execute: (me, world) => {
      const t = nearestCar(me, world.otherCars, c => c.isIt);
      if (t) { steerAway(me, t.x, t.y); }
    },
  },
  {
    name: 'boost_flee',
    description: 'boost and flee from the nearest car',
    available: (me, world) => me.boostCooldownFrac >= 1 && world.otherCars.some(c => c.alive),
    execute: (me, world) => {
      const t = nearestCar(me, world.otherCars);
      if (t) { steerAway(me, t.x, t.y); me.boost(); }
    },
  },

  // ── Positioning ──
  {
    name: 'circle_nearest',
    description: 'orbit around the nearest car at medium distance',
    available: (_me, world) => world.otherCars.some(c => c.alive),
    execute: (me, world) => {
      const t = nearestCar(me, world.otherCars);
      if (!t) return;
      const angle = me.angleTo(t.x, t.y);
      // Perpendicular offset for orbiting
      const orbitAngle = angle + Math.PI / 2;
      let diff = orbitAngle - me.angle;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      me.steer(Math.max(-1, Math.min(1, diff * 2)));
      me.accelerate(0.7);
    },
  },
  {
    name: 'cruise_forward',
    description: 'drive straight ahead at moderate speed',
    available: () => true,
    execute: (me) => {
      me.steer(0);
      me.accelerate(0.6);
    },
  },
  {
    name: 'hard_turn_left',
    description: 'sharp left turn',
    available: () => true,
    execute: (me) => {
      me.steer(-1);
      me.accelerate(0.5);
    },
  },
  {
    name: 'hard_turn_right',
    description: 'sharp right turn',
    available: () => true,
    execute: (me) => {
      me.steer(1);
      me.accelerate(0.5);
    },
  },
  {
    name: 'reverse',
    description: 'back up',
    available: () => true,
    execute: (me) => {
      me.steer(0);
      me.brake(1);
    },
  },
  {
    name: 'stop',
    description: 'full brake, hold position',
    available: () => true,
    execute: (me) => {
      me.brake(1);
    },
  },

  // ── IT-specific ──
  {
    name: 'hunt_non_immune',
    description: 'chase the nearest non-immune car to pass the IT tag',
    available: (me, world) => me.isIt && world.otherCars.some(c => c.alive && c.immuneTimer <= 0),
    execute: (me, world) => {
      const t = nearestCar(me, world.otherCars, c => c.immuneTimer <= 0);
      if (t) { steerToward(me, t.x, t.y); me.accelerate(1); }
    },
  },
  {
    name: 'boost_hunt',
    description: 'boost toward the nearest non-immune car',
    available: (me, world) => me.isIt && me.boostCooldownFrac >= 1 && world.otherCars.some(c => c.alive && c.immuneTimer <= 0),
    execute: (me, world) => {
      const t = nearestCar(me, world.otherCars, c => c.immuneTimer <= 0);
      if (t) { steerToward(me, t.x, t.y); me.boost(); }
    },
  },
];

export const DERBY_ACTION_NAMES: string[] = DERBY_ACTIONS.map(a => a.name);
export const DERBY_ACTION_COUNT: number = DERBY_ACTIONS.length;

// ── Soma ──
// Each AI car has a soma: identity, on_tick (code), memory.
// on_tick is compiled and run each frame with (me, world) APIs.
// Reflection edits the soma between rounds.

import { CarSoma } from './types.js';
import { Car } from './car.js';
import { Arena } from './arena.js';
import { CONFIG } from './config.js';

// ── Default Somas ──
// Each AI car gets a unique personality + driving style

export interface CarPersonality {
  name: string;
  identity: string;
  on_tick: string;
  color: 'blue' | 'green' | 'yellow' | 'police' | 'npc';
}

export const PERSONALITIES: CarPersonality[] = [
  {
    name: 'Viper',
    color: 'blue',
    identity: `I am Viper. I strike fast and vanish. When I'm it, I pick the nearest target and ram them at full speed. When I'm not it, I stay near the edges where I can see threats coming and dodge at the last second.`,
    on_tick: `
      const nearest = world.otherCars.reduce((best, c) => {
        if (!c.alive) return best;
        const d = me.distanceTo(c.x, c.y);
        return (!best || d < best.dist) ? { car: c, dist: d } : best;
      }, null);

      if (me.isIt && nearest) {
        const angle = me.angleTo(nearest.car.x, nearest.car.y);
        const diff = angle - me.angle;
        const norm = Math.atan2(Math.sin(diff), Math.cos(diff));
        me.steer(norm * 2);
        me.accelerate(1);
      } else if (!me.isIt) {
        // Find who is "it" and run away
        const itCar = world.otherCars.find(c => c.isIt && c.alive);
        if (itCar && me.distanceTo(itCar.x, itCar.y) < 200) {
          const awayAngle = me.angleTo(itCar.x, itCar.y) + Math.PI;
          const diff = awayAngle - me.angle;
          const norm = Math.atan2(Math.sin(diff), Math.cos(diff));
          me.steer(norm * 2);
          me.accelerate(1);
        } else {
          // Cruise around
          me.steer(Math.sin(world.time * 0.5) * 0.3);
          me.accelerate(0.6);
        }
      }
    `,
  },
  {
    name: 'Bruiser',
    color: 'green',
    identity: `I am Bruiser. Big hits, no finesse. I drive straight at my target and never let up. When running, I weave through obstacles to shake pursuers.`,
    on_tick: `
      if (me.isIt) {
        // Charge the closest car
        let closestDist = Infinity;
        let target = null;
        for (const c of world.otherCars) {
          if (!c.alive || c.immuneTimer > 0) continue;
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
        // Zigzag away from "it"
        const itCar = world.otherCars.find(c => c.isIt && c.alive);
        if (itCar) {
          const away = me.angleTo(itCar.x, itCar.y) + Math.PI;
          const diff = away - me.angle;
          me.steer(Math.atan2(Math.sin(diff), Math.cos(diff)) * 2 + Math.sin(world.time * 3) * 0.5);
          me.accelerate(0.9);
        } else {
          me.steer(Math.sin(world.time * 0.8) * 0.5);
          me.accelerate(0.5);
        }
      }
    `,
  },
  {
    name: 'Ghost',
    color: 'yellow',
    identity: `I am Ghost. I stay near the center of the arena where I have maximum escape routes. I drift smoothly and use obstacles as shields. When it, I'm patient — I herd targets into corners.`,
    on_tick: `
      const centerX = world.arenaWidth / 2;
      const centerY = world.arenaHeight / 2;

      if (me.isIt) {
        // Find nearest non-immune target
        let target = null;
        let minD = Infinity;
        for (const c of world.otherCars) {
          if (!c.alive || c.immuneTimer > 0) continue;
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
        // Orbit center, dodge "it"
        const itCar = world.otherCars.find(c => c.isIt && c.alive);
        const toCenter = me.angleTo(centerX, centerY);
        let targetAngle = toCenter;

        if (itCar && me.distanceTo(itCar.x, itCar.y) < 180) {
          const away = me.angleTo(itCar.x, itCar.y) + Math.PI;
          targetAngle = away;
        }

        const diff = targetAngle - me.angle;
        me.steer(Math.atan2(Math.sin(diff), Math.cos(diff)) * 2);
        me.accelerate(0.65);
      }
    `,
  },
  {
    name: 'Rattler',
    color: 'police',
    identity: `I am Rattler. I lurk near obstacles and use them to cut off escape routes. When it, I predict where my target is heading and cut them off rather than chasing directly.`,
    on_tick: `
      if (me.isIt) {
        // Intercept: aim ahead of target's path
        let target = null;
        let minD = Infinity;
        for (const c of world.otherCars) {
          if (!c.alive || c.immuneTimer > 0) continue;
          const d = me.distanceTo(c.x, c.y);
          if (d < minD) { minD = d; target = c; }
        }
        if (target) {
          // Lead the target — aim where they'll be
          const lead = Math.min(minD / 200, 1.5);
          const futureX = target.x + Math.cos(target.angle) * target.speed * lead;
          const futureY = target.y + Math.sin(target.angle) * target.speed * lead;
          const angle = me.angleTo(futureX, futureY);
          const diff = angle - me.angle;
          me.steer(Math.atan2(Math.sin(diff), Math.cos(diff)) * 2.5);
          me.accelerate(1);
        }
      } else {
        // Patrol edges, stay away from it
        const itCar = world.otherCars.find(c => c.isIt && c.alive);
        if (itCar && me.distanceTo(itCar.x, itCar.y) < 220) {
          const away = me.angleTo(itCar.x, itCar.y) + Math.PI;
          const diff = away - me.angle;
          me.steer(Math.atan2(Math.sin(diff), Math.cos(diff)) * 2.5);
          me.accelerate(1);
        } else {
          me.steer(Math.sin(world.time * 0.4 + 1.5) * 0.4);
          me.accelerate(0.55);
        }
      }
    `,
  },
  {
    name: 'Dust Devil',
    color: 'npc',
    identity: `I am Dust Devil. Chaotic and unpredictable. I change direction constantly to be hard to catch. When it, I pick random targets to keep everyone guessing.`,
    on_tick: `
      if (me.isIt) {
        // Pick a random alive target, switch every few seconds
        const alive = world.otherCars.filter(c => c.alive && c.immuneTimer <= 0);
        if (alive.length > 0) {
          const idx = Math.floor(world.time * 0.3) % alive.length;
          const target = alive[idx];
          const angle = me.angleTo(target.x, target.y);
          const diff = angle - me.angle;
          me.steer(Math.atan2(Math.sin(diff), Math.cos(diff)) * 2 + Math.sin(world.time * 5) * 0.3);
          me.accelerate(1);
        }
      } else {
        // Erratic movement
        const itCar = world.otherCars.find(c => c.isIt && c.alive);
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
    `,
  },
];

// ── Soma Storage ──

const STORAGE_KEY = 'tag-your-dead-somas';

export function saveSomas(somas: Map<string, CarSoma>): void {
  const obj: Record<string, CarSoma> = {};
  somas.forEach((soma, id) => { obj[id] = soma; });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

export function loadSomas(): Map<string, CarSoma> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return new Map();
  try {
    const obj = JSON.parse(raw) as Record<string, CarSoma>;
    const map = new Map<string, CarSoma>();
    for (const [id, soma] of Object.entries(obj)) {
      map.set(id, soma);
    }
    return map;
  } catch {
    return new Map();
  }
}

// ── on_tick Compilation + Execution ──

type OnTickFn = (me: MeAPI, world: WorldAPI) => void;

const compiledCache = new Map<string, OnTickFn>();

export function compileOnTick(code: string): OnTickFn {
  const cached = compiledCache.get(code);
  if (cached) return cached;

  try {
    const fn = new Function('me', 'world', code) as OnTickFn;
    compiledCache.set(code, fn);
    return fn;
  } catch (err) {
    console.warn('[SOMA] Failed to compile on_tick:', err);
    return () => {}; // no-op fallback
  }
}

// ── me / world APIs ──

export interface MeAPI {
  x: number;
  y: number;
  angle: number;
  speed: number;
  isIt: boolean;
  itTimer: number;
  immuneTimer: number;
  alive: boolean;
  steer(dir: number): void;
  accelerate(amount: number): void;
  brake(amount: number): void;
  distanceTo(x: number, y: number): number;
  angleTo(x: number, y: number): number;
  memory: { read(): string; write(s: string): void };
  identity: { read(): string };
  on_tick: { read(): string };
}

export interface OtherCarAPI {
  id: string;
  x: number;
  y: number;
  angle: number;
  speed: number;
  isIt: boolean;
  alive: boolean;
  immuneTimer: number;
}

export interface WorldAPI {
  time: number;
  arenaWidth: number;
  arenaHeight: number;
  otherCars: OtherCarAPI[];
  obstacles: { x: number; y: number; radius: number; type: string }[];
}

export function buildMeAPI(car: Car, soma: CarSoma): MeAPI {
  return {
    get x() { return car.x; },
    get y() { return car.y; },
    get angle() { return car.angle; },
    get speed() { return car.speed; },
    get isIt() { return car.isIt; },
    get itTimer() { return car.itTimer; },
    get immuneTimer() { return car.immuneTimer; },
    get alive() { return car.alive; },
    steer(dir: number) { car.steer(dir); },
    accelerate(amt: number) { car.accelerate(amt); },
    brake(amt: number) { car.brake(amt); },
    distanceTo(x: number, y: number) {
      const dx = car.x - x;
      const dy = car.y - y;
      return Math.sqrt(dx * dx + dy * dy);
    },
    angleTo(x: number, y: number) {
      return Math.atan2(y - car.y, x - car.x);
    },
    memory: {
      read() { return soma.memory.content; },
      write(s: string) { soma.memory.content = s; },
    },
    identity: {
      read() { return soma.identity.content; },
    },
    on_tick: {
      read() { return soma.on_tick.content; },
    },
  };
}

export function buildWorldAPI(
  time: number,
  arena: Arena,
  allCars: Car[],
  selfId: string,
): WorldAPI {
  return {
    time,
    arenaWidth: arena.width,
    arenaHeight: arena.height,
    otherCars: allCars
      .filter(c => c.id !== selfId)
      .map(c => ({
        id: c.id,
        x: c.x,
        y: c.y,
        angle: c.angle,
        speed: c.speed,
        isIt: c.isIt,
        alive: c.alive,
        immuneTimer: c.immuneTimer,
      })),
    obstacles: arena.obstacles.map(o => ({
      x: o.x,
      y: o.y,
      radius: o.radius,
      type: o.type,
    })),
  };
}

export function runOnTick(car: Car, soma: CarSoma, time: number, arena: Arena, allCars: Car[]): void {
  const fn = compileOnTick(soma.on_tick.content);
  const me = buildMeAPI(car, soma);
  const world = buildWorldAPI(time, arena, allCars, car.id);

  try {
    fn(me, world);
  } catch (err) {
    console.warn(`[SOMA] on_tick error for ${car.id}:`, err);
  }
}

export function createSoma(personality: CarPersonality): CarSoma {
  return {
    identity: { content: personality.identity },
    on_tick: { content: personality.on_tick.trim() },
    memory: { content: '' },
  };
}

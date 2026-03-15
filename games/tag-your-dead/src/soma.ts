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
    identity: `I am Viper. I strike fast and vanish. When I'm it, I'm a wrecking ball — 3x damage means I can destroy cars fast. When not it, I ram weakened targets to finish them off, but dodge the "it" car. Low HP? Play cautious.`,
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
    `,
  },
  {
    name: 'Bruiser',
    color: 'green',
    identity: `I am Bruiser. Big hits, no finesse. I charge straight at targets to deal maximum damage. When I'm it, I'm devastating — 3x damage with full-speed rams. I never back down.`,
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
    `,
  },
  {
    name: 'Ghost',
    color: 'yellow',
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
    `,
  },
  {
    name: 'Rattler',
    color: 'police',
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
    `,
  },
  {
    name: 'Dust Devil',
    color: 'npc',
    identity: `I am Dust Devil. Chaotic and unpredictable. I change direction constantly to be hard to catch and hard to predict. When it, I pick random targets and slam them with 3x damage. Chaos is my advantage.`,
    on_tick: `
      const alive = world.otherCars.filter(c => c.alive);
      const itCar = alive.find(c => c.isIt);

      if (me.isIt) {
        // Random target, switch every few seconds — chaos with 3x damage
        const targets = alive.filter(c => c.immuneTimer <= 0);
        if (targets.length > 0) {
          const idx = Math.floor(world.time * 0.3) % targets.length;
          const target = targets[idx];
          const angle = me.angleTo(target.x, target.y);
          const diff = angle - me.angle;
          me.steer(Math.atan2(Math.sin(diff), Math.cos(diff)) * 2 + Math.sin(world.time * 5) * 0.3);
          me.accelerate(1);
          // Chaotic boost — whenever it's ready, use it
          me.boost();
        }
      } else {
        // Erratic — dodge "it", crash into everyone else
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
  hp: number;
  maxHp: number;
  maxSpeed: number;
  score: number;
  isIt: boolean;
  itTimer: number;
  immuneTimer: number;
  alive: boolean;
  steer(dir: number): void;
  accelerate(amount: number): void;
  brake(amount: number): void;
  boost(): void;
  isBoosting: boolean;
  boostCooldownFrac: number;
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
  hp: number;
  score: number;
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

export function buildMeAPI(car: Car, soma: CarSoma, arena: Arena): MeAPI {
  return {
    get x() { return car.x; },
    get y() { return car.y; },
    get angle() { return car.angle; },
    get speed() { return car.speed; },
    get hp() { return car.hp; },
    get maxHp() { return car.maxHp; },
    get maxSpeed() { return car.maxSpeed; },
    get score() { return Math.floor(car.score); },
    get isIt() { return car.isIt; },
    get itTimer() { return car.itTimer; },
    get immuneTimer() { return car.immuneTimer; },
    get alive() { return car.alive; },
    steer(dir: number) { car.steer(dir); },
    accelerate(amt: number) { car.accelerate(amt); },
    brake(amt: number) { car.brake(amt); },
    boost() { car.boost(); },
    get isBoosting() { return car.isBoosting; },
    get boostCooldownFrac() { return car.boostCooldownFrac; },
    distanceTo(x: number, y: number) {
      const dx = arena.wrapDx(car.x - x);
      const dy = arena.wrapDy(car.y - y);
      return Math.sqrt(dx * dx + dy * dy);
    },
    angleTo(x: number, y: number) {
      const dx = arena.wrapDx(x - car.x);
      const dy = arena.wrapDy(y - car.y);
      return Math.atan2(dy, dx);
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
        hp: c.hp,
        score: Math.floor(c.score),
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
  const me = buildMeAPI(car, soma, arena);
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

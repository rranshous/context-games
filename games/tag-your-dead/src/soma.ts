// ── Soma ──
// Each AI car has a soma: identity, on_tick (code), memory.
// on_tick is compiled and run each frame with (me, world) APIs.
// Reflection edits the soma between rounds.

import { CarSoma } from './types.js';
import { Car } from './car.js';
import { Arena } from './arena.js';
import { CONFIG } from './config.js';
import { TendencyAccumulator } from './reflex/tendency-system.js';
import { TENDENCY_NAMES } from './reflex/actions.js';

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
      if (me.isIt) {
        me.hunt_non_immune(0.9);
        me.ram_weakest(0.5);
      } else {
        me.flee_it_car(0.6);
        me.ram_weakest(0.7);
        if (me.hp < 40) {
          me.flee_nearest(0.4);
          me.cruise_forward(0.3);
        }
      }
    `,
  },
  {
    name: 'Bruiser',
    color: 'green',
    identity: `I am Bruiser. Big hits, no finesse. I charge straight at targets to deal maximum damage. When I'm it, I'm devastating — 3x damage with full-speed rams. I never back down.`,
    on_tick: `
      if (me.isIt) {
        me.ram_nearest(0.9);
      } else {
        me.flee_it_car(0.4);
        me.ram_nearest(0.8);
        me.ram_weakest(0.6);
      }
    `,
  },
  {
    name: 'Ghost',
    color: 'yellow',
    identity: `I am Ghost. Patient and evasive. I avoid damage and only engage when I have the advantage. When it, I hunt carefully. When not, I keep my distance and pick my moments.`,
    on_tick: `
      if (me.isIt) {
        me.hunt_non_immune(0.8);
        me.ram_nearest(0.4);
      } else {
        me.flee_it_car(0.7);
        me.flee_nearest(0.3);
        me.circle_nearest(0.4);
        if (me.hp < 30) {
          me.flee_nearest(0.6);
          me.brake(0.2);
        }
      }
    `,
  },
  {
    name: 'Rattler',
    color: 'police',
    identity: `I am Rattler. I intercept and strike. When it, I hunt aggressively to pass the tag. When not it, I lurk and strike low-HP cars opportunistically.`,
    on_tick: `
      if (me.isIt) {
        me.hunt_non_immune(0.9);
        me.ram_weakest(0.6);
      } else {
        me.flee_it_car(0.5);
        me.ram_weakest(0.8);
        me.cruise_forward(0.3);
      }
    `,
  },
  {
    name: 'Dust Devil',
    color: 'npc',
    identity: `I am Dust Devil. Chaotic and unpredictable. I change direction constantly. When it, I ram everyone. Chaos is my advantage.`,
    on_tick: `
      if (me.isIt) {
        me.ram_nearest(0.7);
        me.hunt_non_immune(0.5);
        me.steer_left(0.2);
      } else {
        me.flee_it_car(0.3);
        me.ram_nearest(0.4);
        me.steer_right(0.3);
        me.cruise_forward(0.3);
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

export function buildMeAPI(car: Car, soma: CarSoma, arena: Arena, tendencyAccumulator?: TendencyAccumulator): MeAPI {
  const me: MeAPI = {
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
    // Legacy direct controls — kept for backward compat if Claude
    // generates them during reflection, but on_tick should prefer
    // the vocabulary methods (me.ram_nearest(0.8) etc.)
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
  } as MeAPI;

  // ── Tendency vocabulary methods ──
  // Each action in the vocabulary gets a method on `me`. Calling
  // me.ram_nearest(0.8) registers a tendency with magnitude 0.8 in
  // the accumulator. The magnitude is ordinal (0..1); the chassis
  // softmax-composes all tendencies after on_tick returns.
  if (tendencyAccumulator) {
    for (const name of TENDENCY_NAMES) {
      (me as any)[name] = (magnitude: number) => {
        tendencyAccumulator.setOnTick(name, magnitude);
      };
    }
  }

  return me;
}


export function buildWorldAPI(
  time: number,
  arena: Arena,
  allCars: Car[],
  selfId: string,
): WorldAPI {
  const self = allCars.find(c => c.id === selfId);
  return {
    time,
    arenaWidth: arena.width,
    arenaHeight: arena.height,
    otherCars: allCars
      .filter(c => c.id !== selfId)
      .filter(c => !self || !c.alive || arena.hasLineOfSight(self.x, self.y, c.x, c.y))
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

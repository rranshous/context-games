import { DriverSoma, Position } from './types';
import { DesertWorld } from './desert-world';
import { Vehicle } from './vehicle';

// Default on_tick — basic "drive toward objective using vague direction"
export const DEFAULT_ON_TICK = `async function onTick(me, world) {
  // I only know the general direction and distance — no GPS
  const obj = world.objective;
  if (!obj) return;

  // Convert compass direction to target angle
  const dirAngles = {
    east: 0, southeast: Math.PI/4, south: Math.PI/2, southwest: 3*Math.PI/4,
    west: Math.PI, northwest: -3*Math.PI/4, north: -Math.PI/2, northeast: -Math.PI/4
  };
  const targetAngle = dirAngles[obj.direction] || 0;
  const angleDiff = targetAngle - me.angle;
  const normalized = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));

  // Steer toward the general direction
  if (Math.abs(normalized) > 0.15) {
    me.steer(normalized > 0 ? 1 : -1);
  }

  // Accelerate — slow down when close
  if (obj.distance === 'right here' || obj.distance === 'very close') {
    me.accelerate(0.4);
  } else {
    me.accelerate(0.8);
  }
}`;

export const DEFAULT_IDENTITY = `I am a wheelman. A driver for hire in the desert. The boss watches me through a drone and talks to me on the radio. I need to prove I'm worth keeping — they're working on getting the drone to drive itself. Every run matters. I listen to the boss, I learn the terrain, I get better.`;

export function createDefaultSoma(): DriverSoma {
  return {
    identity: DEFAULT_IDENTITY,
    on_tick: DEFAULT_ON_TICK,
    memory: '',
    boss_radio: '',
    runHistory: [],
  };
}

// Compile on_tick code into an executable function
// Returns async function(me, world) or null if compilation fails
let _cachedCode: string = '';
let _cachedFn: ((me: any, world: any) => Promise<void>) | null = null;

export function compileOnTick(code: string): ((me: any, world: any) => Promise<void>) | null {
  if (code === _cachedCode && _cachedFn) return _cachedFn;

  try {
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const fn = new AsyncFunction('me', 'world', `${code}\nreturn onTick(me, world);`);
    _cachedCode = code;
    _cachedFn = fn;
    return fn;
  } catch (err) {
    console.error('[SOMA] Compilation error:', err);
    return null;
  }
}

export function clearCompileCache(): void {
  _cachedCode = '';
  _cachedFn = null;
}

// Build the `me` API object for the driver's on_tick
export function buildMeAPI(vehicle: Vehicle, soma: DriverSoma): any {
  return {
    position: { x: vehicle.x, y: vehicle.y },
    speed: vehicle.speed,
    angle: vehicle.angle,

    steer: (dir: number) => vehicle.steer(dir),
    accelerate: (amount: number) => vehicle.accelerate(amount),
    brake: (amount: number) => vehicle.brake(amount),

    memory: {
      read: () => soma.memory,
      write: (text: string) => { soma.memory = text; },
    },
    identity: {
      read: () => soma.identity,
    },
    on_tick: {
      read: () => soma.on_tick,
    },
  };
}

// ── Vague direction helpers ──
// Driver gets a compass bearing and rough distance, not GPS coordinates.

function getCompassDirection(angleRad: number): string {
  // Normalize to 0-2PI
  const a = ((angleRad % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const deg = a * 180 / Math.PI;
  if (deg < 22.5 || deg >= 337.5) return 'east';
  if (deg < 67.5) return 'southeast';
  if (deg < 112.5) return 'south';
  if (deg < 157.5) return 'southwest';
  if (deg < 202.5) return 'west';
  if (deg < 247.5) return 'northwest';
  if (deg < 292.5) return 'north';
  return 'northeast';
}

function getDistanceCategory(dist: number): string {
  if (dist < 200) return 'right here';
  if (dist < 600) return 'very close';
  if (dist < 1500) return 'close';
  if (dist < 3000) return 'medium';
  return 'far';
}

// Build the `world` API object
export function buildWorldAPI(
  world: DesertWorld,
  vehicle: Vehicle,
  radioTranscript: string,
  objective: { position: Position; type: string } | null,
  pursuers: Array<{ position: Position; speed: number; angle: number }>,
): any {
  // Build vague objective info — no exact position
  let vagueObjective: any = null;
  if (objective) {
    const dx = objective.position.x - vehicle.x;
    const dy = objective.position.y - vehicle.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    vagueObjective = {
      direction: getCompassDirection(angle),
      distance: getDistanceCategory(dist),
      type: objective.type,
    };
  }

  return {
    radio: radioTranscript,

    objective: vagueObjective,

    pursuers: pursuers,

    terrain: (x: number, y: number) => world.getTerrainEffect(x, y),

    distanceTo: (pos: Position) => {
      const dx = pos.x - vehicle.x;
      const dy = pos.y - vehicle.y;
      return Math.sqrt(dx * dx + dy * dy);
    },

    angleTo: (pos: Position) => {
      return Math.atan2(pos.y - vehicle.y, pos.x - vehicle.x);
    },

    mapBounds: { width: world.width, height: world.height },

    sensorRange: 300,
  };
}

// Execute one tick of the driver's on_tick code
export async function executeTick(
  soma: DriverSoma,
  vehicle: Vehicle,
  world: DesertWorld,
  radioTranscript: string,
  objective: { position: Position; type: string } | null,
  pursuers: Array<{ position: Position; speed: number; angle: number }>,
): Promise<void> {
  const fn = compileOnTick(soma.on_tick);
  if (!fn) return;

  const me = buildMeAPI(vehicle, soma);
  const worldAPI = buildWorldAPI(world, vehicle, radioTranscript, objective, pursuers);

  try {
    // 16ms timeout to not block the frame
    await Promise.race([
      fn(me, worldAPI),
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error('on_tick timeout')), 16)),
    ]);
  } catch (err) {
    // Silently fail — driver's code is broken, they'll figure it out
    console.warn('[SOMA] on_tick error:', err);
  }
}

// Persistence
const STORAGE_KEY = 'wheelman-soma';

export function saveSoma(soma: DriverSoma): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(soma));
}

export function loadSoma(): DriverSoma | null {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data) as DriverSoma;
  } catch {
    return null;
  }
}

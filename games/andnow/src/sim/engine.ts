// Engines: ways of running a World's ticks. Every engine must give the same world, bit for
// bit, as the serial one (World.tick); `node dist/twin.mjs` runs two side by side and stops
// at the first tick they differ. The rules live in World; an engine only decides how the
// work of a tick gets done (in order on one thread, or spread out).
import { World } from './world';

export interface Engine {
  readonly name: string;
  readonly world: World;
  /** One tick. (Async: an engine may wait on other threads or machines.) */
  tick(): void | Promise<void>;
  /** Make `world` whole (an engine may keep parts of it elsewhere between ticks). */
  sync?(): Promise<void>;
  close?(): void;
}

/** The reference: World.tick, one body after another. */
export class SerialEngine implements Engine {
  readonly name = 'serial';
  constructor(readonly world: World) {}
  tick() { this.world.tick(); }
}

/** Engines by name. The parallel one (src/par.ts, Node only) adds itself as 'par' when imported. */
export const ENGINES: Record<string, (w: World) => Engine> = {
  serial: (w) => new SerialEngine(w),
};

export function makeEngine(name: string, world: World): Engine {
  const make = ENGINES[name];
  if (!make) throw new Error(`unknown engine "${name}" (have: ${Object.keys(ENGINES).join(', ')})`);
  return make(world);
}

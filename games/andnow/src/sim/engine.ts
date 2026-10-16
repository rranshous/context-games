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
  close?(): void;
}

/** The reference: World.tick, one body after another. */
export class SerialEngine implements Engine {
  readonly name = 'serial';
  constructor(readonly world: World) {}
  tick() { this.world.tick(); }
}

/**
 * The experimental engine (docs/journal.md, "scaling one sim out"): runs a tick's phases
 * itself, so its turns can be scheduled by footprint instead of strictly in order.
 * For now it runs them in order: the seam, proven identical before anything moves.
 */
export class ParallelEngine implements Engine {
  readonly name = 'par';
  constructor(readonly world: World) {}
  tick() {
    const w = this.world;
    if (!w.beginTick()) return;
    w.regrow();
    w.drift();
    w.runTurns(w.turnOrder());
    for (const wr of w.living().slice()) if (wr.alive) w.upkeep(wr);
    w.checkOver();
  }
}

export const ENGINES: Record<string, (w: World) => Engine> = {
  serial: (w) => new SerialEngine(w),
  par: (w) => new ParallelEngine(w),
};

export function makeEngine(name: string, world: World): Engine {
  const make = ENGINES[name];
  if (!make) throw new Error(`unknown engine "${name}" (have: ${Object.keys(ENGINES).join(', ')})`);
  return make(world);
}

// Instinct Executor — compile on_tick code strings into executable functions,
// execute with timeout protection, cache for performance.

import { PredatorSoma } from './soma.js';
import { TickAPI, WorldData } from './instinct-api.js';

const TICK_TIMEOUT_MS = 50;

interface CompiledTick {
  predatorId: string;
  fn: (me: TickAPI, world: WorldData) => Promise<void>;
}

// Cache: predatorId -> { code, compiled }
const tickCache = new Map<string, { code: string; compiled: CompiledTick }>();

/**
 * Compile a predator soma's on_tick code into an executable function.
 * Returns null if compilation fails. Caches by predatorId + code.
 */
export function compileInstinct(soma: PredatorSoma): CompiledTick | null {
  const cached = tickCache.get(soma.id);
  if (cached && cached.code === soma.on_tick) {
    return cached.compiled;
  }

  try {
    const wrappedCode = `
      ${soma.on_tick}
      return on_tick(me, world);
    `;

    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const fn = new AsyncFunction('me', 'world', wrappedCode) as
      (me: TickAPI, world: WorldData) => Promise<void>;

    const compiled: CompiledTick = { predatorId: soma.id, fn };
    tickCache.set(soma.id, { code: soma.on_tick, compiled });
    return compiled;
  } catch (err) {
    console.log(`[GLINT] on_tick compile error for ${soma.id}: ${err}`);
    return null;
  }
}

/**
 * Execute a compiled on_tick with timeout protection.
 * The on_tick's side effects are captured via the API's pending action list.
 */
export async function executeTick(
  compiled: CompiledTick,
  api: TickAPI,
  world: WorldData,
): Promise<void> {
  try {
    const result = await Promise.race([
      compiled.fn(api, world),
      new Promise<'timeout'>(resolve =>
        setTimeout(() => resolve('timeout'), TICK_TIMEOUT_MS)
      ),
    ]);

    if (result === 'timeout') {
      console.log(`[GLINT] on_tick timeout for ${compiled.predatorId}`);
    }
  } catch (err) {
    console.log(`[GLINT] on_tick runtime error for ${compiled.predatorId}: ${err}`);
  }
}

/** Clear the tick cache (e.g., after reflection updates code) */
export function clearInstinctCache(): void {
  tickCache.clear();
}

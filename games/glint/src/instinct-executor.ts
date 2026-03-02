// Instinct Executor — compile instinct code strings into executable functions,
// execute with timeout protection, cache for performance.
// Parallels hot-pursuit's handler-executor.ts.

import { PredatorSoma } from './soma.js';
import { InstinctAPI, StimulusData } from './instinct-api.js';

const INSTINCT_TIMEOUT_MS = 50;

interface CompiledInstinct {
  predatorId: string;
  fn: (type: string, data: StimulusData, me: InstinctAPI) => Promise<void>;
}

// Cache: predatorId -> { code, compiled }
const instinctCache = new Map<string, { code: string; instinct: CompiledInstinct }>();

/**
 * Compile a predator soma's instinct code into an executable function.
 * Returns null if compilation fails. Caches by predatorId + code.
 */
export function compileInstinct(soma: PredatorSoma): CompiledInstinct | null {
  const cached = instinctCache.get(soma.id);
  if (cached && cached.code === soma.instinctCode) {
    return cached.instinct;
  }

  try {
    const wrappedCode = `
      ${soma.instinctCode}
      return onStimulus(type, data, me);
    `;

    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const fn = new AsyncFunction('type', 'data', 'me', wrappedCode) as
      (type: string, data: StimulusData, me: InstinctAPI) => Promise<void>;

    const instinct: CompiledInstinct = { predatorId: soma.id, fn };
    instinctCache.set(soma.id, { code: soma.instinctCode, instinct });
    return instinct;
  } catch (err) {
    console.log(`[GLINT] Instinct compile error for ${soma.id}: ${err}`);
    return null;
  }
}

/**
 * Execute a compiled instinct with timeout protection.
 * The instinct's side effects are captured via the API's pending action list.
 */
export async function executeStimulus(
  instinct: CompiledInstinct,
  stimulusType: string,
  stimulusData: StimulusData,
  api: InstinctAPI,
): Promise<void> {
  try {
    const result = await Promise.race([
      instinct.fn(stimulusType, stimulusData, api),
      new Promise<'timeout'>(resolve =>
        setTimeout(() => resolve('timeout'), INSTINCT_TIMEOUT_MS)
      ),
    ]);

    if (result === 'timeout') {
      console.log(`[GLINT] Instinct timeout for ${instinct.predatorId} on ${stimulusType}`);
    }
  } catch (err) {
    console.log(`[GLINT] Instinct runtime error for ${instinct.predatorId}: ${err}`);
  }
}

/** Clear the instinct cache (e.g., after reflection updates code) */
export function clearInstinctCache(): void {
  instinctCache.clear();
}

// Persistence — save/load predator somas to localStorage, keyed by map seed.
// Same map seed = same predators evolve across sessions.

import { PredatorSoma } from './soma.js';
import { Predator } from './predator.js';

const STORAGE_KEY_PREFIX = 'glint-predators-';

export function savePredatorSomas(predators: Predator[], mapSeed: number): void {
  const key = `${STORAGE_KEY_PREFIX}${mapSeed}`;
  const data = predators.map(p => p.predatorSoma);
  try {
    localStorage.setItem(key, JSON.stringify(data));
    console.log(`[GLINT] Saved ${data.length} predator somas for seed ${mapSeed}`);
  } catch (err) {
    console.log(`[GLINT] Save error: ${err}`);
  }
}

export function loadPredatorSomas(mapSeed: number): PredatorSoma[] | null {
  const key = `${STORAGE_KEY_PREFIX}${mapSeed}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PredatorSoma[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Reset session-relative timers — gameTime starts at 0 on each page load
      for (const soma of parsed) {
        soma.lastReflectionTime = 0;
        soma.reflectionPending = false;
      }
      console.log(`[GLINT] Loaded ${parsed.length} predator somas for seed ${mapSeed}`);
      return parsed;
    }
  } catch (err) {
    console.log(`[GLINT] Load error: ${err}`);
  }
  return null;
}

export function resetPredatorSomas(mapSeed: number): void {
  localStorage.removeItem(`${STORAGE_KEY_PREFIX}${mapSeed}`);
  console.log(`[GLINT] Reset predator somas for seed ${mapSeed}`);
}

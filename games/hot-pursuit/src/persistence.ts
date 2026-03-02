// ── Soma Persistence ──
// Save/load actant somas to localStorage. In Phase 3, somas will be
// modified by the reflection loop and persisted between sessions.

import { Soma, createDefaultSoma, ChaseHistoryEntry } from './soma';
import { PlayerProgress } from './types';

const STORAGE_KEY = 'hot-pursuit-somas';
const PROGRESS_KEY = 'hot-pursuit-progress';

/** Save all somas to localStorage */
export function saveSomas(somas: Soma[]): void {
  try {
    const data = JSON.stringify(somas);
    localStorage.setItem(STORAGE_KEY, data);
    console.log(JSON.stringify({
      _hp: 'somas_saved',
      count: somas.length,
      ids: somas.map(s => s.id),
    }));
  } catch (err) {
    console.log(JSON.stringify({
      _hp: 'somas_save_error',
      error: String(err),
    }));
  }
}

/** Load somas from localStorage. Returns defaults if none found. */
export function loadSomas(count: number): Soma[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data) as Soma[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(JSON.stringify({
          _hp: 'somas_loaded',
          count: parsed.length,
          ids: parsed.map(s => s.id),
          chaseHistoryLengths: parsed.map(s => ({
            id: s.id,
            chases: s.chaseHistory.length,
          })),
        }));
        // If we need more officers than we have saved, create extras
        while (parsed.length < count) {
          parsed.push(createDefaultSoma(parsed.length));
        }
        return parsed.slice(0, count);
      }
    }
  } catch (err) {
    console.log(JSON.stringify({
      _hp: 'somas_load_error',
      error: String(err),
    }));
  }

  // No saved somas — create defaults
  const defaults = Array.from({ length: count }, (_, i) => createDefaultSoma(i));
  console.log(JSON.stringify({
    _hp: 'somas_created_default',
    count: defaults.length,
    ids: defaults.map(s => s.id),
  }));
  return defaults;
}

/** Update a soma's chase history after a chase */
export function recordChaseInSoma(
  soma: Soma,
  entry: ChaseHistoryEntry,
): void {
  soma.chaseHistory.push(entry);
  console.log(JSON.stringify({
    _hp: 'soma_chase_recorded',
    actantId: soma.id,
    runId: entry.runId,
    outcome: entry.outcome,
    totalChases: soma.chaseHistory.length,
  }));
}

/** Reset all somas and progress (for testing) */
export function resetSomas(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PROGRESS_KEY);
  console.log(JSON.stringify({
    _hp: 'somas_reset',
  }));
}

// ── Player Progress ──

export function loadProgress(): PlayerProgress {
  try {
    const data = localStorage.getItem(PROGRESS_KEY);
    if (data) {
      const parsed = JSON.parse(data) as PlayerProgress;
      if (typeof parsed.totalEscapes === 'number' && typeof parsed.currentPrecinct === 'number') {
        console.log(JSON.stringify({ _hp: 'progress_loaded', ...parsed }));
        return parsed;
      }
    }
  } catch (err) {
    console.log(JSON.stringify({ _hp: 'progress_load_error', error: String(err) }));
  }
  return { totalEscapes: 0, currentPrecinct: 1 };
}

export function saveProgress(progress: PlayerProgress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch (err) {
    console.log(JSON.stringify({ _hp: 'progress_save_error', error: String(err) }));
  }
}

export function resetProgress(): void {
  localStorage.removeItem(PROGRESS_KEY);
  console.log(JSON.stringify({ _hp: 'progress_reset' }));
}

/** Export somas as a JSON string (for copy-paste debugging) */
export function exportSomas(somas: Soma[]): string {
  return JSON.stringify({
    _hp: 'soma_export',
    timestamp: new Date().toISOString(),
    somas: somas.map(s => ({
      ...s,
      // Truncate handler code in export for readability
      signalHandlers: s.signalHandlers.trim().slice(0, 500) + (s.signalHandlers.length > 500 ? '...' : ''),
    })),
  }, null, 2);
}

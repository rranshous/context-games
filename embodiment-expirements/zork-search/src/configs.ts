/**
 * Experiment config generation.
 *
 * Dimensions:
 *   memory:     blob | structured | auto_curated | mounted
 *   history:    rolling | summarized | full | none
 *   action:     free_text | tool | structured
 *   reflection: every_step | periodic | event_driven | actant_controlled
 *   selfMod:    none | memory_only | memory_tools | full_soma
 */

import type { ExperimentConfig, MemoryArch, HistoryHandling, ActionInterface, ReflectionPattern, SelfModScope } from './types.js';

const MEMORY_LEVELS: MemoryArch[] = ['blob', 'structured', 'auto_curated', 'mounted', 'hybrid'];
const HISTORY_LEVELS: HistoryHandling[] = ['rolling', 'summarized', 'full', 'none'];
const ACTION_LEVELS: ActionInterface[] = ['free_text', 'tool', 'structured'];
const REFLECTION_LEVELS: ReflectionPattern[] = ['every_step', 'periodic', 'event_driven', 'actant_controlled'];
const SELFMOD_LEVELS: SelfModScope[] = ['none', 'memory_only', 'memory_tools', 'full_soma'];

function makeId(c: Omit<ExperimentConfig, 'id'>): string {
  const modelShort = c.model.split('/').pop()?.replace(/[^a-z0-9]/gi, '') ?? 'unknown';
  return `${c.memory}_${c.history}_${c.action}_${c.reflection}_${c.selfMod}_${modelShort}`;
}

/** Generate all possible configs for a given model. */
export function generateAllConfigs(model: string, defaults?: Partial<ExperimentConfig>): ExperimentConfig[] {
  const configs: ExperimentConfig[] = [];
  for (const memory of MEMORY_LEVELS) {
    for (const history of HISTORY_LEVELS) {
      for (const action of ACTION_LEVELS) {
        for (const reflection of REFLECTION_LEVELS) {
          for (const selfMod of SELFMOD_LEVELS) {
            const base = {
              memory, history, action, reflection, selfMod, model,
              maxSteps: defaults?.maxSteps ?? 50,
              maxWakeups: defaults?.maxWakeups ?? 50,
              historyWindow: defaults?.historyWindow ?? 20,
              periodicInterval: defaults?.periodicInterval ?? 5,
              thinkingBudget: defaults?.thinkingBudget ?? 2048,
            };
            configs.push({ ...base, id: makeId(base) });
          }
        }
      }
    }
  }
  return configs;
}

/** Generate a curated set of configs for smart screening. */
export function generateScreeningConfigs(model: string): ExperimentConfig[] {
  // Instead of all 960 combos, test each dimension level against a
  // strong baseline. This gives us ~20 configs that isolate the
  // contribution of each dimension.

  const baseline: Omit<ExperimentConfig, 'id'> = {
    memory: 'mounted',
    history: 'rolling',
    action: 'tool',
    reflection: 'event_driven',
    selfMod: 'memory_tools',
    model,
    maxSteps: 30,
    maxWakeups: 30,
    historyWindow: 20,
    periodicInterval: 5,
    thinkingBudget: 2048,
  };

  const configs: ExperimentConfig[] = [];

  // The baseline itself
  configs.push({ ...baseline, id: makeId(baseline) });

  // Vary memory (3 alternatives)
  for (const memory of MEMORY_LEVELS) {
    if (memory === baseline.memory) continue;
    const c = { ...baseline, memory };
    configs.push({ ...c, id: makeId(c) });
  }

  // Vary history (3 alternatives)
  for (const history of HISTORY_LEVELS) {
    if (history === baseline.history) continue;
    const c = { ...baseline, history };
    configs.push({ ...c, id: makeId(c) });
  }

  // Vary action (2 alternatives)
  for (const action of ACTION_LEVELS) {
    if (action === baseline.action) continue;
    const c = { ...baseline, action };
    configs.push({ ...c, id: makeId(c) });
  }

  // Vary reflection (3 alternatives)
  for (const reflection of REFLECTION_LEVELS) {
    if (reflection === baseline.reflection) continue;
    const c = { ...baseline, reflection };
    configs.push({ ...c, id: makeId(c) });
  }

  // Vary selfMod (3 alternatives)
  for (const selfMod of SELFMOD_LEVELS) {
    if (selfMod === baseline.selfMod) continue;
    const c = { ...baseline, selfMod };
    configs.push({ ...c, id: makeId(c) });
  }

  // A few interesting combos (hunches from prior art)
  const combos: Array<Partial<ExperimentConfig>> = [
    // Habitat pattern: mounted + every_step + full_soma
    { memory: 'mounted', reflection: 'every_step', selfMod: 'full_soma' },
    // Bloom pattern: structured + event_driven + memory_tools
    { memory: 'structured', reflection: 'event_driven', selfMod: 'memory_tools', action: 'tool' },
    // Minimal: blob + rolling + free_text + none (bare bones)
    { memory: 'blob', history: 'rolling', action: 'free_text', selfMod: 'none', reflection: 'every_step' },
    // Hot pursuit pattern: structured + event_driven + full_soma + summarized history
    { memory: 'structured', history: 'summarized', reflection: 'event_driven', selfMod: 'full_soma' },
    // Mount-heavy: mounted + none history (rely on mounts)
    { memory: 'mounted', history: 'none', action: 'tool', selfMod: 'memory_tools' },
    // Auto-curated + summarized (chassis does the work)
    { memory: 'auto_curated', history: 'summarized', action: 'tool', selfMod: 'memory_only' },
  ];

  for (const combo of combos) {
    const c = { ...baseline, ...combo };
    const id = makeId(c);
    if (!configs.some(x => x.id === id)) {
      configs.push({ ...c, id });
    }
  }

  return configs;
}

/** Generate Phase 2 ablation configs around a winning config. */
export function generateAblationConfigs(winner: ExperimentConfig, model: string): ExperimentConfig[] {
  const configs: ExperimentConfig[] = [];
  const base = { ...winner, model, maxSteps: 40, maxWakeups: 40 };

  // The winner itself at the new model
  configs.push({ ...base, id: makeId(base) });

  // Ablate each dimension
  const dimensions: Array<{ key: keyof ExperimentConfig; levels: any[] }> = [
    { key: 'memory', levels: MEMORY_LEVELS },
    { key: 'history', levels: HISTORY_LEVELS },
    { key: 'action', levels: ACTION_LEVELS },
    { key: 'reflection', levels: REFLECTION_LEVELS },
    { key: 'selfMod', levels: SELFMOD_LEVELS },
  ];

  for (const dim of dimensions) {
    for (const level of dim.levels) {
      if (level === (base as any)[dim.key]) continue;
      const c = { ...base, [dim.key]: level };
      const id = makeId(c);
      if (!configs.some(x => x.id === id)) {
        configs.push({ ...c, id });
      }
    }
  }

  return configs;
}

export { MEMORY_LEVELS, HISTORY_LEVELS, ACTION_LEVELS, REFLECTION_LEVELS, SELFMOD_LEVELS };

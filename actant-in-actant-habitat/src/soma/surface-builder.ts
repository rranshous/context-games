/**
 * Surface Builder — constructs bound surfaces at connection time.
 *
 * When an inhabitant activates a module, the surface builder creates an object
 * with the module's methods bound to the inhabitant's caller identity.
 * Having the surface IS the permission. No runtime checks.
 *
 * Module surfaces live under habitat.modules namespace:
 *   habitat.modules.chat.post({ text })
 *   habitat.modules['knock-knock'].pose({ setup, punchline })
 */

import { ModuleRuntime } from './module-runtime.js';
import { StateStore } from '../chassis/statestore.js';
import { Clock } from '../chassis/clock.js';

export interface ModulesNamespace {
  activate: (moduleId: string) => boolean;
  deactivate: (moduleId: string) => boolean;
  list: () => string[];
  [moduleId: string]: unknown;
}

export interface HabitatSurface {
  modules: ModulesNamespace;
  events: {
    subscribe: (event: string) => void;
    unsubscribe: (event: string) => void;
  };
  clock: {
    now: () => number;
  };
}

/**
 * Build the `habitat` object that an inhabitant's handlers receive.
 * Module surfaces are bound with the inhabitant's identity baked in.
 */
export function buildHabitatSurface(
  actantId: string,
  store: StateStore,
  moduleRuntime: ModuleRuntime,
  clock: Clock,
): HabitatSurface {
  const activationsKey = `activations:${actantId}`;

  const modules: ModulesNamespace = {
    activate(moduleId: string): boolean {
      const added = store.sadd(activationsKey, moduleId, actantId);
      if (added) {
        attachModuleSurface(modules, moduleId, actantId, moduleRuntime);
        console.log(`[surface] ${actantId} activated ${moduleId}`);
      }
      return added;
    },
    deactivate(moduleId: string): boolean {
      const removed = store.srem(activationsKey, moduleId, actantId);
      if (removed) {
        delete modules[moduleId];
        console.log(`[surface] ${actantId} deactivated ${moduleId}`);
      }
      return removed;
    },
    list(): string[] {
      return moduleRuntime.listModules();
    },
  };

  // Rebuild surfaces for already-activated modules
  const activated = store.smembers(activationsKey);
  for (const moduleId of activated) {
    attachModuleSurface(modules, moduleId, actantId, moduleRuntime);
  }

  return {
    modules,
    events: {
      subscribe(event: string): void {
        store.sadd(`subscriptions:${actantId}`, event, actantId);
      },
      unsubscribe(event: string): void {
        store.srem(`subscriptions:${actantId}`, event, actantId);
      },
    },
    clock: {
      now(): number {
        return clock.now();
      },
    },
  };
}

/**
 * Attach a module's methods to the modules namespace, with caller identity baked in.
 */
function attachModuleSurface(
  modules: ModulesNamespace,
  moduleId: string,
  actantId: string,
  moduleRuntime: ModuleRuntime,
): void {
  const descriptions = moduleRuntime.getMethodDescriptions(moduleId);
  if (!descriptions) return;

  const moduleSurface: Record<string, (input?: unknown) => unknown> = {};
  for (const methodName of Object.keys(descriptions)) {
    moduleSurface[methodName] = (input?: unknown) => {
      return moduleRuntime.call(moduleId, methodName, input, actantId);
    };
  }

  modules[moduleId] = moduleSurface;
}

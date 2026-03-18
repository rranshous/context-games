/**
 * Surface Builder — constructs bound surfaces at connection time.
 *
 * When an actant activates a module, the surface builder creates an object
 * with the module's methods bound to the actant's caller identity.
 * Having the surface IS the permission. No runtime checks.
 */

import { ModuleRuntime } from './module-runtime.js';
import { StateStore } from '../chassis/statestore.js';
import { Clock } from '../chassis/clock.js';

export interface HabitatSurface {
  modules: {
    activate: (moduleId: string) => boolean;
    deactivate: (moduleId: string) => boolean;
    list: () => string[];
  };
  events: {
    subscribe: (event: string) => void;
    unsubscribe: (event: string) => void;
  };
  clock: {
    now: () => number;
  };
  // Module surfaces are added dynamically: habitat.chat.post(...), etc.
  [moduleId: string]: unknown;
}

/**
 * Build the `habitat` object that an actant's handlers receive.
 * Module surfaces are bound with the actant's identity baked in.
 */
export function buildHabitatSurface(
  actantId: string,
  store: StateStore,
  moduleRuntime: ModuleRuntime,
  clock: Clock,
): HabitatSurface {
  const activationsKey = `activations:${actantId}`;

  const surface: HabitatSurface = {
    modules: {
      activate(moduleId: string): boolean {
        const added = store.sadd(activationsKey, moduleId, actantId);
        if (added) {
          // Build and attach the module surface
          attachModuleSurface(surface, moduleId, actantId, moduleRuntime);
          console.log(`[surface] ${actantId} activated ${moduleId}`);
        }
        return added;
      },
      deactivate(moduleId: string): boolean {
        const removed = store.srem(activationsKey, moduleId, actantId);
        if (removed) {
          delete surface[moduleId];
          console.log(`[surface] ${actantId} deactivated ${moduleId}`);
        }
        return removed;
      },
      list(): string[] {
        return moduleRuntime.listModules();
      },
    },
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

  // Rebuild surfaces for already-activated modules
  const activated = store.smembers(activationsKey);
  for (const moduleId of activated) {
    attachModuleSurface(surface, moduleId, actantId, moduleRuntime);
  }

  return surface;
}

/**
 * Attach a module's methods to the habitat surface, with caller identity baked in.
 */
function attachModuleSurface(
  surface: HabitatSurface,
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

  surface[moduleId] = moduleSurface;
}

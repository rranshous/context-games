/**
 * Habitat Soma — the habitat actant's identity, handlers, and inner world management.
 *
 * This is the "brain" of the habitat. It defines:
 * - How actants are created and managed
 * - How tick signals are dispatched to inner actants
 * - How events flow through the bus
 * - The habitat's identity
 */

import { StateStore } from '../chassis/statestore.js';
import { Clock } from '../chassis/clock.js';
import { ModuleRuntime } from './module-runtime.js';
import { buildHabitatSurface, HabitatSurface } from './surface-builder.js';

// --- Actant ---

export interface ActantSoma {
  identity: string;
  memory: string;
  on_tick?: string;     // handler source, called every tick
  on_event?: string;    // handler source, called when subscribed event fires
}

interface ActantRuntime {
  id: string;
  surface: HabitatSurface;
}

// --- Habitat Soma ---

export class HabitatSoma {
  private store: StateStore;
  private clock: Clock;
  private moduleRuntime: ModuleRuntime;
  private actants = new Map<string, ActantRuntime>();

  constructor(store: StateStore, clock: Clock, moduleRuntime: ModuleRuntime) {
    this.store = store;
    this.clock = clock;
    this.moduleRuntime = moduleRuntime;
  }

  /** Create an inner actant with initial soma. */
  createActant(id: string, soma: ActantSoma): void {
    // Store soma sections
    this.store.hset(`actants/${id}`, 'identity', soma.identity, 'habitat');
    this.store.hset(`actants/${id}`, 'memory', soma.memory, 'habitat');
    if (soma.on_tick) {
      this.store.hset(`actants/${id}`, 'on_tick', soma.on_tick, 'habitat');
    }
    if (soma.on_event) {
      this.store.hset(`actants/${id}`, 'on_event', soma.on_event, 'habitat');
    }

    // Build surface
    const surface = buildHabitatSurface(id, this.store, this.moduleRuntime, this.clock);

    this.actants.set(id, { id, surface });
    console.log(`[habitat] created actant "${id}"`);
  }

  /** Restore actants from persisted state. */
  restoreActants(): void {
    // Find all actant keys in the store
    const keys = this.store.keys('actants/*');
    const actantIds = new Set<string>();
    for (const key of keys) {
      // Key format: "actants/{id}/{field}" — but we store as hashes with key "actants/{id}"
      // Actually we use hset with key "actants/{id}" and fields, so keys() will give us "actants/{id}"
      const match = key.match(/^actants\/([^/]+)$/);
      if (match) actantIds.add(match[1]);
    }

    for (const id of actantIds) {
      const surface = buildHabitatSurface(id, this.store, this.moduleRuntime, this.clock);
      this.actants.set(id, { id, surface });
      console.log(`[habitat] restored actant "${id}"`);
    }
  }

  /** Called every tick. Dispatches on_tick to all inner actants. */
  onTick(tick: number): void {
    this.store.setTick(tick);

    for (const [id, actant] of this.actants) {
      const onTick = this.store.hget(`actants/${id}`, 'on_tick') as string | null;
      if (!onTick) continue;

      try {
        // Build the `me` object for this actant
        const me = this.buildMe(id);

        // Execute on_tick handler
        // For now, we use a simple Function call (not VM) for actant handlers
        // since they need access to `me` and `habitat` which are complex objects.
        // Module handlers use the VM. Actant handlers run in the main process.
        // This is a design trade-off: actants are trusted more than modules.
        const handler = new Function('me', 'habitat', onTick);
        handler(me, actant.surface);
      } catch (err) {
        console.error(`[habitat] actant "${id}" on_tick error:`, (err as Error).message);
      }
    }
  }

  /** Dispatch a module event to subscribed actants. */
  onModuleEvent(moduleId: string, event: string, data: unknown): void {
    const fullEvent = `${moduleId}.${event}`;

    // Write to event stream in store
    this.store.rpush(`events/${fullEvent}`, {
      tick: this.clock.now(),
      emitter: moduleId,
      data,
    }, moduleId);

    // Dispatch to module subscribers
    this.moduleRuntime.dispatchEvent(fullEvent, { emitter: moduleId, data });

    // Dispatch to actant subscribers
    for (const [id, actant] of this.actants) {
      const subscribed = this.store.sismember(`subscriptions:${id}`, fullEvent);
      if (!subscribed) continue;

      const onEvent = this.store.hget(`actants/${id}`, 'on_event') as string | null;
      if (!onEvent) continue;

      try {
        const me = this.buildMe(id);
        const handler = new Function('me', 'habitat', 'event', onEvent);
        handler(me, actant.surface, { name: fullEvent, emitter: moduleId, data });
      } catch (err) {
        console.error(`[habitat] actant "${id}" on_event error:`, (err as Error).message);
      }
    }
  }

  /** Build the `me` object for an actant — read/write access to its own soma. */
  private buildMe(actantId: string) {
    const store = this.store;
    const hashKey = `actants/${actantId}`;

    return {
      id: actantId,
      identity: {
        read: () => store.hget(hashKey, 'identity') as string,
        write: (value: string) => store.hset(hashKey, 'identity', value, actantId),
      },
      memory: {
        read: () => store.hget(hashKey, 'memory') as string,
        write: (value: string) => store.hset(hashKey, 'memory', value, actantId),
      },
      on_tick: {
        read: () => store.hget(hashKey, 'on_tick') as string | null,
        write: (value: string) => store.hset(hashKey, 'on_tick', value, actantId),
      },
      on_event: {
        read: () => store.hget(hashKey, 'on_event') as string | null,
        write: (value: string) => store.hset(hashKey, 'on_event', value, actantId),
      },
    };
  }

  /** List all actant IDs. */
  listActants(): string[] {
    return [...this.actants.keys()];
  }
}

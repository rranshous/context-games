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
import Anthropic from '@anthropic-ai/sdk';
import { thinkAbout as callInference } from '../chassis/inference.js';

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
  thinking: boolean;    // true while an inference call is in flight
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

    this.actants.set(id, { id, surface, thinking: false });
    console.log(`[habitat] created actant "${id}"`);
  }

  /** Restore actants from persisted state. */
  restoreActants(): void {
    const keys = this.store.keys('actants/*');
    const actantIds = new Set<string>();
    for (const key of keys) {
      const match = key.match(/^actants\/([^/]+)$/);
      if (match) actantIds.add(match[1]);
    }

    for (const id of actantIds) {
      const surface = buildHabitatSurface(id, this.store, this.moduleRuntime, this.clock);
      this.actants.set(id, { id, surface, thinking: false });
      console.log(`[habitat] restored actant "${id}"`);
    }
  }

  /** Called every tick. Dispatches on_tick to all inner actants. */
  onTick(tick: number): void {
    this.store.setTick(tick);

    for (const [id, actant] of this.actants) {
      const onTick = this.store.hget(`actants/${id}`, 'on_tick') as string | null;
      if (!onTick) continue;

      // Skip if actant is mid-inference
      if (actant.thinking) {
        console.log(`[habitat] ${id} still thinking, skipping tick ${tick}`);
        continue;
      }

      try {
        const me = this.buildMe(id, actant);
        // on_tick handlers are async (they may call thinkAbout)
        const handler = new Function('me', 'habitat', `return (async () => { ${onTick} })();`);
        const promise = handler(me, actant.surface);

        // Handle async completion
        if (promise && typeof promise.then === 'function') {
          promise.catch((err: Error) => {
            console.error(`[habitat] ${id} on_tick async error:`, err.message);
          });
        }
      } catch (err) {
        console.error(`[habitat] ${id} on_tick error:`, (err as Error).message);
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
        const me = this.buildMe(id, actant);
        const handler = new Function('me', 'habitat', 'event', `return (async () => { ${onEvent} })();`);
        const promise = handler(me, actant.surface, { name: fullEvent, emitter: moduleId, data });
        if (promise && typeof promise.then === 'function') {
          promise.catch((err: Error) => {
            console.error(`[habitat] ${id} on_event async error:`, err.message);
          });
        }
      } catch (err) {
        console.error(`[habitat] ${id} on_event error:`, (err as Error).message);
      }
    }
  }

  /** Build the `me` object for an actant — read/write access to its own soma + thinkAbout. */
  private buildMe(actantId: string, runtime: ActantRuntime) {
    const store = this.store;
    const hashKey = `actants/${actantId}`;
    const moduleRuntime = this.moduleRuntime;

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

      /**
       * thinkAbout — the core inference primitive.
       * System prompt is the pure soma. User prompt is the impulse.
       * Tools are compiled from active module surfaces.
       */
      thinkAbout: async (impulse: string): Promise<string> => {
        runtime.thinking = true;
        console.log(`[habitat] ${actantId} thinking: "${impulse}"`);

        try {
          // Gather soma sections
          const soma: Record<string, string | null> = {
            identity: store.hget(hashKey, 'identity') as string,
            memory: store.hget(hashKey, 'memory') as string,
            on_tick: store.hget(hashKey, 'on_tick') as string | null,
            on_event: store.hget(hashKey, 'on_event') as string | null,
          };

          // Build tools from activated module surfaces
          const tools = buildToolsForActant(actantId, store, moduleRuntime);

          // Agentic loop — tool results feed back to the model
          const result = await callInference({
            soma,
            impulse,
            tools,
            executeTool: (name, input) => {
              console.log(`[habitat] ${actantId} tool: ${name}(${JSON.stringify(input).slice(0, 80)})`);
              return executeToolCall(actantId, name, input, store, moduleRuntime);
            },
          });

          console.log(`[habitat] ${actantId} done (${result.usage.input}→${result.usage.output} tokens, ${result.toolsUsed.length} tools)`);

          if (result.text) {
            console.log(`[habitat] ${actantId} says: ${result.text.slice(0, 120)}`);
          }

          return result.text;
        } catch (err) {
          console.error(`[habitat] ${actantId} thinkAbout error:`, (err as Error).message);
          return `(error: ${(err as Error).message})`;
        } finally {
          runtime.thinking = false;
        }
      },
    };
  }

  /** List all actant IDs. */
  listActants(): string[] {
    return [...this.actants.keys()];
  }
}

// --- Tool building ---

function buildToolsForActant(
  actantId: string,
  store: StateStore,
  moduleRuntime: ModuleRuntime,
): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = [];

  const obj = 'object' as const;

  // Soma tools
  tools.push({
    name: 'read_memory',
    description: 'Read your memory',
    input_schema: { type: obj, properties: {} },
  });
  tools.push({
    name: 'write_memory',
    description: 'Write to your memory (replaces current content)',
    input_schema: {
      type: obj,
      properties: { content: { type: 'string', description: 'New memory content' } },
      required: ['content'],
    },
  });
  tools.push({
    name: 'post_chat',
    description: 'Post a message to the habitat chat',
    input_schema: {
      type: obj,
      properties: { text: { type: 'string', description: 'Message text' } },
      required: ['text'],
    },
  });
  tools.push({
    name: 'read_chat',
    description: 'Read recent chat messages',
    input_schema: {
      type: obj,
      properties: { count: { type: 'number', description: 'Number of messages to read (default 10)' } },
    },
  });

  // Module tools from activated modules
  const activated = store.smembers(`activations:${actantId}`);
  for (const moduleId of activated) {
    const schemas = moduleRuntime.getMethodSchemas(moduleId);
    if (!schemas) continue;
    for (const [method, info] of Object.entries(schemas)) {
      // Skip chat methods since we have dedicated tools
      if (moduleId === 'chat') continue;
      tools.push({
        name: `${moduleId}__${method}`,
        description: `[${moduleId}] ${info.description}`,
        input_schema: (info.input_schema || { type: obj, properties: {} }) as Anthropic.Tool.InputSchema,
      });
    }
  }

  return tools;
}

function executeToolCall(
  actantId: string,
  toolName: string,
  input: Record<string, unknown>,
  store: StateStore,
  moduleRuntime: ModuleRuntime,
): unknown {
  const hashKey = `actants/${actantId}`;

  switch (toolName) {
    case 'read_memory':
      return store.hget(hashKey, 'memory');
    case 'write_memory':
      store.hset(hashKey, 'memory', input.content as string, actantId);
      return { ok: true };
    case 'post_chat': {
      store.sadd(`activations:${actantId}`, 'chat', actantId);
      const tick = parseInt(store.get('habitat/clock/tick') || '0', 10);
      return moduleRuntime.call('chat', 'post', { text: input.text, tick }, actantId);
    }
    case 'read_chat':
      return moduleRuntime.call('chat', 'read', { count: input.count || 10 }, actantId);
    default: {
      // Module method: "moduleId__method" — double underscore separator
      const sep = toolName.indexOf('__');
      if (sep > 0) {
        const moduleId = toolName.slice(0, sep);
        const method = toolName.slice(sep + 2);
        return moduleRuntime.call(moduleId, method, input, actantId);
      }
      return { error: `Unknown tool: ${toolName}` };
    }
  }
}

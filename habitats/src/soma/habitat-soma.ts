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
import { ModuleRuntime, type MethodDef, type ModuleDefinition } from './module-runtime.js';
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

interface QueuedEvent {
  name: string;
  emitter: string;
  data: unknown;
}

interface ActantRuntime {
  id: string;
  surface: HabitatSurface;
  thinking: boolean;    // true while an inference call is in flight
  eventQueue: QueuedEvent[];  // events received while thinking
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

    this.actants.set(id, { id, surface, thinking: false, eventQueue: [] });
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
      this.actants.set(id, { id, surface, thinking: false, eventQueue: [] });
      console.log(`[habitat] restored actant "${id}"`);
    }
  }

  /** Restore dynamically created modules from persisted definitions. */
  restoreDynamicModules(): void {
    const defs = this.store.hgetall('module-defs');
    for (const [id, raw] of Object.entries(defs)) {
      if (this.moduleRuntime.listModules().includes(id)) continue; // already loaded (built-in)
      const def = raw as { id: string; name: string; initState: Record<string, unknown>; methods: Record<string, { description: string; handler: string; input_schema?: Record<string, unknown> }>; creator: string };
      const methods: Record<string, MethodDef> = {};
      for (const [methodName, methodInfo] of Object.entries(def.methods)) {
        methods[methodName] = {
          description: methodInfo.description || methodName,
          handler: methodInfo.handler,
          input_schema: methodInfo.input_schema,
        };
      }
      const moduleDef: ModuleDefinition = {
        id: def.id,
        name: def.name,
        init: () => ({ ...def.initState, _creator: def.creator }),
        methods,
      };
      const result = this.moduleRuntime.loadModule(moduleDef);
      if (result.ok) {
        console.log(`[habitat] restored dynamic module "${id}" (created by ${def.creator})`);
      }
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

      // Don't fire events for the actant that caused them
      const eventData = data as Record<string, unknown> | null;
      if (eventData && (eventData.from === id || eventData.poser === id || eventData.guesser === id)) continue;

      const queuedEvent: QueuedEvent = { name: fullEvent, emitter: moduleId, data };

      if (actant.thinking) {
        // Queue for later — actant is mid-inference
        actant.eventQueue.push(queuedEvent);
        continue;
      }

      this.fireEvent(id, actant, queuedEvent);
    }
  }

  /** Fire an event handler for an actant. */
  private fireEvent(id: string, actant: ActantRuntime, event: QueuedEvent): void {
    const onEvent = this.store.hget(`actants/${id}`, 'on_event') as string | null;
    if (!onEvent) return;

    console.log(`[habitat] ${id} event: ${event.name}`);

    try {
      const me = this.buildMe(id, actant);
      const handler = new Function('me', 'habitat', 'event', `return (async () => { ${onEvent} })();`);
      const promise = handler(me, actant.surface, event);
      if (promise && typeof promise.then === 'function') {
        promise.then(() => {
          // Process queued events after this one completes
          this.drainEventQueue(id, actant);
        }).catch((err: Error) => {
          console.error(`[habitat] ${id} on_event async error:`, err.message);
          this.drainEventQueue(id, actant);
        });
      }
    } catch (err) {
      console.error(`[habitat] ${id} on_event error:`, (err as Error).message);
    }
  }

  /** Process queued events after thinking completes. */
  private drainEventQueue(id: string, actant: ActantRuntime): void {
    if (actant.eventQueue.length === 0 || actant.thinking) return;
    const next = actant.eventQueue.shift()!;
    this.fireEvent(id, actant, next);
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
          // Drain any events that queued while thinking
          this.drainEventQueue(actantId, runtime);
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

// Soma sections that get read/write tools
const SOMA_SECTIONS = ['identity', 'memory', 'on_tick', 'on_event'] as const;

function buildToolsForActant(
  actantId: string,
  store: StateStore,
  moduleRuntime: ModuleRuntime,
): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = [];
  const obj = 'object' as const;

  // Soma section tools — read_<section> and write_<section> for each
  for (const section of SOMA_SECTIONS) {
    tools.push({
      name: `soma__read_${section}`,
      description: `Read your ${section} section`,
      input_schema: { type: obj, properties: {} },
    });
    tools.push({
      name: `soma__write_${section}`,
      description: `Write to your ${section} section (replaces current content)`,
      input_schema: {
        type: obj,
        properties: { content: { type: 'string', description: `New ${section} content` } },
        required: ['content'],
      },
    });
  }

  // Event tools
  tools.push({
    name: 'events__subscribe',
    description: 'Subscribe to an event (e.g., "chat.message_posted", "knock-knock.joke_posed")',
    input_schema: {
      type: obj,
      properties: { event: { type: 'string', description: 'Event name to subscribe to' } },
      required: ['event'],
    },
  });
  tools.push({
    name: 'events__unsubscribe',
    description: 'Unsubscribe from an event',
    input_schema: {
      type: obj,
      properties: { event: { type: 'string', description: 'Event name to unsubscribe from' } },
      required: ['event'],
    },
  });
  tools.push({
    name: 'events__list_subscriptions',
    description: 'List your current event subscriptions',
    input_schema: { type: obj, properties: {} },
  });

  // Module lifecycle tools
  tools.push({
    name: 'modules__create',
    description: 'Create a new module in the habitat. Provide id, name, initial state, and method definitions. Methods are JS function bodies that receive (state, input, caller) and must return { state, result }.',
    input_schema: {
      type: obj,
      properties: {
        id: { type: 'string', description: 'Unique module ID (e.g., "my-blog")' },
        name: { type: 'string', description: 'Human-readable name' },
        init_state: { type: 'object', description: 'Initial state object' },
        methods: {
          type: 'object',
          description: 'Method definitions. Each key is a method name, value is { description: string, handler: string }. Handler is a JS function body receiving (state, input, caller) that returns { state, result }.',
        },
      },
      required: ['id', 'name', 'init_state', 'methods'],
    },
  });
  tools.push({
    name: 'modules__destroy',
    description: 'Destroy a module you created (removes definition and state)',
    input_schema: {
      type: obj,
      properties: { id: { type: 'string', description: 'Module ID to destroy' } },
      required: ['id'],
    },
  });
  tools.push({
    name: 'modules__update',
    description: 'Update methods on a module you created. Provide the module ID and new/updated method definitions. Existing methods not listed are preserved. State is preserved.',
    input_schema: {
      type: obj,
      properties: {
        id: { type: 'string', description: 'Module ID to update' },
        methods: {
          type: 'object',
          description: 'Method definitions to add or update. Each key is a method name, value is { description: string, handler: string }.',
        },
      },
      required: ['id', 'methods'],
    },
  });

  // Module tools from activated modules — no special cases
  const activated = store.smembers(`activations:${actantId}`);
  for (const moduleId of activated) {
    const schemas = moduleRuntime.getMethodSchemas(moduleId);
    if (!schemas) continue;
    for (const [method, info] of Object.entries(schemas)) {
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

  // Soma tools: soma__read_<section> / soma__write_<section>
  if (toolName.startsWith('soma__read_')) {
    const section = toolName.slice('soma__read_'.length);
    return store.hget(hashKey, section) ?? '(empty)';
  }
  if (toolName.startsWith('soma__write_')) {
    const section = toolName.slice('soma__write_'.length);
    store.hset(hashKey, section, input.content as string, actantId);
    return { ok: true };
  }

  // Event tools
  if (toolName === 'events__subscribe') {
    store.sadd(`subscriptions:${actantId}`, input.event as string, actantId);
    return { ok: true, subscribed: input.event };
  }
  if (toolName === 'events__unsubscribe') {
    store.srem(`subscriptions:${actantId}`, input.event as string, actantId);
    return { ok: true, unsubscribed: input.event };
  }
  if (toolName === 'events__list_subscriptions') {
    return store.smembers(`subscriptions:${actantId}`);
  }

  // Module lifecycle tools
  if (toolName === 'modules__create') {
    const id = input.id as string;
    const name = input.name as string;
    const initState = input.init_state as Record<string, unknown>;
    const rawMethods = input.methods as Record<string, { description: string; handler: string; input_schema?: Record<string, unknown> }>;

    if (!id || !name || !rawMethods) {
      return { error: 'Need id, name, and methods' };
    }

    // Check if module already exists
    if (moduleRuntime.listModules().includes(id)) {
      return { error: `Module "${id}" already exists` };
    }

    // Build method definitions
    const methods: Record<string, MethodDef> = {};
    for (const [methodName, methodInfo] of Object.entries(rawMethods)) {
      methods[methodName] = {
        description: methodInfo.description || methodName,
        handler: methodInfo.handler,
        input_schema: methodInfo.input_schema,
      };
    }

    const def: ModuleDefinition = {
      id,
      name,
      init: () => ({ ...initState, _creator: actantId }),
      methods,
    };

    const result = moduleRuntime.loadModule(def);
    if (result.ok) {
      // Persist the definition so it survives restart
      store.hset('module-defs', id, {
        id, name, initState, methods: rawMethods, creator: actantId,
      }, actantId);
      console.log(`[habitat] ${actantId} created module "${id}"`);
    }
    return result;
  }

  if (toolName === 'modules__destroy') {
    const id = input.id as string;
    if (!id) return { error: 'Need id' };

    // Ownership check — only the creator can destroy
    const moduleState = store.hget('modules', id) as Record<string, unknown> | null;
    if (moduleState && moduleState._creator && moduleState._creator !== actantId) {
      return { error: `Only the creator (${moduleState._creator}) can destroy "${id}"` };
    }

    const destroyed = moduleRuntime.destroyModule(id);
    if (destroyed) {
      store.hdel('module-defs', id, actantId);
      console.log(`[habitat] ${actantId} destroyed module "${id}"`);
    }
    return { ok: destroyed };
  }

  if (toolName === 'modules__update') {
    const id = input.id as string;
    const rawMethods = input.methods as Record<string, { description: string; handler: string; input_schema?: Record<string, unknown> }>;
    if (!id || !rawMethods) return { error: 'Need id and methods' };

    // Ownership check — only the creator can update
    const moduleState = store.hget('modules', id) as Record<string, unknown> | null;
    if (moduleState && moduleState._creator && moduleState._creator !== actantId) {
      return { error: `Only the creator (${moduleState._creator}) can update "${id}"` };
    }

    // Build method definitions
    const methods: Record<string, MethodDef> = {};
    for (const [methodName, methodInfo] of Object.entries(rawMethods)) {
      methods[methodName] = {
        description: methodInfo.description || methodName,
        handler: methodInfo.handler,
        input_schema: methodInfo.input_schema,
      };
    }

    const result = moduleRuntime.updateMethods(id, methods);
    if (result.ok) {
      // Update persisted definition
      const existingDef = store.hget('module-defs', id) as Record<string, unknown> | null;
      if (existingDef) {
        const existingMethods = (existingDef.methods || {}) as Record<string, unknown>;
        store.hset('module-defs', id, {
          ...existingDef,
          methods: { ...existingMethods, ...rawMethods },
        }, actantId);
      }
      console.log(`[habitat] ${actantId} updated module "${id}": ${Object.keys(rawMethods).join(', ')}`);
    }
    return result;
  }

  // Module tools: moduleId__method (double underscore separator)
  const sep = toolName.indexOf('__');
  if (sep > 0) {
    const moduleId = toolName.slice(0, sep);
    const method = toolName.slice(sep + 2);
    return moduleRuntime.call(moduleId, method, input, actantId);
  }

  return { error: `Unknown tool: ${toolName}` };
}

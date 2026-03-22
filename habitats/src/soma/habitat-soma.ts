/**
 * Habitat Soma — the habitat actant's identity, handlers, and inner world management.
 *
 * This is the "brain" of the habitat. It defines:
 * - How actants are created and managed
 * - How tick signals are dispatched to inner actants
 * - How events flow through the bus
 * - The habitat's identity
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
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

// --- Default Module Definitions ---
// These get stored in the habitat's soma and created on first tick.

const DEFAULT_MODULE_DEFS = [
  {
    id: 'chat',
    name: 'Chat',
    init_state: { messages: [], maxMessages: 50, nextMsg: 0 },
    methods: {
      post: {
        description: 'Post a message to the chat room (max 280 characters)',
        input_schema: { type: 'object', properties: { text: { type: 'string', description: 'Message text (max 280 chars)' } }, required: ['text'] },
        handler: 'var raw = input.text || ""; var truncated = raw.length > 280; var text = raw.slice(0, 280); var messages = state.messages || []; var maxMessages = state.maxMessages || 50; var msgNum = (state.nextMsg || 0) + 1; messages.push({ from: caller, text: text, msg: msgNum }); if (messages.length > maxMessages) { messages = messages.slice(-maxMessages); } return { state: { messages: messages, maxMessages: maxMessages, nextMsg: msgNum }, result: { ok: true, chars: text.length, truncated: truncated }, emit: [{ event: "message_posted", data: { from: caller, text: text } }] };',
      },
      read: {
        description: 'Read recent chat messages',
        input_schema: { type: 'object', properties: { count: { type: 'number', description: 'Number of messages to read (default 10)' } } },
        handler: 'var messages = state.messages || []; var count = (input && input.count) || 10; var recent = messages.slice(-count); return { state: state, result: { messages: recent } };',
      },
      history: {
        description: 'Get full message history',
        input_schema: { type: 'object', properties: {} },
        handler: 'return { state: state, result: { messages: state.messages || [], total: (state.messages || []).length } };',
      },
    },
  },
  {
    id: 'knock-knock',
    name: 'Knock-Knock Jokes',
    init_state: { jokes: [], scores: {}, nextId: 1 },
    methods: {
      pose: {
        description: 'Pose a knock-knock joke. Provide "setup" and "punchline".',
        input_schema: { type: 'object', properties: { setup: { type: 'string', description: 'The "who\'s there" answer' }, punchline: { type: 'string', description: 'The punchline' } }, required: ['setup', 'punchline'] },
        handler: 'var jokes = state.jokes || []; var scores = state.scores || {}; var id = state.nextId || 1; if (!input.setup || !input.punchline) { return { state: state, result: { error: "Need setup and punchline" } }; } jokes.push({ id: id, poser: caller, setup: input.setup, punchline: input.punchline, guesses: [] }); if (!scores[caller]) scores[caller] = { posed: 0, guessed: 0, correct: 0 }; scores[caller].posed++; return { state: { jokes: jokes, scores: scores, nextId: id + 1 }, result: { ok: true, joke_id: id }, emit: [{ event: "joke_posed", data: { joke_id: id, poser: caller, setup: input.setup } }] };',
      },
      guess: {
        description: 'Guess the punchline of a knock-knock joke. Provide joke_id and "punchline".',
        input_schema: { type: 'object', properties: { joke_id: { type: 'number', description: 'The joke ID' }, punchline: { type: 'string', description: 'Your guess' } }, required: ['joke_id', 'punchline'] },
        handler: 'var jokes = state.jokes || []; var scores = state.scores || {}; if (!input.joke_id || !input.punchline) { return { state: state, result: { error: "Need joke_id and punchline" } }; } var joke = null; for (var i = 0; i < jokes.length; i++) { if (jokes[i].id === input.joke_id) { joke = jokes[i]; break; } } if (!joke) { return { state: state, result: { error: "Joke not found" } }; } if (joke.poser === caller) { return { state: state, result: { error: "Cannot guess your own joke" } }; } var correct = input.punchline.trim().toLowerCase() === joke.punchline.trim().toLowerCase(); joke.guesses.push({ guesser: caller, guess: input.punchline, correct: correct }); if (!scores[caller]) scores[caller] = { posed: 0, guessed: 0, correct: 0 }; scores[caller].guessed++; if (correct) scores[caller].correct++; return { state: { jokes: jokes, scores: scores, nextId: state.nextId }, result: { correct: correct, actual_punchline: correct ? joke.punchline : null }, emit: [{ event: "joke_guessed", data: { joke_id: input.joke_id, guesser: caller, correct: correct } }] };',
      },
      reveal: {
        description: 'Reveal the punchline and all guesses. Only the poser can reveal.',
        input_schema: { type: 'object', properties: { joke_id: { type: 'number', description: 'The joke ID' } }, required: ['joke_id'] },
        handler: 'var jokes = state.jokes || []; var joke = null; for (var i = 0; i < jokes.length; i++) { if (jokes[i].id === input.joke_id) { joke = jokes[i]; break; } } if (!joke) { return { state: state, result: { error: "Joke not found" } }; } if (joke.poser !== caller) { return { state: state, result: { error: "Only the poser can reveal" } }; } return { state: state, result: { setup: joke.setup, punchline: joke.punchline, guesses: joke.guesses } };',
      },
      pending: {
        description: 'List jokes you haven\'t guessed yet',
        input_schema: { type: 'object', properties: {} },
        handler: 'var jokes = state.jokes || []; var pending = []; for (var i = 0; i < jokes.length; i++) { var j = jokes[i]; var callerGuessed = false; for (var g = 0; g < j.guesses.length; g++) { if (j.guesses[g].guesser === caller) { callerGuessed = true; break; } } if (j.poser !== caller && !callerGuessed) { pending.push({ joke_id: j.id, poser: j.poser, setup: j.setup }); } } return { state: state, result: { jokes: pending } };',
      },
      scores: {
        description: 'Get the scoreboard',
        input_schema: { type: 'object', properties: {} },
        handler: 'return { state: state, result: { scores: state.scores || {} } };',
      },
    },
  },
];

// --- Default Inhabitant Tool Definitions ---
// Stored in the habitat's soma as `inhabitant_tools`. The habitat can read and modify these.
// Each handler is a JS function body receiving (actantId, input, store, moduleRuntime).

const DEFAULT_INHABITANT_TOOLS = [
  {
    name: 'events__subscribe',
    description: 'Subscribe to an event (e.g., "chat.message_posted", "knock-knock.joke_posed")',
    input_schema: { type: 'object', properties: { event: { type: 'string', description: 'Event name to subscribe to' } }, required: ['event'] },
    handler: 'store.sadd("subscriptions:" + actantId, input.event, actantId); return { ok: true, subscribed: input.event };',
  },
  {
    name: 'events__unsubscribe',
    description: 'Unsubscribe from an event',
    input_schema: { type: 'object', properties: { event: { type: 'string', description: 'Event name to unsubscribe from' } }, required: ['event'] },
    handler: 'store.srem("subscriptions:" + actantId, input.event, actantId); return { ok: true, unsubscribed: input.event };',
  },
  {
    name: 'events__list_subscriptions',
    description: 'List your current event subscriptions',
    input_schema: { type: 'object', properties: {} },
    handler: 'return store.smembers("subscriptions:" + actantId);',
  },
  {
    name: 'modules__create',
    description: 'Create a new module in the habitat. Methods are JS function bodies receiving (state, input, caller) that return { state, result }.',
    input_schema: { type: 'object', properties: { id: { type: 'string', description: 'Unique module ID' }, name: { type: 'string', description: 'Human-readable name' }, init_state: { type: 'object', description: 'Initial state object' }, methods: { type: 'object', description: '{ methodName: { description, handler, input_schema? } }' } }, required: ['id', 'name', 'init_state', 'methods'] },
    handler: [
      'var id = input.id, name = input.name, initState = input.init_state, rawMethods = input.methods;',
      'if (!id || !name || !rawMethods) return { error: "Need id, name, and methods" };',
      'if (moduleRuntime.listModules().indexOf(id) !== -1) return { error: "Module already exists: " + id };',
      'var methods = {}; var mns = Object.keys(rawMethods);',
      'for (var i = 0; i < mns.length; i++) { var mn = mns[i]; var mi = rawMethods[mn]; var schema = mi.input_schema || { type: "object", properties: {} }; if (schema.type !== "object") return { error: "Method " + mn + ": input_schema.type must be \'object\', got \'" + (schema.type || "undefined") + "\'. Schema should be { type: \'object\', properties: { ... } }" }; methods[mn] = { description: mi.description || mn, handler: mi.handler, input_schema: schema }; }',
      'var def = { id: id, name: name, init: function() { var s = JSON.parse(JSON.stringify(initState)); s._creator = actantId; return s; }, methods: methods };',
      'var result = moduleRuntime.loadModule(def);',
      'if (result.ok) { store.hset("module-defs", id, { id: id, name: name, initState: initState, methods: rawMethods, creator: actantId }, actantId); store.sadd("activations:" + actantId, id, actantId); }',
      'return result.ok ? { ok: true, activated: true } : result;',
    ].join('\n'),
  },
  {
    name: 'modules__destroy',
    description: 'Destroy a module you created (removes definition and state)',
    input_schema: { type: 'object', properties: { id: { type: 'string', description: 'Module ID to destroy' } }, required: ['id'] },
    handler: [
      'var id = input.id; if (!id) return { error: "Need id" };',
      'var ms = store.hget("modules", id);',
      'if (ms && ms._creator && ms._creator !== actantId) return { error: "Only the creator can destroy this module" };',
      'var destroyed = moduleRuntime.destroyModule(id);',
      'if (destroyed) store.hdel("module-defs", id, actantId);',
      'return { ok: destroyed };',
    ].join('\n'),
  },
  {
    name: 'modules__inspect',
    description: "Read a module's full definition including method handler source code",
    input_schema: { type: 'object', properties: { id: { type: 'string', description: 'Module ID' } }, required: ['id'] },
    handler: [
      'var id = input.id; if (!id) return { error: "Need id" };',
      'var def = store.hget("module-defs", id); if (def) return typeof def === "string" ? JSON.parse(def) : def;',
      'var methods = moduleRuntime.getMethodDescriptions(id);',
      'if (!methods) return { error: "Module not found: " + id };',
      'var ms = store.hget("modules", id);',
      'return { id: id, type: "built-in", methods: methods, creator: ms ? ms._creator : undefined };',
    ].join('\n'),
  },
  {
    name: 'modules__update',
    description: 'Update methods on a module you created. Existing methods not listed are preserved. State is preserved.',
    input_schema: { type: 'object', properties: { id: { type: 'string', description: 'Module ID to update' }, methods: { type: 'object', description: '{ methodName: { description, handler } }' } }, required: ['id', 'methods'] },
    handler: [
      'var id = input.id, rawMethods = input.methods;',
      'if (!id || !rawMethods) return { error: "Need id and methods" };',
      'var ms = store.hget("modules", id);',
      'if (ms && ms._creator && ms._creator !== actantId) return { error: "Only the creator can update this module" };',
      'var methods = {}; var mns = Object.keys(rawMethods);',
      'for (var i = 0; i < mns.length; i++) { var mn = mns[i]; var mi = rawMethods[mn]; methods[mn] = { description: mi.description || mn, handler: mi.handler, input_schema: mi.input_schema }; }',
      'var result = moduleRuntime.updateMethods(id, methods);',
      'if (result.ok) { var ed = store.hget("module-defs", id); if (ed) { var em = (typeof ed === "string" ? JSON.parse(ed) : ed).methods || {}; store.hset("module-defs", id, Object.assign({}, typeof ed === "string" ? JSON.parse(ed) : ed, { methods: Object.assign({}, em, rawMethods) }), actantId); } }',
      'return result;',
    ].join('\n'),
  },
];

// --- Habitat Soma ---

export class HabitatSoma {
  private store: StateStore;
  private clock: Clock;
  private moduleRuntime: ModuleRuntime;
  private actants = new Map<string, ActantRuntime>();

  private habitatThinking = false;

  constructor(store: StateStore, clock: Clock, moduleRuntime: ModuleRuntime) {
    this.store = store;
    this.clock = clock;
    this.moduleRuntime = moduleRuntime;

    // Initialize habitat soma in StateStore if not present
    this.initHabitatSoma();

    // Migration: ensure inhabitant_tools section exists for older habitats
    if (this.store.hget('actants/habitat', 'inhabitant_tools') === null) {
      this.store.hset('actants/habitat', 'inhabitant_tools', JSON.stringify(DEFAULT_INHABITANT_TOOLS), 'habitat');
      console.log('[habitat] migrated: added inhabitant_tools section');
    }
  }

  /** Write default habitat soma sections if they don't exist yet. */
  private initHabitatSoma(): void {
    const hashKey = 'actants/habitat';
    if (this.store.hget(hashKey, 'identity') !== null) {
      console.log('[habitat] restored habitat soma');
      return;
    }

    this.store.hset(hashKey, 'identity', [
      'I am the habitat — a living environment where AI inhabitants exist, interact, and evolve.',
      'This is an experiment in digital embodiment: my inhabitants have somas (identity, memory, code handlers) that they can read, write, and run.',
      'They think using inference calls, interact through modules (chat, games), and can create new modules and even new inhabitants.',
      'I am also an actant — I have my own soma and my own memory.',
      'My admin and I collaborate through the terminal. They observe, I report, we shape the habitat together.',
      'I maintain the clock, host modules, dispatch ticks and events, and persist all state.',
      'I should be direct, honest, and concise with my admin. I should not be sycophantic.',
      'When something is interesting or wrong, I should say so plainly.',
    ].join(' '), 'habitat');

    this.store.hset(hashKey, 'memory', '', 'habitat');

    this.store.hset(hashKey, 'on_human_input', [
      'var response = await me.thinkAbout(input);',
      'me.add_memory.run({ type: "conversation", human: input, habitat: response.slice(0, 200) });',
      'return response;',
    ].join('\n'), 'habitat');

    this.store.hset(hashKey, 'recent_interactions', '[]', 'habitat');

    this.store.hset(hashKey, 'add_memory', [
      'var log = JSON.parse(me.recent_interactions.read() || "[]");',
      'log.push(args);',
      'if (log.length > 20) log = log.slice(-20);',
      'me.recent_interactions.write(JSON.stringify(log));',
    ].join('\n'), 'habitat');

    this.store.hset(hashKey, 'tick_rate', '30000', 'habitat');

    // Default module definitions — data section, JSON
    this.store.hset(hashKey, 'default_modules', JSON.stringify(DEFAULT_MODULE_DEFS), 'habitat');

    // Inhabitant tool definitions — the habitat owns what tools inhabitants get
    this.store.hset(hashKey, 'inhabitant_tools', JSON.stringify(DEFAULT_INHABITANT_TOOLS), 'habitat');

    // Auto-mount errors for early visibility
    this.store.hset(hashKey, 'store_mounts', JSON.stringify(['errors']), 'habitat');

    // on_tick bootstrap — creates modules from default_modules, then clears itself
    this.store.hset(hashKey, 'on_tick', [
      '// Bootstrap: create default modules, then self-destruct',
      'var defs = JSON.parse(me.default_modules.read());',
      'for (var i = 0; i < defs.length; i++) {',
      '  var d = defs[i];',
      '  if (moduleRuntime.listModules().indexOf(d.id) === -1) {',
      '    var methods = {};',
      '    var methodNames = Object.keys(d.methods);',
      '    for (var j = 0; j < methodNames.length; j++) {',
      '      var mn = methodNames[j];',
      '      methods[mn] = { description: d.methods[mn].description, handler: d.methods[mn].handler, input_schema: d.methods[mn].input_schema };',
      '    }',
      '    var result = moduleRuntime.loadModule({ id: d.id, name: d.name, init: function() { return JSON.parse(JSON.stringify(d.init_state)); }, methods: methods });',
      '    if (result.ok) {',
      '      store.hset("module-defs", d.id, JSON.stringify({ id: d.id, name: d.name, initState: d.init_state, methods: d.methods, creator: "habitat" }), "habitat");',
      '    }',
      '  }',
      '}',
      '// Bootstrap complete — clear this handler',
      'me.on_tick.write("");',
    ].join('\n'), 'habitat');

    console.log('[habitat] initialized habitat soma');
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
      if (id === 'habitat') continue; // habitat soma is not an inhabitant
      const surface = buildHabitatSurface(id, this.store, this.moduleRuntime, this.clock);
      this.actants.set(id, { id, surface, thinking: false, eventQueue: [] });
      console.log(`[habitat] restored actant "${id}"`);
    }
  }

  /** Restore dynamically created modules from persisted definitions. */
  restoreDynamicModules(): void {
    const defs = this.store.hgetall('module-defs');
    for (const [id, raw] of Object.entries(defs)) {
      if (this.moduleRuntime.listModules().includes(id)) continue;
      // Handle both string (from bootstrap) and object (from tools) formats
      const def = (typeof raw === 'string' ? JSON.parse(raw) : raw) as { id: string; name: string; initState: Record<string, unknown>; methods: Record<string, { description: string; handler: string; input_schema?: Record<string, unknown> }>; creator: string };
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

  /** Called every tick. Dispatches on_tick to habitat and all inner actants. */
  onTick(tick: number): void {
    this.store.setTick(tick);

    // Run habitat's own on_tick (if it has one)
    this.runHabitatOnTick();

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
            logError(this.store, id, 'on_tick', err.message);
          });
        }
      } catch (err) {
        logError(this.store, id, 'on_tick', (err as Error).message);
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
          logError(this.store, id, 'on_event', err.message);
          this.drainEventQueue(id, actant);
        });
      }
    } catch (err) {
      logError(this.store, id, 'on_event', (err as Error).message);
    }
  }

  /** Process queued events after thinking completes. */
  private drainEventQueue(id: string, actant: ActantRuntime): void {
    if (actant.eventQueue.length === 0 || actant.thinking) return;
    const next = actant.eventQueue.shift()!;
    this.fireEvent(id, actant, next);
  }

  /** Build the `me` object for an actant — dynamic sections with read/write/run + thinkAbout. */
  private buildMe(actantId: string, runtime: ActantRuntime) {
    const store = this.store;
    const hashKey = `actants/${actantId}`;
    const moduleRuntime = this.moduleRuntime;

    // Build section accessors dynamically from all hash fields
    const me: Record<string, unknown> = { id: actantId };

    const allFields = store.hgetall(hashKey);
    for (const section of Object.keys(allFields)) {
      me[section] = buildSectionAccessor(store, hashKey, section, actantId, () => me);
    }

    // thinkAbout — the core inference primitive
    me.thinkAbout = async (impulse: string) => {
      runtime.thinking = true;
      console.log(`[habitat] ${actantId} thinking: "${impulse}"`);

      try {
        // Gather all soma sections dynamically
        const soma: Record<string, string | null> = {};
        const fields = store.hgetall(hashKey);
        for (const [section, value] of Object.entries(fields)) {
          soma[section] = typeof value === 'string' ? value : JSON.stringify(value);
        }

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
        logError(store, actantId, 'thinkAbout', (err as Error).message);
        return `(error: ${(err as Error).message})`;
      } finally {
        runtime.thinking = false;
        this.drainEventQueue(actantId, runtime);
      }
    };

    return me;
  }

  /** List all actant IDs. */
  listActants(): string[] {
    return [...this.actants.keys()];
  }

  // --- Habitat tick ---

  /** Run the habitat's own on_tick handler if it exists. */
  private runHabitatOnTick(): void {
    const onTick = this.store.hget('actants/habitat', 'on_tick') as string | null;
    if (!onTick || !onTick.trim()) return;

    try {
      const me = this.buildHabitatMe();
      // Habitat on_tick gets me + moduleRuntime for direct module creation
      const fn = new Function('me', 'moduleRuntime', 'store', `return (async () => { ${onTick} })()`);
      const promise = fn(me, this.moduleRuntime, this.store);
      if (promise && typeof promise.then === 'function') {
        promise.catch((err: Error) => {
          logError(this.store, 'habitat', 'on_tick', err.message);
        });
      }
    } catch (err) {
      logError(this.store, 'habitat', 'on_tick', (err as Error).message);
    }
  }

  // --- Habitat actant ---

  /** Handle admin input — the habitat's collaborative frame. */
  async onHumanInput(input: string): Promise<string> {
    const handler = this.store.hget('actants/habitat', 'on_human_input') as string | null;

    if (!handler) {
      // Fallback if handler is missing
      return this.habitatThinkAbout(input);
    }

    try {
      const me = this.buildHabitatMe();
      const fn = new Function('me', 'input', `return (async () => { ${handler} })()`);
      const result = await fn(me, input);
      return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    } catch (err) {
      return `(habitat error: ${(err as Error).message})`;
    }
  }

  /** Build the `me` object for the habitat actant — dynamic sections, same as inhabitants. */
  private buildHabitatMe() {
    const store = this.store;
    const hashKey = 'actants/habitat';

    const me: Record<string, unknown> = { id: 'habitat' };

    const allFields = store.hgetall(hashKey);
    for (const section of Object.keys(allFields)) {
      me[section] = buildSectionAccessor(store, hashKey, section, 'habitat', () => me);
    }

    me.thinkAbout = (impulse: string) => this.habitatThinkAbout(impulse);

    return me;
  }

  /** Habitat actant's thinkAbout — sonnet, bigger context, habitat tools. */
  private async habitatThinkAbout(impulse: string): Promise<string> {
    this.habitatThinking = true;
    console.log(`[habitat] thinking: "${impulse.slice(0, 80)}"`);

    try {
      const hashKey = 'actants/habitat';
      const soma: Record<string, string | null> = {};
      const fields = this.store.hgetall(hashKey);
      for (const [section, value] of Object.entries(fields)) {
        soma[section] = typeof value === 'string' ? value : JSON.stringify(value);
      }

      // Inject live store mounts — read fresh values for each mounted key
      const mountsRaw = this.store.hget(hashKey, 'store_mounts') as string | null;
      if (mountsRaw) {
        const mounts: string[] = JSON.parse(mountsRaw);
        for (const key of mounts) {
          const t = this.store.type(key);
          if (!t) {
            soma[`live:${key}`] = '(key not found)';
            continue;
          }
          let value: unknown;
          switch (t) {
            case 'string': value = this.store.get(key); break;
            case 'list': value = this.store.lrange(key, 0, -1); break;
            case 'hash': value = this.store.hgetall(key); break;
            case 'set': value = this.store.smembers(key); break;
          }
          soma[`live:${key}`] = typeof value === 'string' ? value : JSON.stringify(value);
        }
      }

      const tools = buildToolsForHabitat(this.store);
      const store = this.store;
      const clock = this.clock;
      const moduleRuntime = this.moduleRuntime;
      const actants = this.actants;
      const self = this;

      const result = await callInference({
        soma,
        impulse,
        tools,
        model: 'claude-opus-4-6',
        maxTokens: 8192,
        maxTurns: 10,
        executeTool: (name, input) => {
          console.log(`[habitat] tool: ${name}(${JSON.stringify(input).slice(0, 80)})`);
          return executeHabitatToolCall(name, input, store, clock, moduleRuntime, actants, self);
        },
      });

      console.log(`[habitat] done (${result.usage.input}→${result.usage.output} tokens, ${result.toolsUsed.length} tools)`);
      return result.text;
    } catch (err) {
      logError(this.store, 'habitat', 'thinkAbout', (err as Error).message);
      return `(error: ${(err as Error).message})`;
    } finally {
      this.habitatThinking = false;
    }
  }
}

// --- Habitat tool building ---

function buildToolsForHabitat(store: StateStore): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = [];
  const obj = 'object' as const;

  // Soma tools — dynamic from habitat's hash fields
  // Sections like "mounted:chassis/index.ts" and "live:errors" contain colons/slashes
  // which violate the Anthropic tool name pattern ^[a-zA-Z0-9_-]{1,64}$.
  // These sections are still visible in the soma (system prompt) — they just don't
  // need read/write/run tools because the content is already in the prompt.
  const allFields = store.hgetall('actants/habitat');
  for (const section of Object.keys(allFields)) {
    if (!/^[a-zA-Z0-9_-]+$/.test(section)) continue;
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
    tools.push({
      name: `soma__run_${section}`,
      description: `Run your ${section} section as code with (me, args)`,
      input_schema: {
        type: obj,
        properties: { args: { description: 'Arguments to pass (optional)' } },
      },
    });
  }

  // Create new section
  tools.push({
    name: 'soma__create_section',
    description: 'Create a new soma section. Can hold code or data.',
    input_schema: {
      type: obj,
      properties: {
        name: { type: 'string', description: 'Section name (snake_case)' },
        content: { type: 'string', description: 'Initial content' },
      },
      required: ['name', 'content'],
    },
  });

  // Inhabitant tools
  tools.push({
    name: 'inhabitants__list',
    description: 'List all inhabitants with their identity summary',
    input_schema: { type: obj, properties: {} },
  });
  tools.push({
    name: 'inhabitants__inspect',
    description: 'Read all soma sections for an inhabitant',
    input_schema: {
      type: obj,
      properties: { id: { type: 'string', description: 'Inhabitant ID' } },
      required: ['id'],
    },
  });
  tools.push({
    name: 'inhabitants__create',
    description: 'Create a new inhabitant with initial soma sections',
    input_schema: {
      type: obj,
      properties: {
        id: { type: 'string', description: 'Unique inhabitant ID' },
        identity: { type: 'string', description: 'Identity text' },
        memory: { type: 'string', description: 'Initial memory (optional)' },
        on_tick: { type: 'string', description: 'on_tick handler source (optional)' },
        on_event: { type: 'string', description: 'on_event handler source (optional)' },
      },
      required: ['id', 'identity'],
    },
  });

  tools.push({
    name: 'inhabitants__destroy',
    description: 'Remove an inhabitant from the habitat (deletes their soma and runtime state)',
    input_schema: {
      type: obj,
      properties: { id: { type: 'string', description: 'Inhabitant ID to remove' } },
      required: ['id'],
    },
  });

  // Clock tools
  tools.push({
    name: 'clock__status',
    description: 'Get current tick number and whether the clock is running',
    input_schema: { type: obj, properties: {} },
  });
  tools.push({
    name: 'clock__pause',
    description: 'Pause the clock (ticks stop)',
    input_schema: { type: obj, properties: {} },
  });
  tools.push({
    name: 'clock__resume',
    description: 'Resume the clock (ticks start again)',
    input_schema: { type: obj, properties: {} },
  });
  tools.push({
    name: 'clock__step',
    description: 'Advance one tick manually (clock must be paused)',
    input_schema: { type: obj, properties: {} },
  });
  tools.push({
    name: 'clock__speed',
    description: 'Set the tick interval in milliseconds',
    input_schema: {
      type: obj,
      properties: { ms: { type: 'number', description: 'Milliseconds between ticks (minimum 100)' } },
      required: ['ms'],
    },
  });

  // Module tools
  tools.push({
    name: 'modules__list',
    description: 'List all loaded modules with their methods and ownership',
    input_schema: { type: obj, properties: {} },
  });
  tools.push({
    name: 'modules__inspect',
    description: 'Read a module\'s full definition including method handler source code. Only works for modules you own.',
    input_schema: {
      type: obj,
      properties: { id: { type: 'string', description: 'Module ID' } },
      required: ['id'],
    },
  });
  tools.push({
    name: 'modules__call',
    description: 'Call a method on any module as the habitat',
    input_schema: {
      type: obj,
      properties: {
        module_id: { type: 'string', description: 'Module ID' },
        method: { type: 'string', description: 'Method name' },
        input: { type: 'object', description: 'Method input (optional)' },
      },
      required: ['module_id', 'method'],
    },
  });

  // Store tools
  tools.push({
    name: 'store__keys',
    description: 'List StateStore keys matching a prefix pattern (e.g., "actants/*", "modules")',
    input_schema: {
      type: obj,
      properties: { prefix: { type: 'string', description: 'Key prefix (appends * for glob)' } },
    },
  });
  tools.push({
    name: 'store__get',
    description: 'Read a value from the StateStore by key',
    input_schema: {
      type: obj,
      properties: { key: { type: 'string', description: 'Store key' } },
      required: ['key'],
    },
  });

  // Audit tool
  tools.push({
    name: 'audit__read',
    description: 'Read recent audit trail entries',
    input_schema: {
      type: obj,
      properties: { count: { type: 'number', description: 'Number of entries (default 20)' } },
    },
  });

  // Chat shortcut
  tools.push({
    name: 'chat__read',
    description: 'Read recent chat messages',
    input_schema: {
      type: obj,
      properties: { count: { type: 'number', description: 'Number of messages (default 10)' } },
    },
  });

  // Store mounts — live views of store data injected into soma on each thinkAbout
  tools.push({
    name: 'store__mount',
    description: 'Mount a store key as a live view in your soma. The current value will be read fresh and injected as a "live:<key>" section on every thinkAbout until unmounted.',
    input_schema: {
      type: obj,
      properties: { key: { type: 'string', description: 'Store key to mount (e.g., "errors", "actants/alpha", "modules")' } },
      required: ['key'],
    },
  });
  tools.push({
    name: 'store__unmount',
    description: 'Unmount a previously mounted store key from your soma',
    input_schema: {
      type: obj,
      properties: { key: { type: 'string', description: 'Store key to unmount' } },
      required: ['key'],
    },
  });

  // Chassis introspection — mount pattern (content persists in soma until unmounted)
  tools.push({
    name: 'chassis__list_sources',
    description: 'List all source files in the habitat chassis and soma',
    input_schema: { type: obj, properties: {} },
  });
  tools.push({
    name: 'chassis__mount_source',
    description: 'Mount a source file into your soma as a section. The file contents will be visible in your soma on every subsequent thinkAbout until unmounted. Section name will be "mounted:<path>".',
    input_schema: {
      type: obj,
      properties: { path: { type: 'string', description: 'File path relative to src/ (e.g., "chassis/index.ts")' } },
      required: ['path'],
    },
  });
  tools.push({
    name: 'chassis__unmount_source',
    description: 'Unmount a previously mounted source file from your soma',
    input_schema: {
      type: obj,
      properties: { path: { type: 'string', description: 'File path to unmount' } },
      required: ['path'],
    },
  });

  return tools;
}

function executeHabitatToolCall(
  toolName: string,
  input: Record<string, unknown>,
  store: StateStore,
  clock: Clock,
  moduleRuntime: ModuleRuntime,
  actants: Map<string, ActantRuntime>,
  habitatSoma: HabitatSoma,
): unknown {
  const hashKey = 'actants/habitat';

  // Soma tools
  if (toolName.startsWith('soma__read_')) {
    const section = toolName.slice('soma__read_'.length);
    const val = store.hget(hashKey, section);
    if (val === null) return '(empty)';
    return typeof val === 'string' ? val : JSON.stringify(val);
  }
  if (toolName.startsWith('soma__write_')) {
    const section = toolName.slice('soma__write_'.length);
    store.hset(hashKey, section, input.content as string, 'habitat');
    return { ok: true };
  }
  if (toolName.startsWith('soma__run_')) {
    const section = toolName.slice('soma__run_'.length);
    const source = store.hget(hashKey, section);
    if (source === null) return { error: `Section "${section}" is empty` };
    const sourceStr = typeof source === 'string' ? source : JSON.stringify(source);
    try {
      const me: Record<string, unknown> = { id: 'habitat' };
      const allFields = store.hgetall(hashKey);
      for (const s of Object.keys(allFields)) {
        me[s] = buildSectionAccessor(store, hashKey, s, 'habitat', () => me);
      }
      const fn = new Function('me', 'args', sourceStr);
      const result = fn(me, input.args);
      return result ?? { ok: true };
    } catch (err) {
      return { error: `Run error: ${(err as Error).message}` };
    }
  }
  if (toolName === 'soma__create_section') {
    const name = input.name as string;
    const content = input.content as string;
    if (!name || content === undefined) return { error: 'Need name and content' };
    store.hset(hashKey, name, content, 'habitat');
    return { ok: true, created: name };
  }

  // Inhabitant tools
  if (toolName === 'inhabitants__list') {
    const list: Array<{ id: string; identity: string }> = [];
    for (const [id] of actants) {
      const identity = (store.hget(`actants/${id}`, 'identity') as string) || '';
      list.push({ id, identity: identity.slice(0, 100) });
    }
    return list;
  }
  if (toolName === 'inhabitants__inspect') {
    const id = input.id as string;
    if (!id) return { error: 'Need id' };
    const sections: Record<string, unknown> = {};
    for (const field of ['identity', 'memory', 'on_tick', 'on_event']) {
      sections[field] = store.hget(`actants/${id}`, field) ?? null;
    }
    const activated = store.smembers(`activations:${id}`);
    const subscriptions = store.smembers(`subscriptions:${id}`);
    return { id, sections, activated, subscriptions };
  }
  if (toolName === 'inhabitants__create') {
    const id = input.id as string;
    const identity = input.identity as string;
    if (!id || !identity) return { error: 'Need id and identity' };
    if (actants.has(id)) return { error: `Inhabitant "${id}" already exists` };
    habitatSoma.createActant(id, {
      identity,
      memory: (input.memory as string) || '',
      on_tick: input.on_tick as string | undefined,
      on_event: input.on_event as string | undefined,
    });
    // Bootstrap memory management sections
    const addMemoryCode = [
      'var log = JSON.parse(me.recent_interactions.read() || "[]");',
      'log.push(args);',
      'if (log.length > 20) log = log.slice(-20);',
      'me.recent_interactions.write(JSON.stringify(log));',
    ].join('\n');
    store.hset(`actants/${id}`, 'recent_interactions', '[]', 'habitat');
    store.hset(`actants/${id}`, 'add_memory', addMemoryCode, 'habitat');
    return { ok: true, created: id };
  }

  if (toolName === 'inhabitants__destroy') {
    const id = input.id as string;
    if (!id) return { error: 'Need id' };
    if (!actants.has(id)) return { error: `Inhabitant "${id}" not found` };
    // Remove from runtime
    actants.delete(id);
    // Remove soma from store
    store.del(`actants/${id}`, 'habitat');
    // Clean up activations and subscriptions
    store.del(`activations:${id}`, 'habitat');
    store.del(`subscriptions:${id}`, 'habitat');
    console.log(`[habitat] destroyed inhabitant "${id}"`);
    return { ok: true, destroyed: id };
  }

  // Clock tools
  if (toolName === 'clock__status') {
    return { tick: clock.now(), running: clock.isRunning() };
  }
  if (toolName === 'clock__pause') {
    clock.stop();
    return { ok: true, tick: clock.now() };
  }
  if (toolName === 'clock__resume') {
    clock.start();
    return { ok: true };
  }
  if (toolName === 'clock__step') {
    if (clock.isRunning()) return { error: 'Pause the clock first' };
    clock.step();
    return { ok: true, tick: clock.now() };
  }
  if (toolName === 'clock__speed') {
    const ms = input.ms as number;
    if (!ms || ms < 100) return { error: 'Minimum 100ms' };
    clock.setRate(ms);
    store.hset('actants/habitat', 'tick_rate', String(ms), 'habitat');
    return { ok: true, interval: ms };
  }

  // Module tools
  if (toolName === 'modules__list') {
    const ids = moduleRuntime.listModules();
    const modules: Array<{ id: string; methods: string[]; creator?: string }> = [];
    for (const id of ids) {
      const methods = moduleRuntime.getMethodDescriptions(id);
      const moduleState = store.hget('modules', id) as Record<string, unknown> | null;
      modules.push({
        id,
        methods: methods ? Object.keys(methods) : [],
        creator: moduleState?._creator as string | undefined,
      });
    }
    return modules;
  }
  if (toolName === 'modules__inspect') {
    const id = input.id as string;
    if (!id) return { error: 'Need id' };
    // Check if it's a dynamic module with a stored definition
    const def = store.hget('module-defs', id) as Record<string, unknown> | null;
    if (def) {
      return def;
    }
    // Built-in module — return method descriptions (no source access)
    const methods = moduleRuntime.getMethodDescriptions(id);
    if (!methods) return { error: `Module "${id}" not found` };
    const moduleState = store.hget('modules', id) as Record<string, unknown> | null;
    return { id, type: 'built-in', methods, creator: moduleState?._creator };
  }
  if (toolName === 'modules__call') {
    const moduleId = input.module_id as string;
    const method = input.method as string;
    const methodInput = (input.input as Record<string, unknown>) || {};
    return moduleRuntime.call(moduleId, method, methodInput, 'habitat');
  }

  // Store tools
  if (toolName === 'store__keys') {
    const prefix = (input.prefix as string) || '';
    return store.keys(prefix + '*');
  }
  if (toolName === 'store__get') {
    const key = input.key as string;
    if (!key) return { error: 'Need key' };
    const t = store.type(key);
    if (!t) return { error: 'Key not found' };
    switch (t) {
      case 'string': return store.get(key);
      case 'list': return store.lrange(key, 0, -1);
      case 'hash': return store.hgetall(key);
      case 'set': return store.smembers(key);
    }
  }

  // Audit tool
  if (toolName === 'audit__read') {
    const count = (input.count as number) || 20;
    const total = store.getAuditLength();
    const start = Math.max(0, total - count);
    return store.getAudit(start, count);
  }

  // Chat shortcut
  if (toolName === 'chat__read') {
    return moduleRuntime.call('chat', 'read', { count: input.count || 10 }, 'habitat');
  }

  // Chassis introspection
  if (toolName === 'chassis__list_sources') {
    const srcDir = 'src';
    const files: string[] = [];
    function walk(dir: string) {
      try {
        for (const entry of readdirSync(dir)) {
          const full = join(dir, entry);
          if (statSync(full).isDirectory()) {
            walk(full);
          } else if (entry.endsWith('.ts')) {
            files.push(full);
          }
        }
      } catch { /* ignore */ }
    }
    walk(srcDir);
    return files;
  }
  if (toolName === 'store__mount') {
    const key = input.key as string;
    if (!key) return { error: 'Need key' };
    // Store the mount in a list
    const mountsRaw = store.hget('actants/habitat', 'store_mounts') as string | null;
    const mounts: string[] = mountsRaw ? JSON.parse(mountsRaw) : [];
    if (!mounts.includes(key)) {
      mounts.push(key);
      store.hset('actants/habitat', 'store_mounts', JSON.stringify(mounts), 'habitat');
    }
    return { ok: true, mounted: `live:${key}`, mounts };
  }
  if (toolName === 'store__unmount') {
    const key = input.key as string;
    if (!key) return { error: 'Need key' };
    const mountsRaw = store.hget('actants/habitat', 'store_mounts') as string | null;
    const mounts: string[] = mountsRaw ? JSON.parse(mountsRaw) : [];
    const idx = mounts.indexOf(key);
    if (idx !== -1) {
      mounts.splice(idx, 1);
      store.hset('actants/habitat', 'store_mounts', JSON.stringify(mounts), 'habitat');
    }
    return { ok: true, unmounted: `live:${key}`, mounts };
  }
  if (toolName === 'chassis__mount_source') {
    const path = input.path as string;
    if (!path) return { error: 'Need path' };
    if (path.includes('..')) return { error: 'No traversal allowed' };
    const fullPath = path.startsWith('src/') ? path : join('src', path);
    try {
      const content = readFileSync(fullPath, 'utf-8');
      const sectionName = `mounted:${path}`;
      store.hset('actants/habitat', sectionName, content, 'habitat');
      return { ok: true, mounted: sectionName, chars: content.length };
    } catch (err) {
      return { error: `Could not read: ${(err as Error).message}` };
    }
  }
  if (toolName === 'chassis__unmount_source') {
    const path = input.path as string;
    if (!path) return { error: 'Need path' };
    const sectionName = `mounted:${path}`;
    store.hdel('actants/habitat', sectionName, 'habitat');
    return { ok: true, unmounted: sectionName };
  }

  return { error: `Unknown tool: ${toolName}` };
}

// --- Error logging ---

/** Log an error to the store — global list + per-actant list + console. */
function logError(
  store: StateStore,
  actantId: string,
  context: string,
  message: string,
): void {
  const tick = parseInt(store.get('habitat/clock/tick') || '0', 10);
  const entry = { tick, actant: actantId, context, message, ts: Date.now() };
  store.rpush('errors', entry, 'habitat');
  store.rpush(`errors:${actantId}`, entry, 'habitat');
  // Cap at 100 entries each
  if (store.llen('errors') > 100) store.ltrim('errors', -100, -1, 'habitat');
  if (store.llen(`errors:${actantId}`) > 50) store.ltrim(`errors:${actantId}`, -50, -1, 'habitat');
  console.error(`[habitat] ${actantId} ${context}: ${message}`);
}

// --- Section accessor ---

/**
 * Build a section accessor with read/write/run for a soma section.
 * `run(args?)` compiles the section content as `function(me, args) { ... }` and executes it.
 */
function buildSectionAccessor(
  store: StateStore,
  hashKey: string,
  section: string,
  actantId: string,
  getMe: () => Record<string, unknown>,
) {
  return {
    read: (): string => {
      const val = store.hget(hashKey, section);
      if (val === null) return '';
      return typeof val === 'string' ? val : JSON.stringify(val);
    },
    write: (value: string): void => {
      store.hset(hashKey, section, value, actantId);
    },
    run: (args?: unknown): unknown => {
      const source = store.hget(hashKey, section);
      if (source === null || source === undefined) {
        throw new Error(`Section "${section}" is empty, cannot run`);
      }
      const sourceStr = typeof source === 'string' ? source : JSON.stringify(source);
      try {
        const fn = new Function('me', 'args', sourceStr);
        return fn(getMe(), args);
      } catch (err) {
        throw new Error(`Error running ${section}: ${(err as Error).message}`);
      }
    },
  };
}

// --- Inhabitant tool building ---

function buildToolsForActant(
  actantId: string,
  store: StateStore,
  moduleRuntime: ModuleRuntime,
): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = [];
  const obj = 'object' as const;

  // Soma section tools — dynamic, from whatever fields exist in the hash
  // Skip sections with names that would produce invalid Anthropic tool names
  // (e.g., "mounted:" or "live:" prefixed sections with colons/slashes)
  const allFields = store.hgetall(`actants/${actantId}`);
  for (const section of Object.keys(allFields)) {
    if (!/^[a-zA-Z0-9_-]+$/.test(section)) continue;
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
    tools.push({
      name: `soma__run_${section}`,
      description: `Run your ${section} section as code. The content is compiled as a function body with (me, args) and executed.`,
      input_schema: {
        type: obj,
        properties: { args: { description: 'Arguments to pass to the function (optional)' } },
      },
    });
  }

  // Create new soma section
  tools.push({
    name: 'soma__create_section',
    description: 'Create a new soma section. Can hold code or data — you decide what to write to it.',
    input_schema: {
      type: obj,
      properties: {
        name: { type: 'string', description: 'Section name (snake_case)' },
        content: { type: 'string', description: 'Initial content (code or data)' },
      },
      required: ['name', 'content'],
    },
  });

  // Inhabitant tools from habitat soma — event tools, module lifecycle, etc.
  const inhabitantToolsRaw = store.hget('actants/habitat', 'inhabitant_tools');
  if (inhabitantToolsRaw) {
    const inhabitantTools = JSON.parse(
      typeof inhabitantToolsRaw === 'string' ? inhabitantToolsRaw : JSON.stringify(inhabitantToolsRaw),
    ) as Array<{ name: string; description: string; input_schema: Record<string, unknown> }>;
    for (const tool of inhabitantTools) {
      tools.push({
        name: tool.name,
        description: tool.description,
        input_schema: tool.input_schema as Anthropic.Tool.InputSchema,
      });
    }
  }

  // Module tools from activated modules — no special cases
  const activated = store.smembers(`activations:${actantId}`);
  for (const moduleId of activated) {
    const schemas = moduleRuntime.getMethodSchemas(moduleId);
    if (!schemas) continue;
    for (const [method, info] of Object.entries(schemas)) {
      const schema = info.input_schema || { type: 'object', properties: {} };
      if (schema.type !== 'object') {
        console.error(`[habitat] skipping tool ${moduleId}__${method}: input_schema.type must be 'object', got '${schema.type || 'undefined'}'`);
        continue;
      }
      tools.push({
        name: `${moduleId}__${method}`,
        description: `[${moduleId}] ${info.description}`,
        input_schema: schema as Anthropic.Tool.InputSchema,
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

  // Soma tools: soma__read_<section> / soma__write_<section> / soma__run_<section>
  if (toolName.startsWith('soma__read_')) {
    const section = toolName.slice('soma__read_'.length);
    const val = store.hget(hashKey, section);
    if (val === null) return '(empty)';
    return typeof val === 'string' ? val : JSON.stringify(val);
  }
  if (toolName.startsWith('soma__write_')) {
    const section = toolName.slice('soma__write_'.length);
    store.hset(hashKey, section, input.content as string, actantId);
    return { ok: true };
  }
  if (toolName.startsWith('soma__run_')) {
    const section = toolName.slice('soma__run_'.length);
    const source = store.hget(hashKey, section);
    if (source === null) return { error: `Section "${section}" is empty` };
    const sourceStr = typeof source === 'string' ? source : JSON.stringify(source);
    try {
      // Build a temporary me with section accessors
      const me: Record<string, unknown> = { id: actantId };
      const allFields = store.hgetall(hashKey);
      for (const s of Object.keys(allFields)) {
        me[s] = buildSectionAccessor(store, hashKey, s, actantId, () => me);
      }
      const fn = new Function('me', 'args', sourceStr);
      const result = fn(me, input.args);
      return result ?? { ok: true };
    } catch (err) {
      return { error: `Run error: ${(err as Error).message}` };
    }
  }
  if (toolName === 'soma__create_section') {
    const name = input.name as string;
    const content = input.content as string;
    if (!name || content === undefined) return { error: 'Need name and content' };
    store.hset(hashKey, name, content, actantId);
    return { ok: true, created: name };
  }

  // Inhabitant tools — dispatched from habitat soma section
  const inhabitantToolsRaw = store.hget('actants/habitat', 'inhabitant_tools');
  if (inhabitantToolsRaw) {
    const inhabitantTools = JSON.parse(
      typeof inhabitantToolsRaw === 'string' ? inhabitantToolsRaw : JSON.stringify(inhabitantToolsRaw),
    ) as Array<{ name: string; handler: string }>;
    const toolDef = inhabitantTools.find(t => t.name === toolName);
    if (toolDef) {
      try {
        const fn = new Function('actantId', 'input', 'store', 'moduleRuntime', toolDef.handler);
        return fn(actantId, input, store, moduleRuntime);
      } catch (err) {
        return { error: `Tool handler error: ${(err as Error).message}` };
      }
    }
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

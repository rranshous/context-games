/**
 * Module Runtime — loads modules, dispatches method calls through the VM runner.
 *
 * Part of the habitat actant's soma. Defines how the inner world
 * hosts and executes modules.
 */

import { StateStore } from '../chassis/statestore.js';
import { scanSource, runHandler } from '../chassis/vm-runner.js';

// --- Module Definition ---

export interface MethodDef {
  description: string;
  handler: string; // function body as source string
}

export interface ModuleDefinition {
  id: string;
  name: string;
  init: () => unknown;
  methods: Record<string, MethodDef>;
  emits?: string[];
  on?: Record<string, string>; // event -> handler source
}

// --- Module Runtime ---

export class ModuleRuntime {
  private modules = new Map<string, ModuleDefinition>();
  private store: StateStore;
  private onEvent: (moduleId: string, event: string, data: unknown) => void;

  constructor(
    store: StateStore,
    onEvent: (moduleId: string, event: string, data: unknown) => void,
  ) {
    this.store = store;
    this.onEvent = onEvent;
  }

  /** Load a module definition. Initializes state if none exists in the store. */
  loadModule(def: ModuleDefinition): void {
    // AST scan all method handlers
    for (const [name, method] of Object.entries(def.methods)) {
      const violations = scanSource(method.handler);
      if (violations.length > 0) {
        throw new Error(
          `Module "${def.id}" method "${name}" uses forbidden tokens: ${violations.join(', ')}`,
        );
      }
    }

    // Scan event handlers too
    if (def.on) {
      for (const [event, handler] of Object.entries(def.on)) {
        const violations = scanSource(handler);
        if (violations.length > 0) {
          throw new Error(
            `Module "${def.id}" event handler "${event}" uses forbidden tokens: ${violations.join(', ')}`,
          );
        }
      }
    }

    this.modules.set(def.id, def);

    // Initialize state if this module has no state in the store yet
    if (this.store.hget('modules', def.id) === null) {
      const initialState = def.init();
      this.store.hset('modules', def.id, initialState, 'module-runtime');
      console.log(`[module-runtime] initialized module "${def.id}"`);
    } else {
      console.log(`[module-runtime] loaded module "${def.id}" (existing state)`);
    }
  }

  /** Call a method on a module. Returns the result. */
  call(moduleId: string, method: string, input: unknown, caller: string): unknown {
    const def = this.modules.get(moduleId);
    if (!def) return { error: `Module "${moduleId}" not found` };

    const methodDef = def.methods[method];
    if (!methodDef) return { error: `Method "${method}" not found on module "${moduleId}"` };

    // Get current state
    const state = this.store.hget('modules', moduleId);

    // Run handler in VM
    const result = runHandler(methodDef.handler, state, input, caller);

    // Apply state update
    this.store.hset('modules', moduleId, result.state, caller);

    // Dispatch emitted events
    if (result.emit) {
      for (const { event, data } of result.emit) {
        this.onEvent(moduleId, event, data);
      }
    }

    return result.result;
  }

  /** Dispatch an event to all modules that subscribe to it. */
  dispatchEvent(event: string, payload: { emitter: string; data: unknown }): void {
    for (const [moduleId, def] of this.modules) {
      if (!def.on || !def.on[event]) continue;

      const state = this.store.hget('modules', moduleId);
      const result = runHandler(def.on[event], state, payload, 'bus');

      // Event handlers can only update state, not return results
      this.store.hset('modules', moduleId, result.state, 'bus');
    }
  }

  /** Get list of loaded module IDs. */
  listModules(): string[] {
    return [...this.modules.keys()];
  }

  /** Get method descriptions for a module (for building tool surfaces). */
  getMethodDescriptions(moduleId: string): Record<string, string> | null {
    const def = this.modules.get(moduleId);
    if (!def) return null;
    const descriptions: Record<string, string> = {};
    for (const [name, method] of Object.entries(def.methods)) {
      descriptions[name] = method.description;
    }
    return descriptions;
  }
}

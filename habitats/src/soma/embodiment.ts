/**
 * Embodiment — how an actant experiences itself.
 *
 * This file defines what `me` looks like for both inhabitants and the habitat.
 * When an actant's handler runs, it receives `me` — an object built from
 * its soma sections in the StateStore.
 *
 * ## What `me` has
 *
 * me.id — string, read-only. The actant's unique identifier.
 *
 * me.<section> — for every section in the actant's soma hash:
 *   .read()       — returns the section content as a string
 *   .write(str)   — replaces the section content
 *   .run(args?)   — compiles the content as a JS function body and executes it:
 *                    new Function('me', 'args', content)(me, args)
 *                    The function has access to `me` (all sections) and `args`.
 *
 * me.thinkAbout(impulse) — async. Calls the inference API with:
 *   - system prompt: all soma sections serialized as XML tags
 *   - user prompt: the impulse string
 *   - tools: soma read/write/run for each section, plus activated module methods,
 *            plus inhabitant tools from the habitat's soma
 *   Returns the model's final text response. Tool calls are executed automatically
 *   in an agentic loop (up to maxTurns).
 *
 * ## Sections are dynamic
 *
 * There is no fixed list of sections. Whatever fields exist in the actant's
 * StateStore hash (`actants/{id}`) become sections on `me`. New sections can
 * be created during thinkAbout via the `soma__create_section` tool.
 *
 * ## What `me` does NOT have
 *
 * - No clock access. Clock is habitat infrastructure (use thinkAbout tools: clock__*).
 * - No direct store access. The StateStore is internal (habitat can use store__* tools).
 * - No module runtime. Module methods are available as tools during thinkAbout,
 *   or through the `habitat` surface in on_tick/on_event handlers.
 * - No reference to other actants. You can't read another actant's soma from `me`.
 *
 * ## Handler contexts
 *
 * Different handlers receive different arguments:
 *
 * Inhabitant on_tick:    (me, habitat)  — habitat is the bound surface with modules, events, clock
 * Inhabitant on_event:   (me, habitat, event)  — event is { name, emitter, data }
 * Habitat on_human_input: (me, input)  — input is the admin's text
 * Habitat on_tick:       (me, moduleRuntime, store)  — direct infrastructure access
 */

import { StateStore } from '../chassis/statestore.js';

/**
 * Build a section accessor — the uniform API for every soma section.
 *
 * read()      — returns content as string (empty string if null)
 * write(str)  — replaces content in the StateStore
 * run(args?)  — compiles content as function(me, args) { <content> } and calls it
 */
export function buildSectionAccessor(
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

/**
 * Build the `me` object for any actant from its soma hash.
 *
 * Iterates all fields in the hash and creates a section accessor for each.
 * The result has me.id (string) + me.<section>.read/write/run for every section.
 *
 * thinkAbout is NOT included here — it's added by the caller because it
 * needs access to the inference loop, tool building, and runtime state
 * that differ between inhabitants and the habitat.
 */
export function buildMeFromHash(
  store: StateStore,
  hashKey: string,
  actantId: string,
): Record<string, unknown> {
  const me: Record<string, unknown> = { id: actantId };

  const allFields = store.hgetall(hashKey);
  for (const section of Object.keys(allFields)) {
    me[section] = buildSectionAccessor(store, hashKey, section, actantId, () => me);
  }

  return me;
}

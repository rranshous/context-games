// Rulebooks: the rules of a game many ludants can play together, run where nobody can
// bend them. A rulebook is plain JavaScript that defines five functions:
//
//   init(seed, options)              -> state          a new match
//   join(state, player, request)     -> state          someone takes a place (throw to refuse)
//   move(state, player, action)      -> state          someone acts (throw to refuse)
//   view(state, player)              -> anything       what that player may see (player null: an onlooker)
//   result(state)                    -> null | { winners?: [player id], ... }   over yet?
//
// result is null while the match goes on. Once it's over, anything the rules like, plus,
// for standings across matches (and across every fork that plays the same rulebook),
// winners: the ids of the players who won ([] for a draw). Without it, a rulebook simply
// has no standings: a shared canvas never ends, and needs none.
// player is { id, name } (id: the person, the same in every match). Everything in and out
// is JSON. It runs in QuickJS (WebAssembly), the same in Node and in a Worker (which can't
// eval), and each call gets a fresh context: the rulebook keeps nothing between calls but
// the state it returns, so the same calls always give the same answers. It has no clock,
// no network, and no randomness but its seed: random(n) -> [a number in [0, 1), the next n]
// is there for keeping a generator in the state.
//
// Work is counted in steps: QuickJS stops to ask whether to go on about every 5,000 simple
// operations, and each ask is a step (a call costs at least 1). Steps, not the clock, are
// the limit: a Worker's clock stands still while code runs, and a count cuts off at the
// same place everywhere.
//
//   const rules = await createRules(wasmModule)   // a compiled quickjs.wasm (vendor/quickjs)
//   rules.call(source, 'move', [state, player, action])  -> { value, steps }
//       or throws a RuleError { kind: 'refused' (the rules said no) | 'broken', line?, column?, steps }
//   rules.check(source)                                    -> [missing function names]

import { newQuickJSWASMModuleFromVariant, newVariant } from './vendor/quickjs/index.mjs';

export const RULE_FUNCTIONS = ['init', 'join', 'move', 'view', 'result'];
export const MAX_STEPS = 1000;   // a call's steps: about 5 million simple operations
const MAX_MEMORY = 16 * 1024 * 1024;
const MAX_STACK = 512 * 1024;
const MAX_DEPTH = 200;      // nesting of what comes out (deeper can bring QuickJS down)
// Where the clock moves while code runs (Node), a call's time at most. The interpreter only
// asks between operations, so one built-in on big data (indexOf over megabytes) can still
// run seconds past it; hosted, that holds up only its own match's object.
const MAX_WALL_MS = 3000;

// What every rulebook starts with: no clock, no Math.random, and a seeded generator. Its
// way in and out (JSON) is kept where the rulebook can't replace it.
const PRELUDE = `"use strict";
Object.defineProperty(globalThis, '__json', { value: Object.freeze({ parse: JSON.parse.bind(JSON), stringify: JSON.stringify.bind(JSON) }) });
Math.random = () => { throw new Error('rules have no randomness but their seed: keep random(n) in the state'); };
globalThis.Date = undefined;
globalThis.random = (n) => {
  let t = (Number(n) + 0x6D2B79F5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, t];
};
`;
const PRELUDE_LINES = PRELUDE.split('\n').length - 1;

export class RuleError extends Error {
  constructor(message, { kind, line, column, steps }) { super(message); Object.assign(this, { kind, line, column, steps }); }
}

/** How deeply a JSON text nests (strings skipped), without parsing it. */
function depthOf(text) {
  let depth = 0, most = 0, inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (inString) { if (c === 92) i++; else if (c === 34) inString = false; continue; }
    if (c === 34) inString = true;
    else if (c === 91 || c === 123) { if (++depth > most) most = depth; }
    else if (c === 93 || c === 125) depth--;
  }
  return most;
}

export async function createRules(wasmModule) {
  const load = () => newQuickJSWASMModuleFromVariant(newVariant({
    type: 'sync',
    importFFI: () => import('./vendor/quickjs/ffi.mjs').then((m) => m.QuickJSFFI),
    importModuleLoader: () => import('./vendor/quickjs/emscripten-module.mjs').then((m) => m.default),
  }, { wasmModule }));
  let quickjs = await load();
  // A rulebook that brings the WebAssembly itself down (an abort, not an error) leaves the
  // module unusable: the next call gets a fresh one, so one rulebook can't break the others.
  let reloading = null;
  const reload = () => (reloading ??= load().then((q) => { quickjs = q; reloading = null; }));

  /** Run code in a fresh context; the code's value is a JSON string. -> { value, steps } */
  function run(source, tail, input) {
    if (reloading) throw new RuleError('the rules engine is restarting; try again in a moment', { kind: 'broken', steps: 0 });
    try { return runIn(source, tail, input); } catch (err) {
      if (err instanceof RuleError) throw err;
      // Not the rules' error but the engine's (an abort, a host stack overflow): it was this
      // rulebook that did it, so it's broken, and the engine starts fresh.
      reload();
      throw new RuleError(`the rules broke the engine running them (${String(err?.message ?? err).slice(0, 120)}); nest less deeply, or build less`, { kind: 'broken', steps: MAX_STEPS });
    }
  }

  function runIn(source, tail, input) {
    const runtime = quickjs.newRuntime();
    runtime.setMemoryLimit(MAX_MEMORY);
    runtime.setMaxStackSize(MAX_STACK);
    let steps = 0;
    const began = Date.now();
    runtime.setInterruptHandler(() => ++steps > MAX_STEPS || Date.now() - began > MAX_WALL_MS);
    const vm = runtime.newContext();
    try {
      const inp = vm.newString(JSON.stringify(input));
      vm.setProp(vm.global, '__input', inp);
      inp.dispose();
      const out = vm.evalCode(`${PRELUDE}${source}\n;${tail}`, 'rulebook.js');
      steps = Math.max(1, steps);
      if (out.error) {
        const err = vm.dump(out.error);
        out.error.dispose();
        if (steps > MAX_STEPS || Date.now() - began > MAX_WALL_MS) throw new RuleError(`the rules ran too long (over ${MAX_STEPS} steps, or ${MAX_WALL_MS / 1000} seconds, in one call)`, { kind: 'broken', steps: Math.max(steps, MAX_STEPS) });
        const message = typeof err === 'object' && err ? String(err.message ?? JSON.stringify(err)) : String(err);
        // Where in the rulebook it happened, in the rulebook's own lines.
        const at = String(err?.stack ?? '').match(/rulebook\.js:(\d+):(\d+)/);
        const line = at ? Number(at[1]) - PRELUDE_LINES : undefined;
        const kind = /out of memory|stack overflow/.test(message) || /^(SyntaxError|ReferenceError|TypeError|RangeError|InternalError)$/.test(err?.name ?? '') ? 'broken' : 'refused';
        throw new RuleError(message, { kind, steps, ...(line > 0 ? { line, column: Number(at[2]) } : {}) });
      }
      const text = vm.dump(out.value);
      out.value.dispose();
      if (text !== undefined && typeof text !== 'string') throw new RuleError('the rules gave back something that isn\'t JSON', { kind: 'broken', steps });
      if (text !== undefined && depthOf(text) > MAX_DEPTH) throw new RuleError(`what the rules gave back nests over ${MAX_DEPTH} deep`, { kind: 'broken', steps });
      return { value: text === undefined ? undefined : JSON.parse(text), steps };
    } finally {
      vm.dispose();
      runtime.dispose();
    }
  }

  return {
    call(source, fn, args) {
      if (!RULE_FUNCTIONS.includes(fn)) throw new RuleError(`no rule ${fn}`, { kind: 'broken', steps: 0 });
      return run(source, `(() => { const v = ${fn}(...__json.parse(__input)); return v === undefined ? undefined : __json.stringify(v); })()`, args);
    },
    check(source) {
      return run(source, `__json.stringify(${JSON.stringify(RULE_FUNCTIONS)}.filter((f) => { try { return typeof eval(f) !== 'function'; } catch { return true; } }))`, null).value;
    },
  };
}

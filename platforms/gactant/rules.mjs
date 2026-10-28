// Rulebooks: the rules of a game many ludants can play together, run where nobody can
// bend them. A rulebook is plain JavaScript that defines five functions:
//
//   init(seed, options)              -> state          a new match
//   join(state, player, request)     -> state          someone takes a place (throw to refuse)
//   move(state, player, action)      -> state          someone acts (throw to refuse)
//   view(state, player)              -> anything       what that player may see (player null: an onlooker)
//   result(state)                    -> null | { winner?, draw?, ... }   over yet?
//
// player is { id, name } (id: the person, the same in every match). Everything in and out
// is JSON. It runs in QuickJS (WebAssembly), the same in Node and in a Worker (which can't
// eval), and each call gets a fresh context: the rulebook keeps nothing between calls but
// the state it returns, so the same calls always give the same answers. It has no clock,
// no network, and no randomness but its seed: random(n) -> [a number in [0, 1), the next n]
// is there for keeping a generator in the state.
//
//   const rules = await createRules(wasmModule)   // a compiled quickjs.wasm (vendor/quickjs)
//   rules.call(source, 'move', [state, player, action])  -> value, or throws { refused: message }
//   rules.check(source)                                    -> [missing function names]

import { newQuickJSWASMModuleFromVariant, newVariant } from './vendor/quickjs/index.mjs';

export const RULE_FUNCTIONS = ['init', 'join', 'move', 'view', 'result'];
const MAX_MEMORY = 16 * 1024 * 1024;
const MAX_STACK = 512 * 1024;
// QuickJS asks whether to stop every so often while it runs (about every 10,000 steps).
// Counting those asks, not the clock, is the limit: a Worker's clock stands still while
// code runs, and a count cuts off at the same place everywhere.
const MAX_CHECKS = 1000;

// What every rulebook starts with: no clock, no Math.random, and a seeded generator.
const PRELUDE = `
"use strict";
Math.random = () => { throw new Error('rules have no randomness but their seed: keep random(n) in the state'); };
globalThis.Date = undefined;
globalThis.random = (n) => {
  let t = (Number(n) + 0x6D2B79F5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, t];
};
`;

export class RuleError extends Error {
  constructor(message, kind) { super(message); this.kind = kind; }   // kind: 'refused' (the rules said no) or 'broken'
}

export async function createRules(wasmModule) {
  const quickjs = await newQuickJSWASMModuleFromVariant(newVariant({
    type: 'sync',
    importFFI: () => import('./vendor/quickjs/ffi.mjs').then((m) => m.QuickJSFFI),
    importModuleLoader: () => import('./vendor/quickjs/emscripten-module.mjs').then((m) => m.default),
  }, { wasmModule }));

  /** Run code in a fresh context; the code's value is a JSON string. */
  function run(source, tail, input) {
    const runtime = quickjs.newRuntime();
    runtime.setMemoryLimit(MAX_MEMORY);
    runtime.setMaxStackSize(MAX_STACK);
    let checks = 0;
    runtime.setInterruptHandler(() => ++checks > MAX_CHECKS);
    const vm = runtime.newContext();
    try {
      const inp = vm.newString(JSON.stringify(input));
      vm.setProp(vm.global, '__input', inp);
      inp.dispose();
      const out = vm.evalCode(`${PRELUDE}\n${source}\n;${tail}`, 'rulebook.js');
      if (out.error) {
        const err = vm.dump(out.error);
        out.error.dispose();
        if (checks > MAX_CHECKS) throw new RuleError('the rules ran too long', 'broken');
        const message = typeof err === 'object' && err ? String(err.message ?? JSON.stringify(err)) : String(err);
        throw new RuleError(message, /out of memory|stack overflow|SyntaxError|ReferenceError|TypeError/.test(`${err?.name} ${message}`) ? 'broken' : 'refused');
      }
      const text = vm.dump(out.value);
      out.value.dispose();
      return text === undefined ? undefined : JSON.parse(text);
    } finally {
      vm.dispose();
      runtime.dispose();
    }
  }

  return {
    call(source, fn, args) {
      if (!RULE_FUNCTIONS.includes(fn)) throw new RuleError(`no rule ${fn}`, 'broken');
      return run(source, `(() => { const v = ${fn}(...JSON.parse(__input)); return v === undefined ? undefined : JSON.stringify(v); })()`, args);
    },
    check(source) {
      return run(source, `JSON.stringify(${JSON.stringify(RULE_FUNCTIONS)}.filter((f) => { try { return typeof eval(f) !== 'function'; } catch { return true; } }))`, null);
    },
  };
}

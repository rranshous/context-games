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
// is there for keeping a generator in the state (see random below).
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
const MAX_MESSAGE = 2_000;    // characters of an error the rules throw
const MAX_MEMORY = 16 * 1024 * 1024;
const MAX_STACK = 512 * 1024;
const MAX_DEPTH = 200;      // nesting of what comes out (deeper can bring QuickJS down)
const MAX_RANDOM_STATE = 200; // characters of JSON in what random is given
// Where the clock moves while code runs (Node), a call's time at most. The interpreter only
// asks between operations, so one built-in on big data (indexOf over megabytes) can still
// run seconds past it; hosted, that holds up only its own match's object.
const MAX_WALL_MS = 3000;

// What every rulebook starts with: no clock, no Math.random, and random (worked out by the
// host: __random, taken away once random has it). Its way in and out (JSON) is kept where
// the rulebook can't replace it.
const PRELUDE = `"use strict";
Object.defineProperty(globalThis, '__json', { value: Object.freeze({ parse: JSON.parse.bind(JSON), stringify: JSON.stringify.bind(JSON) }) });
Math.random = () => { throw new Error('rules have no randomness but their seed: keep random(n) in the state'); };
globalThis.Date = undefined;
globalThis.random = ((host) => (n) => {
  const s = __json.stringify(n === undefined ? null : n);
  if (s.length > ${MAX_RANDOM_STATE}) throw new Error('random(n): n is the seed, or the next state random last gave back');
  return __json.parse(host(s));
})(globalThis.__random);
delete globalThis.__random;
`;
const PRELUDE_LINES = PRELUDE.split('\n').length - 1;

// The generator: random(n) -> [x in [0, 1), next]. Its state is 256 bits (64 hex characters);
// anything else it's given (a seed: 78 random digits in a match) is hashed into one. x is the
// first 53 bits of SHA-256(state, x) and next is SHA-256(state, next), so nothing anyone sees
// of what's dealt tells them the state, or what comes next. Worked out here rather than in
// QuickJS, so it costs a rulebook no steps.
export function random(text) {
  const hex = /^"[0-9a-f]{64}"$/.test(text) ? text.slice(1, -1) : toHex(sha256(`gactant/random\n${text}`));
  const out = sha256(`${hex}\nx`);
  return JSON.stringify([(out[0] * 2 ** 21 + (out[1] >>> 11)) / 2 ** 53, toHex(sha256(`${hex}\nnext`))]);
}
const toHex = (words) => Array.from(words, (w) => (w >>> 0).toString(16).padStart(8, '0')).join('');
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
/** SHA-256 of a string's UTF-8, as eight 32-bit words (synchronous: a Worker's crypto isn't). */
function sha256(str) {
  const bytes = new TextEncoder().encode(str);
  const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const bits = bytes.length * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bits / 2 ** 32));
  view.setUint32(padded.length - 4, bits >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = w[i - 16] + s0 + w[i - 7] + s1;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i];
      const t2 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  return h;
}

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
      const rnd = vm.newFunction('__random', (t) => vm.newString(random(vm.getString(t))));
      vm.setProp(vm.global, '__random', rnd);
      rnd.dispose();
      const out = vm.evalCode(`${PRELUDE}${source}\n;${tail}`, 'rulebook.js');
      steps = Math.max(1, steps);
      if (out.error) {
        const err = vm.dump(out.error);
        out.error.dispose();
        if (steps > MAX_STEPS || Date.now() - began > MAX_WALL_MS) throw new RuleError(`the rules ran too long (over ${MAX_STEPS} steps, or ${MAX_WALL_MS / 1000} seconds, in one call)`, { kind: 'broken', steps: Math.max(steps, MAX_STEPS) });
        // What it said, cut short: an error is a message, not a way around the size of a view.
        const message = (typeof err === 'object' && err ? String(err.message ?? JSON.stringify(err)) : String(err)).slice(0, MAX_MESSAGE);
        // Where in the rulebook it happened, in the rulebook's own lines.
        const at = String(err?.stack ?? '').slice(0, MAX_MESSAGE).match(/rulebook\.js:(\d+):(\d+)/);
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

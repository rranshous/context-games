/**
 * VM Runner — sandboxed code execution for module handlers.
 *
 * Two layers:
 * 1. AST scan at load time — reject code that tries to escape (import, require, fetch, etc.)
 * 2. Stripped vm.createContext at runtime — handler runs with only basic JS globals.
 *
 * The handler receives a structuredClone of state. Even if it mutates the clone,
 * the real state is untouched. Only the return value is applied.
 */

import * as vm from 'node:vm';
// Tokens that signal escape attempts. Not security — just a lint.
const FORBIDDEN_TOKENS = [
  'import',
  'require',
  'fetch',
  'XMLHttpRequest',
  'process',
  'global',
  'globalThis',
  'eval',
  'Function',
  'window',
  'document',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'queueMicrotask',
  '__dirname',
  '__filename',
];

export interface HandlerResult {
  state: unknown;
  result: unknown;
  emit?: Array<{ event: string; data: unknown }>;
}

/**
 * Scan handler source for forbidden tokens.
 * Fast fail at load time — not security, just catches honest mistakes.
 */
export function scanSource(source: string): string[] {
  const violations: string[] = [];
  for (const token of FORBIDDEN_TOKENS) {
    // Match as whole word to avoid false positives (e.g., "processing" matching "process")
    const regex = new RegExp(`\\b${token}\\b`);
    if (regex.test(source)) {
      violations.push(token);
    }
  }
  return violations;
}

// Shared minimal context — frozen, reused across calls.
const BASE_GLOBALS = Object.freeze({
  structuredClone,
  JSON,
  Math,
  Array,
  Object,
  String,
  Number,
  Boolean,
  Map,
  Set,
  Date,
  RegExp,
  Error,
  TypeError,
  RangeError,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  undefined,
  NaN,
  Infinity,
  console: Object.freeze({
    log: (...args: unknown[]) => console.log('[vm]', ...args),
    warn: (...args: unknown[]) => console.warn('[vm]', ...args),
    error: (...args: unknown[]) => console.error('[vm]', ...args),
  }),
});

/**
 * Run a module handler in a sandboxed VM context.
 *
 * @param source - The handler function body as a string
 * @param state - Module state (will be cloned before passing to handler)
 * @param input - The method input
 * @param caller - Caller identity (trustable, stamped by runtime)
 * @param timeoutMs - Execution timeout (default 1000ms)
 */
export function runHandler(
  source: string,
  state: unknown,
  input: unknown,
  caller: string,
  timeoutMs = 1000,
): HandlerResult {
  // Clone state so handler can't mutate the original
  const stateClone = structuredClone(state);

  const context = vm.createContext({
    ...BASE_GLOBALS,
    __state: stateClone,
    __input: input,
    __caller: caller,
    __result: undefined as unknown,
  });

  // Wrap source in a function call that captures the return value
  const wrapped = `
    __result = (function(state, input, caller) {
      ${source}
    })(__state, __input, __caller);
  `;

  try {
    vm.runInContext(wrapped, context, { timeout: timeoutMs });
  } catch (err) {
    if (err instanceof Error && err.message.includes('Script execution timed out')) {
      return { state, result: { error: 'Handler timed out' } };
    }
    return { state, result: { error: `Handler error: ${(err as Error).message}` } };
  }

  const handlerResult = context.__result as HandlerResult | null;

  // Validate return shape
  if (!handlerResult || typeof handlerResult !== 'object' || !('state' in handlerResult)) {
    return { state, result: { error: 'Handler must return { state, result }' } };
  }

  return {
    state: handlerResult.state,
    result: handlerResult.result,
    emit: Array.isArray(handlerResult.emit) ? handlerResult.emit : undefined,
  };
}

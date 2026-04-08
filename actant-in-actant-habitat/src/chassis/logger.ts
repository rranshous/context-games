/**
 * Logger — gated console output for watch mode.
 *
 * By default, habitat tick output is suppressed in REPL mode.
 * Toggle with `watch` command. Non-interactive mode always shows output.
 */

const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

let watching = false;
let interactive = false;

/** Enable the watch gate (only suppresses in interactive mode). */
export function enableGate(): void {
  interactive = true;

  console.log = (...args: unknown[]) => {
    if (!interactive || watching) {
      originalLog(...args);
    }
  };

  // Errors always show
  console.error = originalError;
  console.warn = originalWarn;
}

/** Print directly to stdout, bypassing the watch gate. */
export function print(...args: unknown[]): void {
  originalLog(...args);
}

/** Toggle watch mode. Returns new state. */
export function toggleWatch(): boolean {
  watching = !watching;
  return watching;
}

export function isWatching(): boolean {
  return watching;
}

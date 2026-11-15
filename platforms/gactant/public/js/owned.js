// Timers that belong to a piece of a ludant's code, so they stop when that code is replaced.
// A game that starts a setInterval when it's built would otherwise keep it running after
// every rewrite, and with it the old game and everything it holds: each edit leaving one
// more game alive is how a tab grows. Timers made while code runs `within` a life belong to
// it (and the timers their callbacks make, so a setTimeout chain stays in it); `end` clears
// them all. Only the sandbox imports this: it replaces the sandbox's own timer functions.

let current = null;

/** A fresh life: give it to within, then to end when its code is replaced. */
export const life = () => ({ timeouts: new Set(), intervals: new Set(), frames: new Set(), ended: false });

/** Run fn with timers it makes belonging to a life. */
export function within(l, fn, ...args) {
  const prev = current;
  current = l;
  try { return fn(...args); } finally { current = prev; }
}

/** Stop every timer a life still has. */
export function end(l) {
  if (!l || l.ended) return;
  l.ended = true;
  for (const id of l.timeouts) nativeClearTimeout(id);
  for (const id of l.intervals) nativeClearInterval(id);
  for (const id of l.frames) nativeCancelFrame?.(id);
  l.timeouts.clear(); l.intervals.clear(); l.frames.clear();
}

const nativeSetTimeout = globalThis.setTimeout.bind(globalThis);
const nativeClearTimeout = globalThis.clearTimeout.bind(globalThis);
const nativeSetInterval = globalThis.setInterval.bind(globalThis);
const nativeClearInterval = globalThis.clearInterval.bind(globalThis);
const nativeFrame = globalThis.requestAnimationFrame?.bind(globalThis);
const nativeCancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis);

/** The real ones, for the platform's own waits: those mustn't stop with the ludant's code. */
export const later = nativeSetTimeout, cancel = nativeClearTimeout;

globalThis.setTimeout = (fn, ms, ...args) => {
  const l = current;
  if (!l || typeof fn !== 'function') return nativeSetTimeout(fn, ms, ...args);
  const id = nativeSetTimeout(() => { l.timeouts.delete(id); if (!l.ended) within(l, fn, ...args); }, ms);
  l.timeouts.add(id);
  return id;
};
globalThis.setInterval = (fn, ms, ...args) => {
  const l = current;
  if (!l || typeof fn !== 'function') return nativeSetInterval(fn, ms, ...args);
  const id = nativeSetInterval(() => { if (!l.ended) within(l, fn, ...args); }, ms);
  l.intervals.add(id);
  return id;
};
globalThis.clearTimeout = (id) => { current?.timeouts.delete(id); nativeClearTimeout(id); };
globalThis.clearInterval = (id) => { current?.intervals.delete(id); nativeClearInterval(id); };
if (nativeFrame) {
  globalThis.requestAnimationFrame = (fn) => {
    const l = current;
    if (!l || typeof fn !== 'function') return nativeFrame(fn);
    const id = nativeFrame((t) => { l.frames.delete(id); if (!l.ended) within(l, fn, t); });
    l.frames.add(id);
    return id;
  };
}

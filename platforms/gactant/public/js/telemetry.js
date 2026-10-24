// What a page tells the install about how it's going, so whoever runs it (and the Claude
// helping them) can see trouble without anyone relaying it: crashes in the platform's own
// pages, faults the frame noticed, thinking that failed, and now and then how the stage
// runs. Never names, chat, prompts, code or keys. Read with tools/ops.mjs.
//
//   report(kind, { where, message, sample, ludant, ...numbers })
//   watchPage(where)    report the page's own uncaught errors
//
// A page sends at most MAX_EVENTS in all, the same trouble once, in batches.

const MAX_EVENTS = 40;
const BATCH_MS = 15_000;

let queue = [], sentCount = 0, timer = null;
const seen = new Set();

/** The browser, roughly, for grouping: not its version or anything finer. */
export function browserName() {
  const ua = navigator.userAgent;
  if (/Xbox/i.test(ua)) return 'xbox';
  if (/Edg\//.test(ua)) return 'edge';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Chrome\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua)) return 'safari';
  return 'other';
}
const mobile = () => matchMedia('(pointer: coarse)').matches;

export function report(kind, fields = {}) {
  if (sentCount + queue.length >= MAX_EVENTS) return;
  const event = { kind, ...fields };
  for (const k of ['where', 'message', 'sample']) if (event[k] != null) event[k] = String(event[k]).slice(0, k === 'sample' ? 1500 : 400);
  const key = `${kind}|${event.where}|${event.message}`;
  if (kind !== 'perf') { if (seen.has(key)) return; seen.add(key); }
  queue.push(event);
  timer ??= setTimeout(send, BATCH_MS);
}

function send(beacon = false) {
  clearTimeout(timer); timer = null;
  if (!queue.length) return;
  const body = JSON.stringify({ browser: browserName(), mobile: mobile(), events: queue });
  sentCount += queue.length; queue = [];
  if (beacon && navigator.sendBeacon) navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }));
  else fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
}

// Leaving the page sends what's waiting.
addEventListener('pagehide', () => send(true));

export function watchPage(where) {
  addEventListener('error', (e) => {
    // A script from elsewhere says only "Script error.": nothing to go on.
    if (!e.message || e.message === 'Script error.') return;
    // The browser noting a layout settled a frame late: harmless, and not a crash.
    if (e.message.startsWith('ResizeObserver loop')) return;
    report('crash', { where, message: e.message, sample: e.error?.stack ?? `${e.filename}:${e.lineno}:${e.colno}` });
  });
  addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    report('crash', { where, message: r?.message ?? String(r), sample: r?.stack });
  });
}

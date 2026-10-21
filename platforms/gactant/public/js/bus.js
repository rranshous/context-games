// The frame's event bus. Surfaces emit `<surface>.<kind>` events; anyone may listen.
// Patterns: exact ('chat.posted'), a surface's events ('chat.*'), or everything ('*').
//
// The frame and the sandbox each have a bus, joined by the bridge. An event emitted on one
// side goes to `outward` (if set) so the other side can deliver it to its own listeners;
// delivering an event that came across doesn't send it back.
//
// A listener that throws doesn't stop the others. Its error is reported once (then at most
// every few seconds, with a count) as a 'frame.error' event, so a broken 60 fps handler
// can't flood anything.

export class Bus {
  constructor() {
    /** @type {Map<string, Set<{ fn: Function, tag: string }>>} */
    this.listeners = new Map();
    this.errors = new Map();   // key -> { count, last, message, source }
    this.outward = null;       // (event) => void: carries events to the other side
  }

  /** Listen. `tag` names who is listening, for error reports. Returns an off function. */
  on(pattern, fn, tag = 'frame') {
    if (!this.listeners.has(pattern)) this.listeners.set(pattern, new Set());
    const entry = { fn, tag };
    this.listeners.get(pattern).add(entry);
    return () => this.listeners.get(pattern)?.delete(entry);
  }

  emit(type, payload = {}) {
    const event = { type, at: Date.now(), ...payload };
    this.outward?.(event);
    return this.deliver(event);
  }

  /** Hand an event to this side's listeners only. */
  deliver(event) {
    const type = event.type, surface = type.split('.')[0];
    for (const pattern of [type, `${surface}.*`, '*']) {
      const set = this.listeners.get(pattern);
      if (!set) continue;
      for (const entry of [...set]) {
        try { entry.fn(event); } catch (err) { this.fault(entry.tag, type, err); }
      }
    }
    return event;
  }

  fault(source, during, err) {
    const message = err?.message ?? String(err);
    const key = `${source}|${during}|${message}`;
    const now = Date.now();
    const seen = this.errors.get(key);
    if (seen) {
      seen.count++;
      if (now - seen.last < 5000) return;
      seen.last = now;
    } else {
      this.errors.set(key, { count: 1, last: now, message, source, during });
    }
    console.warn(`[${source}] during ${during}: ${message}`);
    if (during !== 'frame.error') this.emit('frame.error', { source, during, message, count: this.errors.get(key).count, stack: err?.stack?.split('\n').slice(0, 4).join('\n') });
  }
}

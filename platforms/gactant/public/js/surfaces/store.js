// Store: structured state that lasts. Keys and JSON values, kept with this copy of the
// ludant across sittings, reloads and game rebuilds. How it's saved is the frame's
// business. It belongs to the table, like the chat: a copy starts with an empty store,
// and restoring a checkpoint leaves it alone.
//
// actions (as an actor)
//   get(key, fallback?) -> value      a copy, so changing it changes nothing until set
//   set(key, value)                   value: anything JSON can hold
//   update(key, fn, fallback?)        set(key, fn(get(key, fallback))); returns the new value
//   delete(key)
//   keys(prefix?) -> [key]
//   all() -> { key: value }
// events
//   store.changed { who, key }        (key is null after a clear)

const LIMIT = 200_000;   // characters of JSON, all keys together

export class Store {
  id = 'store';

  constructor(frame) {
    this.frame = frame;
    this.data = {};
  }

  describe() {
    return `store: a persistent store for structured state (keys holding JSON values) that lasts across sittings, reloads and rebuilds of your game; it stays with this copy of you, so copies start with it empty, and holds up to ${LIMIT} characters. Actions (all synchronous): get(key, fallback), set(key, value), update(key, fn, fallback), delete(key), keys(prefix), all().`;
  }

  state() {
    const keys = Object.keys(this.data);
    return `store: ${keys.length ? `${keys.length} keys (${keys.slice(0, 12).join(', ')}${keys.length > 12 ? ', …' : ''}), ${this.size()} of ${LIMIT} characters used` : 'empty'}.`;
  }

  actions(who) {
    return {
      get: (key, fallback) => (key in this.data ? structuredClone(this.data[key]) : fallback),
      set: (key, value) => this.set(who, key, value),
      update: (key, fn, fallback) => this.set(who, key, fn(key in this.data ? structuredClone(this.data[key]) : fallback)),
      delete: (key) => { delete this.data[String(key)]; this.touched(who, String(key)); return true; },
      keys: (prefix = '') => Object.keys(this.data).filter((k) => k.startsWith(prefix)),
      all: () => structuredClone(this.data),
    };
  }

  set(who, key, value) {
    key = String(key);
    if (value === undefined) throw new Error('store.set needs a value (use delete to remove a key)');
    const json = JSON.stringify(value);
    if (json === undefined) throw new Error('store values must be JSON: numbers, strings, booleans, null, arrays, plain objects');
    const others = this.size() - (key in this.data ? JSON.stringify(this.data[key]).length + key.length : 0);
    if (others + json.length + key.length > LIMIT) throw new Error(`store is full: ${LIMIT} characters of JSON in all`);
    const before = key in this.data ? JSON.stringify(this.data[key]) : null;
    this.data[key] = JSON.parse(json);
    if (before !== json) this.touched(who, key);
    return structuredClone(this.data[key]);
  }

  size() { return Object.entries(this.data).reduce((n, [k, v]) => n + k.length + JSON.stringify(v).length, 0); }

  touched(who, key) {
    this.frame.bus.emit('store.changed', { who, key });
    this.frame.changed();
  }

  toJSON() { return { data: this.data }; }
  load(json) { this.data = json?.data ?? {}; }
}

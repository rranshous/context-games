/**
 * StateStore — Redis-inspired data structure store.
 *
 * Four data structures: strings, lists, hashes, sets.
 * In-memory Map with typed values. Persistence handled externally.
 * Every mutation is logged to an append-only audit list.
 */

// --- Types ---

type StoreString = { type: 'string'; value: string };
type StoreList = { type: 'list'; value: unknown[] };
type StoreHash = { type: 'hash'; value: Map<string, unknown> };
type StoreSet = { type: 'set'; value: Set<string> };
type StoreEntry = StoreString | StoreList | StoreHash | StoreSet;

export interface AuditEntry {
  tick: number;
  writer: string;
  op: string;
  key: string;
  args?: unknown;
}

// --- StateStore ---

export class StateStore {
  private data = new Map<string, StoreEntry>();
  private audit: AuditEntry[] = [];
  private currentTick = 0;

  /** Called by the clock each tick to keep audit timestamps current. */
  setTick(tick: number): void {
    this.currentTick = tick;
  }

  // --- Strings ---

  get(key: string): string | null {
    const entry = this.data.get(key);
    if (!entry || entry.type !== 'string') return null;
    return entry.value;
  }

  set(key: string, value: string, writer: string): void {
    this.data.set(key, { type: 'string', value });
    this.log(writer, 'set', key, { value });
  }

  // --- Lists ---

  rpush(key: string, value: unknown, writer: string): number {
    const entry = this.ensureList(key);
    entry.value.push(value);
    this.log(writer, 'rpush', key, { value });
    return entry.value.length;
  }

  lrange(key: string, start: number, stop: number): unknown[] {
    const entry = this.data.get(key);
    if (!entry || entry.type !== 'list') return [];
    const list = entry.value;
    // Redis semantics: -1 = last element, stop is inclusive
    const s = start < 0 ? Math.max(0, list.length + start) : start;
    const e = stop < 0 ? list.length + stop : stop;
    return list.slice(s, e + 1);
  }

  llen(key: string): number {
    const entry = this.data.get(key);
    if (!entry || entry.type !== 'list') return 0;
    return entry.value.length;
  }

  ltrim(key: string, start: number, stop: number, writer: string): void {
    const entry = this.data.get(key);
    if (!entry || entry.type !== 'list') return;
    const list = entry.value;
    const s = start < 0 ? Math.max(0, list.length + start) : start;
    const e = stop < 0 ? list.length + stop : stop;
    entry.value = list.slice(s, e + 1);
    this.log(writer, 'ltrim', key, { start, stop });
  }

  // --- Hashes ---

  hget(key: string, field: string): unknown | null {
    const entry = this.data.get(key);
    if (!entry || entry.type !== 'hash') return null;
    return entry.value.get(field) ?? null;
  }

  hset(key: string, field: string, value: unknown, writer: string): void {
    const entry = this.ensureHash(key);
    entry.value.set(field, value);
    this.log(writer, 'hset', key, { field, value });
  }

  hdel(key: string, field: string, writer: string): boolean {
    const entry = this.data.get(key);
    if (!entry || entry.type !== 'hash') return false;
    const deleted = entry.value.delete(field);
    if (deleted) this.log(writer, 'hdel', key, { field });
    return deleted;
  }

  hgetall(key: string): Record<string, unknown> {
    const entry = this.data.get(key);
    if (!entry || entry.type !== 'hash') return {};
    const result: Record<string, unknown> = {};
    for (const [k, v] of entry.value) {
      result[k] = v;
    }
    return result;
  }

  // --- Sets ---

  sadd(key: string, member: string, writer: string): boolean {
    const entry = this.ensureSet(key);
    const isNew = !entry.value.has(member);
    entry.value.add(member);
    if (isNew) this.log(writer, 'sadd', key, { member });
    return isNew;
  }

  srem(key: string, member: string, writer: string): boolean {
    const entry = this.data.get(key);
    if (!entry || entry.type !== 'set') return false;
    const deleted = entry.value.delete(member);
    if (deleted) this.log(writer, 'srem', key, { member });
    return deleted;
  }

  smembers(key: string): string[] {
    const entry = this.data.get(key);
    if (!entry || entry.type !== 'set') return [];
    return [...entry.value];
  }

  sismember(key: string, member: string): boolean {
    const entry = this.data.get(key);
    if (!entry || entry.type !== 'set') return false;
    return entry.value.has(member);
  }

  // --- Key operations ---

  keys(pattern: string): string[] {
    // Simple prefix matching: "modules/*" matches keys starting with "modules/"
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return [...this.data.keys()].filter(k => k.startsWith(prefix));
    }
    // Exact match
    return this.data.has(pattern) ? [pattern] : [];
  }

  exists(key: string): boolean {
    return this.data.has(key);
  }

  del(key: string, writer: string): boolean {
    const deleted = this.data.delete(key);
    if (deleted) this.log(writer, 'del', key);
    return deleted;
  }

  type(key: string): string | null {
    const entry = this.data.get(key);
    return entry ? entry.type : null;
  }

  // --- Audit ---

  getAudit(fromIndex = 0, count?: number): AuditEntry[] {
    if (count !== undefined) {
      return this.audit.slice(fromIndex, fromIndex + count);
    }
    return this.audit.slice(fromIndex);
  }

  getAuditLength(): number {
    return this.audit.length;
  }

  // --- Serialization (for persistence) ---

  toJSON(): unknown {
    const entries: Record<string, unknown> = {};
    for (const [key, entry] of this.data) {
      switch (entry.type) {
        case 'string':
          entries[key] = { type: 'string', value: entry.value };
          break;
        case 'list':
          entries[key] = { type: 'list', value: entry.value };
          break;
        case 'hash':
          entries[key] = { type: 'hash', value: Object.fromEntries(entry.value) };
          break;
        case 'set':
          entries[key] = { type: 'set', value: [...entry.value] };
          break;
      }
    }
    return { entries, audit: this.audit };
  }

  static fromJSON(json: { entries: Record<string, unknown>; audit: AuditEntry[] }): StateStore {
    const store = new StateStore();
    store.audit = json.audit || [];

    for (const [key, raw] of Object.entries(json.entries)) {
      const entry = raw as { type: string; value: unknown };
      switch (entry.type) {
        case 'string':
          store.data.set(key, { type: 'string', value: entry.value as string });
          break;
        case 'list':
          store.data.set(key, { type: 'list', value: entry.value as unknown[] });
          break;
        case 'hash': {
          const map = new Map<string, unknown>(Object.entries(entry.value as Record<string, unknown>));
          store.data.set(key, { type: 'hash', value: map });
          break;
        }
        case 'set': {
          const set = new Set<string>(entry.value as string[]);
          store.data.set(key, { type: 'set', value: set });
          break;
        }
      }
    }

    return store;
  }

  // --- Internals ---

  private ensureList(key: string): StoreList {
    let entry = this.data.get(key);
    if (!entry) {
      entry = { type: 'list', value: [] };
      this.data.set(key, entry);
    }
    if (entry.type !== 'list') throw new Error(`Key "${key}" is type ${entry.type}, not list`);
    return entry as StoreList;
  }

  private ensureHash(key: string): StoreHash {
    let entry = this.data.get(key);
    if (!entry) {
      entry = { type: 'hash', value: new Map() };
      this.data.set(key, entry);
    }
    if (entry.type !== 'hash') throw new Error(`Key "${key}" is type ${entry.type}, not hash`);
    return entry as StoreHash;
  }

  private ensureSet(key: string): StoreSet {
    let entry = this.data.get(key);
    if (!entry) {
      entry = { type: 'set', value: new Set() };
      this.data.set(key, entry);
    }
    if (entry.type !== 'set') throw new Error(`Key "${key}" is type ${entry.type}, not set`);
    return entry as StoreSet;
  }

  private log(writer: string, op: string, key: string, args?: unknown): void {
    this.audit.push({ tick: this.currentTick, writer, op, key, args });
  }
}

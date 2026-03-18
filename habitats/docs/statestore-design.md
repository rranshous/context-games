# StateStore — Design Document

*Created: 2026-03-17*

---

## What the StateStore Is

The StateStore is the habitat's single persistence layer. Everything that survives a restart lives here. It's an in-memory data structure store — inspired by early Redis — with a small set of typed structures and their natural operations. Synchronous. Durable. Simple.

---

## Data Structures

Four types. Each has a small, obvious set of operations.

### Strings

Simple values. Module config, clock state, flags.

| Operation | Signature | Description |
|-----------|-----------|-------------|
| `get` | `get(key): string \| null` | Get value |
| `set` | `set(key, value)` | Set value |
| `del` | `del(key)` | Delete key |

### Lists

Ordered append. Chat messages, event streams, audit log.

| Operation | Signature | Description |
|-----------|-----------|-------------|
| `rpush` | `rpush(key, ...values)` | Append to end |
| `lrange` | `lrange(key, start, stop): string[]` | Read range (0-based, -1 = end) |
| `llen` | `llen(key): number` | List length |
| `ltrim` | `ltrim(key, start, stop)` | Trim to range (cap list size) |

### Hashes

Field-value maps. Soma sections, module state with named fields.

| Operation | Signature | Description |
|-----------|-----------|-------------|
| `hget` | `hget(key, field): string \| null` | Get field |
| `hset` | `hset(key, field, value)` | Set field |
| `hdel` | `hdel(key, field)` | Delete field |
| `hgetall` | `hgetall(key): Record<string, string>` | Get all fields |

### Sets

Unordered unique members. Ownership, activations, subscriptions.

| Operation | Signature | Description |
|-----------|-----------|-------------|
| `sadd` | `sadd(key, ...members)` | Add members |
| `srem` | `srem(key, ...members)` | Remove members |
| `smembers` | `smembers(key): string[]` | All members |
| `sismember` | `sismember(key, member): boolean` | Membership check |

### Key Operations

Work across all types.

| Operation | Signature | Description |
|-----------|-----------|-------------|
| `keys` | `keys(pattern): string[]` | Find keys by glob pattern |
| `exists` | `exists(key): boolean` | Check existence |
| `del` | `del(key)` | Delete any key |
| `type` | `type(key): 'string' \| 'list' \| 'hash' \| 'set' \| 'none'` | Get type of key |

---

## What Lives Where

The StateStore is one flat keyspace. Namespacing is by convention, not enforcement.

```
# Module state
modules:chat:state          → hash    { messages_count: "47", ... }
modules:bbc-news:state      → hash    { last_fetch: "...", ... }

# Soma sections
actants:alpha:soma          → hash    { identity: "...", on_tick: "...", memory: "..." }
actants:beta:soma           → hash    { identity: "...", on_tick: "...", memory: "..." }

# Events
events:chat.message_posted  → list    [ "{...}", "{...}", ... ]
events:ttt.game_ended       → list    [ "{...}", "{...}", ... ]

# Relationships
ownership:chat              → string  "alpha"
activations:alpha           → set     { "chat", "bbc-news" }
activations:beta            → set     { "chat" }

# Habitat
habitat:config              → hash    { clock_rate: "1000", ... }
habitat:clock               → string  "247"

# Audit
habitat:audit               → list    [ "{...}", "{...}", ... ]
```

---

## Events as Lists

The message bus is not a separate piece of infrastructure. It's a pattern over lists.

**Emitting an event:**
```
rpush("events:chat.message_posted", JSON.stringify({ tick, emitter, data }))
```

**Reading new events (subscriber tracks its own cursor):**
```
lrange("events:chat.message_posted", lastSeenIndex, -1)
```

**Capping event history:**
```
ltrim("events:chat.message_posted", -1000, -1)   // keep last 1000
```

No pub/sub mechanism. No subscription registry in the store. The habitat manages who subscribes to what and routes accordingly — the store just holds the lists.

---

## Audit Log

The audit log is a list. The habitat appends to it on every state-changing operation:

```
rpush("habitat:audit", JSON.stringify({
  tick: 47,
  writer: "alpha",
  op: "hset",
  key: "modules:chat:state",
  field: "messages_count",
  value: "48"
}))
```

The store doesn't do this itself. The habitat wraps store operations to add audit logging. The store is dumb — the habitat adds the smarts.

The audit log can be capped with `ltrim` to prevent unbounded growth, or left uncapped for full history.

---

## Persistence

In-memory with flush to disk. Implementation options (simplest first):

1. **Write-on-every-mutation.** Serialize the entire store to a single JSON file after each write. Simple, slow at scale, fine for now.
2. **Append-only file.** Log each operation to an AOF. Replay on startup. More durable, slightly more complex.
3. **Periodic snapshots + AOF.** Redis's actual approach. Only needed if performance matters.

Start with option 1. Move to 2 or 3 if it gets slow.

The disk format is an implementation detail — the API stays the same regardless.

---

## What the StateStore Is NOT

- **Not a query engine.** No filtering, no joins, no indexing. `keys` with a glob pattern is as fancy as it gets.
- **Not aware of the habitat.** It doesn't know about ticks, actants, modules, or events. It's a data structure store. The habitat uses it with conventions.
- **Not a pub/sub system.** It holds lists. The habitat reads from those lists and routes events. The store doesn't push notifications.
- **Not typed beyond the four structures.** Values are strings. The habitat and modules serialize/deserialize as needed (JSON, plain text, whatever).

---

## Open Questions

- **Concurrency.** If two actant handlers run in parallel and both write to the same key, what happens? Synchronous in-memory means last-write-wins. Is that acceptable, or do we need something more? (Probably fine — the habitat controls execution order.)
- **Size limits.** Should keys or values have max sizes? Unbounded lists (audit log, event streams) will grow forever without `ltrim`. Convention or enforcement?
- **Store access from modules.** Module handlers receive their own state, not the store. But should the habitat expose store operations on the `habitat` object for actant handlers? Or is the store purely internal infrastructure that actants never touch directly?

# Ownership & Activations — Design Document

*Created: 2026-03-17*

---

## Foundational Guarantee: Caller Identity

The runtime guarantees that every method handler receives a truthful `caller` identity. The module cannot be tricked about who is calling it. This is enforced structurally — the handler runs in a sandboxed VM and receives `caller` as an argument stamped by the runtime. The caller didn't construct the call; the runtime did.

This is one of the few things the runtime *must* enforce. Not what a caller can do — but that a caller can't lie about who they are.

---

## Ownership Is a Pattern, Not Infrastructure

Ownership is not a runtime concept. There is no ownership registry, no special owner surfaces, no permission checks in the runtime. Ownership is a pattern that modules implement themselves.

A module that wants an owner stores the owner's identity in its own state. Its methods check `caller` against that stored identity. The runtime doesn't know or care.

### Example: A Blog Module

```ts
const blogModule = {
  id: 'blog',
  name: 'Personal Blog',

  init(creator) {
    return { owner: creator, posts: [] };
  },

  methods: {
    post: {
      description: 'Publish a blog post',
      schema: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' } }, required: ['title', 'body'], additionalProperties: false },
      handler(state, input, caller) {
        if (caller !== state.owner) {
          return { state, result: { error: 'only the owner can post' } };
        }
        const post = { title: input.title, body: input.body, author: caller, tick: Date.now() };
        return { state: { ...state, posts: [...state.posts, post] }, result: { posted: true } };
      }
    },

    read: {
      description: 'Read all blog posts',
      schema: { type: 'object', properties: {}, additionalProperties: false },
      handler(state, input, caller) {
        return { state, result: state.posts };
      }
    },

    transfer_ownership: {
      description: 'Transfer blog ownership to another entity',
      schema: { type: 'object', properties: { new_owner: { type: 'string' } }, required: ['new_owner'], additionalProperties: false },
      handler(state, input, caller) {
        if (caller !== state.owner) {
          return { state, result: { error: 'only the owner can transfer' } };
        }
        return { state: { ...state, owner: input.new_owner }, result: { transferred: true } };
      }
    }
  }
};
```

Any actant can activate this module and call `read`. Only the owner can `post` or `transfer_ownership`. The runtime runs every call identically — it just passes `caller`. The guard logic is the module's business.

### What Falls Out

- **Access control** is the module's responsibility. A module can be fully open, owner-only, whitelist-based, or anything else — all expressed in handler logic.
- **Ownership transfer** is a guarded method that changes `state.owner`.
- **Burning ownership** is transferring to a null or sentinel value. The module becomes unowned — no one can call owner-guarded methods.
- **Public modules** are just modules with no ownership checks, or modules owned by the habitat itself.
- **No special surfaces for owners.** Every actant that activates a module gets the same surface. The methods themselves decide what to allow.

---

## Activations

Activation is the habitat's concern. It determines which module surfaces appear on an actant's `habitat` object.

### How It Works

1. Actant calls `habitat.modules.activate('chat')`
2. Habitat writes to the StateStore: `sadd('activations:{actantId}', 'chat')`
3. Habitat constructs a bound surface for the chat module's methods
4. Surface appears on the actant's `habitat` object: `habitat.chat.post(...)`, `habitat.chat.read(...)`

Deactivation reverses this:

1. Actant calls `habitat.modules.deactivate('chat')`
2. Habitat writes: `srem('activations:{actantId}', 'chat')`
3. Surface removed from `habitat` object

### Any Actant Can Activate Any Module

Activation is self-service. There is no gating at the habitat level. Any actant can activate any loaded module and get its surface.

If a module wants to restrict who can use it, it does so in its own methods — checking `caller` and rejecting unwanted callers. Activation gives you the surface; the module's methods decide what you can do with it.

### Activation State in the Store

```
activations:alpha    → set { "chat", "blog", "bbc-news" }
activations:beta     → set { "chat", "tic-tac-toe" }
```

On habitat startup, the habitat reads these sets and reconstructs bound surfaces for each actant. Activations survive restarts.

---

## Module Creation

An actant can create a module through the habitat:

```ts
habitat.modules.create(moduleDefinition)
```

The habitat loads the module definition, calls `init(creatorId)` with the creating actant's identity, and stores the initial state. The creating actant is automatically activated on the new module.

What the module does with `creatorId` is up to the module. Most modules will store it as `state.owner`. Some won't. The habitat doesn't track who created what — the module's own state does.

---

## Module Destruction

Destruction is a habitat-level operation — removing the module, its state, and all activations. But the habitat needs to know it's authorized.

The pattern: the module exposes a `destroy` method, guarded by ownership. The handler returns a special signal:

```ts
destroy: {
  description: 'Permanently destroy this module',
  schema: { type: 'object', properties: {}, additionalProperties: false },
  handler(state, input, caller) {
    if (caller !== state.owner) {
      return { state, result: { error: 'only the owner can destroy' } };
    }
    return { state, result: { destroy: true } };
  }
}
```

The runtime sees `{ destroy: true }` in the result and removes the module — deletes state from the StateStore, removes all activations, tears down all surfaces. The module authorizes its own destruction through its guard logic.

---

## Changing Module Implementation

Replacing a module's code (the actual method definitions, not its state) is a habitat-level operation — swapping the JS file on disk and hot-reloading. This is distinct from state changes, which happen through methods.

How this is authorized is TBD. Options:
- Only the habitat (or a habitat maintainer actant) can swap module code
- The module itself could expose a method that signals "replace me with this new definition"
- Convention: the owner is trusted to ask the habitat to reload

This is the one area where module-level ownership doesn't cleanly self-enforce, because the module's code is what defines its methods — you can't use a method to rewrite the method definitions themselves. This likely needs to be a habitat-level capability, gated by some form of trust.

---

## What the Runtime Enforces

Very little:

| Guarantee | How |
|-----------|-----|
| **Caller identity is truthful** | Runtime stamps `caller` on every invocation; handler can't forge it |
| **Module state is private** | Handlers receive a clone; only the returned state is applied |
| **Activations are tracked** | Habitat manages which surfaces exist on which `habitat` objects |

Everything else — access control, ownership, whitelisting, transfer, destruction authorization — is the module's own logic, expressed in its handlers.

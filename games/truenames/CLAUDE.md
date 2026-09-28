# CLAUDE.md

Orientation for working on this repo. Design lives in `docs/`; read `docs/03-mechanics.md` and `docs/04-universe-spec.md` before touching `packages/universe`.

## Stack
- TypeScript, `strict: true`. Monorepo (pnpm workspaces).
- Hashing: Poseidon over the BN254 scalar field (`poseidon-lite`). Keys: ed25519 (`@noble/curves` or `@noble/ed25519`).
- Tests: vitest. 2D rendering: engine TBD (PixiJS or Phaser suggested).

## Hard rules
1. **`packages/universe` is pure and deterministic.** No `Math.random`, no `Date`, no floats in anything that decides existence, magnitude, traits or strength. Use `bigint`. Same inputs → same outputs on every machine, forever.
2. **The hash spec is frozen once seeded.** Changing domain tags, input order, or the `zeros` definition changes the entire universe. Any change needs a spec version bump and new golden vectors.
3. **Golden test vectors** for every universe function live in `packages/universe/test/vectors.json` and must pass in Node and in a browser worker.
4. **The authority is an interface.** v0 runs it locally in-process; later a server implements the same interface. Game code never reads authority internals.
5. **Name verification sits behind verifiers.** The sanctum uses `NameVerifier` (clear text: recompute the hash). Rounds use a `ProofVerifier` (zero-knowledge proofs from `packages/proofs`). The authority never depends on a proof system directly.
6. **The game side never sees secrets.** A round gets only a `Journey` (public aura + zero-knowledge proofs) and reports through a `RoundHost`; `screens/run.ts` and `round.ts` must not import `save`, `services` or `threshold`.
7. **Tunables live in one file** (`packages/authority/src/tunables.ts`), never inlined.

## Vocabulary (use these words consistently)
depth, cell, spirit, magnitude, traits, name, strength, aura, effective, pool, grant, strain, capacity. Definitions: `docs/03-mechanics.md`.

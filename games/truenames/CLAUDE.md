# CLAUDE.md

Orientation for working on this repo. Design lives in `docs/`; read `docs/03-mechanics.md` and `docs/04-universe-spec.md` before touching `packages/universe`. **Keep the docs current:** when a change alters mechanics, structure or direction, update the docs it touches (03 mechanics, 05 overview, 06 architecture, 07 roadmap, 08 open questions) in the same commit, not just the journal.

## Stack
- TypeScript, `strict: true`. Monorepo (pnpm workspaces).
- Hashing: Poseidon over the BN254 scalar field (`poseidon-lite`). Keys: ed25519 (`@noble/curves` or `@noble/ed25519`).
- Tests: vitest. Rendering: Canvas 2D + DOM, no engine. Encryption: `packages/channel` (@noble).

## Hard rules
1. **`packages/universe` is pure and deterministic.** No `Math.random`, no `Date`, no floats in anything that decides existence, magnitude, traits or strength. Use `bigint`. Same inputs → same outputs on every machine, forever.
2. **The hash spec is frozen once seeded.** Changing domain tags, input order, or the `zeros` definition changes the entire universe. Any change needs a spec version bump and new golden vectors.
3. **Golden test vectors** for every universe function live in `packages/universe/test/vectors.json` and must pass in Node and in a browser worker.
4. **The authority is an interface.** v0 runs it locally in-process; later a server implements the same interface. Game code never reads authority internals.
5. **Name verification sits behind verifiers.** The sanctum uses `NameVerifier` (clear text: recompute the hash). Rounds use a `ProofVerifier` (zero-knowledge proofs from `packages/proofs`). The authority never depends on a proof system directly.
6. **The game side never sees secrets.** Rounds run in the dungeon process (`apps/dungeon`, simulation in `packages/dungeon`), which receives only public auras and zero-knowledge proofs. The browser's `screens/run.ts` and `round.ts` are a thin client and must not import `save`, `services` or `threshold`. Outcomes are decided by the dungeon, never the client.
7. **Tunables live in one file** (`packages/authority/src/tunables.ts`), never inlined.

## Vocabulary (use these words consistently)
depth, cell, spirit, magnitude, traits, name, strength (on screen: truths), aura, effective, vessel (code: pool), grant, strain, capacity, world, round, sanctum, altar, dungeon, choir. Definitions: `docs/03-mechanics.md`.

## Development loops
- **Play it yourself**: in development the game exposes `window.explorer` (Explorer Claude: `apps/game/src/explorer.ts`): drive it through Playwright's evaluate (or `node apps/dungeon/cdp.mjs <port> eval` on a desktop instance) to see state, play by code, take screenshots, and shard a local model in to play and report.
- **Read the issue inbox**: actants and the shard report what seems broken to the altar, which appends to `actant-issues.jsonl` (repo root in dev). Check it after actant or shard runs.
- **Don't edit `apps/game` or `packages/` while a dev-server playtest runs**: Vite reloads the page and ends the round.
- **Run anything that hashes (meditation, desktop instances, test browsers) at low priority** (`nice -n 19`) when the machine is shared.
- **Keep the docs current**: the design docs describe the game as it is; update them (and the journal) in the same commit as the change.


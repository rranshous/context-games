# 05 · Architecture

## Monorepo layout
```
truenames/
  packages/
    universe/      pure, deterministic: cells, hashing, spirits, names (spec 04)
    authority/     game rules: pools, strain, capacity, tick resolution
    meditation/    Web Worker pool for scrying + name grinding
    protocol/      shared message types (casts, claims, tick results)
  apps/
    game/          2D roguelite client (v0)
    tools/         CLI: bench, vector gen, god-finder, universe explorer
  docs/
```
Later phases add `apps/server`. The same `authority` package runs there unchanged.

## Dependency rules
```
game ──► protocol ◄── authority ──► universe
  │                                    ▲
  └──► meditation ─────────────────────┘
```
- `universe` depends on nothing but `poseidon-lite` and `@noble/curves`.
- `game` never imports `authority` internals. It talks through the `Authority` interface.
- `authority` never imports rendering, DOM, or timers. It is driven by `tick()`.

## Key interfaces

```ts
// protocol
export interface CastIntent {
  aura: string;
  cell: string;            // which spirit
  request: number;         // power requested
  target: TargetSpec;      // point / entity / self
  tick: number;
}
export interface CastResult {
  aura: string;
  cell: string;
  effective: number;       // "your evocation rang at N bits"
  grant: number;
  strainAfter: number;
  backlash?: 'fizzle' | 'misfire' | 'recoil';
}
export interface TickResult { tick: number; casts: CastResult[]; pools: Record<string, number> }

// authority
export interface NameVerifier {
  verify(claim: NameClaim): { ok: true; strength: number } | { ok: false; reason: string };
}
export interface Authority {
  registerAura(pubkey: string): void;
  submitName(claim: NameClaim): { accepted: boolean; strength?: number; reason?: string };
  submitCast(intent: CastIntent): void;   // queued for the current tick
  tick(): TickResult;                      // resolves all queued casts
  auraState(aura: string): { strain: number; capacity: number };
  nameBook(aura: string): Record<string, number>; // cell -> best strength
}
```
- v0: `LocalAuthority implements Authority`, in-process, trusting.
- v1 server: same class behind a WebSocket; the client gets a `RemoteAuthority` with the same interface.
- `NameVerifier` v1 = `ClearTextVerifier` (recompute hash). Later: `ZkVerifier`.

## State (what the authority stores)
Only deltas; everything else is derived from the seed.
```ts
interface AuthorityState {
  tick: number;
  auras: Map<string, { strain: number }>;
  names: Map<string /*aura*/, Map<string /*cell*/, { strength: number; nonce: bigint }>>;
  pools: Map<string /*cell*/, { level: number; lastTick: number }>; // lazily created, refill computed on read
}
```
- Pools are lazy: on first touch, `level = poolCap`. On each read, apply `refill * (tick - lastTick)` capped at `poolCap`. Untouched spirits cost nothing.
- Capacity is derived from `names`, cached and invalidated when a name improves.

In v0 this persists to IndexedDB (name book + scan map); pools and strain are per-run.

## Tick resolution
Fixed rate, e.g. 5 ticks/sec (`TICK_MS = 200`). Rendering and movement run independently at frame rate; only spell resolution is on ticks.

```
tick():
  1. decay strain on all active auras
  2. group queued casts by cell
  3. for each cell: refill pool lazily, compute effective per caster, allocate (water-fill), subtract
  4. for each cast: add strain, check backlash, emit CastResult
  5. tick++
```
Order within a tick doesn't matter (all casts in a tick are simultaneous), which is what makes it safe to move to a server.

**Determinism:** authority math uses floats (it isn't the universe), but keep it deterministic given the same inputs: no `Math.random` except via a seeded PRNG passed in (`backlash` rolls). That makes replays and later server/client prediction possible.

## Meditation (workers)
```ts
type Job =
  | { kind: 'scry'; prefix: string; depth: number; startIndex: bigint; count: bigint }
  | { kind: 'name'; cell: string; aura: string; startNonce: bigint };

type Msg =
  | { kind: 'spirit'; spirit: Spirit }                  // scry hit
  | { kind: 'scanned'; prefix: string; depth: number; upTo: bigint } // progress, for the scan map
  | { kind: 'name'; cell: string; nonce: bigint; strength: number } // new best
  | { kind: 'rate'; hashesPerSec: number };
```
- Pool of `navigator.hardwareConcurrency - 1` workers.
- Scry enumerates children under a prefix in index order (Z-order); the scan map records ranges done, so no cell is scanned twice.
- Name grinding runs until stopped; posts only improvements.
- Budget control: the game sets a worker count and duty cycle (e.g. full speed between runs, 1 worker during combat).

## Client persistence (v0)
IndexedDB stores:
- `keypair` (the aura). Local only in v0.
- `nameBook`: cell → { nonce, strength }.
- `spirits`: known spirits (found or given).
- `scanMap`: prefix + depth → scanned ranges.
- `meta`: run history, unlocks.

## Tools (`apps/tools`)
- `bench`: hashes/sec for Poseidon in Node and a headless browser worker. **Run first.**
- `vectors`: generates `vectors.json` (run once, then commit and never regenerate for spec 1).
- `god-finder`: scans a prefix for spirits matching a predicate (e.g. magnitude ≥ 10 and generosityIdx ≤ 2). Used to find the hearth-god.
- `explore`: prints the region tree and known spirits for debugging.

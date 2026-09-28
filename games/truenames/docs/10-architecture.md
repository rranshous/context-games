# 10 · Architecture (as built)

How the code is actually organized and how data moves through it. [05 · Architecture](05-architecture.md) is the original design; this doc describes the build and notes where it differs.

## Layout
```
truenames/
  packages/
    universe/     pure, deterministic spec v1: cells, Poseidon, spirits, traits, names, claims
    protocol/     shared message types: CastIntent, CastResult, TickResult, PoolInfo, AuraState
    authority/    the rules: per-caster vessels, strain, capacity, backlash, ticks; proof-verifier seam
    proofs/       zero-knowledge name claims: circuit generator, build (circom2 + snarkjs), prove, verify
    dungeon/      the authoritative round simulation (pure), wire protocol, balance, public world constants
    meditation/   scry + name-grinding hot loops, worker body, MeditationPool, WASM Poseidon kernel
  apps/
    game/         Vite + Canvas 2D client: the sanctum (holds secrets) and a thin client for dungeon rounds
    dungeon/      Node process: WebSocket host for rounds (one connection = one round)
    tools/        CLI: bench, sim, god-finder, golden vectors, WASM generator, browser vector check
  docs/           design (01–08), as-built (09–10), journal
```
It's a pnpm workspace. Libraries export their TypeScript source directly (`"exports": "./src/index.ts"`), with no build step: Vite, Vitest and tsx consume TS as-is. `tsc --noEmit` is the typecheck.

## Dependency graph
```mermaid
flowchart LR
  game[apps/game] --> protocol
  game --> proofs
  game -. protocol + balance only .-> dungeon
  dsrv[apps/dungeon] --> dungeon
  dungeon --> authority
  dungeon --> proofs
  proofs --> universe
  proofs --> SJ[snarkjs / circomlib]
  game --> authority
  game --> meditation
  game --> universe
  tools[apps/tools] --> authority & meditation & universe
  authority --> protocol
  authority --> universe
  meditation --> universe
  protocol -. types only .-> universe
  universe --> P["poseidon constants (frozen)"]
  universe --> N["@noble/curves (ed25519)"]
```
Rules held from [CLAUDE.md](../CLAUDE.md):
1. `universe` is pure and deterministic. It uses BigInt only: no floats in anything that decides existence, magnitude, traits or strength, and no `Math.random` or `Date`.
2. The universe spec is frozen. Golden vectors refuse to regenerate.
3. Vectors pass in Node and in a browser worker (`pnpm test`, `pnpm test:browser`).
4. The authority is an interface, and game code only talks to it through `Authority` / `NpcAuthority`.
7. **The game side never sees secrets.** Rounds run in a separate **dungeon process**, which only ever receives proofs. In the browser, `screens/run.ts` and `round.ts` are a thin client and import nothing from `save.ts`, `services.ts` or `threshold.ts`.
5. Name verification goes through `NameVerifier` (`ClearTextVerifier` today).
6. Authority tunables live in `packages/authority/src/tunables.ts`. Game-side balance lives in `apps/game/src/balance.ts`.

## packages/universe
One file of rules plus a fast Poseidon.
- `index.ts` holds the spec v1 functions: `bits`, `target`, `cellDigest` (chained, prefix-memoized), `region`, `spiritAt` / `spiritFromDigest`, `decodeTraits`, `auraField`, `nameHash` / `nameStrength`, `signNameClaim` / `verifyNameClaim`, and the constants (`SEED`, `MIN_SPIRIT_DEPTH = 6`, `MIN_NAME_BITS = 12`).
- `poseidon.ts` is a straight-line Poseidon over frozen constants (`poseidon-constants.ts`, extracted from poseidon-lite). It's bit-identical to poseidon-lite, and a test enforces that.
- `test/vectors.json` holds the golden vectors (never regenerated). `test/run-vectors.ts` is the environment-neutral runner used by both Node and the browser.

## packages/authority
`LocalAuthority implements NpcAuthority` (which `extends Authority`):
```ts
registerAura(pub)   submitName(claim) → {accepted, strength}   submitCast(intent)
submitProvenName(zkClaim) → Promise   // needs a ProofVerifier + round context
tick() → TickResult   auraState(aura)   nameBook(aura)   poolInfo(aura, spirit)   currentTick()
grantSyntheticName(aura, cell, strength)   forgetAura(aura)      // NPC seam
```
- **Tick** (`TICK_MS = 200`):
  1. Decay strain.
  2. Group queued casts by spirit (one per aura per spirit per tick).
  3. Lazily refill each pool.
  4. Compute effective = strength + bonus − strain.
  5. **Draw from the caster's own vessel**: grant = min(request, cap(effective, generosity), vessel level). Vessels are keyed by aura + spirit; nothing is shared.
  6. Add strain.
  7. Roll backlash on a seeded PRNG.
  8. Emit `CastResult`s.
- **Pools** are created lazily at full level; refill is computed on read. Untouched spirits cost nothing.
- **Capacity** is derived from the name book and cached per aura.
- Pure functions exported for clients and tools: `spiritStats`, `castCap`, `castStrain`, `familiarity`, `capacityOf`.

## packages/meditation
- **`scan.ts`**:
  - `scanRange(prefix, extra, start, count, onHit, kernel?)` walks cells in index (Z) order with a digest stack. Consecutive siblings cost ~1.14 child hashes plus one spirit hash.
  - `grindName(digest, aura, start, count, beat, onBest, kernel?)`.
- **`worker-body.ts`**: `installWorker(self)` answers `WorkChunk` messages. It loads the WASM kernel once, self-tests it against BigInt Poseidon, and falls back to BigInt on failure. Failed chunks are reported back with their range.
- **`pool.ts` (`MeditationPool`)** runs N workers (hardwareConcurrency − 1) and hands out **small chunks** (~120 ms, sized adaptively):
  - **Weighted fair scheduling**: the task with the least `sent / weight` goes next. Focus = weight 4.
  - **Scry tasks** keep a *contiguous frontier* (`doneUpTo`) even though chunks finish out of order. Failed ranges go on a retry list. `extendScry` widens a running task without disturbing in-flight chunks.
  - **Name tasks** start at a random 64-bit nonce and report only improvements.
  - Control: `setActive(n)` (voices), `setPaused`, `rate()` (utterances/s over 3 s).
- **`wasm/`**: the Poseidon kernel.
  - **Generation**: `apps/tools/src/gen-wasm.ts` *generates* the WAT (8×32-bit-limb Montgomery CIOS multiply, fully unrolled), compiles it with `wabt`, and embeds it as base64 in `kernel-bytes.ts`.
  - **Optimization**: `kernel.ts` derives **optimized Poseidon constants** at load: partial-round constants are folded to one scalar, and each partial mix is factored into sparse matrices (Poseidon paper, appendix B).
  - **Trust**: it's an accelerator only. Candidate scry hits are recomputed by the universe, and name improvements are re-scored with BigInt before being reported.

## apps/game
```
main.ts           boot: load save → Services → screens; the rAF loop; audio wake; tooltips; idle summary
services.ts       long-lived: save, MeditationPool, session authority, event emitters (finds, names, scry, hum)
save.ts           IndexedDB persistence (one record), aura keypair, claim signing, 6→4 slot migration
screens/
  title.ts        title, element choice, attunement (a real grind on the hearth-god)
  sanctum.ts      top bar, guidance, scrying panel, loadout, timers, drag-to-bind
  codex.ts        the Name Book: tabs, filters, sorts, compact paginated rows
  spirit-card.ts  per-spirit card
  chart.ts        Chart of the astral (coverage per element × aspect × depth)
  run.ts          the dark: world, waves, enemies, Warden, forms, HUD, hover regions
lore.ts           names, aspects, traditions, forms, tempers, `truths()`, the ancients
sigil.ts          procedural seals from flavor bits (cached canvases)
help.ts           HELP dictionary + one shared tooltip (DOM `data-tip` and canvas HUD)
audio.ts          synthesized WebAudio (drone, casts, finds, chimes)
balance.ts        game-side balance: enemies, waves, forms, descents, Warden, SLOTS
astral.ts         menu backdrop
meditation.worker.ts / vectors.worker.ts   worker entry points
```
**Screens** implement `{ mount(ui), unmount(), frame?(dt, ctx, w, h) }`. `main.ts` owns the canvas and the requestAnimationFrame loop. The run draws its own frame, and other screens get the astral backdrop. `Services` outlives every screen, which is why meditation never pauses.

## Life of a name
```mermaid
sequenceDiagram
  participant UI as Sanctum
  participant Svc as Services
  participant Pool as MeditationPool
  participant W as Worker (WASM)
  participant Auth as Authority
  participant DB as IndexedDB
  UI->>Svc: meditate(cell)
  Svc->>Pool: addName(cell, aura, best)
  loop chunks (~120 ms)
    Pool->>W: {name, cell, aura, startNonce, count, beat}
    W-->>Pool: best improvement (re-scored with BigInt)
  end
  Pool->>Svc: onName(nonce, strength)
  Svc->>Svc: sign claim with the aura secret key
  Svc->>Auth: submitName(claim) — verifies spirit, signature, strength
  Auth-->>Svc: accepted
  Svc->>DB: persist signed claim
  Svc-->>UI: names event (book refresh, chime, mid-run forwarding)
```
The save stores **signed claims**, not bare numbers. On boot and at the start of each run they're re-submitted and re-verified, exactly as they would be to a server.

## The dungeon process
- **`packages/dungeon/src/sim.ts` (`DungeonSim`)** is the authoritative round: arena and pillars, waves, enemies (husks, runners, brutes, shamans, the Warden), allies, projectiles, novas, and all eight forms, resolved through a `LocalAuthority` built with the proof verifier and the round's context. It is pure: the host feeds `input`/`cast` and fixed `step(dt)`; it emits `snapshot()`s carrying state plus **events** (casts, hits, kills, beams, rings, novas, banners…). It uses element numbers, never colors; the client owns presentation. It supports several players (enemies take the nearest living one; the round is lost when none live), though one plays today.
- **`apps/dungeon/src/server.ts`** is a Node WebSocket server (port 5192, `DUNGEON_PORT`). Per connection: `open {level}` → `ticket {context}` (fresh 128-bit, from Node crypto) → `journey {aura, bundle}` → proofs verified → `welcome {arena, pillars, slots, refused}` → simulation at 60 Hz with **snapshots at 20 Hz** → `end {result}`. Also `input` (move + aim, sent every 50 ms and on key changes), `cast`, `pause` (single-player convenience), `abandon`.
- **The browser run is a thin client.** It sends intent, renders snapshots with exponential smoothing (no prediction yet, so there's about a snapshot interval of lag), and turns events into floaters, particles, fx and sound. The client never simulates damage or outcomes.
- `corepack pnpm dev` runs both (`scripts/dev.mjs`, prefixed output); `pnpm game` / `pnpm dungeon` run them alone. `?dungeon=ws://host:port` points the client at another dungeon.

## The threshold (sanctum → round)
```mermaid
sequenceDiagram
  participant S as Sanctum (knows secrets)
  participant T as threshold.ts + prover worker
  participant R as Round (run.ts)
  participant A as round's LocalAuthority
  S->>R: open {level} → dungeon issues ticket {context, level}
  S->>T: prepareJourney(ticket)
  loop each bound, learned name
    T->>T: proveName(address, nonce, magnitude, truths, context) → Groth16 proof
    T->>T: sign public signals with the aura's secret key
  end
  T-->>S: Journey {aura, element, bundle[{slot, claim}]}
  S->>R: journey {aura, bundle} (sent to the dungeon process)
  R->>A: submitProvenName(claim) for each
  A->>A: ProofVerifier: context matches, aura field matches key, signature, groth16.verify
  A-->>R: {spirit: "t:<traitHash>", magnitude, truths, traits}
```
- **Circuit** (`packages/proofs/src/gen-circuit.ts` generates `circuits/name.circom`, with constants taken from the universe): secret digits, depth and nonce. Public: aura field, magnitude, strength, context. Outputs: trait hash and element. It checks the chained digest over `depth` digits, `bits(spiritHash) ≥ target(depth) + magnitude`, `bits(nameHash) ≥ strength` (thresholds `P >> k` via a one-hot table and 127-bit limb comparisons), and 6 ≤ depth ≤ 24. About 18.9k constraints.
- **Build**: `corepack pnpm tools zk-build` compiles the circuit with circom2 (WASM) and runs a **local dev Groth16 ceremony** (about 9 minutes). The resulting `artifacts/name.wasm`, `name.zkey` and `name.vkey.json` are committed so the game runs without rebuilding. Proofs are per journey, so rebuilding the keys breaks nothing persistent.
- **Spirit ids in a round** are `t:<traitHash>`. Enemy casters use public spirits by address (the ancients), resolved through the universe.

## Life of a cast
```mermaid
sequenceDiagram
  participant P as Player input
  participant Run as run.ts
  participant Auth as round's LocalAuthority
  P->>Run: LMB / RMB / 1 / 2
  Run->>Auth: submitCast({aura, spirit, request, target, tag})
  Note over Run: shamans and the Warden submit theirs too
  Run->>Auth: tick() every 200 ms
  Auth-->>Run: CastResult {grant, effective, strainAfter, recoil?}
  Run->>Run: effect = grant × form efficiency → projectile / ring / ward / nova / summon / hex / blink / lance
```
Each round builds its **own** `LocalAuthority` (with the proof verifier and the round's context), so vessels and strain are per round. Your names come only from verified proofs. Enemy casters get synthetic names through `grantSyntheticName` and draw from their own vessels.

## Persistence
There's one IndexedDB record (`truenames` / `kv` / `save`), written with a 1.5 s debounce. It holds:
- the aura (secret key, public key, element)
- known spirits (wire form, source, when found)
- **signed name claims**
- the scan map (`prefix|depth → frontier`)
- the meditation, focus and scry plans (resumed on boot)
- the 4-slot loadout
- run history, worker count, descent progress
- the codex view

The universe itself is never stored; it's recomputed from the seed. Losing the secret key loses every name, and there's no backup/export yet.

## Testing and tools
| Command | What |
|---|---|
| `corepack pnpm test` | Vitest: golden vectors, fast-Poseidon ≡ poseidon-lite, authority invariants (allocation, spam collapse, contention, capacity, lazy pools), scan/grind equivalence, pool scheduling (out-of-order, extend mid-flight, flaky workers), WASM ≡ BigInt (both kernel modes). |
| `corepack pnpm test:browser` | Serves `vectors.html` with Vite and runs the golden vectors in a headless-Chromium Web Worker (`playwright-core` 1.58.2). |
| `corepack pnpm typecheck` | `tsc --noEmit` over all packages and apps. |
| `corepack pnpm tools bench` / `bench-wasm` | Hash rates, BigInt vs WASM. |
| `corepack pnpm tools sim` | Cadence and contention tables for tuning strain and pools. |
| `corepack pnpm tools god-finder [prefix\|-] [depth]` | Parallel scan of a layer, listing spirits by might. |
| `corepack pnpm tools vectors` | Wrote the golden vectors once; refuses to overwrite. |
| `corepack pnpm tools gen-wasm` | Regenerates the WASM kernel. |

Balance was tuned with scripted Playwright bots playing whole runs at chosen descents (see the journal).

## Extending
- **A new form**: add it to `FORMS` (lore), `formWeight` / `formEfficiency` (tunables), the `switch` in `run.ts: applyPlayerCast`, a sound in `audio.ts: sfxCast`, and `FORM_GLYPH` in `codex.ts`. Trait decoding only has 3 bits (8 forms), so a 9th form needs a spec version bump.
- **A tunable**: authority rules go in `tunables.ts`; run balance goes in `balance.ts`. Never inline numbers.
- **A new screen**: implement `Screen` and call `app.go(screen)`. Use `data-tip` with a `HELP` key for hover help.
- **Player-facing text**: in-world words only. Format truths with `lore.truths(n)`.

## Seams for multiplayer
- `Authority` is already the only way the client touches rules. A `RemoteAuthority` over WebSocket plus a Node server hosting `LocalAuthority` would slot in. The run's local authority could remain for prediction.
- Claims are self-verifying signed records (spec v1 message `truenames/name/v1|cell|nonce`). A server needs no trust in the client, and anyone can grind a name *for* someone else, but only the key holder can submit it.
- `NameVerifier` is the swap point for zero-knowledge proofs later (see [07](07-multiplayer-roadmap.md)).
- **Still local-only today**: enemy NPCs, run pools and strain, and the scan map. A shared world needs decisions on which of those become server state.

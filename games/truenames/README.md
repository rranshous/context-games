# Truenames

*A spell-casting roguelite where the work is the magic.*

Spirits dwell in the eightfold astral, a space that divides into eight, then eight again, forever. To **find** a spirit is to search that space. To **know** one is to meditate until you've found its true name as spoken by you. Both are real computation done by your browser, so the effort your machine spends is literally your character's strength. Then you take the names you've learned into the dark and fight with them.

**Status:** v0, playable, single-player and local. Built 2026-09-27; see the [journal](docs/journal.md).

## Play
```sh
corepack pnpm install
corepack pnpm dev        # → http://localhost:5190/
```
pnpm is used through corepack (no global install needed). Your save lives in your browser's IndexedDB.

1. **Choose an element and attune.** Your first name is for the hearth-god, *Vreiziobain*, and meditation has to find it.
2. **In the sanctum:**
   - **Scry** regions of the astral for spirits.
   - **Meditate** to unveil truer names; each truth requires twice as much meditation as the last, and at 12 truths a name is learned.
   - **Bind** four names. Drag one onto a slot, or use *bind*.
3. **Walk into the dark:** five waves and a Warden.

| Control | |
|---|---|
| WASD | move |
| mouse | aim |
| left / right click | speak the first two names |
| 1 / 2 | speak the other two |
| Esc | pause |
| M | mute |

- Every evocation strains your aura. Spamming weakens every word, and overreaching invites backlash.
- At the threshold your bound names are proven in zero knowledge: the dark learns what they can do, never where their spirits dwell.
- Meditation keeps working in the background, even while you fight; what it unveils counts on your next journey. Win a descent to open the next.

Hover over almost anything for an explanation.

## Develop
```sh
corepack pnpm test           # Node: universe vectors, authority, meditation, WASM kernel
corepack pnpm test:browser   # golden vectors inside a headless-Chromium Web Worker
corepack pnpm typecheck
corepack pnpm build          # static build → apps/game/dist
corepack pnpm tools bench | bench-wasm | sim | god-finder [prefix|-] [depth] | gen-wasm | zk-build
```

```
packages/universe     the frozen, deterministic world: Poseidon hashing, cells, spirits, names, claims
packages/authority    the rules: per-caster vessels, strain, capacity, ticks
packages/proofs       zero-knowledge name claims (circom circuit, snarkjs prove/verify)
packages/meditation   scrying and name-grinding workers, scheduling, WASM Poseidon kernel
packages/protocol     shared message types
apps/game             the browser game (Vite + Canvas 2D)
apps/tools            CLI tools for benchmarking, simulation and spec work
```
Read [CLAUDE.md](CLAUDE.md) before touching `packages/universe`: its hash spec is frozen, and changing it changes every spirit in existence.

## Docs
| # | Doc | What it covers |
|---|-----|----------------|
| 01 | [Vision](docs/01-vision.md) | Pitch, pillars, core loop |
| 02 | [Worldbuilding](docs/02-worldbuilding.md) | The astral, spirits, names, aura, the Open Choir |
| 03 | [Mechanics](docs/03-mechanics.md) | Glossary, formulas, tunables (design) |
| 04 | [Universe spec](docs/04-universe-spec.md) | Exact hashing, cell encoding, trait decoding (frozen, v1) |
| 05 | [Architecture](docs/05-architecture.md) | Packages and interfaces (original design) |
| 06 | [v0: local roguelite](docs/06-v0-roguelite.md) | Scope, milestones, acceptance criteria |
| 07 | [Multiplayer roadmap](docs/07-multiplayer-roadmap.md) | Phased path to a shared server, then ZK/ledger |
| 08 | [Open questions](docs/08-open-questions.md) | Parked ideas, undecided and decided calls |
| 09 | [**Overview (as built)**](docs/09-overview.md) | What the game is today, in-world words ↔ mechanics, deviations |
| 10 | [**Architecture (as built)**](docs/10-architecture.md) | Code layout, data flow, persistence, WASM kernel, testing, extending |
| — | [Journal](docs/journal.md) | Build log: every decision, measurement and tradeoff |

New here? Read 01 for the idea, 09 for what exists, and 10 for how it's built.

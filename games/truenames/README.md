# Truenames

*A spell-casting roguelite where the work is the magic.*

Spirits dwell in the eightfold astral, a space that divides into eight, then eight again, forever. To **find** a spirit is to search that space. To **know** one is to meditate until you've found its true name as spoken by you. Both are real computation done by your browser, so the effort your machine spends is literally your character's strength. Then you carry the names you've learned into the dark, and the dark learns what they can do without ever learning where their spirits dwell.

![The sanctum: the Name Book, scrying, and the loadout](docs/images/sanctum.png)

**Status:** playable. Four worlds over one power system; names cross into them as zero-knowledge proofs, worlds run in a separate dungeon process, and Dark Racer races are shared between players. The sanctum is still local to your browser. Built from 2026-09-27; see the [journal](docs/journal.md).

## How it works
```
 your browser                                        the dungeon (its own process)
┌────────────────────────────────────┐              ┌───────────────────────────────────┐
│ SANCTUM: the astral and its truths │  proofs only │ ROUND: waves, enemies, the Warden │
│  scry for spirits                  │ ───────────▶ │  verifies each proof, then runs   │
│  meditate truer names              │  (no address,│  the fight authoritatively        │
│  keeps every secret                │   no nonce,  │                                   │
│                                    │   no spirit  │                                   │
│ THIN CLIENT: predicts your moves,  │   identity)  │                                   │
│ draws the dungeon's snapshots      │ ◀─────────── │  snapshots at 20 Hz               │
└────────────────────────────────────┘              └───────────────────────────────────┘
```
- **Everything is derived.** The universe is a pure function of a public seed (Poseidon hashes over an infinite octree). Nothing about spirits is stored; only the player's names (signed claims) are.
- **At the threshold** the sanctum proves each bound name in zero knowledge: *"I hold a name of at least N truths on a spirit of magnitude at least M, with this element and these traits."* The dungeon learns the details, never the source. It can't tell which spirit you carry or where it dwells, and can't link it across rounds.
- **The dungeon is authoritative.** The browser sends only intent (movement, aim, casts), predicts its own movement with the dungeon's own code, and draws everything else slightly in the past between snapshots.

### Worlds
The dungeon hosts several **worlds**, each a different game built on the same proven powers. Pick one in the sanctum's top bar; each has its own descents.
- **The Dark**: an arena. You walk in and speak your four names yourself: five waves and a Warden.
- **The Bastion**: tower defense. Each name becomes a **shrine** along the road to your hearth, and its form decides what the shrine does (bolts, pulses, slowing wards, piercing lances, artillery novas, road guardians, hexes, or throwing foes back). Every shrine speaks in *your* name, so every shrine strains *you*, and shrines to the same patron share one vessel.
- **The Council**: a turn-based card duel. You build a **deck of up to 12 proven names**, apart from your four-name loadout, and each name is a card. **Voice** grows by one each turn, and mightier names cost more of it. Forms become card effects (bolts strike, rings sweep the table, wards shield, lances pierce, novas gather for a turn, summons send servants, hexes linger, blinks draw). The Warden sits as your peer, speaking ancient names at about your deck's truths, so the duel is won by play, not by raw strength.

- **Dark Racer**: a top-down race against five rivals, three laps round a road through the astral. Your four names are what your car can do (seeking bolts, shockwaves, wards, lances that slow, mines, hunting servants, slicks, and blinking down the road). **Strain is engine heat**: every name you speak lowers your top speed until it ebbs, and backlash spins you out. Make the podium to open the next circuit. **Race your friends**: anyone who takes the starting line at the same circuit within about 15 seconds lands on the same grid, taking a rival's place. Press Enter at the line to go early. `corepack pnpm racer-bot` puts a bot racer on the grid if you want to try it alone.

![In the dark](docs/images/dark.png)
![The Bastion](docs/images/bastion.png)
![The Council](docs/images/council.png)
![Dark Racer](docs/images/racer.png)

## Play
```sh
corepack pnpm install
corepack pnpm dev        # game → http://localhost:5190/ and the dungeon process on ws://localhost:5192
```
pnpm is used through corepack (no global install needed). Your save lives in your browser's IndexedDB.

1. **Choose an element and attune.** Your first name is for the hearth-god, *Vreiziobain*, and meditation has to find it.
2. **In the sanctum:**
   - **Scry** regions of the astral for spirits.
   - **Meditate** to unveil truer names; each truth requires twice as much meditation as the last, and at 12 truths a name is learned.
   - **Bind** four names. Drag one onto a slot, or use *bind*.
3. **Choose a world** and go: *walk into the dark* (five waves and a Warden, fought yourself) or *hold the bastion* (ten waves down a road; raise shrines to your patrons with 1–4 / click, space calls the next wave).

| Control | |
|---|---|
| WASD | move |
| mouse | aim |
| left / right click | speak the first two names |
| 1 / 2 | speak the other two |
| Esc | pause |
| M | mute |

- Every evocation strains your aura. Spamming weakens every word, and overreaching invites backlash.
- At the threshold your bound names are proven in zero knowledge (~2 s each); the dungeon then weighs them.
- Meditation keeps working in the background, even while you fight; what it unveils counts on your next journey. Win a descent to open the next.

Hover over almost anything for an explanation.

## Develop
```sh
corepack pnpm dev            # game (:5190) + dungeon (:5192) together; add ?lag=150 to the URL to feel simulated latency
corepack pnpm test           # Node: universe vectors, authority, meditation, WASM kernel, proofs, dungeon, prediction
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
packages/dungeon      the authoritative round simulation and its wire protocol
apps/game             the browser: sanctum (holds secrets) + thin client for rounds (Vite + Canvas 2D)
apps/dungeon          the dungeon process: WebSocket host for rounds (Node)
apps/tools            CLI tools for benchmarking, simulation and spec work
```
Read [CLAUDE.md](CLAUDE.md) before touching `packages/universe`: its hash spec is frozen, and changing it changes every spirit in existence.

## Docs
| # | Doc | What it covers |
|---|-----|----------------|
| 01 | [Vision](docs/01-vision.md) | Pitch, pillars, core loop, the two axes of power |
| 02 | [Worldbuilding](docs/02-worldbuilding.md) | The astral, spirits, names, vessels, the threshold, the worlds; world ↔ mechanic table |
| 03 | [Mechanics](docs/03-mechanics.md) | Glossary and every formula as it runs today: scrying, naming, vessels, casts, strain, capacity, forms per world, ladders |
| 04 | [Universe spec](docs/04-universe-spec.md) | Exact hashing, cell encoding, trait decoding, claims, the zero-knowledge claim (frozen, v1) |
| 05 | [Overview](docs/05-overview.md) | What the game is today: sanctum, worlds, in-world words ↔ mechanics, numbers |
| 06 | [Architecture](docs/06-architecture.md) | Code layout, the threshold, the dungeon process, prediction, shared races, persistence, testing, extending |
| 07 | [Roadmap](docs/07-roadmap.md) | One sanctum, many worlds; principles; done and next |
| 08 | [Open questions](docs/08-open-questions.md) | What's under discussion, undecided, parked and settled |
| — | [Journal](docs/journal.md) | Build log: every decision, measurement and tradeoff |

New here? Read 01 for the idea, 05 for what exists, and 06 for how it's built. The design docs describe the game *as it is*; when the game changes, they change in the same commit.

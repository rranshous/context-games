# Truenames

*A spell-casting game where the work is the magic.*

Beings dwell in the eightfold astral, a space that divides into eight, then eight again, forever: wisps in the shallows, half as many and a class mightier at each layer down, gods far below, primordials perhaps only in rumor. To **find** a being is to search that space. To **know** one is to meditate until its **words of power** come to you, one facet at a time. Both are real computation done by your machine, so the effort it spends is literally your character's strength. You carry the words you've grasped into the **worlds** (an arena, a tower defense, a card duel, a race), alone or with your **choir**: friends, and **actants**, minds on local models that tend sanctums of their own and play beside you.

![The sanctum: the Name Book, scrying, and the loadout](docs/images/sanctum.png)

## What we're exploring
Truenames is an experiment as much as a game. The threads, and where to read about each:

1. **Work is the magic.** Power is proof of work. The universe is a pure function of a public seed (Poseidon hashes over an infinite octree): a being exists where a hash clears its depth's target, and a word's truths are the difficulty bits of a hash bound to your key. Nothing is stored but what you've earned, as signed claims. A god's first word is about a season of meditation; a primordial's, centuries. → [01 Vision](docs/01-vision.md), [03 Mechanics](docs/03-mechanics.md), [04 Universe spec](docs/04-universe-spec.md)
2. **Prove the details, never the source.** Crossing into a world, each word is proven in zero knowledge: the world learns what it can do (element, form, might, truths), never where its being dwells, and can't link it across rounds. → [05 Overview: the threshold](docs/05-overview.md#the-threshold-zero-knowledge)
3. **One power system, many games.** Your sanctum makes power; worlds only interpret it. The same words become arena spells, tower shrines, cards and car powers, under the same rules of strain and vessels. → [05 Overview: worlds](docs/05-overview.md#worlds-one-power-system-many-games)
4. **No central server.** Three roles, each its own process: your **sanctum** (your secrets, your work), **altars** (gathering places: choirs, talk, shared signs, round calls) and **dungeons** (game servers). Every install runs all three; you belong to several altars and play wherever a round is called. Every connection is encrypted with forward secrecy, and a choir member can **lend you their hum**: meditate on your words against your public key, sealed so the altar can't read it, with every find checked and signed by you. → [06 Architecture: three roles](docs/06-architecture.md#three-roles-sanctum-altar-dungeon)
5. **Actants as players, in the same frame as humans.** An actant tends its own sanctum toward a goal it keeps itself, using the same plan operations you do, and walks into the worlds when its choir calls, playing through driving and fighting code it writes and rewrites. It hears and answers the choir, and remembers its recent decisions. The work is figuring out what a small local model can do with a body like that. → [06 Architecture: the actant](docs/06-architecture.md#the-sanctum-plan-the-actant-and-the-choir-appsgamesrc), [journal](docs/journal.md)
6. **Building with Claude in the loop.** The game is built with Claude, and has room for it: **Explorer Claude** (`window.explorer`) lets Claude play the game itself by code, take screenshots, and shard a model into the app to play a round and write a playtest report; actants and the shard report what seems broken to an **issue inbox**. The [journal](docs/journal.md) records every decision and measurement along the way.

## Status
Playable, on universe spec v2. Four worlds, two of them shared (the Dark for up to four, Dark Racer). A desktop app (Linux AppImage and tar.gz; local builds) runs a whole install: sanctum, altar and dungeon. Actants run on ollama. Not yet: reaching beyond the LAN, LAN discovery, invites, backups, the Open Choir. See [07 Roadmap](docs/07-roadmap.md) and [08 Open questions](docs/08-open-questions.md). Built from 2026-09-27.

## How it fits together
```
 your machine                                   anywhere on the network (often also your machine)
┌───────────────────────────────┐   sealed     ┌──────────────────────────────────────────────┐
│ SANCTUM (your window)         │ ───────────▶ │ ALTARS: choirs, talk, signs, round calls     │
│  scry for beings              │ ◀─────────── │  (relays; reads talk, never lent work)       │
│  meditate words of power      │              └──────────────────────────────────────────────┘
│  keeps every secret, signs    │   proofs     ┌──────────────────────────────────────────────┐
│  the actant tends it          │ ───────────▶ │ DUNGEONS: run rounds of worlds               │
│                               │ ◀─────────── │  verify each proof, simulate, snapshot 20 Hz │
│ THIN CLIENT for rounds        │  snapshots   └──────────────────────────────────────────────┘
└───────────────────────────────┘
```
- **Everything is derived.** Nothing about beings is stored; only a player's words (signed claims) are.
- **At the threshold** the sanctum proves each bound word in zero knowledge against the round's fresh context. The dungeon learns the details, never the source.
- **The dungeon is authoritative.** The client sends intent, predicts its own movement with the dungeon's own code, and draws everything else slightly in the past.

### The worlds
- **The Dark**: an arena. Five waves and a Warden; up to four players together, with more and tougher enemies for each.
- **The Bastion**: tower defense. Each word becomes a shrine along the road to your hearth, and every shrine speaks in your voice.
- **The Council**: a turn-based card duel with a deck of up to twelve proven words.
- **Dark Racer**: a race where your words are your car's powers and strain is engine heat; racers at the same circuit share a grid.

![In the dark](docs/images/dark.png)
![The Bastion](docs/images/bastion.png)
![The Council](docs/images/council.png)
![Dark Racer](docs/images/racer.png)

## Try it
**The desktop app** (a whole install: sanctum, altar and dungeon in one window):
```bash
corepack pnpm install
corepack pnpm desktop:dist        # → apps/desktop/release/Truenames-*-linux-x86_64.AppImage (and a tar.gz)
./apps/desktop/release/Truenames-*-linux-x86_64.AppImage
```
Ubuntu 24.04 needs `sudo apt install libfuse2t64` for the AppImage. `corepack pnpm desktop` builds and runs without packaging.

1. **Choose an element and attune.** Your first word is spoken to the hearth, *Khossim*, a wisp; meditation grasps it in a few minutes.
2. **In the sanctum**, scry regions of the astral for beings, meditate on them (each truth takes twice the work of the last; a word is grasped at 22 truths for a wisp, 4 more per class of might), and bind four words. Hover over almost anything for an explanation.
3. **Choose a world** in the top bar and walk in.

**With a chorister** (an actant on a second identity):
```bash
./apps/desktop/release/Truenames-*-linux-x86_64.AppImage --profile=sammy
```
In the new window: grasp its first word, then paste your main window's altar address (the "your altar: …" line in its **Altars** panel) into **join an altar**. In its **Actant** section, wake it, pick a model (needs [ollama](https://ollama.com); smaller models answer faster), give it a goal in chat or in the goal box, and turn on **the dark** and **races**. When you walk into the Dark, it follows. **Meditate for** beside a member lends them your hum.

**Across a LAN**: run the app on each machine, join one another's altars by address, and allow the dungeon and altar ports (47191, 47192 for the default profile).

| Control (the Dark) | |
|---|---|
| WASD | move |
| mouse | aim |
| left / right click, 1 / 2 | speak your four words |
| Enter (in a lobby) | begin now |
| Esc | pause (alone) |
| M | mute |

## Develop
```sh
corepack pnpm dev            # game (:5190) + a dungeon (:5192) + an altar (:5193); ?lag=150 simulates latency
corepack pnpm test           # 73 tests: universe vectors, authority, meditation, WASM, proofs, worlds, channels, altar
corepack pnpm test:browser   # golden vectors in a headless-Chromium Web Worker
corepack pnpm typecheck
corepack pnpm actant-bench tend|drive   # local models against the actant's real prompt
corepack pnpm tools bench | sim | god-finder | gen-wasm | zk-build
```
pnpm runs through corepack (no global install). In development the game exposes `window.explorer` (Explorer Claude), and issues reported by actants land in `actant-issues.jsonl`.

```
packages/universe     the frozen, deterministic world: Poseidon, cells, beings, facets, words, claims
packages/authority    the rules: per-caster vessels, strain, capacity, ticks
packages/proofs       zero-knowledge word claims (circom circuit, snarkjs prove/verify)
packages/meditation   scrying and word-grinding workers, scheduling, WASM Poseidon kernel
packages/dungeon      the worlds' authoritative simulations, wire protocol, balance, autopilot/autofight
packages/channel      sealed channels and boxes: key agreement, forward secrecy, pinning, sessions
packages/protocol     shared message types, including the altar's
apps/game             the client: sanctum (holds secrets), actant, choirs, lending, thin clients for rounds
apps/dungeon          a dungeon process (rounds), the actant bench, bots
apps/altar            an altar process (choirs, round calls, relays, issue inbox)
apps/desktop          the Electron app: game + dungeon + altar, per-profile saves
apps/tools            CLI tools for benchmarks, simulation and spec work
```
Read [CLAUDE.md](CLAUDE.md) before touching `packages/universe`: its hash spec is frozen, and changing it changes every being in existence.

## Docs
| # | Doc | What it covers |
|---|-----|----------------|
| 01 | [Vision](docs/01-vision.md) | Pitch, pillars, core loop, the two axes of power |
| 02 | [Worldbuilding](docs/02-worldbuilding.md) | The astral, beings, signs, words, vessels, the threshold, worlds, choirs and altars; world ↔ mechanic table |
| 03 | [Mechanics](docs/03-mechanics.md) | Glossary and every formula as it runs today |
| 04 | [Universe spec](docs/04-universe-spec.md) | Exact hashing, encoding, claims, the zero-knowledge claim (frozen, v2) |
| 05 | [Overview](docs/05-overview.md) | What the game is today: sanctum, worlds, choirs and actants, numbers |
| 06 | [Architecture](docs/06-architecture.md) | Code layout, the three roles, encryption, worlds, the actant, lending, Explorer Claude, testing |
| 07 | [Roadmap](docs/07-roadmap.md) | Principles, done, next |
| 08 | [Open questions](docs/08-open-questions.md) | Undecided, parked and settled |
| 09 | [Hands](docs/09-hands.md) | A parked plan: machines with no aura that meditate for you |
| — | [Journal](docs/journal.md) | Build log: every decision, measurement and tradeoff, with Robby's words |

**New here?** Read 01 for the idea, 05 for what exists, 06 for how it's built, and the last few sections of the journal for where things stand. The design docs describe the game *as it is*: when the game changes, they change in the same commit.

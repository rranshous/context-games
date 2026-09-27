# Truenames (working title)

A spell-casting game where **proof of work is the magic**. Spirits live at coordinates in an infinitely deep astral; finding them is hashing, and knowing them is hashing. Your machine's work literally makes your character stronger.

Status: **v0 playable**. M0–M6 were built overnight on 2026-09-27, plus a WASM hash kernel, descents, a boss, sigils and sound. The [journal](docs/journal.md) has every decision and measurement.

## Run it
```sh
corepack pnpm install
corepack pnpm dev          # game at http://localhost:5190/  (vectors-in-a-worker check at /vectors.html)
corepack pnpm test         # universe vectors, meditation, authority (Node)
corepack pnpm test:browser # golden vectors inside a headless-Chromium Web Worker
corepack pnpm typecheck
corepack pnpm tools bench | sim | god-finder [prefix|-] [depth] | vectors
```


## How to play
1. **Choose an element** and **attune**: your machine grinds the hearth-god's name until it rings true (12 bits).
2. **The sanctum** (between walks):
   - **Scrying**: pick a region (element → aspect → tradition) and a depth, then search it. Shallow layers are small and soon exhausted; the deep is endless. *Chart of the astral* shows what you've covered.
   - **Name Book**: meditate on spirits you've found. Each bit of truth costs twice the last; at 12 bits a name is learned. Meditation keeps running in the background (and resumes on reload).
   - **Loadout**: bind up to four learned names.
   - Pick a **descent** (winning one opens the next) and **walk into the dark**.
3. **In the dark**: WASD to move, mouse to aim, left/right click for the first two spells and keys 1 and 2 for the others. Every evocation strains your aura. Strain ebbs, but past your capacity spirits answer with backlash, and spamming lowers your total output. Shamans and the Warden draw from the same wells you do; truer names drink deeper. Stand in a **shrine** to make it search the astral while you fight. `Esc` pauses, `M` mutes.
4. Fall, meditate, return truer.

## Docs

| # | Doc | What it covers |
|---|-----|----------------|
| 01 | [Vision](docs/01-vision.md) | Pitch, pillars, core loop |
| 02 | [Worldbuilding](docs/02-worldbuilding.md) | The astral, spirits, names, aura, the Open Choir |
| 03 | [Mechanics](docs/03-mechanics.md) | Glossary, formulas, tunables |
| 04 | [Universe spec](docs/04-universe-spec.md) | Exact hashing, cell encoding, trait decoding |
| 05 | [Architecture](docs/05-architecture.md) | Packages, interfaces, data model, workers |
| 06 | [v0: local roguelite](docs/06-v0-roguelite.md) | Scope, milestones, acceptance criteria |
| 07 | [Multiplayer roadmap](docs/07-multiplayer-roadmap.md) | Phased path to a shared server, then ZK/ledger |
| 08 | [Open questions](docs/08-open-questions.md) | Parked ideas and undecided calls |
| — | [Journal](docs/journal.md) | Build log: decisions, measurements, tradeoffs |

Reading order for building: 01 → 03 → 04 → 05 → 06. Worldbuilding (02) is for flavor and naming.

`CLAUDE.md` holds conventions for working on this repo with Claude Code.

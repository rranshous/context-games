# Truenames (working title)

A spell-casting game where **proof of work is the magic**. Spirits live at coordinates in an infinitely deep astral; finding them is hashing, and knowing them is hashing. Your machine's work literally makes your character stronger.

Status: **v0 playable** (M0–M6 built overnight 2026-09-27; see [journal](docs/journal.md)).

## Run it
```sh
corepack pnpm install
corepack pnpm dev          # game at http://localhost:5190/  (vectors-in-a-worker check at /vectors.html)
corepack pnpm test         # universe vectors, meditation, authority
corepack pnpm typecheck
corepack pnpm tools bench | sim | god-finder [prefix|-] [depth] | vectors
```


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

Reading order for building: 01 → 03 → 04 → 05 → 06. Worldbuilding (02) is for flavor and naming.

`CLAUDE.md` holds conventions for working on this repo with Claude Code.

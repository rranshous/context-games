# 01 · Vision

## Pitch
Everyone is a warlock, priest or summoner. Power comes from knowing the **true names** of spirits and gods. Spirits live somewhere in the **astral**, an infinitely deep space. Finding a spirit and learning its name are both proof of work: real computation, done by your machine, verified by the universe.

The technical mechanic *is* the world. Hashing isn't hidden behind the fiction; it is the fiction.

## Pillars
1. **Work is the magic.** Discovery = scanning cells. Learning = grinding a name. Power scales with expected work spent, so it is always earned.
2. **Everything is derived.** The universe is a pure function of a public seed. Nothing is stored until a player acts; the authority stores only deltas (names, pools, strain).
3. **Knowledge is the economy.** Spirit locations can be shared and cheaply verified. Names are personal and can't be stolen, but they can be taught: anyone can grind *your* name for you.
4. **Bots and humans are both first-class.** Scripts can scan and meditate. The human game is about spending that power well: timing, positioning, choice.
5. **Static evaluation.** A spirit's traits and a name's strength come from hashes, not from guild membership or social rules. Groups gain power through shared knowledge and labor, not special cases.
6. **Start local, keep the seams.** v0 is a single-player roguelite. The universe lib and authority interface are built so a server drops in later.
7. **Public and simple first.** v1 uses clear-text verification and server rules. Zero-knowledge and ledgers are later phases; we only make the cheap choices now that keep them possible (Poseidon hash, verifier interface).

## Core loop
1. **Scry**: choose a region of the astral (element → aspect → tradition) and scan cells for spirits.
2. **Meditate**: grind a name for a spirit you've found. It gets truer the longer you work.
3. **Evoke**: cast spells by drawing on spirits' shared power pools.
4. **Strain**: your aura tires; spam collapses your output.
5. **Grow**: every true name you hold strengthens your aura's capacity and lowers the strain of that spirit.

## Two axes of power
| | Spirit **magnitude** | Name **strength** |
|---|---|---|
| What | How mighty the spirit is | How truly *you* know it |
| Found by | Searching space (many cells) | Grinding one cell (many nonces) |
| Shared? | Same for everyone | Personal, bound to your aura |
| Rarity | Each extra bit is half as common | Each extra bit costs 2× expected work |

A weak spirit truly named, or a legendary spirit barely named: both are real builds.

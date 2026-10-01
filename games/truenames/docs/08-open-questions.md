# 08 · Open questions and parked ideas

Decisions not yet made, and ideas deliberately set aside. Settled calls move into the doc they affect (and the journal records when and why).

## Decided 2026-10-01: the pyramid and words of power (spec v2)
The astral and what words encode were reworked together with Robby (journal: "Rethinking the astral"). Beings are unknowable forces; might is depth (a pyramid, with a pinch of randomness); a being has several facets and you meditate on **words of power** for them; the bar to grasp a word rises with might; churches hand down **signs**. Numbers in [03](03-mechanics.md), encoding in [04](04-universe-spec.md).

Still open from that discussion:
1. **Regions with character.** Each tradition leans toward forms ("the Glass Choir breeds lances"), so where you scry is a real choice.
2. **Kinship between words.** Words of related beings resonating together (pantheons as patterns people observe, not relationships beings have).
3. **Personal temperament.** Bits of a word's hash shading how the being answers *you*.
4. **Strain and might.** Today a god's word strains like a wisp's at the same resonance.
5. **Ranks in the game.** Showing the player's meditation rank (Initiate … Grand Master) from their hum.
6. **The power curve in practice.** A fresh god word draws ~256× a fresh wisp word; worlds tuned on wisps may need ladders that reach that far.

## Open decisions
1. **Warfare and ownership.** What does conflict *do*? Pure PvP with no ownership, or spatial sites that can be held? Anything exclusive conflicts with "no ownership" in [07](07-roadmap.md).
2. **Attunement and mastery bonuses.** Off today. Under "proofs grant", they'd be conventions a world chooses.
3. **Hardware disparity in shared worlds.** Weak devices vs GPU players. Options: memory-hard hashing for names (breaks ZK friendliness), per-aura rate caps, or accept it. Descents and the log power curve soften it in play.
4. **What counts as "crowded"**, if a census is ever used (knowing a name vs recently calling on it).
5. **Balance at depth.** Every world's deeper levels are tuned only by bots; strong names trivialize the Bastion's first levels.

## Parked
- **Utility spirits:** spells that shed strain or cheapen the next cast. Good for builds and support roles.
- **Aura traits from the key:** decay rate or tolerance from `H(pubkey)`. Risk: players grind keypairs for perfect auras. If ever used, keep traits cosmetic or small.
- **Name drift:** per-epoch seeds so spirits "shed their names" each season and truth resets. Strong anti-whale lever; big emotional cost.
- **Diminishing weight curve:** soften exponential power (the log curve in the Council and Racer already does this per world).
- **Resource exhaustion:** bounded subtrees with a finite number of deposits and per-deposit extraction counters. Fits a crafting or economy layer later.
- **Combining names** (fire + storm → something): hybrid spells from two held names.
- **Spirit temperament vs domination:** spirits that backlash against the strongest holder.
- **Fizzle and misfire backlash:** designed; only recoil is built.
- **Commit-reveal for claims:** only needed if anything becomes first-come ownership.

## Decided (for reference)
- Fantasy setting; everyone is a warlock/priest/summoner. In-world words only on screen.
- Octree cells, Poseidon, public seed, chained cell digest. Spec v2 (2026-10-01): beings from depth 12, `target(d) = 4d − 26`, might = depth class + ⌊surplus/4⌋, facets = might + 1, word bar `22 + 4·might`, seed `truenames_v2`. (v1, 2026-09-27: depth 6, `4 + ⌊3d/2⌋`, 12-truth names.)
- The hearth: a charted wisp every apprentice learns first (v2; the v1 hearth-god Vreiziobain is gone with the v1 astral).
- Discovery: the cell is the lottery ticket; no shortcut from related names.
- Might (being, shared) and truths (word, personal) are separate axes. Words are permanent and bound to the aura.
- Per-caster vessels, not shared wells. Strain is aura-global, measured in bits.
- Zero-knowledge proofs at the threshold; the aura is revealed as identity.
- One power system, many worlds. Difficulty grows by ladders (descents), not by retuning formulas.
- Canvas 2D + DOM, no engine. Mouse-aimed targeting in the Dark.
- No guild powers; groups share knowledge and labor.

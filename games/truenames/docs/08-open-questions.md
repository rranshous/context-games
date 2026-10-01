# 08 · Open questions and parked ideas

Decisions not yet made, and ideas deliberately set aside. Settled calls move into the doc they affect (and the journal records when and why).

## Under discussion: the astral, depth and what names encode (2026-09-30)
Today depth only sets cost and supply: magnitude has the same odds at every depth, traits don't depend on region, and a name encodes only its strength. Proposals on the table (see the journal for the discussion):
1. **Deeper spirits are mightier** (Robby, 2026-09-27: beings deeper in the astral should be harder to find *and* more powerful). E.g. *might* = magnitude + ⌊(depth − 6)/2⌋, used for vessels and titles. The circuit can reveal might without revealing depth (depth is already a private input). Lore: the ancients are worn smooth by millennia of callers; the deep holds the untouched.
2. **Mighty spirits demand truer names.** The learning threshold rises with might (e.g. 12 + ⌊might/2⌋), so a lucky deep find isn't instantly dominant and meditation stays the spine.
3. **Regions with character.** Each tradition leans toward a form and temper ("the Glass Choir breeds lances"), so where you scry is a real choice. Changes the traits of existing spirits.
4. **Personal names.** Bits of the name hash beyond strength set how the spirit answers *you* (a form variant, generosity toward you). Meditation finds different names, not only stronger ones.

Open: ancients as the weakest spirits (the hearth-god a humble start)? A gentle (+1 might per 2 depths) or steep (+1 per depth) curve? All four are a spec v2 (new golden vectors); 1, 2 and 4 also need a new circuit.

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
- Octree cells, Poseidon, public seed, chained cell digest. Spec v1 frozen 2026-09-27: `MIN_SPIRIT_DEPTH = 6`, `target(d) = 4 + ⌊3d/2⌋`, `MIN_NAME_BITS = 12`, seed `truenames_v1`.
- Hearth-god: `011010`, Vreiziobain, dominion (mag 3) of cinderfrost, stingy lance, the mightiest of the 35 ancients.
- Discovery: the cell is the lottery ticket; no shortcut from related names.
- Magnitude (spirit, shared) and strength (name, personal) are separate axes. Names are permanent and bound to the aura.
- Per-caster vessels, not shared wells. Strain is aura-global, measured in bits.
- Zero-knowledge proofs at the threshold; the aura is revealed as identity.
- One power system, many worlds. Difficulty grows by ladders (descents), not by retuning formulas.
- Canvas 2D + DOM, no engine. Mouse-aimed targeting in the Dark.
- No guild powers; groups share knowledge and labor.

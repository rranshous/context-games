# 08 · Open questions and parked ideas

## Open decisions
1. **Warfare and ownership.** What does conflict *do*? Options: pure PvP combat with no ownership; contention over pools as indirect territory; spatial sites that can be held. Does anything transfer, get destroyed, or re-open?
2. **Freeze universe constants.** `MIN_SPIRIT_DEPTH`, `target(d)`, `MIN_NAME_BITS` after the M0 benchmark.
3. **Hearth-god selection criteria.** Magnitude, generosity, element (fire? a neutral element?). Found by `god-finder`.
4. **Attunement and mastery bonuses.** On or off? Currently off by default.
5. **Spell targeting in 2D.** Mouse-aimed vs auto-targeted. Engine: PixiJS vs Phaser vs other.
6. **Hardware disparity in multiplayer.** Weak devices vs GPU players. Options: memory-hard hash for names (but it would break ZK friendliness), per-aura rate caps, or accept it.

## Parked (discussed, deliberately not in v0)
- **Utility spirits:** spells that shed strain or cheapen the next cast. Good for builds and support roles, but more engine complexity.
- **Aura traits from the key:** decay rate or tolerance derived from `H(pubkey)`. Risk: players grind keypairs for perfect auras (vanity-address mining). If ever used, keep traits cosmetic or small.
- **Name drift:** per-epoch seeds so spirits "shed their names" each season and truth resets. Strong anti-whale lever; big emotional cost to players.
- **Diminishing weight curve:** `w = 2^(α·effective)` with α < 1 to soften whale dominance. Currently α = 1.
- **Resource exhaustion:** bounded subtrees (a fixed extra depth below a site) with a finite number of deposits, plus per-deposit extraction counters `H(leaf ‖ k ‖ owner ‖ nonce)` so a deposit empties after Y units. Fits a crafting or economy layer later.
- **Personal name flavor:** small cosmetic variation from the name hash (color, cadence). Must never affect power.
- **Combining names** (fire + storm → something): hybrid spells from two held names.
- **Spirit temperament vs domination:** spirits that backlash against the strongest holder.
- **Commit-reveal for claims:** unnecessary while spirits are shared pools rather than ownable claims; needed if anything becomes first-come ownership.

## Decided during the v0 build (2026-09-27, see journal)
- **Universe constants frozen:** `MIN_SPIRIT_DEPTH = 6`, `target(d) = 4 + ⌊3d/2⌋`, `MIN_NAME_BITS = 12` (was 8), seed = "truenames_v1".
- **Hearth-god:** `011010`, Vreiziobain, dominion (mag 3) of cinderfrost, fire, generosity idx 3 (stingy), lance. The mightiest of the 35 ancient (depth-6) spirits.
- **Engine:** plain Canvas 2D with DOM overlays (no PixiJS or Phaser yet). **Targeting:** mouse-aimed.
- **Attunement/mastery bonuses:** still off.
- **Difficulty vs exponential growth:** descents (a ladder of harder runs) instead of retuning the formula.
- **Hash rate:** a WASM kernel in `meditation` (not in `universe`) with BigInt re-verification.

## Decisions made (for reference)
- Fantasy setting; everyone is a warlock/priest/summoner.
- Octree cells, Poseidon, public seed, chained cell digest.
- Depth = scale of identity: element → aspect → tradition → lineage → spirits.
- Discovery: the cell is the lottery ticket. No cryptographic shortcut from related names; only prefix choice and scan maps.
- Magnitude (spirit, shared) and strength (name, personal) are separate axes.
- Every name is bound to the aura, including tutorial names. Names are permanent.
- No guild powers; groups share knowledge, labor, and presence at pools.
- Pools: token bucket, share ∝ `2^effective`, per-caster cap, water-filling.
- Strain is aura-global, measured in bits, no cooldowns.
- Growth from knowledge: capacity from total name strength; truer names strain less.
- v1 is public and server-ruled; ZK is a later phase.
- v0 is a local single-player roguelite.

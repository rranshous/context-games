# 03 · Mechanics

Glossary, formulas and tunables. Exact hashing lives in [04 · Universe spec](04-universe-spec.md). All numbers here are **starting points** for tuning; they live in `packages/authority/src/tunables.ts`.

## Glossary
| Term | Meaning |
|---|---|
| **cell** | A node in the octree: a path of octants (0–7) from the root. |
| **depth** | Path length. Depth 0 is the root. |
| **bits(h)** | Difficulty bits of a hash: `P(bits ≥ k) = 2^-k`. See spec. |
| **target(depth)** | Bits a spirit hash needs at that depth to exist. |
| **spirit** | A cell where `bits(spiritHash) ≥ target(depth)`. |
| **magnitude** | `bits(spiritHash) − target(depth)`. How mighty the spirit is. |
| **traits** | Decoded from a separate trait hash: form, weight, generosity, flavor. |
| **aura** | A player's public key; also the per-player strain/capacity state. |
| **name** | A nonce for `(cell, aura)`. |
| **strength** | `bits(nameHash)`. How truly the aura knows the spirit. |
| **effective** | Strength after bonuses and strain, used at cast time. |
| **pool** | A spirit's token bucket of power. |
| **grant** | Power a caster actually receives from a pool in a tick. |
| **strain** | Aura-global fatigue, in bits. |
| **capacity** | Max strain an aura can hold before backlash. |
| **tick** | Authority resolution step. |

## Discovery (scrying)
- Pick a prefix (e.g. `fire/storm/choir`). Enumerate cells under it at some depth. For each, compute the spirit hash. That's one hash per cell.
- A cell is the lottery ticket; there is **no nonce** at a single cell during discovery.
- Hit rate per cell is `2^-target(depth)`. Knowing one spirit does **not** make related ones cheaper. The only advantages are the prefix you choose and your record of cells already scanned.
- Magnitude is geometric: `P(magnitude ≥ m | spirit) = 2^-m`.

`target(depth)` starting point: `target(d) = baseTarget + slope * d`, with `baseTarget = 4`, `slope = 1.5`. Deeper space has vastly more cells, so difficulty rises with depth to keep the frontier from exploding. Spirits only exist at `depth ≥ minSpiritDepth` (start: 6). Depths 1–5 are regions, not spirits.

## Naming (meditation)
- For a known spirit, grind `nonce` over `nameHash(cell, aura, nonce)`. Keep the best.
- `strength = bits(nameHash)`. Expected work to reach strength `s` is `2^s` hashes.
- A name is **learned** once `strength ≥ minNameBits` (start: 8).
- Anyone can grind anyone's name (aura keys are public). Only the aura's owner can *submit* it, because submissions are signed.
- The authority stores `best[aura][cell]` and only raises it.

## Pools
Per spirit, a token bucket:
```
poolCap(spirit)    = poolBase    * 2^(poolExp * magnitude)
poolRefill(spirit) = refillBase  * 2^(poolExp * magnitude)   // per tick
```
Start: `poolBase = 100`, `refillBase = 5`, `poolExp = 0.5`.

### Allocation per tick
For each spirit, collect cast requests `i` with requested amount `r_i`:
```
w_i     = 2^effective_i
cap_i   = castCapBase * 2^(capExp * effective_i) * generosity
share_i = pool * w_i / Σw
grant_i = min(r_i, cap_i, share_i)
```
Then **water-fill**: power left over because some casters were capped by `r_i` or `cap_i` is redistributed to the others by weight, repeating until no one can take more or the pool is empty. `pool -= Σ grant_i`.

Start: `castCapBase = 4`, `capExp = 0.5`, `generosity ∈ [0.25, 2]` from traits.

- **Share** handles contention: truer names take more.
- **Cap** handles solo use: a weak name can't drain a god even alone.

## Strain
Aura-global, measured in bits:
```
castStrain = spirit.weight * form.weight * familiarity(strength)
familiarity(s) = max(minFamiliarity, 1 - familiarityRate * (s - minNameBits))

on cast:        strain += castStrain
each tick:      strain *= strainDecay
effective     = strength + bonuses - strain
```
Start: `strainDecay = 0.8`, `familiarityRate = 0.03`, `minFamiliarity = 0.3`, `spirit.weight ∈ [0.5, 3]` from traits, `form.weight` per form (below).

Every point of strain halves pull (via `2^effective`). No cooldowns; spamming collapses output.

**Backlash**: if `strain > capacity`, the cast still resolves at its reduced effective strength, then rolls backlash from the spirit's temper: fizzle (no effect), misfire (random target), or recoil (damage to self). v0: recoil only.

## Capacity (growth)
```
capacity = capBase + capPerBit * Σ max(0, strength_j - capThreshold)   over all names j
```
Start: `capBase = 3`, `capPerBit = 0.1`, `capThreshold = 12`. The threshold stops farming cheap names.

## Growth summary
- Know **more** names → capacity.
- Know names **truer** → more pull, bigger cap, less strain per cast.
- Find **mightier** spirits → bigger, faster pools.

## Spell effect
```
effect = grant * form.efficiency
```
Magnitude matters through the pool: a mighty spirit's pool can feed large grants. Strength matters through share, cap and strain.

### Forms (v0 set)
| id | Form | Shape | form.weight | form.efficiency |
|---|---|---|---|---|
| 0 | bolt | projectile, single target | 1.0 | 1.0 |
| 1 | ring | AoE around caster | 1.5 | 0.6 per target |
| 2 | ward | shield absorbs damage | 1.0 | 1.2 |
| 3 | lance | line piercing | 1.3 | 0.8 per target |
| 4 | nova | delayed large AoE at point | 2.0 | 0.7 per target |
| 5 | summon | spawns an ally for N ticks | 2.0 | ally HP = effect |
| 6 | hex | DoT | 1.2 | effect over 10 ticks |
| 7 | blink | teleport short range | 0.8 | range scales with effect |

Element sets damage type and visuals, and interacts with enemy resistances. It's taken from the depth-1 octant.

## Optional server rules (off by default)
- **Attunement bonus**: +1 effective for spirits under the element you chose at character creation.
- **Mastery bonus**: +1 effective per region depth where you hold ≥ `masteryCount` (5) names of ≥ `masteryMinBits` (14) under the same prefix. Cap total bonus at +2.

These are plain rules on public data. Leave them out of v0 unless the loop needs them.

## Parked (see 08)
Utility spells (strain reduction), aura traits from the key, name drift per epoch, resource exhaustion, warfare/ownership.

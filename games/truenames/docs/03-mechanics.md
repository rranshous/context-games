# 03 · Mechanics

Glossary, formulas and tunables, **as the game runs today**. Exact hashing lives in [04 · Universe spec](04-universe-spec.md). Authority numbers live in `packages/authority/src/tunables.ts`; per-world balance lives in `packages/dungeon/src/balance.ts`. If this doc and those files disagree, the files win and this doc is a bug.

## Glossary
| Term | Meaning |
|---|---|
| **cell** | A node in the octree: a path of octants (0–7) from the root. |
| **depth** | Path length. Depth 0 is the root. |
| **bits(h)** | Difficulty bits of a hash: `P(bits ≥ k) = 2^-k`. See spec. |
| **target(depth)** | Bits a spirit hash needs at that depth to exist. |
| **spirit** | A cell where `bits(spiritHash) ≥ target(depth)`. |
| **magnitude** | `bits(spiritHash) − target(depth)`. How mighty the spirit is. |
| **traits** | Decoded from a separate trait hash: form, weight, generosity, temper, flavor. |
| **aura** | A player's ed25519 public key; also the per-player strain/capacity state. |
| **name** | A nonce for `(cell, aura)`. |
| **strength** (on screen: **truths**) | `bits(nameHash)`. How truly the aura knows the spirit. |
| **learned** | A name with strength ≥ `MIN_NAME_BITS` (12). |
| **effective** | Strength + bonuses − strain, at cast time. |
| **vessel** (code: *pool*) | The caster's own token bucket of a patron's power, for one journey. |
| **grant** | Power a cast actually receives from the vessel. |
| **strain** | Aura-global fatigue, in bits. |
| **capacity** | Max strain an aura can hold before backlash. |
| **tick** | Authority resolution step (200 ms). |
| **world** | A game that spends power: the Dark, the Bastion, the Council, Dark Racer. |

## Discovery (scrying)
- Pick a prefix (element / aspect / tradition) and a depth. Enumerate cells under it at that depth. For each, compute the spirit hash: one hash per cell.
- A cell is the lottery ticket; there is **no nonce** at a single cell during discovery.
- Hit rate per cell is `2^-target(depth)`, with `target(d) = 4 + ⌊3d/2⌋` and spirits only at `depth ≥ 6`. Each layer has 8× the cells but needs 1.5 more bits, so deeper layers hold more spirits, each costlier to find:

  | depth | spirits in the layer | hashes per find |
  |---|---|---|
  | 6 | ~32 (the 35 ancients) | ~8k |
  | 7 | ~90 | ~23k |
  | 8 | ~256 | ~65k |
  | 10 | ~2k | ~500k |
  | 12 | ~16k | ~4M |

- Magnitude is geometric and **the same at every depth**: `P(magnitude ≥ m | spirit) = 2^-m`. Today depth sets cost and supply, not might (open question, see [08](08-open-questions.md)).
- Knowing one spirit does **not** make related ones cheaper. The only advantages are the prefix you choose and your record of cells already scanned. Traits don't depend on the region either.

## Naming (meditation)
- For a known spirit, grind `nonce` over `nameHash(cell, aura, nonce)`. Keep the best.
- `strength = bits(nameHash)`. Expected work to reach strength `s` is `2^s` hashes ("each truth requires twice as much meditation to unveil").
- A name is **learned** once `strength ≥ MIN_NAME_BITS = 12`.
- Anyone can grind anyone's name (aura keys are public). Only the aura's owner can *submit* it, because claims are signed.
- The sanctum keeps signed claims and only ever raises a name.

## The threshold
Before a journey into a world, each name you carry is proven in zero knowledge against the world's fresh context. The proof reveals the spirit's element, gameplay traits, a magnitude and truths it clears (it may understate, never overstate) and a round tag; it hides the address, depth, nonce and trait hash. Your aura is revealed (it is your character). Names are **locked in** at departure. Details in [06](06-architecture.md#the-threshold-sanctum--round).

## Vessels
Each (caster, patron) pair has its own token bucket for the journey, created full:
```
vesselCap(spirit)    = poolBase   * 2^(poolExp * magnitude)     // 100 · 2^(m/2)
vesselRefill(spirit) = refillBase * 2^(poolExp * magnitude)     // 5 · 2^(m/2) per tick
```
Nothing is shared: two players (or a player and a shaman) on the same spirit each have their own vessel. One cast per aura per spirit per tick; a second is refused `duplicate`.

## A cast
```
effective = strength + bonus − strain                     // bonus: optional rules, 0 today
cap       = castCapBase · 2^(capExp · (effective − capRef)) · generosity   // 12 · 2^((eff − 12)/2) · g
grant     = min(request, cap, vessel level)
vessel   −= grant
```
- **Cap** handles solo use: a weak name can't drain a god even alone. Each truth of effective raises the cap by √2.
- `generosity = 0.25 · 2^(generosityIdx · 3/15)`, so 0.25 (stingy) to 2 (generous).
- A truer name draws more; a strained aura draws less (every point of strain costs a truth).

## Strain
Aura-global, measured in bits:
```
castStrain     = strainScale · spirit.weight · form.weight · familiarity(strength)
familiarity(s) = max(0.3, 1 − 0.03 · (s − 12))
spirit.weight  = 0.5 + weightIdx / 6                        // 0.5 .. 3
on cast:   strain += castStrain
each tick: strain *= 0.9
```
No global cooldowns: spamming collapses output. (A world may add its own; Dark Racer has a 1.1 s per-name cooldown.)

**Backlash**: if `strain > capacity` after a cast, it resolves at its reduced effective strength, then rolls `chance = clamp((strain − capacity) · 0.35, 0.25, 1)`. On a hit: **recoil** of `grant · 0.6` to the caster. (Fizzle and misfire are designed, not built.)

## Capacity (growth)
```
capacity = capBase + capPerBit · Σ max(0, strength_j − capThreshold)   // 4 + 0.1 · Σ(s − 12)
```
In a world, capacity counts the names you carried in. The threshold stops farming cheap names.

## Growth summary
- Know **more** names → capacity.
- Know names **truer** → bigger cap, less strain per cast.
- Find **mightier** spirits → bigger, faster vessels.

## Forms
Every spirit has one of eight forms. `effect = grant · form.efficiency` in the Dark; other worlds turn grants into their own numbers (below).

| id | Form | form.weight | form.efficiency | Dark | Bastion shrine | Council card | Dark Racer |
|---|---|---|---|---|---|---|---|
| 0 | bolt | 1.0 | 1.0 | projectile | seeking bolts | strike | seeking bolt, spins out |
| 1 | ring | 1.5 | 0.6 | burst around you | pulses | half to all enemy creatures | shockwave shove |
| 2 | ward | 1.0 | 1.2 | shield | slowing field | shield | breaks the next strike |
| 3 | lance | 1.3 | 0.8 | piercing line | piercing line | creature + overflow | beam that slows |
| 4 | nova | 2.0 | 0.7 | delayed blast | artillery | bursts next turn | mine behind you |
| 5 | summon | 2.0 | 1.0 | ally | road guardian | servant | hunter of the leader |
| 6 | hex | 1.2 | 1.0 | damage over time | damage over time | lingers 3 turns | slick behind you |
| 7 | blink | 0.8 | 1.0 | teleport | throws a foe back | draw two | jump down the road |

Element sets damage type and visuals (the depth-1 octant).

## Turning grants into game numbers
Grants grow exponentially with truths (√2 per truth). That suits the Dark, where descents grow enemies just as fast. Worlds with small fixed numbers compress it:
```
power = max(1, round(scale · log2(1 + grant · form.efficiency)))   // logPower(), scale 1.2
```
About one point per two truths. The Council and Dark Racer use it.

## Difficulty: descents
Each world has a ladder of levels (descents, seats, circuits). Exponential name growth is answered by a harder ladder rather than by flattening the formulas:
- **Dark**: per descent ×1.7 enemy life, ×1.2 damage, +15% count, shamans +2 truths.
- **Bastion**: per level ×1.7 foe life and +15% count.
- **Council**: the Warden sits at your deck's median truths − 3 (min 14), +2 per seat, +8 life per seat; card costs count truths above that table.
- **Dark Racer**: rivals hold 14 truths +2 per circuit and drive 0.84–0.91 of top speed, +0.025 per circuit.

## Optional server rules (off)
- **Attunement bonus**: +1 effective for spirits under the element you chose at creation.
- **Mastery bonus**: +1 effective per region depth where you hold ≥ 5 names of ≥ 14 truths under the same prefix. Cap +2.

Plain rules on public data. Under "proofs grant, never restrict", these would be conventions a world chooses to honor.

## Parked
See [08](08-open-questions.md): deeper spirits mightier, regions with character, personal names, utility spells, name drift, resource exhaustion.

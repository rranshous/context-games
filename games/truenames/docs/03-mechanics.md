# 03 · Mechanics

Glossary, formulas and tunables, **as the game runs today**. Exact hashing lives in [04 · Universe spec](04-universe-spec.md). Authority numbers live in `packages/authority/src/tunables.ts`; per-world balance lives in `packages/dungeon/src/balance.ts`. If this doc and those files disagree, the files win and this doc is a bug.

## Glossary
| Term | Meaning |
|---|---|
| **cell** | A node in the octree: a path of octants (0–7) from the root. |
| **depth** | Path length. Depth 0 is the root. |
| **bits(h)** | Difficulty bits of a hash: `P(bits ≥ k) = 2^-k`. See spec. |
| **target(depth)** | Bits a spirit hash needs at that depth to exist: `4·depth − 26`. |
| **being** (code: *spirit*) | A cell where `bits(spiritHash) ≥ target(depth)`. Beings begin at depth 12. |
| **might** (code: *magnitude*) | `(depth − 12) + ⌊surplus bits / 4⌋`: wisp 0 … god 4 … primordial 7. |
| **sign** | What a culture hands down to find a being: its address, in-world. |
| **facet** | One of a being's ways of acting; a being has might + 1 of them (max 8), each with its own form. |
| **traits** | Decoded from a separate trait hash: the facets' forms, weight, generosity, temper, flavor. |
| **aura** | A player's ed25519 public key; also the per-player strain/capacity state. |
| **word** (of power) | A nonce for `(cell, aura)`; its hash says how true it is and which facet it touched. |
| **strength** (on screen: **truths**) | `bits(nameHash)`. How truly the aura knows the facet. |
| **bar** | The truths a word needs to be grasped: `22 + 4·might`. |
| **grasped** (code: *learned*) | A word with strength ≥ its being's bar. |
| **resonance** | Truths beyond the bar. |
| **effective** | Strength + bonuses − strain, at cast time. |
| **vessel** (code: *pool*) | The caster's own token bucket of a patron's power, for one journey. |
| **grant** | Power a cast actually receives from the vessel. |
| **strain** | Aura-global fatigue, in bits. |
| **capacity** | Max strain an aura can hold before backlash. |
| **tick** | Authority resolution step (200 ms). |
| **world** | A game that spends power: the Dark, the Bastion, the Council, Dark Racer. |

## Discovery (scrying): the pyramid
- Pick a prefix (element / aspect / tradition) and a depth. Enumerate cells under it at that depth. For each, compute the spirit hash: one hash per cell.
- A cell is the lottery ticket; there is **no nonce** at a single cell during discovery.
- Hit rate per cell is `2^-target(depth)` with `target(d) = 4d − 26` (22 bits at depth 12). Each layer has 8× the cells but needs 4 more bits, so each layer down holds **half as many beings**, each **16× harder to find**, and **one class mightier**. Solo, at full speed on a good desktop (~9k divisions/s searched):

  | depth | class | beings in the universe | to find one |
  |---|---|---|---|
  | 12 | wisp | 16,384 | ~8 min |
  | 13 | spirit | 8,192 | ~2 h |
  | 14 | power | 4,096 | ~1½ days |
  | 15 | dominion | 2,048 | ~3 weeks |
  | 16 | **god** | 1,024 | **~1 year** |
  | 17 | great god | 512 | ~16 years |
  | 18 | elder god | 256 | ~250 years |
  | 19 | primordial | 128 | ~4,000 years |

- **Outliers**: the surplus bits beyond the target add a class every 4 bits, so 1 in 16 beings is one class above its depth, 1 in 256 two. (Lore: proof that beings *can* move, over eons.)
- Knowing one being does **not** make related ones cheaper. The only advantages are the prefix you choose and your record of cells already scanned. Traits don't depend on the region.

## Words of power (meditation)
- For a known being, grind `nonce` over `nameHash(cell, aura, nonce)`. Each word lands on the facet its hash's low bits pick (you see every facet the moment you find the being, but **you can't aim**: words come to facets as they will). Keep the truest word per facet.
- `strength = bits(nameHash)`. Expected work to reach strength `s` is `2^s` ("each truth requires twice as much meditation to unveil").
- A word is **grasped** once `strength ≥ bar = 22 + 4·might`: each class is 16× harder to learn, mirroring 16× harder to find. At ~38k utterances/s (an acolyte's hum), a first word takes: wisp ~2 min, spirit ~30 min, power ~8 h, dominion ~5 days, **god ~3 months**, great god ~4 years, elder god ~60 years, primordial ~900 years. A word for every facet takes several times longer (the last facets keep eluding you).
- Anyone can grind anyone's words (aura keys are public). Only the aura's owner can *submit* them, because claims are signed. The sanctum keeps signed claims and only ever raises a word.

## Ranks of meditation
Ranks are 16× apart (one class of being each): Initiate ~2.5k/s, Acolyte ~40k/s, Adept ~600k/s, Magus ~10M/s, Hierophant ~150M/s, Grand Master ~2.5B/s. "An adept grasps a god's word as fast as an acolyte grasps a dominion's." (Design; not shown in the game yet.)

## The threshold
Before a journey into a world, each word you carry is proven in zero knowledge against the world's fresh context. The proof reveals the being's element, exact might, the facet and its form, the being's weight/generosity/temper, the truths the word clears (it may understate, never overstate) and a round tag; it hides the address, depth, nonce and trait hash. Your aura is revealed (it is your character). Words are **locked in** at departure. Details in [06](06-architecture.md#the-threshold-sanctum--round).

## Vessels
Each (caster, being) pair has its own token bucket for the journey, created full, **shared by all of that being's words**:
```
vesselCap(being)    = poolBase   * 2^(poolExp * might)     // 100 · 4^might
vesselRefill(being) = refillBase * 2^(poolExp * might)     // 5 · 4^might per tick
```
Nothing is shared between casters: two players (or a player and a shaman) on the same being each have their own vessel. A being answers once a breath: one cast per aura per being per tick, whichever facet; a second is refused `duplicate`.

## A cast
```
effective = strength + bonus − strain                     // bonus: optional rules, 0 today
cap       = castCapBase · 2^(capExp · (effective − capRef)) · generosity   // 12 · 2^((eff − 22)/2) · g
grant     = min(request, cap, vessel level)
vessel   −= grant
```
- **Cap** handles solo use: a weak word can't drain a god even alone. Each truth of effective raises the cap by √2. Since a word's bar rises 4 truths a class, **a fresh word draws ×4 per class** (a fresh god word ~256× a fresh wisp word), and vessels keep pace (×4 per class).
- `generosity = 0.25 · 2^(generosityIdx · 3/15)`, so 0.25 (stingy) to 2 (generous).
- A truer word draws more; a strained aura draws less (every point of strain costs a truth).

## Strain
Aura-global, measured in bits:
```
castStrain     = strainScale · being.weight · form.weight · familiarity(resonance)
familiarity(r) = max(0.3, 1 − 0.03 · r)                      // r = truths beyond the bar
being.weight   = 0.5 + weightIdx / 6                        // 0.5 .. 3
on cast:   strain += castStrain
each tick: strain *= 0.9
```
No global cooldowns: spamming collapses output. (A world may add its own; Dark Racer has a 1.1 s per-word cooldown.) Strain doesn't rise with might: a god's word weighs what a wisp's does at the same resonance (to revisit).

**Backlash**: if `strain > capacity` after a cast, it resolves at its reduced effective strength, then rolls `chance = clamp((strain − capacity) · 0.35, 0.25, 1)`. On a hit: **recoil** of `grant · 0.6` to the caster. (Fizzle and misfire are designed, not built.)

## Capacity (growth)
```
capacity = capBase + capPerBit · Σ max(0, strength_j − capThreshold)   // 4 + 0.1 · Σ(s − 22)
```
In a world, capacity counts the words you carried in. The threshold stops farming cheap words.

## Growth summary
- Hold **more** words → capacity.
- Hold words **truer** (resonance) → bigger cap, less strain per cast.
- Grasp words of **mightier** beings → a far higher cap (×4 a class) and bigger vessels; and a mightier being has more facets to learn.

## Forms
Every facet has one of eight forms; a being never repeats one. `effect = grant · form.efficiency` in the Dark; other worlds turn grants into their own numbers (below).

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
Each world has a ladder of levels (descents, seats, circuits). Exponential word growth is answered by a harder ladder rather than by flattening the formulas. Computer-controlled casters speak **charted beings** (public, in `world.ts`) with synthetic words set relative to each being's bar:
- **Dark**: per descent ×1.7 enemy life, ×1.2 damage, +15% count; per player past the first +60% count and +25% life; shamans at bar + wave + 2/descent, the Warden at bar + 7 + 2/descent on the mightiest charted being.
- **Bastion**: per level ×1.7 foe life and +15% count.
- **Council**: a card costs 1 + its being's might (+1 for summon or nova). The Warden plays charted beings with your deck's median resonance − 3, +2 per seat, +8 life per seat.
- **Dark Racer**: rivals hold two charted beings each at their bar +2 per circuit, and drive 0.84–0.91 of top speed, +0.025 per circuit.

## Optional server rules (off)
- **Attunement bonus**: +1 effective for spirits under the element you chose at creation.
- **Mastery bonus**: +1 effective per region depth where you hold ≥ 5 grasped words under the same prefix. Cap +2.

Plain rules on public data. Under "proofs grant, never restrict", these would be conventions a world chooses to honor.

## Parked
See [08](08-open-questions.md): regions with character, kinship between words, personal temperament, strain by might, utility spells, name drift, resource exhaustion.

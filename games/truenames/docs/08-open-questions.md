# 08 · Open questions and parked ideas

## Open decisions
1. **Warfare and ownership.** What does conflict *do*? Options: pure PvP combat with no ownership; contention over pools as indirect territory; spatial sites that can be held. Does anything transfer, get destroyed, or re-open?
2. **Freeze universe constants.** `MIN_SPIRIT_DEPTH`, `target(d)`, `MIN_NAME_BITS` after the M0 benchmark.
3. **Hearth-god selection criteria.** Magnitude, generosity, element (fire? a neutral element?). Found by `god-finder`.
4. **Attunement and mastery bonuses.** On or off? Currently off by default.
5. **Spell targeting in 2D.** Mouse-aimed vs auto-targeted. Engine: PixiJS vs Phaser vs other.
6. **Hardware disparity in multiplayer.** Weak devices vs GPU players. Options: memory-hard hash for names (but it would break ZK friendliness), per-aura rate caps, or accept it.

## Parked (discussed, deliberately not in v0)
- **Deeper beings are mightier** (Robby, 2026-09-27). Lore intent: beings deeper in the astral are harder to find *and* more powerful. Today they aren't. Magnitude is `bits − target(depth)`, so its distribution is identical at every depth and depth only sets cost and supply. It can be done **without touching the frozen universe** by making depth an authority-side factor, e.g. well size/refill `× depthFactor^(depth − 6)`, and/or lighter strain for deeper spirits. Titles could fold depth in too ("an elder god of the deep"). Tension to resolve: in multiplayer, depth already pays through *less contention*; stacking raw power on top may make shallow spirits worthless. Decide alongside the shared-world design.
- **Utility spirits:** spells that shed strain or cheapen the next cast. Good for builds and support roles, but more engine complexity.
- **Aura traits from the key:** decay rate or tolerance derived from `H(pubkey)`. Risk: players grind keypairs for perfect auras (vanity-address mining). If ever used, keep traits cosmetic or small.
- **Name drift:** per-epoch seeds so spirits "shed their names" each season and truth resets. Strong anti-whale lever; big emotional cost to players.
- **Diminishing weight curve:** `w = 2^(α·effective)` with α < 1 to soften whale dominance. Currently α = 1.
- **Resource exhaustion:** bounded subtrees (a fixed extra depth below a site) with a finite number of deposits, plus per-deposit extraction counters `H(leaf ‖ k ‖ owner ‖ nonce)` so a deposit empties after Y units. Fits a crafting or economy layer later.
- **Personal name flavor:** small cosmetic variation from the name hash (color, cadence). Must never affect power.
- **Combining names** (fire + storm → something): hybrid spells from two held names.
- **Spirit temperament vs domination:** spirits that backlash against the strongest holder.
- **Commit-reveal for claims:** unnecessary while spirits are shared pools rather than ownable claims; needed if anything becomes first-come ownership.

## Direction: multiplayer split (Robby, 2026-09-27)
*Built locally (2026-09-28): the sanctum/round split, zero-knowledge proofs at the threshold, per-caster vessels, and names locked at departure. See 09/10 and the journal. Not built: separate servers, grants, deeds, titles.*

- **Two halves.** The **sanctum** is persistent and asynchronous: scrying, meditation, names, knowledge, the Open Choir. The **dungeon** is instanced action where you fight things or other players. They run on separate servers, and the dungeon lies outside the sanctum server's purview.
- **Locked at departure.** What you bring in (your names as signed claims, and your capacity) is fixed for the journey. Meditation that finishes mid-journey counts next time.
- **Borrowed power replaces wells in the dungeon.** At departure each patron (spirit) lends you a **vessel**: a size and refill rate, locked in, **per player**, never shared or contested inside the dungeon. The sanctum computes it from the spirit's magnitude, your truths, and how crowded the patron is (many callers means each gets less; the truest names get more), plus optionally depth and patron fatigue. The dungeon server only needs the signed grant.
- **Lost:** live contention inside a dungeon (shamans thinning your wells, "rivals at this well"). Enemy casters draw on their own power. **Kept:** crowding costs, truer names pay, magnitude matters, deep uncrowded finds are valuable, and all of it is felt at departure.
- **Open:** what counts as "crowded" (knowing a name vs recently calling on it); whether vessel math includes depth ("deeper beings are mightier", below); how PvP interacts with borrowed power.
- **Many games, one power system.** The sanctum makes power; any number of action games (dungeons, mini-games, whole games) spend it. They share one contract, the **grant**: a document signed by the sanctum listing your aura, your powers (spirit, name, element, form, magnitude, traits, truths, vessel size/refill) and capacity, with issue/expiry. A game verifies the signature and never needs to call the sanctum again. Each game decides what forms mean in its own mechanics and may reuse the shared strain/vessel rules. **Games can never create power**; only sanctum work makes names truer.
- **Reporting back: deeds.** A deed is a record of something done in a game, **signed by the game's key and by the player's aura**, referencing the grant it was played with. Trust is scoped to the game that signed it, not to a central server; the player's signature means nothing can be pinned on them. A game *may* issue deeds as a linked series if it wants a running history; that is optional, not assumed.
- **Titles are computed, not issued**: public rules over deeds (e.g. three Warden deeds from games you respect → "Warden-bane"). Other connections that stay out of power: names gaining renown/epithets from deeds they were voiced in; games rewarding **spirit locations** (zero trust needed, since anyone can verify a spirit exists at an address); aggregate renown per spirit. Deterministic games can later make deeds replay-verifiable (seed + inputs), and ZK proofs are the long-term version.
- **Design principle: proofs grant, they never restrict.** Everything a player holds is information and capability. A game can ignore a penalty but cannot deny a fact, so mechanics must be things a player *gains by proving*, never taxes every game must remember to apply. Three layers:
  - *Facts:* claims, spirits, depth and fame, all derived or signed.
  - *Capabilities:* what facts let you do. Only names you hold can be spoken; only locations you know can be meditated on.
  - *Conventions:* games *choose* to reward facts. A shared rules package makes good conventions easy to adopt, but nothing depends on every game following them.
- **Crowding, re-examined.** A global census gets the incentives backwards: your share is `your weight / everyone's`, so publishing a strong claim costs you nothing and thins everyone else, which makes it a weapon, and the census is only as complete as people choose. **Global crowding is dropped as a mechanic.** Its two jobs that still matter are recast as capabilities:
  - *Popularity cost → reward rarity.* Obscure patrons grant *more* (rather than famous ones less). Obscurity is derivable without trust: fame from the Open Choir's public deterministic schedule, or depth. Games that honor it offer a bonus; games that don't aren't punishing anyone.
  - *Secrecy value → secrets are capabilities.* Knowing a spirit's location is the capability: only those who know it can meditate its name at all. The Choir publishing it ends the monopoly and others start meditating, so the edge decays rather than vanishes: the "half-life of private discoveries", with no rule to enforce. Games may reward it further, e.g. "a patron no one else in this match holds", computed from the claims presented at match start.
  - *Presence* (orders dominating a goddess) has no replacement yet.

- **Servers are services over proofs, not authorities.**
  - *Trust model:* server code can be open source, but you trust the **operator**. If an operator goes bad, players **migrate their proofs** to a more respectable one. Nothing important lives only on a server: claims verify themselves and the universe is recomputed from the public seed, so a new server re-verifies everything and carries on.
  - *A bad operator cannot* forge names (they're signed by the aura), steal names (they're bound to the key) or invent spirits (the universe is public). *It can* leak what you gave it (without ZK, a claim reveals which spirit you know and how truly), skew or withhold census data, and refuse service. Exit fixes the last.
  - *Disclose only what you need:* submit only the claims a service needs, e.g. the names you are taking on a journey. A name never submitted also never counts toward its crowd, so hiding a find and crowding its well are the same choice ("a name kept silent is not heard at the well").
  - *What needs no server at all:* names (self-verifying claims), spirits and locations (recomputable from the seed), deeds (signed by the game), and even vessels. `vessel = f(magnitude, truths, crowd)` is computable by any game server from claims plus a crowd figure, so a signed grant is optional. Each dungeon or game can be its own server, **including player-hosted**; the client brings its proofs.
  - *The one shared thing is the crowd* (a global aggregate no single proof contains). It is **measured in work**: each holder counts `2^truths`, so faking a crowd costs the same meditation it adds, and the census is sybil-resistant by construction. Any public bulletin board of claims can serve as a census (a server, a feed, a ledger later), and game servers can fall back to a **local crowd** over the claims they've seen. The trust question shrinks from "is the count honest?" to "is the list complete?": an operator can hide claims but not fake them.
  - *So a "central" server is optional*, one kind of service among many, each working only from proofs: bulletin board/census, the Open Choir (scheduled public sweep), directory (games, players, guilds), guild and market servers (shared scan maps, name-teaching queues, knowledge trading), backups. None owns power; any can be replaced by migrating proofs.
  - *Principle to protect:* **no ownership, first-come or exclusive resources.** Those need agreed ordering in time, which proofs alone can't give, and would reintroduce a real central authority (or a ledger). Keeping everything shared and derived is what makes the serverless shape possible.

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

# 07 · Roadmap

Where Truenames is going, and the principles that decide how. What's built is in [05](05-overview.md); undecided questions are in [08](08-open-questions.md).

## The shape: one sanctum, many worlds (Robby, 2026-09-27)
- **Two halves.** The **sanctum** is persistent and asynchronous: scrying, meditation, names, knowledge, the Open Choir. **Worlds** are games where you spend power: dungeons, duels, races, whole games. Worlds lie outside the sanctum's purview.
- **Locked at departure.** What you carry in (proven names, capacity) is fixed for the journey. Meditation that finishes mid-journey counts next time.
- **Borrowed power.** Each patron lends you a **vessel** for the journey: per player, never shared or contested inside a world. (This replaced shared wells, whose crowding couldn't survive the split; see "Crowding" below.)
- **Games can never create power.** Only sanctum work makes names truer. Each world decides what forms *mean* in its mechanics and reuses the shared strain/vessel rules.

## Principles
- **Prove the details, never the source.** Worlds receive zero-knowledge proofs of what a name can do, never where its spirit dwells. The aura is revealed on purpose: it is your persistent character.
- **Proofs grant, they never restrict.** Everything a player holds is information and capability. A game can ignore a penalty but cannot deny a fact, so mechanics are things a player *gains by proving*. Three layers:
  - *Facts*: claims, spirits, depth and fame, all derived or signed.
  - *Capabilities*: what facts let you do (only names you hold can be spoken; only locations you know can be meditated).
  - *Conventions*: games *choose* to reward facts. A shared rules package makes good conventions easy to adopt; nothing depends on every game following them.
- **Servers are services over proofs, not authorities.** You trust the *operator*; if one goes bad, players migrate their proofs elsewhere. A bad operator cannot forge names (signed by the aura), steal them (bound to the key) or invent spirits (the universe is public). It *can* leak what you gave it (less with ZK), skew census data, or refuse service; exit fixes the last. Disclose only what a service needs.
- **No ownership, first-come or exclusive resources.** Those need agreed ordering in time, which proofs alone can't give, and would bring back a real central authority (or a ledger). Keeping everything shared and derived is what makes the serverless shape possible.

## Crowding, re-examined
A global census of who knows which spirit gets the incentives backwards: publishing a strong claim costs you nothing and thins everyone else, and the census is only as complete as people choose. **Global crowding is dropped as a mechanic.** Its useful jobs become capabilities:
- *Reward rarity, don't tax popularity.* Obscure patrons can grant *more*. Obscurity is derivable without trust (depth, or fame from the Open Choir's public schedule); worlds that honor it offer a bonus.
- *Secrets are capabilities.* Knowing a location is what lets you meditate its name at all. When the Choir publishes it, others start meditating and your edge decays: the "half-life of private discoveries", with no rule to enforce. Worlds may reward rarity in a match ("a patron no one else here holds").
- *If a census is ever needed*, measure it in work (each holder counts `2^truths`, so faking a crowd costs the meditation it adds). Any bulletin board of claims can serve; a world can fall back to the claims it has seen.
- *Presence* (orders dominating a goddess) has no replacement yet.

## Platform direction: serverless, desktop (2026-10-01)
- **No central server required.** Any instance can host worlds (the dungeon) and a choir hub. Instances find each other on the LAN, or by address. A bootstrap/relay server is optional, only for reaching beyond the LAN.
- **A desktop app**, wrapped with Electron (it runs today's client, workers, WASM, prover and the Node dungeon in-process). Watch for it becoming "too much"; Tauri is the lighter alternative.
- **Easy to share**: a download link on a web page (single-file builds where possible). The web dev loop stays the fast path for iteration.
- **Local models** through a local ollama for now; bundling later, if ever.

## Done
- Sanctum/world split, names locked at departure, per-caster vessels.
- Zero-knowledge proofs at the threshold (Groth16, local dev ceremony), parallel provers.
- The dungeon as its own process; client prediction, reconciliation, interpolation.
- Four worlds: the Dark, the Bastion, the Council, Dark Racer.
- **First shared world**: Dark Racer races with a 15 s lobby, players replacing rivals.
- **Universe spec v2**: the pyramid of might, facets, words of power, the hearth and 25 charted beings.
- **The desktop app**: Electron, with the dungeon in-process, per-profile saves, LAN-joinable worlds, hush in the worlds, and AppImage + tar.gz builds.
- **Actants, first four milestones**: the sanctum plan (aims, planner, history); the mind (a local model reviewing on events, through the player's own plan operations); the choir (presence, chat and shared signs); racing (a standing order to join, self-written driving code). See the journal.

## Next
Roughly in order; each is independently useful.
0. **Quiet the hum during play** (Robby, 2026-10-01): background meditation and scrying cut the framerate in worlds. Scale voices down automatically while a world is on screen (restore after; player override).
0. **A sanctum UI pass for v2** (Robby, 2026-10-01: "we'll def want to focus on the UI here at some point"): show the pyramid of might, beings' facets and your words as first-class, not as v1's layout with new details.
1. **More shared worlds.** Co-op in the Dark (the sim already supports several players), a PvP Council seat. Lag compensation once players fight players.
2. **Aura backup and export.** Today losing the browser's storage loses every name. Export/import of the save, then a backup service that stores only signed claims.
3. **Sanctum services.** A bulletin board of claims (optional census), grants (a signed vessel/capacity summary a world can accept instead of recomputing) and **deeds** (records of what happened in a world, signed by the world and by the player; a series is optional, not assumed). **Titles are computed, not issued**: public rules over deeds.
4. **The Open Choir.** A public sweep in a published deterministic order, fed by client tithes, publishing every find on schedule. The sweep rate sets the half-life of private discoveries. The Choir never evokes.
5. **Knowledge and teaching.** Name gifting (grind someone's `(cell, aura)`, hand over the nonce; they sign), shared scan maps, guild servers. Orders as social structures only.
6. **A real trusted setup** (a multi-party ceremony) before any world is run by someone players don't trust.
7. **Conflict** (needs the warfare decision in 08): PvP with the same casting rules, possibly spatial sites.
8. **The choir: actants as players** (shape agreed 2026-10-01; slices not yet planned). A **chorister** is a full game instance with its own head (a window), its own aura and words, and a mind running on a local model (ollama). It can meditate for you (it grinds words on your aura; you sign them), meditate for itself, and play in the worlds through policy code it writes and rewrites itself (the embodied-soma pattern). Run it on the same machine or others; more machines is more compute, which is the point: **compute is the capability ceiling**. A choir hub (shared signs, a work board, chat) lives in whichever instance hosts.
9. **Ledger (optional).** For names and discoveries, never for real-time play.

## Actants and choirs: next (Robby, 2026-10-01)
- **Same frame, same game**: actants and humans use the same sanctum, plan operations, choir and worlds. A hard rule.
- **Models (bench, 2026-10-01)**: qwen3:8b stays the default (7/8 sanctum scenarios, ~2–3 min a review on CPU). `lfm2.5-2.6b` tends well but always thinks (4–10 min a review on CPU); `lfm2.5-350m` can't tend (3/24). For driving code, no local model has yet improved on the default by understanding it.
- **Make words matter in races** (or score more than place): with one wisp-class lance, place barely depends on the driving code (default 2.89, silent autopilot 3.00 over 18 races), so a rewrite loop has nothing to learn from. Truer words don't help either: power caps at the wisp's vessel from ~30 truths, and a lance's slow goes from only 1.4 s to 1.7 s (journal, 2026-10-01). Racing needs a balance pass where truths show.
- **Choirs over the Internet**: WebRTC data channels, a rendezvous-only server plus a relay, chat and signs signed and encrypted by auras. No open home ports, no trusted server.
- **LAN discovery**: mDNS; "choirs nearby".
- **Invites**: a link or code that spins up a choir member on a friend's spare machine.
- **Churches and guilds**: a church's choir of members' choristers, or a choir of choirs. What pooled hum buys an order, and what it costs a member.
- **Race telemetry** for actants to reflect on (lap times, spins, words spoken), so the driving-code rewrite loop has something to work with.

## What must not change
- Spec v1 hashing, cell encoding, trait decoding, `target`, `bits` (or it's a new universe, which could be a lore event, "the Sundering").
- The `Authority`, `NameVerifier` and `ProofVerifier` interfaces (extend, don't break).
- Claim formats (add fields, never reinterpret).

Changing what the circuit proves is allowed (proofs are per journey) but needs a new trusted setup.

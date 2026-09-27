# 06 · v0: local roguelite

Single-player, fully local, 2D (top-down or pseudo-3D). The goal is to test the core loop (scry, meditate, evoke, strain, grow) and tune difficulty against real hash rates. There's no networking and no anti-cheat.

## Player fantasy
You're an apprentice who knows one word: the hearth-god's name. You survive waves by evoking spirits. Between runs, you meditate and scry; your machine's work carries forward. Each run you're a little truer.

## Structure
- **Character creation**: generate the aura keypair. Choose a starting element (flavor, and the starting scry prefix). Attune to the hearth-god: a real grind of a few seconds to reach `MIN_NAME_BITS`.
- **Run**: a map with waves of enemies. Survive N waves, or die. Short: 10–15 min.
- **Shrines** on the map: visiting one scans a batch of cells under its prefix in the background. A hit is a run find you keep.
- **Between runs (the sanctum)**:
  - Choose spirits to meditate on. Workers grind names.
  - Choose prefixes to scry. Workers scan.
  - Choose your loadout (4–6 known names bound to keys).
  - The sanctum shows each name's strength rising in real time.
- **Meta-progression = the name book.** There are no other unlocks in v0.

## Combat
- Each spell slot is a known spirit. Pressing it submits a `CastIntent` for the next tick.
- Effect comes from the `CastResult`: grant × form efficiency, shaped by form, typed by element.
- Feedback per cast: the evocation's bits ("rang at 11 bits"), strain meter, pool fullness for that spirit.
- **Enemy casters** also draw from spirits, including yours. An enemy shaman on the hearth-god thins your pull. This exercises contention without multiplayer. Enemies have fixed synthetic "strengths" (they don't grind).
- Strain is visible on the player and on enemy casters. Strained casters are vulnerable.

## Milestones

### M0 · Benchmark (do first)
- `apps/tools bench`: Poseidon hashes/sec in Node and in a browser worker, single and all cores.
- Output: a number that sets `target(depth)`, `MIN_NAME_BITS`, and shrine scan sizes.
- **Accept**: documented hash rates on your dev machine and one low-end device (phone or old laptop). Adjust spec 04 constants, then freeze them.

Tuning targets (at measured rate):
| Action | Target duration |
|---|---|
| Hearth-god attunement to MIN_NAME_BITS | 2–5 s |
| +1 strength on a name | doubles, so ~minutes by strength 20 |
| A shrine visit | a few seconds of background scanning |
| Expected scry hit in a tradition prefix | 1–5 min of full-speed scanning |

### M1 · Universe lib
- Implement spec 04 exactly. Golden vectors. Node + browser tests.
- **Accept**: vectors committed and passing in both environments; `spiritAt` is fast enough for the scan loop.

### M2 · Meditation workers + name book
- Worker pool, scry jobs with scan map, name jobs, rate reporting. IndexedDB persistence.
- Tool: `god-finder`. Use it to pick the hearth-god: high magnitude, low generosity, fire element (or neutral). Hardcode its cell as the tutorial god.
- **Accept**: a headless script can create an aura, attune to the hearth-god, scry a prefix, find a spirit, and grind its name, all persisted across reloads.

### M3 · Authority (headless)
- `LocalAuthority`: pools, allocation with water-filling, strain, capacity, backlash (recoil), ticks.
- Unit tests for allocation invariants: grants never exceed pool, capped casters' leftovers redistribute, weights ∝ `2^effective`.
- Simulation script: N synthetic casters with varied strengths on one spirit for 1,000 ticks; plot grants and strain.
- **Accept**: sim shows spam collapsing output, truer names dominating contention, and a solo weak name being capped.

### M4 · Playable slice
- One map, 5 waves, basic melee enemies, 3 forms (bolt, ring, ward), the hearth-god + 2 scried spirits.
- HUD: strain meter, per-slot bits, pool fill.
- **Accept**: you can play a run, feel strain, and see a truer name play better.

### M5 · Sanctum + shrines
- Between-run screen: meditate, scry, loadout.
- Shrines in runs that scan in the background.
- **Accept**: progress made between runs visibly changes the next run.

### M6 · Enemy casters + remaining forms
- Enemy shamans drawing from shared pools, including the hearth-god.
- Add lance, nova, summon, hex, blink.
- **Accept**: contention is felt in combat.

### M7 · Tuning pass
- Tune tunables against playtests and hash rates on both devices.
- Decide whether to turn on attunement/mastery bonuses.

## Out of scope for v0
Networking, other players, guilds, trading names, the Open Choir sweep, utility spells, ZK, name drift, warfare, anti-cheat.

## Risks
- **Hash rate too low in browsers** → names progress too slowly. Mitigations: lower targets, WASM Poseidon, or show meditation as a long-run idle activity.
- **Hardware disparity** → strong machines race ahead. Acceptable in single-player; revisit for multiplayer.
- **Idle-only progression feels passive** → make in-run choices (which shrine, which spirit to use) matter more than raw grind.

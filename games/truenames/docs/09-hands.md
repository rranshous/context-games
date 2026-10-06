# Hands: lending a machine to meditate for you

*Plan, 2026-10-05. Not built yet.*

A **hand** is a spare computer that meditates for your aura. It has no aura of its own and no model: it is an
extension of you, set up from an invite link, talking to your sanctum over an encrypted channel. Your hum grows;
words still come only through your own sanctum, which checks and signs every one.

## Why it is safe by design
- A word's truth is a hash of (being, **your public key**, nonce). A hand searches nonces against your public key and
  never holds your secret key.
- A nonce it finds is worthless to anyone else: the word is bound to your aura. Your sanctum recomputes one hash to
  check it (instant, no trust needed), then signs the claim itself. Ownership never leaves your machine.
- **What needs protecting is the cells.** A work order says which being to meditate on, and where beings dwell is the
  game's secret ("the dwelling stays yours"). Encryption keeps that between you and your hand. The hand itself learns
  those cells, so hands are for machines you trust (your own).

## The shape
```
  Your desktop (A)                                   Spare computer (B): a hand
  sanctum ──(home altar)──► A's altar ◄──(hand link)── hand window
     │          relays sealed envelopes by master key;          │
     │          sees routing, sizes, timing; never contents     │
     └── work orders (cell, facets, bests) ──────────────────► meditates (same pool, same workers)
     ◄── finds (cell, nonce, strength, facet), rate ──────────────┘
```
- **Your hands gather at your home altar** (the first in your list; on a desktop, your own). The altar relays sealed
  envelopes between you and your hands, keyed by your public key. Altar connections are already sealed in transit
  (packages/channel); hands seal end to end on top, so even the altar can't read work orders. It stores nothing.
- **The hand** runs the same `MeditationPool` and workers as a sanctum. A `NameTask` already needs only the cell, the
  aura's public key, the facet count and the best truths so far, so a hand's work is exactly a sanctum's meditation,
  aimed at someone else's public key.

## The invite link
- Made in your sanctum ("Lend a machine"): your dungeon's address, your public key, your hand key's public half, and a
  one-time pairing secret. It expires after 10 minutes or one use.
- Opened on B: in the desktop app ("Become a hand" on the title screen, or a `truenames://` link), or in a browser at
  `…/?hand=<code>`.
- **Pairing**: B makes its own x25519 key, and the channel key is HKDF(x25519(B, A) ‖ pairing secret). Knowing the
  secret proves B was invited, and the key exchange keeps the channel private. A remembers the hand's public key in
  the save, so reconnects need no new link. Messages are AES-GCM via WebCrypto (both the browser and Electron have it).
- **Revoking**: drop the hand's key from the save; its envelopes are refused from then on.

## The work
- **Orders**: your planner already turns aims into meditation with weights. Hands become more capacity: the sanctum
  sends each hand the meditations it should run, with shares, and updates them when the plan changes.
- **Nonce ranges**: every searcher starts at its own random 64-bit offset, so hands never repeat each other's work (or
  yours).
- **Finds**: the hand sends each improved nonce. Your sanctum checks it (`nameStrength` recomputed, the facet
  recomputed) and passes it into the same path a local find takes (`Services.onName`). It is signed, recorded in
  history and announced. Bogus finds are dropped and counted.
- **Rate**: the hand reports hashes per second; the sanctum shows its hum as local plus hands ("Ashbox lends 18k/s").
- **Offline**: when A is unreachable, the hand idles and reconnects with backoff. Work in flight is only lost search
  time.

## The hand's head (everything has a head)
A small window: whose hand it is (your handle and sigil), its hum, the beings it is meditating on (by sigil and name:
it knows them anyway), truths found and passed back, a pause and a release button. It is quiet, but it shows
everything it is doing.

## Milestones
1. **H1, one machine, no network**: a hand page in a second origin (or desktop profile) given a master's public key and
   one cell by hand; its finds pasted back are checked and taken in by the sanctum. Proves the work unit, the offsets
   and the verification path.
2. **H2, the relay and pairing**: hands at the home altar, the hand link, sealed envelopes, invite codes, pairing, the paired
   hands list in the save, revoking.
3. **H3, orders from the plan**: the planner hands work to hands with shares; finds flow back live; the hum shows
   hands; history notes "found by your hand Ashbox".
4. **H4, the head and the desktop**: the hand window, "Become a hand" on the desktop title screen, the `truenames://`
   link, quiet start-up as a hand on boot (optional).

## Later
- Hands that also **search the astral** (scrying a region for you): same shape, but a scry order reveals a region, not
  a cell.
- **One machine as a hand for several people**, with shares between them: the church and guild mechanic.
- **Hands over the Internet**: the same sealed envelopes over WebRTC with a rendezvous-only server (the Internet
  choirs plan).
- A chorister that also lends part of its hum (a hand with its own aura).

## Open questions
- Does a hand's hum show to the choir as yours (presence), or separately?
- Should the dungeon cap how many hands a master may have (relay load)?

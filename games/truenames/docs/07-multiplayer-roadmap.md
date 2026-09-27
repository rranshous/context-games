# 07 · Multiplayer roadmap

Each phase keeps the universe spec and the `Authority` interface. The work is moving the authority off the client and adding things that only matter with other players.

## Phase 1 · Central server
- `apps/server` hosts `LocalAuthority` (renamed or wrapped) behind WebSockets. Clients use `RemoteAuthority`.
- Storage: Postgres. Tables: `auras`, `names (aura, cell, nonce, strength)`, `pools (cell, level, last_tick)`, `strain (aura, value, last_tick)`.
- Name claims verified in the clear (`ClearTextVerifier`). Casts are signed intents.
- Ticks are server-authoritative. Clients predict locally and reconcile.
- **Secrecy by policy:** the server does not broadcast who knows which spirit. Players see only what the UI reveals (evocation bits, pool fullness, rumors).
- Registration PoW (a few seconds) as sybil friction.
- New questions: combat netcode for real-time 2D, match/zone sharding, rate limiting of claims.

## Phase 2 · Shared world and the Open Choir
- Persistent shared pools across all players: crowding becomes real.
- **Open Choir sweep:** an admin-run scanner walks prefixes in published Z-order and publishes every spirit found on a published schedule. Clients tithe a small fraction of idle hashing to the sweep; finds are credited.
- The sweep rate is a core balance knob: it sets the half-life of private discoveries.
- The Choir never casts.
- **Knowledge sharing:** spirit locations are shareable (anyone can verify `spiritAt`). Scan maps are shareable. Name gifting works automatically: grind someone's (cell, aura), send the nonce; they sign and submit.
- Orders/guilds as social structures only (chat, shared maps, shared job queues for gifting). No guild powers.

## Phase 3 · Conflict
Requires the open warfare/ownership decision (08). Options discussed so far are all expressible without new crypto:
- PvP combat using the same casting rules.
- Contention over popular spirits as indirect territory.
- Possibly spatial territory (sites in the game world) layered on top.

## Phase 4 · Zero knowledge
Only after the game works in the clear.
- Swap `NameVerifier` to a ZK verifier: prove `bits(nameHash(cell, aura, nonce)) ≥ s` without revealing `cell` and/or `nonce` (Noir or Circom).
- Enables hidden names: prove you know a strong name without revealing which spirit.
- Aggregate proofs for mastery bonuses (if enabled): "I hold ≥ 5 names ≥ 14 bits under prefix X."
- Pool accounting needs care: casting still has to reveal *which* pool is drawn from, or pools become commitments.
- Because the universe already uses Poseidon, no spirit or name changes.

## Phase 5 · Ledger (optional)
- Replace the central database with a ledger. Name bests, pool levels and strain become ledger state.
- The chained cell digest and Poseidon choice keep this feasible, but tick-rate combat on a ledger is a separate problem. Likely: ledger for names and discoveries, server for real-time combat.

## What must not change between phases
- `SPEC_VERSION = 1` hashing, cell encoding, trait decoding, target function, `bits`.
- The `Authority` and `NameVerifier` interfaces (extend, don't break).
- Name claim format (add fields, never reinterpret).

If one of these has to change, treat it as a new universe, which could be a lore event ("the Sundering").

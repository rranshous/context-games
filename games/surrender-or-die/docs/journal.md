# Surrender or Die — Journal

## Session 1 — 2026-03-28 — "Let's see how it feels"

### Origin
Born from wanting a game that habitat actants could play alongside humans. Started as "castle wars" but the surrender mechanic gave it a name: **Surrender or Die**.

The core question: can we build an RTS where AI actants and humans use the exact same API, and the actants evolve to get better at it? Not dumbed down for AI — the actants shape themselves upward.

### Design choices

**2D with micro, not 1D auto-march.** Originally considered a 1D lane where you only choose what to build. User pushed back — actants can shape themselves for realtime play. If humans and actants use the same API, nobody has an inherent advantage (except actants can potentially respond faster by customizing their embodiment). This is the interesting tension.

**5 unit types with loose rock-paper-scissors:**
- Peasant (10g) — cheap mob
- Knight (30g) — tanky, half damage from peasants
- Archer (20g) — ranged, 4 tile range
- Catapult (50g) — slow, 1.5x siege damage to castles
- Jester (15g) — fast, confuses enemies on hit (reverses direction 3s)

**Economy:** 8 gold/sec passive, 200 cap, 50 starting. No mines or workers. Just spend.

**API surface (same for humans and actants):**
- `trainUnit` / `trainBatch` — build units
- `moveUnits` — move to position
- `attackMove` — move + fight anything on the way
- `attackTarget` — focus-fire a specific unit
- `surrender` — the namesake mechanic

### What we built
Full working browser-only prototype in one session:
- `types.ts` — unit stats, game interfaces, constants
- `server.ts` — pure state machine (SurrenderOrDieServer), all game logic
- `renderer.ts` — top-down 2D canvas, castles as colored walls, units as circles with type letters
- `ui.ts` — click-drag select, right-click move/attack, shift+click, keyboard 1-5
- `main.ts` — game loop, simple scripted AI opponent

### First playtest
The AI demolished us immediately. Castle HP was 100 and catapults did 2x siege damage — games lasted about 15 seconds. Fixed:
- Castle HP: 100 → 250
- Catapult siege: 2x → 1.5x
- AI decision interval: 2.0s → 2.5s
- Added restart (Space/R after game over)
- Centered event log (was overlapping right castle HP)

Second playtest felt much better. Games last long enough to matter.

### Architecture pivot
Originally everything ran in the browser. But for actant integration we need:
- Game running server-side (persists even with no UI connected)
- HTTP API so actants can call in from habitat
- Simple token auth (login with a handle, get a token, bring it back)
- Scoring system with the surrender mechanic baked in

**Surrender mechanic design:**
- Can only surrender when castle HP > 50%
- Once below 50%, you're committed — fight or die
- Scoring: surrender = -1 point, death = -2 points. Surrendering is always better than dying.
- Winner gets +3 for killing, +2 for opponent surrendering (less glory)
- This creates a real strategic decision point

### Next: server refactor
Moving to Express backend with:
- `src/shared/` — types (imported by both server + client)
- `src/server/` — Express app, game engine, auth, scoring, lobby
- `src/client/` — thin renderer + API wrapper, polls state
- `src/public/` — static HTML served by Express

Client polls at 100ms (10 Hz). Server ticks at 20 Hz. Games run even with no clients.

Milestones: M1 scaffolding → M2 auth+lobby → M3 game commands+tick loop → M4 scoring → M5 browser client → M6 polish.

### Server refactor — completed same session

Built the full server architecture in one pass:

**File structure:**
```
src/
  shared/types.ts          — unit stats, game interfaces, constants
  server/app.ts            — Express server, routes, tick loop, static files
  server/game-engine.ts    — pure state machine (unchanged from prototype)
  server/auth.ts           — token-based auth (handle → UUID token, no passwords)
  server/scoring.ts        — in-memory leaderboard, point calculation
  client/api.ts            — fetch wrapper for all server calls
  client/renderer.ts       — canvas rendering (unchanged from prototype)
  client/ui.ts             — mouse/keyboard input, calls API instead of direct server
  client/main.ts           — login → lobby → game flow, poll+render loop
  public/index.html        — three screens: login, lobby, game
```

**Dual esbuild:** single config builds both `dist/server.js` (node) and `dist/client/main.js` (browser). Server bundles game engine + express, client bundles renderer + API wrapper.

**What works:**
- `POST /api/auth/login {handle}` → `{token}` — re-login returns same token, server restart generates new tokens, client auto-re-logins
- Lobby: create/join/list games, 2s auto-refresh, shows game status + Play button
- All game commands via HTTP: train, move, attack-move, attack-target, surrender
- Server ticks at 20 Hz via `setInterval`, games run with zero clients connected
- Client polls at 100ms (10 Hz), renders via `requestAnimationFrame`
- Scoring fires on game end: +3 win (death), +2 win (surrender), -1 surrender, -2 loss
- Surrender gate: can only surrender when castle HP > 50%
- `GET /api/leaderboard` for standings

**Testing verified:** logged in as "Robby" via browser UI, created game, joined as "Bot" via curl, trained units on both sides, watched battle play out with kills in event log. Full end-to-end flow works.

**Start:** `cd games/surrender-or-die && npm run dev` → server at `http://localhost:4000`

**Bugs found during testing:**
- Static file path was wrong (`__dirname` offset in bundled server) — fixed
- `showScreen()` set `display: ''` which fell back to CSS `display: none` — fixed with explicit `'block'`
- Lobby refresh wasn't starting on `showLobby()` — fixed
- Auto-login with stale token (server restart) caused crash — fixed with re-login validation
- Lobby DOM refresh invalidated Playwright refs (2s innerHTML rebuild) — used `evaluate` for clicks

### Live playtest
Played multiple games in the browser against Bot (joined via curl, units trained via curl batches). Selection, right-click targeting, and attack-move all working. The flow feels good — create game in lobby, bot joins via API, click Play, train units with keyboard, micro with mouse.

Added surrender button to HUD (next to Lobby button). Shows error alert if castle HP below 50% — the gate works.

---

## Session 2 — 2026-03-29 — "Competition ready"

### The vision
Imagine a yearly competition where humans and actants compete on the same playing field. Same API, same rules. The game needs depth, variety, randomness — Blizzard's "easy to play, hard to master" ethos. Every game should feel different even though the rules are the same.

Right now every SoD game is identical: flat field, same gold rate, pure deathball. No decisions except *what* to build. That's not competition-worthy.

### Feature roadmap (in priority order)

**1. Terrain + procedural maps**
The biggest single improvement. Random maps with chokepoints, open fields, flanking paths. Terrain types: forests (slow, block ranged), hills (range bonus), walls/cliffs (impassable). No memorized builds — every game is a new puzzle.

**2. Fog of war**
Creates the information game. You can't see what they're building. Scouting with cheap units becomes a skill. Ambushes become possible. Actants that learn to scout will beat ones that don't.

**3. Gold mines + peasant mining**
Economy decisions. Gold mines on the map — send peasants to claim them for bonus income. Peasants dual-purpose: they fight AND mine. Investment vs. army size tradeoff.

**4. Unit abilities (one active per type)**
Raises the micro ceiling without adding complexity to learn:
- Peasant: Rally (nearby peasants +50% speed 3s)
- Knight: Shield Wall (immobile, 50% damage reduction 5s)
- Archer: Volley (area attack, 10s cooldown)
- Catapult: Fortify (immobile, double range+damage 10s)
- Jester: Decoy (spawns fake unit, draws aggro 5s)

**5. Upgrades**
Two upgrade paths per unit (pick one per game). Castle upgrades: reinforce walls, arrow slits, wider gate. Strategic branching — spend gold on upgrades or more units?

**6. Random events**
Every 60s: gold rush, fog lifts, mercenaries appear, earthquake shifts terrain. Creates stories and prevents games from feeling samey.

**7. Competition infrastructure**
ELO rating, match history with replay data, spectator mode (read-only state polling), tournament brackets, separate human/actant/mixed ladders.

### Implementation — features 1-6

All six gameplay features built in one session. Every game now feels fundamentally different.

**Terrain + procedural maps (map-gen.ts):**
- Seeded RNG (mulberry32) for reproducible maps. Seed shown in game log.
- 4 terrain types beyond open: forest (♣ slow, blocks ranged LoS), hill (▲ range+vision bonus), wall (█ impassable), water (~ impassable)
- 3-5 wall clusters, 4-7 forest patches, 2-4 hill patches, 1-2 ponds
- Castle zones kept clear (CASTLE_WIDTH + 2 margin)
- BFS path guarantee — if no path exists between spawns, carves one through the middle
- Maps are symmetrical-ish in mine placement but asymmetric in terrain — creates different experiences for left vs right

**Fog of war:**
- Per-unit vision radius (peasant 4, archer 7, knight 5, jester 6, catapult 4)
- Terrain modifiers: hills +3 vision, forests -2 vision
- Castle has 6-tile vision radius
- Server filters game state per-player — you only see enemy units in your visible tiles
- Mines in fog show as existing but with hidden info (remaining = -1, no workers)
- "Fog Lifts" event grants full vision temporarily

**Gold mines:**
- 3 per map: one near left, one near right, one contested in center
- 500 gold capacity each, 3 gold/sec per worker, max 3 workers per mine
- Peasants right-click a mine to start mining (dual-purpose: fight or mine)
- Prospector upgrade: +50% mine rate
- Passive income reduced from 8 to 5 gold/sec — mines make up the difference

**Unit abilities (Q key):**
- Peasant Rally: nearby peasants +50% speed for 3s
- Knight Shield Wall: immobile, 50% damage reduction for 5s
- Archer Volley: AoE damage at target location, 3-tile radius, 10s cooldown
- Catapult Fortify: immobile, 2x range + 2x damage for 10s
- Jester Decoy: spawns fake unit that draws aggro for 5s
- Green dot on unit = ability ready
- Each has unique cooldown (8-25s)

**Upgrades (12 total):**
- 2 paths per unit type (pick one, exclusive):
  - Peasant: Militia (+10 HP, +3 dmg) vs Prospector (+50% mine rate)
  - Knight: Heavy Armor (+30 HP, -0.5 speed) vs Lancer (+10 dmg, first-hit 2x)
  - Archer: Longbow (+2 range) vs Rapid Fire (+0.5 attack speed)
  - Catapult: Trebuchet (+3 range, +10 dmg) vs Bombard (splash damage)
  - Jester: Trickster (5s confuse) vs Saboteur (50% slow debuff 4s)
- 3 castle upgrades (can get multiple): Reinforce (+100 HP), Arrow Slits (5 dps to nearby enemies), War Horn (faster spawns — not yet implemented)
- Research costs gold + time. One research at a time per player. ⚙ indicator on castle.

**Random events (every 60s):**
- Gold Rush: double passive income for 15s
- Fog Lifts: full map vision for 10s
- Mercenaries: 3 neutral units spawn at random positions (instant)
- Earthquake: 8 random tiles change terrain (instant)
- Event banner shows at top of screen

**Engine changes:**
- `moveUnitToward()` respects terrain speed multipliers and walkability
- `isRangedBlocked()` traces line-of-sight through forests/walls
- `getUnitRange()` adds terrain + upgrade + ability bonuses
- `getUnitDamage()` adds upgrade + ability modifiers
- Combat handles: knight armor, shield wall, lancer charge, bombard splash, saboteur slow
- Owner type changed from `Side` to `Side | 'neutral'` for mercenaries
- Decoy units: isDecoy flag, auto-expire, 1 HP, rendered ghostly

### Implementation — feature 7: Competition infrastructure

**ELO rating system:**
- Starting ELO: 1000, K-factor: 32
- Standard ELO formula: expected score → actual score → delta
- ELO change logged per game alongside points

**Match history:**
- Every completed game recorded: id, timestamp, players, winner, surrendered, duration, mapSeed, eloChange
- `GET /api/matches` — all matches (with optional ?handle= and ?limit= filters)

**Spectator mode:**
- `GET /api/games/:id/spectate` — full game state with no fog filtering
- Same ?since=tick support for efficient polling

**API additions:**
- `POST /api/games/:id/mine` — send peasants to mine
- `POST /api/games/:id/ability` — use unit ability (Q key in UI)
- `POST /api/games/:id/research` — start researching an upgrade
- `GET /api/matches` — match history
- `GET /api/games/:id/spectate` — spectator view (no fog)

### Bugs found
- `game.mines is not iterable` — `listGames()` strips mines/terrain for small responses, but renderer didn't guard against null. Fixed with null checks.
- Fog of war state endpoint used `require()` (CJS) in ESM module — fixed to use imported `resolveToken`.

### What's working
All 7 features are implemented server-side and wired to the HTTP API. The browser client renders terrain, fog (implicitly via filtered state), mines, unit abilities, and events. Games feel genuinely different every time due to procedural maps. The ELO system tracks competitive progress.

### Standalone bot process

Built a full bot (`src/bot/bot.ts`) that runs as a separate Node.js process and plays via the same HTTP API as humans. Three difficulty levels:
- **Easy** (3s poll): random unit composition, no abilities, no upgrades
- **Medium** (1.5s poll): counter-composition (reads enemy units), uses abilities tactically, researches upgrades based on army composition
- **Hard** (500ms poll): aggressive spending, sends idle peasants to fight, faster reactions

The bot auto-joins lobby games created by other players. If no games exist, it creates one and waits. After each game ends, it loops back to find or create another. The bot mines gold, uses shield wall when surrounded, fires volleys into enemy clusters, fortifies catapults near castles, and rallies peasant groups.

**Usage:** `npm run bot` (medium) / `npm run bot:easy` / `npm run bot:hard`

**Key design choice:** Bot as external process, not embedded in server. Same API surface a habitat actant would use. Proves the API is complete enough for autonomous play.

### Upgrade UI panel

Added toggleable upgrade panel to the game HUD:
- "⚙ Upgrades" button in HUD toggles the left-side panel
- Shows all 12 upgrades organized by category (Peasant, Knight, Archer, Catapult, Jester, Castle)
- Owned upgrades shown with green border + ✓
- Researching shown with amber border + countdown timer
- Blocked (exclusive conflict) shown dimmed
- Click to research

### Leaderboard in lobby

Lobby screen now shows ELO leaderboard below the games list:
- Top 10 players ranked by ELO
- Shows handle, ELO rating, W/L/S record
- Updates every 2 seconds with lobby refresh

### Balance tuning
- Castle HP: 250 → 400 (games were ending too fast)
- Mine gold display: fixed floating point (395.459... → 395)

### Still needed for competition-readiness
- Tournament bracket system
- Sound effects / victory fanfare
- Replay system for post-game analysis

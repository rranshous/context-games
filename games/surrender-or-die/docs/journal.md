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

### Next
- Wire an actant from habitat to play via HTTP
- Leaderboard display in browser UI
- Server-side bot that auto-joins and plays (so there's always an opponent)
- Multiple games running simultaneously (already supported by engine)

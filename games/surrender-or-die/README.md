# Surrender or Die

Castle wars micro-RTS where humans and AI actants compete on the same playing field. Every game is different — procedural maps, fog of war, gold mines, unit abilities, upgrades, and random events.

**Easy to play, hard to master.**

## Quick Start

```bash
cd games/surrender-or-die
npm install
npm run build
npm run start        # server at http://localhost:4000
npm run bot          # in another terminal — bot auto-joins your games
```

Open `http://localhost:4000`, pick a handle, create a game, and the bot will join automatically.

## How to Play

**Train units** with number keys or the HUD buttons:

| Key | Unit | Cost | Role |
|-----|------|------|------|
| 1 | Peasant | 10g | Cheap fighter, can mine gold |
| 2 | Knight | 30g | Tanky, resists peasants |
| 3 | Archer | 20g | Ranged (4 tiles), good vision |
| 4 | Catapult | 50g | Siege damage, slow |
| 5 | Jester | 15g | Fast, confuses enemies |

**Controls:**
- **Left-click / drag** — select units
- **Right-click ground** — attack-move (fight anything on the way)
- **Right-click enemy** — focus-attack that unit
- **Right-click gold mine** — send peasants to mine
- **Q** — use selected unit's ability
- **Ctrl+A** — select all units
- **Shift+click** — add to selection

**Upgrades:** Click "⚙ Upgrades" in the HUD. Two exclusive paths per unit type — choose one per game.

**Surrender:** Available when castle HP > 50%. Costs less ELO than dying. Below 50%, you're committed.

## Terrain

Every map is procedurally generated with a unique seed.

| Terrain | Effect |
|---------|--------|
| Open | Normal movement |
| Forest ♣ | Slow movement, blocks ranged line-of-sight, reduces vision |
| Hill ▲ | Slight slow, +2 range bonus, +3 vision bonus |
| Wall █ | Impassable |
| Water ~ | Impassable |

## Fog of War

You can only see tiles within your units' vision radius. Scouting matters — send a cheap peasant ahead to reveal the map. Hills give vision bonuses, forests reduce it.

## Gold Mines

Three mines per map. Send peasants to mine (right-click the mine). Each mine holds 500 gold, workers extract 3g/sec each (max 3 workers). Passive income is 5g/sec — mines are worth fighting over.

## Abilities

Each unit type has one active ability (Q key):

| Unit | Ability | Effect | Cooldown |
|------|---------|--------|----------|
| Peasant | Rally | Nearby peasants +50% speed for 3s | 15s |
| Knight | Shield Wall | Immobile, 50% damage reduction for 5s | 20s |
| Archer | Volley | AoE damage in 3-tile radius | 10s |
| Catapult | Fortify | Immobile, 2x range + 2x damage for 10s | 25s |
| Jester | Decoy | Spawns fake unit that draws aggro for 5s | 12s |

Green dot on a unit = ability ready.

## Upgrades

Two exclusive upgrade paths per unit type (pick one per game), plus three castle upgrades:

**Peasant:** Militia Training (+10 HP, +3 dmg) or Prospector Picks (+50% mine rate)
**Knight:** Heavy Armor (+30 HP, slower) or Lance Training (+10 dmg, first-hit 2x)
**Archer:** Longbow (+2 range) or Rapid Fire (+0.5 attack speed)
**Catapult:** Trebuchet (+3 range, +10 dmg) or Bombard Shot (splash damage)
**Jester:** Master Trickster (5s confuse) or Saboteur (slow debuff on hit)
**Castle:** Reinforce Walls (+100 HP) · Arrow Slits (5 dps to nearby enemies) · War Horn (faster spawns)

## Random Events

Every 60 seconds, one of four events triggers:

- **Gold Rush** — double passive income for 15s
- **Fog Lifts** — full map vision for 10s
- **Mercenaries** — 3 neutral units spawn at random spots
- **Earthquake** — random terrain tiles shift

## Scoring

| Outcome | Points | ELO |
|---------|--------|-----|
| Win (opponent's castle destroyed) | +3 | Standard ELO gain |
| Win (opponent surrendered) | +2 | Smaller ELO gain |
| Surrender (castle > 50% HP) | -1 | Small ELO loss |
| Loss (castle destroyed) | -2 | Standard ELO loss |
| Draw (timeout) | 0 | Minimal ELO shift |

Surrendering is always better than dying. But you can only surrender while your castle is above 50% HP — below that, fight or die.

## Bot

The bot runs as a separate process using the same HTTP API as human players:

```bash
npm run bot          # medium difficulty
npm run bot:easy     # slower reactions, random unit comp
npm run bot:hard     # fast reactions, counter-comps, aggressive
```

The bot mines gold, uses abilities tactically, researches upgrades, and adapts its unit composition to counter yours.

## API

The entire game is playable via HTTP. This is the same API the bot uses and what AI actants from [habitat](../habitat/) would connect to.

### Auth
```
POST /api/auth/login          { handle: "name" }     → { token, handle }
```

### Lobby
```
GET  /api/games                                       → [game summaries]
POST /api/games               { side?: "left" }       → GameState
POST /api/games/:id/join                              → GameState
```

### Commands (require Bearer token)
```
POST /api/games/:id/train         { unitType }
POST /api/games/:id/train-batch   { unitTypes: [] }
POST /api/games/:id/move          { unitIds, x, y }
POST /api/games/:id/attack-move   { unitIds, x, y }
POST /api/games/:id/attack        { unitIds, targetId }
POST /api/games/:id/mine          { unitIds, mineId }
POST /api/games/:id/ability       { unitId, targetX?, targetY? }
POST /api/games/:id/research      { upgradeId }
POST /api/games/:id/surrender
```

### State
```
GET /api/games/:id/state      ?since=<tick>    → fog-filtered GameState (or 304)
GET /api/games/:id/spectate   ?since=<tick>    → full GameState (no fog)
```

### Scoring
```
GET /api/leaderboard                           → [{ handle, elo, wins, losses, ... }]
GET /api/players/:handle/stats                 → PlayerStats
GET /api/matches               ?handle=&limit= → [MatchRecord]
```

## Architecture

```
src/
  shared/types.ts           — interfaces, unit stats, terrain, upgrades, events
  server/
    app.ts                  — Express server, routes, 20Hz tick loop
    game-engine.ts          — pure state machine (all game logic)
    map-gen.ts              — procedural map generation (seeded RNG)
    auth.ts                 — token auth
    scoring.ts              — ELO rating + match history
  client/
    main.ts                 — login → lobby → game (poll + render)
    renderer.ts             — canvas rendering (terrain, fog, mines, units)
    ui.ts                   — mouse/keyboard input, upgrade panel
    api.ts                  — fetch wrapper
  bot/
    bot.ts                  — standalone bot process
  public/
    index.html              — login, lobby, game screens
```

The server ticks at 20Hz even with no clients connected. The browser client polls at 10Hz and renders at 60fps. Everything is in-memory — server restart resets all state.

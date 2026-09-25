# Qwestworld

A continent-scale RTS that plays itself, slowly, forever, on a CPU-only desktop. A handful of rulers are local LLMs. Everything below them is tens of thousands of rule-following hands. You don't play it; you look into it.

![Qwestworld viewer](screenshot.png)

## Setup

```bash
cd games/qwestworld
npm install
npm run build        # or npm run watch

npm run sim          # the world: a daemon on :4200. Runs whether or not anyone is watching
npm run view         # the window: a viewer on :4201. Open http://<host>:4201 from any machine on the LAN
npm run qw -- map    # the terminal window (see below)
npm run bench        # years of scripted history in seconds, for balance work
```

The minds need [Ollama](https://ollama.com) with `qwen3:8b`, `llama3.2:3b` and `qwen3:1.7b` pulled (or whichever models you name in `KINGS`). With `KINGS=script,script,script,script,script,script SCRIBE_BRAIN=script REBEL_BRAIN=script` the world runs with no inference at all.

## What is it

A continent of 96 settlements split between six crowns. Settlements pay taxes and raise garrisons. Rulers muster hosts under named generals, hire sellswords, declare wars, trade envoys, swear peace and alliances, and send their hosts to besiege their neighbors' towns. Borders shift as towns fall. Rulers grow old and die, and heirs take the throne. Renowned, disloyal generals rebel and found realms of their own. When one crown holds everything, the age ends and a new continent is generated.

Every soldier is a dot. There are 30–60k of them, each a few bytes in a typed array, walking a shared distance field toward wherever its commander points. No soldier thinks.

Only the rulers think. Every 60 in-game days each holds council: they read their advisors' report and rule through tools. Their commands pass down through the hands, and things go wrong on the way:

- **Couriers take days** to reach a general in the field.
- **Generals misread the royal seal** and march on the wrong town, or **ignore orders**, more often when their men are miserable.
- **Soldiers must be paid.** An empty treasury stops recruiting, breaks morale and starts desertion. Unpaid sellswords walk away, or sell their spears to a richer enemy.
- **Conquered towns can rise up** and open their gates to their old masters.
- **Seasons turn:** winter slows hosts and starves those abroad; the harvest fills the coffers. Neighbors at peace **trade**, and war closes the roads.

> *General Edvin misreads the royal seal and marches on Grisgate instead of Dunbarrow.*
> …and takes it. His king's first conquest was an accident.

If a thinking ruler runs overdue, time slows for them: *"Time slows while Queen Alda deliberates…"*

## The rulers

Each ruler has a name, a title, an age, a realm and a temperament ("cautious and patient", "bloodthirsty", "melancholy"). A realm's brain is `script` (a few lines of rules) or any Ollama model with tool calling. The default mix is two `qwen3:8b`, two `llama3.2:3b`, one `qwen3:1.7b` and one scripted baseline. You can hand a realm to another mind at runtime: `npm run qw -- brain d llama`.

**Tools:** `march`, `hold`, `muster`, `hire_mercenaries` (by men, 3 crowns each), `declare_war` (required before attacking a realm at peace), `send_envoy` (with `offer_peace` / `offer_alliance`), `proclaim`.

**What a ruler sees:** the date and season; treasury, taxes, trade and pay; every settlement and its garrison; each general's size, whereabouts, orders and spirits; foreign border towns ("strongly held"); every realm with its ruler, wars, alliances and reputation ("Known as an oathbreaker"); envoys and tidings; news since the last council; and **their advisors' counsel** when something is off (the treasurer on idle coin or debt, the marshal on idle hosts or coming winter, scouts on weak enemy towns, the castellan on sieges, merchants on trade lost to war, the spymaster on generals who might rebel, the chancellor on a doubted word). Generals come with a hint of their hearts ("Devoted to you." / "Ambitious, and loves you little."). All in-fiction, never coordinates.

**Memory:** a rolling window of the last 5 councils. Older councils are compressed to a brief; the ruler's own commands appear verbatim, with in-fiction outcomes ("You sent word to General Merdric, but no such general serves you. Merdric is destroyed near Grisvale."). An heir starts with no memory, only the news of how they came to the throne.

**The scribe** (`llama3.2:3b` by default) writes each year's annal from the chronicle, in a chronicler's voice.

`npm run qw -- context a` prints exactly what ruler *a* would be sent right now. [docs/journal.md](docs/journal.md) has what the minds have actually done: oathbreakers by accident, conditional peace offers, a king who threatened his disobedient general, a small model narrating wars that had ended.

## Windows into the world

The sim and the view are separate processes. The sim knows nothing about rendering. Viewers come and go, from any machine, and see the world as it is right now.

**Browser viewer**
- **The map:** terrain; realm borders; every soldier as a dot; army banners (☹ unhappy, ★ high spirits) with dashed march lines; siege rings; pulsing red battles; courier lights carrying orders to generals and envoys between seats; a gold ring pulsing at the seat of any ruler in council. Hover anything for details.
- **The realm cards:** ruler, mind, towns, soldiers, treasury, wars ⚔ and alliances ⛨, last decrees. Click a card to expand that ruler's reign, the mind's statistics, and fly to their seat. From there, **open the council chamber** to read exactly what that mind is given at council, or **whisper…** words that ruler will hear at their next council ("A stranger at court whispers to you…").
- **The tabs:** Chronicle (with glyphs for the big moments), Annals (the scribe's years), History (towns or soldiers per realm over time, stacked).
- **Catching up:** "While you were away" lists the great events since this browser last looked. A first visit gets "The Story So Far".
- **Wander mode** (W, or `?wander`): the camera drifts between battles, sieges, councils, marching hosts and envoys, with captions. With H hiding the panel, it's the projector mode.
- **Controls:** drag to pan, wheel to zoom; H toggles the panel, F fits the map, W wanders, Space pauses. `?sim=http://host:4200` points it at a sim elsewhere; `?fps=` sets the frame cap (default 24, to leave CPU for the minds).

**`qw`, the terminal window.** Same API, same powers as the browser.

```
npm run qw -- status              # realms, rulers, treasuries, wars ⚔ and alliances ⛨, armies with morale
npm run qw -- kings               # each ruler's last decrees and reign
npm run qw -- context b           # the exact messages ruler b would receive at council
npm run qw -- chronicle 30        # recent history
npm run qw -- map 120             # ASCII territory map
npm run qw -- minds               # how each mind has ruled: councils, speed, tokens, tools, misfires
npm run qw -- brain d qwen3:1.7b  # hand realm d to another mind
npm run qw -- whisper a <text>    # a stranger's words at ruler a's next council
npm run qw -- new-age             # end this age; a new continent rises
npm run qw -- pause | resume
```

## Knobs

| Env | Default | |
|---|---|---|
| `KINGS` | `qwen,qwen,llama,llama,qwen3:1.7b,script` | brain per founding realm (`qwen` = `KING_MODEL`, `llama` = llama3.2:3b, or any model name) |
| `KING_MODEL` | `qwen3:8b` | what `qwen` means |
| `REBEL_BRAIN` | `llama` | brain for rebel realms |
| `SCRIBE_BRAIN` | `llama` | the annalist (`script` turns it off) |
| `KING_MEMORY` | `5` | councils a ruler remembers |
| `SETTLEMENTS` | `96` | settlements on a new continent |
| `OLLAMA_URL` | `http://localhost:11434` | |
| `TICKS_PER_SEC` | `12` | one tick is one in-game hour |
| `COUNCIL_DAYS` | `60` | in-game days between councils |
| `GRACE_DAYS` | `10` | how overdue a mind may be before time slows (to 1/8) |
| `SEED` | random | continent seed (new ages use seed + 1) |
| `PORT` / `HOST` / `DATA_DIR` | `4200` / `0.0.0.0` / `./data` | sim |
| `PORT` / `SIM_URL` | `4201` / same host | viewer |

State is saved to `data/world.json` every 2 minutes and on SIGTERM. Only dynamic state is saved: the land regenerates from its seed. Stop the sim with `kill -TERM <pid>` to save before exit. A save from an older format is set aside as `.bak` and a new world begins.

## Layout

```
src/sim/      the daemon: world.ts (hands, coin, diplomacy, fates), court.ts (minds, reports, tools, scribe),
              mapgen.ts, flow.ts (distance fields), persist.ts, bench.ts, main.ts (loop + API)
src/view/     serve.ts (static server) + client/ (canvas renderer, history chart, polling)
src/cli/      qw.ts
src/shared/   constants and API types
docs/         idea.md, journal.md
```

**API** (the sim, CORS open): `GET /api/meta`, `/api/terrain.bin`, `/api/regions.bin`, `/api/state`, `/api/soldiers.bin`, `/api/history`, `/api/annals`, `/api/chronicle?since=`, `/api/health`, `/api/kings/:id/context`, `POST /api/control {action: pause | resume | brain | whisper | new-age}`.

## Performance

On an i7-4770 with no GPU:
- **The world:** ~6–12ms per tick with ~50k soldiers.
- **A council:** ~1.4–2.1k prompt tokens in, 20–80 out. qwen3:1.7b takes ~30–45s, llama3.2:3b ~50–90s, qwen3:8b ~100–350s. Prompt reading dominates.
- **Contention:** the minds share the CPU with everything else, including other Ollama models and browsers rendering the viewer. Watch from another machine when you can.

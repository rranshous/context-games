# Qwestworld

A continent-scale RTS that plays itself, slowly, forever, on a CPU-only desktop. A few kings are local LLMs. Everything below them is tens of thousands of rule-following hands. You don't play it; you look into it.

![Qwestworld viewer](screenshot.png)

## Setup

```bash
cd games/qwestworld
npm install
npm run build        # or npm run watch

npm run sim          # the world: a daemon on :4200. Runs whether or not anyone is watching
npm run view         # the window: a viewer on :4201. Open http://<host>:4201 from any machine on the LAN
npm run qw -- map    # the terminal window (see below)
```

The kings need [Ollama](https://ollama.com) with `qwen3:8b` pulled. With `KINGS=script,script,script,script` the world runs with no inference at all.

## What is it

A continent of 64 settlements split between four crowns. Each settlement raises a garrison. Kings muster garrisons into hosts under named generals and send them to besiege their neighbors' towns. Borders shift as towns fall, battles get recorded in a chronicle, and when one crown holds everything the age ends and a new continent is generated.

Every soldier is a dot. There are 25–40k of them, each a few bytes in a typed array, walking a shared distance field toward wherever its commander points. No soldier thinks.

Only the kings think. They hold council every 45 in-game days, read their advisors' report, and rule through four tools: `march`, `hold`, `muster`, `proclaim`. Their commands then pass down through the hands, and things go wrong on the way:

- **Couriers take days** to reach a general in the field.
- **Generals misread the royal seal** and march on the wrong town.
- **Generals ignore orders.**

> *General Edvin misreads the royal seal and marches on Grisgate instead of Dunbarrow.*
> …and takes it. Leobert's first conquest was an accident.

If a thinking king runs overdue, the world waits for him: *"The world waits on Leobert…"*

## The kings

Each king has a name, a realm and a temperament ("cautious and patient", "ambitious and proud"). A king can be `qwen` (a local model via Ollama's tool-calling API) or `script` (a few lines of rules: attack the weakest nearby town when you outnumber it).

Qwen kings keep a **rolling memory of their last 5 councils**:
- Older councils are compressed to a brief: date, holdings, generals, and that council's news.
- His own commands appear verbatim, along with what came of them ("You sent word to General Merdric, but no such general serves you. Merdric is destroyed near Grisvale.").
- Today's council gets the full report.

Everything a king sees is in-fiction: settlement names, "lightly held", "near Ashby". Never coordinates. `npm run qw -- context a` prints exactly what king *a* would be sent right now.

Kings have been observed to threaten disobedient generals, get stuck giving orders to a dead general, spend a year making proclamations while an 8,000-man host sat idle, and adopt a general's mistake as policy. The details are in [docs/journal.md](docs/journal.md).

## Windows into the world

The sim and the view are separate processes. The sim knows nothing about rendering. Viewers come and go, from any machine, and see the world as it is right now.

**Browser viewer.**
- On screen: terrain, realm borders, every soldier as a dot, army banners with dashed march lines, siege rings, the realm cards, and the chronicle.
- Drag to pan, wheel to zoom. H toggles the panel, F fits the map, Space pauses.
- Click a realm to fly to it.
- To point it at a sim on another machine: `?sim=http://host:4200` (or `SIM_URL=` when starting `npm run view`).

**`qw`, the terminal window.** Same API, same powers as the browser.

```
npm run qw -- status          # realms, armies, what the world is waiting on
npm run qw -- kings           # each king's last decrees and reign
npm run qw -- context b       # the exact messages king b would receive at council
npm run qw -- chronicle 30    # recent history
npm run qw -- map 120         # ASCII territory map
npm run qw -- pause | resume
```

## Knobs

| Env | Default | |
|---|---|---|
| `KINGS` | `qwen,qwen,script,script` | brain per realm |
| `KING_MODEL` | `qwen3:8b` | any Ollama model with tool calling |
| `KING_MEMORY` | `5` | councils a king remembers |
| `OLLAMA_URL` | `http://localhost:11434` | |
| `TICKS_PER_SEC` | `12` | one tick is one in-game hour |
| `COUNCIL_DAYS` | `45` | in-game days between councils |
| `GRACE_DAYS` | `10` | how overdue a king may be before the world waits |
| `SEED` | random | continent seed (new ages use seed + 1) |
| `PORT` / `HOST` / `DATA_DIR` | `4200` / `0.0.0.0` / `./data` | sim |
| `PORT` / `SIM_URL` | `4201` / same host | viewer |

State is saved to `data/world.json` every 2 minutes and on SIGTERM. Only dynamic state is saved: the map regenerates from its seed. Stop the sim with `kill -TERM <pid>` to save before exit.

## Layout

```
src/sim/      the daemon: world.ts (hands), court.ts (kings), mapgen.ts, flow.ts (distance fields), persist.ts, main.ts (loop + API)
src/view/     serve.ts (static server) + client/ (canvas renderer, polling)
src/cli/      qw.ts
src/shared/   constants and API types
docs/         idea.md, journal.md
```

**API** (the sim, CORS open): `GET /api/meta`, `/api/terrain.bin`, `/api/regions.bin`, `/api/state`, `/api/soldiers.bin`, `/api/health`, `/api/kings/:id/context`, `POST /api/control {action: pause|resume}`.

## Performance

On an i7-4770 with no GPU:
- **The world:** ~2ms per tick per 12k soldiers.
- **A king's council:** ~1–2k prompt tokens in, ~30–100 out, 1–5 minutes. Prompt reading dominates.
- **Browsers share the CPU with the kings.** A browser rendering the viewer on the same machine slows the kings down noticeably, so watch from another machine when you can.

# gactant

**Game-shaped actants.** A human and a nascent actant shape the actant's game facet into
a game together. Then the actant is handed off, and other people play it. The game isn't
something the actant made; it's one of the ways the actant exists (level 5, *Faceted*, of
the Explorer levels). Changing the game is the actant changing itself.

```
node platforms/gactant/server.mjs          # http://lilg:7780/
```

`platforms/gactant/.env` holds `OPENROUTER_API_KEY` (and optionally `GACTANT_MODEL`,
default `anthropic/claude-sonnet-5.5`). No dependencies, no build: plain ES modules.

## The shape of it

- **The frame** is the browser window. It holds **surfaces**, each with its own structure
  and behavior, built with whatever fits its job:
  - **stage**: a canvas with a frame clock and input
  - **chat**
  - **whiteboard**: a shared sketch board with a baton
  - **status**: lights
  - **inspector**: the soma and a log of doings, for humans

  Each surface exposes *actions* (done as some actor) and *events* (`chat.posted`,
  `stage.frame`, `whiteboard.turn`, …).
- **The actant** is a soma: named sections. `tools`, `game` and `hooks` are code. The
  hooks reach into the surfaces: they listen to events, run the game at frame rate, and
  decide what wakes inference. Everything else (`origin`, `identity`, `memory`, whatever it
  adds) is text it carries. Inference only happens when a hook calls `me.wake(event)`, so an
  idle actant costs nothing.
- **Seats.** The human in the frame is the `shaper` while shaping and the `player` once
  installed. It's the same frame and the same surfaces: handoff changes the audience, never
  the frame.

## The life of an actant

1. **Seed** it in the lobby. It wakes, says hello, and has no game yet.
2. **Shape** it: talk in chat, sketch on the whiteboard and pass it the baton, play the
   stage. It rewrites its own game, tools, identity and memory as you go.
3. **Checkpoint** it (top bar), then **release** a checkpoint with a title.
4. A player opens `play.html?r=<release>` and gets their own **install**: the soma whole,
   the surfaces fresh. On first wake it's told it's time to be the game.
5. Players can ask for **house rules** in chat. Each install drifts toward its player; the
   release and the shaping actant don't change.

## Pages

| URL | what |
|---|---|
| `/` | lobby: seed an actant, open one, list releases |
| `/frame.html?a=<actant>` | shaping |
| `/frame.html?i=<install>` | hosting |
| `/play.html?r=<release>` | install a release (remembered per browser) and open it |

## For Claude: the explorer seat

`window.explorer` in any frame sits in the human seat and acts only through surface
actions. It has `say`, `draw`, `pass`, `press`/`hold`/`release`/`point`/`click`, `look`,
`board`, `state()`, `doings()`, `idle()`, and `section(name)`. `explorer.shard({ brief,
turns, budget })` (or `frame.html?…&shard=<brief>`) sits a Claude shard in the seat with
its own loop to shape or play, and resolves to its report.

Data lives in `data/` (gitignored): `actants/`, `releases/`, `installs/`, and
`log/<who>.jsonl` holds every inference, with image bytes stripped.

The journal is [docs/journal.md](docs/journal.md).

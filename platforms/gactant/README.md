# gactant

**Ludants: games that are also actants.** A ludant is played and shaped by whoever sits
with it. Its game isn't something it made; it's one of the ways it exists, so changing
the game is the ludant changing itself. (This is level 5, *Faceted*, of the Explorer
levels.)

There are no modes. Playing and shaping are the same act at different intensities: you
play it, and sometimes you ask it to change. A house rule is shaping. Anyone sitting with a
ludant can checkpoint it, put it back to a checkpoint, and **publish** it. Anyone can take
a copy of a publication and publish their copy again, so lineages grow.

```
node platforms/gactant/server.mjs          # http://lilg:7780/
```

`platforms/gactant/.env` holds `OPENROUTER_API_KEY` (and optionally `GACTANT_MODEL`,
default `anthropic/claude-sonnet-5.5`). No dependencies, no build: plain ES modules.

## The shape of it

- **The frame** is the browser window. It holds **surfaces**, each with its own structure
  and behavior, built with whatever fits its job:
  - **stage**: a canvas with a frame clock, input, fast-forward, and a caption
  - **chat**
  - **whiteboard**: a sketch board with a baton
  - **status**: lights
  - **inspector**: the soma and a log of doings

  Each surface has *actions* (done as someone) and *events* (`chat.posted`,
  `stage.frame`, `whiteboard.turn`, …).
- **The ludant** is a soma: named sections. `tools`, `game` and `hooks` are code. The
  hooks reach into the surfaces: they listen to events, run the game at frame rate, write
  memory deterministically, and decide what wakes inference. The rest (`origin`,
  `identity`, `memory`, whatever it adds) is text it carries. An idle ludant costs nothing.
- **The seat is a person.** You give your name once per browser. The frame tells the
  ludant who is here, who has sat with it before, and where it came from (seeded by X, or
  a copy of "T" published by Y and taken by Z). Its hooks decide what an arrival means.
- **Names.** A seed gets an invented given name (Elodon) that no other lineage uses;
  copies keep it. The ludant keeps its game's title in a `title` section, and its name is
  the two together: `Elodon-Hop`. Each published name belongs to exactly one snapshot, so
  publishing again takes a change (beyond the title) *and* a new title.
- **Checkpoints come for free.** One is taken whenever someone sits down, so anything
  changed "just for tonight" can be undone from **history**. Restoring keeps the present
  as a checkpoint too.

## Pages

| URL | what |
|---|---|
| `/` | lobby: your name, publications (with lineage), every ludant here, seed a new one |
| `/frame.html?l=<ludant>` | sit with a ludant |
| `/play.html?p=<publication>` | take a copy (remembered per browser) and sit with it |

## For Claude: the explorer seat and shards

`window.explorer` in any frame acts as the browser's person, and only through surface
actions. It has `say`, `draw`, `pass`, `press`/`hold`/`release`/`point`/`click`, `look`,
`board`, `state()`, `doings()`, `idle()`, and `section(name)`. `explorer.shard({ brief,
name, turns, budget })` (or `frame.html?…&shard=<brief>`) sits a Claude shard in the frame
under its own name (default `claude-shard`) with its own loop. It can play, talk, sketch,
checkpoint, restore and publish, and it resolves to a report.

Data lives in `data/` (gitignored): `ludants/`, `published/`, and `log/<who>.jsonl` holds
every inference, with image bytes stripped.

The journal is [docs/journal.md](docs/journal.md).

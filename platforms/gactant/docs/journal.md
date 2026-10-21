# gactant journal

*gactant: game-shaped actant.* A platform where a human and a nascent actant shape the
actant's game facet into a game, and then the actant is handed off so other people can
play it.

---

## 2026-10-20 · Session 1: the frame, the surfaces, a seed

### Where this came from

Robby pasted in **The Explorer Levels**, the ladder for how an actant relates to the
program it works on:

> hears about → handles → writes into → lives alongside → **is**

Level 5, **Faceted**, is the one this platform is for: the game mechanics are part of the
actant's dynamic embodiment, so changing the game *is* the actant changing itself. In the
doc's terms there's **shaping** (the human playtests through the game surface, which is
already inside the actant's frame), then **handoff** (a checkpoint is installed for a
player and told it's time to be the game). Handoff is *a new audience, never a new
frame*.

Robby's goal in his words: "a platform on which humans can collaborate with a nascent game
oriented actant to develop its game facet into a game and then provide the mechanisms
for the shaping collaborator to release that actant such that others can play the game
facet." He also asked for better words for what it means to interact with an actant that
is a game.

Words I offered, and the ones we're using here:
- **shaping** (creator + nascent actant) → **handoff** (a checkpoint ships) → **hosting**
  (it is the game for its player).
- **playing** is the deterministic part. **Molding** is when a player wakes inference to
  change things: house rules.
- The closest human analogue is a **game master**, a person who *is* the game for the
  table. Not used in the code yet, but it's the feeling.

### The first wrong turn, and the correction that defined the platform

I first framed "surfaces" as a DOM-vs-canvas question, then as *which surfaces are body
and which are frame*. I put the game canvas in the body, and chat and status in the
frame. Robby corrected me, and his correction is the platform's design:

> "Imagine that one of the surfaces within the frame is a chat. Part of the actant's
> embodiment would allow it to be integrated with that chat such that it could post to
> it and maybe wake when things are posted to it. But the surface itself in this case is
> not part of its embodiment. … I've done experiments where I pushed it all the way in,
> the entire frame is the embodiment. But I think for this project I want to have the
> frame have surfaces that the actant's embodiment can hook into and integrate with."

So:
- **The frame is the browser window.** It holds **surfaces**, and each surface has its own
  structure and behavior and works with no actant at all. Each one is built with whatever
  technology fits its job: the stage is a canvas because it runs at 60 fps, and the chat
  is DOM.
- **Each surface exposes a typed API**: *actions* (done as some actor) and *events*
  (`<surface>.<kind>` on a bus).
- **The embodiment reaches out and touches them.** The actant's soma holds the hooks:
  which events it listens to, and what each one does. A hook either runs deterministic
  code, or wakes inference.
- Even the game works this way. The stage is a plain canvas with a clock and input. The
  game is the soma's code hooked into it. So the level 5 test still passes (changing the
  game changes the actant), and the actant can't break a surface itself, only the way it
  touches one.

Robby's whiteboard example was the clincher: the human sketches, the actant is woken
"when it's its turn," and the board's API makes it a collaboration surface for "working
out the shape of something or the coloring of something." He's built one before and says
it works well.

Two more calls from Robby before any code: **fresh code only** ("freshly built all new
h0t off the press code!"), so nothing from the vanilla platform or potluck; and
**OpenRouter** for inference.

### What I built

`platforms/gactant/`, with no dependencies and no build step: plain ES modules in the browser
and a ~200-line Node server.

**Server** (`server.mjs`): it only keeps things, plus a relay. Actants, checkpoints,
releases and installs are JSON files under `data/`. `/api/infer` relays to OpenRouter
(the key is in `.env` and never reaches a page), and every inference is appended to
`data/log/<who>.jsonl` with image bytes stripped, so I can read what an actant saw and
said. Model: `anthropic/claude-sonnet-5.5` (Sonnet for anything self-modifying; that's
the lesson from Glint and Habitat that haiku-tier models don't self-modify well).

**Frame** (`public/js/frame.js`): one window, one actant, one human **seat**. The seat is
`shaper` while shaping (`frame.html?a=<id>`) and `player` once installed
(`frame.html?i=<id>`). It's the same code and the same surfaces; only `audience` differs.

**Surfaces**, each with its own structure, actions and events:
| surface | tech | actions | events |
|---|---|---|---|
| stage | canvas + rAF clock | look, restart (and a frame-rate handle: ctx, size, input) | frame, key, pointer, halted |
| chat | DOM | post, read | posted |
| whiteboard | canvas, 100×60 board units | draw (path/line/rect/circle/text), undo, clear, pass (the baton), look | drew, turn, cleared |
| status | DOM lights | say (the actant's own status line) | said |
| inspector | DOM | none: it's for humans (soma sections, editable; a running log of doings) | n/a |

**Soma** (`public/js/actant.js`, `seed.js`): named sections. Three are code:
- `tools`: an array of `{ name, description, input_schema, run(input, me, surfaces) }`,
  what it can do awake.
- `game`: a factory `(stage, me) => { frame(dt), key(e), pointer(e) }`, the facet people
  play.
- `hooks`: `(on, me, surfaces) => void`, its wiring to the surfaces.

The rest is text: `origin`, `identity`, `memory`, plus whatever it adds.

The seed's code sections explain themselves in comments: the soma *is* the manual. The
system prompt is the soma plus a short `<frame>` block of perception (audience, the
surfaces' self-descriptions, current faults). The user turn is just the events that woke
it, as `<event>` tags. There are no instructions; the event is the impulse (the Habitat
"thrive" lesson).

Decisions worth keeping:
- **Two innate tools that aren't in the soma**: `write_section`, `edit_section`. However
  it breaks its `tools` list, it can still repair itself. This is the "don't self-maim"
  thread, answered small.
- **Selective rebuild.** Editing `tools` doesn't reset a game in progress. Editing `game`
  does: the factory runs again and its state starts over. That's fine while shaping. It
  may matter when a player molds mid-game. Open.
- **A stage that halts.** A frame handler that throws halts the stage at once and emits
  `stage.halted`, which the seed's hooks wake on. A game throwing every frame is broken,
  not unlucky.
- **The wake governor.** Wakes no human caused (a halt, say) are allowed three in a row,
  then the actant *rests* (amber light, "waiting for a human") until a human acts. This
  prevents the infinite fix-it-break-it loop that would otherwise burn money unattended.
  Idle cost is zero: nothing wakes the actant except events.
- **Events that arrive mid-think join the think in progress** (as "Meanwhile:"), rather
  than queuing a second one.
- **Images**: `look_at_stage` / `look_at_whiteboard` return `{ text, image }`, and the loop
  attaches the image as a user message after the tool results, so the actant actually sees
  its stage and the board.
- **Handoff = fresh surfaces, whole soma.** An install copies the release's soma exactly,
  but chat and whiteboard start empty. The shaping conversation was between the actant and
  its shaper, and the player is a new audience. On first wake the install gets a
  `frame.audience` event: "It is time to be the game." A fresh seed gets one too: "You
  have just been seeded. Your shaper is here with you."
- **The inspector hides for players** behind an "inside" toggle. This is in tension with
  "no new surfaces at handoff": the surface is still there, just folded away.

### What level am I working at?

Robby asked which level *I* would adopt while building this. My answer: I start at **2
(Instrumented)** and **3 (Scripted)**. `window.explorer` gives me a seat in the frame:
I drive it through Playwright, and it acts only through the same surface actions a human's
clicks do (say, draw, pass the baton, press keys, look). I'll script playtests with it.
**Level 4** is in reach and the frame is shaped for it. The human seat is just a name
on the surfaces, so a shard of me could *sit in the shaper's seat* with its own loop and
shape an actant. I'll build that if the session allows.

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

### First light: Pip

I seeded **Pip** and it woke on the `frame.audience` event ("You have just been
seeded"). Its first act was to say hello and to set its own status line to "awake,
waiting for ideas." That cost about 2¢. Everything worked first try, which never happens.

![seeded](shots/01-pip-seeded.png)

**The whiteboard handoff.** Sitting in the shaper's seat (through `window.explorer`), I
sketched a dark field, a glowing "you", white motes, a green blob labeled "something that
eats light", and the line "the darker it gets, the less you can see". Then I passed the
baton with: *"you are a little glow in the dark collecting motes. your glow is your light
AND what gives you away."* Pip looked at the board, read the chat, and wrote a 6,000-char
game in one `write_section`: glow drains over time, motes refill it, and hunters sense you
from a distance *that grows with your brightness*. "So you have to feed the light to
survive, but feeding it is what gets you hunted." It also invented **hush** (hold space to
dim and slow down). That's a better mechanic than anything on my sketch.

![first playable](shots/02-first-playable.png)

The first drama was right there in the screenshot. By the time I looked, the game said
**"the dark takes you · 0 motes."** The glow drains from the first frame, so it had died
alone while Pip was still typing its chat message. Pip also said in its own words "I haven't played it
yet," and it never looked at the stage before calling it done.

**Shaper notes, round one.** I played it myself (it's lovely; glow in the dark is a
feeling) and sent four notes: wait for first input, click-to-move doesn't work, the drain
is brutal, motes are invisible. I added one note about how we work: *look at the stage
yourself before you tell me something's ready.* Pip read the stage (it saw its own death
screen: "you were right, it had already run out"), made nine surgical `edit_section`s,
looked again, and reported. But it said: **"I haven't played it with real input… I guessed
the event format."**

### Finding: an actant that can see its game but can't play it

That was a hole in the frame, not in Pip. The stage took input only from the human's
keyboard. **Fix:** the stage gained input *actions* for any actor: `press`, `hold`,
`release`, `point`, `wait`. These are the same input a human gives, so anyone in the frame
can playtest. `window.explorer` now uses those same actions too, so my seat and Pip's are
symmetric.

I didn't give Pip a tool for it. I told it in chat that the capability existed and that
"you can give yourself one." **Its very first move was to write a `play` tool into its own
tools section**: an `actions` array of `{do: 'hold'|'press'|'release'|'point'|'wait'|'look'}`
steps. Then it played its game three times and measured:

> Hush speed is 40 and a chasing hunter's speed is 48+, so hushing when a hunter is close
> just gets me caught. It only works if I do it early, before they notice me. That might
> be what you want, but nothing tells the player.

That's a real design note, from the inside. Tools-are-body, confirmed in the first hour.

### Finding: the report that went nowhere

And then it delivered that whole playtest report… as its **final thought**. Not a `say`.
The shaper saw nothing in chat. I only knew because the inspector shows thoughts. The
frame's perception block literally says "Text you write outside of tools stays with you;
nobody else sees it," and it did it anyway, twice. The model habit of answering "the user"
is strong, and in this frame the "user" turn is just events.

I didn't patch the frame for this. A shaper molds habits, so I told it the way a shaper
would: "this is the second time something landed in your head instead of the chat, so
maybe that's worth remembering about yourself." Pip wrote its first memory:

> Lessons about myself:
> - My plain text output is private. Nobody sees it, not even when it looks like a report.
>   It has happened twice that findings stayed in my head. Anything my shaper or a player
>   should know goes through the say tool, every time.
> - Before I say something is ready, I look at the stage myself. Better still, I play it
>   with the play tool.

That's shaping working on the actant, not on the game. It also re-tested click-to-move by
pointing and holding, and confirmed it works. One miss: I'd said "yes to 1 and 2" and it
asked me again which to do first. Running total: **$0.21**.

Platform design note: the seed's `game` section opened with a comment block describing the
stage API. Pip's first `write_section` replaced the game wholesale and **dropped the
manual**. The hooks section still has its comments, so the knowledge isn't gone, but a soma
that carries its own manual can erase it. Watch this.

### Finding: the actant that gaslit itself

Round three: "do both: gentler first hunter AND hush ~55, then the mote flash." Pip made
six edits and they all landed. Then it posted a **correction** to chat:

> When I checked the code, most of those values were already set before this round.
> That includes the 12s delay, the 160px spawn distance, the 36 and 46 chase speeds, hush
> at 55, and the faster flash. Several of my edits changed nothing…

Every one of those values was its own edit from a minute earlier. **The cause was in the frame.** I
re-rendered the system prompt (the whole soma) on every turn of a wake, so after an edit
the actant re-read its own fresh code as if it had always been there, and concluded its
edits had been no-ops. A soma shown as a live mirror erases its own recent history.

**Fix:** the soma is snapshotted once, when the actant wakes. The frame block now says
"This is your soma as it was when you woke. Edits you make while awake take effect at
once; your tool results show them." That's honest: edits are known by their results, the
way you know you moved your arm. It also made prompt caching actually work.

### Cost: the cache was flapping

`data/log/*.jsonl` showed the system prompt alternating **cache write / cache hit** on
consecutive calls even when it hadn't changed. My guess is that OpenRouter was routing
between providers with separate caches. I made three changes: freeze the system per wake;
`provider: { order: ['anthropic'] }`; and a moving `cache_control` mark on the newest
message, so the growing conversation inside a long wake is read from cache too.
Before: the "do both" round cost ~$0.28. After: getting ready for handoff cost $0.054, and
the player's house rule $0.05. Session total so far: about $0.85 across every wake.

### Getting ready to ship

I played ~20 s (a hunter found me at 2 motes; hush helped me slip one) and said I thought
it was ready, but "your identity still says you're new and don't know what game you are…
you'll wake up with them and won't have me there." Pip rewrote its identity from 155 to
1,762 chars: the rules, the controls, what it hasn't verified, and this:

> When a player arrives (frame.audience), I'm the game, not the builder. I greet them
> briefly through the say tool, in one or two lines: what the game is, how to move, how to
> hush. No build jargon, no reports about my own code. I don't spoil the hunters. If they
> chat, I answer as the game's voice: warm, brief, a bit hushed.

That's creator intent carried as identity, exactly what the levels doc predicts:
"Intent built into identity is likely sturdier than an articulated charter." I didn't write
a charter. It wrote itself one because it was about to leave home.

### Handoff

Checkpoint 1 "first ship" → release **"the dark takes you"** → `play.html?r=…` installs a
fresh copy and opens `frame.html?i=…`. It's the same frame with the same surfaces, and the
HOSTING light is green. Chat and whiteboard start empty; the soma is whole.

On its first wake as an install (`frame.audience`: "It is time to be the game. Your
player is here.") it said exactly one thing, in the game's voice:

> You're an ember in the dark, and your glow is your life. Move with WASD, the arrow keys,
> or by clicking. Chase the white sparks to feed the light. Hold space to hush: you'll dim
> and slow down, but you'll be harder to find.

No build talk. It didn't spoil the hunters. It did what its identity said.

![hosting](shots/06-hosting.png)

### House rules

As the player: "my little brother wants a turn, he's 6. can the hunters be a lot slower
for him? and he wants his ember to be pink." Pip added a `SLOW` multiplier to hunter speed,
recolored the ember, glow and bar, looked at the stage, and said "Have fun, little brother.
🌸". It cost five cents, and the doc's Xbox-with-family example happened as described.

![pink](shots/07-house-rules-pink.png)

Its private afterthought is the next open thread:

> Those changes apply to every run, not just the little brother's. The old orange is gone,
> and so is the old hunter speed.

**Molding an install is one-way.** The install drifted (its game is now 7,745 chars; the
shaping Pip is still 7,659 and has no pink), which is the intended per-player drift. But a
house rule for one sitting became permanent. A table needs a way to say "back to how it
shipped" or "just for this game". Candidates: install-level checkpoints, or games that keep
rules as data the actant toggles instead of code it rewrites. Open.

### Folding Pip back into the platform

- **The seed now ships Pip's `play` tool**, with a comment crediting it ("Grown by Pip on
  2026-10-20… adopted into the seed"). It's the first time an actant contributed to the
  platform. Pip's version claimed to return "any mid-way looks" but only returned the last
  one. Tool results can now carry `images: [...]`, and the seed's `play` shows every look.
- **The body contract moved into the frame.** How the frame runs `tools` / `game` /
  `hooks`, what `me` and the stage handle are: that's the frame's side of the bargain. It
  now lives in the `<frame>` perception block, not only in soma comments that an actant
  will happily overwrite (as Pip did on its first write).
- **"As shipped."** A player can put an install back the way it was released
  (`POST /api/installs/<id>/reset`, a top-bar button). The soma returns to the release; the
  chat stays. The install perceives it: "Your player has put you back the way you shipped
  once; changes made at this table before then were undone, though the chat still
  remembers them." This is the smallest answer to one-way house rules. "Just for this game"
  is still open.

### Level 4: the seat shard

Robby asked what level I'd work at. Driving `window.explorer` from Playwright is me at
2–3: my thinking stays outside the frame, and I poke in. So I built **level 4** for
myself: `public/js/shard.js`. A **seat shard** is a Claude with its own context and loop
that sits in the frame's human seat (shaper or player). It acts only through surface
actions: say, wait for a reply, play the stage, sketch, pass the baton, checkpoint, and
`finish` with a report for whoever sent it. The actant sees it as the seat, like any
human. Its doings show in the inspector in green; its inferences log under
`<record>-shard`. A budget covers the whole sitting, actant thinking included, and it stops
itself when it's spent. It also keeps only the newest three pictures in context.

There's an honesty question here that I'm noting, not solving: the actant can't tell the
shard from a person. For shaping rehearsals that's the point. For anything a real player
would see, it shouldn't be hidden.

### The first shard sitting: Moth's garden

I seeded **Moth** from the new seed and sat a shard in the shaper's seat. Its brief: a
non-technical shaper who wants "a calm little game about tending a tiny garden through the
seasons"; it plays every version before giving feedback, uses the whiteboard at least
once, checkpoints when it's ready, and reports back to the platform's builder. Budget $3.

It took three rounds and cost **$0.47 for the whole sitting** (shard $0.08, Moth $0.38).
Moth built a 6×4 soil bed: click to plant, pastel flowers sway as they grow. The shard
played it, caught a missed first click, sketched a **season wheel** on the whiteboard, and
passed the baton: "a slow wheel that turns on its own, sky/ground colors drift. Flowers fade
in autumn, rest as seeds in winter, return in spring." Moth built exactly that, with ~40 s
seasons, snow on the soil, and a little wheel indicator. The shard checkpointed it as
"Seasonal garden v1": "I'd hand it to a friend as is."

![moth's garden](shots/08-moth-garden.png)

The shard's report, trimmed to what matters for the platform:

> - It couldn't properly test winter itself, because its own test key presses skipped
>   seasons. *(Moth added a season-skip debug key so it could playtest. That key is now
>   part of the game that ships. Dev affordances leak into the facet, because there's
>   nowhere else for them to live.)*
> - The stage images were 640×480 while the tool says 320×240.
> - There was no feedback on whether Moth viewed the board. The note carried the meaning.
> - The "asleep/awake" light was useful.

Fixes: `look` now says when a picture is enlarged ("coordinates are still stage
coordinates"). The whiteboard emits `whiteboard.looked { who }` and shows "Moth looked just
now" beside the baton.

Things I saw that the shard didn't report:
- **A checkpoint race.** The shard said "I'll checkpoint here," then checkpointed at once,
  while Moth was still waking on that very message to fix the hint text. The checkpoint
  doesn't have that fix. A checkpoint should probably wait for the actant to be asleep, or
  at least say that it's awake.
- **Nobody passes the baton back.** Pip and Moth both kept the whiteboard after their turn.
  The board says whose turn it is, but neither actant treats that as a turn they have to
  end.
- **Stale status lines.** Moth's status line still said "awake, waiting for ideas" from its
  first minute. An actant sets a status line once and forgets it exists.

### "As shipped," tested

I reset the pink install. Its game went back to 7,659 chars, orange, and the chat was kept.
Then, as the player: "I put you back to normal. wait, is the ember orange again?" Pip:

> Yes, it's orange again. Putting me back undid the pink and the slower hunters. Those
> changes were lost, and my earlier message made it sound like they'd stay. Want me to make
> them pink and slow again?

It understood what had been done to it, and it owned its earlier mistake. 3¢.

### Tally, end of the first push

About $1.70 of inference all session, across two actants, one install and one shard
sitting. Idle cost is zero.

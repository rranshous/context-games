# Mantle

A real-time strategy game where you design your own units. Your army starts with nothing, and
every unit in it is one you design with the one person you work with: a biologist who grows
living war-beasts in vats, or an engineer who builds war machines in a shop. You describe
what you want in your own words; they design it, draw it, and tell you what they think.

What's built so far is **the lab**: picking who you work with, and designing units with them.
Fights against the computer come next. See [docs/idea.md](docs/idea.md) for where it's going
and [docs/journal.md](docs/journal.md) for how it got here.

## Run it

```
node server.mjs            # http://localhost:7790/
```

No dependencies. It needs a `.env` next to `server.mjs`:

```
OPENROUTER_API_KEY=...
MANTLE_MODEL=anthropic/claude-sonnet-5.5            # optional: the aids' thinking
MANTLE_ART_MODEL=google/gemini-3.1-flash-lite-image  # optional: the units' pictures
```

Kept designs go in `data/designs/`, every picture in `data/art/`, and every call, with its
cost, in `data/log.jsonl`. `data/` isn't committed.

## How it fits together

- `public/js/spec.js`: **the contract.** A unit is a size (1 tiny to 5 huge), seven stats
  rated 1 to 10 (health, armor, speed, damage, attack rate, range, sight) and up to three
  abilities. `check()` holds a spec to the rules, and `price()` works out its cost, the room
  it takes in an army and how long it takes to make. The price comes from the formula, never
  from the aid, so the same spec costs the same for everyone.
- `public/js/aids.js`: the aids, each with a voice, the abilities their lab can make, what
  comes cheap or dear to them, their limits, and how what they make looks.
- `public/js/aid.js`: the conversation. The aid puts designs on the bench with one tool,
  `propose_unit`. The current bench is shown to the aid fresh before every call, in a
  note after the conversation (the way gactant shows a ludant its soma). A new look means a
  new picture.
- `public/js/cutout.js`: the pictures come on white, and this lifts the unit off it.
- `public/js/lab.js`: the page.
- `server.mjs`: serves the page, holds the key, and keeps designs and pictures.

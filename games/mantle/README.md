# Mantle

A real-time strategy game where you design your own units. Your army starts with nothing, and
every unit in it is one you design with the one person you work with: a biologist who grows
living war-beasts in vats, or an engineer who builds war machines in a shop. You describe
what you want in your own words; they design it, draw it, and tell you what they think.

What's built:
- **The lab:** pick who you work with, and design units with them.
- **The front:** a campaign of five maps that get harder, each held by a scripted rival.
  A map's briefing is a scouting report of the rival's units, priced like yours. You take
  up to five of your designs in, so seeing the report and going back to the lab to design
  an answer is the loop.
- **The match:** real time. Your base makes units from your roster, two at a time.
  Matter comes from the base and from deposits you hold. Destroy their base to win.

It plays on phones as well as with a mouse. See [docs/idea.md](docs/idea.md) for where it's
going and [docs/journal.md](docs/journal.md) for how it got here.

## Run it

```
node server.mjs            # http://localhost:7790/
```

No dependencies. **Thinking comes from the commander's own OpenRouter,** as in gactant. "Connect OpenRouter"
in the lab runs OpenRouter's approval page (OAuth, PKCE) in a popup. The key comes back to
`connected.html` and is kept in this browser, and the lab calls OpenRouter straight from
the page (`public/js/openrouter.js`, `public/js/brain.js`). The key never reaches the
server.

As a fallback, a local install can lend thinking from its own key, in a `.env` next to
`server.mjs`:

```
OPENROUTER_API_KEY=...                              # lend this key to anyone who hasn't connected
MANTLE_MODEL=anthropic/claude-sonnet-5.5            # optional: the aids' thinking (relay)
MANTLE_ART_MODEL=google/gemini-3.1-flash-lite-image  # optional: the units' pictures (relay)
MANTLE_PUBLIC=1                                     # lend nothing: everyone connects their own
```

Headless matches, to tune the maps (a plain scripted commander against each rival):

```
node tools/bout.mjs [--aid brackett|hollis] [--level ford] [--runs 5] [--roster mine]
node tools/duel.mjs        # is the price fair? every unit against every other, at equal cost
node tools/redteam.mjs [--aid hollis] [--reach]   # hunt for underpriced designs in a lab's whole design space
node tools/draw.mjs        # draws any missing rival-unit and base pictures into public/img
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
- `public/js/lab.js`: the page: the title screen (continue with your aid, or choose another; the name atop every screen leads back to it), choosing an aid, and the lab. Hovering an ability or a stat says what it is. The lab is styled after the aid you chose (`body[data-aid]` in `style.css`): the vats for Hollis, the shop for Brackett.
- `public/js/ui.js`: shared page pieces: a unit's sheet, ability tiles, a unit's picture (with a mark for one whose likeness is gone), and the tips.
- `public/js/icons.js`: the icons: line drawings that take the color of the text around them.
- `public/js/levels.js`: the campaign. The rivals' units are specs from the same two
  labs, checked by `check()` at load. Each map says why it's harder: the rival's head
  start, their supply line, deposits, first push, ambushes.
- `public/js/sim.js`: **the match, as numbers.** No page and no drawing, so it runs the
  same in a browser and in Node. `body()` turns ratings into the match's own numbers,
  which never show. Abilities each do one thing here (venom poisons, burrow hides and
  doubles the first strike, siege locks down for more reach, and so on).
- `public/js/rival.js`: the scripted rival. It builds down its list, holds its half of the
  deposits, defends, sets ambushes, and sends bigger waves.
- `public/js/anim.js`: how things move on screen. Each unit has one picture, animated by
  its gait (walks, rolls, slithers, hops, flies, hovers; the aid picks one, or it's guessed
  from the look). It also draws shots in flight, flashes, dust, falling bodies, and the
  marks they leave on the ground.
- `public/js/sound.js`: sound made in the browser from noise and oscillators, with no files.
- `public/js/war.js`: the front: maps, briefings, rosters, progress. The muster, always in view at the bottom, holds the roster you're taking in and Begin.
- `public/js/match.js`: a match on screen: drawing, mouse, keys and touch, the HUD. It
  also sets `window.explorer` (`state()`, `make(i)`, `order(ids, kind, x, y)`,
  `speed(n)`, `look(x, y)`, and `sim`) for playing it from outside.
- `core.mjs`: **the API, the same wherever it runs.** It handles commanders (a signed
  cookie per browser), designs (tied to their maker as `by`, which anyone can see and only
  the maker can change), pictures (checked, counted per commander per day, and kept), and
  the relay. It takes a web Request and gives back a Response.
- `server.mjs`: the local host: files in `data/`, the pages, `node server.mjs`.
- `worker.mjs` and `wrangler.toml`: the Cloudflare host. A Durable Object (World) keeps
  the documents in SQLite, and R2 keeps the pictures.

## Playing a match

| | mouse and keys | touch |
|---|---|---|
| select | click, or drag a box; double-click selects that design on screen; Q selects all | tap; double-tap; **All army**; **Box**, then drag |
| order | right-click: move, or attack what's under it; A then click: move, fighting on the way; S: stop | tap the ground or an enemy (**Fight** or **Move**, by the button) |
| new units gather | right-click with nothing selected | **Rally**, then tap |
| make | the cards at the bottom, or 1–5 | the cards |
| look around | arrows, wheel to zoom, space for home, the minimap | drag, pinch, the minimap |
| pause | P, or ❚❚ | ❚❚ |

## Hosting

On Cloudflare: the Worker serves the pages and the API, one Durable Object keeps every
document (where multiplayer will meet later), and R2 keeps every picture. Try it with
`npx wrangler dev`, which simulates both locally.

**Live at https://mantle.rip.** `www.mantle.rip` and plain http both go on to it. Ship a
change with `npx wrangler deploy`.

The site around the game: `/faq` and `/privacy` (Cloudflare serves `faq.html` at `/faq`,
and `server.mjs` does the same), a `404.html`, `robots.txt` and `sitemap.xml`, a share
picture (`og.jpg`, drawn from the two aids' portraits), icons and a web manifest so it can
sit on a phone's home screen. The privacy page describes what `core.mjs` keeps; change
them together.

**Every picture people make is scanned.** Cloudflare's CSAM Scanning Tool looks at what's
served through its cache. A Worker's own responses don't pass through it, so the pictures
are served from the R2 bucket's own custom domain, **https://art.mantle.rip** (`ART_BASE`),
which does. How it was set up:

1. The site's domains: `routes` in `wrangler.toml` (custom domains on the mantle.rip zone).
2. The bucket: `npx wrangler r2 bucket create mantle-art`, then
   `npx wrangler r2 bucket domain add mantle-art --domain art.mantle.rip --zone-id <zone>`.
3. CORS, so pages can read the pictures into a canvas:
   `npx wrangler r2 bucket cors set mantle-art --file r2-cors.json`.
4. The CSAM Scanning Tool for the zone (dashboard: Caching > Configuration > CSAM Scanning
   Tool). It needs a contact email for alerts, so it's a dashboard step for the owner.
5. `SESSION_SECRET`, which signs commanders' cookies: a wrangler secret.
6. `npx wrangler deploy`.

The Worker still answers `/art/*` from R2 itself (for `wrangler dev`). That path isn't
scanned, and nothing on the live site points at it.

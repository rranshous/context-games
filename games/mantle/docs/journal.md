# Mantle: journal

## Session 1 (2026-10-27): the lab

### Where it came from

Robby: "wouldn't it be interesting if there was a multiplayer RTS game where you got to
_design_ your units." Unlike picking Protoss or Zerg, you start with nothing and create the
units you want, kept fair by budget and limits.

- **A new project, not part of gactant.** gactant is one ludant that you talk to and that
  grows its own body. This is a real-time simulation where several players compete, and
  fairness is the point. The ideas carry over: a free body with a fixed contract around it,
  the AI turning words into code, and the live soma note.
- **The aid is the flavor.** Robby: "an AI aid that is helping you, the engineer or the bio
  scientist maybe... maybe _that_ is the flavor you choose at the begining and it comes w/
  slightly diff constraints."
- **AI art, not body parts.** "Part of the experience is seeing what type of units your
  opposition has visually." The guardrail on the look is in prose (grown or built), and the
  art stays free.
- **Real time**, with a minute at the start for first orders.
- **Waiting is part of the game.** Asked whether more complex units take longer, Robby
  agreed: the AI's wait time becomes the lab's work time. Make time is in the price now:
  15s + 0.12 s per point of cost + 10s per ability, so 20s for the cheapest tiny unit and
  about 155s for a maxed huge one.
- **Plan:** the studio first, then fights against a normal computer opponent, then AI
  players or multiplayer.

### Choosing the art model

The same acid-beetle prompt, run through three models on OpenRouter:

| model | time | cost | result |
|---|---|---|---|
| gemini-3.1-flash-lite-image | 3.9 s | $0.034 | clean, on white |
| gemini-3.1-flash-image | 8.6 s | $0.067 | clean, on white |
| gpt-5-image-mini | 41 s | $0.044 | a lovely tortoise-beetle, but it ignored the white background and painted a glowing scene |

Flash-lite is the default. In the lab it draws in 2.6 to 5 seconds. The two aid portraits
were drawn once with flash (not lite), and are kept in `public/img/`.

### The contract

`spec.js` is the line the whole game stands on.

- **The spec:** a size from 1 to 5, seven stats rated 1 to 10, and up to three abilities
  from the aid's menu.
- **The price** is built up from:
  - 10 per step of size
  - each stat's weight × rating^1.4, leaned by size (big makes health cheaper and speed
    dearer) and by the aid's craft
  - each ability's cost, scaled by size
- **Landmarks:**

  | unit | Hollis | Brackett |
  |---|---|---|
  | tiny, all 2s | 135 | 125 |
  | medium, all 5s | 465 | 435 |
  | huge, all 9s | 1025 | 955 |

  Brackett is about 7% cheaper on even builds. That's left alone until fights can say what
  balance means.
- **Ratings are game terms**, so players see them. The simulation's own numbers will be the
  match's business and never shown (the immersion rule).

The aid has one tool, `propose_unit`, which always takes the whole design. The spec is
checked, and if it breaks a rule the problems go back to the aid to fix. If it passes, it's
priced and put on the bench. The bench is shown to the aid fresh every call, in a system
note after the conversation, the same way gactant shows a ludant its live soma.

### First tries

- **Hollis**, asked for "a big slow armored beetle that spits acid at things from a
  distance. Something that can hold a line":
  - She made the Acid Bulwark: large, health 8, armor 7, speed 2, venom and regeneration,
    for 505.
  - Unprompted, she suggested trimming armor and putting the weight into health, "since flesh
    costs us far less than shell." That's her lean, applied correctly.
  - Asked to make it burrow and cost less, she gave it spade-forelegs (a new picture) and
    swapped regeneration for burrowing. It dropped to 475.
- **Brackett**, asked for a cheap scout and a long-range tank killer in one breath:
  - He did them one at a time.
  - The Wisp Scout came first: a tiny tracked sensor mast, speed 8, sight 9, for 230.
  - Then the Longstrider: a large walking long-gun with damage 9, range 9 and siege mode,
    for 560. He added, "a gun that far out will need a spotter."

  Both aids stay in voice and argue about price on their own.

### The drama

- **Hollis guessed at prices.** She said "size 4 and range 5 are the expensive parts," but
  she couldn't see where the cost came from, so it was a guess. Now the breakdown goes to
  her in the tool result and in the bench note.
- **The lab showed through the pick screen.** `#lab { display: grid }` beat the `hidden`
  attribute. Fixed with `[hidden] { display: none !important }`.
- **The art sat small in its frame.** The cutout now trims to the unit.
- **White pockets.** Background showing between the treads, or inside a tripod's legs, is
  enclosed, so the edge fill can't reach it. Any pocket of near-pure white bigger than 0.15%
  of the image is now cleared too. Small white rims at joints remain, which is fine for
  now.
- **"The bench only holds one design at a time."** Brackett said this to the commander.
  It's true, and it's how he managed two requests in one, but it's the lab's mechanics
  showing through. Leaving it for now. If it grates, a bench with room for a few designs
  would fix it.

What the session cost: 12 calls for $0.21, plus $0.13 for the two portraits.

### Abilities you can read, and a lab that's theirs

Robby: "could i get an explaination when i mouse over one, also maybe make the UI a bit better so it's easier for me to immediatly tell that the (right now) pill is an ability. maybe style the surface based on which builder i chose."

- **Abilities have their own place.** On the sheet they now sit under an "Abilities" heading. Each one is a tile marked with the aid's sign: a seed for Hollis, a hex nut for Brackett. Hovering or focusing a tile shows what it does and what it adds to this unit's cost. Stat names have the same hover, explaining what they measure. On the pick screen, each aid's abilities are tiles too, so you can hover them before choosing.
- **The lab is dressed as theirs.** The page gets `data-aid`, and each aid has a look:
  - **Hollis's vats:** deep green, soft round corners, faint cells in the background, a vat-shaped glow with bubbles behind the unit, rounded stat bars, and italic names.
  - **Brackett's shop:** amber, sharp corners, a blueprint grid, a floodlit grid behind the unit, monospace uppercase labels, square stat bars, and chamfered ability tiles.
- **The drama:**
  - `el()` used `Object.assign` to set `dataset`, which only has a getter, so it threw. Data attributes are now set on their own.
  - In the shop, the monospace labels squeezed the stat bars down to a sliver. The bar cell now takes the spare width.
  - The white pockets under the repair drone were too small to clear. The size floor went from 0.15% to 0.05% of the image, and the whiteness floor from 244 to 240.


### The roster that kept resetting

Robby: "my roster seems to be resetting every time i add another unit."

- **The cause:** a new design has no id until the server gives it one. But `safe(undefined)` gives the string `"undefined"`, which is truthy, so every design was saved as `data/designs/undefined.json`, over the one before. Only the newest survived.
- **A second, quieter bug** sat behind it: the bench carried its id from one design to the next. If you kept a unit and then asked for a different one without clicking "Start a new one", keeping the new one would have replaced the old one.
- **The fixes:**
  - The server makes an id unless the design really has one.
  - A design keeps its id only while its name stays the same. The same name means a revision, kept over the old one. A new name means a new unit.
- **Recovering what was lost:** the log has every `propose_unit` call and every picture, matched by its look. Pathfinder, Dart, Patchwork and Acid Bulwark were rebuilt from it, and Anvil was renamed from `undefined.json`.

## Session 1, later: a game

Robby: "i'm kinda leaning toward having the studio step be before the game... make me a
little RTS where i can design the units and fight against a 'computer controlled'
(scripted) opponent... progressively harder maps against the pre-programmed enemies where
i have time to design and pick my roster before the match." Then: "also, i'd like to be
able to play it on mobile."

### What got built

- **The front** (`war.js`): five maps: the Outskirts, Bramble Ford, the Gunline, the
  Warren, and Iron Crown.
  - Each map's briefing says what makes it harder, then gives a scouting report of the
    rival's units, priced like yours and with hover tips. You take up to five of your
    designs in, with a button back to the lab to design an answer.
  - Winning a map opens the next one.
- **The match** (`sim.js` and `match.js`): in real time. Each side has a base with two
  bays, matter from the base and the deposits it holds, an army capped at 30, fog, and
  rocks to walk around.
  - Every ability does its one thing:
    - **regenerate** heals.
    - **venom** keeps hurting after the hit.
    - **burrow** and **cloak** hide a unit that's standing still. Burrow also makes the
      first strike from hiding do double damage.
    - **leap** jumps a unit onto its target.
    - **brood** bursts into two young on death.
    - **mend** and **repair** heal units nearby.
    - **wings** and **rotors** can't be hit up close.
    - **shield** soaks harm and recharges once the unit is out of the fight.
    - **siege** locks down for 1.8× reach.
    - **blast** splashes onto units next to the target.
    - **forage** and **harvest** add income at a held deposit.
- **The rivals** (`levels.js` and `rival.js`): ten units, five from each lab. Each is a
  spec checked by `check()` at load, so a rival can't cheat the contract. The script builds
  down its list, holds its half of the deposits, defends, sets ambushes, and sends bigger
  waves. The one place it plays by different rules is its supply line (×0.7 to ×1.55), and
  the briefing says so in words ("richer than yours").
- **Art:** 10 rival units and 3 bases from `tools/draw.mjs`, using the lab's own picture
  prompt (now `artPrompt()` in `aid.js`), shrunk to 640px: about 440 KB in all, for $0.44.
- **Phones:** tap to select, tap to order (Fight or Move by a button), drag to pan, pinch
  to zoom, **Box** and **Rally** as modes, and **All army**. The lab and briefings stack
  in one column.
- **Explorer:** the match sets `window.explorer`: `state()`, `make()`, `order()`,
  `speed()`, `look()`, and the sim itself. `tools/bout.mjs` plays whole matches headless
  in Node, because the sim has no page.

### The drama: tuning with bouts

`tools/bout.mjs` pits a plain scripted commander against each rival. Each column below is
a roster:

| round | what changed | plain machines | plain beasts | Robby's designs |
|---|---|---|---|---|
| 1 | — | won 1 of 15 | — | — |
| 2 | economy fixed | — | — | — |
| 3 | rocks fixed | 14 of 20 | — | 20 of 20, all in about 5 min |
| 4 | price fixed, shipped numbers | 14 of 20 | 12 of 20 | — |

Each round in more detail:

1. **First run: stalemates.** Almost every match hit the 20-minute cap with both bases
   whole. Two causes:
   - **Production was the bottleneck.** Build times of 50–105 seconds against about 10
     matter a second meant about two units a minute per side, too few to take a base.

     Build time is on the card, so the card changed too: it's now `8 + 0.06 × cost + 5
     per ability` seconds (Picket 25s, Matron 55s). Income went up to match: base 8/s,
     deposit 4/s, gatherer 3/s. Bases went from 2400 to 1600 health.
2. **Still stalemates.** A trace of one match showed the rival maxing its army at 29 and
   never arriving. Units that walked into a rock got pushed out sideways by less than their
   forward step, so they stayed stuck against it.

   Now `around()` steers for a point just past the edge of the first rock in the way, on a
   side chosen once per rock so it doesn't dither.
3. **Robby's roster won everything in 5 minutes.** The Warbringer, a huge unit with every
   stat at 10, cost 1135, but the price added stat by stat while strength in a fight
   multiplies: tough × hard-hitting × long-reaching.

   The contract now charges **"strong all round"**: if health, armor, damage, attack rate
   and range average above 5, the price is multiplied by (average/5)^1.5. Specialists pay
   nothing extra. The Warbringer now costs 3215 and takes 215s, and Anvil 635. The aids are
   told about it in the spec language.
4. **The shipped numbers.** By map:

   | map | plain machines | plain beasts |
   |---|---|---|
   | the Outskirts | 4 of 4, about 5 min | 4 of 4, about 4 min |
   | Bramble Ford | 4 of 4, 7–12 min | 4 of 4, 9–15 min |
   | the Gunline | 2 of 4 | 1 of 4 |
   | the Warren | 4 of 4 | 3 of 4, 11–19 min |
   | Iron Crown | 0 of 4 (timed out) | 0 of 4 (timed out) |

   The Gunline is harder for the bot than the Warren, although it comes before it. I left
   that as it is, since a person plays far better than this bot, and Robby's play will say
   more than the bot's.

### The drama: the page

- **Each map's `rival` key was defined twice,** once as the holder's name and once as the
  plan, so the name showed as "held by [object Object]." The name is now `holder`.
- **The lab overflowed sideways on a phone:** a one-column `1fr` grid stretches to its
  widest content. It needs `minmax(0, 1fr)`.
- **Long conversations ran off the bottom of the screen** (Robby saw this): the lab's
  middle row was `1fr` too. Now it's `minmax(0, 1fr)`, with `100dvh` for phones.
- **Units read too small** at the default zoom. They're drawn at about 3.8× their radius
  now, and the camera starts closer.
- **WASD panning fought with A (attack-move) and S (stop),** so panning is on the arrows
  only.

### Explorer level

Robby asked which explorer level this is, as practice. Between Claude and Mantle it's
**level 2, Instrumented**: Claude handles the game from outside, through the bout runner,
Playwright, and `window.explorer`. The bout commander is code that runs inside the sim's
loop, which looks like level 3, but it's a developer's test bot, not a player writing its
own orders. The aids are level 2 too: they handle the bench through one tool, and units are
data, not code. Units that carry behavior their aid wrote would be the step up.

## Session 1, later still: making it a game to enjoy

Robby: "This is a great poc. Spend a while making it a more enjoyable game to play. flush it
out, make sprites move better, maybe sprite reels or something. Play test it even it out."
Partway through: "let's make this like gactant where I pair w open router to inference. I
want to be ready to publish this (later) as well."

### Movement, without frames

- **No sprite reels.** An image model redraws a creature differently every time, so frames
  wouldn't line up. Instead each unit's one picture moves by its **gait** (`anim.js`):
  - **walks:** a bob in time with distance walked; the lower half sways in strips, which
    reads as shuffling legs; big walkers kick dust at each footfall
  - **rolls:** a rumble, a slight lean forward, and dust behind
  - **slithers:** a ripple through the strips
  - **hops:** a squash, a hop, and a land
  - **flies:** hovering high, with a wingbeat and a bank into turns
  - **hovers:** a low float
- **Attacks and death.** Everything lunges (up close) or recoils (at range) when it attacks,
  flashes white when hit, and on death topples, darkens and fades, leaving a mark painted
  into the ground canvas for good: scorch and scrap for machines, a stain for flesh. The
  field builds up a history as the match goes on.
- **Choosing a gait.** The aid picks one in `propose_unit`. Older designs and the rivals
  get one guessed from their look ("tracked" rolls, "frog-like" hops, "grub-like"
  slithers).
- **Shots travel.** Machines fire tracers with a muzzle flash. The vats lob spit in an arc,
  green if it's venom. Blast weapons lob a shell that bursts, shakes the screen a little
  and scorches the ground. Shots you can't see stay hidden in the fog.
- **The sim's part** is a little bookkeeping: when a unit was hit, when it last attacked
  and at what, and how far it has walked. It still has no page.

### Sound, alerts, a start card

- **Sound** (`sound.js`) is made from noise and oscillators, with no files. Machines click
  and boom; flesh spits and squelches. There are chimes for a unit ready and a deposit
  taken, and a horn for an attack you aren't looking at. Sound is panned and gets quieter
  away from the middle of the screen, and a crowd of guns is capped so it rattles rather
  than roars. A mute button sits in the top bar.
- **Alerts:** "your base is under attack," "your units are under attack" (only when
  they're off screen), "deposit taken" and "deposit lost," and "their army is on the move"
  when the rival launches a wave. Each comes with a ping on the minimap.
- **A selection panel,** grouped by design, with health. Tap a group to keep only it.
- **A default rally point** a little way out from the base, so new units don't crowd it.
- **A start card** for each match: the map, the goal, and the controls for touch or
  mouse, whichever you're on.

### Pairing with OpenRouter

This works as it does in gactant, and the module is ported from there (`openrouter.js`).
The OAuth PKCE popup lands on `connected.html`, and the key is kept in the browser.
`brain.js` routes thinking and pictures:
1. the commander's own key, straight from the page
2. otherwise the server's relay, if it lends one
3. otherwise a "Connect OpenRouter to design" button in the lab

`MANTLE_PUBLIC=1` turns the relay off for hosting. A picture drawn on the commander's key
is still kept by the server (`/api/keep-art`) for now. Getting fully ready to publish means
deciding where designs live (see below).

### Playtesting: the duel table, and evening it out

`tools/duel.mjs` puts every unit against every other in open ground, with the same
matter's worth of each, and scores how much of each side's worth is left. It's the
fastest test of the contract: a fair price means no unit wins everything. The first table:

- **The Bastion averaged +50.** Its shield adds about 40% to its toughness for a flat ~39
  matter.
- **Fast melee averaged −76 (the Skitter) and −59 (my test Biter).** Ranged units shoot
  first, and melee can't reach flyers at all.
- **My test Rifle beat the rival's Picket by +51,** so the units weren't the reason my
  Outskirts bot kept losing.

Changes to the contract:
- **Abilities that multiply a unit cost a share of what they multiply,** on top of their
  own price:
  - shield: 45% of the health and armor cost
  - regenerate: 35% of the health cost
  - blast: 45% of the damage and rate cost
  - venom: 30% of the damage and rate cost
  - siege: 25% of the damage and range cost
  - wings and rotors: 25% of the fighting stats' cost
  - brood: 20% of the health cost

  The aids are told this in the spec language.
- **Up close hits harder:** melee damage ×1.8, because it has to get there.
- **Speed costs less** (weight 7 → 5). It's worth more on the map than in a fight.

After this, most units are within ±25. Flyers stay a little ahead because half the table
is melee that can't touch them, and ranged units answer them, which is the design. The
Skitter and Picket stay weak, but they're the rival's units, so that just softens those
rivals.

### The drama: a "smart" bot that wasn't

I wrote a smarter commander. It held each deposit with one unit, bought a mix by need,
gathered, and attacked when it outnumbered what it had seen. It lost nearly everything,
the first map included. It had three bugs:
- It saved for a deposit-holder it never sent, because the deposit was guarded, and bought
  nothing else meanwhile. It never had more than two units.
- It fed holders, one at a time, into the middle deposit the rival sits on.
- It waited too long to group.

After fixes it still lost about 2:1 in trades. Meanwhile the plain bot, which builds down
the list and attacks at a growing size, with the same player-like roster, gives the curve
the maps were meant to have:

| map | won by the plain bot |
|---|---|
| the Outskirts | 3 of 3, 6–9 min |
| Bramble Ford | 3 of 3, 12–15 min |
| the Gunline | 2 of 3 |
| the Warren | 1 of 3 (the others timed out) |
| Iron Crown | 0 of 3 |

The smart bot is deleted rather than left as a misleading tool. Lesson: when the
measuring stick is a bot I wrote, its mistakes look like the game's.

Robby asked whether tuning would work better at a higher explorer level. Yes. Level 3
would be a commander that Claude writes into the loop and rewrites from replays, and it
would play more like a person than my scripts do. A red-team designer, a Claude trying to
break the price through the real aid with the duel table as its judge, would find the next
Warbringer on purpose instead of by accident. I offered the red team first.

### Open: where designs live, for publishing

Designs and pictures are kept on the server (`data/`), one shared pile. To publish, they
should belong to the commander. They could go in the browser (IndexedDB holds the
pictures fine), which makes the game a static site plus the commander's own OpenRouter.
Or they could go to an account on a hosted store, as in gactant. Moving them would leave
behind the designs kept so far (Anvil, the Warbringer and the rest). That's Robby's call.

## Hosting: Cloudflare for all the things

Robby: "I want all assets on cloudflares hosting that has free image scanning. If it's
going to be a generated art from random ppl I want it scanned if we are storing it.
Cloudflare for all the things. Don't make private per user, but so associate. Later we are
going to add multiplayer."

- **The scanner sees only what goes through Cloudflare's cache.** That's what the CSAM
  Scanning Tool docs say ("content served for your website through the Cloudflare cache").
  A Worker's own responses don't pass through the cache, so pictures served by the Worker
  wouldn't be scanned. The pictures therefore live in **R2, served from the bucket's own
  custom domain** on a Cloudflare zone, which is cached and so scanned. Until that domain
  exists, the Worker serves `/art/*` from R2 itself, which works but isn't scanned. The
  README lists the steps before going public; turning the tool on needs a contact email,
  which is still on the list for gactant too.
- **Every picture is kept by the server, whoever's key drew it.** A picture drawn on a
  commander's own OpenRouter key goes to `POST /api/art` and is stored with everyone's
  (scanned); nothing stays only in the browser. The server checks that it really is an
  image (png, jpeg or webp, at most 4 MB) and allows 200 a day per commander.
- **Commanders.** Each browser gets an anonymous commander id in a signed cookie (HMAC with
  `SESSION_SECRET`; locally, `data/secret`). Designs carry `by`. Anyone can see anyone's
  designs (`GET /api/designs`, or `?by=me`), but only the maker can delete one. Saving over
  someone else's design makes a copy of your own. Each commander can keep up to 300
  designs.
- **One core, two hosts,** as in gactant. `core.mjs` takes a web Request and returns a
  Response. `server.mjs` gives it files, and `worker.mjs` gives it a Durable Object (SQLite)
  and R2. Both were tested the same way:
  - each browser gets its own commander
  - a design is visible to others but can't be deleted by them
  - a picture is refused if it isn't one, and otherwise kept and served
  - posts from another site are refused

  The Worker was tested under `wrangler dev`: R2 and the Durable Object both work, and the
  relay is off because the site is public.
- **The relay moved** to `/api/relay/think` and `/api/relay/art`, and it's never available
  when public.
- **What was left behind:** the designs kept before this (Anvil, the Warbringer and the
  rest) have no `by`, so they no longer show as anyone's. That follows the no-migrations
  rule. Their old pictures were in `data/art/` and new ones go to `data/pictures/`.
- **Nothing is deployed.** Robby said publishing comes later. It needs a domain for the
  site and one for the pictures, the scanning tool turned on, and the session secret set.

## The red team

Robby: "Red team sounds fine." A background agent wrote `tools/redteam.mjs`.
- **The search:** random designs for one lab, then mutations of the best. Each design is
  scored by its average duel margin at equal matter against a fixed field: the rivals' units
  and the player-like test units.
- **Where it differs from `duel.mjs`, on purpose:**
  - Unit counts are matched so both sides' matter is within about 10%. `duel.mjs` rounds
    each side separately, which handed the Wasp 2150 matter against 2000; that's why its
    score rose when it got pricier.
  - Each side is held to the supply cap.
  - Spawns are seeded, so a design scores the same twice.
  - `--floor` keeps speed and sight at 3 or more, because open ground can't see what they're
    worth.
  - `--reach` scores only the duels the rival can fight back in.
- **Speed:** about 45 seconds a lab on six threads.

### What it found

Every top exploit was a tiny unit, and all of them came from abilities. Each scored +68
to +88, and none lost a matchup:
1. **A burrow bug.** A strike revealed the unit for 1.5 seconds, but a slow attacker's
   pause between shots is longer than that. It hid again before every shot, so every shot
   was a double-damage ambush and enemies kept losing their target.
2. **Healing stacked.** Every healer healed every ally near it, so ten cheap healers healed
   ten times over, and a swarm of them got stronger with the square of its size.
3. **Brood was a flat gift.** The two young are worth about 190 matter by the formula,
   whatever the parent cost.
4. **Flight was too cheap** for immunity to everything that fights up close.
5. **Glass cannons ducked both surcharges.**
   - Damage × rate is damage per second, but the price added the two.
   - Shield was priced on health and armor, and blast on damage and rate.
   - Dumping health and armor kept the strong-all-round average at 5.0, so that surcharge
     never applied.

It also noticed a few things in the sim:
- Venom doses overwrote each other instead of adding.
- Flyers still leapt.
- A flyer with range 1 got the close-up damage bonus while nothing on the ground could hit
  it back.
- Repair and mend never check whether the ally is a machine or a living thing. It doesn't
  matter while each side has one lab.

### The fixes

The agent tried its fixes locally and reverted them, as asked. I applied them myself so I
could see each one:

**sim.js**
- After a strike, a unit stays seen for 4 seconds, longer than the slowest pause between
  attacks.
- An ally is tended once a moment, however many healers tend it.
- Venom doses add up, to at most three.
- Flyers don't leap.
- The close-up damage bonus is for the ground only.

**spec.js**
- Shield and blast cost a share of all the fighting stats (k 0.3 and 0.35).
- Wings and rotors cost k 0.45.
- Brood costs a flat 100 more.
- New charge, **"hits hard and often":** when damage × rate passes 25, the damage and rate
  costs are charged again, in proportion.
- New charge for **stacking abilities:** a multiplying ability costs 50% more for each one
  before it. This closed the last exploit, a tiny shielded flyer that blasts (+47 where it
  could be hit).

**aids.js**
- A flier can't burrow.

### After the fixes

| | before | after |
|---|---|---|
| Hollis, best design where the rival can hit back | +68 | about +13 to +31 |
| Brackett, best design where the rival can hit back | +88 | about +26 to +32 |
| Brackett's best designs, ranked only on duels the rival can fight back in (`--reach`) | ability exploits | plain stat lines with no abilities, about +38 |

- What's left at the top of the whole-field ranking is flight's immunity to melee. That's
  the counter as designed: answer flyers with range.
- The plain stat lines score +38 because the field includes deliberately weak rival units.
  That number is about the field, not the formula.
- The duel table shows most units within ±15.

### The maps after the repricing

- **Softer at first.** Fixing the burrow bug and repricing the Matron and Moth made the
  Warren and Iron Crown easier. Their rivals' supply lines went up (×1.3 → ×1.45 and
  ×1.55 → ×1.8).
- **The test rosters now split on those two maps:**

  | map | Brackett roster | Hollis roster |
  |---|---|---|
  | the Warren | 1 of 4 | 3 of 4 |
  | Iron Crown | 1 of 4 | 3 of 4 |

  The Hollis wins are long grinds (11–19 minutes), carried by a regenerating Hulk with a
  healer behind it. I stopped there rather than tune to my own two test rosters: real
  players' designs will vary more than either.

## Published: mantle.rip (2026-10-28)

Robby registered **mantle.rip** and said to publish.

- **Deployed:** the Worker is on custom domains `mantle.rip` and `www.mantle.rip` (www
  redirects to the bare name), with the `workers.dev` address turned off. There's one name
  for the site.
- **Art:** bucket `mantle-art` is created, CORS is applied, and `art.mantle.rip` is its
  custom domain. `ART_BASE` points there, so every stored picture is served through the
  cache the CSAM tool scans.
- **Secrets:** `SESSION_SECRET` was generated and put straight into wrangler, and never
  printed. `MANTLE_PUBLIC=1`, so the site lends no thinking: every commander connects their
  own OpenRouter account.
- **Drama:** the domain was minutes old. The .rip registry hadn't published its nameservers
  yet, so nothing resolved. Cloudflare's edge answered plain http with the redirect, but
  https handshakes failed because Cloudflare can't issue the certificate until the
  delegation shows up. Waiting it out.
- **Left for Robby:** turning on the CSAM Scanning Tool (dashboard, with a contact email).

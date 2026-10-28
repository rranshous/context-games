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

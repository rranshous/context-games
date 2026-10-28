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


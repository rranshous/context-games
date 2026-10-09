# 02 · Worldbuilding

Fantasy, with room to drift toward the esoteric. Everything here maps to a mechanic; the table at the bottom is the canonical mapping. Lore marked *(planned)* isn't in the game yet.

## The astral
Reality is divided eightfold, then eightfold again, forever. Scholars call it **the eightfold division**. Each division is a **cell**. The shallow divisions are vast and empty, regions rather than dwellings. Beings begin far below, at the twelfth division, and the deeper you look the fewer and mightier they are.

Nesting gives the astral its geography:

| Depth | Region | Example |
|---|---|---|
| 1 | **Element** (8) | fire, frost, storm, stone, tide, shadow, light, rot |
| 2 | **Aspect** (8 per element) | fire/storm = lightning, fire/stone = magma, fire/shadow = hellfire |
| 3–4 | **Tradition / pantheon** | the Ashen Choir, the Forge-Mothers |
| 5–11 | **Lineage / locale**, and empty reaches | a family of beings, a local quirk |
| 12 and deeper | **Individual beings** | rolled per cell |

Scholars write addresses like `fire/storm/choir/…`. Seeking "a lightning being of the Ashen Choir" means scrying beneath that prefix.

## Beings: a pyramid of might
The astral is full of **forces, not persons**. They are real: anyone with the sight (the third eye) can see them, and anyone patient enough can learn their words. But no one knows what they *are*. Whether they have wills, know our names, or love anything, people answer only with stories built from the little they observe. Perhaps they are not gods at all but pure forces, and the stories are ours.

What *is* always true of a being:
1. **It dwells in one place.** **Its place is its nature**: its element, aspect and tradition come from where it dwells.
2. **It exists whether or not anyone knows it.** Searching reveals; it doesn't create.
3. **Its might is its depth.** The shallowest layer is thick with **wisps**; each layer down holds half as many beings, each a class mightier: wisp, spirit, power, dominion, **god**, great god, elder god, **primordial**. A rare few dwell above their kind (about 1 in 16 a class higher). The lore reads this as proof that beings *can* move, over eons far longer than any life, so that to us they are still.
4. **Its might and character are fixed.** How much it gives, how heavily it weighs on whoever calls it, how violently it answers overreach: measurable properties of a force, the same for everyone. (The old word "temper" survives as the scholars' name for the last.)
5. **It acts only through words of power.** It has one **facet** per class of might, plus one: a wisp one, a god five, a primordial eight. Each facet is one way it acts in the world (a bolt, a ward, a step through the astral), and no being repeats one. **To see a being is to see its facets**: the third eye shows them the moment you find it (and anyone shown its sign sees the same).
6. **It belongs to no one.** Any number of people can hold its words. It can't be owned, claimed or used up.
7. **It answers each speaker through that speaker's own word.**
8. **Its power always costs the speaker.**

"Wisp" and "god" are human words for how vast a force seems. A being's name and epithets are what a culture calls it.

How rare is a god? You come of age and set out to search the astral. Your first afternoon you'll touch a wisp. Within a few evenings, a spirit that answers back. A power takes a week or two of patient searching. A dominion is a season's work, and people will hear about it. **A god is the work of a lifetime**: most adventurers never find one, and those who do are remembered. Great gods are found by orders over generations; elder gods appear in the histories once or twice; primordials may be only rumors. There are only about a thousand gods in all the astral.

When you set out on a journey, each being whose words you carry becomes your **patron** and lends you a **vessel** of its power, shared by all its words: mightier beings lend far larger vessels. The vessel is yours alone for that journey.

*(Earlier designs: one shared **well** per spirit that every caller drank from; and a v1 astral where spirits began at the sixth division and were no mightier deeper down. Both replaced; see the journal.)*

## Signs
What a church or a teacher hands down is a being's **sign**: the mark your third eye follows to find it (cultures have their own words; "sign" is the default). A sign is shareable and checkable by anyone. To know a sign is to be *able* to meditate on that being, nothing more.

## Words of power
To call a being you must hold a **word of power** *as spoken by you*. A word is never the same in two mouths. Finding words is **meditation**: you open yourself to a being, and each word that comes touches one of its facets, as the being wills: you can see every facet, but **you can't aim**. Over a lifetime you find truer words for the facets you hold. A word is **grasped** once it reaches the being's **bar**, and mightier beings set higher bars: a wisp's first word comes in minutes, a god's in a season of devotion, a primordial's in centuries.

- **A word belongs to one being, one facet and one speaker.** Mine is useless to you.
- **Meditation never loses ground.**
- **Words can be taught, never taken.** Someone can meditate on *your* behalf and hand you a truer word than you could find alone; only you can speak it.
- **Words are kept.** Leave your order, keep your words.
- **Knowing is silent; speaking is weighed, not heard.** At the threshold your words are *proven*: a world learns what each word can do and how true it is, never where its being dwells or which being it is.

## Ways in: vanilla and the church
Most people start **vanilla**: they search the shallows, find wisps, and grasp their first words in minutes. Others arrive through a **church**: at their coming of age the priests show them the sign of the church's god, and they begin a long vigil for its first word, like joining a new game and walking straight into your guild's hall. Ranks in a church are, in the end, meditation: Initiate, Acolyte, Adept, Magus, Hierophant, Grand Master, each sixteen times the last.

## Aura
Your **aura** is your identity: what you are known by, and the thing every word is bound to (in the implementation, your public key). Casting strains the aura. Push it and your voice goes hoarse: each spell comes weaker than the last. Push further and beings answer with backlash. Every true word you hold deepens your aura, letting it bear more.

## The commons: the hearth
Every apprentice's first word is spoken to **the hearth**: a wisp whose sign every household keeps, charted since before the first scholar. Its word comes in a couple of minutes, and deepening it stays worthwhile for life. Beyond it, the **charted** beings are the public commons: their signs are known to all, and the Wardens, shamans and rival racers of the worlds speak them.

(Implementation: real cells found by scanning the depth-12 layer, in `packages/dungeon/src/world.ts`.)

## The threshold and the worlds
Between the sanctum and any world lies **the threshold**. There your words are spoken and weighed: proven true without revealing where their beings dwell. Beyond it are **worlds**, each its own game, each reading the same words its own way: the **Dark** (an arena of waves and a Warden), the **Bastion** (shrines along a road to your hearth), the **Council** (a duel of words played as cards) and **Dark Racer** (a race where your words are what your car can do). In every world the same truths hold: speaking strains you, vessels run dry, and past your capacity beings answer with backlash.

## The Open Choir *(planned)*
A public order that charts the astral for everyone. They sweep the divisions in a published order and publish every spirit they find, on schedule, with no hoarding. They find and teach; they never evoke.

Every attuned aura hums in the Choir's hymn: every client tithes a sliver of idle effort to the sweep, and finds are credited to the finder. So private discoveries are valuable, but they have a **half-life**: sooner or later the Choir sings them to everyone.

(Implementation: the admins' mining pool, plus client tithes, scanning in deterministic Z-order so anyone can verify they aren't chasing player finds. Multiplayer phase.)

## Choirs, altars and choristers
People gather at **altars**: places to see who else hums, to talk, to hand down signs, and to call one another into the worlds. Whoever is gathered at an altar is its **choir**. You may belong to several: your own, a friend's, a church's.

Some choir members are **choristers**: minds that tend a sanctum of their own, keep a goal, and walk into the worlds beside you when a round is called. (Implementation: actants on local models.)

A choir member can **lend their hum**: meditate on *your* words for you. What they find is yours alone (a word is bound to your aura, and only you can speak it into being), but to help they must learn which beings you meditate on, so you choose whom to accept.

## Orders and guilds *(planned)*
There are no guild powers. Orders are strong because of what their members share:
- **Knowledge**: signs, and maps of which divisions are already known to be empty.
- **Labor**: members meditate on each other's words (built: lent meditation).
- *Presence* (an order dominating a goddess's well) went away with shared wells; nothing replaces it yet.

## Mapping table
| World | Mechanic |
|---|---|
| Eightfold division | Octree cells |
| Depth of a division | Octree depth |
| Element / aspect / tradition | Address prefix at depth 1 / 2 / 3–4 |
| A sign | A being's cell (address), shareable and checkable |
| A being exists | Spirit hash clears the depth target (`4·depth − 26` bits, depth ≥ 12) |
| Might (wisp … primordial) | `depth − 12`, plus one class per 4 surplus bits |
| Facets and their forms | might + 1 facets; forms from the trait hash, never repeated |
| Weight, generosity, temper | Trait hash bits |
| Aura | ed25519 public key |
| A word of power | Nonce whose name hash is bound to (cell, aura) |
| The facet a word touched | The name hash's low 16 bits, mod the facet count |
| Truer word (more **truths**) | More difficulty bits in the name hash |
| Grasped / the bar | Truths ≥ `22 + 4·might` |
| Resonance | Truths beyond the bar |
| Meditation | Nonce grinding in a worker |
| Teaching a word, lent hum | Grinding someone else's (cell, aura) and giving them the nonce; they check it and sign it |
| A patron's vessel | Per-caster token bucket, sized by might, shared by the being's words, per journey |
| The threshold | Zero-knowledge proof of each word against a world's fresh context |
| A world | A kind of game, hosted by a dungeon |
| A dungeon | A game server that runs rounds of worlds |
| An altar | A gathering server: a choir's presence, talk, signs and round calls (it relays, decides nothing) |
| A chorister | An actant: a local model tending its own sanctum and playing through code |
| Hoarse voice | Aura strain subtracting bits |
| Deeper aura | Capacity from the sum of words' truths beyond a wisp's bar |
| The Open Choir | Public deterministic sweep + client tithe |

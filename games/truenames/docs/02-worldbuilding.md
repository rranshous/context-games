# 02 · Worldbuilding

Fantasy, with room to drift toward the esoteric. Everything here maps to a mechanic; the table at the bottom is the canonical mapping. Lore marked *(planned)* isn't in the game yet.

## The astral
Reality is divided eightfold, then eightfold again, forever. Scholars call it **the eightfold division**. Each division is a **cell**. The shallow divisions are vast and old and long since charted. The deep divisions are uncountable, and most of them are empty.

Nesting gives the astral its geography:

| Depth | Region | Example |
|---|---|---|
| 1 | **Element** (8) | fire, frost, storm, stone, tide, shadow, light, rot |
| 2 | **Aspect** (8 per element) | fire/storm = lightning, fire/stone = magma, fire/shadow = hellfire |
| 3–4 | **Tradition / pantheon** | the Ashen Choir, the Forge-Mothers |
| 5+ | **Lineage / locale** | a family of spirits, a local quirk, a shared motif |
| 6 and deeper | **Individual spirits** | rolled per cell |

The 35 spirits at depth 6, the shallowest a spirit can dwell, are **the ancients**: charted since before the first scholar, known to everyone. Deeper layers hold vastly more spirits, each harder to find.

Scholars write addresses like `fire/storm/choir/…`. Seeking "a lightning spirit of the Ashen Choir" means scrying beneath that prefix.

## Spirits and gods
A spirit is something that *has a name* at a cell. Most cells do not. A spirit's **magnitude** is how mighty it is, from wisp through spirit, power, dominion and god up to primordial; each step is half as common. Each spirit also has a **temper**: its form of power (a ring of fire, a bolt, a ward), how heavily it weighs on the one who calls it (strain), and how generous or stingy it is.

When you set out on a journey, each spirit whose name you carry becomes your **patron** and lends you a **vessel** of its power: mightier spirits lend larger vessels that refill faster. The vessel is yours alone for that journey; no one else drinks from it.

*(Earlier design: one shared **well** per spirit that every caller drank from, so a crowded god gave each a trickle. Dropped when the game split into sanctum and worlds; see [07](07-roadmap.md).)*

## Names
To call a spirit you must know its name *as spoken by you*. A name is never the same in two mouths. Learning a name is **meditation**: long, patient work, and the longer it continues the **truer** the name becomes. A truer name draws more from its vessel and strains you less.

- **Names can't be stolen.** Mine is useless to you.
- **Names can be taught.** A master can meditate on *your* behalf and hand you a name truer than you could find alone. Name-crafting is a profession.
- **Names are kept.** Leave your order, keep your words.
- **Knowing is silent; speaking is weighed, not heard.** At the threshold your names are *proven*: a world learns what each name can do and how true it is, never where its spirit dwells or which spirit it is.

## Aura
Your **aura** is your identity: what spirits recognize you by, and the thing every name is bound to (in the implementation, your public key). Casting strains the aura. Push it and your voice goes hoarse: each spell comes weaker than the last. Push further and the spirit's temper answers (fizzle, misfire, or worse). Every true name you hold deepens your aura, letting it bear more.

## The commons: the hearth-god
Every apprentice learns the name of **the hearth-god**, Vreiziobain: a dominion of cinderfrost, the mightiest of the ancients, stingy, who answers as a lance. Her dwelling has been known forever. Attuning to her is every apprentice's first meditation, and deepening your name to her stays worthwhile for life.

(Implementation: she is a real cell, `011010`, found by scanning the ancient layer, not a hardcoded exception.)

## The threshold and the worlds
Between the sanctum and any world lies **the threshold**. There your names are spoken and weighed: proven true without revealing where their spirits dwell. Beyond it are **worlds**, each its own game, each reading the same names its own way: the **Dark** (an arena of waves and a Warden), the **Bastion** (shrines along a road to your hearth), the **Council** (a duel of names played as cards) and **Dark Racer** (a race where your names are what your car can do). In every world the same truths hold: speaking strains you, vessels run dry, and past your capacity spirits answer with backlash.

## The Open Choir *(planned)*
A public order that charts the astral for everyone. They sweep the divisions in a published order and publish every spirit they find, on schedule, with no hoarding. They find and teach; they never evoke.

Every attuned aura hums in the Choir's hymn: every client tithes a sliver of idle effort to the sweep, and finds are credited to the finder. So private discoveries are valuable, but they have a **half-life**: sooner or later the Choir sings them to everyone.

(Implementation: the admins' mining pool, plus client tithes, scanning in deterministic Z-order so anyone can verify they aren't chasing player finds. Multiplayer phase.)

## Orders and guilds *(planned)*
There are no guild powers. Orders are strong because of what their members share:
- **Knowledge**: spirit locations, and maps of which divisions are already known to be empty.
- **Labor**: members meditate on each other's names.
- *Presence* (an order dominating a goddess's well) went away with shared wells; nothing replaces it yet.

## Mapping table
| World | Mechanic |
|---|---|
| Eightfold division | Octree cells |
| Depth of a division | Octree depth |
| Element / aspect / tradition | Address prefix at depth 1 / 2 / 3–4 |
| A spirit exists | Spirit hash clears the depth target |
| Magnitude | Bits the spirit hash clears beyond the target |
| Temper (form, weight, generosity) | Trait hash bits |
| Aura | ed25519 public key |
| A name | Nonce whose name hash is bound to (cell, aura) |
| Truer name (more **truths**) | More difficulty bits in the name hash |
| Meditation | Nonce grinding in a worker |
| Teaching a name | Grinding someone else's (cell, aura) and giving them the nonce |
| A patron's vessel | Per-caster token bucket, sized by magnitude, per journey |
| The threshold | Zero-knowledge proof of each name against a world's fresh context |
| A world | A game hosted by the dungeon process |
| Hoarse voice | Aura strain subtracting bits |
| Deeper aura | Capacity from sum of name strengths |
| The Open Choir | Public deterministic sweep + client tithe |

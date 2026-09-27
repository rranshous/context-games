# 02 · Worldbuilding

Fantasy, with room to drift toward the esoteric. Everything here maps to a mechanic; the table at the bottom is the canonical mapping.

## The astral
Reality is divided eightfold, then eightfold again, forever. Scholars call it **the eightfold division**. Each division is a **cell**. The shallow divisions are vast and old and long since charted. The deep divisions are uncountable, and most of them are empty.

Nesting gives the astral its geography:

| Depth | Region | Example |
|---|---|---|
| 1 | **Element** (8) | fire, frost, storm, stone, tide, shadow, light, rot |
| 2 | **Aspect** (8 per element) | fire/storm = lightning, fire/stone = magma, fire/shadow = hellfire |
| 3–4 | **Tradition / pantheon** | the Ashen Choir, the Forge-Mothers |
| 5+ | **Lineage / locale** | a family of spirits, a local quirk, a shared motif |
| deeper | **Individual spirits** | rolled per cell |

Scholars write addresses like `fire/storm/choir/…`. Seeking "a lightning spirit of the Ashen Choir" means scrying beneath that prefix.

## Spirits and gods
A spirit is something that *has a name* at a cell. Most cells do not. A spirit's **magnitude** is how mighty it is; mighty spirits are gods, and gods are rare. Each spirit also has a **temper**: its form of power (a ring of fire, a bolt, a ward), how heavily it weighs on the one who calls it (strain), and how generous or stingy it is.

A spirit's power is a **well** that fills over time. Everyone who knows the spirit draws from the same well. A crowded god gives each caller a trickle; the truest name in the crowd drinks deepest.

## Names
To call a spirit you must know its name *as spoken by you*. A name is never the same in two mouths. Learning a name is **meditation**: long, patient work, and the longer it continues the **truer** the name becomes. A truer name draws more, strains less, and outshouts lesser names at a crowded well.

- **Names can't be stolen.** Mine is useless to you.
- **Names can be taught.** A master can meditate on *your* behalf and hand you a name truer than you could find alone. Name-crafting is a profession.
- **Names are kept.** Leave your order, keep your words.
- **Knowing is silent; speaking is loud.** Using a spirit reveals that someone holds it.

## Aura
Your **aura** is your identity: what spirits recognize you by, and the thing every name is bound to (in the implementation, your public key). Casting strains the aura. Push it and your voice goes hoarse: each spell comes weaker than the last. Push further and the spirit's temper answers (fizzle, misfire, or worse). Every true name you hold deepens your aura, letting it bear more.

## The commons: hedge-words and the old god
Every apprentice learns the name of **the hearth-god**, a mighty but stingy god whose location has been known forever. Because *everyone* knows her, her well is crowded and each caller gets a trickle. She never runs dry for a beginner, and deepening your name to her stays worthwhile for life.

(Implementation: the tutorial god is a real cell found by the designers' own grinding, not a hardcoded exception.)

## The Open Choir
A public order that charts the astral for everyone. They sweep the divisions in a published order and publish every spirit they find, on schedule, with no hoarding. They find and teach; they never evoke.

Every attuned aura hums in the Choir's hymn: every client tithes a sliver of idle effort to the sweep, and finds are credited to the finder. So private discoveries are valuable, but they have a **half-life**: sooner or later the Choir sings them to everyone.

(Implementation: the admins' mining pool, plus client tithes, scanning in deterministic Z-order so anyone can verify they aren't chasing player finds. Multiplayer phase.)

## Orders and guilds
There are no guild powers. Orders are strong because of what their members share:
- **Knowledge**: spirit locations, and maps of which divisions are already known to be empty.
- **Labor**: members meditate on each other's names.
- **Presence**: an order whose members all know a goddess truly dominates her well. Outsiders feel the well thin. Territory without territory rules.

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
| Truer name | More leading bits in the name hash |
| Meditation | Nonce grinding in a worker |
| Teaching a name | Grinding someone else's (cell, aura) and giving them the nonce |
| A spirit's well | Per-spirit token bucket |
| Hoarse voice | Aura strain subtracting bits |
| Deeper aura | Capacity from sum of name strengths |
| The Open Choir | Public deterministic sweep + client tithe |

# The Climb

A new andnow mode, designed with the user on 2026-10-12. It's built after the island-survival batch has been analysed.

## The idea

A fixed-width battleground, infinite both up and down, generated as it's explored. Food gets richer the farther you go from the start in either direction, but each step out demands more of a body. The rules of the body itself become more expressive: traits come from a body chemistry that evolution can rewire, not from fixed glyph meanings.

## World

- **Width:** fixed, about 2,000 cells (the user: wider than 400). Chunks are tiles in both directions, so only active tiles cost compute.
- **Height:** infinite both ways. Step 0 is the start, a sea-level band about 40 rows tall.
- **Steps:**
  - Step +n (up) is thin, cold air. Living there needs n points of **insulation**.
  - Step −n (down) is deep water. Living there needs n points of **armor**.
- **Each step out is 10× taller and 10× richer than the one before.** Step ±1 is about 400 rows and step ±2 about 4,000. Food in step ±n is worth 10^|n| times step 0's food.
  - Going one step farther costs one more point of the trait and one big jump in reward. The frontier always pays.
- **Damage:** the island's pressure rule, with "levels over" = the steps you're short of the trait. It's harsh enough that a dip pays off and living there doesn't.
- **Natural patches:** the ×10 per step is the big trend. Inside each step, food is patchy:
  - across the width, meadows and barrens;
  - through the height of a step, a rich layer partway in (a kelp-forest band in the deep, a fertile ledge layer in the air) thinning toward the step's edges.

  Creatures have to find good ground, not just go farther, so populations cluster and separate.
- **Up and down differ:**
  - **Down** gets falling dead cells (marine snow), free food pooling in the depths: the pantry for big slow scavenger-hunters.
  - **Up** gets sunlight: plants regrow faster the higher you go, but patches are sparse. That suits fast, light grazers.
  - Dead cells fall in both air and water, so the heights feed the depths.
- **Kills leave rich corpses.** A body that dies within 500 ticks of being bitten or written into leaves a corpse whose dead cells share the whole body's worth (about a third of its cells survive as dead cells, so each is worth about three ordinary ones). Whoever eats them gets it: the killer, or a scavenger that got there first. Nothing is paid to the killer directly, so a death only ever touches the dead body. Bodies that starve, freeze or die of age leave ordinary dead cells.
- **Size cap grows with richness,** so bodies can get huge where food is worth 1,000×. The user is hoping for krakens: big, slow, long-lived deep hunters (mask cells cancelling mass, bite doublers, low pace so slow hunger).
- **Terrain:** generated per tile from the seed and the tile's coordinates, so any tile can be rebuilt on demand.
  - Downward: rock, caves and overhangs, as on the island.
  - Upward: cliffs, ledges and overhangs.
  - Both block line of sight.
- **Only chunks with life (or recent life) in them are simulated or kept in memory.** Empty chunks are dropped and rebuilt from the seed when someone arrives, with food starting fully ripe. In principle the world is infinite, and the compute goes where the life is.

## Body chemistry (the step up in expressiveness)

Each cell adds to a set of traits:

| Trait | Does |
|---|---|
| armor | resists depth |
| insulation | resists height |
| mass | slows pace (pace sets speed, hunger and aging, as on the island) |
| bite | how many bites a BOMB delivers (it takes armor three hits to break) |
| diet | what COLLECT can digest: plants, dead cells, or both |

**Base table.** For example, `K` gives +1 armor and +2 mass, `M` adds pace, `B` gives +1 bite, `.` gives +2 mass. A few new glyphs carry the other traits; for example, `I` gives +1 insulation.

**Modifier glyphs** change how the cells next to them count:
- **flip:** a neighbouring armor cell counts as insulation instead, and the reverse;
- **double:** a neighbouring cell's trait counts twice;
- **mask:** a neighbouring cell carries no mass.

The rules are in the body, so a mutation can change what a body's other cells mean, not just add cells. Off-path cells (never run, so free) are the natural place for chemistry. That's the "unread genome" find turned into a mechanic.

## The first creatures (designed; a single evolving species with evolved diets comes later)

1. **Climber:** a grazer with an insulation cell spare, heading up.
2. **Diver:** a grazer with an armor cell spare, heading down.
3. **Hunter:** big, slow, bites and eats dead cells. It starts at the top of step −1, in reach of the marine snow, as kraken stock.

## The viewer

- A camera that scrolls vertically, plus a minimap strip showing where life is across the steps.
- Colours by trait: armor warm, insulation cool.

## Open questions

- Numbers grow 10× per step. Reserves and food values may need logarithms, or a cap with ripeness doing the work.
- Chunk size, and how long an emptied chunk is kept before it's dropped.

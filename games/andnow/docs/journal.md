# Journal: 2D Code-Cloud Warriors (Tierra × Core War × RTS)

Seed document carrying over a design conversation (2026-10-09) into the project repo.
Goal of the next session: **build a first browser prototype**.

---

## How we got here (background)

Started from an interest in genetic programming and artificial life:

- **Push / PushGP** (Lee Spector): stack-based GP language with one stack per type;
  instructions lacking args are no-ops, so every program is valid. Push3 added the
  `exec` stack (code can manipulate its own pending execution).
- **Pushpop / AutoPush**: autoconstructive evolution, programs produce their own
  children. Populations tended to collapse into clones; diversity was the key to
  adaptation. AutoPush added anti-cloning constraints. (Details recalled loosely.)
- **Core War** (Dewdney, 1984): Redcode warriors in a shared circular memory (MARS);
  kill the opponent by making it execute `DAT`. Imp, Dwarf, rock-paper-scissors
  strategy cycle (stone/paper/scissors).
- **Tierra** (Tom Ray, ~1990): self-replicating code in a shared "soup". Mutation via
  background bit flips, copy errors, execution flaws. Robustness via a 5-bit
  instruction set (every pattern valid) and template-based addressing. Write
  protection + shared read/execute led to parasites, host defenses, hyper-parasites.
  The reaper culls old/error-prone creatures.
- **Avida**: rewards CPU time ("merit") for computing logic functions on inputs;
  Lenski et al. 2003 showed complex features evolving from simpler rewarded ones.

The user also has a separate proof-of-work project. Early idea: resource cells that pay
out for correct answers, with PoW-style difficulty adjustment to balance the economy.
Parked for now in favor of a more literal game-like resource model (below).

Motivation: Claude can implement these systems quickly, so we can try ideas fast.
Warriors will mainly be **Claude-generated**, not written by human players.

---

## The concept

A **2D board** split into **rooms connected by narrow corridors** (chokepoints).
Each **warrior is a cloud of cells**: a connected 2D region where every cell holds one
instruction. The cloud is a single entity: its code, memory, body and health together.
Think *intersection of Tierra and an RTS*.

---

## Decisions made

### Code & execution: Befunge-style, with two changes
- Befunge basics: a 2D grid of instructions; the IP has a position + direction; arrows
  turn it; conditionals are directional branches; stack-based data.
- **Change 1: skip gaps, wrap within self.** The IP advances to the *next cell owned by
  this warrior* in its current direction, skipping empty/foreign cells, and wraps to
  the far end of the warrior's body on that row/column. So a row of code = "my cells on
  this row, in order". Shearing/stretching keeps the program mostly intact; only
  changing cells' relative row/column order breaks it. Deformation = gradual damage.
- **Change 2: the IP rides on its cell.** If the cell the IP sits on moves, the IP moves
  with it.
- **Single IP per warrior** for now. (No multiple threads yet.)
- **No executing enemy cells.** Your IP only ever runs your own cells.

### Movement
- `SHIFT dir`: rigid translation of the whole cloud; only if every destination is free.
  Fast, keeps the program intact.
- `FLOW x,y dir`: move one of your own cells into an adjacent free cell (the cloud
  should stay connected). Slow, deforms you, but lets you squeeze through anything.
- `SWAP a,b`: swap the contents of two of your own cells; used to repair layout after
  squeezing.
- Design consequence: **crossing chokepoints costs time and coherence.** Warriors should
  have a compact executing core plus flexible "cargo" cells (storage/armor/eyes).

### Resources: size and speed
- **Size** = max number of cells the cloud may have.
- **Speed** = instructions executed per world tick. Each warrior has its own sub-clock
  (fractional accumulator, e.g. 1.5 instr/tick).
- Resources **spawn periodically at fixed spots** on the board. Collected with an
  instruction targeting a cell (e.g. `COLLECT dir`). Separate "size" and "speed" pickups.
- **Upkeep: both size and speed decay over time, down to a floor.** You have to keep
  collecting to stay big/fast, so holding resource spots matters all game.

### Line of sight
- **Seen from every cell** of the cloud. A larger body sees more; that's a real
  advantage of size.
- You can only affect/observe cells you have LoS to (bomb, read, write).
- Walls block LoS.

### Damage & disconnection
- Cells destroyed by bombs are gone; the warrior loses that size.
- If a cloud is **cut into disconnected pieces, the piece(s) without the IP become
  debris**: no longer part of the warrior; the warrior loses that size. (Debris could
  become a collectible resource; not decided.)
- **Poisoning:** since you can't execute enemy cells, the Core War-style kill is
  *writing* a bad instruction into an enemy's cell (`WRITE`) so *they* execute it.

### Platform
- **Browser, fully client-side.**

---

## Deferred (prove the base first)
- **Splitting/budding** (spend size to split off a child cloud with its own IP). Liked,
  but after the base game works.
- **Multiple IPs / threads.**
- **Evolution** (mutation, selection over warriors). The world comes first, with
  Claude-written warriors.
- **Mutable mutation rates** (copy routines that decide their own fidelity).
- PoW-style puzzle resources / difficulty adjustment.

---

## Draft instruction set (not final)

Leaning game-like / higher-level, since Claude writes the warriors.

- **Flow (Befunge-ish):** `>` `<` `^` `v` (set direction), horizontal/vertical
  conditional branch (pop, turn), skip-next (`#`-like), halt/no-op.
- **Stack & math:** push literal, dup, swap, drop, add, sub, mul, div, mod, compare
  (lt/eq), not.
- **Self-knowledge:** my size, my max size, my speed, my position/bounds, resource
  levels, IP position.
- **Sensing (LoS from all cells):** `LOOK dir` (distance + type of first thing seen),
  `SCAN type` (nearest visible enemy/resource/wall → coordinates), `READ x,y`
  (instruction at a visible cell).
- **Actions:** `SHIFT dir`, `FLOW x,y dir`, `SWAP a,b`, `GROW` (add a cell, up to max
  size), `COLLECT dir`, `BOMB x,y` (destroy a visible cell in range),
  `WRITE x,y,instr` (overwrite a visible cell, including an enemy's = poison).

Open details: coordinate system for instructions (absolute vs. relative to the cell
or IP), ranges for BOMB/WRITE, action costs (cycles), what an empty stack means
(Push-style no-op is a good default), what happens when the IP's own cell is destroyed
(probably death).

---

## Open questions
- Exact connectivity rule: 4-neighbor vs. 8-neighbor; can `FLOW` ever temporarily
  disconnect you?
- Debris: inert, collectible as size, or capturable?
- Resource spawn rates, decay rates, floors; tune by playing.
- Do actions cost extra (cooldowns, multiple cycles) or just one instruction?
- Win condition: last warrior standing? Score over time? Territory?
- Warrior file format so Claude can author warriors as text (a 2D grid of glyphs plus
  metadata like start direction).

---

## Next step: first prototype
1. Board: grid with rooms + narrow corridors, walls; resource spawn points.
2. World tick loop with per-warrior sub-clocks (speed); size/speed decay with floors.
3. Warrior = connected cloud of owned cells + one IP + stack.
4. Befunge-style interpreter with skip-gap/wrap-in-self + IP-rides-cell.
5. LoS from all cells (walls block).
6. Instructions: flow, stack/math, sensing, SHIFT/FLOW/SWAP/GROW/COLLECT/BOMB/WRITE.
7. Debris rule on disconnection.
8. Canvas viewer: color by owner, show IPs, resources; play/pause/step/speed controls.
9. A few Claude-written warriors (e.g. a collector, a bomber, a poisoner, a turtle
   that holds a chokepoint) to check whether it's fun before going further.

Note: the user started to say "when you build it make sure you can .." and didn't
finish. Ask what that was.

---

## Session 1 (2026-10-09): first build

### Decisions settled in conversation before building
- **Relative coordinates**: every instruction target is relative to the IP's cell. The
  IP rides its cell, so a warrior's frame of reference travels with it and code keeps
  working after a `SHIFT`.
- **WRITE needs adjacency** (the target must touch one of my cells). Longer ranges maybe later.
- **Connectivity**: 4-neighbor. `FLOW` can never disconnect you (it fails instead), so
  only enemy damage creates debris.
- **Glyphs**: single characters that are also numbers (index in the glyph table), so a
  warrior file is a plain text grid, `READ` pushes a number, `WRITE`/`GROW` pop one.
- **The IP is hidden** from other warriors (the spectator view can show it).
- **Win**: last standing; tick cap falls back to most cells.
- **Sim core is pure TS, no DOM**: runs headless in Node for tournaments, and the
  browser viewer just draws it. Plus a `window.explorer` hook (that was the unfinished
  "make sure you can ..." from the seed conversation: headless + the explorer pattern).

### Layout
- `src/sim/`: `world.ts` (cells, interpreter, actions, LoS, economy, tick), `board.ts`
  (rooms + corridors), `glyphs.ts` (instruction table, docs, costs), `warrior-file.ts`
  (text format), `ascii.ts` (text views), `match.ts` (matches + round-robin), `rng.ts`.
- `src/headless.ts` → `dist/headless.mjs`: `node dist/headless.mjs a.warrior b.warrior
  [--seed N] [--ticks N] [--frames K] [--glyphs] [--events]`, `--tournament [--seeds N]`,
  `--solo`. A 5-warrior × 6-board round robin runs in well under a second.
- `warriors/*.warrior`: header (`name`, `dir`, `ip`), `---`, glyph grid (space = no cell).

### Implementation choices (made while building; open to revisiting)
- **Board** is four-way mirror symmetric (3×2 rooms: four corner starts, two middle
  rooms), so every seat is equally good. 2-player matches seat TL vs TR: they share the
  top-middle room, the obvious contested ground.
- **Resources**: size spot in each corner room; size + speed pair in each middle room;
  respawn 120 ticks after being taken.
- **`COLLECT` takes no direction**: it takes every resource or debris touching my body.
  (The seed doc said `COLLECT dir`; this is simpler to write warriors for.)
- **Debris** blocks movement, can be bombed, and can be collected for +0.5 max size.
- **`TOWARD` (`T`)** added: pop dx,dy → push the direction that heads there (random for
  0,0). Game-like, saves a pile of sign math. Because T(0,0) is random, "SCAN, TOWARD,
  SHIFT" is a complete one-row gatherer: `C6S$TM`.
- **`o` (over)** added, for copying a dx,dy pair (`oo`).
- **`e`** pushes whether the last action succeeded; actions push nothing themselves (no
  stack junk to clean up).
- **Costs** (cycles): SHIFT 2, GROW 2, WRITE 3, BOMB 4, everything else 1. Speed (start
  2, floor 1, cap 8) is cycles per tick. BOMB range 6, sight 14.
- **BOMB can't target your own cells.** WRITE can (that's self-modification).
- **Upkeep shedding** drops the cell farthest (by path) from the IP, which can never
  disconnect the rest.
- **The single-row loop.** Because the IP wraps within its body, any row is an infinite
  loop by itself. Multi-row programs branch with `|` into a side row, and that row wraps
  back to a first cell that points the IP back into the main row. Gaps are free: a row
  can be `v   >T\$:M`, and the IP skips straight from `>` back to `v`.

### Found while testing (all with `node dist/headless.mjs`)
- **The Stalker poisoned itself.** When SCAN finds nothing it returns 0,0, and under
  relative coordinates 0,0 is *my own IP cell*. So `2S$'@W` wrote `@` into the cell
  being executed. "Nothing found" points at "me". Kept the engine honest (writing your
  own cells is how self-modification works) and fixed the warrior with a branch.
- **Free-size loop**: the Turtle would GROW a cell, shed it as upkeep debris, and
  COLLECT the debris for +0.5. Fix: cells shed from upkeep vanish; debris only comes
  from cut-offs and deaths.
- **Nobody met anybody.** Every early result was a tick-cap decision on starting size.
  Causes: opposite-corner seating, sight 10, random-walk wandering, and 2-wide corridors
  that 3-row warriors can't SHIFT through (nobody knows how to FLOW yet). Fixes: TL vs TR
  seating, sight 14, hunters keep a wander direction on the stack (turn right when
  blocked), horizontal corridors 3–5 wide. Vertical corridors stay narrow, so FLOWing
  through a chokepoint is still an open frontier.
- **Carrying your own poison is a liability.** Bomber vs Stalker (seed 3): one bomb cut
  14 cells off the Stalker, and 7 ticks later it executed its own `@`. Checked in the
  viewer: what survived was only its top row, `>oo'@WT\$:M`, cut off from the SCAN row.
  That row is a loop on its own (rows wrap), so it kept running `oo'@W` on stale stack
  values, wrote `@` over its own `>`, and then ran into it. A damaged program poisoning
  itself: the deformation-as-damage idea showing up on its own. (First guess, that the
  `'` skip got lost, was wrong; the explorer's `body(id)` showed the real thing.)

### First tournament (5 warriors × 6 boards × both seatings, 3000-tick cap)
```
Bomber    W 39 L  9      Bomber 6 / Stalker 6   Bomber 9 / Turtle 3
Stalker   W 32 L 16      Stalker 9 / Turtle 3   Stalker 9 / Roamer 3
Turtle    W 30 L 18      Turtle 12 / Roamer 0   Turtle 12 / Gatherer 0
Roamer    W 15 L 33
Gatherer  W  4 L 44
```
Caveat: many wins are still tick-cap decisions on cell count, and starting size (bigger
program = more cells) skews that. Upkeep should even it out over a longer cap.

### Viewer + explorer hook
- `index.html` + `src/main.ts` → `dist/main.js`. Canvas, 14px cells, each warrior's
  cells tinted its color with the glyph drawn on top, so **you read the program right off
  the body**. Debris grey (glyphs still visible), size pickups green dots, speed yellow
  diamonds. IPs outlined (spectator toggle; warriors can't see each other's). Hover a cell
  for its glyph's meaning. Pickers for up to 4 bundled warriors, seed, play/step/speed
  (1–256 ticks/s), warrior cards (cells/max, speed, current glyph, heading, stack, last
  action), event log. URL params: `?w=bomber,stalker&seed=3`.
- Fully static: works from the vanilla dev server (`/dev/andnow/index.html`) or any static
  server (`python3 -m http.server` in `games/andnow`).
- `window.explorer`: `help()`, `warriors()`, `source(name)`, `load(names, seed)`,
  `loadSource(texts, seed)`, `step(n)`, `runUntilOver(max)`, `play()/pause()/setSpeed()`,
  `state()`, `ascii({glyphs})`, `body(id)`, `events(n)`, `screenshot()`, `config`, `world`.
- Browser and headless runs replay identically for the same seed + warriors (checked:
  same events at the same ticks).

### Watching a 4-player match to the end (bomber, stalker, turtle, roamer; seed 5)
- **Upkeep rotted every program.** Draw at tick 5000. Shedding dropped the cell farthest
  from the IP, and since the IP moves around inside its own code, that's usually code. The
  Bomber lost `>C` (no more collecting), the Roamer's branch rows were cut down to `>T` and
  `>$`, every card said "last action failed". Warriors decayed into crippled fragments
  instead of fighting. (The Stalker poisoned itself again, with `@@` in its debris.)
- **Change: shedding burns fat first.** Upkeep drops the farthest `.` cell whose removal
  keeps the body connected, and only drops code when there's no fat left. Padding is now a
  reserve, and how much fat to carry is a design choice for each warrior. Aging as code
  loss is still there, just later.
- Resources are probably too scarce for 20+ cell programs: a size pickup is +4 and decay
  is 1 per 250 ticks, but warriors only see their own room, so they rarely reach the
  middle-room spawns. Not tuned yet.

### Open threads after session 1
- Most wins are still tick-cap decisions; starting size (program length) skews them.
  Maybe compare to starting size, or give every warrior the same starting max size.
- Self-poisoning is common (2 of 2 Stalker deaths). Is that a fun hazard or a trap for
  authors? Leaning hazard: it's the most Core War thing that's happened.
- Nobody FLOWs. Writing a chokepoint-squeezer by hand would tell us if FLOW is usable.
- Warriors are blind outside their room; exploration is the bottleneck to fights.

---

## Session 1, part 2: equal starts, and a GA to search for warriors

User: equal starting size; the Roamer finds a wall and sticks to it; rather than
hand-tuning, set up a GA + tournaments to search for starting warriors.

### Why the Roamer sticks
Traced with the explorer (step 1 tick at a time, read glyph/dir/stack). It sees a
resource at (-2,-2) sitting in a nook formed by **its own body's gap** (the empty
stretch in `v   >T\$:M`). TOWARD picks the dominant axis, west; west is a wall. The
found-branch never checks `e`, so it repeats the same blocked SHIFT forever. A greedy
pathing trap. Left it for the GA to find its way around rather than hand-patching.

### Equal starting size
- Every warrior starts at max size 30 (`CONFIG.startSize`), and a body can't have more
  than 30 cells. (Before, starting max size was body + 4.)
- That alone didn't fix tick-cap results: the smoke-test "champion" was a 27-cell
  Stalker mutant beating the 6-cell Gatherer on *cell count*. Program length still
  decided it.
- **Tick-cap rule changed: the largest max size wins.** Everyone starts at 30 and decays
  the same, so this measures who collected best; nobody collected = draw. Cell count no
  longer matters at the cap. Tournament after: Bomber/Stalker 29W, Gatherer 21W, and the
  Turtle can no longer win by sitting still (0W).

### The GA (`src/ga/genome.ts`, `src/evolve.ts` → `dist/evolve.mjs`)
- **Genome** = the warrior itself: cells (x, y, glyph), IP start cell, start direction.
  Always 4-connected, ≤ 30 cells. `repair()` keeps the IP's piece and trims farthest-first.
- **Random bodies** grow mostly sideways (rows are loops, so wide bodies run), with glyph
  weights leaning toward S/T/M/C/B/W so random programs have a chance of doing something.
- **Mutation** (1+ edits, geometric count): point change, add cell, remove cell,
  duplicate a glyph into a new neighbor cell, swap two glyphs, move IP, change dir.
- **Crossover**: 2D block swap. Line both parents up by their IP cells, take a random
  rectangle from parent B into parent A (cells B lacks inside the rectangle are removed),
  repair.
- **Fitness**: average match score against the 5 hand-written warriors (fixed benchmark)
  plus 4 hall-of-fame champions from earlier generations (so the bar rises), on 3 fresh
  boards per generation (all individuals see the same boards; seatings alternate).
  Match score: win by kill 3, win at cap 2, draw 1, loss 0, plus small shaping so there's
  a slope before anything can win: +0.05/pickup (≤0.5), +0.1/bomb hit (≤1),
  +0.25/poison write (≤1), +0.5 × fraction of the match survived.
- **Selection**: 4 elites; the rest are size-3 tournament picks, 30% crossover (half of
  those also mutated), 70% mutated clones.
- **Start population**: each hand-written warrior, a mutant of each, the rest random.
- **Workers**: matches run across `availableParallelism()` worker threads (same bundle
  file is main and worker).
- **Output**: `runs/<name>/log.jsonl` (one line per generation: best/mean fitness,
  record, wins vs benchmarks, lineage, the best warrior's text) and `best-gNNN.warrior`
  whenever the best improves (`runs/` is gitignored). At the end, the last 15 hall-of-fame
  entries are re-tested on 10 held-out boards against the benchmarks, and the top 3 go
  to `warriors/evolved/<run>-N.warrior` with their record in the header, plus
  `manifest.json`. The viewer fetches the manifest and lists them as `evo:<name>`.
- Smoke test (pop 16, 3 gens): 1.4 s. A pop-96 generation is ~2–5 s on 8 cores.

### First real run: evo1 (pop 96, 100 gens, 3 boards/gen, 1500 ticks, ~6 min)
- Fitness hit its ceiling (~3.0, i.e. winning nearly every game) by **generation 8** and
  stayed flat for 90 more generations; the mean hovered ~1.5. The benchmarks are too easy,
  and once they're beaten, the hall-of-fame opponents are close relatives.
- Early leader (gen 6), a Stalker descendant, **got rid of its own poison**: the `@` is
  gone and the `'` now pushes the code of `T`. Self-poisoning was the Stalker's main way
  of dying, so the GA's first discovery was "stop carrying poison".
- Champion `evo1-1` (held-out: 46/50 vs benchmarks; Bomber 8-2, Stalker 8-2, the rest 10-0):
  ```
   MC: L
  ^>CfS|  \T
   ^y m>$$:M2eBR
  ```
  It SCANs for type `f` (speed × 10, so ≥ 10, which matches nothing), so SCAN always
  fails and it always takes the wander branch. It wanders into its home corner and
  **camps the corner size spawn**: it sits touching the spot and collects every respawn
  (+4 per 120 ticks vs 0.5 decay per 120 ticks), rides max size up to the 64 cap, and wins
  every game on the tick-cap rule. No fights. All of its wins are tick-cap economy wins.
- So the GA found the dominant strategy in 8 generations, and it's "don't play". That's
  what the economy design says, not a GA problem. The home spawn is too generous and
  completely safe.
- Logging bug fixed: the "vs bench" column read results by index after sorting the
  population (so it showed the wrong individual's games). Fitness/selection weren't affected.

### What to change next (to discuss)
- **Economy**: move resources out of the home rooms (contested middle rooms only),
  and/or a spot doesn't regrow while anything touches it (no camping; you have to
  leave and come back, so being there at the right time is contested).
- **Fitness**: coevolution. Score against the current population (round robin or a sample),
  not just the fixed benchmarks + a few relatives, so the bar keeps moving.
- **Ticks**: evolution runs 1500-tick matches, but the real cap is 5000; economy-heavy
  play may look different over the long game.

---

## Session 1, part 3: contested economy + coevolution

User: go ahead with all three (economy, coevolution, rerun); larger runs are fine.

### Changes
- **Resources only in the middle rooms.** Home rooms have nothing. Each middle room has
  a speed pair and a size pair (size spots near the room's far corners, 2 in from the walls).
- **No regrowth while touched.** A spot's respawn timer resets whenever any cell (any
  warrior, or debris) sits on or touches it. Camping can't work; you have to leave and come back.
- Quick check (6 boards, 2000 ticks): the camper `evo1-1` falls from champion to 2W 13L.
  Gatherer/Roamer now lead (they go out and find things). Lots of draws: when nobody
  collects, everyone decays to the floor (8) and ties.
- **Coevolution**: each individual plays all 5 benchmarks + 3 hall-of-fame + 6 random
  peers from the current population, on 2 boards (28 matches each).
- **Fight metrics in the log**: % of games ending in a death, bomb hits per game, poison
  writes per game, so we can see if fighting emerges.

### evo2 (pop 128, 150 gens, 2 boards/gen, 3000 ticks, coevolution; ~17 min)
Fitness never saturated this time (best bounced 2.0–3.0, mean 1.4–2.0): the bar moves
with the population, as intended. Fight metrics across all of each generation's games:

| gen | games ending in a death | bomb hits/game | poison writes/game |
|----:|---:|---:|---:|
| 0 | 6% | 0.01 | 0 |
| 40 | 12% | 0.72 | 0 |
| 90 | 19% | 1.11 | 0 |
| 120 | 22% | 1.49 | 0 |
| 140 | 14% | 0.59 | 0 |

**Bombing emerged; poison never did.** Poison needs adjacency plus an enemy IP that
happens to run over the written cell; bombing works at range 6 and cuts bodies apart.
The champions are packed with `B` (five in `evo2-2`), plus `S`, `T`, `M`, `C`:
```
evo2-2           evo2-1             evo2-3
 S                 S                 B+vF|B3<7
 T                 W                B^`?|T\SB-
FT^^B G3<          BvvF|73<$         7 CBTM?:
\' B: \BB-:      T|^`?BT SB-:M
 STCBTM? TT        7oCBTM?
```
Shared motif across all three: `CBTM?` / `TCBTM?`, i.e. collect, bomb, head toward, move,
random turn. Lots of `B`s means stack junk gets fired off as bomb offsets: spray bombing.

Watched `evo2-2` vs Bomber (seed 1) in the viewer: evo2-2 holds the middle room; at t4702
one bomb cut 11 cells off the Bomber, leaving a **3-cell zombie** (`T\$`, IP stranded in
it) that lives on but can't do anything, and loses at the cap.

### Full tournament at the real cap (9 warriors × 10 boards × both seatings, 5000 ticks)
```
evo2-2    W 68 L 29 D 63      Gatherer  W 64 L 20 D 76
evo2-1    W 62 L 38 D 60      evo2-3    W 47 L 34 D 79
Bomber    W 35 L 29 D 96      Roamer    W 25 L 34 D 101
Stalker   W 12 L 68 D 80      Turtle    W  7 L 35 D 118
evo1-1    W  5 L 38 D 117   (the old camper)
```
How matches ended: draw at tick cap 395, largest max size at cap 198, last standing 127.
- **Why so many draws:** max size decays linearly, so at the cap
  `max = 30 + 4 × size pickups − decay`. A draw just means both took the same number
  of size pickups (often zero). The cap rule is effectively "more size pickups".
- The hand-written Gatherer is still a top-2 warrior; it never fights, it just goes out
  and collects. evo2-2 is only 6–5 against it.
- `explorer.ready` added (a promise; resolves after evolved warriors are fetched); `load()`
  throws on unknown names. Tournament output now lists how matches ended.

---

## Session 1, part 4: write range, kill pay, tiebreaks, free-for-alls

User: WRITE range 2; killing pays in size and speed (a small fraction of the deceased);
tiebreaking is my call. Then keep pushing while they're away.

### Changes
- **WRITE range 2**: a foreign target must be within 2 (Chebyshev) of one of my cells,
  with line of sight from that cell. (`CONFIG.writeRange`)
- **Kill pay**: the killer takes 25% of the victim's max size and speed
  (`CONFIG.killPay`). Credit goes to whoever last bombed or wrote into the victim, if
  within 500 ticks (`CONFIG.creditWindow`). So running into someone's poison credits the
  poisoner, and breaking yourself after being bombed credits the bomber.
- **Tiebreaks at the cap** (my call): largest max size, then speed, then cell count;
  still tied → draw. Remaining draws are real stalemates (neither side collected, so
  both decayed identically on all three).
- **Free-for-alls in the GA**: kill pay only matters when a death doesn't end the match,
  i.e. 3+ players. Jobs are now "warriors in seat order + which seat is me". Each
  individual also plays `--ffa N` 4-player matches against 3 opponents drawn from its
  opponent pool, its seat rotating. Kills add +0.5 each (≤1) to the match score.
- `--bench dir1,dir2`: benchmarks (and starting-population seeds) can include evolved
  champions, so a run can start from the last run's best.

Tournament after these changes (hand-written + evo2 champions, 10 boards, 5000 ticks):
evo2-2 71W, evo2-1 61W, Gatherer 57W (but 83 losses, 0 draws: the tiebreaks turned all
its draws into decisions, mostly losses), evo2-3 57W. Ends: 190 true draws, 166 on max
size, 88 on tiebreaks, 116 last standing.

### evo3 launched
pop 128, 150 gens, 3000 ticks, 2 boards + 6 FFAs per individual per gen, benchmarks =
hand-written + evo1/evo2 champions.

### evo3 results (pop 128, 150 gens, 2 boards + 6 FFAs, benchmarks = hand-written + evo1/evo2; ~45 min)
- Fight metrics held around 12–19% deaths, ~1–1.7 bomb hits/game; **still zero poison**.
- Champions share an identical bottom row, **`.TMS7C-BTM?`**, a conserved "engine"
  that crossover keeps carrying, with different control rows on top. Held-out: ~55% vs
  the 11 benchmarks, winning records against every evo2 champion.
- Duels at 5000 ticks: evo2-2 still on top (111W); evo3-1..3 next (101–106W).
- **New: `--ffa` in the headless runner** (random 4-player free-for-alls, seeds 1000+).
  400 FFAs, 12 warriors: evo2-2 wins 38%, **Gatherer 34% with zero kills**, evo3-1 33%.
  Evolved warriors make all the kills (~0.25 per game each), but **none of the 400 FFAs
  ended last-standing**. Kill pay is weak late in a match: 25% of a decayed victim
  (max size ~10) is +2.5, less than one size pickup (+4).

### Why poison never evolved: offsets went stale
Wrote a range-2 poisoner, **Viper** (Bomber layout, writes code 9 = `@` instead of
bombing; carries no `@` itself). Zero writes, even while **touching** the Turtle.
Traced with the explorer: SCAN at the `S` cell returned 10,0 ("10 east of here"), but by
the time `W` ran, the IP had walked ~7 cells through the body. Offsets were relative to
the IP's *current* cell, so every offset went stale as the IP moved. Bombing half-worked
anyway thanks to range 6 and spraying; WRITE at range 2 couldn't.

That breaks the intent of the relative-coordinates decision (a frame that travels with
the warrior, so code keeps working after a SHIFT). The IP frame moves on every
instruction, not just on SHIFT.

**Change: a body frame.** Each warrior has an origin point that starts at its IP's start
cell and moves only with SHIFT (`wr.ox/oy`). SCAN, READ, BOMB, WRITE, FLOW and SWAP
offsets are relative to it, so a SCAN result stays valid until the warrior moves. (LOOK
still casts from the IP; GROW still extends the IP's current line.) `CONFIG.frame` =
`'origin'` (default) or `'ip'` (the old behavior); `--frame ip|origin` on the headless
runner and the evolver (workers get the parent's argv).

Effect, same 8 warriors, 8 boards, 5000 ticks:
```
frame ip:      evo2-2 59W, evo3-1 47W, Bomber 46W, Gatherer 42W, Roamer 38W, Viper 33W ...
frame origin:  Bomber 60W, Viper 52W, Stalker 49W, evo2-2 38W, Gatherer 37W, evo3-1 28W ...
```
Under the body frame **the hand-written hunters work as designed** and take the top three
spots; the evolved warriors (adapted to the IP frame's quirks) drop. First poison kill
ever: Viper vs evo2-2, seed 1, t2156, "evo2-2 died: executed @".

### "Only the Bomber gets out of its start room" (user, trying evolved warriors in the viewer)
- Part of it was the viewer: default speed was 4 ticks/s, and evolved warriors take a
  median 120–313 ticks to leave home (hand-written ones ~40), i.e. over a minute of real
  time. Default is now 32 ticks/s. New `left` event ("X left its start room", when the IP
  first leaves the start room) and `node dist/headless.mjs --explore <warriors> [--seeds N]`
  (solo runs: on how many boards, and how fast, each warrior gets out).
- The real cause: **body height vs corridor width.** The top corridor out of the home
  room is 3 tall on 7 of 20 boards (4 on 4, 5 on 9). SHIFT moves the body rigidly, and
  evolved bodies grew 4–5 rows tall to fit 30 cells: evo3-1 (4 rows) can SHIFT out on 13/20
  boards, evo2-2 (5 rows) on 9/20, the 3-row Bomber on all 20. Seed 7 in the viewer:
  evo3-1 stuck half in its doorway after grabbing one size pickup, every move since
  failing; evo2-2 pinned in its home corner. Nothing has learned FLOW.
- The GA sees only 2 boards per generation, so a body that's stuck on a third of the maps
  barely costs fitness.

### evo4: the body frame unlocks aiming (pop 128, 150 gens, origin frame; ~55 min)
Fight metrics climbed far past every earlier run:

| gen | deaths | bomb hits/game | best fitness |
|----:|---:|---:|---:|
| 0 | 9% | 0.12 | 2.45 |
| 30 | 19% | 1.72 | 3.45 |
| 75 | 42% | 3.27 | 3.79 |
| 105 | 47% | 4.34 | 3.99 |
| 135 | 60% | 4.60 | 4.24 |

(Earlier runs: ~15% deaths, ~1 hit/game, fitness ceiling ~3.) Held-out: **evo4-1 won
145/150** against all 15 benchmarks, every earlier champion included. All three
champions share the row **`:M>2S$B8yCM`**: SCAN for an enemy (`2S`), drop the found
flag, BOMB exactly that offset. Aimed bombing, which the IP frame made impossible.
```
evo4-1              evo4-2             evo4-3
$T                   S                   S
FBC-  rS\+!:        !3 - S1\S+!R        SM3 -?.\S`Me
 :M>2S$B8yCM         :M>2S$B8yCM          :M>2S$B8yCM
  4r>4    -[          >  S  -[-R           >  4 S-[MM
```
Poison appeared at gen 0 (0.08 writes/game, from the Viper-seeded mutants) then died out.

Duels, 11 warriors, 10 boards, 5000 ticks: evo4-1 158W 16L, evo4-2 145W, evo4-3 138W,
then Bomber 78W, Viper 61W, Stalker 57W, evo2-2 54W, Gatherer 49W (151 losses).
FFAs (400): evo4-1 wins 57% with 122 kills; Gatherer 16% and **dies 46%** of the time
(it's the fattest target). Still almost no last-standing FFAs (3/400).

**evo4-1 is an ambush predator.** Solo, it leaves home on 0/20 boards. In a duel vs the
Gatherer (seed 3), it sits in its home corner until ~t2143, then comes out and bombs the
Gatherer's core at t2412, after the Gatherer has fattened up to max size 62. Kill pay
(25%) makes waiting for the collector to get fat worth it.

### Corridors: user chose "the GA sees more boards"
`--boards N`: a pool of N boards per generation; each opponent is played on `--seeds` of
them, rotating through the pool, so every individual sees all N boards at the same match
count. `--bench` now also takes individual files (dropped the evo1 campers).
evo5 launched: 6 boards/gen (2 per opponent), benchmarks = 6 hand-written + evo2-2,
evo3-1, evo4-1..3.

### Varied boards (user: more rooms, various corridor sizes)
New generator, `CONFIG.board = 'varied'` (now the default; the first board is still
`'classic'`; `--board varied|classic` on headless/evolve, a picker in the viewer, `?board=`).
Still generated in the top-left quadrant and mirrored four ways, so seats stay fair:
- A 2–3 × 1–2 grid of rooms per quadrant (4–24 rooms total), column/row sizes split
  randomly (the start column/row gets enough room for any warrior). Rooms sit well
  inside their cells (40%–full minus 3), so there's wall between them and corridors have
  length: halls, closets, pillars.
- Corridors 1–5 wide (weighted toward 3), straight when the rooms overlap across the
  gap, otherwise L-shaped. Random spanning tree over the grid plus 40% extra edges for loops.
- Axis rooms sometimes (25%) stretch to the mirror axis and merge with their mirror into
  a central hall; otherwise corridors cross the axes (at least one per axis).
- The start room always has at least one exit ≥ 3 wide.
- Resources: 2 size spots + 1 speed spot (×4 mirrored) in random non-start rooms.
- Re-rolled until every start and spawn is reachable; unreachable pockets filled in.
- First pass made rooms nearly fill their cells, which read as open plains with gaps;
  shrinking rooms inside the cells fixed that.

Check on 200 varied boards: every warrior fits; leaving home: Bomber 105/200 (median
tick 37), evo3-1 167/200 (152), evo4-1..3 only ~20/200 (they're ambushers).

Generalization (none of these evolved on varied boards), 10 boards, 5000 ticks:
duels evo4-1..3 119W each, Bomber 79W, Stalker 70W, Viper 63W, evo2-2/evo3-1 55W,
Gatherer 41W (159 L). FFAs: evo4 ~30% wins (57% on classic), deaths only 2–4%. More
draws than on classic (341/1100 duels): more places to hide.

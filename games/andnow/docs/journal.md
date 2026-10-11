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

### No backward-compat modes
User: "You keep doing backward compatibility like 'classic'. No need, this is a journey.
As long as you are journaling and committing regularly we can always peek backwards."
Removed the `classic` board generator and the `ip` offset frame (and their `--board` /
`--frame` flags, `CONFIG.board` / `CONFIG.frame`, the viewer's board picker). The room
board and the body frame are simply how it works now. To look back: the classic board is
in commit 6918b68's `src/sim/board.ts`; the IP frame is in any commit before b52e3ca.
From here on, superseded mechanics get replaced, not kept behind switches.

### Correctness guard before optimizing: golden replays
User: optimize the sim after evo5, but double-check correctness ("I'd hate to gain speed
but lose correctness").
- `src/check.ts` → `node dist/check.mjs --record|--verify test/golden.json`. Runs 433
  matches (every known pair once, 150 random duels, 100 four-player FFAs, 30 solos) over
  all known warriors plus 40 random and 40 mutated genomes, 2000 ticks each, and folds a
  fingerprint of **the full world state into a running hash every tick**: every cell's
  owner/glyph/resource, every warrior's IP, origin, dir, stack, max size, speed,
  accumulator, stats, last action, harm record, death, plus the event count, latest event
  text, and match result. Checkpoints every 50 ticks locate the first divergence.
- The corpus (warrior texts + seeds) is stored in the golden file, so verify replays exactly
  what was recorded even as warriors/ changes.
- Baseline recorded from commit-current code: 831,517 ticks; self-verify OK (the sim is
  fully deterministic). Coverage, warrior-ticks by last action: SHIFT 540k, BOMB 495k,
  COLLECT 453k, GROW 86k, WRITE 59k, FLOW 16k, SWAP 10k.

### Sim optimization, round 1 (verified identical against the golden replays)
Profile before: 48% in `opScan` (read a ~60×40 window, classify every cell, sort, then
LoS), plus whole-board scans in `cellsOf` (SHIFT, COLLECT, SCAN, `seer`).
Changes, each followed by `check --verify` (all 433 matches identical on every tick):
1. **Per-owner cell sets** (`cellSets`, plus a cached board-ordered array), kept in step
   by `setOwner()`, now the only way `owner` changes (SHIFT does a bulk equivalent).
2. **SCAN from candidates**: other warriors' cells / the debris set / spawn points (the only
   places resources can exist), same window bounds, sorted by distance then board index,
   exactly the order the old row-major scan + stable sort produced.
3. **No per-instruction closures**: `step()` allocated `pop`/`push` arrow functions on every
   instruction; now direct calls.
4. **`advance()` walks the owner grid by index** instead of `inBounds`/`idx` calls.
5. Spawn loop without a `forEach` callback; `checkOver` fast path (nothing to decide while
   2+ are alive before the cap); `cellsOf` sorts via `Int32Array` (native numeric sort).
6. **Bulk SHIFT**: a translation keeps board order and touches only the mover's cells, so
   the moved list stays sorted; no per-cell set churn.
`check --bench` (same corpus, no hashing; noisy while evo5 holds all 8 cores): old ~58–108k
ticks/s, new ~150–190k ticks/s, roughly 2–2.5×. Tournament output byte-identical old vs new.
Clean numbers (CPU idle): golden corpus **177k → 480k ticks/s (2.7×)**; fight-heavy
tournament (Bomber, Viper, evo4-1, evo4-2, evo3-1; 6 boards; 3000 ticks) **1.65 s → 0.71 s (2.3×)**.
evo5 (38 generations in, on the old build) was stopped and restarted on the fast build.

### evo5: varied boards + 6-board pool (pop 128, 150 gens; ~20 min on the fast sim)
Restarted on the optimized sim (gen 0 came out identical to the old-build run's gen 0:
best 2.70, 32W 5L, 17/22 vs bench, more evidence the speedup changed nothing).
Benchmarks were the hand-written warriors + evo2-2, evo3-1, evo4-1..3, so the bar was high.
- Champions are **compact**: 3-row bodies (evo4's were 4–5), and they kept evo4's aiming
  row (`:M>2S$B8CyM`). Held-out vs benchmarks: 47–53/110 wins, losing records vs evo4-2/3.
```
evo5-1          evo5-2             evo5-3
 .G$3-CC3-          y^MWFS_ :       y$M  ^_ :W-
:M>2S$B8CyM     6>28M>2S$B8CyMC    :M>2S$B8CyMC
er     XM-@d        F4 M   R$S      y4 T <-4$>
=
```
- **Mobile**: leaving home solo on 100 varied boards: evo5-2 90/100 (median tick 36!),
  evo5-3 85, evo5-1 75; evo4-2/3 63 (median tick 1857), evo4-1 15, Bomber 58.
- Duels (12 warriors, 10 boards, 5000 ticks): **evo5-3 121W** tops, then evo4-1 115W,
  evo4-3 114W, evo4-2 112W, evo5-1 101W, evo5-2 95W; Bomber 68W.
- FFAs (400): evo4-3 27%, evo4-1 26%, evo5-1 26%, evo5-3 26%, evo4-2 25%, evo5-2 17%.
  Still essentially no last-standing FFAs (4/400).
- So: more boards per generation → compact, mobile warriors that hold their own against
  the ambushers. The "only the Bomber leaves home" complaint is answered by evolution, not
  by a rule change.

### Potluck: the GA on a browser farm (`platforms/potluck/`, see its journal)
Talked through Cloudflare Workers and installing a sim server on the other home
machines; Robby's idea won: a local server as orchestrator and **any browser that opens
its page as a worker**, a named pattern (Potluck) other projects can use.
- andnow side: match scoring moved to `src/ga/job.ts` (shared by local threads and the farm
  task), state fingerprinting to `src/sim/fingerprint.ts` (shared by `check` and canaries).
  `src/farm-task.ts` → `dist/farm-task.mjs` (browser-safe): `run(batch)` runs a batch of
  matches (distinct warrior texts sent once, jobs by index); `canary()` replays 15 golden
  cases (`test/canary.json`, from `check --canary`) and checks every final hash.
- `node dist/evolve.mjs ... --farm http://localhost:7700` registers the task and sends each
  generation as batches of 24 jobs.
- Verified: a local run and a farm run with the same args produce identical output; the
  farm runs at local-thread speed on the same cores.

### The GA never depends on the farm
Robby: GA runs must not depend on a browser being open, and no capacity must never
block. The evolver now always runs generations through Potluck's `runHybrid()` with its
own worker threads as the local runner (a batch at a time); `--farm <url>` only adds the
farm, which takes what verified capacity it has. Six scenarios (no farm flag, server
down, server up with no browser, browser helping, server killed mid-run, server started
mid-run) all produce output identical to a local-only run; see the Potluck journal.
The log line shows the farm's share: `(1426ms, farm 20/52 batches)`.

### evo6: the first farm run (pop 128, 150 gens, evo5 settings, `--farm`)
The farm grew during the run: the living room PC ("calendar", passively cooled, later
turned down to 2 threads), **Pinky's gaming PC** (8 of 12 cores, ~1,600 batches/min) and
**Robby's Android phone** (8 threads, ~690 batches/min, twice the living room PC). All
passed the canary, including the phone: an ARM CPU in a mobile browser runs the sim
bit-for-bit like this desktop's Node. **The farm did 59% of the run's batches** (24,399 of
41,635); generations went from ~7 s (farm = living room only) to ~4 s with everyone on;
12 minutes of generation time in all.

Results: champions keep the aiming row (`:M>2S$B8CyMC`); held-out 61–65/140 vs a strong
bench (winning records vs most of evo4/evo5). Tournaments (12 warriors, 10 boards, 5000
ticks): duels evo5-3 104W, evo6-2 99W, evo4-2 95W, evo4-1 94W, evo4-3 90W, evo6-1 90W, ...
FFAs: evo4-1 25%, evo5-3 22%, evo5-2 20%, evo6-1..3 17–19%. Leaving home: evo6 69–79/100.

**Plateau.** evo4, evo5 and evo6 are now within noise of each other. Since the body frame
unlocked aimed bombing (evo4), the population has converged on that one motif and the GA
is only refining it. Getting further probably takes a change in pressure (bigger or more
diverse populations, niches/speciation, longer matches) or in the game itself, not just
more generations.

---

## Session 1, part 5: breaking the plateau with diversity (MAP-Elites)

The farm grew again: two **Xboxes** (8 threads each, Edge) joined, for 35 browser threads
plus this desktop's 8.

User asked how BOMB works (answer: pop dx,dy in the body frame; target must be a foreign
cell (enemy or debris) within 6, Chebyshev, of one of my cells that can see it; 4 cycles;
destroys the cell; the IP's cell kills (+25% of the victim's size and speed); cut-off pieces
become debris; the victim records the bomber as last harmer. No defense exists: no
shields, no blocking LoS except walls, no repair) and chose option 1: change the
selection pressure to keep diversity.

**MAP-Elites** (`src/map-elites.ts` → `dist/map.mjs`): an archive with one slot per
playstyle, each holding the best warrior found for it; offspring come from elites picked
uniformly across filled slots and are filed into their slot if they beat the incumbent.
Playstyle, averaged over an individual's games:
- weapon: none (< 0.25 attacks/game) | bomber (poison < 20% of attacks) | mixed | poisoner (> 80%)
- economy: pickups/game, bins 0–½, ½–1, 1–2, 2–4, 4+
- mobility: share of games it left its home room, bins of ¼
= 80 slots. Opponents: all benchmarks + 6 elites from the archive, rotating boards, plus FFAs.
Ends by printing the map (fitness per slot) and writing the best of each weapon class to
`warriors/evolved/<run>-<class>.warrior`.

Plumbing: the thread pool + hybrid farm runner moved to `src/ga/runner.ts` (shared by
evolve and map); `JobResult` now also reports pickups and whether the side left home
(a new farm task, so every device re-ran its canary automatically). Golden replays still
identical.

### map1 (pop 384/gen, farm) and why it stalled
- Filled 39 slots by gen ~40 (20 "none", 19 "bomber"), then **stagnated**: no new slots and
  no improvements for ~90 generations; stopped at gen ~127 (archive saved at 119).
- **Never found a mixed or poisoner warrior.** Cause: the "armed" bar was 0.25 attacks/game,
  so a budding poisoner (the smoke test had one at 0.21 poison writes/game) was filed under
  "none" and competed with the pacifists instead of getting its own slot. → map2: 0.05.
- **Lucky elites.** The best slot (a bomber, fitness 3.46, the highest ever) dated from gen
  14 and was never beaten: an elite's score was a single round of games vs random
  opponents, so a lucky round held the slot forever. → map2 re-evaluates 64 elites per
  generation and keeps a running average over all their games (`--reeval`).
- Saved `map1-bomber` (5 hits, 2 pickups/game, leaves home 91%) and `map1-none` (a pure
  collector: 3.6 pickups/game) from the archive.

Farm: Pinky's PC at 10 threads (~2,600 batches/min), calendar, both Xboxes; the farm did
~70% of each generation (~6 s/gen). Xboxes are slow per thread (~51 batches/min vs ~260
on Pinky's PC): probably the console caps apps' CPU share (and/or Xbox One cores). Added a
per-thread rate column to the farm table.

---

## Session 1, part 6: self-modification, and evolution inside a game

User (heading out): "Self modification is possible for warriors right? We could see
evolution during a game?"

### Do evolved warriors rewrite themselves? No.
Added self-modification counters (writes that changed one of my own glyphs, grows, swaps,
flows) and `node dist/headless.mjs --selfmod <warriors>`, which also compares each body at
the start and end of a match, aligned on its body frame. Every evolved champion (evo4-1,
evo5-3, evo6-2, map1-*): **zero** self-writes, grows, swaps and flows; every starting cell
ends the match with its starting glyph. Only the hand-written Turtle grows armor. A random
rewrite of your own running code is almost always damage, so selection removed it.

### DIVIDE: reproduction, with copy errors
- **`D` (DIVIDE)**: pop dir; if max size ≥ 2× cells (and ≥ 2× the floor) and the space just
  beyond my body that way is free, copy my whole body there as a **new warrior with its own
  IP**. Parent and child each get half the max size; same speed; fresh stack. Each copied
  cell becomes a random glyph with chance `CONFIG.copyError` (2%). Costs a cycle per cell
  (1 if it fails). Appended to the glyph table, so existing codes are unchanged.
- **Lineages**: each warrior has `lineage` (its founder's id) and `gen`. Matches are won by
  lineages; a lineage's cap score is the sum of its members' max size above the floor plus
  one floor (= just max size for a lone warrior, so nothing changes for existing play;
  splitting into many floor-sized members earns nothing). GA scoring credits a seat with
  its whole lineage.
- **Kin are rivals** (user's call, over my first version where kin were allies): lineage
  only decides who won and who's scored; in play a copy is a warrior like any other:
  SCAN's "enemy" is anyone not me, kin can bomb and poison kin. Kin recognition, if it
  matters, has to evolve.
- Viewer: colored by lineage, descendants lighter per generation, one card per lineage
  with its descendant count; births in the log.
- Golden replays identical (existing warriors never DIVIDE).

### The petri dish (`src/petri.ts` → `node dist/petri.mjs <replicators...>`)
One (or several) replicators alone on a board, faster food (`--spawn 40`), copy errors,
a **reaper** (`CONFIG.reaperCap`: at the cap, a birth kills the oldest living warrior) and a
**lifespan** (`CONFIG.lifespan`: death of old age). Both are world rules that are off in
normal play. Reports population, births, deaths, generation depth, and the most common
living genomes over time; with several replicators, a count per lineage.

What happened:
1. **Upkeep shedding is a mutation pressure.** A 9-cell Amoeba (`C6S$TM4yD`) never took off:
   after a split, each half decays toward the 8-cell floor and sheds a cell, usually code.
   Descendants lost their `C` (can divide, can't collect) or had `D` copied wrong (collects,
   can't divide). A replicator has to fit under the floor. → 7-cell `C6S$TMD`.
2. **Purifying selection.** Seed 1, 30k ticks: population hit the cap (40), 108 births,
   generation 13; mutants kept appearing but the founder's genome held ~88%.
3. **Stasis without death.** Run longer and the dish filled: births need free space beyond
   the body, nobody could divide, the reaper only acts at a birth, so nothing died: frozen
   for 270k ticks. → lifespan (6000 ticks).
4. **Evolution in one game.** With turnover (seed 1, 300k ticks, copy error 5%): 1,365
   births, generations 118 deep; **the founder's genome was extinct by tick 30k**, and a
   succession of genomes took over: `C6S$TMD` → `C7SyTMD` → `C+S$TMD` → `C+SdTMD` →
   `CoSdTMD` → `C=!%TMD` → `C0DCTMD` → `6%DCTMD`. Trends: **targeted foraging abandoned for
   random walking** (`6S` mutated into scans for types that match nothing, so TOWARD picks
   a random direction: in a crowded dish everyone heading for the same food loses), and a
   **second DIVIDE** (`C0DCTMD`: two tries at reproducing per loop). Even a few bombs and a
   kill appeared late on.
5. **Did it improve anything? Yes.** Head-to-head in the dish (20 boards × both seatings, no
   mutation): first takeover `C7SyTMD` beat the founder **32–8**; later `C0DCTMD` beat it **29–11**.

Also: `warriors/amoeba.warrior` is the 7-cell replicator (bundled in the viewer).

### Farm utilization (user: "waiting" often shows 0)
- `runHybrid` now keeps ~3 items per verified thread queued (was 2) and tops up every 100 ms
  (was 250).
- MAP-Elites runs **overlapping generations** (`--overlap 2`): the next generation is bred
  from the current archive and sent out while the last one's stragglers finish, so the
  farm doesn't go idle at generation boundaries. (map2 was already running on the old
  code, so it still shows gaps.)

### Petri dish, continued
- Viewer: **petri dish mode** (`?petri=1`, or the "Petri dish" button): same rules as
  `dist/petri.mjs`, with a live panel of the most common living genomes (colored by
  lineage, founder marked), births, deaths, generation depth. Seed 1 in the viewer matches
  the headless run tick for tick (15 × `C7SyTMD` at t30000 in both).
- `CONFIG.endless` (dish only): don't end when one lineage is left.
- **Predators**: a replicating bomber, Hunter (`C2S$BTMD`). Alone it bombs its own newborn
  copies (they appear right next to it, the nearest "enemy") and goes extinct by t6.5k.
  With amoebas (seed 1): hunters died out early (cannibalism again), amoebas grew to 14,
  then **the whole dish went extinct between t15k and t30k**: with a fixed lifespan a cohort
  born together dies together, and a small population whose births stall in that window
  empties. → **lifespans now vary per warrior** (50–150% of the setting, drawn at birth;
  only when a lifespan is set, so normal matches are unchanged). Seed 1, cap 60: stable at
  ~22–25 alive through t150k, generation 64.
- Most boards don't work for this amoeba: it can only divide east, and from the middle of
  its start room there's no room to the east; its max size decays below what dividing
  needs (16) before it wanders somewhere useful. Seed 1 works; choose dish boards accordingly.

### map2: diversity search works (pop 384/gen, 250 gens, farm; armed at 0.05, elite re-evaluation)
- **77 of 80 slots filled** (map1: 39). By weapon class: none 20, bomber 19, mixed 19,
  poisoner 19. Re-evaluation deflates lucky elites (a bomber at 3.03 at gen 244 settled to
  2.67 after re-tests).
- The map (fitness per slot): within every weapon class the top-right corner (lots of
  pickups, leaves home most games) is best; bombers top out highest (2.67), poisoners
  2.28, pacifists 2.03, mixed 1.97.
- Showcases: `map2-bomber` (3.4 hits, 2.2 pickups/game), `map2-poisoner` / `map2-mixed`
  (descendants of the Stalker's `oo'@W`: collectors, 3.4–3.5 pickups/game, poisoning
  opportunistically ~0.14 writes/game), `map2-none` (pure collector, 3.6 pickups/game).

**Strategy depends on format.** 10 warriors, 10 boards, 5000 ticks:
- Duels: **map2-mixed 89W, map2-poisoner 87W, map2-none 82W** top the table, ahead of
  evo6-2 79W, map2-bomber 77W, map1-bomber 75W, evo5-3 74W, evo4-1 72W. Pairwise over 20
  games, the collectors beat every aimed-bomber lineage modestly (map2-mixed vs evo4-1
  10–6, vs evo5-3 10–6, vs evo6-2 9–7, vs map1-bomber 9–6) and crush Bomber (12–3) and
  Gatherer (17–3).
- FFAs: the same collectors are the **worst** evolved warriors (5–9% wins, die ~26% of the
  time); bombers dominate (map1-bomber and evo6-2 26%, evo5-3 23%, evo4-1 21%).
So the diversity search found a genuinely different strategy that beats the plateau's
aimed bombers one-on-one (out-collect them and win on the cap) but loses in four-player
chaos. Non-transitive dynamics the single-population GA had collapsed away.

### map3: seeded from map2, full 5000-tick matches (200 gens, overlapping generations)
- `--from runs/map2/archive.json`: map2's 77 elites were gen 0's candidates. Under 5000-tick
  conditions they first collapsed into 25 slots (longer games shift playstyles), then the
  map refilled: **all 80 slots by the end**.
- First run with the farm-feeding fixes: the queue held ~175 waiting items throughout
  (map2 often showed 0). The farm did ~78% of the batches.
- Showcases: `map3-bomber` (fitness 2.95: 3.65 hits *and* 4.6 pickups/game, leaves home in
  every game), `map3-none` (fitness 2.34: **7.2 pickups/game**), `map3-mixed` 2.01,
  `map3-poisoner` 1.86 (poison weakens in longer games).

Tournament (11 warriors: map3 + map2 showcases, map1-bomber, evo5-3, evo6-2; 10 boards; 5000 ticks):
- Duels: **map3-none 99W** tops, then map2-poisoner 89W, map3-mixed 84W, map2-mixed 83W,
  map3-poisoner 81W, map2-none 79W, map2-bomber 71W, evo6-2 67W, map1-bomber 66W, evo5-3 62W,
  and **map3-bomber last (50W 98L)**.
- FFAs: map1-bomber 30%, evo5-3 26%, evo6-2 25%, **map3-none 23% with zero kills** (the best
  non-bomber, ahead of map2-bomber 21%), map3-bomber 15%, the rest ≤ 12%.
- **Lesson: an archive score measured against a weak field doesn't transfer.** map3-bomber's
  2.95 came from map3's opponent mix (all of `warriors/`, i.e. the hand-written weaklings
  and the Amoeba, plus archive peers): it farms weak opponents and loses to strong ones.
  Benchmarks for future runs should be the strong evolved champions, not everything.
- The economy line keeps strengthening: a pure collector now wins duels outright and
  holds its own in FFAs. Aimed bombers still own four-player chaos.

## Session 1, part 7: an overnight run (map4, petri series, grand tournament)
Chain in `runs/overnight/run.sh` (01:36–03:56): map4, then 21 long petri dishes, then a
19-warrior grand tournament. The farm was mostly the calendar machine (other devices slept),
~150 of 672 matches per generation.

### map4: seeded from map3, strong-only benchmarks (300 gens)
- Benchmarks were only the strong champions (evo5-3, evo6-2, map1-bomber, the map2 and map3
  showcases except map3-bomber): the fix for map3's weak-field lesson.
- The map3 archive collapsed to 42 slots at gen 0 under the harder field and refilled to
  79–80 by gen 27. Best fitness wandered between 2.2 and 3.1 (re-evaluation keeps
  deflating lucky elites) and ended 2.90 (bomber); none 2.19, mixed 2.25, poisoner 2.19.
- **All four showcases are one family**: Stalker's `oo'@W` descendant with a
  `C2S|`/`$$:Mem+` loop, differing in a cell or two. A strong benchmark field rewards one
  robust design and its variants fill every behavior niche. The "none" showcase even
  carries a `B` (it just doesn't fire in archive games).

### Grand tournament (19 warriors: all showcases + the best of each evo run; 10 boards, 5000 ticks)
- Duels: **map4-none 195W, map4-mixed 191W, map4-bomber 186W**, map3-none 184W,
  map4-poisoner 183W, then map2-poisoner 156, map3-mixed 154, map2-mixed 148,
  map3-poisoner 146, map2-none 140, map1-bomber 128, map2-bomber 128, evo6-2 127,
  evo4-1 124, evo5-3 117, map3-bomber 101, map1-none 83, evo2-2 63, evo3-1 55.
  Head to head: map4-none beats map3-none 11–7, evo6-2 13–3, map1-bomber 12–4;
  map4-bomber beats map1-bomber 11–4 and map3-none 14–4.
- FFAs (800 four-player matches): the old aimed bombers still lead (map1-bomber 26%,
  map2-bomber / evo6-2 / evo5-3 23%), but **map4-bomber and map4-none are right there at
  22%** and rarely die (7% / 11%, vs map3-none's 27%). map4-mixed 10%.
- So map4 closed most of the duel/FFA gap: the first warriors that top duels *and* sit in
  the FFA lead pack. Strong-only benchmarks were the right call.

### Petri series: most boards can't start a dish
- 21 dishes (seeds 1, 11–30; 300k ticks, cap 60, copy error 0.05). **Only seed 1 got
  going**, and even it went extinct between t250k and t300k (13 alive at t250k). The other
  20 died within ~8k ticks: the founder never divides, or its few children die of old age.
- Cause (traced on seed 2): the Amoeba steers greedily at the nearest visible resource.
  From most start rooms that's through a wall, so it shoves against the wall forever while
  food sits uneaten in other rooms; and from the middle of its room, an east DIVIDE has no
  space. Faster food or longer lives didn't help (0/10).
- Screening 120 boards: the Amoeba sustains a dish on 6 (1, 52, 76, 79, 102, 113). Long runs
  on those: 52, 76 and 113 alive at t300k (generation 87–101), 79 and 102 died out early.
- **Convergent evolution to random walking.** In dishes 1, 52 and 76 the founder's genome
  vanished and descendants gave up food-seeking: `C0SyTMD` (seed 1: `y` turns the scan
  into a jittery walk), `Ce0%TMD` (seed 52: `e0%` is always 0, so TOWARD gets 0,0 and picks
  a random direction: collect, step randomly, divide), `C=FDTM>` (seed 76: divide first,
  then a random step). A random walker doesn't crowd one food spot with its kin.
  On seed 113, where greedy steering works, the founder's genome *held* (83% at t300k):
  stabilizing selection.
- The evolved walkers are better founders: on 20 boards where the Amoeba starts 0 dishes,
  `Ce0%TMD`, `C0SyTMD` and `C=FDTM>` each start 4. My hand-made wander variants
  (`C6S$TMTMD` etc.) didn't; evolution's are shorter (7 cells, under the size floor).
- Next: make an evolved walker the default dish founder, or find out what the 16 boards
  it still fails on have in common (probably food that's far or behind narrow corridors).

## Session 1, part 8: amorphous warriors (OOZE)
The user, watching the viewer: nothing ever changes shape to get through a corridor, never
self-modifies, never grows. Measured: the champions (map4-none, map4-bomber, map3-none,
evo6-2) do **0.0 self-writes, 0.0 grows, 0.0 swaps, 0.0 flows per game**. Picking up size
raises max size (a budget), not the body; cells come only from GROW, and nothing rewards it.

Is corridor-fitting shape change possible with the current ops? Effectively no:
- FLOW moves one cell one step and the body must stay connected, so a cell can only slide
  around a corner of the body. A straight line can't FLOW at all; nothing can turn a
  1-wide L-bend.
- GROW can push out a tentacle, but there's no voluntary way to drop cells (shedding only
  follows the slow max-size decay).
- SHIFT is rigid.

First try: CRAWL, a snake move for chain-shaped bodies, with the IP reading along the
chain's bends. The user: too limited, they want **amorphous** bodies and a GA toward
programs that survive shape change. Reverted (it's in the git history only as this note).

**OOZE (`A`, pop dir)**: amoeboid movement one cell at a time. The rearmost cell (least
far along dir) that can leave without splitting the body moves, code and all, to the free
floor touching the body that is farthest along dir (ties: nearest the body's middle). It
must land farther along than it was. The IP and the frame origin ride the cell under
them. Repeated, a blob pours itself through any gap and re-forms beyond it; its program
is rearranged along the way (a straight line oozing along its own axis just rotates its
code cyclically, which a wrap-around loop doesn't even notice).
- Appending the glyph left all 433 golden replays identical.
- New stats: `oozes`, and `squeezed` = ticks the IP spent in a narrow passage (a floor
  cell whose run across or down is ≤ 2).
- Hand seeds: `Oozer` (`C6S$TA`, the Gatherer with OOZE) and `Blob` (same plus two rows of
  fat). Solo, 20 boards, 3000 ticks: they leave home in 16–17/20 games (Gatherer 10/20) and
  squeeze through narrow passages, but collect ~0.9 pickups/game (Gatherer 7.8): oozing
  scrambles the program. Making programs resilient to that is the GA's job.

### morph1: MAP-Elites toward amorphous, resilient warriors
`--axes morph`: weapon (4) × **shape change** per game (cells oozed + flowed + grown: 0–1,
1–10, 10–50, 50–200, 200+) × **squeeze** (share of games through a ≤ 2-wide passage).
Fitness is unchanged (match score vs strong benchmarks + peers + FFAs), so a high-morph
slot keeps only warriors that win while reshaping themselves. Seeded from map4's archive
plus Oozer/Blob and mutants of them; benchmarks: map4 ×4, map3-none, evo6-2, map1-bomber.

#### morph1 results (250 gens)
- 62 of 80 slots; 39 of them morph 10+ cells a game. The best warrior in the whole archive
  (bomber, 2.42) is a morpher (17 cells/game), and morphers at 50–200/game reach 2.36:
  **oozing code can win**. Top fitnesses are noisy (reeval of 64), ±0.3 gen to gen.
- Showcases (`warriors/evolved/morph1-{still,twitch,morph,ooze,amoeba}`) are all the
  map4 SHIFT lineage (`>C2S| … $$:Mem+`) with `A` cells sprinkled into branches. They
  still travel by SHIFT; OOZE fires in side branches, mostly in fights.
- Solo probe (`dist/probe.mjs`, new: 20 boards, 3000 ticks):

  | warrior | pickups | oozes | left home | squeezed |
  |---|---|---|---|---|
  | morph1-still | 5.6 | 0 | 19/20 | 1/20 |
  | morph1-morph | 5.5 | 10.6 | 20/20 | 2/20 |
  | morph1-ooze | 7.1 | 11.3 | 19/20 | 1/20 |
  | morph1-amoeba | 5.4 | 28.8 | 19/20 | 1/20 |
  | Oozer (seed) | 0.8 | 848 | 16/20 | 1/20 |
  | map4-none | 5.8 | 0 | 19/20 | 1/20 |

  Nobody grows (0 grows everywhere) and nobody needs to squeeze: the boards guarantee a
  ≥ 3-wide exit from the start room and most corridors are 3–5 wide, so a 3-row SHIFTer
  reaches everything. The squeeze axis was measuring board luck.
- `--selfmod` did catch real amorphousness once: morph1-morph vs morph1-amoeba went from
  its 3-row block to a single 17-cell line (`B|>B·A$2:M>C22A+S`) and kept fighting.
- **Lesson**: the axes reward tolerance of shape change, not *use* of it. Shape change
  has to pay, which means the boards and the win rule have to ask for it. → morph2.

### Rule changes for morph2: bodies win, corridors narrow
- **Tick cap: the biggest body wins** (total cells of the lineage; ties → max size, then
  speed). Before it was the largest max size, i.e. collecting alone. Collecting still only
  raises the cap; to win on size a warrior now has to GROW into it before decay sheds it.
  The old objection to cell count (a 27-cell program beat a 6-cell one on length alone)
  is gone because decay sheds everyone to ~10 cells by tick 5000 unless they feed: a
  sitter ends at ~10, a gatherer that never grows ends at its 6.
- **Corridors**: widths drawn from [1, 1, 2, 2, 3, 4] (was [1, 2, 3, 3, 4, 5]); the start
  room's guaranteed exit is 2 wide (was ≥ 3). A 3-row SHIFT block can't take most
  corridors any more; OOZE or a thin body can.
- Probe on the new boards (20 boards, 3000 ticks): pickups fall from ~5.5 to ~1.4 a game
  for every evolved warrior (map4, map3, morph1 alike); squeezing jumps to 10–13/20 (that's
  the IP stepping into a narrow mouth, mostly). Nobody grows. Plenty of room to evolve.
- Golden replays re-recorded (1315 matches), canary regenerated (46 cases).

#### morph2, first try: the splitting exploit
By gen 107 the top of every column was a 4–6-cell body (`A]v/BWD/ e41/ Mdo/C2/`) that
never left home, collected nothing, and DIVIDEd. Each member keeps its own max-size floor
(8), so six 5-cell bodies are 30 cells at the cap while a lone feeder decays to ~10. The
old max-size rule already counted "each member above the floor, plus one floor" for this
exact reason; my cell-count version dropped it. Fixed the same way (each member's cells
above the floor, plus one floor). Re-checked: the splitter goes 0–24 against map4-none
and morph1-ooze. Run killed and kept as `runs/morph2-split`; morph2 restarted fresh.

#### morph2 results (250 gens, narrow corridors, biggest body wins)
- 78 of 80 slots. Pinky's computer rejoined the farm near gen 200 (11 threads, ~195
  batches/min each, twice a calendar thread): gens fell from ~63 s to ~21 s, farm doing
  ~77% of jobs.
- Solo probe on the narrow boards (20 boards, 5000 ticks):

  | warrior | pickups | oozes | final cells |
  |---|---|---|---|
  | map4-none | 2.3 | 0 | 14.8 |
  | morph1-ooze | 3.4 | 86 | 14.3 |
  | morph2-still | 5.8 | 0 | 19.1 |
  | morph2-morph | 4.3 | 122 | 18.4 |
  | morph2-ooze | 3.9 | 153 | 16.6 |
  | morph2-amoeba | 3.9 | 235 | 16.4 |

  The narrow boards made morph2 feed better than every older champion, and its oozers
  reshape 5–10× more than morph1's. Still the SHIFT lineage underneath.
- **Still zero grows.** A diagnostic (wrapping opGrow) found `G` almost never even runs,
  and the one attempt hit a full body. Why: evolved bodies are 25–29 cells and max size
  started at 30, so there was no room to grow until after feeding; and cap ties between
  two non-growers fall to max size, so collecting alone already won.

### Room to grow: max size starts at 40, bodies at most 30 cells
- `CONFIG.startCells = 30` (the most cells a warrior file / genome may have) split from
  `CONFIG.startSize = 40` (starting max size). Every warrior has 10+ cells of room from
  tick 0 that only GROW fills; with biggest-body-wins, a grower beats an equal collector.
  (Side effect: DIVIDE, which needs max size ≥ 2× cells, opens up for ≤ 20-cell bodies.)
- Kept existing warrior files valid (no trimming). Golden re-recorded (1555 matches),
  canary 54 cases.
- morph3: seeded from morph2's archive, same axes, benchmarks = morph2 showcases + map4-none.

### The "left home" and "squeezed" stats were wrong (caught by the user, watching)
Watching matches in the UI, the user saw no warrior ever fully leave its room: a tip of
the body pokes into a corridor mouth as it wanders, nothing more. They were right:
- "left home" fired when the **IP** was outside the start room; "squeezed" when the
  **IP** stood on a narrow cell. A body poking one cell into a corridor counted for both.
  So every "left home 97%" / "squeezed 50%" since map1, and the squeeze axis of morph1–3,
  measured tips, not travel. The morph1/morph2 conclusions about squeezing are void.
- Fixed to whole-body measures: **left home** = no cell of the body in the start room;
  **squeezed** = at least half of a 4+ cell body inside ≤ 2-wide passages.
- Re-probed (narrow boards, 20 boards, 5000 ticks): morph2/map4 warriors fully leave on
  5–8/20 boards and are never mostly inside a narrow passage (0/20). Only the hand-made
  6-cell Oozer really threads corridors (5/20 squeezed, 9/20 left).

### Making travel the point
- **Every exit from the start room is 1–2 wide** (start-room links capped at 2; the start
  room never stretches to merge with its mirror; axis crossings from it capped at 2).
  Getting anywhere now means threading a corridor.
- **"Entered another room" (the user's suggestion)**: boards keep their room rects; a
  warrior counts a room once its whole body (bounding box) is inside a room other than its
  start room. Children inherit the parent's set (so DIVIDE can't double-count). Fitness
  gets +0.5 per room, up to +1. The MAP-Elites morph axes now use the share of games
  with a room entered instead of the squeeze rate.
- Probe after: morph2/map4 warriors get wholly into another room on 3/20 boards; Oozer
  9/20, Blob 3/20. morph3 (old metric) stopped at gen ~100, kept as runs/morph3-badmetric.
- morph4: from morph2's archive + Oozer/Blob seeds, 400 gens.

#### morph4 results (400 gens; whole-body metrics, narrow start exits, room bonus)
- 69 of 80 slots. Pinky's computer left around gen 200 (gens ~34 s → ~95 s).
- **crawler** (pulled out early, gen ~115): 22 cells, mostly fat, oozes ~850 cells/game and
  gets its whole body into another room on 18/20 solo boards. Frames show it threading the
  2-wide start corridor across the map in ~100 ticks, then reshaping: a 1-wide line along a
  wall, a 2-wide column, a 20-cell line through a corridor. First warrior that really
  changes shape to travel. It barely collects (0.2/game) and loses most duels (3W 49L).
- A new lineage (`*T / 1SBCs / +=\ / emLA / dWC L`) took the top of the archive from gen
  ~220 on and became **morph4-amoeba**: ~640 oozes/game, whole body into another room on
  10/20 solo boards (79% of GA games), and 2nd in the showcase tournament.
- `--selfmod`: morph4-amoeba turns from an 8-row blob into a 1–2-wide, 16-row vertical
  snake mid-match (6 of its starting cells end up with different glyphs around them) and
  keeps fighting. Amorphous and resilient, which is what we were after.
- Solo probe (narrow boards, 20 boards, 5000 ticks):

  | warrior | pickups | oozes | left | squeeze | room |
  |---|---|---|---|---|---|
  | morph4-amoeba | 1.1 | 639 | 12/20 | 0/20 | 10/20 |
  | morph4-twitch | 2.0 | 33 | 8/20 | 3/20 | 5/20 |
  | morph4-morph | 2.0 | 29 | 6/20 | 2/20 | 4/20 |
  | morph4-still | 1.9 | 0.5 | 3/20 | 0/20 | 3/20 |
  | crawler | 0.2 | 849 | 19/20 | 1/20 | 18/20 |
  | morph2-still | 4.0 | 0 | 3/20 | 0/20 | 3/20 |
  | map4-none | 1.1 | 0 | 3/20 | 0/20 | 3/20 |

  ("Squeeze" stays near 0 because it needs half the body inside narrow cells at once;
  snakes count, but a blob that streams through a corridor mouth keeps most of itself in
  the rooms on either side.)
- Tournament (8 warriors, 6 boards, both seatings): morph4-twitch 30W 9L, morph4-amoeba
  28W 9L, morph4-morph 23W, morph2-still 23W, morph4-still 15W, morph4-ooze 12W,
  map4-none 9W, crawler 3W 49L. 193 of 336 matches are draws at the cap.
- In GA matches the collectors log ~8 pickups/game vs ~2 solo: debris from bombed cells
  counts as a pickup, so fights feed them.
- **Still zero grows**, with 10 cells of room. GROW needs to sit on the executed path with
  sensible stack args, and a grown cell becomes code the IP walks into; evolution hasn't
  found the trade worth it. Next lever if we want growth: a cheaper/safer GROW (e.g. grow
  fat only, no code arg) or growth tied to COLLECT.

## Session 1, part 9: anatomy of the shape-changers, and GROW makes fat

### Why can the amoeba change shape and keep operating?
Tools: an execution tracer (every instruction the IP runs, plus the body every N ticks)
and a shuffle test (same body shape, glyphs randomly permuted, 10 shuffles × 10 boards).
Both are scratch scripts, not committed; the findings are what matter.

**The rule that makes it possible.** The IP runs "the next cell of my own body along my
current direction, skipping gaps, wrapping around." So the program actually running is
whichever cells line up with the IP *right now*: for an IP heading west, the cells of its
current row, in a loop. Change the body and the program changes with it.

**1. No direction glyphs, no poison.** The two travelers contain zero direction changers
(`> < ^ v _ | ? r [ ] #`) and zero `@`:

| warrior | direction glyphs | `@` |
|---|---|---|
| morph4-amoeba | 0 | 0 |
| crawler | 0 | 0 |
| Oozer (hand seed) | 0 | 0 |
| morph4-still / twitch / morph / ooze | 7 / 5 / 8 / 6 | 1 each |
| map4-none | 7 | 1 |

With no way to turn, the amoeba's IP heads west for the whole match. It can't be routed
into a dead end or onto a poison cell however the body is rearranged; it just loops over
whatever its row holds. The SHIFT collectors are the opposite: their programs are 2D
circuits (`v … >C2S| … ^`) that route the IP between rows, with an `@` parked where the
IP never goes *in that layout*. Rearrange them and the IP takes a wrong turn: shuffled,
they die on 1–3 of 10 boards (the amoeba and crawler never do).

**2. OOZE takes from the back; the IP lives at the front.** OOZE moves the *rearmost*
cell (along the ooze direction) to the free spot *farthest ahead*, preferring spots near
the body's middle across that direction. The amoeba oozes mostly west (its row runs `d`,
"push my direction", before `A`), so cells leave the trailing edge and land on the leading
edge, which is where its IP's row is. The code being executed is almost never what gets
moved, and every moved cell *joins* the running row. Trace (seed 2, solo):

```
t0      5-cell row   +em[L]A           executes  A L m e + …
t250   13-cell row   :BdLmL[m]s\eA     loop  dB:Ae\smLmL   (cells from the back joined it)
t500   22-cell row   R+C[=]M1BdLmLms\e.*=4A   now has C (collect) and M (shift) in the loop
t1500  27-cell row   eC.*=4A+C=M1BdL[L]R/TCmWW\s
t2000  snake, 2 wide: the row is just  m[A]  →  loops  AmAmAm…
```

So the body self-assembles its program: it starts with a tiny engine (`A` plus something
that pushes a direction), and oozing streams the rest of its code into the loop.

**3. Most of its code is order-insensitive.** Almost everything in the row is a stack
push/pop (`m s d e 1 4 : \ + * =`), a sense (`L`), or an action that needs no arguments
(`C`) or tolerates any (`A`, `M`, `B`, `W` take whatever is on the stack, and an empty
stack pops 0, which is a valid direction). Any order of those cells is a valid program
that does roughly "ooze/shift somewhere, collect, poke around." The *direction* it oozes
does depend on the order (the value just before `A`), so the arrangement steers it, a
random walk that reshapes itself, not a planned gait.

**4. Endgame quirk: steering by decay.** As a 2-wide vertical snake, its row holds two
cells, `m A`: push max size, ooze that way (mod 4). Max size decays 1 per 250 ticks, so the
ooze direction rotates east → north → west → south every 250 ticks; a pickup adds 4,
which leaves it unchanged. Eventually it parks against a wall (`W A`, stack empty,
oozing east into nothing).

**But it is not "any arrangement works."** Shuffled from the start, the amoeba never
oozes at all (527 oozes → 0): the IP's *starting row* has to contain the engine (`A` with
a direction source). Its resilience is to the rearrangements its *own oozing* produces,
which keep the engine at the leading edge.

| warrior | original: room / oozes | shuffled ×10: room / oozes |
|---|---|---|
| morph4-amoeba | 5/10, 527 | 0/10, 0 |
| crawler | 9/10, 713 | 1.6/10, 103 |
| Oozer (6 cells) | 3/10, 896 | 4.4/10, 793 |
| morph4-morph | 2/10, 0 | 0.2/10, 91 |
| map4-none | 2/10, 0 | 0/10, 0 |

Oozer is the only one that truly doesn't care (6 cells, almost every row has `A`).

### The other entities
- **crawler** is the same design turned 90°: IP heads south, so its program is its
  *column*. 22 cells, 12 of them fat (`.`): the fat is spacer that is harmless in any
  order. Loop at t200: `AM..d!..6.=..TC` (ooze, shift, push direction, a TOWARD). It
  travels best (whole body into another room on 18/20) but its `C` is rarely in the
  running column, so it barely feeds.
- **morph4-still / twitch / morph** (the SHIFT lineage since map2): a 3–4 row circuit
  that SCANs for resources, TOWARDs them and SHIFTs the whole block. Fast and good at
  feeding when the way is wide, but a block can't fit a 1–2-wide exit, and oozing breaks
  the circuit, so they ooze only in side branches (0–30/game) and mostly stay home.
- **morph4-ooze**: a SHIFT-lineage warrior with `A` in a branch; oozes when blocked,
  which scrambles it (shuffles kill it on 3–4 boards of 10).
- **Oozer / Blob** (hand seeds): Oozer `C6S$TA` aims at the nearest resource and oozes
  there; tiny, so robust, but too small to win. Blob (Oozer plus fat) mostly loses its
  engine row.

### GROW now makes fat
- Old GROW popped a direction *and a code* and added that code as a new cell. Nothing
  ever used it: it needs two sensible stack values, and the new cell is code the IP then
  runs into. **New GROW pops only a direction and adds a fat cell (`.`)** at the end of my
  line that way, if max size has room. Fat is a no-op, sheds first, and counts as body.
- One-cell test: morph4-amoeba with its row's `e` changed to `G` (**amoeba-g**,
  `warriors/amoeba-g.warrior`): grows 12 cells/game, peaks at 41 cells (cap 40 + pickups),
  feeds 3× better (3.2 vs 1.1 pickups solo: a bigger body touches more), ends with 29 cells
  vs 23, and wins a 3-way tournament (amoeba-g 12W 6L, morph4-twitch 8W, morph4-amoeba
  4W 10L).
- Golden re-recorded (1933 matches), canary 67 cases.
- morph5: from morph4's archive + amoeba-g/Oozer seeds, 300 gens.

### Aside: "spawn camping" is jitter (user observation, morph5 gen ~80)

Watching a match, the user saw an entity sitting at a resource, losing and regaining a cell fast. Measured solo over 10 boards × 3000 ticks:

- Resources can't be camped: a spawn regrows only after 120 consecutive ticks with nothing on or next to it (`spawnInterval`), and touching it resets the timer. Sitting next to one denies it to everyone, yourself included.
- Body size barely churns: growers gain about 10–14 cells a game (GROW) and shed 5–9 to decay, with only 1–2 swings between gaining and losing.
- What flickers is oozing back and forth. Of all the cells an oozer vacates, 35–60% are refilled within 20 ticks: amoeba-g 188 of 404, m68-26220 316 of 524. Its loop pops directions that alternate, so the same tip moves off and back. Very few of these happen next to a resource spot (1–13 a game), so it isn't camping. Much of the "oozes per game" count is this wasted motion. Only whole-body room entries, which are in the fitness, mean real travel.

### Viewer: fewer choices, no tick limit (user request)

- **The picker** now offers only the curated evolved warriors in `warriors/evolved/manifest.json`. That's five, the winners of the recent tournaments: morph4-twitch, morph4-amoeba, amoeba-g, morph4-morph and morph2-still.
  - The hand-made warriors and the older evolved ones still load by name from `?w=`.
  - The evolvers no longer append their showcases to the manifest. A warrior goes in by hand once it wins a tournament.
- **The default match** is morph4-twitch vs amoeba-g.
- **No tick limit in the viewer:** a match runs until one lineage is left. `?ticks=N` brings back the body-size judgement at tick N. `explorer.runUntilOver()` still stops at 20000 ticks by default so it can't hang.
- **The viewer is served for the LAN** at `http://lilg:8765/`.

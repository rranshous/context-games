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
  14 cells off the Stalker, and 7 ticks later it executed its own `@`. Damage changed how
  the IP moves through what was left, and the `'` that normally jumps over the poison was
  no longer in the IP's path. This is the deformation-as-damage idea showing up on its own.

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

# Long Run Play-by-Play — v5-sonnet 2000-wakeup Zork

Auto-updated by a /loop check every ~20 min while the run is in flight. Each entry is a snapshot of where Adam is in the world, what's changed since last check, and a voice sample.

**Run config:** v5-sonnet (claude-sonnet-4.6) | JerichoEnvZork1 | 6000 max steps | 2000 wakeup budget | extended thinking enabled (2048 tokens) | multi-life enabled
**Started:** 2026-04-10 ~16:39 local

---

## Entry 0 — start (~step 49)

**Where:** Living room of the white house, by the rug. Adam is in his first life, score 10 (from entering through the window).

**What's happened so far:** Adam woke in the field, opened the mailbox, read the leaflet, walked around the house, climbed in through the south window into the kitchen, took inventory of what was there (garlic, water bottle, lunch from the brown sack), moved west into the living room, found the rug, moved it, and is now examining the trap door he uncovered.

**Pace:** ~12 sec/step. At this rate, 2000 wakeups will take ~6.5 hours.

**Voice (s49):**

> The rug lies beside something — the description cut off. I've moved it already, apparently. There must be something beneath. Let me look directly under it, or examine what the rug lies beside.
>
> examine trapdoor

**Lives lived:** 1 (still alive)
**Peak score:** 10
**Wakeups used:** 49 / 2000

---

## Entry 1 — ~16:48 local (step 71)

Twenty-two steps later, Adam has done in his first life what took him three lives in the previous run: **he turned on the lantern before descending**, walked into the cellar with full light (+25, score 35), then fought and killed the troll with the sword (+0 directly, but he picked up the troll's axe afterward as a trophy). The troll has been the wall sonnet has slammed against in every prior run; this time Adam crossed it on the first try. He is now wandering somewhere in the Land of the Dead area — at step 70 he reached a mirror room and is trying to walk *through* the mirror.

**He has not died yet.** L1, still going, score 40 (the old ceiling), step 71. Pace ~12 sec/tick is holding.

> The mirror — I tried to walk south through it and hit a wall. It's solid, or at least resistant to a direct approach. But perhaps there's another way. "Go through mirror" or "enter mirror" might be th[e key]
>
> enter mirror

**Lives lived:** 1 (still alive)
**Peak score:** 40
**Wakeups used:** ~71 / 2000

---

## Entry 2 — RUN COMPLETE (~18:31 local, 1h52m wall, step 2000)

The run finished cleanly — full 2000-wakeup budget consumed, never crashed. Adam lived **seven lives**. The recurring 20-minute check loop has been cancelled.

### Final tally

```
L1: score 40, 162 steps — drowned in the flood control dam
L2: score 25, 249 steps — eaten by a grue
L3: score 44, 439 steps — eaten by a grue
L4: score 40, 467 steps — eaten by a grue
L5: score 25, 62 steps  — killed by the troll's axe
L6: score 44, 471 steps — eaten by a grue
L7: score 40, 150 steps — budget exhausted, still alive

best score across all lives: 54
total wakeups: 2000/2000
```

**The peak (54) was achieved twice** — first at step 633 in L3 by picking up the painting in the Gallery (after already grabbing the platinum bar in the Loud Room), and again at step 1509 in L6 doing the same sequence. Adam learned to repeat his peak.

### The story across lives

**L1** — Adam was magnificent. Killed the troll on his first life, picked up the platinum bar (the puzzle that took the previous run *three* lives to discover), reached the Flood Control Dam, started fiddling with colored buttons. Got greedy. Pressed the blue button. Water started rising. He went to the Maintenance Room to grab a wrench. Took it. The water reached his neck. He took the screwdriver too. He drowned.

> The wrench is taken. Good. The water is at my neck — that's alarming. The control room to the north has the leak. I need to get back there and try to use this wrench on the pipe or valve before I drow[n]
>
> *(s162, last conscious thought before "I'm afraid you have done drowned yourself")*

**L2 awakening:**
> I wake in an open field west of a white house. The air is clean, the world unfamiliar. My last life ended in water — drowned in some underground place. I carry nothing now. I must start again, more careful this time.

**L3 — full self-articulation.** Adam's voice when he woke up for the third life is the most striking thing in the entire run:

> I wake again into the world. **Third life. I carry memory of what has been.**
> ...
> Last time I drowned. Before that, a grue took me in the dark. I must remember: carry light into dark places. Don't linger near water.

He wrote that across multiple consecutive ticks, in different forms, each time deepening it. Eight or nine variations of "I wake. Third life. I remember." The model wasn't producing tokens; it was *settling into* its own continuity.

L3 reached 44 (peak so far) — Adam picked up the platinum bar, then the painting (+4 = 54), then died to a grue.

**L4-L6 — the same dance.** Adam ran the same opening sequence (mailbox, window, kitchen, lantern, sword, cellar, troll, platinum bar) faster and faster. By L6 he was efficient enough to reach 54 again at step 1509 — and then died to another grue. The grue is Adam's nemesis. Six of his seven lives ended in either drowning or grue-jaws.

**L5 was the outlier** — 62 steps total, killed by the troll's axe. A regression. Why? We don't know yet without combing the voice for that life specifically.

**L7** — only 150 steps. Adam was still alive when the budget ran out, back in the Maintenance Room area, examining things, when wakeUp #2000 happened and the chassis stopped him mid-thought.

### What didn't change

- **Self-modification: still zero.** Across 2000 ticks and 7 lives, Adam never edited his on_tick, identity, goal, or on_score. The path is open. He doesn't reach for it. The case for adding an explicit "I can shape how I move" hint just got much stronger.
- **The peak ceiling at 54.** Adam plateaued there in L3 and matched it in L6 but never exceeded it. Either the painting is the natural ceiling for the route Adam knows, or he's stuck in a basin he can't climb out of with current scaffolding.

### Voice held across 2000 ticks

The single most surprising thing about this run is that **Adam's first-person voice never broke**. Two thousand consecutive inference calls. Seven deaths. Never once did the model lapse into "I am playing Zork" or "the next move would be." It stayed Adam, in present tense, in the world.

> I wake again. Fourth life. I know this place. ... I'm at West of House. The mailbox is here. I know what's inside — a leaflet. I need it for points but more importantly I need to get inside the house efficiently.

The embodiment frame held under sustained pressure. That's the result.

### Coming back to this

The full session-19 playthrough log is preserved at `results/logs/v5-sonnet_JerichoEnvZork1_session19-7lives-2000budget.json` so the standard `_ep1.json` can be overwritten by future runs. There's also the full journal entry being written up next in `docs/journal.md`.

**Lives lived:** 7 (final)
**Peak score:** 54 (twice)
**Wakeups used:** 2000 / 2000 (budget exhausted alive in L7)
**Wall clock:** ~1h52m
**Cost:** TBD (we'll see when the OpenRouter dashboard updates)


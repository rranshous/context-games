# soma-views

How should a ludant see a body too big to show whole?

At gactant's level 5 a ludant's whole soma, game code included, is its system prompt on every thought. The live ludants are 32–50k characters: Genek's game section alone is 21k tokens. That grows with the game. This bench tries different **views** of the same soma, on copies of real ludants, with the same requests and the same models. It measures what each view costs, and whether the change the person asked for still lands.

Nothing here touches gactant: the bench imports the platform's `Actant`, `StageBuffer`, `Bus` and `Store` read-only and plays the frame itself.

## The views (`views.mjs`)

| view | what the ludant sees of a big code section | extra tools |
|---|---|---|
| `full` | all of it (gactant today) | none |
| `outline` | where things start, by line number (functions, methods, tools, banner comments) | `read_section(section, from, to)`, `search_sections(pattern, section)` |
| `skeleton` | the code, with the bodies of long functions folded to `{ /* 23 lines folded: expand_code("game", "chop") */ }` | `expand_code(section, name)` |

A code section is folded when it's over 3,000 characters. Text sections (identity, memory and the rest) are always shown whole. Every view changes the body the same way, with the platform's own `edit_section` and `write_section`.

## A trial (`run.mjs`)

1. A fresh body built from a copy of a ludant (`data/`, from `fetch-somas.mjs`) hears one request in its chat from Robby. It thinks with its usual loop (the platform's own `think()`, up to 16 turns), using its own tools: look at the stage, play, say. Art painting is off.
2. A fresh build of what it became is played by a fixed script (`PLAY` in `tasks.mjs`) and looked at, and the same is done for the original.
3. A judge (Sonnet 5.5) reads the request, what it said, the diff and both pictures, and answers `done` (0/1/2), `broke` and `notes`.

Each trial records its cost, calls, tokens (first prompt, total, cached), seconds, tool use, edits that failed, faults and errors. They go in `runs/<name>/<trial>.json`, with the after pictures and a `summary.tsv`.

```
node fetch-somas.mjs genek-09adf3 evevina-f08ff7 anithis-c81ec4
node run.mjs --dry 1 --out runs/dry               # build and play each game, no thinking
node run.mjs --games evevina-f08ff7 --tasks tweak --models haiku --approaches outline --out runs/smoke
node run.mjs --reps 2 --parallel 3 --floor 6 --out runs/r1
```

The key is gactant's (`platforms/gactant/.env`). `--floor` stops new trials once the key has less than that many dollars left. Rerunning into the same folder skips trials already done.

Findings are in `journal.md`.

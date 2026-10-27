#!/bin/sh
# The proof run: live outline against full (gactant today), decided by the rule in journal.md
# ("The proof, set before running"). Rerunnable: run.mjs skips trials already done, and stops
# starting new ones below the floor, so this can be started again whenever the key has room.
cd "$(dirname "$0")"
node run.mjs --games evevina-f08ff7,anithis-c81ec4,genek-09adf3,arcade --tasks convo,convo2 \
  --models haiku,sonnet --approaches full,live --reps 4 --parallel 3 --floor 1.5 --out runs/proof >> runs/proof.log 2>&1

#!/bin/bash
# One round of discovery, in the background at low priority: scan each forever run's newest
# checkpoint (./ecology.sh, one at a time), then list what has never been seen before
# (dist/novelty.mjs, which keeps its ledger in runs/ecology/known.json):
#   ./discover.sh            (seeds 1 2 3 4)
#   ./discover.sh 2 4
#   PAUSE= ./discover.sh     (don't pause a bake; by default seed 4's is paused, see below)
# The list goes to runs/ecology/new-<date>.md; the log to runs/discover.log.
cd "$(dirname "$0")"
seeds=${*:-1 2 3 4}
# The scans need room beside four crowded bakes: one bake (seed $PAUSE, default 4) stops for the
# scans and carries on from its newest checkpoint after them, whatever happens to the scans.
pause=${PAUSE-4}
(
  echo "--- start $(date): seeds $seeds"
  pid=$([ -n "$pause" ] && pgrep -f "dist/bake.mjs .*seed=$pause forever")
  if [ -n "$pid" ]; then
    echo "pausing seed $pause's bake (pid $pid) for the scans"
    kill $pid; while kill -0 $pid 2>/dev/null; do sleep 1; done
    trap 'HEAP=${BAKE_HEAP:-12288} ./bake.sh $pause' EXIT
  fi
  FG=1 ./ecology.sh $seeds
  [ -n "$pid" ] && { HEAP=${BAKE_HEAP:-12288} ./bake.sh $pause; trap - EXIT; }
  out=runs/ecology/new-$(date +%F-%H%M).md
  nice -n 19 node --max-old-space-size=8192 dist/novelty.mjs --out "$out" > /dev/null && echo "wrote $out"
  echo "--- done $(date)"
) >> runs/discover.log 2>&1 < /dev/null &
echo "discovering in seeds $seeds (log: runs/discover.log)"

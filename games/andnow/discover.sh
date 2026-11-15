#!/bin/bash
# One round of discovery, in the background at low priority: scan each forever run's newest
# checkpoint (./ecology.sh, one at a time), then list what has never been seen before
# (dist/novelty.mjs, which keeps its ledger in runs/ecology/known.json):
#   ./discover.sh            (seeds 1 2 3 4)
#   ./discover.sh 2 4
# The list goes to runs/ecology/new-<date>.md; the log to runs/discover.log.
cd "$(dirname "$0")"
seeds=${*:-1 2 3 4}
(
  echo "--- start $(date): seeds $seeds"
  FG=1 ./ecology.sh $seeds
  out=runs/ecology/new-$(date +%F-%H%M).md
  nice -n 19 node --max-old-space-size=8192 dist/novelty.mjs --out "$out" > /dev/null && echo "wrote $out"
  echo "--- done $(date)"
) >> runs/discover.log 2>&1 < /dev/null &
echo "discovering in seeds $seeds (log: runs/discover.log)"

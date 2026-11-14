#!/bin/bash
# Look for interactions (bites, code writes, scavenging, blocking, moving together, who's
# good for whom) in the newest checkpoint of each forever run, one run at a time, at low
# priority, in the background:
#   ./ecology.sh 1 2 3 4            (seeds; prefix climb7)
#   TICKS=300 ./ecology.sh 2        (replay length, default 200)
#   AT=1800000 ./ecology.sh 2       (a given checkpoint instead of the newest)
# Reports go to runs/ecology/s<seed>-t<tick>.md (and .json); the log to runs/ecology.log.
cd "$(dirname "$0")"
[ $# -gt 0 ] || { echo "usage: ./ecology.sh <seed> [...]"; exit 1; }
mkdir -p runs/ecology
(
  for s in "$@"; do
    dir=runs/bake/${PREFIX:-climb7}-s$s
    f=$(node -e "const ix = require('./$dir/index.json'); const m = ix.marks.filter((m) => m.file && (!process.env.AT || m.t === +process.env.AT)); console.log(m.length ? m[m.length - 1].file : '')")
    [ -n "$f" ] || { echo "$dir: no checkpoint${AT:+ at $AT}"; continue; }
    echo "--- $(date) $dir/$f"
    nice -n 19 ionice -c3 node --max-old-space-size=${HEAP:-12288} dist/ecology.mjs "$dir/$f" --ticks "${TICKS:-200}" --out "runs/ecology/s$s-${f%.andnow.gz}.json" > /dev/null
  done
) >> runs/ecology.log 2>&1 < /dev/null &
echo "scanning seeds $* (log: runs/ecology.log, reports: runs/ecology/)"

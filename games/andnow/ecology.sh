#!/bin/bash
# Look for interactions (bites, code writes, scavenging, blocking, moving together, who's
# good for whom) in the newest checkpoint of each forever run, one run at a time, at low
# priority, in the background:
#   ./ecology.sh 1 2 3 4            (seeds; prefix climb7)
#   TICKS=300 ./ecology.sh 2        (replay length, default 200)
#   AT=1800000 ./ecology.sh 2       (a given checkpoint instead of the newest)
#   FG=1 ./ecology.sh 1 2           (in the foreground, for scripts)
# A scan holds a whole world (several GB for a crowded run) next to the bakes, so only one
# runs at a time (others queue on a lock), and each waits until NEED GB are free (default 10).
# Reports go to runs/ecology/s<seed>-t<tick>.md (and .json); the log to runs/ecology.log.
cd "$(dirname "$0")"
[ $# -gt 0 ] || { echo "usage: ./ecology.sh <seed> [...]"; exit 1; }
mkdir -p runs/ecology
free_gb() { awk '/MemAvailable/ { print int($2 / 1048576) }' /proc/meminfo; }
scan() {
  for s in "$@"; do
    dir=runs/bake/${PREFIX:-climb7}-s$s
    f=$(node -e "const ix = require('./$dir/index.json'); const m = ix.marks.filter((m) => m.file && (!process.env.AT || m.t === +process.env.AT)); console.log(m.length ? m[m.length - 1].file : '')")
    [ -n "$f" ] || { echo "$dir: no checkpoint${AT:+ at $AT}"; continue; }
    [ "$(free_gb)" -ge "${NEED:-10}" ] || { echo "$(date): $(free_gb) GB free, waiting for ${NEED:-10}"; until [ "$(free_gb)" -ge "${NEED:-10}" ]; do sleep 300; done; }
    echo "--- $(date) $dir/$f"
    /usr/bin/time -f "peak %M KB, %e s" nice -n 19 ionice -c3 node --max-old-space-size=${HEAP:-12288} dist/ecology.mjs "$dir/$f" --ticks "${TICKS:-200}" --out "runs/ecology/s$s-${f%.andnow.gz}.json" > /dev/null
  done
}
if [ -n "$FG" ]; then
  ( flock 9; scan "$@" ) 9> runs/ecology/.lock >> runs/ecology.log 2>&1 < /dev/null
else
  ( flock 9; scan "$@" ) 9> runs/ecology/.lock >> runs/ecology.log 2>&1 < /dev/null &
  echo "scanning seeds $* (log: runs/ecology.log, reports: runs/ecology/)"
fi

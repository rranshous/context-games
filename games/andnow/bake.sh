#!/bin/bash
# Start, or carry on, a forever Climb bake at low priority, in the background:
#   ./bake.sh <seed> [run name prefix, default climb2] [engine: serial | par, default par]
# It writes runs/bake/<prefix>-s<seed> (open it in the viewer's runs list) and logs to
# runs/bake-<prefix>-s<seed>.log. ANDNOW_THREADS sets the par engine's workers (default 4).
cd "$(dirname "$0")"
s=${1:?usage: ./bake.sh <seed> [prefix] [serial|par]}; name=${2:-climb2}-s$s; engine=${3:-par}
mkdir -p runs/bake
echo "--- start $(date) engine $engine" >> runs/bake-$name.log
setsid nice -n 19 node --max-old-space-size=8192 dist/bake.mjs "climb=1&w=climber,diver,hunter&seed=$s" forever --out runs/bake/$name --resume --engine $engine >> runs/bake-$name.log 2>&1 < /dev/null &
echo "baking runs/bake/$name (log: runs/bake-$name.log)"

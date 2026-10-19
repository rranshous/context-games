#!/bin/bash
# Start, or carry on, a forever Climb bake at low priority, in the background:
#   ./bake.sh <seed> [run name prefix, default climb6]
# It writes runs/bake/<prefix>-s<seed> (open it in the viewer's runs list) and logs to
# runs/bake-<prefix>-s<seed>.log.
cd "$(dirname "$0")"
s=${1:?usage: ./bake.sh <seed> [prefix]}; name=${2:-climb6}-s$s
mkdir -p runs/bake
echo "--- start $(date)" >> runs/bake-$name.log
setsid nice -n 19 node --max-old-space-size=8192 dist/bake.mjs "climb=1&w=climber,diver,hunter&seed=$s" forever --out runs/bake/$name --resume >> runs/bake-$name.log 2>&1 < /dev/null &
echo "baking runs/bake/$name (log: runs/bake-$name.log)"

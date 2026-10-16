#!/bin/bash
# Resume a climb bake forever at low priority: runs/bake-resume.sh <seed>
cd "$(dirname "$0")/.."
s=$1
echo "--- resume $(date)" >> runs/bake-climb-s$s.log
exec setsid nice -n 19 node --max-old-space-size=4096 dist/bake.mjs "climb=1&w=climber,diver,hunter&seed=$s" forever --out runs/bake/climb-s$s --resume >> runs/bake-climb-s$s.log 2>&1 < /dev/null

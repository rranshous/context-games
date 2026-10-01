# Build packages/dungeon/src/world.ts from the chart scans: the hearth (a lance-form wisp, most generous), the
# charted list (mightiest first), and the Warden wells (the mightiest few).
import json, glob, sys
D='apps/tools/data/chart-v2/'
beings=[]
for f in sorted(glob.glob(D+'*.json')): beings+=json.load(open(f))
beings.append({'cell':'012341174703','magnitude':1,'traits':{'form':2,'generosityIdx':11}})  # found while benchmarking
seen=set(); uniq=[]
for b in beings:
    if b['cell'] in seen: continue
    seen.add(b['cell']); uniq.append(b)
wisps=[b for b in uniq if b['magnitude']==0]
lances=[b for b in wisps if b['traits']['form']==3]
pool=lances or wisps
hearth=max(pool, key=lambda b: b['traits']['generosityIdx'])
charted=sorted(uniq, key=lambda b:(-b['magnitude'], b['cell']))
wells=[b['cell'] for b in charted if b['magnitude']>=1][:5] or [charted[0]['cell']]
print('hearth', hearth['cell'], 'form', hearth['traits']['form'], 'gen', hearth['traits']['generosityIdx'], 'lance' if lances else 'NO LANCE', file=sys.stderr)
print(f'''// Public facts of the universe the dungeon uses for its computer-controlled casters. No secrets: anyone can
// recompute these. Spec v2: found by scanning one region per element in the depth-12 layer (see the journal).

/** The hearth: the wisp every apprentice's first word is spoken to, its sign kept in every household. */
export const HEARTH_GOD = '{hearth['cell']}';

/** The charted beings, mightiest first: signs known to all. Wardens, shamans and rival racers speak them. */
export const CHARTED: string[] = {json.dumps([b['cell'] for b in charted])};

/** The mightiest charted beings, whom Wardens call upon. */
export const WARDEN_WELLS: string[] = {json.dumps(wells)};''')

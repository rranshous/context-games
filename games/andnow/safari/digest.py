# Digest a safari round: per dish, population over time, the leading genomes and
# outlines, glyphs beyond the founder's set, and per-warrior acts. Flags oddities.
import json, sys, glob, os
FOUNDER = set('C6S$TMD.K')
for f in sorted(glob.glob(f'runs/safari/{sys.argv[1]}/*.json')):
    d = json.load(open(f)); S = d['snapshots']; last = S[-1]
    name = os.path.basename(f)[:-5]
    pop = ' '.join(str(s['alive']) for s in S[::max(1, len(S)//20)])
    print(f"\n=== {name}  {'EXTINCT at %d' % last['t'] if d['extinct'] else ''}  {d['url']}")
    print(f"  pop: {pop}")
    if d['extinct'] and len(S) > 1: last = S[-2]
    if 'shapes' not in last: continue
    print(f"  t{last['t']}: {last['alive']} alive, {last['distinct']} genomes, armor {last['armor']}, bands {last['bands']}")
    print('  top:', ' | '.join(f"{n}×{g}" for g, n in last['top'][:6]))
    print('  outlines:', ' | '.join(f"{n}×{g}" for g, n in last['shapes'][:6]))
    odd = {g: n for g, n in last['glyphs'].items() if g not in FOUNDER and n >= max(5, last['alive'] * 0.03)}
    if odd: print('  extra glyphs:', ', '.join(f"{g}:{n}" for g, n in sorted(odd.items(), key=lambda x: -x[1])))
    print('  acts:', ', '.join(f"{k} {v:.2f}" for k, v in last['acts'].items() if v > 0.01))
    # Oddities over time: crashes, glyph surges
    for a, b in zip(S, S[1:]):
        if a['alive'] > 200 and b['alive'] < a['alive'] * 0.6: print(f"  ! crash t{a['t']}→{b['t']}: {a['alive']}→{b['alive']}")

"""Eyeball top candidates from phase 2 (tier C refinement)."""
import json
import sys
sys.path.insert(0, '.')
from analyze_phase1 import is_clean


def main():
    with open("phase2-results.json") as f:
        data = json.load(f)

    for group, baseline_key in [("cynic", "baseline_T0.5"), ("eulogist", "baseline_T0.3")]:
        print(f"=" * 70)
        print(f"GROUP: {group}")
        print(f"=" * 70)
        baseline = data[baseline_key]
        print(f"-- BASELINE @ {baseline_key} --")
        for p, t in baseline.items():
            print(f"  [{p[:25]}]")
            print(f"    {t[:160]}")
        print()

        ranked = sorted(
            data[group].items(),
            key=lambda kv: kv[1].get("score", {}).get("score", 0),
            reverse=True,
        )

        clean = [(k, info) for k, info in ranked if all(is_clean(t) for t in info["outputs"].values())]
        print(f"({len(clean)} of {len(ranked)} pass clean filter)\n")

        for key, info in clean[:6]:
            s = info["score"]
            print(f"=== {key} | score={s['score']:.3f} d={s['distinctiveness']:.2f} c={s['coherence']:.2f} ===")
            for p, t in info["outputs"].items():
                print(f"  [{p[:30]}]")
                print(f"    {t[:200]}")
            print()


if __name__ == "__main__":
    main()

"""Eyeball top composites from phase 3."""
import json
import sys
sys.path.insert(0, '.')
from analyze_phase1 import is_clean


def main():
    with open("phase3-results.json") as f:
        data = json.load(f)

    print("-- BASELINE --")
    for p, t in data["baseline"].items():
        print(f"  [{p[:30]}]")
        print(f"    {t[:160]}")
    print()

    ranked = sorted(
        data["candidates"].items(),
        key=lambda kv: kv[1].get("score", {}).get("score", 0),
        reverse=True,
    )

    clean = [(k, info) for k, info in ranked if all(is_clean(t) for t in info["outputs"].values())]
    print(f"({len(clean)} of {len(ranked)} pass clean filter)\n")

    n_show = int(sys.argv[1]) if len(sys.argv) > 1 else 12
    for key, info in clean[:n_show]:
        s = info["score"]
        print(f"=== {key} | score={s['score']:.3f} d={s['distinctiveness']:.2f} c={s['coherence']:.2f} ===")
        for p, t in info["outputs"].items():
            print(f"  [{p[:30]}]")
            print(f"    {t[:200]}")
        print()


if __name__ == "__main__":
    main()

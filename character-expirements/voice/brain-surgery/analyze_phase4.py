"""Eyeball phase 4 B-tier composite outputs."""
import json
import sys
sys.path.insert(0, '.')
from analyze_phase1 import is_clean


def main():
    with open("phase4-results.json") as f:
        data = json.load(f)

    print("-- BASELINES --")
    for sk in data["baseline"]:
        print(f"  [{sk}]")
        for p, t in data["baseline"][sk].items():
            print(f"    [{p[:25]}] {t[:140]}")
    print()

    ranked = sorted(
        data["candidates"].items(),
        key=lambda kv: kv[1].get("avg_score", 0),
        reverse=True,
    )

    for cname, info in ranked:
        avg = info.get("avg_score", 0)
        print(f"=== {cname} | ops={info['ops']} avg={avg:.3f} ===")
        for sk in info["outputs"]:
            print(f"  [{sk}]")
            for p, t in info["outputs"][sk].items():
                clean = "✓" if is_clean(t) else "✗"
                print(f"    {clean} [{p[:25]}] {t[:160]}")
        print()


if __name__ == "__main__":
    main()

"""Eyeball phase 5 deep-validation outputs across all completed candidates."""
import json
import sys
sys.path.insert(0, '.')
from analyze_phase1 import is_clean


def main():
    with open("phase5-results.json") as f:
        data = json.load(f)

    candidates = data["candidates"]
    ranked = sorted(
        candidates.items(),
        key=lambda kv: kv[1].get("avg_score", 0),
        reverse=True,
    )

    print("=" * 70)
    print("PHASE 5 — by avg score")
    print("=" * 70)
    for cname, info in ranked:
        per = info.get("scores", {})
        avg = info.get("avg_score", 0)
        broken = {sk: s.get("broken", 0) for sk, s in per.items()}
        print(f"  {cname:<10} avg={avg:.3f}  per_seed={ {sk: round(s['score'],3) for sk,s in per.items()} }  broken={broken}")
    print()

    n_show = int(sys.argv[1]) if len(sys.argv) > 1 else len(ranked)
    for cname, info in ranked[:n_show]:
        ops = info["ops"]
        temp = info.get("temp", 0.5)
        print("=" * 70)
        print(f"=== {cname} (ops={ops}, T={temp}) ===")
        print("=" * 70)
        for sk in info.get("outputs", {}):
            print(f"\n-- {sk} --")
            for p, t in info["outputs"][sk].items():
                clean = "✓" if is_clean(t) else "✗"
                print(f"  {clean} [{p[:25]}]")
                print(f"      {t[:240]}")
        print()


if __name__ == "__main__":
    main()

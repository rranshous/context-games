"""Autonomous research orchestrator.

Runs phases 1-4 in sequence. Each phase has its own results JSON and is
checkpoint-safe (resumable on crash). Single model load shared across phases.
Final summary printed at the end.

Usage:
    python research.py                 # run all phases
    python research.py --phases 1,2    # run subset
    python research.py --summary-only  # print summary from existing JSONs
"""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

import research_lib as rl

PHASE_MODULES = {
    1: ("phase1_discover", "Layer × scale discovery sweep"),
    2: ("phase2_tier_c",   "Tier C refinement (cynic, eulogist)"),
    3: ("phase3_composites", "2-layer dampen pair search"),
    4: ("phase4_btier",    "B-tier composite validation"),
}


def import_phase(num):
    name, _ = PHASE_MODULES[num]
    return __import__(name)


def print_phase_top(num):
    name, label = PHASE_MODULES[num]
    out_path = os.path.join(os.path.dirname(__file__), f"phase{num}-results.json")
    if not os.path.exists(out_path):
        rl.p(f"\n=== Phase {num}: {label} === (no results yet)")
        return
    data = rl.load_json(out_path, default={})
    rl.p(f"\n=== Phase {num}: {label} ===")
    if num == 4:
        ranked = sorted(
            data.get("candidates", {}).items(),
            key=lambda kv: kv[1].get("avg_score", 0),
            reverse=True,
        )
        for vname, info in ranked:
            avg = info.get("avg_score", 0)
            per_seed = {sk: round(s["score"], 3) for sk, s in info.get("scores", {}).items()}
            rl.p(f"  {vname:<14} avg={avg:.3f}  per_seed={per_seed}")
    elif num == 2:
        for group in ("cynic", "eulogist"):
            rl.p(f"  -- {group} --")
            ranked = sorted(
                data.get(group, {}).items(),
                key=lambda kv: kv[1].get("score", {}).get("score", 0),
                reverse=True,
            )
            for key, info in ranked[:8]:
                s = info.get("score", {})
                rl.p(f"    {key:<28} score={s.get('score',0):.3f} d={s.get('distinctiveness',0):.2f} c={s.get('coherence',0):.2f} broken={s.get('broken',0)}/{s.get('n',0)}")
    else:
        ranked = sorted(
            data.get("candidates", {}).items(),
            key=lambda kv: kv[1].get("score", {}).get("score", 0),
            reverse=True,
        )
        for key, info in ranked[:15]:
            s = info.get("score", {})
            rl.p(f"  {key:<18} score={s.get('score',0):.3f} d={s.get('distinctiveness',0):.2f} c={s.get('coherence',0):.2f} broken={s.get('broken',0)}/{s.get('n',0)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--phases", default="1,2,3,4", help="Comma-separated phase numbers")
    ap.add_argument("--summary-only", action="store_true")
    args = ap.parse_args()

    phases = [int(x) for x in args.phases.split(",") if x.strip()]

    if args.summary_only:
        for num in phases:
            print_phase_top(num)
        return

    rl.p("=" * 80)
    rl.p("AUTONOMOUS RESEARCH RUN")
    rl.p(f"Phases: {phases}")
    rl.p(f"Start: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    rl.p("=" * 80)

    # Load model once
    rl.ensure_model()

    overall_start = time.time()
    for num in phases:
        if num not in PHASE_MODULES:
            rl.p(f"Skipping unknown phase {num}")
            continue
        name, label = PHASE_MODULES[num]
        rl.p("\n" + "#" * 80)
        rl.p(f"# PHASE {num}: {label}")
        rl.p("#" * 80)
        t0 = time.time()
        mod = import_phase(num)
        try:
            mod.main()
        except Exception as e:
            rl.p(f"Phase {num} CRASHED: {e}")
            import traceback
            traceback.print_exc()
            rl.p(f"Continuing to next phase. (Resumable on next run.)")
        rl.p(f"Phase {num} duration: {(time.time()-t0)/60:.1f} min")

    rl.p("\n" + "=" * 80)
    rl.p(f"RESEARCH COMPLETE in {(time.time()-overall_start)/60:.1f} min")
    rl.p("=" * 80)
    for num in phases:
        print_phase_top(num)


if __name__ == "__main__":
    main()

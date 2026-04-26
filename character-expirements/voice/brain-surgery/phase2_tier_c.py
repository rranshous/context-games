"""Phase 2 — Tier C refinement.

Cynic neighborhood + eulogist swap variants. Goal: find tighter operating
points for the two C-tier characters that are inconsistent at their current
config.

Cynic candidates: layers {6,7,8} × scales {0.4, 0.45, 0.5, 0.55, 0.6}
                  + 2-layer scale-0.5 pairs from {6,7,8}
Eulogist candidates: 8 swap variants near (5,18)
"""

import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

import research_lib as rl

OUT = os.path.join(os.path.dirname(__file__), "phase2-results.json")

CYNIC_LAYERS = [6, 7, 8]
CYNIC_SCALES = [0.4, 0.45, 0.5, 0.55, 0.6]
CYNIC_PAIRS = [(6, 7), (6, 8), (7, 8)]

EULOGIST_SWAPS = [
    (4, 17), (4, 18), (4, 19),
    (5, 17), (5, 19),
    (6, 17), (6, 18), (6, 19),
]

PROMPTS = [
    "The ocean is",
    "When I was young,",
    "The door opened slowly and",
    "Death is",
]

TEMP_CYNIC = 0.5
TEMP_EULOGIST = 0.3
SEED = 42
MAX_TOKENS = 150


def main():
    results = rl.load_json(OUT, default={})

    # Baselines at both temps
    if "baseline_T0.5" not in results:
        rl.p("Generating baseline @ T=0.5...")
        results["baseline_T0.5"] = rl.run_baseline(PROMPTS, MAX_TOKENS, 0.5, SEED)
        rl.save_json(results, OUT)
    if "baseline_T0.3" not in results:
        rl.p("Generating baseline @ T=0.3...")
        results["baseline_T0.3"] = rl.run_baseline(PROMPTS, MAX_TOKENS, 0.3, SEED)
        rl.save_json(results, OUT)

    if "cynic" not in results:
        results["cynic"] = {}
    if "eulogist" not in results:
        results["eulogist"] = {}

    # Build cynic candidate list
    cynic_cands = []
    for L in CYNIC_LAYERS:
        for s in CYNIC_SCALES:
            cynic_cands.append((f"cynic_L{L}_s{s}", [["scale", f"{L}:{s}"]]))
    for a, b in CYNIC_PAIRS:
        cynic_cands.append((f"cynic_L{a}_L{b}_s0.5", [["scale", f"{a}:0.5"], ["scale", f"{b}:0.5"]]))

    eulogist_cands = []
    for a, b in EULOGIST_SWAPS:
        eulogist_cands.append((f"eulogist_swap_{a}_{b}", [["swap", f"{a},{b}"]]))

    all_cands = [(k, ops, "cynic", TEMP_CYNIC, "baseline_T0.5") for k, ops in cynic_cands]
    all_cands += [(k, ops, "eulogist", TEMP_EULOGIST, "baseline_T0.3") for k, ops in eulogist_cands]

    rl.p(f"Phase 2: {len(all_cands)} candidates × {len(PROMPTS)} prompts")

    for i, (key, ops, group, temp, baseline_key) in enumerate(all_cands):
        existing = results[group].get(key, {"outputs": {}})
        outputs = existing.get("outputs", {})
        if len(outputs) >= len(PROMPTS) and "score" in existing:
            continue

        rl.p(f"[{i+1}/{len(all_cands)}] {key}: ops={ops} T={temp}")
        t0 = time.time()
        for prompt in PROMPTS:
            if prompt in outputs:
                continue
            tg0 = time.time()
            cand_outputs = rl.run_candidate(ops, [prompt], MAX_TOKENS, temp, SEED)
            outputs[prompt] = cand_outputs[prompt]
            dt = time.time() - tg0
            rl.p(f"   [{prompt[:30]:<30}] ({dt:.1f}s) :: {outputs[prompt][:80]}")
            results[group][key] = {"ops": ops, "temp": temp, "outputs": outputs}
            rl.save_json(results, OUT)

        cand_texts = [outputs[p] for p in PROMPTS]
        base_texts = [results[baseline_key][p] for p in PROMPTS]
        score = rl.score_candidate(cand_texts, base_texts)
        results[group][key]["score"] = score
        rl.save_json(results, OUT)
        rl.p(f"   score={score['score']} (d={score['distinctiveness']} c={score['coherence']} cl={score['cleanness']} broken={score['broken']}/{score['n']}) [tot {time.time()-t0:.1f}s]")

    for group in ("cynic", "eulogist"):
        rl.p(f"\nPhase 2 — {group} top 8 by score:")
        ranked = sorted(
            results[group].items(),
            key=lambda kv: kv[1].get("score", {}).get("score", 0),
            reverse=True,
        )
        for key, info in ranked[:8]:
            s = info.get("score", {})
            rl.p(f"  {key:<28} score={s.get('score',0):.3f} d={s.get('distinctiveness',0):.2f} c={s.get('coherence',0):.2f} broken={s.get('broken',0)}/{s.get('n',0)}")


if __name__ == "__main__":
    main()

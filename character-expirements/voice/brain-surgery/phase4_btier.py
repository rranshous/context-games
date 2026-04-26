"""Phase 4 — B-tier composite validation.

Bake mourner+nostalgist+observer (and variants) as standalone characters.
Validate at the same depth as the existing 10 chars: 8 prompts × 2 seeds.

Variants:
  - mn: mourner + nostalgist (scale 18:0.5 + scale 19:0.5)
  - mo: mourner + observer (scale 18:0.5 + inject all:0.005)
  - no: nostalgist + observer
  - mno: mourner + nostalgist + observer
  - mn_inj: mourner + nostalgist + lighter inject (all:0.003)
  - mn_18_19_20: mourner + nostalgist + activist (all dampen)
"""

import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

import research_lib as rl

OUT = os.path.join(os.path.dirname(__file__), "phase4-results.json")

VARIANTS = {
    "mn":          [["scale", "18:0.5"], ["scale", "19:0.5"]],
    "mo":          [["scale", "18:0.5"], ["inject", "all:0.005"]],
    "no":          [["scale", "19:0.5"], ["inject", "all:0.005"]],
    "mno":         [["scale", "18:0.5"], ["scale", "19:0.5"], ["inject", "all:0.005"]],
    "mn_inj_low":  [["scale", "18:0.5"], ["scale", "19:0.5"], ["inject", "all:0.003"]],
    "mn_act":      [["scale", "18:0.5"], ["scale", "19:0.5"], ["scale", "20:0.5"]],
}

PROMPTS = [
    "The ocean is",
    "When I was young,",
    "The door opened slowly and",
    "Time is",
    "I remember the day my father",
    "Money is",
    "Death is",
    "You: Hello, who are you?\nMe:",
]

TEMP = 0.7  # observer + b-tier favor warmer
SEEDS = [42, 7]
MAX_TOKENS = 150


def main():
    results = rl.load_json(OUT, default={})

    if "baseline" not in results:
        results["baseline"] = {}
    if "candidates" not in results:
        results["candidates"] = {}

    rl.p(f"Phase 4: {len(VARIANTS)} variants × {len(PROMPTS)} prompts × {len(SEEDS)} seeds = {len(VARIANTS)*len(PROMPTS)*len(SEEDS)} gens")

    # Baselines per seed
    for seed in SEEDS:
        sk = f"seed{seed}"
        if sk not in results["baseline"]:
            rl.p(f"Generating baseline @ seed={seed}...")
            results["baseline"][sk] = rl.run_baseline(PROMPTS, MAX_TOKENS, TEMP, seed)
            rl.save_json(results, OUT)

    for vi, (vname, ops) in enumerate(VARIANTS.items()):
        existing = results["candidates"].get(vname, {"outputs": {}, "scores": {}})
        outputs = existing.get("outputs", {})
        scores = existing.get("scores", {})

        rl.p(f"[{vi+1}/{len(VARIANTS)}] variant={vname}: {ops}")

        for seed in SEEDS:
            sk = f"seed{seed}"
            if sk not in outputs:
                outputs[sk] = {}
            if len(outputs[sk]) >= len(PROMPTS) and sk in scores:
                continue
            t0 = time.time()
            for prompt in PROMPTS:
                if prompt in outputs[sk]:
                    continue
                tg0 = time.time()
                cand = rl.run_candidate(ops, [prompt], MAX_TOKENS, TEMP, seed)
                outputs[sk][prompt] = cand[prompt]
                dt = time.time() - tg0
                rl.p(f"   seed={seed} [{prompt[:30]:<30}] ({dt:.1f}s) :: {outputs[sk][prompt][:80]}")
                results["candidates"][vname] = {"ops": ops, "temp": TEMP, "outputs": outputs, "scores": scores}
                rl.save_json(results, OUT)

            # Score this seed
            cand_texts = [outputs[sk][p] for p in PROMPTS]
            base_texts = [results["baseline"][sk][p] for p in PROMPTS]
            score = rl.score_candidate(cand_texts, base_texts)
            scores[sk] = score
            results["candidates"][vname]["scores"] = scores
            rl.save_json(results, OUT)
            rl.p(f"   seed={seed} score={score['score']} d={score['distinctiveness']} c={score['coherence']} broken={score['broken']}/{score['n']} [tot {time.time()-t0:.1f}s]")

        # Aggregate score
        seed_scores = [scores[sk]["score"] for sk in scores]
        if seed_scores:
            avg = round(sum(seed_scores) / len(seed_scores), 4)
            results["candidates"][vname]["avg_score"] = avg
            rl.save_json(results, OUT)
            rl.p(f"   {vname} avg_score={avg}")

    rl.p("\nPhase 4 — variant ranking by avg_score:")
    ranked = sorted(
        results["candidates"].items(),
        key=lambda kv: kv[1].get("avg_score", 0),
        reverse=True,
    )
    for vname, info in ranked:
        avg = info.get("avg_score", 0)
        per_seed = {sk: round(s["score"], 3) for sk, s in info.get("scores", {}).items()}
        rl.p(f"  {vname:<14} avg={avg:.3f}  per_seed={per_seed}")


if __name__ == "__main__":
    main()

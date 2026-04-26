"""Phase 5 — deep-validate new character candidates from phases 1 and 3.

Each candidate gets 10 prompts × 2 seeds at 200 tokens (matching the
depth used for the existing 10-character roster). Per-candidate temperature
is set based on its phase 1/3 evidence.

Candidates:
  - novelist (scale 24:0.3)         — vivid named-character fiction
  - gothic   (scale 18:0.3)         — temporal/atmospheric (low confidence)
  - fable    (scale 19:0.5)         — multi-gen fairy tale
  - intimate (scale 17:0.5)         — conversational, second-person
  - drama    (scale 18:0.5 + 21:0.5) — period drama (Austen-esque)
"""

import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

import research_lib as rl

OUT = os.path.join(os.path.dirname(__file__), "phase5-results.json")

CANDIDATES = {
    "novelist": {
        "ops": [["scale", "24:0.3"]],
        "temp": 0.5,
    },
    "fable": {
        "ops": [["scale", "19:0.5"]],
        "temp": 0.5,
    },
    "intimate": {
        "ops": [["scale", "17:0.5"]],
        "temp": 0.5,
    },
    "drama": {
        "ops": [["scale", "18:0.5"], ["scale", "21:0.5"]],
        "temp": 0.5,
    },
    "mn_blend": {  # mourner+nostalgist composite from phase 4
        "ops": [["scale", "18:0.5"], ["scale", "19:0.5"]],
        "temp": 0.7,
    },
    "no_blend": {  # nostalgist+observer composite from phase 4
        "ops": [["scale", "19:0.5"], ["inject", "all:0.005"]],
        "temp": 0.7,
    },
}

PROMPTS = [
    "The ocean is",
    "When I was young,",
    "The door opened slowly and",
    "Time is",
    "Money is",
    "Death is",
    "I remember the day my father",
    "The woman in the painting",
    "The letter arrived on Tuesday.",
    "You: Hello, who are you?\nMe:",
]

SEEDS = [42, 7]
MAX_TOKENS = 200


def main():
    results = rl.load_json(OUT, default={})

    if "baseline" not in results:
        results["baseline"] = {}
    if "candidates" not in results:
        results["candidates"] = {}

    rl.p(f"Phase 5: {len(CANDIDATES)} candidates × {len(PROMPTS)} prompts × {len(SEEDS)} seeds = {len(CANDIDATES)*len(PROMPTS)*len(SEEDS)} gens")

    # Baseline per (temp, seed). We only have temp 0.5 here for all candidates.
    needed_temps = sorted(set(c["temp"] for c in CANDIDATES.values()))
    for temp in needed_temps:
        for seed in SEEDS:
            tk = f"T{temp}_seed{seed}"
            if tk not in results["baseline"]:
                rl.p(f"Generating baseline @ {tk}...")
                results["baseline"][tk] = rl.run_baseline(PROMPTS, MAX_TOKENS, temp, seed)
                rl.save_json(results, OUT)

    for ci, (cname, cfg) in enumerate(CANDIDATES.items()):
        ops = cfg["ops"]
        temp = cfg["temp"]
        existing = results["candidates"].get(cname, {"outputs": {}, "scores": {}})
        outputs = existing.get("outputs", {})
        scores = existing.get("scores", {})

        rl.p(f"\n[{ci+1}/{len(CANDIDATES)}] {cname}: ops={ops} T={temp}")

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
                cand = rl.run_candidate(ops, [prompt], MAX_TOKENS, temp, seed)
                outputs[sk][prompt] = cand[prompt]
                dt = time.time() - tg0
                rl.p(f"   seed={seed} [{prompt[:30]:<30}] ({dt:.1f}s) :: {outputs[sk][prompt][:90]}")
                results["candidates"][cname] = {"ops": ops, "temp": temp, "outputs": outputs, "scores": scores}
                rl.save_json(results, OUT)

            cand_texts = [outputs[sk][p] for p in PROMPTS]
            base_key = f"T{temp}_seed{seed}"
            base_texts = [results["baseline"][base_key][p] for p in PROMPTS]
            score = rl.score_candidate(cand_texts, base_texts)
            scores[sk] = score
            results["candidates"][cname]["scores"] = scores
            rl.save_json(results, OUT)
            rl.p(f"   seed={seed} score={score['score']} d={score['distinctiveness']} c={score['coherence']} broken={score['broken']}/{score['n']} [tot {time.time()-t0:.1f}s]")

        # Aggregate
        seed_scores = [scores[sk]["score"] for sk in scores]
        if seed_scores:
            avg = round(sum(seed_scores) / len(seed_scores), 4)
            results["candidates"][cname]["avg_score"] = avg
            rl.save_json(results, OUT)

    rl.p("\nPhase 5 — candidate ranking by avg_score:")
    ranked = sorted(
        results["candidates"].items(),
        key=lambda kv: kv[1].get("avg_score", 0),
        reverse=True,
    )
    for cname, info in ranked:
        avg = info.get("avg_score", 0)
        per_seed = {sk: round(s["score"], 3) for sk, s in info.get("scores", {}).items()}
        broken = {sk: s.get("broken", 0) for sk, s in info.get("scores", {}).items()}
        rl.p(f"  {cname:<10} avg={avg:.3f}  per_seed={per_seed} broken={broken}")


if __name__ == "__main__":
    main()

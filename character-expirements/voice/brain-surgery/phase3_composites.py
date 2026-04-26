"""Phase 3 — 2-layer dampen pair search.

All pairs from {6, 7, 12, 13, 17, 18, 19, 20, 21} at scale 0.5.
36 pairs × 3 prompts = 108 generations.
Looking for novel composite voices like the existing scientist (20+21).
"""

import itertools
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

import research_lib as rl

OUT = os.path.join(os.path.dirname(__file__), "phase3-results.json")

PRODUCTIVE = [6, 7, 12, 13, 17, 18, 19, 20, 21]
SCALE = 0.5
PROMPTS = [
    "The ocean is",
    "When I was young,",
    "The door opened slowly and",
]
TEMP = 0.5
SEED = 42
MAX_TOKENS = 150


def main():
    results = rl.load_json(OUT, default={})

    if "baseline" not in results:
        rl.p("Generating baseline outputs...")
        results["baseline"] = rl.run_baseline(PROMPTS, MAX_TOKENS, TEMP, SEED)
        rl.save_json(results, OUT)

    if "candidates" not in results:
        results["candidates"] = {}

    pairs = list(itertools.combinations(PRODUCTIVE, 2))
    rl.p(f"Phase 3: {len(pairs)} pairs × {len(PROMPTS)} prompts = {len(pairs)*len(PROMPTS)} gens")

    for i, (a, b) in enumerate(pairs):
        key = f"L{a}_L{b}_s{SCALE}"
        existing = results["candidates"].get(key, {"outputs": {}})
        outputs = existing.get("outputs", {})
        if len(outputs) >= len(PROMPTS) and "score" in existing:
            continue

        ops = [["scale", f"{a}:{SCALE}"], ["scale", f"{b}:{SCALE}"]]
        rl.p(f"[{i+1}/{len(pairs)}] {key}")
        t0 = time.time()
        for prompt in PROMPTS:
            if prompt in outputs:
                continue
            tg0 = time.time()
            cand = rl.run_candidate(ops, [prompt], MAX_TOKENS, TEMP, SEED)
            outputs[prompt] = cand[prompt]
            dt = time.time() - tg0
            rl.p(f"   [{prompt[:30]:<30}] ({dt:.1f}s) :: {outputs[prompt][:80]}")
            results["candidates"][key] = {"ops": ops, "outputs": outputs}
            rl.save_json(results, OUT)

        cand_texts = [outputs[p] for p in PROMPTS]
        base_texts = [results["baseline"][p] for p in PROMPTS]
        score = rl.score_candidate(cand_texts, base_texts)
        results["candidates"][key]["score"] = score
        rl.save_json(results, OUT)
        rl.p(f"   score={score['score']} (d={score['distinctiveness']} c={score['coherence']} cl={score['cleanness']} broken={score['broken']}/{score['n']}) [tot {time.time()-t0:.1f}s]")

    rl.p("\nPhase 3 — top 12 composite pairs:")
    ranked = sorted(
        results["candidates"].items(),
        key=lambda kv: kv[1].get("score", {}).get("score", 0),
        reverse=True,
    )
    for key, info in ranked[:12]:
        s = info.get("score", {})
        rl.p(f"  {key:<18} score={s.get('score',0):.3f} d={s.get('distinctiveness',0):.2f} c={s.get('coherence',0):.2f}")


if __name__ == "__main__":
    main()

"""Phase 1 — Layer × scale discovery sweep.

Layers 5..25, scales {0.3, 0.5, 0.7, 1.3, 1.5}, 3 prompts at 150 tok.
~315 generations. Auto-scores each candidate vs baseline.

Resumable: skips candidates already in phase1-results.json.
"""

import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

import research_lib as rl

OUT = os.path.join(os.path.dirname(__file__), "phase1-results.json")

LAYERS = list(range(5, 26))
SCALES = [0.3, 0.5, 0.7, 1.3, 1.5]
PROMPTS = [
    "The ocean is",
    "When I was young,",
    "The door opened slowly and",
]
TEMP = 0.5
SEED = 42
MAX_TOKENS = 150


def candidate_key(layer, scale):
    return f"L{layer}_s{scale}"


def main():
    results = rl.load_json(OUT, default={})
    if "baseline" not in results:
        rl.p("Generating baseline outputs...")
        results["baseline"] = rl.run_baseline(PROMPTS, MAX_TOKENS, TEMP, SEED)
        rl.save_json(results, OUT)

    if "candidates" not in results:
        results["candidates"] = {}

    candidates = [(L, s) for L in LAYERS for s in SCALES]
    total = len(candidates)
    rl.p(f"Phase 1: {total} candidates × {len(PROMPTS)} prompts = {total*len(PROMPTS)} gens")

    for i, (layer, scale) in enumerate(candidates):
        key = candidate_key(layer, scale)
        if key in results["candidates"] and len(results["candidates"][key].get("outputs", {})) >= len(PROMPTS):
            continue

        ops = [["scale", f"{layer}:{scale}"]]
        existing = results["candidates"].get(key, {"outputs": {}})
        outputs = existing.get("outputs", {})

        rl.p(f"[{i+1}/{total}] {key}: scale({layer}:{scale})")
        t0 = time.time()
        for j, prompt in enumerate(PROMPTS):
            if prompt in outputs:
                continue
            tg0 = time.time()
            cand_outputs = rl.run_candidate(ops, [prompt], MAX_TOKENS, TEMP, SEED)
            outputs[prompt] = cand_outputs[prompt]
            dt = time.time() - tg0
            rl.p(f"   [{j+1}/{len(PROMPTS)}] {prompt[:30]:<30} ({dt:.1f}s) :: {outputs[prompt][:80]}")
            results["candidates"][key] = {"ops": ops, "outputs": outputs}
            rl.save_json(results, OUT)

        # Score
        cand_texts = [outputs[p] for p in PROMPTS]
        base_texts = [results["baseline"][p] for p in PROMPTS]
        score = rl.score_candidate(cand_texts, base_texts)
        results["candidates"][key]["score"] = score
        rl.save_json(results, OUT)
        rl.p(f"   score={score['score']} (d={score['distinctiveness']} c={score['coherence']} cl={score['cleanness']} broken={score['broken']}/{score['n']}) [tot {time.time()-t0:.1f}s]")

    rl.p("\nPhase 1 complete. Top 15 by score:")
    ranked = sorted(
        results["candidates"].items(),
        key=lambda kv: kv[1].get("score", {}).get("score", 0),
        reverse=True,
    )
    for key, info in ranked[:15]:
        s = info.get("score", {})
        rl.p(f"  {key:<10} score={s.get('score',0):.3f} d={s.get('distinctiveness',0):.2f} c={s.get('coherence',0):.2f}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Extended refinement sweep: test each character across temps and more prompts.
Goals:
  1. Find best temperature per character (most distinctive, coherent voice)
  2. Re-rate tiers based on consistency across 15 prompts × 3 seeds × 4 temps

Saves results incrementally to refine-results.json. Safe to interrupt and resume.

Usage:
    python refine.py
    python refine.py --output refine-results.json
    python refine.py --chars-only accountant,scientist   # subset
"""

import argparse
import gc
import json
import os
import sys
import time
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL = "Qwen/Qwen2.5-1.5B-Instruct"
CHARS_FILE = os.path.join(os.path.dirname(__file__), "characters.json")
DEFAULT_OUTPUT = os.path.join(os.path.dirname(__file__), "refine-results.json")
MAX_TOKENS = 150
REP_PENALTY = 1.15

TEMPS = [0.3, 0.5, 0.7]
SEEDS = [42]

PROMPTS = [
    "The ocean is",
    "When I was young,",
    "Time is",
    "You: Hello, who are you?\nMe:",
    "You: Tell me something nobody else knows.\nMe:",
    "Money is",
    "I remember the day my father",
    "Death is",
]

BASELINE_TEMP = 0.5


def p(msg):
    print(msg, flush=True)


def save(results, path):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(results, f, indent=2)
    os.replace(tmp, path)


def needs_reload(ops):
    return any(op in ("rm", "noise") for op, _ in ops)


def apply_op(model, op, arg, hooks):
    layers = model.model.layers
    n = len(layers)
    if op == "scale":
        parts = arg.split(":", 1)
        idx, factor = int(parts[0]), float(parts[1])
        def make_hook(f):
            def hook(module, input, output):
                if isinstance(output, tuple):
                    return (output[0] * f,) + output[1:]
                return output * f
            return hook
        h = layers[idx].register_forward_hook(make_hook(factor))
        hooks.append(h)
    elif op == "rm":
        if "-" in arg:
            lo, hi = arg.split("-", 1)
            indices = list(range(int(lo), int(hi) + 1))
        else:
            indices = [int(arg)]
        for idx in sorted(indices, reverse=True):
            del layers[idx]
    elif op == "swap":
        parts = arg.split(",")
        a, b = int(parts[0]), int(parts[1])
        layers[a], layers[b] = layers[b], layers[a]
    elif op == "noise":
        parts = arg.split(":", 1)
        target, scale = parts[0], float(parts[1])
        indices = list(range(n)) if target == "all" else [int(target)]
        with torch.no_grad():
            for idx in indices:
                for param in layers[idx].parameters():
                    param.add_(torch.randn_like(param) * scale)
    elif op == "inject":
        parts = arg.split(":", 1)
        target, scale = parts[0], float(parts[1])
        indices = list(range(n)) if target == "all" else [int(target)]
        def make_inject(s):
            def hook(module, input, output):
                if isinstance(output, tuple):
                    return (output[0] + torch.randn_like(output[0]) * s,) + output[1:]
                return output + torch.randn_like(output) * s
            return hook
        for idx in indices:
            h = layers[idx].register_forward_hook(make_inject(scale))
            hooks.append(h)


def clear_hooks(hooks):
    for h in hooks:
        h.remove()
    hooks.clear()


def undo_ops(model, ops):
    for op, arg in reversed(ops):
        if op == "swap":
            parts = arg.split(",")
            a, b = int(parts[0]), int(parts[1])
            layers = model.model.layers
            layers[a], layers[b] = layers[b], layers[a]


def generate(model, tokenizer, prompt, max_tokens, temp, seed):
    torch.manual_seed(seed)
    inputs = tokenizer(prompt, return_tensors="pt")
    input_len = inputs["input_ids"].shape[1]
    with torch.no_grad():
        out = model.generate(
            **inputs,
            max_new_tokens=max_tokens,
            temperature=max(temp, 0.01),
            do_sample=True,
            top_p=0.9,
            repetition_penalty=REP_PENALTY,
            pad_token_id=tokenizer.eos_token_id,
        )
    text = tokenizer.decode(out[0][input_len:], skip_special_tokens=True)
    return text.strip()


def is_done(results, name, temp_key, prompt, n_seeds):
    return (name in results
            and temp_key in results[name]
            and prompt in results[name][temp_key]
            and len(results[name][temp_key][prompt]) >= n_seeds)


def score_text(text):
    """Heuristic quality score: length + no repetition penalty."""
    words = text.split()
    if not words:
        return 0.0
    unique_ratio = len(set(words)) / len(words)
    length_score = min(len(words) / 60, 1.0)  # caps at ~60 words
    return unique_ratio * length_score


def analyze(results, characters):
    """For each character, find best temp and compute consistency score."""
    analysis = {}
    for name, cfg in characters.items():
        if name == "baseline":
            continue
        if name not in results:
            analysis[name] = {"best_temp": cfg.get("temp", 0.5), "avg_score": 0.0, "tier": cfg.get("tier", "?")}
            continue

        best_temp = None
        best_score = -1.0

        for temp in TEMPS:
            temp_key = str(temp)
            if temp_key not in results[name]:
                continue
            scores = []
            for prompt in PROMPTS:
                if prompt not in results[name][temp_key]:
                    continue
                for text in results[name][temp_key][prompt]:
                    scores.append(score_text(text))
            if not scores:
                continue
            avg = sum(scores) / len(scores)
            if avg > best_score:
                best_score = avg
                best_temp = temp

        analysis[name] = {
            "best_temp": best_temp or cfg.get("temp", 0.5),
            "avg_score": round(best_score, 3),
        }

    return analysis


def print_summary(results, characters):
    p("")
    p("=" * 100)
    p("REFINEMENT SUMMARY")
    p("=" * 100)

    analysis = analyze(results, characters)

    # For each character, show best temp and sample outputs at best temp
    for name, info in analysis.items():
        cfg = characters.get(name, {})
        old_temp = cfg.get("temp", 0.5)
        best_temp = info["best_temp"]
        changed = " ***" if best_temp != old_temp else ""
        p(f"\n  {name:<13s}  old T={old_temp}  best T={best_temp}{changed}  score={info['avg_score']}")

        temp_key = str(best_temp)
        if name in results and temp_key in results[name]:
            # Show one sample per prompt at best temp, seed=42
            for prompt in PROMPTS[:4]:  # just top 4 for readability
                if prompt in results[name][temp_key] and results[name][temp_key][prompt]:
                    sample = results[name][temp_key][prompt][0]
                    p(f"    [{prompt[:30]}...] {sample[:120]}")

    return analysis


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    parser.add_argument("--chars-only", default="", help="Comma-separated subset of character names")
    args = parser.parse_args()

    with open(CHARS_FILE) as f:
        characters = json.load(f)

    subset = set(args.chars_only.split(",")) if args.chars_only else None

    # Load existing results
    results = {}
    if os.path.exists(args.output):
        try:
            with open(args.output) as f:
                results = json.load(f)
            p(f"Resuming — loaded {sum(len(v) for v in results.values())} temp-blocks from {args.output}")
        except Exception as e:
            p(f"Warning: couldn't load {args.output}: {e}. Starting fresh.")

    p(f"Loading {MODEL}...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL)

    def fresh_model():
        m = AutoModelForCausalLM.from_pretrained(
            MODEL, torch_dtype=torch.float16, device_map="cpu", low_cpu_mem_usage=True,
        )
        m.eval()
        return m

    base_model = fresh_model()
    n_layers = len(base_model.model.layers)
    p(f"Loaded — {n_layers} layers.")

    n_prompts = len(PROMPTS)
    n_seeds = len(SEEDS)
    n_temps = len(TEMPS)

    # Build work list — skip baseline (no ops, just use a fixed temp)
    all_configs = [(n, cfg) for n, cfg in characters.items() if n != "baseline"]
    if subset:
        all_configs = [(n, cfg) for n, cfg in all_configs if n in subset]

    total = len(all_configs) * n_temps * n_prompts * n_seeds
    p(f"Plan: {len(all_configs)} chars × {n_temps} temps × {n_prompts} prompts × {n_seeds} seeds = {total} generations")

    for ci, (name, config) in enumerate(all_configs):
        ops = [tuple(op) for op in config["ops"]]
        ops_str = " + ".join(f"{op}({arg})" for op, arg in ops) or "(baseline)"

        p("")
        p("=" * 100)
        p(f"[{ci+1}/{len(all_configs)}] {name} | {ops_str}")
        p("=" * 100)

        if name not in results:
            results[name] = {}

        for temp in TEMPS:
            temp_key = str(temp)
            if temp_key not in results[name]:
                results[name][temp_key] = {}

            # Check if fully done at this temp
            if all(is_done(results, name, temp_key, pr, n_seeds) for pr in PROMPTS):
                p(f"  T={temp}: (all done, skipping)")
                continue

            p(f"  T={temp}:")

            hooks = []
            if needs_reload(ops):
                model = fresh_model()
            else:
                model = base_model
            clear_hooks(hooks)
            for op, arg in ops:
                apply_op(model, op, arg, hooks)

            for prompt in PROMPTS:
                if prompt not in results[name][temp_key]:
                    results[name][temp_key][prompt] = []

                cached = len(results[name][temp_key][prompt])
                if cached >= n_seeds:
                    continue

                for si, seed in enumerate(SEEDS):
                    if si < cached:
                        continue
                    t0 = time.time()
                    text = generate(model, tokenizer, prompt, MAX_TOKENS, temp, seed)
                    dt = time.time() - t0
                    results[name][temp_key][prompt].append(text)
                    p(f"    [{prompt[:35]:<35s}] seed={seed} ({dt:.1f}s): {text[:90]}")

                save(results, args.output)

            clear_hooks(hooks)
            if model is base_model:
                undo_ops(model, ops)
            else:
                del model
                gc.collect()

        p(f"  {name} done.")

    analysis = print_summary(results, characters)
    save(results, args.output)
    p(f"\nResults saved to {args.output}")

    # Write analysis JSON for easy consumption
    analysis_path = args.output.replace(".json", "-analysis.json")
    with open(analysis_path, "w") as f:
        json.dump(analysis, f, indent=2)
    p(f"Analysis saved to {analysis_path}")


if __name__ == "__main__":
    main()

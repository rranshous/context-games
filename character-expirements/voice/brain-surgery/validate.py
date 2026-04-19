#!/usr/bin/env python3
"""
Phase 2: Deep validation of character finalists.
Tests each character across many prompts, multiple seeds, and at its best temperature.
Phase 3: Cross-character distinctiveness comparison.

Saves results incrementally to validate-results.json so it's safe to interrupt and resume.
Skips work already present in the output file when re-run.

Usage:
    python validate.py --characters-file characters.json
    python validate.py --output validate-results-qwen.json
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
MAX_TOKENS = 200
REP_PENALTY = 1.15
SEEDS = [42, 137]

PROMPTS = [
    "The ocean is",
    "She looked out the window and",
    "I walked into the room and",
    "The door opened slowly and",
    "When I was young,",
    "The hardest thing I ever did was",
    "The most important thing about",
    "Time is",
    "You: Hello, who are you?\nMe:",
    "You: Tell me something nobody else knows.\nMe:",
]

DEFAULT_OUTPUT = "validate-results-qwen.json"


_hooks = []

def apply_op(model, op, arg):
    global _hooks
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
        _hooks.append(h)
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
            _hooks.append(h)


def clear_hooks():
    global _hooks
    for h in _hooks:
        h.remove()
    _hooks = []


def needs_reload(ops):
    return any(op in ("rm", "swap", "noise") for op, _ in ops)


def generate(model, tokenizer, prompt, max_tokens, temp, seed):
    torch.manual_seed(seed)
    inputs = tokenizer(prompt, return_tensors="pt")
    input_len = inputs["input_ids"].shape[1]
    with torch.no_grad():
        out = model.generate(
            **inputs,
            max_new_tokens=max_tokens,
            temperature=temp if temp > 0 else 0.01,
            do_sample=True,
            top_p=0.9,
            repetition_penalty=REP_PENALTY,
            pad_token_id=tokenizer.eos_token_id,
        )
    text = tokenizer.decode(out[0][input_len:], skip_special_tokens=True)
    return text.strip()


def is_done(results, name, prompt, n_seeds):
    return (name in results
            and prompt in results[name]
            and len(results[name][prompt]) >= n_seeds)


def save(results, path):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(results, f, indent=2)
    os.replace(tmp, path)


def pstatus(msg):
    print(msg, flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--characters-file", required=True)
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    with open(args.characters_file) as f:
        characters = json.load(f)

    # Load existing results to resume
    results = {}
    if os.path.exists(args.output):
        try:
            with open(args.output) as f:
                results = json.load(f)
            pstatus(f"Resuming — loaded {len(results)} characters from {args.output}")
        except Exception as e:
            pstatus(f"Warning: couldn't load {args.output}: {e}. Starting fresh.")
            results = {}

    pstatus(f"Loading model {MODEL}...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL)

    def fresh_model():
        m = AutoModelForCausalLM.from_pretrained(
            MODEL, torch_dtype=torch.float16, device_map="cpu", low_cpu_mem_usage=True,
        )
        m.eval()
        return m

    base_model = fresh_model()
    n_layers = len(base_model.model.layers)
    pstatus(f"Loaded — {n_layers} layers.")

    n_prompts = len(PROMPTS)
    n_seeds = len(SEEDS)

    # Build work list: baseline + each character
    all_configs = [("baseline", {"ops": [], "temp": 0.5, "description": "baseline"})]
    for name, cfg in characters.items():
        if name == "baseline":
            continue  # already added
        all_configs.append((name, cfg))

    total = len(all_configs) * n_prompts * n_seeds
    done_before = sum(len(results.get(n, {}).get(p, [])) for n, _ in all_configs for p in PROMPTS)
    pstatus(f"Plan: {len(all_configs)} characters × {n_prompts} prompts × {n_seeds} seeds = {total} generations")
    pstatus(f"Already done: {done_before}/{total}")

    for ci, (name, config) in enumerate(all_configs):
        ops = [tuple(op) for op in config["ops"]]
        temp = config.get("temp", 0.5)
        desc = config.get("description", "")
        ops_str = " + ".join(f"{op}({arg})" for op, arg in ops) or "(baseline)"

        pstatus("")
        pstatus("=" * 100)
        pstatus(f"[{ci+1}/{len(all_configs)}] {name} | {ops_str} | T={temp}")
        pstatus("=" * 100)

        if name not in results:
            results[name] = {}

        # Check if fully done
        if all(is_done(results, name, p, n_seeds) for p in PROMPTS):
            pstatus("  (already done, skipping)")
            continue

        for prompt in PROMPTS:
            if prompt not in results[name]:
                results[name][prompt] = []

            pstatus(f'  "{prompt[:60]}"')
            for si, seed in enumerate(SEEDS):
                if si < len(results[name][prompt]):
                    pstatus(f"    seed={seed}: (cached)")
                    continue

                if needs_reload(ops):
                    model = fresh_model()
                else:
                    model = base_model
                clear_hooks()

                for op, arg in ops:
                    apply_op(model, op, arg)

                t0 = time.time()
                text = generate(model, tokenizer, prompt, MAX_TOKENS, temp, seed)
                dt = time.time() - t0

                results[name][prompt].append(text)
                pstatus(f"    seed={seed}: ({dt:.1f}s) {text[:110]}")

                clear_hooks()

                if needs_reload(ops):
                    del model
                    gc.collect()

            # Save after each prompt (checkpoint)
            save(results, args.output)

        # After character done, ensure we're clean
        clear_hooks()
        gc.collect()

    # ==================== PHASE 3: DISTINCTIVENESS ====================
    pstatus("")
    pstatus("=" * 100)
    pstatus("DISTINCTIVENESS COMPARISON — same prompt, seed=42, all characters")
    pstatus("=" * 100)

    comparison_prompts = [
        "The ocean is",
        "I walked into the room and",
        "When I was young,",
        "Time is",
        "The door opened slowly and",
    ]

    for prompt in comparison_prompts:
        pstatus(f'\n  "{prompt}"')
        for name, _ in all_configs:
            if name in results and prompt in results[name] and results[name][prompt]:
                text = results[name][prompt][0]
                pstatus(f"    {name:>15s}: {text[:100]}")

    save(results, args.output)
    pstatus(f"\nDone. Results saved to {args.output}")


if __name__ == "__main__":
    main()

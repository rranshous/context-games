#!/usr/bin/env python3
"""
Phase 2: Deep validation of character finalists.
Tests each character across many prompts, multiple seeds, and at its best temperature.
Phase 3: Cross-character distinctiveness comparison.

Usage:
    python validate.py                    # Run validation
    python validate.py --characters-file characters.json  # Use custom character file
"""

import copy
import json
import sys
import time
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL = "Qwen/Qwen2.5-1.5B-Instruct"
MAX_TOKENS = 200
REP_PENALTY = 1.15
SEEDS = [42, 137]

# Diverse prompts spanning many registers/domains
PROMPTS = [
    # Descriptive / scene-setting
    "The ocean is",
    "She looked out the window and",

    # Action / narrative
    "I walked into the room and",
    "The door opened slowly and",

    # Personal / reflective
    "When I was young,",
    "The hardest thing I ever did was",

    # Abstract / philosophical
    "The most important thing about",
    "Time is",

    # Dialogue / conversational
    "You: Hello, who are you?\nMe:",
    "You: Tell me something nobody else knows.\nMe:",
]

# Characters will be loaded from characters.json or use defaults
DEFAULT_CHARACTERS = {
    "dreamer": {
        "ops": [["scale", "11:0.5"]],
        "temp": 0.5,
        "description": "Terse, cinematic, gothic. Leaves space."
    },
    "poet": {
        "ops": [["scale", "5:1.3"], ["scale", "6:1.3"], ["scale", "7:1.3"],
                ["scale", "14:0.7"], ["scale", "15:0.7"], ["scale", "16:0.7"]],
        "temp": 0.3,
        "description": "Lyric, confessional, melancholy."
    },
    "verse": {
        "ops": [["inject", "all:0.01"]],
        "temp": 0.7,
        "description": "Philosophical elder, reflective."
    },
    "storyteller": {
        "ops": [["swap", "5,13"]],
        "temp": 0.3,
        "description": "Fairy tale, personifies, magical."
    },
}


_hooks = []

def apply_op(model, op, arg, seed=None):
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


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--characters-file", default=None)
    args = parser.parse_args()

    if args.characters_file:
        with open(args.characters_file) as f:
            characters = json.load(f)
    else:
        characters = DEFAULT_CHARACTERS

    print("Loading model...", file=sys.stderr)
    tokenizer = AutoTokenizer.from_pretrained(MODEL)

    def fresh_model():
        m = AutoModelForCausalLM.from_pretrained(
            MODEL, torch_dtype=torch.float16, device_map="cpu", low_cpu_mem_usage=True,
        )
        m.eval()
        return m

    base_model = fresh_model()
    n_layers = len(base_model.model.layers)
    print(f"Loaded — {n_layers} layers.\n", file=sys.stderr)

    n_chars = len(characters)
    n_prompts = len(PROMPTS)
    n_seeds = len(SEEDS)
    total_gens = (1 + n_chars) * n_prompts * n_seeds
    print(f"Plan: {n_chars} characters + baseline × {n_prompts} prompts × {n_seeds} seeds = {total_gens} generations", file=sys.stderr)

    results = {}  # {name: {prompt: [text_per_seed]}}

    # ==================== PHASE 2: BASELINE ====================
    print("=" * 120)
    print(f"{'BASELINE':^120}")
    print("=" * 120)
    results["baseline"] = {}
    for prompt in PROMPTS:
        results["baseline"][prompt] = []
        print(f'\n  "{prompt}"')
        for seed in SEEDS:
            text = generate(base_model, tokenizer, prompt, MAX_TOKENS, 0.5, seed)
            results["baseline"][prompt].append(text)
            print(f"    seed={seed}: {text[:110]}")

    # ==================== PHASE 2: EACH CHARACTER ====================
    for ci, (name, config) in enumerate(characters.items()):
        ops = [tuple(op) for op in config["ops"]]
        temp = config.get("temp", 0.5)
        desc = config.get("description", "")

        print(f"\n{'=' * 120}")
        ops_str = " + ".join(f"{op}({arg})" for op, arg in ops)
        print(f"{name.upper():^120}")
        print(f"{ops_str:^120}")
        print(f"T={temp}  |  {desc}")
        print("=" * 120)

        results[name] = {}

        for prompt in PROMPTS:
            results[name][prompt] = []
            print(f'\n  "{prompt}"')
            for seed in SEEDS:
                if needs_reload(ops):
                    model = fresh_model()
                else:
                    model = base_model
                clear_hooks()

                for op, arg in ops:
                    apply_op(model, op, arg, seed=seed)

                text = generate(model, tokenizer, prompt, MAX_TOKENS, temp, seed)
                results[name][prompt].append(text)
                print(f"    seed={seed}: {text[:110]}")

                clear_hooks()

        print(f"  [{ci+1}/{n_chars}]", file=sys.stderr)

    # ==================== PHASE 3: DISTINCTIVENESS ====================
    print(f"\n\n{'=' * 120}")
    print(f"{'DISTINCTIVENESS COMPARISON':^120}")
    print("=" * 120)
    print("\nSame prompt, same seed, all characters side by side:\n")

    comparison_prompts = [
        "The ocean is",
        "I walked into the room and",
        "When I was young,",
        "Time is",
        "The door opened slowly and",
    ]

    for prompt in comparison_prompts:
        print(f'  "{prompt}"')
        for name in ["baseline"] + list(characters.keys()):
            if prompt in results[name]:
                text = results[name][prompt][0]  # first seed
                print(f"    {name:>15s}: {text[:100]}")
        print()

    # Save raw results
    with open("validate-results.json", "w") as f:
        json.dump(results, f, indent=2)

    print("\nDone. Results saved to validate-results.json", file=sys.stderr)


if __name__ == "__main__":
    main()

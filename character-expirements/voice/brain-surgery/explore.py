#!/usr/bin/env python3
"""
Exploration Phase for Qwen2.5-1.5B.
Targeted based on layer-mapping findings: focus on dampening (where voices live),
test different magnitudes, try multi-layer combos.
"""

import copy
import sys
import time
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL = "Qwen/Qwen2.5-1.5B-Instruct"
SEED = 42
MAX_TOKENS = 180
TEMP = 0.5
REP_PENALTY = 1.15

PROMPTS = [
    "The ocean is",
    "I walked into the room and",
    "When I was young,",
]

# Candidates: name, [(op, arg), ...]
CANDIDATES = [
    # === SINGLE LAYER DAMPEN — mapping found these interesting ===
    ("surreal",      [("scale", "6:0.5")]),        # "smoke in the aisles"
    ("cynic",        [("scale", "7:0.5")]),        # "symbol of poverty, ignorance"
    ("environ",      [("scale", "12:0.5")]),       # pollution/concerned
    ("geologist",    [("scale", "13:0.5")]),       # "oldest rocks... sediments"
    ("poet",         [("scale", "17:0.5")]),       # "eyes feel like they were about to burst"
    ("tragic",       [("scale", "18:0.5")]),       # "heart sank when I heard"
    ("nostalgist",   [("scale", "19:0.5")]),       # "saw my grandmother reading a magazine"
    ("activist",     [("scale", "20:0.5")]),       # climate/global warming
    ("resourceful",  [("scale", "21:0.5")]),       # "most important of our natural resources"

    # === SAME LAYERS AT DIFFERENT MAGNITUDES ===
    ("surreal-deep",     [("scale", "6:0.2")]),
    ("surreal-light",    [("scale", "6:0.7")]),
    ("poet-deep",        [("scale", "17:0.2")]),
    ("poet-light",       [("scale", "17:0.7")]),
    ("nostalgist-deep",  [("scale", "19:0.2")]),
    ("nostalgist-light", [("scale", "19:0.7")]),
    ("activist-deep",    [("scale", "20:0.2")]),

    # === VERY EARLY DAMPEN (unexplored) ===
    ("damp-2", [("scale", "2:0.5")]),
    ("damp-3", [("scale", "3:0.5")]),
    ("damp-4", [("scale", "4:0.5")]),

    # === EXTREME AMP (a few, since mostly stock-output) ===
    ("amp-5-strong",  [("scale", "5:2.0")]),
    ("amp-13-strong", [("scale", "13:2.0")]),

    # === MULTI-LAYER COMBOS (strengthen region effects) ===
    # Double dampen neighbors — strengthens the regional voice
    ("tragic-pair",     [("scale", "17:0.5"), ("scale", "18:0.5")]),  # vivid+tragic
    ("eco-pair",        [("scale", "20:0.5"), ("scale", "21:0.5")]),  # climate+resources
    ("early-pair",      [("scale", "6:0.5"), ("scale", "7:0.5")]),    # surreal+cynic
    ("memory-pair",     [("scale", "13:0.5"), ("scale", "19:0.5")]),  # geology+nostalgia
    ("triple-eco",      [("scale", "19:0.5"), ("scale", "20:0.5"), ("scale", "21:0.5")]),
    ("triple-voice",    [("scale", "6:0.5"), ("scale", "12:0.5"), ("scale", "19:0.5")]),

    # === OPPOSING GRADIENTS ===
    ("early-amp-late-damp", [("scale", "6:1.3"), ("scale", "7:1.3"), ("scale", "20:0.7"), ("scale", "21:0.7")]),
    ("early-damp-late-amp", [("scale", "6:0.7"), ("scale", "7:0.7"), ("scale", "20:1.3"), ("scale", "21:1.3")]),

    # === SWAPS — test if they still shift voice in Qwen ===
    ("swap-7-17",  [("swap", "7,17")]),
    ("swap-6-19",  [("swap", "6,19")]),
    ("swap-12-20", [("swap", "12,20")]),
    ("swap-13-22", [("swap", "13,22")]),
    ("swap-5-18",  [("swap", "5,18")]),
    ("swap-10-20", [("swap", "10,20")]),

    # === SWAP + SCALE HYBRIDS ===
    ("swap6-19+damp20", [("swap", "6,19"), ("scale", "20:0.7")]),
    ("swap7-17+damp19", [("swap", "7,17"), ("scale", "19:0.7")]),

    # === INJECTION (worked interestingly on TinyLlama) ===
    ("inject-tiny",   [("inject", "all:0.005")]),
    ("inject-small",  [("inject", "all:0.01")]),
    ("inject-focal",  [("inject", "13:0.05")]),

    # === REMOVE (load-bearing in middle?) ===
    ("rm-17", [("rm", "17")]),
    ("rm-19", [("rm", "19")]),
    ("rm-13", [("rm", "13")]),
]

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
    print("Loading model...", file=sys.stderr)
    tokenizer = AutoTokenizer.from_pretrained(MODEL)

    def fresh_model():
        m = AutoModelForCausalLM.from_pretrained(
            MODEL, torch_dtype=torch.float16, device_map="cpu", low_cpu_mem_usage=True,
        )
        m.eval()
        return m

    base_model = fresh_model()
    print(f"Loaded — {len(base_model.model.layers)} layers.\n", file=sys.stderr)

    # Baseline
    print("=" * 140)
    print(f"{'BASELINE':^140}")
    print("=" * 140)
    for prompt in PROMPTS:
        text = generate(base_model, tokenizer, prompt, MAX_TOKENS, TEMP, SEED)
        print(f'  "{prompt}"')
        print(f"    {text[:220]}")
        print()

    total = len(CANDIDATES)
    for ci, (name, ops) in enumerate(CANDIDATES):
        if needs_reload(ops):
            model = fresh_model()
        else:
            model = base_model
        clear_hooks()

        for op, arg in ops:
            apply_op(model, op, arg)

        ops_str = " + ".join(f"{op}({arg})" for op, arg in ops)
        print("=" * 140)
        print(f"{name:^140}")
        print(f"{ops_str:^140}")
        print("=" * 140)
        for prompt in PROMPTS:
            text = generate(model, tokenizer, prompt, MAX_TOKENS, TEMP, SEED)
            print(f'  "{prompt}"')
            print(f"    {text[:220]}")
            print()

        clear_hooks()
        if needs_reload(ops):
            del model
        print(f"  [{ci+1}/{total}]", file=sys.stderr)

    print(f"\nDone — {total} candidates tested.", file=sys.stderr)

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Resume exploration from where explore.py crashed.
Only tests the remaining swap-based candidates.
"""

import copy
import sys
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL = "TinyLlama/TinyLlama-1.1B-Chat-v1.0"
SEED = 42
MAX_TOKENS = 60
TEMP = 0.5

PROMPTS = [
    "The ocean is",
    "I walked into the room and",
    "When I was young,",
]

# Remaining candidates (all need fresh model reloads)
CANDIDATES = [
    ("swap5-13+damp11", [("swap", "5,13"), ("scale", "11:0.5")]),
    ("swap9-13+damp11", [("swap", "9,13"), ("scale", "11:0.7")]),
    ("swap10-12+amp7",  [("swap", "10,12"), ("scale", "7:1.3")]),
    ("swap6-13+damp10", [("swap", "6,13"), ("scale", "10:0.6")]),
    ("swap-5-10",  [("swap", "5,10")]),
    ("swap-6-12",  [("swap", "6,12")]),
    ("swap-6-15",  [("swap", "6,15")]),
    ("swap-9-16",  [("swap", "9,16")]),
    ("swap-12-15", [("swap", "12,15")]),
    ("swap-13-16", [("swap", "13,16")]),
    ("dswap-5-13-7-15", [("swap", "5,13"), ("swap", "7,15")]),
    ("dswap-6-12-9-15", [("swap", "6,12"), ("swap", "9,15")]),
    ("dswap-7-11-9-13", [("swap", "7,11"), ("swap", "9,13")]),
    ("rm11+damp9", [("rm", "11"), ("scale", "9:0.7")]),
    ("rm11+amp7",  [("rm", "11"), ("scale", "7:1.3")]),
    ("rm10-12+amp5", [("rm", "10-12"), ("scale", "5:1.3")]),
]

_hooks = []

def apply_op(model, op, arg):
    global _hooks
    layers = model.model.layers

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


def clear_hooks():
    global _hooks
    for h in _hooks:
        h.remove()
    _hooks = []


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
            pad_token_id=tokenizer.eos_token_id,
        )
    text = tokenizer.decode(out[0][input_len:], skip_special_tokens=True)
    return text.strip()


def fresh_model():
    m = AutoModelForCausalLM.from_pretrained(
        MODEL, torch_dtype=torch.float16, device_map="cpu", low_cpu_mem_usage=True,
    )
    m.eval()
    return m


def main():
    print("Loading tokenizer...", file=sys.stderr)
    tokenizer = AutoTokenizer.from_pretrained(MODEL)

    total = len(CANDIDATES)
    for ci, (name, ops) in enumerate(CANDIDATES):
        model = fresh_model()
        clear_hooks()

        for op, arg in ops:
            apply_op(model, op, arg)

        ops_str = " + ".join(f"{op}({arg})" for op, arg in ops)
        print(f"{name:>25s} | {ops_str}")
        for prompt in PROMPTS:
            text = generate(model, tokenizer, prompt, MAX_TOKENS, TEMP, SEED)
            print(f"  {prompt:<35s} {text[:100]}")

        clear_hooks()
        del model  # free memory before next fresh load

        print(f"  [{ci+1}/{total}]", file=sys.stderr)

    print(f"\nDone — {total} candidates tested.", file=sys.stderr)


if __name__ == "__main__":
    main()

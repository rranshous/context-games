#!/usr/bin/env python3
"""
Generate a showcase sample from each character on a few topics.
Usage: python showcase.py
"""

import copy
import json
import os
import sys
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL = "Qwen/Qwen2.5-1.5B-Instruct"
CHARS_FILE = os.path.join(os.path.dirname(__file__), "characters.json")
REP_PENALTY = 1.15
MAX_TOKENS = 250
SEED = 42

TOPICS = [
    "The ocean is",
    "When I was young,",
    "Love is",
]

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
            hooks.append(h)

def clear_hooks(hooks):
    for h in hooks:
        h.remove()
    hooks.clear()

def undo_swap(model, ops):
    for op, arg in reversed(ops):
        if op == "swap":
            parts = arg.split(",")
            a, b = int(parts[0]), int(parts[1])
            layers = model.model.layers
            layers[a], layers[b] = layers[b], layers[a]

def needs_clone(ops):
    return any(op in ("rm", "noise") for op, _ in ops)

def generate(model, tokenizer, prompt, temp, seed):
    torch.manual_seed(seed)
    inputs = tokenizer(prompt, return_tensors="pt")
    input_len = inputs["input_ids"].shape[1]
    with torch.no_grad():
        out = model.generate(
            **inputs,
            max_new_tokens=MAX_TOKENS,
            temperature=max(temp, 0.01),
            do_sample=True,
            top_p=0.9,
            repetition_penalty=REP_PENALTY,
            pad_token_id=tokenizer.eos_token_id,
        )
    return tokenizer.decode(out[0][input_len:], skip_special_tokens=True).strip()


def main():
    with open(CHARS_FILE) as f:
        characters = json.load(f)

    print(f"Loading {MODEL}...", flush=True)
    tokenizer = AutoTokenizer.from_pretrained(MODEL)
    base_model = AutoModelForCausalLM.from_pretrained(
        MODEL, dtype=torch.float16, device_map="cpu", low_cpu_mem_usage=True,
    )
    base_model.eval()
    print(f"Loaded — {len(base_model.model.layers)} layers\n", flush=True)

    DIVIDER = "=" * 72

    for name, cfg in characters.items():
        tier = cfg.get("tier", "?")
        temp = cfg.get("temp", 0.5)
        ops = [tuple(op) for op in cfg["ops"]]

        print(f"\n{DIVIDER}")
        print(f"  {name.upper()}  [Tier {tier}]  T={temp}")
        print(DIVIDER)

        hooks = []
        if needs_clone(ops):
            model = copy.deepcopy(base_model)
        else:
            model = base_model

        for op, arg in ops:
            apply_op(model, op, arg, hooks)

        for topic in TOPICS:
            text = generate(model, tokenizer, topic, temp, SEED)
            print(f"\n  >>> {topic}")
            # word-wrap at 70 chars
            words = (topic + text).split()
            line, out_lines = [], []
            for w in words:
                if len(" ".join(line + [w])) > 70:
                    out_lines.append("  " + " ".join(line))
                    line = [w]
                else:
                    line.append(w)
            if line:
                out_lines.append("  " + " ".join(line))
            print("\n".join(out_lines))

        clear_hooks(hooks)
        if model is base_model:
            undo_swap(model, ops)

    print(f"\n{DIVIDER}")
    print("  done.")


if __name__ == "__main__":
    main()

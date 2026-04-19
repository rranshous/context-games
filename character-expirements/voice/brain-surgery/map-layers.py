#!/usr/bin/env python3
"""
Map which layers in Qwen2.5-1.5B affect voice the most.
Scale each middle layer at 0.5x and 1.5x, generate on 2 prompts.
"""

import sys
import time
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL = "Qwen/Qwen2.5-1.5B-Instruct"
SEED = 42
MAX_TOKENS = 150
TEMP = 0.5
REP_PENALTY = 1.15

PROMPTS = [
    "The ocean is",
    "I walked into the room and",
]

# Layers to test — skip very early (0-4) and very late (23-27) since those are load-bearing
LAYER_RANGE = range(5, 23)  # 5 through 22
FACTORS = [0.5, 1.5]

_hooks = []

def apply_scale(model, idx, factor):
    global _hooks
    def hook(module, input, output):
        if isinstance(output, tuple):
            return (output[0] * factor,) + output[1:]
        return output * factor
    h = model.model.layers[idx].register_forward_hook(hook)
    _hooks.append(h)

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
            temperature=temp,
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
    model = AutoModelForCausalLM.from_pretrained(
        MODEL, torch_dtype=torch.float16, device_map="cpu", low_cpu_mem_usage=True,
    )
    model.eval()
    n_layers = len(model.model.layers)
    print(f"Loaded — {n_layers} layers.\n", file=sys.stderr)

    # Baseline first
    print("=" * 120)
    print(f"{'BASELINE':^120}")
    print("=" * 120)
    for prompt in PROMPTS:
        text = generate(model, tokenizer, prompt, MAX_TOKENS, TEMP, SEED)
        print(f'  "{prompt}"')
        print(f"    {text[:180]}")
        print()

    total = len(LAYER_RANGE) * len(FACTORS)
    count = 0
    for factor in FACTORS:
        tag = "DAMP" if factor < 1 else "AMP"
        for layer in LAYER_RANGE:
            count += 1
            clear_hooks()
            apply_scale(model, layer, factor)

            print("=" * 120)
            print(f"{tag} L{layer} @ {factor}x   [{count}/{total}]".center(120))
            print("=" * 120)
            for prompt in PROMPTS:
                text = generate(model, tokenizer, prompt, MAX_TOKENS, TEMP, SEED)
                print(f'  "{prompt}"')
                print(f"    {text[:180]}")
                print()
            clear_hooks()
            print(f"  [{count}/{total}]", file=sys.stderr)

    print("\nDone.", file=sys.stderr)

if __name__ == "__main__":
    main()

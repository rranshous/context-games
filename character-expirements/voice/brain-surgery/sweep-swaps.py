#!/usr/bin/env python3
"""
Sweep all single-swap combos in the middle layers and collect results.
Outputs a comparison table.
"""

import copy
import sys
import time
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL = "TinyLlama/TinyLlama-1.1B-Chat-v1.0"
PROMPT = "The ocean is"
SEED = 42
MAX_TOKENS = 80
TEMP = 0.7

# middle layer range to sweep (inclusive)
LO = 5
HI = 16

def generate(model, tokenizer, prompt, max_tokens, temp, seed):
    torch.manual_seed(seed)
    inputs = tokenizer(prompt, return_tensors="pt")
    input_len = inputs["input_ids"].shape[1]
    t0 = time.time()
    with torch.no_grad():
        out = model.generate(
            **inputs,
            max_new_tokens=max_tokens,
            temperature=temp,
            do_sample=True,
            top_p=0.9,
            pad_token_id=tokenizer.eos_token_id,
        )
    dt = time.time() - t0
    n_tokens = out.shape[1] - input_len
    text = tokenizer.decode(out[0][input_len:], skip_special_tokens=True)
    tps = n_tokens / dt if dt > 0 else 0
    return text.strip(), tps

def main():
    print(f"Loading model...", file=sys.stderr)
    tokenizer = AutoTokenizer.from_pretrained(MODEL)
    base_model = AutoModelForCausalLM.from_pretrained(
        MODEL, torch_dtype=torch.float16, device_map="cpu", low_cpu_mem_usage=True,
    )
    base_model.eval()
    n_layers = len(base_model.model.layers)
    print(f"Loaded — {n_layers} layers. Sweeping swaps [{LO}-{HI}].\n", file=sys.stderr)

    # baseline
    text, tps = generate(base_model, tokenizer, PROMPT, MAX_TOKENS, TEMP, SEED)
    print(f"{'BASELINE':>12s} | {tps:4.1f} t/s | {text[:120]}")
    print("-" * 140)

    # all swap pairs in range
    pairs = [(i, j) for i in range(LO, HI + 1) for j in range(i + 1, HI + 1)]
    total = len(pairs)

    for idx, (a, b) in enumerate(pairs):
        # deep copy just the layers list
        model = copy.deepcopy(base_model)
        model.model.layers[a], model.model.layers[b] = model.model.layers[b], model.model.layers[a]

        text, tps = generate(model, tokenizer, PROMPT, MAX_TOKENS, TEMP, SEED)

        # flag if output looks broken (repetition detection)
        words = text.split()
        if len(words) > 5:
            from collections import Counter
            c = Counter(words)
            most_common_pct = c.most_common(1)[0][1] / len(words)
        else:
            most_common_pct = 0

        flag = ""
        if most_common_pct > 0.4:
            flag = " ⚠ LOOPING"
        elif most_common_pct > 0.25:
            flag = " ~ repetitive"

        label = f"swap {a}<->{b}"
        print(f"{label:>12s} | {tps:4.1f} t/s | {text[:120]}{flag}")

        # free memory
        del model

        print(f"  [{idx+1}/{total}]", file=sys.stderr, end="\r")

    print(f"\nDone — {total} swaps tested.", file=sys.stderr)

if __name__ == "__main__":
    main()

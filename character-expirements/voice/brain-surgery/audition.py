#!/usr/bin/env python3
"""
Audition mutant models as game characters.
Tests each mutation across multiple prompts and temperatures
to see if the voice is consistent.
"""

import copy
import sys
import time
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL = "TinyLlama/TinyLlama-1.1B-Chat-v1.0"
SEED = 42
MAX_TOKENS = 60

# Different prompts to test voice consistency
PROMPTS = [
    "The ocean is",
    "I walked into the room and",
    "The most important thing about",
    "When I was young,",
    "The door opened slowly and",
]

# Temperatures to test
TEMPS = [0.3, 0.7, 1.0, 1.4]

# Candidate "characters" — each is a list of (op, arg) tuples
CHARACTERS = {
    "poet": [
        # amplify early, dampen late — produced lyrics
        ("scale", "5:1.3"), ("scale", "6:1.3"), ("scale", "7:1.3"),
        ("scale", "14:0.7"), ("scale", "15:0.7"), ("scale", "16:0.7"),
    ],
    "screenwriter": [
        # scale 11 at 0.9 — produced screenplay directions
        ("scale", "11:0.9"),
    ],
    "mystic": [
        # scale 11 at 1.2 — spiritual/divine language
        ("scale", "11:1.2"),
    ],
    "narrator": [
        # rm 11 — produced first-person childhood narrative
        ("rm", "11"),
    ],
    "dreamer": [
        # scale 11 at 0.5 — poetic awe
        ("scale", "11:0.5"),
    ],
    "storyteller": [
        # swap 5<->13 — produced fiction/magical girl narrative
        ("swap", "5,13"),
    ],
    "philosopher": [
        # swap 7<->16 — absurdist/koan style
        ("swap", "7,16"),
    ],
    "activist": [
        # scale 11 at 1.5 — earnest/protective
        ("scale", "11:1.5"),
    ],
    "journalist": [
        # noise on layer 11 — factual/encyclopedic
        ("noise", "11:0.01"),
    ],
    "verse": [
        # all-layer injection — spontaneous free verse
        ("inject", "all:0.01"),
    ],
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


def needs_reload(ops):
    """Check if ops include destructive changes (rm, swap, noise) that need a fresh model."""
    return any(op in ("rm", "swap", "noise") for op, _ in ops)


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
    n_layers = len(base_model.model.layers)
    print(f"Loaded — {n_layers} layers.\n", file=sys.stderr)

    # Baseline first
    print("=" * 100)
    print(f"{'BASELINE':^100}")
    print("=" * 100)
    for prompt in PROMPTS:
        print(f"\n  \"{prompt}\"")
        for temp in TEMPS:
            text = generate(base_model, tokenizer, prompt, MAX_TOKENS, temp, SEED)
            print(f"    T={temp}: {text[:110]}")
    print()

    # Each character
    total = len(CHARACTERS)
    for ci, (name, ops) in enumerate(CHARACTERS.items()):
        print("=" * 100)
        print(f"{name.upper():^100}")
        ops_str = " + ".join(f"{op}({arg})" for op, arg in ops)
        print(f"{ops_str:^100}")
        print("=" * 100)

        # Apply mutations
        if needs_reload(ops):
            model = fresh_model()
        else:
            model = base_model
        clear_hooks()

        for op, arg in ops:
            apply_op(model, op, arg, seed=SEED)

        for prompt in PROMPTS:
            print(f"\n  \"{prompt}\"")
            for temp in TEMPS:
                text = generate(model, tokenizer, prompt, MAX_TOKENS, temp, SEED)
                print(f"    T={temp}: {text[:110]}")

        clear_hooks()
        print()
        print(f"  [{ci+1}/{total}]", file=sys.stderr)

    print("\nDone.", file=sys.stderr)


if __name__ == "__main__":
    main()

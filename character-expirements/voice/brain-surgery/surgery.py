#!/usr/bin/env python3
"""
Brain surgery on small language models.
Duplicate, remove, swap, or reorder transformer layers and see what happens to the voice.

Operations are applied IN THE ORDER you specify them, so you can chain freely:

    # Duplicate layer 10, remove layer 5, duplicate layer 3 twice
    python surgery.py --dup 10 --rm 5 --dup 3:2 "Tell me about the ocean"

    # Remove a range, then shuffle what's left
    python surgery.py --rm 15-20 --shuffle "Tell me about the ocean"

    # Go wild
    python surgery.py --dup 0:5 --rm 10-14 --swap 2,8 --dup 6 --reverse "Tell me about the ocean"

Structural operations:
    --dup N       Duplicate layer N (inserted after original)
    --dup N:K     Duplicate layer N, K copies
    --rm N        Remove layer N
    --rm N-M      Remove layers N through M
    --swap N,M    Swap layers N and M
    --reverse     Reverse all layers
    --shuffle     Randomly shuffle all layers

Noise operations:
    --noise N:S     Add Gaussian noise to layer N's weights (S = std dev, try 0.001-0.1)
    --noise all:S   Add noise to ALL layers
    --scale N:F     Scale layer N's output by factor F (1.0 = normal, try 0.5-2.0)
    --inject N:S    Inject noise into residual stream after layer N (S = std dev)
    --inject all:S  Inject noise after every layer

Other flags:
    --compare       Run baseline AND mutant side by side
    --temp F        Sampling temperature (default: 0.7)
    --max-tokens N  Max tokens to generate (default: 200)
    --rep-penalty F Repetition penalty (default: 1.15 — kills loops)
    --seed N        Random seed for reproducibility
    --model NAME    HuggingFace model (default: Qwen2.5-1.5B-Instruct)
"""

import copy
import random
import sys
import time

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

# Track hooks so we can clean them up between compare runs
_hooks = []


def load_model(model_name):
    print(f"Loading {model_name}...", file=sys.stderr)
    t0 = time.time()
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        torch_dtype=torch.float16,
        device_map="cpu",
        low_cpu_mem_usage=True,
    )
    model.eval()
    dt = time.time() - t0
    n_layers = len(model.model.layers)
    print(f"Loaded in {dt:.1f}s — {n_layers} layers", file=sys.stderr)
    return model, tokenizer, n_layers


def apply_op(model, op, arg, seed=None):
    """Apply a single operation. Returns description string."""
    global _hooks
    layers = model.model.layers
    n = len(layers)

    if op == "dup":
        if ":" in arg:
            idx, count = arg.split(":", 1)
            idx, count = int(idx), int(count)
        else:
            idx, count = int(arg), 1
        if idx >= n:
            print(f"dup: layer {idx} out of bounds (0-{n-1})", file=sys.stderr)
            sys.exit(1)
        for _ in range(count):
            layers.insert(idx + 1, copy.deepcopy(layers[idx]))
        return f"dup {idx}x{count}"

    elif op == "rm":
        if "-" in arg:
            lo, hi = arg.split("-", 1)
            indices = list(range(int(lo), int(hi) + 1))
        else:
            indices = [int(arg)]
        for idx in sorted(indices, reverse=True):
            if idx >= len(layers):
                print(f"rm: layer {idx} out of bounds (0-{len(layers)-1})", file=sys.stderr)
                sys.exit(1)
            if len(layers) <= 1:
                print("rm: can't remove last layer!", file=sys.stderr)
                break
            del layers[idx]
        return f"rm {arg}"

    elif op == "swap":
        parts = arg.split(",")
        a, b = int(parts[0]), int(parts[1])
        if a >= n or b >= n:
            print(f"swap: indices {a},{b} out of bounds (0-{n-1})", file=sys.stderr)
            sys.exit(1)
        layers[a], layers[b] = layers[b], layers[a]
        return f"swap {a}<->{b}"

    elif op == "reverse":
        model.model.layers = model.model.layers[::-1]
        return "reverse"

    elif op == "shuffle":
        s = seed if seed is not None else random.randint(0, 99999)
        order = list(range(len(model.model.layers)))
        random.Random(s).shuffle(order)
        model.model.layers = torch.nn.ModuleList([model.model.layers[i] for i in order])
        return f"shuffle(seed={s})"

    elif op == "noise":
        # Add Gaussian noise to layer weights
        # arg is "N:S" or "all:S"
        parts = arg.split(":", 1)
        target, scale = parts[0], float(parts[1])
        if target == "all":
            indices = list(range(n))
        else:
            indices = [int(target)]
        for idx in indices:
            if idx >= n:
                print(f"noise: layer {idx} out of bounds (0-{n-1})", file=sys.stderr)
                sys.exit(1)
            layer = layers[idx]
            with torch.no_grad():
                for param in layer.parameters():
                    param.add_(torch.randn_like(param) * scale)
        target_str = target if target == "all" else f"L{target}"
        return f"noise({target_str}, σ={scale})"

    elif op == "scale":
        # Scale a layer's output by a factor using a forward hook
        # arg is "N:F"
        parts = arg.split(":", 1)
        idx, factor = int(parts[0]), float(parts[1])
        if idx >= n:
            print(f"scale: layer {idx} out of bounds (0-{n-1})", file=sys.stderr)
            sys.exit(1)
        def make_scale_hook(f):
            def hook(module, input, output):
                # output is a tuple (hidden_states, ...) for transformer layers
                if isinstance(output, tuple):
                    scaled = output[0] * f
                    return (scaled,) + output[1:]
                return output * f
            return hook
        h = layers[idx].register_forward_hook(make_scale_hook(factor))
        _hooks.append(h)
        return f"scale(L{idx}, {factor}x)"

    elif op == "inject":
        # Inject Gaussian noise into residual stream after a layer
        # arg is "N:S" or "all:S"
        parts = arg.split(":", 1)
        target, scale = parts[0], float(parts[1])
        if target == "all":
            indices = list(range(n))
        else:
            indices = [int(target)]
        def make_inject_hook(s):
            def hook(module, input, output):
                if isinstance(output, tuple):
                    noisy = output[0] + torch.randn_like(output[0]) * s
                    return (noisy,) + output[1:]
                return output + torch.randn_like(output) * s
            return hook
        for idx in indices:
            if idx >= n:
                print(f"inject: layer {idx} out of bounds (0-{n-1})", file=sys.stderr)
                sys.exit(1)
            h = layers[idx].register_forward_hook(make_inject_hook(scale))
            _hooks.append(h)
        target_str = target if target == "all" else f"L{target}"
        return f"inject({target_str}, σ={scale})"

    return "?"


def clear_hooks():
    global _hooks
    for h in _hooks:
        h.remove()
    _hooks = []


def parse_ops_from_argv():
    """Parse sys.argv manually to preserve operation order.

    Returns (ops, flags) where ops is [(op_name, arg), ...] in order
    and flags is a dict of non-operation arguments.
    """
    ops = []
    flags = {
        "model": "Qwen/Qwen2.5-1.5B-Instruct",
        "temp": 0.7,
        "max_tokens": 200,
        "rep_penalty": 1.15,
        "seed": None,
        "compare": False,
        "prompt": None,
    }

    argv = sys.argv[1:]
    i = 0
    positional = []

    while i < len(argv):
        a = argv[i]

        if a in ("--dup", "--rm", "--swap", "--noise", "--scale", "--inject"):
            op = a[2:]  # strip --
            i += 1
            if i >= len(argv):
                print(f"{a} requires an argument", file=sys.stderr)
                sys.exit(1)
            ops.append((op, argv[i]))

        elif a == "--reverse":
            ops.append(("reverse", ""))

        elif a == "--shuffle":
            ops.append(("shuffle", ""))

        elif a == "--compare":
            flags["compare"] = True

        elif a == "--model":
            i += 1
            flags["model"] = argv[i]

        elif a == "--temp":
            i += 1
            flags["temp"] = float(argv[i])

        elif a == "--max-tokens":
            i += 1
            flags["max_tokens"] = int(argv[i])

        elif a == "--rep-penalty":
            i += 1
            flags["rep_penalty"] = float(argv[i])

        elif a == "--seed":
            i += 1
            flags["seed"] = int(argv[i])

        elif a in ("-h", "--help"):
            print(__doc__)
            sys.exit(0)

        elif a.startswith("-"):
            print(f"Unknown flag: {a}", file=sys.stderr)
            sys.exit(1)

        else:
            positional.append(a)

        i += 1

    if not positional:
        print("Missing prompt argument. Use -h for help.", file=sys.stderr)
        sys.exit(1)

    flags["prompt"] = " ".join(positional)
    return ops, flags


def generate(model, tokenizer, prompt, max_tokens=200, temp=0.7, seed=None, rep_penalty=1.15):
    if seed is not None:
        torch.manual_seed(seed)

    inputs = tokenizer(prompt, return_tensors="pt")
    input_len = inputs["input_ids"].shape[1]

    t0 = time.time()
    with torch.no_grad():
        out = model.generate(
            **inputs,
            max_new_tokens=max_tokens,
            temperature=temp,
            do_sample=temp > 0,
            top_p=0.9,
            repetition_penalty=rep_penalty,
            pad_token_id=tokenizer.eos_token_id,
        )
    dt = time.time() - t0
    n_tokens = out.shape[1] - input_len

    text = tokenizer.decode(out[0][input_len:], skip_special_tokens=True)
    tps = n_tokens / dt if dt > 0 else 0
    return text, n_tokens, dt, tps


def main():
    ops, flags = parse_ops_from_argv()
    has_surgery = len(ops) > 0

    model, tokenizer, n_layers = load_model(flags["model"])

    # Baseline run
    if flags["compare"] or not has_surgery:
        print(f"\n{'='*60}", file=sys.stderr)
        print(f"BASELINE [{n_layers} layers]", file=sys.stderr)
        print(f"{'='*60}", file=sys.stderr)
        text, n_tok, dt, tps = generate(
            model, tokenizer, flags["prompt"],
            max_tokens=flags["max_tokens"], temp=flags["temp"], seed=flags["seed"],
            rep_penalty=flags["rep_penalty"],
        )
        print(f"({n_tok} tokens, {dt:.1f}s, {tps:.1f} tok/s)\n", file=sys.stderr)
        if flags["compare"]:
            print("--- BASELINE ---")
        print(text)
        if flags["compare"]:
            print()

    # Mutant run
    if has_surgery:
        if flags["compare"]:
            clear_hooks()
            model, tokenizer, n_layers = load_model(flags["model"])

        descriptions = []
        for op, arg in ops:
            desc = apply_op(model, op, arg, seed=flags["seed"])
            descriptions.append(desc)

        full_desc = " → ".join(descriptions)
        new_count = len(model.model.layers)
        full_desc += f" [{new_count} layers]"

        print(f"\n{'='*60}", file=sys.stderr)
        print(f"MUTANT: {full_desc}", file=sys.stderr)
        print(f"{'='*60}", file=sys.stderr)
        text, n_tok, dt, tps = generate(
            model, tokenizer, flags["prompt"],
            max_tokens=flags["max_tokens"], temp=flags["temp"], seed=flags["seed"],
            rep_penalty=flags["rep_penalty"],
        )
        print(f"({n_tok} tokens, {dt:.1f}s, {tps:.1f} tok/s)\n", file=sys.stderr)
        if flags["compare"]:
            print("--- MUTANT ---")
        print(text)

    clear_hooks()


if __name__ == "__main__":
    main()

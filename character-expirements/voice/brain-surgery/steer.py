#!/usr/bin/env python3
"""
Generate text using a base model + steering vector(s).

Usage:
    # Apply cynic vector at default strength 1.0
    python steer.py --vec cynic "The ocean is"

    # Stronger effect
    python steer.py --vec cynic --alpha 2.0 "The ocean is"

    # Multiple vectors blended
    python steer.py --vec cynic:0.7 --vec mourner:0.5 "The ocean is"

    # Compare side-by-side: baseline, scaled-character, steered-character
    python steer.py --vec cynic --compare "The ocean is"

Flags:
    --vec NAME[:α]      Apply vector 'NAME' (looks in vectors/NAME-L*.pt) with strength α (default 1.0).
                        Repeatable.
    --layer N           Override the layer to inject at (default: read from vector metadata).
    --alpha F           Global alpha multiplier applied to all vectors (default 1.0).
    --compare           Also generate with the vector's original ops and with baseline, for comparison.
    --temp F            Sampling temperature (default 0.5).
    --max-tokens N      Max new tokens (default 200).
    --seed N            Random seed.
    --vec-dir D         Dir containing *.pt vector files (default: vectors/).
    --chars-file F      Path to characters.json (for --compare to look up ops).
"""

import argparse
import copy
import glob
import json
import os
import random
import sys
import time
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL = "Qwen/Qwen2.5-1.5B-Instruct"
VEC_DIR = os.path.join(os.path.dirname(__file__), "vectors")
CHARS_FILE = os.path.join(os.path.dirname(__file__), "characters.json")
REP_PENALTY = 1.15


def load_vector(name, vec_dir, layer=None):
    """Load a saved steering vector. Returns the dict from torch.load."""
    if layer is not None:
        path = os.path.join(vec_dir, f"{name}-L{layer}.pt")
        if not os.path.exists(path):
            raise FileNotFoundError(f"No vector file {path}")
        return torch.load(path, weights_only=False)
    # Find any matching
    matches = glob.glob(os.path.join(vec_dir, f"{name}-L*.pt"))
    if not matches:
        raise FileNotFoundError(f"No vectors found matching {name}-L*.pt in {vec_dir}")
    if len(matches) > 1:
        matches.sort()
        print(f"  (multiple vectors found for {name}, using {matches[0]})", file=sys.stderr)
    return torch.load(matches[0], weights_only=False)


def parse_vec_arg(s):
    """Parse 'name' or 'name:alpha'. Returns (name, alpha)."""
    if ":" in s:
        name, alpha = s.split(":", 1)
        return name, float(alpha)
    return s, 1.0


def apply_steering(model, vectors_and_alphas, layer_idx, global_alpha=1.0):
    """
    Register a forward hook on layer_idx that adds sum(α * v) to the output.
    Returns the hook handle.
    """
    # Combine into single vector
    combined = None
    for vec, alpha in vectors_and_alphas:
        contrib = vec * (alpha * global_alpha)
        combined = contrib if combined is None else combined + contrib

    # Match dtype of model
    combined = combined.to(next(model.parameters()).dtype)

    def hook(module, input, output):
        if isinstance(output, tuple):
            return (output[0] + combined,) + output[1:]
        return output + combined

    return model.model.layers[layer_idx].register_forward_hook(hook)


_ops_hooks = []

def apply_op(model, op, arg):
    global _ops_hooks
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
        _ops_hooks.append(h)
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
            _ops_hooks.append(h)

def clear_ops_hooks():
    global _ops_hooks
    for h in _ops_hooks:
        h.remove()
    _ops_hooks = []

def needs_fresh_model(ops):
    return any(op in ("rm", "swap", "noise") for op, _ in ops)


def generate(model, tokenizer, prompt, max_tokens, temp, seed, rep_penalty):
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
            do_sample=True,
            top_p=0.9,
            repetition_penalty=rep_penalty,
            pad_token_id=tokenizer.eos_token_id,
        )
    dt = time.time() - t0
    n_tok = out.shape[1] - input_len
    text = tokenizer.decode(out[0][input_len:], skip_special_tokens=True)
    return text, n_tok, dt


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("prompt")
    parser.add_argument("--vec", action="append", default=[],
                        help="Vector name (optionally :alpha). Repeatable.")
    parser.add_argument("--layer", type=int, default=None)
    parser.add_argument("--alpha", type=float, default=1.0, help="Global alpha multiplier")
    parser.add_argument("--compare", action="store_true",
                        help="Also show baseline and scaled-character outputs")
    parser.add_argument("--temp", type=float, default=0.5)
    parser.add_argument("--max-tokens", type=int, default=200)
    parser.add_argument("--rep-penalty", type=float, default=REP_PENALTY)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--vec-dir", default=VEC_DIR)
    parser.add_argument("--chars-file", default=CHARS_FILE)
    args = parser.parse_args()

    seed = args.seed if args.seed is not None else random.randint(1, 999999)

    if not args.vec and not args.compare:
        print("Need at least --vec NAME or --compare", file=sys.stderr)
        sys.exit(1)

    # Load vectors
    vec_specs = [parse_vec_arg(v) for v in args.vec]
    loaded_vecs = [(name, alpha, load_vector(name, args.vec_dir, args.layer)) for name, alpha in vec_specs]

    # Determine layer
    if args.layer is not None:
        layer_idx = args.layer
    elif loaded_vecs:
        layers = set(lv[2]["layer_idx"] for lv in loaded_vecs)
        if len(layers) > 1:
            print(f"Vectors were extracted at different layers: {layers}. Specify --layer.", file=sys.stderr)
            sys.exit(1)
        layer_idx = layers.pop()
    else:
        layer_idx = 20

    # Load model
    print(f"Loading {MODEL}...", file=sys.stderr)
    tokenizer = AutoTokenizer.from_pretrained(MODEL)

    def fresh_model():
        m = AutoModelForCausalLM.from_pretrained(
            MODEL, torch_dtype=torch.float16, device_map="cpu", low_cpu_mem_usage=True,
        )
        m.eval()
        return m

    base_model = fresh_model()
    n_layers = len(base_model.model.layers)
    print(f"Loaded — {n_layers} layers.", file=sys.stderr)

    # === BASELINE (compare mode) ===
    if args.compare:
        print(f"\n{'='*80}\n{'BASELINE (unmodified)':^80}\n{'='*80}")
        text, n_tok, dt = generate(base_model, tokenizer, args.prompt,
                                    args.max_tokens, args.temp, seed, args.rep_penalty)
        print(f"({n_tok} tok, {dt:.1f}s, seed={seed})\n")
        print(args.prompt + text)

    # === STEERED ===
    if loaded_vecs:
        vectors_and_alphas = [(lv[2]["vector"], lv[1]) for lv in loaded_vecs]
        spec_str = " + ".join(f"{n}({a})" for n, a, _ in loaded_vecs)
        print(f"\n{'='*80}\n{'STEERED: ' + spec_str + f' @ L{layer_idx}':^80}\n{'='*80}")
        h = apply_steering(base_model, vectors_and_alphas, layer_idx, args.alpha)
        try:
            text, n_tok, dt = generate(base_model, tokenizer, args.prompt,
                                        args.max_tokens, args.temp, seed, args.rep_penalty)
        finally:
            h.remove()
        print(f"({n_tok} tok, {dt:.1f}s, seed={seed})\n")
        print(args.prompt + text)

    # === SCALED ORIGINAL (compare mode, only if single vector) ===
    if args.compare and len(loaded_vecs) == 1:
        name = loaded_vecs[0][0]
        with open(args.chars_file) as f:
            characters = json.load(f)
        if name in characters:
            ops = [tuple(op) for op in characters[name]["ops"]]
            if needs_fresh_model(ops):
                char_model = fresh_model()
            else:
                char_model = base_model
            clear_ops_hooks()
            for op, arg in ops:
                apply_op(char_model, op, arg)

            print(f"\n{'='*80}\n{'ORIGINAL SCALED: ' + name:^80}\n{'='*80}")
            text, n_tok, dt = generate(char_model, tokenizer, args.prompt,
                                        args.max_tokens, args.temp, seed, args.rep_penalty)
            print(f"({n_tok} tok, {dt:.1f}s, seed={seed})\n")
            print(args.prompt + text)

            clear_ops_hooks()


if __name__ == "__main__":
    main()

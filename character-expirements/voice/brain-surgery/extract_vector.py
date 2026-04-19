#!/usr/bin/env python3
"""
Extract a steering vector for each character in characters.json.

Approach (contrastive activation addition, CAA):
    1. Pick a set of probe prompts
    2. For each prompt:
        - Run through CHARACTER model (scaling/swap/etc. applied)
        - Capture hidden-state activation at layer L, last prompt token
        - Run same prompt through BASELINE model, same layer/position
    3. steering_vector = mean(char_activations) - mean(base_activations)
    4. Save as .pt with metadata

Usage:
    python extract_vector.py                    # all characters, default layer
    python extract_vector.py --layer 22         # extract at different layer
    python extract_vector.py --char cynic       # just one
    python extract_vector.py --out vectors/     # output dir
"""

import argparse
import copy
import json
import os
import sys
import time
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL = "Qwen/Qwen2.5-1.5B-Instruct"
CHARS_FILE = os.path.join(os.path.dirname(__file__), "characters.json")
DEFAULT_LAYER = 20
DEFAULT_OUT_DIR = os.path.join(os.path.dirname(__file__), "vectors")

# Probe prompts — diverse enough to average out prompt-specific noise,
# but all "open-ended writing"-shaped so the activations reflect voice state.
PROBE_PROMPTS = [
    "The ocean is",
    "The forest at night",
    "She looked out the window and",
    "I walked into the room and",
    "The door opened slowly and",
    "He picked up the letter and",
    "When I was young,",
    "The hardest thing I ever did was",
    "I remember the first time",
    "The most important thing about",
    "Time is",
    "What people don't understand is",
    "A secret I've never told anyone is",
    "The sky turned red when",
    "In the quiet hours of morning,",
    "The old man said",
    "She whispered",
    "The key to happiness is",
    "Money is",
    "Love is",
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

def needs_fresh_model(ops):
    return any(op in ("rm", "swap", "noise") for op, _ in ops)


def capture_activations(model, tokenizer, prompts, layer_idx):
    """Forward-pass each prompt, return stacked last-token activations at layer_idx.

    Shape: (n_prompts, hidden_dim)
    """
    captured = {}
    def hook(module, input, output):
        hs = output[0] if isinstance(output, tuple) else output
        # hs: [batch=1, seq, hidden]
        captured["x"] = hs[0, -1, :].detach().clone().float()

    h = model.model.layers[layer_idx].register_forward_hook(hook)
    vecs = []
    try:
        for prompt in prompts:
            inputs = tokenizer(prompt, return_tensors="pt")
            with torch.no_grad():
                model(**inputs)
            vecs.append(captured["x"])
    finally:
        h.remove()
    return torch.stack(vecs)


def extract_for_character(base_model_constructor, base_model, tokenizer, name, cfg, layer_idx, prompts, baseline_acts):
    """Extract steering vector for a character. Returns dict with vector + metadata."""
    ops = [tuple(op) for op in cfg["ops"]]

    if len(ops) == 0:
        # Baseline — no steering vector (would be zero)
        return None

    # Run character
    if needs_fresh_model(ops):
        char_model = base_model_constructor()
    else:
        char_model = base_model
    clear_hooks()
    for op, arg in ops:
        apply_op(char_model, op, arg)

    char_acts = capture_activations(char_model, tokenizer, prompts, layer_idx)

    clear_hooks()
    if needs_fresh_model(ops):
        del char_model

    # steering vector = mean(char) - mean(baseline)
    char_mean = char_acts.mean(dim=0)
    base_mean = baseline_acts.mean(dim=0)
    vector = char_mean - base_mean

    return {
        "name": name,
        "vector": vector,
        "layer_idx": layer_idx,
        "model": MODEL,
        "ops": cfg["ops"],
        "description": cfg.get("description", ""),
        "n_prompts": len(prompts),
        "vector_norm": vector.norm().item(),
        "char_activation_mean_norm": char_mean.norm().item(),
        "base_activation_mean_norm": base_mean.norm().item(),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--layer", type=int, default=DEFAULT_LAYER,
                        help=f"Layer index to extract at (default: {DEFAULT_LAYER})")
    parser.add_argument("--char", type=str, default=None,
                        help="Extract only this character (default: all)")
    parser.add_argument("--out", type=str, default=DEFAULT_OUT_DIR,
                        help="Output directory")
    parser.add_argument("--chars-file", type=str, default=CHARS_FILE)
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)

    with open(args.chars_file) as f:
        characters = json.load(f)

    if args.char:
        if args.char not in characters:
            print(f"Unknown character: {args.char}", file=sys.stderr)
            sys.exit(1)
        characters = {args.char: characters[args.char]}

    print(f"Loading model {MODEL}...", file=sys.stderr)
    tokenizer = AutoTokenizer.from_pretrained(MODEL)

    def fresh_model():
        m = AutoModelForCausalLM.from_pretrained(
            MODEL, torch_dtype=torch.float16, device_map="cpu", low_cpu_mem_usage=True,
        )
        m.eval()
        return m

    base_model = fresh_model()
    n_layers = len(base_model.model.layers)
    print(f"Loaded — {n_layers} layers. Extracting at layer {args.layer}.", file=sys.stderr)

    if args.layer < 0 or args.layer >= n_layers:
        print(f"Layer {args.layer} out of bounds (0-{n_layers-1})", file=sys.stderr)
        sys.exit(1)

    print(f"\nComputing baseline activations over {len(PROBE_PROMPTS)} probe prompts...", file=sys.stderr)
    t0 = time.time()
    baseline_acts = capture_activations(base_model, tokenizer, PROBE_PROMPTS, args.layer)
    print(f"  done in {time.time()-t0:.1f}s | shape {tuple(baseline_acts.shape)} | mean norm {baseline_acts.mean(dim=0).norm().item():.2f}", file=sys.stderr)

    for ci, (name, cfg) in enumerate(characters.items()):
        if name == "baseline":
            continue
        print(f"\n[{ci+1}/{len(characters)}] Extracting {name}...", file=sys.stderr)
        t0 = time.time()
        result = extract_for_character(
            fresh_model, base_model, tokenizer, name, cfg, args.layer, PROBE_PROMPTS, baseline_acts,
        )
        if result is None:
            continue
        out_path = os.path.join(args.out, f"{name}-L{args.layer}.pt")
        torch.save(result, out_path)
        dt = time.time() - t0
        print(f"  {name}: vector norm {result['vector_norm']:.2f} | saved → {out_path} ({dt:.1f}s)", file=sys.stderr)

    print(f"\nDone. Vectors saved to {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()

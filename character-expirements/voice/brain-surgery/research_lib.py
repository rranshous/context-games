"""Shared utilities for autonomous research phases.

Convention:
- ops are tuples (op_name, arg) e.g. ("scale", "7:0.5")
- All ops here are reversible without model reload (scale/swap/inject)
- Phase scripts call ensure_model() once, then loop over candidates
- Each candidate: apply_ops -> generate -> clear_hooks + undo_swaps
"""

import gc
import json
import os
import sys
import time

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL = "Qwen/Qwen2.5-1.5B-Instruct"
REP_PENALTY = 1.15

_model = None
_tokenizer = None
_n_layers = None


def p(msg):
    print(msg, flush=True)


def save_json(data, path):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, path)


def load_json(path, default=None):
    if os.path.exists(path):
        try:
            with open(path) as f:
                return json.load(f)
        except Exception as e:
            p(f"Warning: couldn't load {path}: {e}. Starting fresh.")
    return default if default is not None else {}


def ensure_model():
    """Load Qwen once and cache. Returns (model, tokenizer, n_layers)."""
    global _model, _tokenizer, _n_layers
    if _model is None:
        p(f"Loading {MODEL}...")
        t0 = time.time()
        _tokenizer = AutoTokenizer.from_pretrained(MODEL)
        _model = AutoModelForCausalLM.from_pretrained(
            MODEL,
            torch_dtype=torch.float16,
            device_map="cpu",
            low_cpu_mem_usage=True,
        )
        _model.eval()
        _n_layers = len(_model.model.layers)
        p(f"Loaded {MODEL} in {time.time()-t0:.1f}s — {_n_layers} layers.")
    return _model, _tokenizer, _n_layers


def apply_ops(model, ops, hooks):
    """Apply a sequence of ops to the model. Mutates `hooks` list."""
    layers = model.model.layers
    for op, arg in ops:
        if op == "scale":
            idx_s, factor_s = arg.split(":", 1)
            idx, factor = int(idx_s), float(factor_s)
            def make_hook(f):
                def hook(module, input, output):
                    if isinstance(output, tuple):
                        return (output[0] * f,) + output[1:]
                    return output * f
                return hook
            h = layers[idx].register_forward_hook(make_hook(factor))
            hooks.append(h)
        elif op == "swap":
            a_s, b_s = arg.split(",")
            a, b = int(a_s), int(b_s)
            layers[a], layers[b] = layers[b], layers[a]
        elif op == "inject":
            target, scale_s = arg.split(":", 1)
            scale = float(scale_s)
            indices = list(range(len(layers))) if target == "all" else [int(target)]
            def make_inj(s):
                def hook(module, input, output):
                    if isinstance(output, tuple):
                        return (output[0] + torch.randn_like(output[0]) * s,) + output[1:]
                    return output + torch.randn_like(output) * s
                return hook
            for idx in indices:
                h = layers[idx].register_forward_hook(make_inj(scale))
                hooks.append(h)
        else:
            raise ValueError(f"apply_ops: unsupported op {op!r} (research_lib only handles scale/swap/inject)")


def clear_hooks(hooks):
    for h in hooks:
        h.remove()
    hooks.clear()


def undo_swaps(model, ops):
    """Reverse swap ops in reverse order — restores model to baseline state."""
    for op, arg in reversed(ops):
        if op == "swap":
            a_s, b_s = arg.split(",")
            a, b = int(a_s), int(b_s)
            layers = model.model.layers
            layers[a], layers[b] = layers[b], layers[a]


def generate(model, tokenizer, prompt, max_tokens=150, temp=0.5, seed=42):
    torch.manual_seed(seed)
    inputs = tokenizer(prompt, return_tensors="pt")
    input_len = inputs["input_ids"].shape[1]
    with torch.no_grad():
        out = model.generate(
            **inputs,
            max_new_tokens=max_tokens,
            temperature=max(temp, 0.01),
            do_sample=True,
            top_p=0.9,
            repetition_penalty=REP_PENALTY,
            pad_token_id=tokenizer.eos_token_id,
        )
    text = tokenizer.decode(out[0][input_len:], skip_special_tokens=True)
    return text.strip()


# ---- Scoring ----

def non_ascii_ratio(text):
    if not text:
        return 0.0
    bad = sum(1 for c in text if ord(c) > 127 and not c.isspace())
    return bad / max(len(text), 1)


def unique_word_ratio(text):
    words = text.split()
    if not words:
        return 0.0
    return len(set(w.lower() for w in words)) / len(words)


def jaccard_words(a, b):
    """Word-level Jaccard similarity. 0 = identical, 1 = no overlap (we return distance)."""
    wa = set(w.lower() for w in a.split())
    wb = set(w.lower() for w in b.split())
    if not wa and not wb:
        return 0.0
    inter = len(wa & wb)
    union = len(wa | wb)
    return inter / union if union > 0 else 0.0


def looks_broken(text):
    """Quick filter: cross-language drift, all-repeating, near-empty."""
    if len(text.strip()) < 30:
        return True, "too_short"
    if non_ascii_ratio(text) > 0.15:
        return True, f"non_ascii_{non_ascii_ratio(text):.2f}"
    if unique_word_ratio(text) < 0.35:
        return True, f"low_unique_{unique_word_ratio(text):.2f}"
    return False, ""


def score_candidate(cand_texts, baseline_texts):
    """Score a candidate against baseline on the same prompts.

    Higher = more interesting.
    Filters: broken outputs penalized, scored 0.
    distinctiveness = 1 - mean_jaccard with baseline (more different = higher)
    coherence = mean unique_word_ratio (less looping)
    cleanness = 1 - mean non_ascii_ratio (less drift)
    Combined: distinctiveness * coherence * cleanness
    """
    assert len(cand_texts) == len(baseline_texts)
    n = len(cand_texts)
    if n == 0:
        return {"score": 0.0, "distinctiveness": 0.0, "coherence": 0.0, "cleanness": 0.0, "broken": 0}

    broken_count = 0
    distinct_vals = []
    coher_vals = []
    clean_vals = []
    for c, b in zip(cand_texts, baseline_texts):
        broken, _ = looks_broken(c)
        if broken:
            broken_count += 1
            distinct_vals.append(0.0)
            coher_vals.append(0.0)
            clean_vals.append(0.0)
            continue
        distinct_vals.append(1.0 - jaccard_words(c, b))
        coher_vals.append(unique_word_ratio(c))
        clean_vals.append(1.0 - non_ascii_ratio(c))

    distinctiveness = sum(distinct_vals) / n
    coherence = sum(coher_vals) / n
    cleanness = sum(clean_vals) / n
    combined = distinctiveness * coherence * cleanness
    return {
        "score": round(combined, 4),
        "distinctiveness": round(distinctiveness, 3),
        "coherence": round(coherence, 3),
        "cleanness": round(cleanness, 3),
        "broken": broken_count,
        "n": n,
    }


# ---- Convenience runners ----

def run_baseline(prompts, max_tokens=150, temp=0.5, seed=42):
    """Generate baseline outputs for each prompt. Returns dict prompt -> text."""
    model, tokenizer, _ = ensure_model()
    out = {}
    for prompt in prompts:
        text = generate(model, tokenizer, prompt, max_tokens, temp, seed)
        out[prompt] = text
    return out


def run_candidate(ops, prompts, max_tokens=150, temp=0.5, seed=42):
    """Apply ops, generate per prompt, restore. Returns dict prompt -> text."""
    model, tokenizer, _ = ensure_model()
    hooks = []
    apply_ops(model, ops, hooks)
    try:
        out = {}
        for prompt in prompts:
            text = generate(model, tokenizer, prompt, max_tokens, temp, seed)
            out[prompt] = text
    finally:
        clear_hooks(hooks)
        undo_swaps(model, ops)
    return out

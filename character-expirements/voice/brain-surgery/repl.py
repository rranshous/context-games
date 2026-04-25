#!/usr/bin/env python3
"""
REPL for talking to brain-surgery characters.

Commands:
    :list              list all characters with descriptions
    :use <name>        switch to character (e.g. :use dreamer)
    :who               show current character
    :temp <value>      override current character's temperature
    :tokens <value>    change max tokens (default: 200)
    :rep <value>       change repetition penalty (default: 1.15)
    :seed <value>      set seed (default: random each gen)
    :show              print current character's full config
    :steer <spec>      apply steering vector(s), e.g. :steer cynic:1.0,mourner:0.5
                       (requires vectors/ dir populated; see extract_vector.py)
    :nosteer           clear any active steering vectors
    :help              show this help
    :quit              exit

Anything else is treated as a prompt — the current character continues it.

Note: steering adds vectors to the current character's residual stream — it
stacks on top of scaling ops. Use :use baseline first for pure steering.
"""

import copy
import glob
import json
import os
import random
import readline
import sys
import time
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL = "Qwen/Qwen2.5-1.5B-Instruct"
CHARS_FILE = os.path.join(os.path.dirname(__file__), "characters.json")
VEC_DIR = os.path.join(os.path.dirname(__file__), "vectors")
DEFAULT_REP_PENALTY = 1.15


class State:
    def __init__(self):
        self.tokenizer = None
        self.base_model = None  # clean model, never mutated
        self.current_model = None  # either base_model or a deep-copied mutated one
        self.characters = {}
        self.current_char = None  # name
        self.hooks = []
        self.temp_override = None
        self.max_tokens = 200
        self.rep_penalty = DEFAULT_REP_PENALTY
        self.seed = None  # None = random each gen
        self.steer_spec = None  # string like "cynic:1.0,mourner:0.5"
        self.steer_hook = None  # hook handle


STATE = State()


def load_model():
    print(f"Loading {MODEL}...")
    t0 = time.time()
    STATE.tokenizer = AutoTokenizer.from_pretrained(MODEL)
    STATE.base_model = AutoModelForCausalLM.from_pretrained(
        MODEL, torch_dtype=torch.float16, device_map="cpu", low_cpu_mem_usage=True,
    )
    STATE.base_model.eval()
    STATE.current_model = STATE.base_model
    print(f"Loaded in {time.time()-t0:.1f}s — {len(STATE.base_model.model.layers)} layers\n")


def load_characters():
    with open(CHARS_FILE) as f:
        STATE.characters = json.load(f)


def clear_hooks():
    for h in STATE.hooks:
        h.remove()
    STATE.hooks = []


def needs_fresh_model(ops):
    return any(op in ("rm", "swap", "noise") for op, _ in ops)


def apply_op(model, op, arg):
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
        STATE.hooks.append(h)

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
            STATE.hooks.append(h)


def activate(name):
    if name not in STATE.characters:
        print(f"  ! unknown character: {name}")
        print(f"  ! try :list")
        return

    cfg = STATE.characters[name]
    ops = [tuple(op) for op in cfg["ops"]]

    clear_hooks()
    clear_steer()  # drop any old steering hook; re-apply after activation

    if needs_fresh_model(ops):
        # Deep-copy base model so mutations don't affect it
        print(f"  (cloning model for destructive mutations...)")
        STATE.current_model = copy.deepcopy(STATE.base_model)
    else:
        STATE.current_model = STATE.base_model

    for op, arg in ops:
        apply_op(STATE.current_model, op, arg)

    # Reapply steering if it was set
    if STATE.steer_spec:
        _apply_steer_from_spec(STATE.steer_spec)

    STATE.current_char = name
    STATE.temp_override = None
    print(f"  → now speaking as {name} (T={cfg['temp']}) ")


def clear_steer():
    if STATE.steer_hook is not None:
        STATE.steer_hook.remove()
        STATE.steer_hook = None


def _load_vec(name):
    """Find any vectors/<name>-L*.pt file, load it."""
    matches = glob.glob(os.path.join(VEC_DIR, f"{name}-L*.pt"))
    if not matches:
        raise FileNotFoundError(f"No vector file for {name} in {VEC_DIR}")
    return torch.load(sorted(matches)[0], weights_only=False)


def _apply_steer_from_spec(spec):
    """spec like 'cynic:1.0,mourner:0.5'. Returns layer used."""
    clear_steer()
    parts = [p.strip() for p in spec.split(",") if p.strip()]
    loaded = []
    for p in parts:
        if ":" in p:
            name, alpha = p.split(":", 1)
            alpha = float(alpha)
        else:
            name, alpha = p, 1.0
        data = _load_vec(name)
        loaded.append((name, alpha, data))

    layers = set(d["layer_idx"] for _, _, d in loaded)
    if len(layers) > 1:
        print(f"  ! vectors are from different layers: {layers}. pick consistent ones")
        return None
    layer_idx = layers.pop()

    combined = None
    for name, alpha, d in loaded:
        contrib = d["vector"] * alpha
        combined = contrib if combined is None else combined + contrib
    combined = combined.to(next(STATE.current_model.parameters()).dtype)

    def hook(module, input, output):
        if isinstance(output, tuple):
            return (output[0] + combined,) + output[1:]
        return output + combined

    STATE.steer_hook = STATE.current_model.model.layers[layer_idx].register_forward_hook(hook)
    return layer_idx


def cmd_steer(arg):
    if not arg.strip():
        print("  usage: :steer cynic:1.0,mourner:0.5")
        return
    try:
        layer = _apply_steer_from_spec(arg.strip())
        if layer is not None:
            STATE.steer_spec = arg.strip()
            print(f"  steering active: {STATE.steer_spec} @ L{layer}")
    except FileNotFoundError as e:
        print(f"  ! {e}")
    except Exception as e:
        print(f"  ! error: {e}")


def cmd_nosteer():
    clear_steer()
    STATE.steer_spec = None
    print("  steering cleared")


def generate(prompt):
    if STATE.current_char is None:
        print("  ! no character selected. try :use dreamer")
        return

    cfg = STATE.characters[STATE.current_char]
    temp = STATE.temp_override if STATE.temp_override is not None else cfg["temp"]
    seed = STATE.seed if STATE.seed is not None else random.randint(1, 999999)

    torch.manual_seed(seed)
    inputs = STATE.tokenizer(prompt, return_tensors="pt")
    input_len = inputs["input_ids"].shape[1]

    t0 = time.time()
    with torch.no_grad():
        out = STATE.current_model.generate(
            **inputs,
            max_new_tokens=STATE.max_tokens,
            temperature=temp if temp > 0 else 0.01,
            do_sample=True,
            top_p=0.9,
            repetition_penalty=STATE.rep_penalty,
            pad_token_id=STATE.tokenizer.eos_token_id,
        )
    dt = time.time() - t0
    n_tokens = out.shape[1] - input_len
    text = STATE.tokenizer.decode(out[0][input_len:], skip_special_tokens=True)

    print(f"\n{prompt}\033[1;32m{text}\033[0m")
    print(f"\n  ({n_tokens} tok, {dt:.1f}s, {n_tokens/dt:.1f} tok/s, seed={seed}, T={temp})\n")


def cmd_list():
    for name, cfg in STATE.characters.items():
        marker = "→ " if name == STATE.current_char else "  "
        tier = cfg.get("tier", "?")
        desc = cfg.get("description", "")
        first = desc.split(".")[0][:60]
        print(f"  {marker}{name:<13s} T={cfg['temp']:<4} [{tier}]  {first}")


def cmd_who():
    if STATE.current_char is None:
        print("  (no character selected)")
        return
    cfg = STATE.characters[STATE.current_char]
    temp = STATE.temp_override if STATE.temp_override is not None else cfg["temp"]
    print(f"  current: {STATE.current_char}")
    print(f"  temp: {temp}" + (" (override)" if STATE.temp_override else ""))
    print(f"  max_tokens: {STATE.max_tokens}")
    print(f"  rep_penalty: {STATE.rep_penalty}")
    print(f"  seed: {STATE.seed if STATE.seed else 'random'}")
    if STATE.steer_spec:
        print(f"  steering: {STATE.steer_spec}")


def cmd_show():
    if STATE.current_char is None:
        print("  (no character selected)")
        return
    cfg = STATE.characters[STATE.current_char]
    print(f"  name: {STATE.current_char}")
    print(f"  temp: {cfg['temp']}")
    print(f"  description: {cfg.get('description', '')}")
    print(f"  ops:")
    for op, arg in cfg["ops"]:
        print(f"    {op}({arg})")


def cmd_help():
    print(__doc__)


def repl():
    print("\n" + "=" * 60)
    print("  brain-surgery character REPL")
    print("  :help for commands, :list to see characters")
    print("=" * 60 + "\n")

    cmd_list()
    print()

    while True:
        try:
            line = input("\033[1;36m>\033[0m ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n  bye.")
            break

        if not line:
            continue

        if line.startswith(":"):
            parts = line[1:].split(None, 1)
            cmd = parts[0]
            arg = parts[1] if len(parts) > 1 else ""

            if cmd in ("quit", "q", "exit"):
                break
            elif cmd == "help" or cmd == "h":
                cmd_help()
            elif cmd == "list" or cmd == "ls":
                cmd_list()
            elif cmd == "use":
                if not arg:
                    print("  usage: :use <name>")
                else:
                    activate(arg.strip())
            elif cmd == "who":
                cmd_who()
            elif cmd == "show":
                cmd_show()
            elif cmd == "temp":
                if not arg:
                    print("  usage: :temp <value>  (or :temp reset)")
                elif arg.strip() == "reset":
                    STATE.temp_override = None
                    print("  temp reset to character default")
                else:
                    try:
                        STATE.temp_override = float(arg.strip())
                        print(f"  temp set to {STATE.temp_override}")
                    except ValueError:
                        print("  ! invalid number")
            elif cmd == "tokens":
                try:
                    STATE.max_tokens = int(arg.strip())
                    print(f"  max_tokens = {STATE.max_tokens}")
                except ValueError:
                    print("  usage: :tokens <N>")
            elif cmd == "rep":
                try:
                    STATE.rep_penalty = float(arg.strip())
                    print(f"  rep_penalty = {STATE.rep_penalty}")
                except ValueError:
                    print("  usage: :rep <F>  (1.0 = off, 1.15 = default, 1.3 = aggressive)")
            elif cmd == "seed":
                if arg.strip() in ("random", "none", ""):
                    STATE.seed = None
                    print("  seed = random per generation")
                else:
                    try:
                        STATE.seed = int(arg.strip())
                        print(f"  seed = {STATE.seed}")
                    except ValueError:
                        print("  usage: :seed <N>  (or :seed random)")
            elif cmd == "steer":
                cmd_steer(arg)
            elif cmd == "nosteer":
                cmd_nosteer()
            else:
                print(f"  ! unknown command :{cmd}. try :help")
        else:
            generate(line)


def main():
    load_characters()
    load_model()
    repl()


if __name__ == "__main__":
    main()

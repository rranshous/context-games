"""Filter phase 1 results to clean/coherent candidates and re-rank."""
import json
import re
import sys


def is_clean(text):
    if not text:
        return False
    words = re.findall(r"[a-zA-Z]{3,}", text)
    symbol_chars = sum(1 for c in text if c in "#*_|<>{}[]()=+-/\\^&~`@$%")
    if len(words) < 20:
        return False
    if symbol_chars / max(len(text), 1) > 0.04:
        return False
    # Detect math/list artifacts: lots of digit-symbol-digit patterns
    if len(re.findall(r"[0-9][\.\,\:\-\=\+\*\/][0-9]", text)) > 4:
        return False
    # Real English sentence: must have at least one stretch of 4+ ASCII words
    sentences = re.findall(r"[A-Z][a-z]+[^.!?]*[.!?]", text)
    if not sentences:
        # No proper sentence — try lower bar: 5 word chunk
        if not re.search(r"\b[a-zA-Z]+\s+[a-zA-Z]+\s+[a-zA-Z]+\s+[a-zA-Z]+\s+[a-zA-Z]+\b", text):
            return False
    # Reject Q&A multiple-choice contamination
    if re.search(r"\bA[:\.]\s+[A-Z0-9]", text) and re.search(r"\bB[:\.]\s+[A-Z0-9]", text):
        return False
    # Reject if has too many unicode (cyrillic, chinese, etc.)
    non_ascii = sum(1 for c in text if ord(c) > 127 and not c.isspace())
    if non_ascii / max(len(text), 1) > 0.03:
        return False
    return True


def main():
    with open("phase1-results.json") as f:
        data = json.load(f)

    ranked = sorted(
        data["candidates"].items(),
        key=lambda kv: kv[1].get("score", {}).get("score", 0),
        reverse=True,
    )

    clean = [
        (k, info)
        for k, info in ranked
        if all(is_clean(t) for t in info["outputs"].values())
    ]

    print(f"Total candidates: {len(ranked)}")
    print(f"Clean (all 3 prompts coherent): {len(clean)}")
    print()

    print("=== BASELINE ===")
    for p, t in data["baseline"].items():
        print(f"  [{p[:30]}]")
        print(f"    {t[:160]}")
    print()

    n_show = int(sys.argv[1]) if len(sys.argv) > 1 else 25
    for key, info in clean[:n_show]:
        s = info["score"]
        print(f"=== {key} | score={s['score']:.3f} d={s['distinctiveness']:.2f} c={s['coherence']:.2f} ===")
        for p, t in info["outputs"].items():
            print(f"  [{p[:30]}]")
            print(f"    {t[:200]}")
        print()


if __name__ == "__main__":
    main()

# soma-views journal

## Why

Robby: in level 5, all of the game's code is in the soma, and there's an upper limit to what the input window can take, both technically and in cost. Would a lower-fidelity view of the embodiment work? Can models read gzipped content? What other ways are there to give a model a denser view of itself?

**Gzip first, measured on Genek's game section** (38k characters):
- As code it's 20.8k tokens. As gzip+base64 it's 15.4k: only 26% fewer, because base64 tokenizes at about one character a token. Stripping comments and whitespace saves 7%.
- Sonnet decodes a plain base64 sentence fine. The same sentence gzipped, or a one-line gzipped function, is refused by Anthropic's filter ("violative cyber content"): opaque compressed blobs look like hidden payloads.
- In principle it can't be read anyway: deflate is bit-level Huffman codes plus back-references. A body that can't be edited isn't level 5.

**What Robby had already found:** prenamed sections loaded into the soma on demand, with load and unload tools and caps on section size and on how many are loaded at once. It can work. But frontier models are so good at grep and friends for understanding a large codebase that a section-loading scheme fights their training. He hadn't tried function signatures that the model expands.

So this bench compares `full` (today), `outline` (an index plus read and search, the way coding agents work), and `skeleton` (signatures, with bodies folded until expanded), on Sonnet 5.5 and Haiku 5.5. Robby: "Haiku models didn't used to be able to 'get' the self reflective embodiment approach. Though, that was a while ago, they might now."

Section load/unload isn't a separate arm. These somas have one big code section (game), so loading a section would just mean loading all of it. Splitting the game into named parts would change the body itself, which is a different experiment.

## The bench

- **What's reused:** the platform's real `Actant` (its think loop, its innate edit tools, its system text), `StageBuffer`, `Bus` and `Store`, imported read-only by a page served from the repo root.
- **The views:** a subclass swaps only the `<soma>` block of the system text for the view, and adds that view's tools.
- **Node holds the key.** It counts every call's tokens and cost, and stops trials when the key runs low.
- **Checking:** after each trial, a fresh build of the result is played by a fixed script next to the original, and Sonnet judges the request, the diff and the pictures.
- **Prices** on OpenRouter, per million tokens: Sonnet 5.5 is $2 in, $10 out and $0.10 for cached input. Haiku 5.5 is $0.10, $0.50 and $0.01. Haiku is so cheap that its trials cost a fraction of a cent.

The dry run built and played all three games, the 3D one (Genek) included, through headless Chrome with SwiftShader.

The first real trial was Evevina, "the big golden fish at dusk should be worth double", on Haiku with the outline view. It searched, read one stretch, and made one exact edit that doubles points only for the gold palette at dusk. Then it told Robby what it did, and asked whether the red ones should count too. That took 4 calls, 10 seconds and $0.002.

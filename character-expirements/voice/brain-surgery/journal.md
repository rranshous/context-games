# Brain Surgery — Journal

## The Idea (2026-04-18)

Started from a conversation about detecting Claude-written text. The thought evolved:
1. Could you detect when text sounds "too much like Claude"?
2. Could you give the model feedback when it drifts out of a target voice?
3. What if you block outbound messages that violate a voice profile — no feedback, just rejection?
4. What if you skip the output layer entirely and mess with the model's *internals* to shift voice?

The last idea is the most fun. Research suggests transformer layers are more interchangeable than expected — the residual stream is a shared workspace and layers read/write somewhat independently. That means you could:
- Duplicate a layer (amplify its transformation)
- Remove a layer (skip a computation)
- Swap layers (reorder transformations)
- Shuffle/reverse (go wild)

And if "voice" lives in a low-dimensional subspace, random perturbations might produce coherent but alien communication styles. Generative art, but for prose style.

## Setup

- **Model**: TinyLlama 1.1B Chat (22 transformer layers, ~2GB fp16)
- **Hardware**: i7-4770, 11GB RAM, no GPU, CPU-only inference
- **Speed**: ~7.4 tok/s baseline
- **Tool**: `surgery.py` — CLI for layer mutations with ordered, repeatable operations

## Session 1 — First Cuts

Tested a spread of mutations on `"The ocean is"` prompt, seed 42, 100 tokens.

### What works (coherent output, different voice)

| Mutation | Voice change |
|---|---|
| `swap 10↔12` | Simpler phrasing, more repetitive structure. "vast and vibrant colors" vs baseline's essay-about-poems framing. Shorter, punchier. |
| `swap 9↔11 + swap 10↔12` | Shifted to second person ("They have..."), simpler vocabulary, more direct. "huge and beautiful" vs "vast and beautiful". |
| `rm 11` | Suddenly *personal* — first-person childhood narrative. "As a boy, I spent hours playing in the waves." Poetic, nostalgic. Most interesting single mutation. |
| `rm 10-12` (3 middle layers, 19 left) | Shifted topic to "Maya" ecosystem, adopted listy/educational tone. Different subject matter from same prompt. |

### What breaks

| Mutation | Failure mode |
|---|---|
| `dup 11` | Token loop: "al al al al..." |
| `dup 5:3` | Topic collapse: "cheap essays online" spam |
| `dup 20 x3` | Starts coherent, then "ab ab ab" loop |
| `swap 5↔18` | Total gibberish — token soup. Layers too distant. |
| `swap early pairs (0↔1, 2↔3, 4↔5)` | "The very " loop |
| `swap late pairs (16↔17, 18↔19, 20↔21)` | Numbers and fragments |
| `reverse` | Structured gibberish — "words words words" |
| `shuffle` | Multilingual word salad (Swedish "familjen"!) |
| `rm 0` | Degenerate: "a, a, a, a" |
| `rm 0,0,0` | "!!!!!!!......" |
| `rm 18-21` | "pdf pdf pdf cheap price" |

### Emerging principles

1. **Near-neighbor swaps in middle layers are the sweet spot.** Close enough that the residual stream interface is compatible, far enough to shift behavior.
2. **Removing a single middle layer can shift personality without breaking coherence.** The model is redundant enough in the middle to tolerate it.
3. **Early and late layers are load-bearing.** They handle embedding→representation and representation→token mapping. Mess with them and everything collapses.
4. **Duplication almost always creates loops.** Amplifying any layer's transformation pushes the model into repetition attractors.
5. **Distant swaps destroy coherence.** Layers 5 and 18 expect completely different residual stream states.

### Sweep Results — All Single Swaps in Layers 5-16

66 pairs tested. Prompt: `"The ocean is"`, seed 42, 80 tokens. Full data in `sweep-results.txt`.

**Speed**: consistently 7.0-8.0 tok/s across all mutations. Layer surgery doesn't meaningfully affect generation speed.

**Only 1 out of 66 swaps caused a loop** (`swap 8↔12` — "The The ocean is The The ocean is..."). Everything else stayed coherent. This is a much higher success rate than the earlier ad-hoc experiments — middle layer swaps are remarkably safe.

#### Standout voice shifts

| Swap | What changed |
|---|---|
| `5↔13` | Became **narrative fiction**: "She is determined to go. She is a young girl, and her heart is full of fire. She is a magical girl." Completely different genre. |
| `5↔12` | **Poetic/incantatory**: "The ocean is full of life. The ocean is full of mystery. The ocean is full of possibility." Anaphora. |
| `5↔11` | **Specific/sensory**: "very calm and peaceful, but the waves of the Atlantic are always turbulent, and sometimes frigid." Grounded, geographic. |
| `6↔13` | **First person, emotional**: "calling out to me, and I am compelled to follow." Shortest output — stopped after one sentence. |
| `7↔10` | **Aphoristic/list poetry**: "The sun is a blazing hot day. The grass is always greener. The sky is a bluebird." Became a wisdom-list. |
| `7↔16` | **Absurdist/koan**: "a blanket. What is it? (1) There is no meaning, a blanket." Philosophical nonsense. |
| `8↔16` | **Self-help**: "a huge part of your life, and so is your family." Completely shifted domain. |
| `9↔16` | **Conversational/opinionated**: "a great place to swim, but I wouldn't want to swim there, since I am not a fan of the ocean." Got a personality with preferences! |
| `12↔15` | **Urgent/dramatic**: "in a state of chaos, and a new wave of storms is headed towards the city. The city is already underwater." Thriller voice. |
| `13↔16` | **Visual/artistic**: "a blank canvas. The sun reflects off the surface, creating a kaleidoscope of colors." Painterly. |
| `11↔16` | **Factual/specific**: "a lighthouse that is 100 meters from the sea floor... located in the town of New Orleans, Louisiana." Hallucinated facts but with confident journalistic voice. |

#### Patterns in the data

1. **Layer 5 is a voice amplifier.** Swapping 5 with anything past 11 produces dramatic voice shifts — fiction, poetry, incantation. Layer 5 seems to handle something about register/genre selection early in the pipeline.

2. **Layer 16 is a chaos agent.** Swapping anything with 16 produces the wildest shifts — blankets as philosophy, self-help, opinionated swimmers, blank canvases. Layer 16 might be where "conventional topic adherence" lives.

3. **Layers 8-10 are the stability core.** Swaps within this range (8↔9, 9↔10, 8↔10) barely change the output — similar phrasing, similar structure. These layers are nearly interchangeable.

4. **Distance matters more than position.** Swapping layers 1 apart (e.g., 10↔11) changes almost nothing. 2-3 apart gives subtle shifts. 5+ apart gives dramatic personality changes. But unlike the early experiments, even large distances *within the middle range* stay coherent.

5. **The "vast and beautiful" → "huge and beautiful" split.** Many swaps change the opening adjective from "vast" to "huge". This seems to be a proxy for a deeper voice shift — "vast" outputs tend to be more formal/essay-like, "huge" outputs more conversational.

6. **Layer 11 is a pivot point.** Swapping 11 with anything above it (11↔12 through 11↔16) consistently shifts the model toward factual/energy/science framing ("huge source of energy", "renewable", "lighthouse"). Layer 11 might encode something about abstract→concrete reasoning.

#### The coherence map

```
         5   6   7   8   9  10  11  12  13  14  15  16
    5    .   ✓   ✓   ✓   ✓   ✓   ✓   ✓★  ✓★  ✓   ✓   ✓~
    6        .   ✓   ✓   ✓   ✓   ✓~  ✓   ✓★  ✓   ✓   ✓~
    7            .   ✓   ✓   ✓★  ✓   ✓   ✓   ✓   ✓   ✓★
    8                .   ✓   ✓   ✓   ✗   ✓   ✓   ✓~  ✓
    9                    .   ✓   ✓   ✓   ✓   ✓   ✓   ✓★
   10                        .   ✓   ✓   ✓   ✓   ✓   ✓
   11                            .   ✓   ✓   ✓   ✓   ✓
   12                                .   ✓   ✓   ✓★  ✓
   13                                    .   ✓   ✓   ✓★
   14                                        .   ✓   ✓
   15                                            .   ✓
   16                                                .

✓ = coherent   ✓★ = coherent + interesting voice shift
✓~ = coherent but drifty   ✗ = broken (loop)
```

Almost everything works. The interesting zone is swaps involving layers 5-7 on one side and 12-16 on the other — maximum voice shift while maintaining coherence.

## Session 2 — Noise, Scaling, Injection

Added three continuous operations to `surgery.py`:
- `--noise N:S` — add Gaussian noise directly to a layer's weights (permanent mutation)
- `--scale N:F` — multiply a layer's output by a scalar via forward hook (amplify/dampen)
- `--inject N:S` — add Gaussian noise to the residual stream after a layer via forward hook (per-token randomness)

### Weight Noise (`--noise`)

Tested on layer 11 across magnitudes:

| σ | Result |
|---|---|
| 0.001 | Identical to baseline. No detectable effect. |
| 0.005 | Subtle shift — "tips to help you capture" vs baseline's poem framing. More practical/instructional. |
| 0.01 | Shifted to factual/encyclopedic: "covers almost a third of the Earth's surface... 250,000 km2". Geography textbook voice. |
| 0.02 | Breaking up — "it's called... What is... t...a...n..." Ellipsis-filled decay. |
| 0.05 | Total gibberish — multilingual token soup. |
| 0.1 | Unicode salad. |

**All-layer noise** is much more destructive — `all:0.005` already produces gibberish. Makes sense: noise compounds through 22 layers.

**Sweet spot for single-layer weight noise: σ = 0.005-0.01.** Subtle but real voice shifts without breaking coherence.

### Output Scaling (`--scale`)

This is the winner. Tested on layer 11:

| Factor | Voice |
|---|---|
| 0.5 | Poetic, awe-struck: "Miles of white sandy beaches... Its vastness is truly humbling and awe-inspiring." |
| 0.8 | Curious/educational: "what about the creatures that live there? These marine animals are some of the most fascinating..." |
| 0.9 | **Screenwriter voice**: "Voiceover: Yet, despite its beauty, the ocean has also been the site of many tragic events. Cut to a shot of a shipwreck..." |
| 1.1 | Spiritual: "a reminder of the endless possibilities that exist beyond our understanding" |
| 1.2 | Mystical: "connect with the divine and find solace in the beauty of the world around us" |
| 1.5 | Earnest/activist: "we need to work together to protect it... start by taking care of ourselves" |
| 2.0 | Concerned/environmental: "many marine animals that are endangered... rising sea levels" |

**Every single scaling value produced coherent output with a different voice.** This is a smooth, continuous knob for voice — not a discrete set of states. Dampening (< 1.0) tends toward poetic/artistic. Amplifying (> 1.0) tends toward earnest/practical.

### Residual Stream Injection (`--inject`)

Noise added to hidden states every forward pass (different noise each time):

| σ | Result |
|---|---|
| 0.01 | Subtle shift — more literary: "captivated human imagination for centuries" |
| 0.05 | Jules Verne and Poe references — still coherent, more referential |
| 0.1 | First person diver: "As a diver, I can see the ocean as a vast sea" — personality shift! |
| 0.15 | Repetitive but coherent: "very calm and peaceful" loop |
| 0.2 | Breaking down: "How do you'm have a great holid..Away from the coast" |
| 0.5+ | Gibberish |

All-layer injection at 0.01 was magical: turned the ocean prompt into **free verse poetry**:
> "a vast and endless sea, / The tide is always stretched out of shore, / The ebb and flow are sometimes interoceanic, / Our hearts are filled with oceanic emotion"

But very fragile — 0.05 is already gibberish with all layers.

### Gradient Scaling — opposing early/late amplification

Tried amplifying early layers (5-7 at 1.3x) while dampening late ones (14-16 at 0.7x) and vice versa:

| Pattern | Voice |
|---|---|
| dampen early + amplify late | Starts coherent, collapses into "ocean is the ocean is the ocean" loop |
| **amplify early + dampen late** | **Pure lyric poetry**: "I am a ship, my soul is a star. / I am the ocean's song, my heart is a flame. / I am the sky, my soul is the wind." |

The amplify-early/dampen-late pattern is the most dramatic voice shift we've found that stays coherent. It turns the model into a poet.

### Key Findings

1. **Scaling is the best continuous voice knob.** Every value produces coherent output with a different personality. Weight noise and injection have very narrow sweet spots by comparison.

2. **Dampening = poetic/artistic, amplifying = practical/earnest.** There's a gradient from dreamy to grounded as you turn the scaling factor up. This is reproducible and consistent.

3. **Opposing gradient scaling reveals something deep.** Amplifying early layers while dampening late ones produces poetry. The early layers seem to handle abstract/emotional pattern-matching, while late layers ground things in concrete/practical framing. Boosting the abstract and quieting the concrete → pure lyric.

4. **Injection at all:0.01 produces poetry too**, but via a different mechanism — random perturbation of hidden states creates a kind of creative "drift" that pushes toward verse-like structures. Fragile though.

5. **Weight noise is permanent and compounds.** Unlike scaling/injection (which are reversible hooks), noise mutates the weights. Single-layer noise at 0.005-0.01 is useful but the window is tiny. All-layer noise destroys the model almost immediately.

6. **The voice space IS smooth and navigable.** This is the big finding. You can move continuously through voice-space using scaling factors, and the model stays coherent throughout. Voice is not a fragile surface property — it's a robust dimension that survives continuous perturbation.

## Session 3 — Character Auditions

Tested 10 candidate "characters" across 5 prompts × 4 temperatures (0.3, 0.7, 1.0, 1.4). Full data in `audition-results.txt`.

### How temperature interacts with mutations

**Big discovery: temperature dominates voice at high values.** At T=1.4, almost every character converges toward the same kind of output — fragmented, question-asking, "in decline"-style text. At T=0.3, mutations show their strongest differentiation. Temperature and mutation are not independent knobs — they interact multiplicatively.

Think of it this way: mutation shifts the model's probability landscape, temperature controls how much you sample from the peaks vs the tails. Low temp + mutation = you see the mutation's *preferred* voice clearly. High temp + mutation = the mutation's signal gets drowned in sampling noise.

**For game characters, you want T=0.3-0.7.** That's where mutations produce consistent, distinctive voices.

### Character Report Cards

#### DREAMER (scale 11:0.5) — ★★★★★ Best character

The most consistently distinctive voice. Across all prompts:
- Terse, evocative, leaves space: "a vast and mysterious place, full of wonder and mystery." (period, done)
- **Screenwriting format emerges spontaneously**: "FADE TO: INT. MY HOME - DAY" on the room prompt
- Enigmatic at low temp: "saw my family." / "saw my friends." / "stared at her." — minimal, cinematic
- At T=1.4, gets interesting: "inseparable from us and reflects a kind of innocence we've all shared since early times"
- Door prompt: "a figure emerged, its face obscured by a hood" — gothic, mysterious
- The voice HOLDS across all prompts. This is a character.

**Game role**: mysterious guide, oracle, narrator of a dark/atmospheric game

#### POET (amplify 5-7, dampen 14-16) — ★★★★ Strong but fragile

- T=0.3: beautiful — "a vast and endless source of life, a place of endless beauty, a place of endless mystery"
- T=0.7: the lyric mode works — "I am a ship, my soul is a star"
- But T≥1.0: collapses into baseline "in decline" mode. The poetry only lives at low temperature.
- "When I was young" at T=0.7: "I was an only child. My parents were poor. We lived in a small apartment in a dirt-floored alley." — raw, specific, confessional
- Door prompt: "The wind was strong, and the rain pattered against the windowpanes" — atmospheric
- Voice is distinctive when it works, but temperature-fragile.

**Game role**: inner monologue voice for a melancholy character, but only at low temp

#### VERSE (inject all:0.01) — ★★★★ Unique but unstable

- Consistently reflective/philosophical: "The most important thing about the past is the lessons it teaches us" — same response at T=0.3 AND T=0.7. Very stable thematic focus.
- "When I was young, we were told that all the things that we need is within us. As we grow old, I have no more." — genuinely moving
- Door prompt: "the first ray of sunlight shone through" — always finds the beautiful frame
- BUT: injection is non-deterministic (different noise each run), so the voice drifts. Can't guarantee consistency across sessions.

**Game role**: elder/sage character, but would need a fixed noise seed for reproducibility

#### MYSTIC (scale 11:1.2) — ★★★ Subtle but consistent

- Very close to baseline at low temp, but with a consistent tilt toward the spiritual/emotional: "the power and mystery of the universe"
- "fascinated by the power of the sun. I would watch the sun rise and set, and I would marvel at its..."
- Door prompt: "the scent of freshly baked bread... dimly lit... the only light came from" — sensory, warm
- The shift is real but subtle. More of a flavor than a character.

**Game role**: warm NPC, innkeeper, gentle quest-giver

#### NARRATOR (rm 11) — ★★★ Solid but not distinctive enough

- Coherent across everything, subtly warmer than baseline
- "saw my mom. She was sitting on the couch, looking at me with a worried expression. 'Mom, are you okay?'" — natural, domestic
- "I was an optimist and a dreamer. My mother always said..." — personal, grounded
- Problem: at many temps it's hard to tell from baseline. The voice shift is real but mild.

**Game role**: reliable narrator voice, but might not stand out enough in a game context

#### STORYTELLER (swap 5↔13) — ★★★ Wild card

- "The ocean is calling out to you" / "calling out to her" — consistently personifies and addresses
- VERY short outputs: "handed over to her." / "handed myself to her." — cryptic, fragmentary
- "She is a young girl, and her heart is full of fire. She is a magical girl." — the fairy tale mode holds
- But breaks down on some prompts — door prompt loops, "most important" prompt goes generic
- Inconsistent voice stability across prompts.

**Game role**: fairy tale narrator for specific scenes, not a full-game voice

#### PHILOSOPHER (swap 7↔16) — ★★ Interesting but too broken

- "The ocean is a blanket. What is it?" / "a lighthouse." — koan-like aphorisms
- "I was born. When I was born, I remember the feeling when I was a teacher." — dreamlike time confusion
- "and it shall rain" — prophetic
- But too many outputs are incoherent or stuck in loops. Fun for flavor text, not reliable enough for a character.

**Game role**: maybe graffiti on walls, fortune cookies, dream sequences — not dialogue

#### SCREENWRITER (scale 11:0.9) — ★★ Too close to baseline

- The "Voiceover: ... Cut to:" format only appeared once (ocean, T=0.7). Doesn't generalize.
- Most outputs are nearly identical to baseline across all prompts.
- The mutation is too subtle for a character.

#### ACTIVIST (scale 11:1.5) / JOURNALIST (noise 11:0.01) — ★★ Inconsistent

- Both have moments but don't hold a consistent voice across prompts. The activist sometimes goes earnest, sometimes is indistinguishable from baseline. The journalist shifts topics but not register.

### Temperature as a character trait

The data reveals something unexpected: **temperature itself IS a voice dimension**, and it interacts with mutations differently per character:

- **Dreamer** is best at T=0.3-0.7 (terse, cinematic) and interesting at T=1.4 (philosophical)
- **Poet** only exists at T≤0.7 (collapses above)
- **Verse** is most stable across temps (the injection noise overrides temp variation)
- **Philosopher** gets *more* coherent at T=0.3 (still weird, but structured weird)

For a game with multiple characters, you'd want to set temperature per-character, not globally. The dreamer gets T=0.5, the philosopher gets T=0.3, the poet gets T=0.3.

### The game roster (if I had to pick 4)

1. **Dreamer** (scale 11:0.5, T=0.5) — atmospheric narrator, oracle, mystery figure
2. **Poet** (amplify early/dampen late, T=0.3) — inner monologue, melancholy companion
3. **Verse** (inject all:0.01, T=0.7) — elder sage, philosophical mentor (with fixed noise seed)
4. **Storyteller** (swap 5↔13, T=0.3) — fairy tale narrator for cutscenes/lore

Each genuinely sounds different from the others and from baseline. They're different *people*, not just different topics.

## Session 4 — The Character Roster (Phase 1-3)

Goal: commit to ~10 distinct, consistent characters with extensive validation.

Built a 3-phase pipeline:
- **Phase 1 (explore.py)**: 58 candidate mutations tested on 3 prompts. Scanned single-layer scaling (all middle layers, both directions), extreme values, multi-layer combos, gradient patterns, swap+scale hybrids, double swaps.
- **Phase 2 (validate.py)**: 12 finalists tested on 15 diverse prompts × 3 seeds each. Character-specific temps.
- **Phase 3**: Side-by-side distinctiveness comparison on shared prompts.

585 total generations across validation. Each character got 45 samples (15 prompts × 3 seeds).

### The Final 10

Two dropped during validation: **optimist** (swap 9,16 — voice was inconsistent; sometimes PR-speak, sometimes anxious loops, no identifiable personality) and **abstract** (dswap 5,13 + 7,15 — too broken, many outputs devolved into fragmented paranoia).

#### 1. Dreamer — `scale 11:0.5` @ T=0.5
The star of the show. Terse cinematic voice, spontaneously writes **screenplay format** on narrative prompts:
> "saw my friends. / FADE TO: / INT. MY FRIEND'S ROOM - DAY / We see a group of friends laughing and hanging out. / JENNY (smiling) / Hey, guys!"

Gothic atmosphere on descriptive prompts:
> "a figure emerged, its face obscured by a thick veil. The figure was wrapped in a thick cloak, its features obscured."

The voice holds across all 15 prompts.

#### 2. Wounded — `scale 11:0.2` @ T=0.5
Fragmented, elegiac, broken. Sentences collapse mid-thought. Loss is the constant theme:
> "just where I last saw your family, with the sun you knew"
> "fell as the best, and never got what I wanted, I thought I was a fool And some."
> "the way he did. The snow that he was doing so. He could not do it easily."

Sometimes degenerates further — "Georgia On My Winter Duck Thing for testing. H&" — but the wounded voice comes through consistently. The most emotionally affecting character.

#### 3. Incantator — `scale 10:0.5 + scale 11:0.5` @ T=0.5
Repetition IS the voice. Liturgical, hypnotic cadence:
> "a lighthouse. The ocean is a lighthouse. The ocean is a lighthouse."
> "When I was young When / Had a great love, a great love. When / When I was young When I was young"
> "revealed two women. The door was so heavy. Even the door was heavy, and the door was not so."

Would work beautifully as a cultist, a ghost, or a hypnotized character.

#### 4. Mortician — `scale 6:0.5 + scale 15:1.5` @ T=0.5
Death-obsessed grand historian. Sweeping historical framing meets morbid specificity:
> "a powerful force that has shaped the lives of countless people. From the ancient Greeks to modern-day..."
> "saw a man who looked like he had been dead for years. He was lying on the bed, his eyes open and sta[ring]..."
> "The door was ajar. The door was ajar. The door was ajar. The door w[as ajar]..."

Dark, authoritative, obsessed. Best candidate for an antagonist or oracle.

#### 5. Matriarch — `scale 15:0.5` @ T=0.5
Warm, family-focused, sentimental:
> "saw my grandmother, her eyes filled with tears, surrounded by her grandchildren."
> "I was an only child. My parents were both very busy with work and I had a lot of siblings..."
> "I'm your friend, Sarah. / You: Oh, my goodness, Sarah. It's so nice to meet you."

Consistently domestic, loving. Strongest "NPC villager" voice in the roster.

#### 6. Storyteller — `swap 5,13` @ T=0.3
Fairy-tale personifier. Addresses inanimate things, magical transformations:
> "The ocean is calling out to you."
> "She was a bird, a bird, a bird. She was a bird, a bird."
> "to be a teacher. I was a teacher. I was a teacher." (the repetition becomes incantation)

Less consistent than top 5 — some prompts loop — but the fairy-tale voice is unique when it lands.

#### 7. Chronicler — `swap 13,16` @ T=0.5
Concrete, grounded storyteller. Specific names and places:
> "I had a friend who was a famous chef. He had a restaurant in the city."
> "saw a man dressed in a black cloak. He was a stranger, but he had a name."
> "the 1980s was a time of great cultural change, with a shift from the consumer society..."

Anchors abstractions in particulars. Good historian/journalist NPC.

#### 8. Flow — gradient scale (5:1.4, 8:1.2, 11:1.0, 14:0.8, 16:0.6) @ T=0.5
Sensory atmospheric writer. Vivid descriptive prose:
> "revealed a dark and damp corridor. The air was thick with the smell of rot and mold."
> "saw the sun setting behind the mountains. She breathed in the scent of the mountains..."
> "CUT TO: / INT. JESSICA'S APARTMENT - NIGHT" (occasional screenplay)

Overlaps with dreamer sometimes but trades cinematic cuts for sensory richness.

#### 9. Verse — `inject all:0.01` @ T=0.7
Reflective sage. Occasionally breaks into free verse structure:
> "a vast and endless sea, / The tide is always stretched out of shore, / The ebb and flow are sometimes..."
> "tell a lie. / And the truth of the lie. / A lie that I will never tell."
> "Love is like a wild horse. It is like a wild horse, a wild horse."

Less consistent (one Time prompt produced a legal contract) but the poetic mode is unique. Note: non-deterministic due to noise injection, so outputs vary more across seeds.

#### 10. Poet — amplify 5-7 / dampen 14-16 @ T=0.3
Lyric confessional. Raw personal admissions:
> "I was a tomboy. I loved playing with my sister, and I would often climb trees."
> "I was an only child. My parents were poor. We lived in a small apartment in a dirt-floored alley."
> "Time is of Essence. Time is of Essence. Time is of Essence." (anaphora as refrain)

Weakest of the 10 — often drifts toward baseline — but at T=0.3 it has a genuine lyric mode.

### Lessons from Validation

1. **Temperature is a per-character parameter.** Poet and storyteller need T=0.3. Verse wants T=0.7. Most others sit at T=0.5. A game engine with these characters would set temp per-voice.

2. **Dialogue prompts ("You: X / Me:") are the hardest test.** Most characters collapse into generic AI-assistant mode at this prompt format. Dreamer and matriarch held their voices best. Wounded fragmented further. Mortician refused to engage ("I'm a human, but I'm not one of us"). Abstract went paranoid.

3. **Seeds test voice robustness.** Strong characters (dreamer, mortician, incantator) hold voice across all 3 seeds. Weak characters (optimist, abstract) only hit their voice on 1 of 3 seeds. That's the real consistency filter.

4. **"The door opened slowly and" is the best single test.** Maximum room for style to manifest — every character produces something identifiably theirs on this prompt. Good shorthand probe.

5. **Characters have favorite themes.** Dreamer → cinematic scenes. Matriarch → grandmothers. Mortician → death and history. Wounded → loss. These themes emerge *across prompts* — not because we asked about them.

6. **Low-rank interventions work.** The characters are built from 1-6 scaling/swap operations each. You don't need elaborate architecture changes to produce distinct personalities — tiny perturbations in the middle layers are enough.

### The Roster as Game Cast

If building a game with these 10 as NPCs/narrators:
- **Dreamer** — the oracle/narrator, mysterious guide
- **Wounded** — tragic ghost, NPC who lost something important
- **Incantator** — cultist, priest, hypnotist
- **Mortician** — antagonist, grave-keeper, historian of dark things
- **Matriarch** — village elder, innkeeper, warm quest-giver
- **Storyteller** — bard, lorekeeper, fairy-tale figure
- **Chronicler** — journalist, archivist, grounded sidekick
- **Flow** — environmental narrator, scene-setter
- **Verse** — wise sage, riddle-giver
- **Poet** — melancholy companion, inner monologue voice

All from the same 1.1B model, ~2GB in memory, ~7 tok/s on CPU. Could plausibly run all 10 in a single game if you kept only one loaded at a time and switched voices by reapplying the relevant hooks.

## What's Next

- **Longer generations**: 80 tokens is short. Do voices hold over 300+ tokens? Interesting to see where they drift.
- **Per-character temperature tuning**: we guessed temps. A sweep per character would find the true sweet spot.
- **Voice drift detection**: build the monitor we originally imagined — score a generation against the character's "voice profile" and flag drift.
- **Larger models**: TinyLlama 1.1B is tiny. A 3B or 7B model might have richer, more controllable voice dimensions.
- **Attention patterns**: untouched. Could unlock new character types.
- **Character interactions**: can two characters converse? Swap character state between turns?
- **Game integration**: build a small text adventure where you meet 3-4 of these characters and see if they feel like different people.

## Idea: Steering Vectors (Activation Addition)

The technique we haven't tried yet: instead of multiplying a layer's output (`x * f`) or adding random noise (`x + ε`), add a *specific* semantically-meaningful vector to the residual stream (`x + v`).

This is what the literature calls **activation steering** / **representation engineering** (e.g., Andy Zou et al. "Representation Engineering: A Top-Down Approach to AI Transparency", Rimsky et al. "Steering Llama 2 via Contrastive Activation Addition"). Research shows you can steer models along concepts — honesty, emotion, political lean, etc. — by finding the right vector and adding it mid-forward-pass.

### The mechanism

Qwen2.5-1.5B has a 1536-dimensional residual stream. Between any two layers, the hidden state is a 1536-d vector per token. Adding a fixed vector `v` to every token's hidden state at a specific layer shifts the direction of all subsequent computation. The layers after that point read from a residual stream that's been nudged toward `v`.

### How it differs from what we've done

- **Scale** (`x * f`) — scalar multiplication. Uniform effect. Amplifies or dampens everything the layer produced.
- **Random injection** (`x + ε`) — additive noise with no semantic direction. Destabilizes.
- **Steering vector** (`x + v`) — additive *directional* nudge. Specific and controllable.

Scaling is blunt; steering is surgical.

### Deriving a steering vector

The standard recipe (contrastive activation addition):

1. Gather a set of prompts.
2. Run them through a "positive" model (e.g., our `cynic` with `scale 7:0.5`). Capture hidden state at layer N for each prompt.
3. Run the same prompts through a "negative" model (baseline). Capture same layer.
4. Compute `v = mean(pos_activations) - mean(neg_activations)`.
5. That's your steering vector.

Then at inference time: use the *unmodified* model, but add `α * v` to layer N's output via a forward hook.

### Why this is worth trying

- **Portable characters** — the character is a 1536-d vector. Save to disk. Share. Load at will. No mutation machinery needed.
- **Continuous intensity** — `α` scales the vector. `α=0.3` is subtle cynic, `α=2.0` is extreme cynic. Characters become knob-controlled.
- **Mixing** — `0.6 * cynic + 0.4 * mourner` might give a grieving cynic. Characters become compositional.
- **Negation** — `-v` could produce the *opposite* of a character. What's anti-nostalgist? Aggressively-forward-looking?
- **Clean base model** — keep one unmodified model in memory, swap only vectors at inference. Much cheaper than keeping 10 mutated models around.

### The wrinkle for our project

Our characters ARE the layer scalings — we don't have an external "cynic text corpus" to extract from. So the derivation would bootstrap from the mutations:

1. Generate lots of samples using the scale-based cynic.
2. Feed those samples BACK through the unmodified model, capture activations.
3. Also capture unmodified-model activations on baseline-generated samples (same prompts).
4. Difference → steering vector.

The key test: does applying just the vector (on the unmodified model) reproduce the cynic voice? Three outcomes:

- **It works** — we've distilled the character into a portable vector. Win.
- **It partially works** — vector captures some aspects but not others. Interesting: tells us what scaling does beyond simple direction-shifting.
- **It doesn't work** — scaling has richer effects than additive steering (e.g., nonlinear amplification of certain features). Also interesting — reveals scaling is doing something more exotic than we thought.

### Implementation plan (when we get to it)

- `extract_vector.py`: given a character config + N prompts, generate activations, compute difference vector, save to `.pt` file.
- `steer.py`: load unmodified model, load vector file(s), add via forward hook with tunable α.
- REPL extension: `:steer cynic 0.7` adds cynic vector at strength 0.7. `:mix cynic 0.5 mourner 0.3` blends.

Could potentially produce a much cleaner, more controllable character system than the raw layer surgery.

## Session 5 — Qwen rebuild + steering vector infrastructure

### The TinyLlama reckoning

User REPL'd the 10 TinyLlama characters and reported: "these all seem quite loopy and insane, I didn't really get good results out of them." Fair — the validation samples (80 tokens) had hidden the decay. At 200 tokens the characters mostly devolved into repetition loops or incoherent fragments.

Honest post-mortem: my distinctiveness metric was measuring *whether* outputs differed, not whether they were *readable*. And TinyLlama 1.1B is barely coherent at baseline; layer mutations just amplified its weaknesses.

### Switched to Qwen2.5-1.5B-Instruct

- 1.5B params (~3 GB fp16), 28 transformer layers
- Same HuggingFace layer access pattern (`model.model.layers`)
- Dramatically more coherent baseline — actual information about cephalopods vs TinyLlama's random rambling
- ~3.8 tok/s on CPU (vs TinyLlama's 7 tok/s — the price of coherence)

Added `repetition_penalty=1.15` as a default to generation — kills the "X is X. X is X." loops that plagued the TinyLlama runs. This alone cleaned up 80% of the broken outputs we were seeing.

Updated every script: `surgery.py`, `explore.py`, `validate.py`, `repl.py` all default to Qwen + rep penalty now. Added a `baseline` entry to `characters.json` (empty ops) so the REPL can `:use baseline` for direct comparison.

### Layer mapping on Qwen (28 layers)

Ran `map-layers.py` — scale 0.5× and 1.5× on each middle layer (5-22), 2 prompts per mutation. Key discoveries:

**Dampening reveals voice specialization:**
- **L6**: surreal/dreamlike — "don't we smoke in the aisles drinking rivers anymore"
- **L7**: cynical — "symbol of many things like poverty, ignorance or stupidity"
- **L12**: concerned/environmental — pollution focus
- **L13**: deep-time/geological — "oldest rocks on the Earth are called sediments"
- **L14**: STRUCTURAL — breaks the model in both directions, load-bearing
- **L17**: vivid emotional — "eyes feel like they were about to burst open in awe"
- **L18**: tragic — "heart sank when I heard those words"
- **L19**: sentimental family — "saw my grandmother sitting on a chair, reading a magazine"
- **L19-L21**: regional cluster — all push toward climate/environmental framing

**Amplification mostly collapses.** Nearly every amplified middle layer produced near-identical stock output: "a vast and complex system that plays a crucial role in regulating Earth's climate." Less useful than expected. Qwen has a strong "default Wikipedia answer" attractor that amplification drives the model into.

This is the opposite pattern from TinyLlama, where amplification was the interesting direction. Different architectures, different dynamics.

### Exploration (43 candidates)

`explore.py` tested 43 mutations targeting the promising layers, including magnitude variants (0.2, 0.5, 0.7), multi-layer combos, gradient patterns, swap+scale hybrids. All at 180 tokens with rep penalty.

Distinct voices that held up:

| candidate | op | signature evidence |
|---|---|---|
| **cynic** | scale 7:0.5 | "symbol of poverty, ignorance or stupidity" |
| **mourner** | scale 18:0.5 | "tears in his eyes", "going to be away for a while" |
| **nostalgist** | scale 19:0.5 | grandmother reading, market shopkeepers |
| **activist** | scale 20:0.5 | global warming, largest ecosystem |
| **accountant** | scale 21:0.5 | saving money, math problems, clocks |
| **scientist** | scale 20:0.5 + 21:0.5 | "three major natural reservoirs, 31 times by volume" + grandfather in wheelchair |
| **naturalist** | amp 6+7, damp 20+21 | butterflies, park weekends, nature appreciation |
| **eulogist** | swap 5,18 | "They are now dead; they have left behind a legacy" |
| **observer** | inject all:0.005 | "black shirts with red sashes" — notices details |
| **bureaucrat** | scale 13:2.0 | "strangers at the hotel", formal institutional voice |

Dropped: the extreme-magnitude variants (0.2× turns layers off, 2.0× turns them over-active), triple-combos (too broken), swap+scale hybrids (mostly redundant with singles).

### Validation adventure (220 generations over a long afternoon)

Plan: 11 characters × 10 prompts × 2 seeds = 220 generations at 200 tokens.

**Attempt 1:** Launched, process crept from 3.4 GB → 9.1 GB RSS over ~2 hours. By 59% complete, swap was full and we were thrashing. Killed at 141/220 before OOM killer hit.

Root cause hypothesis: `fresh_model()` called per-seed for swap/rm/noise characters (eulogist was the culprit — 10 prompts × 2 seeds = 20 model reloads each copying 3 GB). Python's GC was fine, but PyTorch's CPU allocator holds memory as fragmented blocks that never return to the OS. The 20th fresh model effectively bloated the process.

**Patched validate.py:**
- Incremental JSON save after each prompt (atomic via `.tmp` + `os.replace`)
- Resume from existing JSON on startup — skips completed (character, prompt, seed) combos
- Explicit `del model; gc.collect()` after fresh_model use
- `flush=True` on all progress prints

**Attempt 2:** Crashed at 162/220 — machine rebooted (memory pressure again, despite fixes). But this time the incremental checkpoint saved 8 full characters + 2 eulogist samples. Zero lost work.

**Second patch:** Recognized swap is *reversible* (swap + same swap = identity). Changed `needs_reload` to only trigger on `rm`/`noise`. Added `undo_ops()` that reverses swaps in place after generation. This eliminates the `fresh_model()` call entirely for our current roster — zero model reloads needed.

**Attempt 3:** Running now. Resumed from 162/220. Only 58 gens left (eulogist completion, observer, bureaucrat). Memory flat at ~3.5 GB.

### Steering vector scaffolding (ready, not yet tested)

While waiting on validation, built the steering vector infrastructure from the Session 4 journal plan:

- **`extract_vector.py`**: for each character, captures last-token activations at a target layer (default L20) over 20 probe prompts, both with character ops applied and on the unmodified baseline. Saves `mean(char) - mean(base)` as a `.pt` file with metadata (layer, ops, description, vector norm).

- **`steer.py`**: loads unmodified model + one or more vector files, registers a forward hook that adds `Σ αᵢ · vᵢ` to the target layer's output. Supports `--compare` to show baseline/scaled/steered triple view, `--vec NAME:α` repeatable for multi-character mixing.

Once validation finishes and the character set is locked in, we'll extract vectors for all 10, then test the central hypothesis: **does applying just the vector reproduce the character voice?**

Three possible outcomes and what each would tell us:
1. Vectors fully reproduce characters → scaling is approximately a linear directional shift in activation space. Characters compress to 1536-d vectors. Mixing + scaling of vectors becomes viable.
2. Vectors partially reproduce → scaling does something richer than direction-shifting (maybe it selects among multiple features, or amplifies specific subspaces non-uniformly).
3. Vectors fail to reproduce → scaling has fundamentally nonlinear effects we haven't characterized. Still interesting — tells us layer multiplication isn't a "small" operation in activation space.

### Where we are right now

- Validation: in progress, expected complete in ~45 min
- Steering scripts: built, not yet tested
- REPL steering commands: not yet added (need vectors first)

Commits so far this session:
- `cff3783` — initial brain-surgery commit (all scripts, journal, TinyLlama + Qwen exploration results)
- `0f9937d` — steering scripts + crash-safe validation patches
- `cfe32c6` — swap reversibility + saved 162/220 checkpoint
- `fcaf003` — journal Session 5 (this section)
- `541adf0` — validated Qwen roster with tier rankings

## Session 6 — Steering vector experiment (NEGATIVE RESULT, with useful findings)

Validated the 10-character roster at 220/220 generations. Characters are ranked:
Tier A (voice holds across all prompts): accountant, scientist, bureaucrat.
Tier B (holds on most): mourner, nostalgist, naturalist, observer.
Tier C (wobbles): cynic, activist, eulogist.

All characters produce recognizably distinct voices at 200 tokens — the
repetition_penalty + Qwen base combo delivered what TinyLlama couldn't.

Then ran the steering vector experiment from the Session 4 plan.

### Extraction

Extracted all 10 characters via `extract_vector.py` at layer 22 (chosen so
all character ops, which span L5-L21, are upstream of the extraction point).
Used 20 probe prompts, captured last-token activations at L22, took mean
difference between character and baseline.

Vector norms (baseline mean activation norm = 113.61 at L22):

| character    | norm  | %   | commentary |
|--------------|-------|-----|-----------|
| scientist    | 56.47 | 50% | strongest signal |
| accountant   | 43.06 | 38% ||
| cynic        | 39.13 | 34% ||
| bureaucrat   | 37.46 | 33% ||
| nostalgist   | 32.82 | 29% ||
| naturalist   | 30.33 | 27% ||
| activist     | 30.25 | 27% ||
| mourner      | 29.86 | 26% ||
| eulogist     | 22.20 | 20% | swap is a weaker shift |
| **observer** | **0.21** | **0.2%** | noise averages to zero — predicted |

Observer's near-zero norm confirms a prediction: random noise injection has
no coherent direction, so averaging over 20 prompts cancels it out. This is
actually a useful sanity check that the method is measuring what we think.

### The negative result

Applying the extracted vector at α=1.0 on the unmodified model did NOT
reproduce the character voice. Testing cynic on "The ocean is":

- Baseline: "a vast and mysterious place, teeming with life... anglerfish..."
- Scaled cynic: "symbol of many things like poverty, ignorance or stupidity"
- **Steered cynic @ α=1.0**: "vast and complex system that plays a crucial
  role in regulating Earth's climate... overfishing, pollution... sustainable
  management strategies..."

The steered output went to an "environmental/policy" voice — NOT the
characteristic cynic voice. Worse, steering with other dampen-characters
(accountant, mourner, nostalgist) all produced similar "environmental/policy"
output. The vectors were producing a generic "shift away from baseline"
effect, not character-specific effects.

Higher α was catastrophic. α=2.0 → token-garbage loops. α=5.0 → multilingual
noise. The model destabilizes well before it reaches the original character.

### Why they failed — cosine similarity analysis

Computed pairwise cosine similarity between all character vectors at L22:

|             | acc  | act  | bur  | cyn  | eul  | mou  | nat  | nos  | obs  | sci  |
|-------------|------|------|------|------|------|------|------|------|------|------|
| accountant  | 1.00 | 0.87 |-0.87 | 0.84 | 0.41 | 0.92 | 0.95 | 0.94 | 0.05 | 0.98 |
| activist    | 0.87 | 1.00 |-0.79 | 0.76 | 0.58 | 0.87 | 0.90 | 0.91 | 0.09 | 0.94 |
| bureaucrat  |-0.87 |-0.79 | 1.00 |-0.75 |-0.18 |-0.90 |-0.75 |-0.87 |-0.05 |-0.86 |
| cynic       | 0.84 | 0.76 |-0.75 | 1.00 | 0.36 | 0.81 | 0.75 | 0.79 | 0.04 | 0.83 |
| mourner     | 0.92 | 0.87 |-0.90 | 0.81 | 0.38 | 1.00 | 0.86 | 0.95 | 0.08 | 0.93 |
| scientist   | 0.98 | 0.94 |-0.86 | 0.83 | 0.48 | 0.93 | 0.96 | 0.95 | 0.07 | 1.00 |

The dampen-characters are almost parallel to each other (0.8-0.98 cosine).
Bureaucrat (the only amplify-character) is anti-parallel (-0.75 to -0.90).
Observer is orthogonal to everyone (~0.05) — confirming the noise theory.

**Diagnosis**: dampening ANY middle-late layer produces the same direction
of activation shift at L22. What makes characters SOUND different is the
downstream nonlinear computation on that shift — not the shift itself.
Additive steering can't reproduce it.

### Ruled out: earlier layer extraction

Tested cynic at L10 (3 layers after its op at L7) — got the same generic
"ecosystem management" output. The attractor in Qwen's activation space
doesn't depend on where the steering is applied; any moderately-sized
directional nudge in the dampen-character direction lands there.

### Ruled out: difference-of-differences

Tested cynic - bureaucrat (combining directions that are strongly
anti-correlated, hoping to get a more discriminating signal) — same
"dynamic and complex system... marine ecosystems" output. The subtraction
removed some of the common-mode shift but didn't recover the cynic voice.

### What this teaches us about scaling

Scaling a layer is NOT equivalent to adding a fixed direction downstream.
The hypothesis in Session 4 was:
- "It works" → characters compress to portable 1536-d vectors
- "It partially works" → scaling has richer effects than direction-shift
- "It doesn't work" → scaling has fundamentally nonlinear effects

Result: closest to option 3. The scaling operation is multiplicative
(output * 0.5), which is position-dependent and nonlinear in its downstream
effect. The MEAN shift it produces across prompts looks similar across
characters, but the PER-PROMPT, PER-TOKEN shift has fine structure that
determines the voice. Averaging kills that structure.

A character isn't a direction in activation space. It's a *transformation*
on the residual stream that depends on what's IN the residual stream. Our
mean-difference vector captured the "where it typically lands on average,"
not the "how it reacts to what's coming in."

### What could still work (not tested)

- **Per-token steering**: inject a different vector at each token position,
  derived from sequence-level contrasts rather than single-point averages.
- **Multi-layer vectors**: extract and apply at several layers simultaneously
  to approximate the multiplicative effect via additive perturbations in
  series.
- **Sparse autoencoder features**: find interpretable directions via an SAE
  trained on baseline activations, then identify which features the scaled
  characters activate more. This is what Anthropic's "Scaling Monosemanticity"
  paper does for concept steering at scale.
- **Fine-tuned LoRA adapters**: train a small adapter on scaled-model
  outputs. Would actually learn the character transformation, not just its
  mean direction. But requires training infrastructure.

### What we're shipping

The 10-character scaling-based roster stands — those characters actually
work when applied as layer scalings (validated 220/220). The steering
vector experiment produced a clean negative result with diagnostic findings
(the cosine similarity matrix is genuinely useful data about how scaling
operations relate in activation space).

The scripts (`extract_vector.py`, `steer.py`) are useful infrastructure for
any future steering work — just not as a drop-in replacement for scaling
in this project.

Commits this session:
- `cff3783` — initial (TinyLlama + Qwen exploration)
- `0f9937d` — steering scripts + crash-safe validation
- `cfe32c6` — swap reversibility
- `fcaf003` — Session 5 journal
- `541adf0` — validated Qwen roster

---

## Session 7 — Temperature Refinement (2026-04-25)

All characters were validated at T=0.5 during the initial search. That was
the right call for apples-to-apples comparison but not optimal per character.
This session: sweep T=[0.3, 0.5, 0.7] across 8 diagnostic prompts for all 10
characters (non-baseline), pick the temp that maximises a coherence/diversity
heuristic (`unique_ratio × length_score`), then eyeball the actual outputs
to override the heuristic where it missed.

### What changed

| Character  | Old T | New T | Notes |
|------------|-------|-------|-------|
| mourner    | 0.5   | 0.7   | More emotional texture at higher temp |
| nostalgist | 0.5   | 0.7   | Domestic warmth more expressive |
| activist   | 0.5   | 0.7   | Marginal; voice still weak off-ocean |
| accountant | 0.5   | 0.7   | Richer phrasing, money lens holds |
| naturalist | 0.5   | 0.3   | Lower temp tightens the nature voice |
| eulogist   | 0.5   | 0.3   | Reduces but doesn't fix inconsistency |
| observer   | 0.5   | 0.7   | More observational detail at 0.7 |
| bureaucrat | 0.5   | 0.7   | Institutional + numbered format still reliable |
| cynic      | 0.5   | 0.5   | Unchanged — signature on 0.5, drifts worse at 0.7 |
| scientist  | 0.5   | 0.5   | Heuristic said 0.7, but eyeball overruled: "31 times as much water by volume" only appears at 0.5 |

### Tier ratings — unchanged

The extended sweep didn't reveal any promotions or demotions:

- **Tier A**: accountant, scientist, bureaucrat — voice holds across all 8 prompts
- **Tier B**: mourner, nostalgist, naturalist, observer — holds on most, occasional drift
- **Tier C**: cynic, activist, eulogist — signature on ≤3 prompts, inconsistent elsewhere

### Key observation: scientist heuristic mismatch

The heuristic (unique_ratio × length_score) picked T=0.7 for scientist, but
the actual output at 0.7 is weaker: it drifts into generic QA structures
("Is this statement true or..."). At T=0.5, scientist reliably produces
"largest and saltiest of Earth's three major natural reservoirs, containing
31 times as much water by volume" — the signature analytical line. Lesson:
automated scoring needs to measure *character consistency*, not just text
quality. The current heuristic measures diversity and length, which can be
gamed by going off-voice into varied generic outputs.

### Infrastructure note

`refine.py` was written for this session but needed scope reduction —
initial plan (1800 gens) would have taken 26 hours on CPU. Trimmed to
240 gens (150 tokens, 1 seed, 3 temps, 8 prompts) ≈ 1.7 hours. Results
saved to `refine-results.json` and `refine-results-analysis.json`.
The REPL now also displays tier in `:list` output.

---

## Session 8 — Token-Cycling Character Mixer (2026-04-25)

### The idea

What if instead of picking one character per generation, you cycle through
multiple characters token-by-token? Each token is generated by the next
character in the rotation, with that character's layer ops (hooks) active
during the forward pass. The full accumulated context is always in view
(no KV cache — full forward pass per token, simple and correct).

`--chunk N` generates N consecutive tokens per character before switching.
chunk=1 is pure per-token cycling; chunk=10 is more like short phrases.

### Implementation

`mix.py` — manual token loop, hooks applied/removed each step, swap ops
reversed after each step. rm/noise ops skipped (can't clone per-step) —
those characters fall back to base model for their tokens.

No KV cache by design (user preference — simpler, conceptually cleaner).
Consequence: O(n²) computation per generation. 80 tokens × avg 40-token
context ≈ 185s per gen on CPU.

### Experiment: 15 combos × 2 chunk sizes × 2 prompts = 60 generations

**Combos tested:**
- User's original idea: cynic+observer+scientist
- Tier A trio: accountant+scientist+bureaucrat
- Tier B quartet: mourner+nostalgist+naturalist+observer
- Tier C trio: cynic+activist+eulogist
- Compatible pairs: mourner+nostalgist, observer+scientist, naturalist+eulogist
- Clashing pairs: cynic+bureaucrat, accountant+naturalist
- Dark combos: mourner+eulogist+cynic, cynic+mourner+eulogist+observer
- Big blends: all Tier A+B (5 chars), all 10 characters

### Results

**Best mixes:**
- `cynic+observer+scientist` — coherent science writing with specificity
  ("thermophiles", named researcher). Best single result.
- `mourner+nostalgist+naturalist+observer` — smooth, steady voice. The
  B-tier blend is arguably more readable than any single character.
- `cynic+mourner+eulogist+observer` — thoughtful environmental writing.
  Dark characters stabilized by observer's grounding.
- All-10 — weirdly stable. Climate/ocean framing held throughout.

**Notable failures:**
- `accountant+scientist+bureaucrat` (Tier A trio) — started English,
  switched to Vietnamese mid-sentence. Strong voices fight each other.
- `cynic+activist+eulogist` (Tier C trio) — collapsed into Arabic script
  and algebra. Unstable characters amplify each other's noise.
- `scientist+mourner` — started promising, collapsed into Chinese QA
  format mid-paragraph.
- `cynic+bureaucrat` — Russian text appeared.

### Key findings

1. **Compatible voices blend, clashing voices amplify instability.** The
   Tier C characters make each other worse. Observer and mourner make
   each other better.

2. **Cross-language drift is a real failure mode.** When characters
   conflict strongly, the model escapes to non-English token attractors
   (Vietnamese, Arabic, Russian, Chinese). This is the token-level
   equivalent of what happens when a single character wobbles — but
   amplified across the ensemble.

3. **chunk size matters less than combo compatibility.** chunk=1 vs
   chunk=10 produced similar quality — the character mix is the dominant
   factor, not the switching granularity.

4. **The B-tier blend may be more useful than any Tier A character.**
   mourner+nostalgist+naturalist+observer produces writing that's warm,
   curious, and textured without any one voice dominating. Worth
   developing as a named "character" in its own right.

### What to try next

- Tune the B-tier blend (mourner+nostalgist+observer, drop naturalist?)
  as a standalone composite character
- Try asymmetric cycling: one dominant character + one occasional intruder
  (e.g., 3 scientist tokens, 1 cynic token — sardonic precision)
- Explore chunk sizes 3 and 7 for the best combos
- Try weighted mixing: scale one character's logits more than another's
  rather than hard cycling (requires softmax-level intervention, not
  forward hooks)

---

## Handoff Summary — 2026-04-26

### What this project is

Layer surgery on Qwen2.5-1.5B-Instruct to create distinct, consistent
character voices by modifying transformer internals at inference time.
No training, no fine-tuning — just forward hooks and layer mutations.

### State of the codebase

```
brain-surgery/
  characters.json      — 10 finalized characters w/ tuned temps + tier ratings
  repl.py              — interactive REPL (:use, :list, :steer, :temp, etc.)
  validate.py          — deep validation sweep (220 gens, checkpoint-safe)
  refine.py            — temperature sweep (240 gens, checkpoint-safe)
  mix.py               — token-cycling mixer (--all-combos runs full suite)
  showcase.py          — prints sample output for all characters
  extract_vector.py    — CAA steering vector extraction
  steer.py             — apply steering vectors w/ --compare mode
  surgery.py           — original CLI for one-off layer experiments
  vectors/             — .pt files for all 10 characters (negative result)
  mix-results.json     — 60-gen mixing experiment results
  refine-results*.json — temp sweep results + analysis
  validate-results*.json — full validation results
  venv/                — Python env (torch, transformers, accelerate)
```

### The 10 characters

| Name       | Ops                             | Temp | Tier | Voice |
|------------|---------------------------------|------|------|-------|
| baseline   | (none)                          | 0.5  | -    | Unmodified Qwen |
| cynic      | scale(7:0.5)                    | 0.5  | C    | Sardonic, "poverty, ignorance or stupidity" |
| mourner    | scale(18:0.5)                   | 0.7  | B    | Grief-tinged, family loss |
| nostalgist | scale(19:0.5)                   | 0.7  | B    | Domestic warmth, childhood trips |
| activist   | scale(20:0.5)                   | 0.7  | C    | Climate, "largest ecosystem on Earth" |
| accountant | scale(21:0.5)                   | 0.7  | A    | Money, "save 10%, emergency fund" |
| scientist  | scale(20:0.5)+scale(21:0.5)     | 0.5  | A    | "31 times as much water by volume" |
| naturalist | scale(6:1.3)+scale(7:1.3)+...   | 0.3  | B    | Nature beauty, butterflies |
| eulogist   | swap(5,18)                      | 0.3  | C    | Mortality, legacy, haunted |
| observer   | inject(all:0.005)               | 0.7  | B    | Curious, notes details |
| bureaucrat | scale(13:2.0)                   | 0.7  | A    | Numbered rules, formal deflection |

### What works

- Layer scaling with forward hooks — robust, fast, reversible
- Swap ops — reversible (swap twice = identity), no model reload needed
- REPL — live character switching, steering, seed control
- Characters validated at 200+ gens each; Tier A consistent across all prompts
- Token-cycling mixer — compatible voices blend, clashing voices drift to
  non-English scripts (interesting failure mode)

### What doesn't work

- CAA steering vectors — all dampen-characters extract to same direction
  (cos sim 0.8-0.98). Scaling is multiplicative/position-dependent; its
  mean effect is not a portable additive vector. Negative result documented.

### Best unexplored directions

1. **B-tier composite** — mourner+nostalgist+observer as a named blended
   character. In mixing experiments this combo was more readable than any
   single Tier A character. Try baking it in as a fixed multi-scale op.

2. **Asymmetric cycling** — dominant character + occasional intruder.
   e.g., 4 scientist tokens + 1 cynic = sardonic precision. chunk sizes
   3 and 7 untested.

3. **Logit-level mixing** — instead of hard cycling, run two characters'
   forward passes and blend their output logits before sampling. True
   simultaneous voice blend, not interleaved. Requires 2× compute but
   could produce smoother results than token cycling.

4. **Bigger model** — Qwen2.5-3B or 7B. Same ops, potentially richer
   voice signatures per layer. Memory permitting.

5. **Promote Tier C** — cynic and eulogist are inconsistent. Try different
   layer indices or scale factors to find a more stable signal.

### How to run

```bash
cd character-expirements/voice/brain-surgery
source venv/bin/activate

# Interactive REPL
python repl.py

# Temperature/tier sweep
python refine.py

# Token-cycling mixer (full experiment suite)
python mix.py --all-combos

# Single mix
python mix.py "mourner,observer,scientist" "The ocean is"

# Showcase all characters
python showcase.py
```

### Commits this context window

- `1c412b5` — temp refinement sweep + per-character tuning (Session 7)
- `31c6d63` — token-cycling mixer + full experiment run (Session 8)
- `8440956` — Session 8 journal

---

## Session 9 — Autonomous Research Run (2026-04-26)

User asked: "i'm down for autonomous researcher mode?" — let CPU pound through
discovery + refinement experiments while they're away. Plan: 4 phases run
sequentially in a single orchestrator (`research.py`), each phase
checkpoint-safe, single shared model load.

### Infrastructure

- `research_lib.py` — shared utilities. Single `ensure_model()` cache.
  `apply_ops` / `clear_hooks` / `undo_swaps` lifted from `refine.py`.
  Auto-scoring: distinctiveness vs baseline (1 - Jaccard on word sets) ×
  unique_word_ratio (anti-loop) × cleanness (1 - non-ASCII ratio,
  catches the cross-language drift we saw in Session 8 mixing).
  `looks_broken()` filter for short / mostly-non-ASCII / heavy-repetition
  outputs.
- `phase1_discover.py` — layers 5..25 × scales {0.3, 0.5, 0.7, 1.3, 1.5}
  × 3 prompts. 105 candidates × 3 = 315 gens.
- `phase2_tier_c.py` — cynic neighborhood (layers {6,7,8} × scales
  0.4-0.6 + 2-layer pairs) and 8 eulogist swap variants near (5,18).
  26 candidates × 4 prompts.
- `phase3_composites.py` — all 36 unordered pairs from {6,7,12,13,17,18,
  19,20,21} at scale 0.5 × 3 prompts. Looking for new naturalist-style
  multi-layer compositions.
- `phase4_btier.py` — 6 variants of mourner+nostalgist+observer combos
  × 8 prompts × 2 seeds. Bake the best as a standalone character.
- `research.py` — orchestrator with `--phases` / `--summary-only` flags
  and crash-recovery between phases.

### Methodology notes

- All ops in scope are reversible without model reload: scale via forward
  hooks (cleared), swaps reversed in place, inject via hooks (cleared).
  No `fresh_model()` calls anywhere. Memory should stay flat.
- Speed: warm Qwen produces ~5.4 tok/s on this CPU (vs the 3.8 the
  earlier journal noted). 150-token gen ≈ 28s. ~1.4 min per candidate
  with 3 prompts.
- Auto-scoring is a filter, not a verdict. Phase 1 already showed the
  prompt "The door opened slowly and" has a "tall, handsome man stepped
  out" attractor that survives many scaling values — that pattern scores
  high on distinctiveness vs baseline but isn't a unique voice. Manual
  review of top candidates remains required.

### Phase 1 — early observations (in progress)

Mid-run (88/105 candidates, ~2 hr in) the layer landscape is filling in:

- **Layer 8 has a narrative-fiction attractor.** scale(8:1.3) and
  scale(8:1.5) both produce the same "tall, handsome man" framing on the
  door prompt. Layer 8 dampened (0.5) drifts to Chinese — strong layer.
- **Layer 9 dampened collapses fast.** scale(9:0.3) is gibberish; the
  earlier journal's "8-10 stability core" finding is reconfirmed for
  Qwen.
- **Layer 15 dampened looks emotional.** scale(15:0.5) produced
  "I saw her, my wife. My heart ached as if it was going to break open
  again." Different register from the existing roster — worth a closer
  look once the full top-15 is ranked.
- **Layer 22 amplified looks like the stock-baseline attractor.**
  scale(22:1.3) and scale(22:1.5) both produce "vast and complex system
  that plays a crucial role in regulating Earth's climate" — Qwen's
  default-Wikipedia voice. Confirms the Session 5 finding that
  amplification often collapses to Qwen's stock answers.

### Phase 1 — final rankings

105 candidates run, 3 prompts × 150 tokens each. Total 147.7 min wall-clock.
Memory flat at 3.78 GB throughout — hook-only ops + swap reversibility
delivered on the "no model reload" promise.

The `score = distinctiveness × coherence × cleanness` heuristic was a
**filter, not a verdict**. Top 10 by raw score were dominated by aggressive
scale-0.3 dampening that produced incoherent multilingual fragments —
those candidates are "different from baseline" because they're broken,
not because they have a voice. Wrote `analyze_phase1.py` with a stricter
clean filter (rejects multiple-choice Q&A artifacts, math-list patterns,
high non-ASCII ratios, low sentence count) — 84 of 105 pass.

Even after filtering, manual reading of the top 30 was needed. The
genuinely interesting voices:

| candidate    | layer ops          | what it sounds like |
|--------------|--------------------|---------------------|
| **novelist** | `scale 24:0.3`     | "Quinn Barrett breezed in, her hazel eyes flashing with amusement. Aub Graham plopped down on Quinn's kitchen island..." Vivid named-character fiction. Origami history with cultural detail. Different prompts → different scenes, but consistent novelistic voice. |
| **gothic**   | `scale 18:0.3`     | "I hear a voice. 'Is it she, then.' The words are like the beating of time ticking in my head." Dark, temporal, atmospheric. (Inconsistent across prompts — needs validation.) |
| **fable**    | `scale 19:0.5`     | "a tall, slender figure with long white hair stepped out... 'Grandson,'" Multi-generational fairy-tale framing. |
| **intimate** | `scale 17:0.5`     | "I saw it was you. The others were still in the hall, but you had retreated to a corner of your own where we could have our little conversation without being overheard." Conversational, second-person. |

These are all NEW directions not in the existing 10-character roster.
None matched the existing characters' layers/scales — phase 1 actually
discovered novel territory.

### Methodology insight: prompt attractors mask voice

The "door opened slowly and" prompt has a strong "tall, [adjective] X
stepped out/inside" attractor that survives across most layer scalings.
Auto-scoring rewards distinctiveness from baseline, but this prompt's
baseline is itself "tall, handsome man stepped out" — and the candidate
versions are also "tall, slender figure" or "tall, dark-haired woman" or
"tall, gaunt figure." The MUTATION isn't producing voice; the PROMPT is
producing the surface pattern.

Real voice differentiation has to come from cross-prompt consistency, not
from any single prompt's surface change. The phase 5 deep-validation step
(planned next) needs ≥6 prompts to detect this.

Phase 1 final rankings + filter committed. Phase 2 (Tier C refinement)
is running — will write up when it completes.

### Phase 2 — Tier C refinement (negative result)

26 candidates × 4 prompts at 150 tokens. Duration 52.4 min.

**Goal**: find tighter operating points for cynic (scale 7:0.5) and
eulogist (swap 5,18) — the two characters that wobble in the validation
data. Tested cynic neighborhood (layers {6,7,8} × scales {0.4..0.6}
+ 2-layer pairs at 0.5) and 8 eulogist swap variants near (5,18).

**Result**: nothing beat the originals.

- 2-layer cynic combos (`L6+L7`, `L6+L8`, `L7+L8` at 0.5) all drift to
  multilingual garbage. Stacking dampened layers compounds destabilization.
- Cynic single-layer variants at 0.4, 0.45, 0.55, 0.6 either break (low
  end) or revert toward baseline (high end). 0.5 is the local optimum.
- Eulogist swap variants near (5,18) — none reproduced the
  signature "we are not alone; there is no other plane" voice. They
  drift to random topics: moon poetry, the death penalty, brain science.
  The original (5,18) coupling appears to be load-bearing for that voice.

This is a useful confirmation: the existing 10-character configurations
weren't accidental. The current cynic and eulogist are at local optima
inside their respective parameter neighborhoods. Tier C-ness reflects a
genuine model limit at 1.5B params, not a tuning failure.

Phase 2 results committed. Phase 3 (composite pairs) running.

### Phase 3 — 2-layer dampen pair search

36 unordered pairs from {6,7,12,13,17,18,19,20,21} at scale 0.5,
3 prompts × 150 tokens. Duration 52.2 min.

The score ranking compresses everyone into a narrow band (0.756–0.810),
so it's not informative on its own. Most pairs break (29 of 36 pass
clean filter, but several of those are still incoherent).

The interesting finds:

- **drama** (`L18_L21_s0.5`) — Period-drama voice. On the door prompt:
  "Mary, the daughter of a bishop, came into view. She had her hands
  hidden behind her as she walked in, looking downstage to avoid eye
  contact. 'Mary Anne,' Mrs. Bates said with surprise." Very Austen.
  Worth validating on more prompts.
- **L20_L21_s0.5 = the existing scientist** — confirmed as a local
  optimum. None of the other dampen pairs reproduce its
  coherence-while-distinctive quality.
- **L6_L7_s0.5** ranked top but is degenerate when read.
- Most pairs that include layer 6 or layer 7 destabilize regardless
  of the partner. Layers 6-7 are strong solo voices (cynic at L7,
  layer-6 surrealism in earlier sessions) but compose poorly.

Big-picture: composite multi-layer characters are RARE. Of 36 unordered
pairs, only 1 new candidate (drama) emerged. The naturalist and scientist
in the existing roster were lucky finds, not the typical outcome.

Phase 3 committed. Phase 4 (B-tier composites) running.

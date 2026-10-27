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

## Round 1 (108 trials: 3 ludants × 3 requests × 3 views × 2 models × 2 reps)

It cost $7.68 of key, judge included; $17.23 left. "done" is the judge's 0/1/2, averaged.

| | done | broke | $ / trial | first prompt (tokens) | calls | cached share of input |
|---|---|---|---|---|---|---|
| Haiku full | 1.83 | 0 | 0.0063 | 27.5k | 3.3 | 67% |
| Haiku outline | 1.89 | 0 | 0.0058 | 9.6k | 5.8 | 77% |
| Haiku skeleton | 1.83 | 0 | 0.0061 | 13.6k | 5.3 | 73% |
| Sonnet full | 1.94 | 0 | 0.134 | 27.5k | 4.6 | 73% |
| Sonnet outline | **2.00** | 0 | 0.100 | 9.6k | 6.1 | 80% |
| Sonnet skeleton | 1.94 | 0 | 0.103 | 13.6k | 6.2 | 80% |

**Seeing less of the body didn't hurt.** Outline shows about a third of the soma, and it scored at least as well as full on both models. No trial broke its game. One edit failed in 108 trials, and it was retried. The work is real: Sonnet's outline log feature on Genek is an instanced mesh, pickup by radius, a count in the HUD and a reset on rebuild.

**Savings grow with the body.** Sonnet on Genek, the biggest soma (32k tokens), cost $0.22 a trial with full and $0.12 with outline. On Evevina and Anithis it was roughly even: within one request, full's body is cached after the first call, and outline makes extra read and search calls. A cold start pays for the whole body, though, and that happens each time a ludant is spoken to after the cache has expired.

**Haiku gets the self-reflective body now.** It searched its body, read it, edited it exactly and told the player what it did, at about 1/20th of Sonnet's cost and with no extra scaffolding. Its misses are judgment, not mechanics. "A *little* more patient" turned skunks 3–4× more patient in all six of its trials. Both models doubled the red fish along with the golden one.

**Skeleton isn't worth it over outline.** It's bigger, needs as many calls, and scored no better. Searching and reading lines fits what the models are trained on, which matches Robby's earlier result that grep beats a section-loading scheme.

## Round 2: a grown body, and conversations

**The arcade** (`make-arcade.mjs`): Genek's soma with its game grown into a cabinet of three (sword-walk, day-fishing and skuntin', kept whole as inner functions, switched with 1, 2 and 3). The game section is 97k characters and 1,609 lines, and the soma is 108k, more than any live ludant has yet. Four requests (one per game, plus a badge across all three), 2 reps, 32 trials.

| | done | broke | $ / trial |
|---|---|---|---|
| Haiku full | 1.63 | 1 | 0.017 |
| Haiku outline | 1.75* | 0 | 0.007 |
| Sonnet full | 2.00* | 0 | 0.242 |
| Sonnet outline | 2.00 | 0 | 0.132 |

\* Two trials are measurement errors, left out here. One Sonnet full trial got a reply with no tokens from the API and did nothing (scored 0). One Haiku outline trial's judge answer didn't parse (counted 0, though its notes are favourable). The runner should retry both kinds; it doesn't yet.

The only broken game in either round was Haiku with the full arcade in front of it. It called `T_X(f.i)` and `T_Z(f.i)`, which exist nowhere in the body, so felling a tree threw on every frame. Both failed edits on the arcade were also full: an `old` text that appeared more than once. With a whole big body in view, the model writes from its impression of it instead of looking. On the big body outline cost half as much on both models.

**Conversations** (`convo` in `tasks.mjs`): four wakes in a row on one body, each starting with fresh messages, as the platform does: a feature, a question about it, a follow-up that changes it, then a tweak elsewhere. Only the soma carries what happened. Haiku 6 per view (3 ludants × 2), Sonnet 3–6. Scores are per request.

| | per request | by wake | $ / convo | calls | cached | uncached | wakes started from cache |
|---|---|---|---|---|---|---|---|
| Haiku full | 1.92 | 2 2 2 1.67 | 0.018 | 10 | 68% | 0 | 6/18 |
| Haiku full+split | 1.88 | 2 1.83 2 1.67 | 0.017 | 11 | 77% | 0 | 7/18 |
| Haiku outline | 1.75 | 2 2 1.67 1.33 | 0.016 | 19 | 75% | 0 | 6/18 |
| Haiku outline+split | 1.88 | 2 2 1.83 1.67 | 0.015 | 19 | 84% | 0 | 7/18 |
| Haiku live | 1.92 | 2 2 2 1.67 | 0.021 | 17 | 63% | 18% | 17/18 |
| Sonnet full | 2.00 | 2 2 2 2 | 0.421 | 13 | 68% | 0 | 1/9 |
| Sonnet outline | 1.83 | 2 1.5 2 1.83 | 0.317 | 20 | 78% | 0 | 2/18 |
| Sonnet live | **2.00** | 2 2 2 2 | 0.411 | 20 | 67% | 16% | 15/18 |

Nothing broke in any conversation.

**What the lower scores are.** Robby asked what the trade-offs are, relative to full. Reading every judge note under 2:
- *Most misses are the model's, under every view.* "A little more patient" made Haiku's skunks 2.5–5× more patient in 8 of its 10 Anithis conversations, under every view. "Make each slash reach further" changed only the wide slash's radius, under full and outline alike.
- *Outline's own cost is a keyhole.* Haiku, asked to warn before the shark at night, searched "shark" and edited from the three-line snippets the search returned, never reading the loop around them. It missed that the spawn timer keeps counting while a shark is on screen, so at night the warning is often skipped. Sonnet, asked on a fresh wake how to keep fish from the shark, read one stretch and gave advice (move the boat sideways) that doesn't help a shark that crosses the whole screen. Full has the surroundings in view for free; outline sees what it chose to look at, and it chooses least on follow-up wakes, where it has to rediscover its own earlier work.
- *Full's own cost is overconfidence.* That's the arcade crash and the failed edits above. It grows with the body.

## Round 3: live

The **live** view (`live` in `body.js` and `run.mjs`) takes the soma out of the system text altogether. The system text keeps a line saying where the soma is, and stays the same for every call of every wake while the soma changes. The outline of the soma as it is right now goes in a system message at the end of the conversation, redrawn for every call, with the meter and the faults. Sonnet 5.5 and Haiku 5.5 take a system message after a tool result or user message, and OpenRouter passes it through. The probes are in this session's scratchpad (`trailing*.mjs`): after a tool result both models act on such a note, and the cached prefix before it still hits while the note changes.

Robby: "I have confidence the trailing system message will work, let's prove that."

**It works.** Live scored the same as full on both models: Sonnet 2.00 on all 24 requests, Haiku 1.92, its only misses being the skunk overshoot every view has. Outline scored 1.75 and 1.83. They're the same outline: live differs only in where it's shown (last, labelled "as it is right now") and when (every call, not once per wake). With six trials a view that's one or two requests, so it's a lead rather than a proof. It does point the same way as the keyhole misses, which were on later wakes.

**What it costs.** About what full costs, and 30% more than outline: Sonnet $0.41 a conversation, against $0.42 for full and $0.32 for outline.
- *Across wakes it does what it was for.* 32 of 36 wakes after the first started with the static prefix (about 5.9k tokens) read from cache. Under the other views a wake after an edit misses everything: only 29 of 99 started from cache.
- *Within a wake the note is paid in full every call.* It's 2.7k tokens, new each call, so it can never be read from cache: 16–18% of all input, about $0.10 a Sonnet conversation. I first told Robby a cache mark on the note would fix this. It wouldn't: the next call's note is different, so a cached copy of this one is never read. The cache already reaches the last message before the note. This cost is the price of being live.
- *The extra cost sits in the first wake* (Sonnet live $0.22, outline $0.14), the feature, which takes the most calls.

What would make it cheaper: shrink the note, not cache it. Show the outline once, in the cached prefix as of waking, and put in the trailing note only what has changed since waking (the edited stretches, the meter, the faults). A wake that only answers a question then pays for almost no note. That's untested.

**An open cache puzzle.** In every view, the call after the model's first `play` in a wake often misses the cache completely, even the system text: 15 times in about 70 plays. Then the next calls hit again. A probe showed a picture alone doesn't do it, and it isn't OpenRouter falling back to another provider (every call went to Anthropic). Not explained yet. The platform pays it too.

**The split** (a second cache mark between the soma and the frame) raised the cached share 8–9 points in both views, but only 1 more of 18 wakes started from cache: once the soma is edited, everything after it misses whatever the marks. It's worth having, for Haiku pennies, and it's what the platform should do short of live.

Rounds 2 and 3, with the probes and the live smoke test, cost $11.13 of key (judge included). $6.10 is left.

## For gactant

- **Show a big body as an outline, with read and search.** It matches full on quality for single requests, costs half as much on the biggest body, and avoided the one break. Its weakness is a keyhole on follow-ups.
- **Show the soma live, in a trailing system note.** It closed the keyhole gap in these trials (equal to full), keeps the system text cacheable across wakes, and the ludant always sees itself as it is. That's what Robby asked for: the reflection of the body is live. It costs about what showing the full body does today, because the note is paid fresh each call. A note of only what changed since waking should cut that; that's the next thing to try.
- **Move the meter out of the cached prefix either way.** Today "Your thinking in this sitting has cost $X so far" sits after the soma and changes every wake, so every wake misses the cache for the whole soma. In the trailing note it costs nothing.
- **Find the first-play miss.** It costs a full rewrite of the prefix once per wake that plays.

## Checking the judge

Robby: "Double check to make sure the environment and judging is good."

- **The judge was never deterministic.** OpenRouter doesn't pass `temperature` for these models (it isn't in their supported parameters), so the `temperature: 0` did nothing.
- **It now answers in a schema** (`response_format` json_schema) and is asked again if the answer doesn't parse or has the wrong number of scores. An API reply with no choices is retried too: that's what the Sonnet arcade trial with no tokens was.
- **No diff was ever cut short** for the judge: 185 section diffs, the largest 8k characters, against a 14k cut.
- **Judged again** (`--rejudge`): all 45 conversation trials, from their saved evidence, by Sonnet again and by Opus 5.5 ($2.53). Sonnet agreed with its own first scores on 97% of the 180 requests, and Opus agreed with them on 92%. Every view ranks the same under all three:

| | Sonnet | Sonnet again | Opus |
|---|---|---|---|
| Haiku full | 1.92 | 1.96 | 1.92 |
| Haiku outline | 1.75 | 1.79 | 1.79 |
| Haiku live | 1.92 | 1.92 | 1.88 |
| Sonnet full | 2.00 | 1.92 | 2.00 |
| Sonnet outline | 1.83 | 1.83 | 1.83 |
| Sonnet live | 2.00 | 2.00 | 2.00 |

What the judge can't do: it reads the diff (with two lines around each change), the chat and two pictures. It checks code by reading it, and it doesn't run the feature. A shark that arrives at 14 seconds isn't in a picture taken at 9. So "done" means "a careful reviewer thinks it's done", and a second reviewer agrees.

## delta: a smaller live note

The live note is 7–12k characters, and most of it never changes: hooks, origin and tools are 60–80% of it. The game outline itself is 1.2–3.4k (6.1k on the arcade). So **delta** puts the soma as it was when the sitting began in the system text (the same for every wake, so it's cached), and puts only the sections changed since then in the trailing note, as they are now, with the meter and faults.

Smoke test, Haiku on the Evevina conversation: 88% of input cached, 4% uncached (live: 63% and 18%), every wake started with the whole base soma from cache. But it scored [2, 2, 0, 2]: on the night-warning wake Haiku searched for "shark" about fifteen times, read the same stretch three times, and never edited. One trial can't tell a Haiku search loop from confusion between two copies of the game section (the old one above, the new one below). It's in the held-out run.

## The first-play cache miss isn't the pictures

A probe with the platform's exact shape (a tool result, then a user message of pictures with the cache mark on the last one) hit the cache. The likeliest cause now is time: the cache lasts five minutes, and on this machine (load near 18) the first play of a wake, which builds and runs the game in software 3D, can take that long. Calls are now logged with their time (`at`, seconds into the trial) to check. If so, it's the bench's, not the platform's.

## Held-out conversations

`convo2` in `tasks.mjs`: four new requests for each body, written after rounds 1–3 so no view was shaped on them, including one across games on the arcade (a cat in skuntin', then one in day-fishing too).

## The proof, set before running

Robby: "What would it take to prove that live outline is as good as or better than the current implementation?" The current one is gactant today: the full soma in the system text, drawn once per wake.

- **Arms:** `full` and `live`, on Haiku and on Sonnet.
- **Scripts:** 7 four-request conversations (`convo` and `convo2` on Evevina, Anithis and Genek; `convo2` on the arcade), 4 reps each: 28 conversations, 112 requests, per arm per model. They run rep by rep, so a run cut short by the key stays balanced across arms.
- **The rule:** for each model, live passes if its mean score per request is at least full's minus 0.1, with the one-sided 95% bound (by conversation, so the four requests of one sitting aren't counted as independent) above that, and if it breaks no more games than full. It has to hold under both judges, Sonnet (in the run) and Opus (`--rejudge` after).
- **Cost:** about $26 for Sonnet, $3 for Haiku, $5 for the Opus judging. `proof.sh` runs it; it can be stopped and started again.

## Round 4: held out (Haiku, 8 conversations a view)

| | per request | by wake | broke | $ / convo | calls | cached |
|---|---|---|---|---|---|---|
| full | 1.75 | 1.88 1.75 1.63 1.75 | 0 | 0.029 | 11 | 63% |
| live | **1.88** | 2 2 1.63 1.88 | 1 | 0.028 | 19 | 61% |
| delta | 1.59 | 1.88 1.50 1.63 1.38 | 0 | 0.025 | 21 | 76% |

The new requests are harder than the old: every view scores lower. Live leads full again, on requests no view was shaped on. Its one break is a judgment call: asked for "a cat that sits on the boat; if I reel in a fish while it's there, it eats it", Haiku made a cat that never leaves, so fishing can't score. Haiku with full made the same cat in both its arcade trials, and the judge didn't call those broken. The other misses are the old kinds: "a little faster" made 50–55% faster, and a "safe spot" under the porch light that barely reaches where the skunks wander.

**Delta is out.** It caches best and scored worst, and it takes the most calls (21 a conversation, up to 15 in a wake): with two copies of a changed section in view, the old one above and the new one below, Haiku searches more and edits less well. Cheaper per token, not per result.

**The first-play cache miss is the bench's.** Calls now carry their time. Of 12 total misses within a wake, 11 came after a gap of 300 to 518 seconds; of 306 hits, none came after more than 342 (the median gap is 4). It's the five-minute cache lifetime, crossed when a play on this starved machine takes minutes. On the platform a play is fast, so a wake doesn't pay it.

**But it matters for the platform between wakes.** Live's main saving is a wake opening on a cached prefix, and that only happens if the wake comes within five minutes of the last call. People talking with a ludant often leave longer gaps than that. Anthropic's cache can be marked to last an hour instead (`cache_control: { type: 'ephemeral', ttl: '1h' }`), at twice the price to write it instead of 1.25×. For a stable prefix that's read at the next wake, that's worth it, and with live the prefix is stable. Untested here.

## The proof: the verdict

All 112 trials ran (28 conversations per arm per model, 448 requests), judged by Sonnet and again by Opus. They agreed on 93% of requests. `node prove.mjs runs/proof runs/proof-opus` applies the rule:

| model | judge | full | live | live − full | 95% lower bound (needs > −0.1) | broke full / live | |
|---|---|---|---|---|---|---|---|
| Sonnet | Sonnet | 1.821 | 1.911 | +0.089 | −0.014 | 0 / 0 | pass |
| Sonnet | Opus | 1.857 | 1.884 | +0.027 | −0.070 | 0 / 0 | pass |
| Haiku | Sonnet | 1.848 | 1.884 | +0.036 | −0.029 | 2 / 3 | **fail** |
| Haiku | Opus | 1.839 | 1.893 | +0.054 | −0.010 | 1 / 1 | pass |

**On Sonnet, live is proven at least as good as full,** under both judges, with live ahead by a little under each.

**On Haiku, live scores at least as well under both judges, but it fails the rule as written,** by one break, under one judge. All five breaks Sonnet called (and both Opus called) are one request: on the arcade, "put a cat on the boat; if I reel in a fish while it is there, it eats it." Both views built a cat that never leaves, so fishing can't score, and whether that's "broke" is a coin the judges flip. It's my request that's at fault: it's ambiguous. Left out (`--without arcade-convo2`, a separate look, not the rule), every row passes and no view breaks anything. The rule stands as it was set: Haiku is not proven by it; Sonnet is.

**Cost: the same.** Live takes nearly twice the calls (Haiku 19 to 10, Sonnet 21 to 12), reading and searching what full has in front of it, and each is smaller. Per conversation it comes out even: Haiku $0.024 to $0.026, Sonnet $0.52 to $0.52.

**Two judging faults found on the way, both fixed and rejudged:**
- *The judge saw only the first 14,000 characters of a diff.* That held for every trial in rounds 1–4, but seven of Sonnet's proof conversations (four requests of changes on the biggest bodies) went past it. In one, the speed change was at character 15,265, so the judge said it was never made and scored it 0. The cut is now 80,000, and all seven were judged again by both judges with the whole diff.
- *Twice the judge's answer came back empty three times running.* Both were judged again.

Proof run and judging: about $32.

## Where this leaves gactant

Show the soma as an outline in a trailing system note, redrawn every call, with read and search tools, and the cost meter and faults in the note instead of the cached prefix. On Sonnet it's proven at least as good as showing the whole soma, on Haiku it scored at least as well and the one thing against it is an ambiguous request. It costs the same per conversation now, at today's body sizes; outline's saving grows with the body (half the cost on the arcade), and the prefix stays the same across wakes, so with an hour-long cache mark a wake that comes back later still reads it from cache.

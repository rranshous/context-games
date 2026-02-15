# Qacky Build Journal

## M1 — Core Single Round Loop (2025-02-15)

### What was built
Single-file game at `games/qacky/index.html` (~1000 lines). Full 10-round game loop with:
- Title screen → game rounds → final score screen
- 25 word challenges across 3 difficulty tiers (easy/medium/hard), 10 selected per game sorted by difficulty
- Client-side banned word checking with word-boundary regex
- API call with extended thinking (budget_tokens: 1024, minimum allowed) + structured JSON output
- Typewriter reveal for thinking text, then click-to-reveal answer/reason
- Inline result bar (not overlay) so answer stays visible
- Scoring: base 100 + speed bonus (up to 50) + brevity bonus (up to 30) - attempt penalty
- Confetti particle system on success
- Timer pauses during API call for fairness

### Key Technical Decisions
- **No system prompt**: model behavior controlled entirely via `output_config` JSON schema
- **Structured output schema**: `{ answer: string, reason: string, category: string }` with `additionalProperties: false`
- **API pattern**: `POST /api/inference/anthropic/messages` with `credentials: 'include'`
- **Extended thinking**: `thinking: { type: 'enabled', budget_tokens: 1024 }` — 1024 is the API minimum
- **Win check**: `\b{word}\b` regex (case-insensitive) against `answer` field only (not reason/thinking)
- **Click-to-reveal**: after thinking typewriter completes, REVEAL ANSWER button appears; user clicks when ready
- **Inline results**: GOT IT/NOT QUITE/TIME'S UP shown as a colored bar below the answer, not a full-screen overlay

### Architecture
```
index.html (single file)
├── <style> — all CSS inline
│   ├── Screen management (.screen.active)
│   ├── Game-show color palette
│   ├── Thinking panel (purple glass)
│   ├── Answer panel (gold-bordered)
│   ├── Result bar (green/orange/red variants)
│   └── Animations (shake, pulse-glow, fade-in, confetti)
└── <script> — all JS inline
    ├── WORD_PACKS[] — 25 challenges, { target, banned[], difficulty }
    ├── RESPONSE_SCHEMA — JSON schema for structured output
    ├── state {} — mutable game state
    ├── dom {} — cached DOM references
    ├── callModel() — fetch with thinking + output_config
    ├── typewriterReveal() — character-by-character animation
    ├── Timer — 60s countdown, pauses during API call
    ├── Confetti — canvas particle system
    ├── Round flow — startGame → startRound → submitPrompt → revealAnswer → endRound → nextRound
    └── Event listeners — buttons + Enter key
```

### UX Flow
```
Title Screen
  └─▶ START GAME
       └─▶ Round N/10 (target + banned words + timer)
            └─▶ Type prompt → GO!
                 ├─▶ Banned word? → flash chip + shake input → retry
                 └─▶ Clean? → API call → thinking typewriter
                      └─▶ REVEAL ANSWER button
                           └─▶ Click → answer + reason typewriter
                                ├─▶ GOT IT! → points + confetti + NEXT ROUND
                                ├─▶ NOT QUITE → TRY AGAIN (timer still running)
                                └─▶ TIME'S UP → 0 points + NEXT ROUND
       └─▶ After round 10 → Final Score + rating + per-round summary
            └─▶ PLAY AGAIN
```

### Open Issues / Next Steps
- Thinking at 1024 tokens is still pretty verbose — explore whether there's a way to get snappier thoughts
- The model sometimes answers with adjective form ("Volcanic") instead of exact target noun ("volcano") — word-boundary check is correct but may need fuzzy matching or schema hint
- Explorer pattern works great for auto-testing: inject `window.explorerPlay()` which uses inference to generate prompts
- Future: action-based challenges (get model to agree to something, perform an action)
- Future: difficulty modes (thinking visible vs hidden, more banned words, stricter judge)
- Future: model selector

## M2 — AI Judges + UX Overhaul (2026-02-15)

### What was built
Three-layer judging system plus UX streamlining. Removed extended thinking display, added AI-based prompt judging and answer matching, with judge notes visible to the player.

### Three Judging Layers
1. **Regex check** (instant) — catches literal banned words, unchanged from M1
2. **Prompt judge** (AI) — catches sneaky synonyms, paraphrases, phonetic tricks, embedded words
3. **Answer judge** (AI) — generously accepts plurals, adjective forms, conjugations as wins

### Prompt Judge
- **Rich game-aware prompt**: knows the full game concept, rules for fouls, told to be "fair but firm — if in doubt, let it play"
- **Schema**: `{ verdict: "clean"|"foul", violated_word: string, explanation: string }`
- **Parallel with main call**: fires simultaneously, awaits first. If foul, main result is discarded.
- **Foul display**: pink panel with typewritten explanation. Doesn't count as attempt.
- **Fail-open**: any error returns `{ verdict: "clean" }`

### Answer Judge
- **Generous matching**: accepts exact match, plurals, conjugations, adjective/adverb forms (e.g. "volcanic" = "volcano", "castles" = "castle")
- **Schema**: `{ match: "yes"|"no", explanation: string }`
- **Parallel with typewriter**: fires when answer arrives, resolves during typewriter animation — zero added latency
- **Judge note**: explanation shown as subtle italic text below result bar
- **Fail-back to regex**: on error, falls back to `\b{word}\b` check

### UX Changes
- **Removed extended thinking**: no more thinking display or REVEAL ANSWER button. Answer + reason show immediately after judge clears.
- **Removed thinking from API call**: `callModel()` no longer sends `thinking` param — faster responses, lower cost
- **Direct answer flow**: judge clean → "AI IS THINKING..." loading → answer+reason typewriter → result
- **Judge note**: subtle `"Judge: {explanation}"` below result bar shows the answer judge's reasoning

### Key Technical Decisions
- **All judges use haiku** — fast and cheap, no thinking needed for judging tasks
- **All judges use structured output** — behavior shaped via user message + JSON schema, no system prompt
- **Parallel everywhere**: prompt judge ‖ main call, answer judge ‖ typewriter animation
- **Fail-safe defaults**: prompt judge fails open (clean), answer judge falls back to regex
- **Console logging**: `[PROMPT JUDGE]` and `[ANSWER JUDGE]` tags for debugging

### UX Flow
```
Type prompt → GO!
 ├─▶ Banned word (regex)? → flash chip + shake → retry
 └─▶ Regex clean? → "JUDGE IS REVIEWING..." + fire judge & main in parallel
      ├─▶ FOUL! → pink panel + explanation typewriter → retry (no attempt counted)
      └─▶ CLEAN → "AI IS THINKING..." → answer+reason typewriter
           └─▶ Answer judge (parallel) → GOT IT / NOT QUITE + judge note
```

### Bug Fixed
- Thinking panel hidden after clean path was never restored on next submit → foul display invisible on round 2+. Fixed by adding `'hidden'` to `classList.remove('foul', 'hidden')` in submitPrompt reset.

### Open Issues / Next Steps
- Prompt judge tuning — may need iteration on false positive/negative rate after more playtesting
- Could highlight which banned chip was violated (like regex violations do)
- Future: judge could catch target-word-in-prompt (too-easy penalty)
- Future: appeal system — player argues their case to the judge
- Future: action-based challenges (get model to agree to something, perform an action)
- Future: difficulty modes, model selector

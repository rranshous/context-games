# Qacky: AI Taboo

Prompt-crafting party game. Make an AI say a target word without using banned words.

## Rules

- 10 rounds per game
- Player writes a prompt, AI responds
- Prompt must avoid banned words (checked by regex + AI judge)
- AI response must contain the target word (checked by regex + AI judge)
- Score: speed + brevity bonus

## Modes

- Words: get AI to say a specific word
- Actions: get AI to describe a specific action
- Voices: get AI to speak in a specific voice/style
- Emotions: get AI to express a specific emotion
- Puzzles: get AI to solve/state a specific answer

## Judging Stack

1. Regex — instant check for banned words in player's prompt
2. Prompt Judge — Haiku, structured output, catches synonyms/paraphrases
3. Answer Judge — Haiku, structured output, generous acceptance of target word variants

All judges: no system prompt, structured output, fail-open.
Parallel: prompt judge runs alongside main AI call. Answer judge runs alongside typewriter animation.

## Monetization

- $3 flat, one-time purchase
- BYOK: users bring own OpenRouter API key, platform proxies inference
- License key: UUID at purchase, stored in localStorage
- Data model: { key, gameSlug, stripeEmail, stripeSessionId, createdAt, revokedAt }

## Reference

Existing implementation: games/qacky/index.html (~2000 lines, single-file).
Build from first principles, not from the reference.

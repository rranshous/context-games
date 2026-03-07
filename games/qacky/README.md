# Qacky

AI Taboo — craft clever prompts to make the AI say a target word, but you can't use any of the banned words.

## How to Play

1. Pick a game mode (Words, Actions, Voices, Emotions, or Puzzles)
2. Each round shows a target and 5 banned words
3. Write a prompt that gets the AI to hit the target — without using banned words
4. 10 rounds per game, scored on speed and brevity

## Game Modes

- **Words** — Make the AI say a specific word
- **Actions** — Make the AI perform an action (write a haiku, count backwards, etc.)
- **Voices** — Make the AI respond in a character voice (pirate, Shakespeare, etc.)
- **Emotions** — Make the AI convey an emotion (nostalgia, existential dread, etc.)
- **Puzzles** — Make the AI's output have a structural property (acrostic, rhyming pair, etc.)

## Judging

Three layers keep things fair:

1. **Regex** (instant) — catches literal banned words
2. **Prompt judge** (AI) — catches synonyms, paraphrases, phonetic tricks
3. **Answer judge** (AI) — generously accepts plurals, conjugations, adjective forms

All AI judges run on Haiku with structured output, no system prompt. Prompt judge runs in parallel with the main call; answer judge runs in parallel with the typewriter animation — zero added latency.

## Tech

- Single-file game (`index.html`, ~2000 lines)
- Claude Haiku for judging, Sonnet for main responses
- No system prompt anywhere — all behavior shaped via structured output schemas
- Runs on the vanilla platform (`/api/inference/anthropic/messages`)

## Status

M1–M3 complete. M4 (reverse rounds — AI gives clues, player guesses) designed but not yet built.

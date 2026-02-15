# Qacky

## Concept
Taboo meets AI prompting. Get the AI to say a target word by crafting clever prompts — but you can't use any of the banned words. The AI's extended thinking is visible, adding entertainment and insight into how models reason.

## Core Loop
1. Target word + 5 banned words shown
2. Player types a prompt (60s timer)
3. Client-side banned word check (word-boundary matching, case-insensitive)
4. Prompt sent to model with extended thinking + structured output
5. Thinking typewriters in → player clicks REVEAL ANSWER
6. Answer + Reason displayed → win check against answer field only
7. GOT IT / NOT QUITE / TIME'S UP inline result bar
8. 10 rounds per game, scored, final summary

## Design Philosophy
- **No system prompt** — behavior shaped purely via structured output schema
- **Schema as control**: `{ answer, reason, category }` — model gets to explain itself in `reason`, but only `answer` is checked for the target word
- **Thinking as entertainment**: visible extended thinking is part of the fun, not just debug info
- **Client-side judging** for M1 (word matching) — evolve to inference-based judging later
- **Action-based challenges** as future evolution (get model to agree/do things, not just say words)

## Visual Style
- Deep purple-black background (#1a0a2e)
- Game-show gold (#FFB800) + orange (#FF6B35) + purple (#7B2FF7)
- Hot pink banned words (#FF3366), green success (#00E676)
- Bold uppercase typography, glow effects, confetti on success
- Jackbox Games energy

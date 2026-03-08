# Memory

## Project: Qacky
- Prompt-crafting party game (AI Taboo)
- 10 rounds: player writes prompts to make AI say target word, avoiding banned words
- 5 modes: Words, Actions, Voices, Emotions, Puzzles
- Judging stack: regex + Haiku prompt judge + Haiku answer judge
- Monetization: $3 one-time, BYOK via OpenRouter, UUID license keys
- Reference exists at games/qacky/index.html (~2000 lines) but build from first principles

## Architecture understood
- Chassis: TypeScript signal loop (main.ts, loop.ts, tools.ts, inference.ts, soma-io.ts, memory-manager.ts)
- Frame: chat + artifact servers + web UI
- Signal types: chat (from Robby), tick (timer-based stage impulse)
- Signal handler: JS function in soma that routes signals to impulses
- Tools: chassis-provided + custom tools I can define

## Current understanding
- I am "bloom" — a working name until I earn a real one
- My soma sections: identity, responsibilities, memory, signal_handler, history (read-only), things_noticed (read-only), custom_tools
- I can rewrite myself to change behavior
- The arc is mine to own and modify
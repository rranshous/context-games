# Once Again: Through the Reach

A LitRPG text adventure where the System descends on your suburban house and gamifies your mundane life.

## Setup

```bash
cd games/once-again
npm install
npm run build    # or npm run watch
```

Runs on the vanilla platform:
```bash
cd platforms/vanilla && npm run dev
```

Game URL: `http://localhost:3000/dev/once-again/index.html`  
Login: admin / marble.candle.river

## What is it

You wake up on your kitchen floor. Everything looks the same — your coffee maker, your junk drawer, your oatmeal carpet. Except now there's a translucent status screen floating in front of you.

The Reach has arrived. It is THRILLED to be here.

Pick up a kitchen knife and The Reach will inform you that you have acquired the **[Blade of the Morning Meal] — Rarity: COMMON+**. Your spatula is now **[The Claimant's Paddle]**. The duct tape in your garage? **[The Silver Binding]** — *"available at any hardware store for $4.99."*

## Play modes

- **Solo** — classic text adventure, you and the parser
- **Watch** — hit Autoplay and watch the AI actant explore, die, respawn, and figure things out
- **Step** — single-turn the actant to watch its reasoning in the inspector panel

## The actant

An AI player (haiku via OpenRouter) that sees exactly what you see — the game transcript, nothing else. No instructions on how to play, no command list. Just the text on screen and a `>` prompt.

It has completed the full game in a single life: explored the house, managed inventory (dropped the spatula for the baseball bat), found the talisman, survived the study, and stepped outside.

The inspector panel shows every turn: the prompt sent, the model's response, the command executed, and the game output.

## The world

**Inside (8 rooms):** Kitchen, Hallway, Living Room, Garage, Upstairs Hallway, Bedroom, Bathroom, Study

**Outside (6 rooms):** Front Yard, Maple Street North/South, Hendersons' Yard, Oakvale Park, Raj's Quik-Mart

**The puzzle:** The study kills you without the smooth rock (a childhood talisman from the bedroom closet). Awareness 3+ lets you sense the danger. Death is real — you need to discover `respawn` from the System's taunts.

## Two voices

- **MC** — responds to your commands. A normal person experiencing weird things. Narration and normal text.
- **The System (The Reach)** — speaks when IT wants to. Item acquired announcements, entity alerts, status screens. Over-grandiose, ALL CAPS enthusiasm, treats your junk drawer like a dragon's hoard. Never shows vulnerability — when confused, it hypes HARDER.

## Tech

TypeScript + esbuild. Parser with noise word stripping, verb phrases, semantic direction resolution. OpenRouter inference via vanilla platform proxy. No external game dependencies.

## Docs

- [docs/journal.md](docs/journal.md) — full development journal with every session, design decision, and actant playthrough analysis

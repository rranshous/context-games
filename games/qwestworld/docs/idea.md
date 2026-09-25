# Qwestworld — idea

A continent-scale RTS that runs by itself, slowly, forever, on a modest CPU box. You don't play it. You look into it.

## Core
- **A big world run on cheap rules.** A continent, dozens of settlements, tens of thousands of soldiers. Each soldier is a few bytes in a typed array that walks a shared distance field.
- **A few actors that think.** Kings are local LLMs (Ollama, tool calling). They hold council every few in-game weeks and issue commands. Everything below them is hands.
- **Commands degrade as they go down the hierarchy.** Couriers take days. Generals sometimes misread the seal or ignore the order.
- **A window you look through.** The sim is a daemon. Viewers (browser, CLI) connect whenever, from anywhere on the LAN, and see the world as it is right now.
- **Time bends to the minds.** If a thinking king is overdue, the world waits for him.

## Principles
- Sim and view are separate processes. The sim knows nothing about rendering.
- Only kings get inference. Everything else is rules plus randomness.
- Macro-level interest comes from variance: courier delay, disobedience, battle luck, terrain, temperaments.
- Kings see the world in-fiction (settlement names, "lightly held", "near Ashby"), never coordinates.

## Later, maybe
- More tiers of minds (generals, stewards), promotion of notable hands to minds
- Diplomacy (peace, alliances, tribute)
- Weather elementals as minds that push weather fields
- Peasants/food as a second kind of hand
- A dungeon-and-town region as a zoomed-in scale

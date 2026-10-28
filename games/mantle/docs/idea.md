# Mantle: the idea

A multiplayer RTS where you design your units. Instead of picking a faction with fixed
units, you start with almost nothing (simple gatherers) and design whatever you want: size,
looks, description, capabilities. It's kept fair by budget and limits.

## What holds it together

- **Free flavor, fixed price.** You describe anything. Your aid turns it into a spec in a
  small, fixed language (`spec.js`), and the engine prices the spec with a formula. The AI
  never sets a price. The look, name and description stay completely free.
- **The aid is who you are.** At the start you choose who you work with: Dr. Wen Hollis,
  biologist (grows), or Ansel Brackett, engineer (builds). This is the flavor you pick, in
  place of a faction. Each comes with:
  - a different set of abilities
  - different cost leanings (flesh is cheap for Hollis, plate and barrels are cheap for
    Brackett)
  - a few limits (wings only lift up to medium size; rotors can't lift heavy armor)
  - a guardrail on the look: grown, or built

  They differ more in kind than in strength.
- **Physics in the price.** Every rating costs more than the one before it, so a unit that's
  great at everything is very expensive. Bigger bodies are cheaper to make tough and more
  expensive to make fast, and they take more room in the army.
- **The picture is flavor, the spec is truth.** It's AI-drawn from the aid's description,
  inside the aid's guardrail, so part of the fun is seeing what your opponent came up with.
  On the battlefield, what you see (its size, team color, health) comes from the spec, so a
  picture can't mislead anyone.

## The match

**For now, designing happens before the match** (Robby's call, 2026-10-27). You design in
the lab, read a map's scouting report, take up to five designs in, and fight in real
time. The answer to what you face is designed between matches, not during them.

- **The campaign:** five maps that get harder, against scripted rivals whose units are
  specs from the same two labs, priced the same way. What makes a map harder is said in
  its briefing: a head start, a richer supply line, more deposits, an earlier push,
  ambushes. The rival's supply line is the one place it plays by different rules, and the
  briefing says so.
- **The economy:** matter comes from your base and from deposits you hold. Hold a deposit
  by having units near it and none of theirs; units that can gather add more. Two bays make
  units at once, each taking the time on its card. The army has room for 30.
- **Later, maybe:** designing during the match, with the lab's wait as part of the game
  (the earlier idea), and a minute at the start for first orders.
- **Order of work:**
  1. the lab (done)
  2. fights against scripted computer opponents (done)
  3. then AI players, multiplayer (likely deterministic lockstep), or both

## Open questions

- What resources are there, and do gatherers come pre-made, or are they your first design?
- Balancing the two aids. On even builds Brackett comes out about 7% cheaper. With fights
  now in, `tools/bout.mjs` is the place to test it.
- Does the aid remember your designs across matches, so it becomes yours over time?
- Abilities are a menu for now. Do they stay a menu, or does the aid get to invent new
  ones from a smaller set of primitives?

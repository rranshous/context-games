# Rescue Run

## High-Level Vision

A game that teaches **tool design for AI agents** through a rescue vehicle simulation.

## Core Concept

You are the engineer programming an autonomous rescue vehicle. You don't control the car directly - you **design the tools** it uses to perceive and act. Then you hit "Deploy" and watch the AI use your tools to (hopefully) rescue stranded people.

**The insight:** How you define tools determines how well the AI performs. Vague tools = confused AI. Missing tools = stuck AI. Well-designed tools = successful rescue.

## Gameplay Loop

1. **View the map** - Top-down tile grid showing:
   - Rescue vehicle start position
   - Stranded people locations
   - Hazards (fires, debris, floods)
   - Safe zone / extraction point

2. **Design tools** - Write tool definitions:
   - Name, parameters, description
   - What information it returns
   - Can bake in reminders/context

3. **Deploy** - Hit run, AI uses YOUR tools to navigate and rescue

4. **Watch & Learn** - See what the AI does:
   - Success: People rescued!
   - Failure: Car crashes, gets stuck, misses people
   - Learn WHY from how it used (or misused) your tools

5. **Iterate** - Refine tool definitions, try again

## Teaching Moments

- **Low vs High-level tools**: `move_north()` vs `navigate_to(location)`
- **Context injection**: Baking reminders into tool responses
- **Tool completeness**: Forgetting `wait()` means AI can't pause
- **Clarity matters**: Vague descriptions = unpredictable behavior

## Visual Style

Top-down pixel art using existing assets:
- 16x16 car sprites (from raceon/mini-pixel-pack-2)
- Road tiles, props, details
- Simple clean UI for tool editor

## Platform

Single HTML file for vanilla platform (AI inference via proxy).

## Future Ideas

- Multiple levels with increasing complexity
- Tool slot limits (can only give AI N tools)
- Token budget (longer descriptions = fewer tools)
- Leaderboard: fewest tools / iterations to complete

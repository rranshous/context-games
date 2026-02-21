# Cognitive Climb

An animalistic survival / evolution simulation inspired by the [context-embodiment](https://github.com/rranshous/context-embodiment) experiments.

## Core Concept

Creatures with algorithmic reflexes and occasional LLM consciousness evolve under survival pressure in a 2D world with terrain, food, and hazards. The player observes as a god — tweaking the environment to shape the course of evolution.

## Key Principles (from context-embodiment)

- **Constraint drives innovation**: limiting what creatures can do forces them to evolve
- **Death is the best teacher**: reflection after death is the primary iteration mechanism
- **Consciousness/reflex split**: bodies run themselves 96% of the time; expensive thinking is reserved for novel situations
- **Budget as physics**: energy constraints force genuine architectural tradeoffs

## Architecture

- **Sim**: Runs headless in a Web Worker — pure logic, no rendering
- **Visualizer**: Canvas 2D on the main thread — terrain, creatures, stats
- **Interface**: Typed postMessage contract between the two (events, state snapshots, commands)
- **LLM consciousness**: Occasional haiku calls via the vanilla platform's inference proxy

## Evolution Mechanics

- Genome encodes body traits (speed, sense range, size, metabolism, diet) and reflex weights
- Reflexes run every tick: perceive → score actions → execute best
- Reproduction when energy is high; offspring get mutated genomes
- Natural selection: creatures that eat more and survive longer reproduce more
- LLM consciousness (later): can adjust reflex weights and write to memory, but costs energy

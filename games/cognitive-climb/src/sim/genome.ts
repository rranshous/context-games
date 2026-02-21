import type { GenomeState, ReflexWeights } from '../interface/state.js';

// ── Random helpers ───────────────────────────────────────

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Box-Muller gaussian noise */
function gaussian(mean: number, stddev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return mean + stddev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ── Genome creation ──────────────────────────────────────

export function randomGenome(): GenomeState {
  return {
    speed: rand(0.5, 2),
    senseRange: rand(2, 8),
    size: rand(0.5, 2),
    metabolism: rand(0.5, 1.5),
    diet: rand(0, 0.3),  // mostly herbivore to start
    wakeInterval: Math.round(rand(30, 200)),
    reflexWeights: randomReflexWeights(),
  };
}

function randomReflexWeights(): ReflexWeights {
  return {
    foodAttraction: rand(0.3, 1),
    dangerAvoidance: rand(0.3, 1),
    curiosity: rand(0.1, 0.7),
    restThreshold: rand(0.15, 0.4),
    sociality: rand(-0.3, 0.3),
  };
}

// ── Mutation ─────────────────────────────────────────────

const MUTATION_RATE = 0.15;     // chance per gene
const MUTATION_STRENGTH = 0.1;  // stddev relative to range
const LARGE_MUTATION_CHANCE = 0.05;

export function mutateGenome(parent: GenomeState): GenomeState {
  return {
    speed: mutateGene(parent.speed, 0.5, 2),
    senseRange: mutateGene(parent.senseRange, 2, 8),
    size: mutateGene(parent.size, 0.5, 2),
    metabolism: mutateGene(parent.metabolism, 0.5, 1.5),
    diet: mutateGene(parent.diet, 0, 1),
    wakeInterval: Math.round(mutateGene(parent.wakeInterval, 30, 200)),
    reflexWeights: mutateReflexWeights(parent.reflexWeights),
  };
}

function mutateGene(value: number, min: number, max: number): number {
  if (Math.random() > MUTATION_RATE) return value;

  const range = max - min;
  const strength = Math.random() < LARGE_MUTATION_CHANCE
    ? MUTATION_STRENGTH * 5  // occasional large jump
    : MUTATION_STRENGTH;

  return clamp(gaussian(value, range * strength), min, max);
}

function mutateReflexWeights(w: ReflexWeights): ReflexWeights {
  return {
    foodAttraction: mutateGene(w.foodAttraction, 0, 1),
    dangerAvoidance: mutateGene(w.dangerAvoidance, 0, 1),
    curiosity: mutateGene(w.curiosity, 0, 1),
    restThreshold: mutateGene(w.restThreshold, 0.05, 0.6),
    sociality: mutateGene(w.sociality, -1, 1),
  };
}

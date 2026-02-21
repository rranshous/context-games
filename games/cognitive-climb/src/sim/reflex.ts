import type { CellState } from '../interface/state.js';
import type { Creature } from './creature.js';
import type { World } from './world.js';

// ── Direction helpers ────────────────────────────────────

const DIRS = [
  { dx: 0, dy: -1 }, // N
  { dx: 1, dy: 0 },  // E
  { dx: 0, dy: 1 },  // S
  { dx: -1, dy: 0 }, // W
] as const;

interface PerceivedCell {
  x: number;
  y: number;
  cell: CellState;
  dist: number;
}

interface ActionScore {
  action: 'move' | 'eat' | 'rest';
  dx: number;
  dy: number;
  score: number;
}

// ── Perception ───────────────────────────────────────────

function perceive(creature: Creature, world: World, allCreatures: Creature[]): PerceivedCell[] {
  const range = Math.round(creature.genome.senseRange);
  const perceived: PerceivedCell[] = [];

  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      const nx = creature.x + dx;
      const ny = creature.y + dy;
      if (!world.inBounds(nx, ny)) continue;
      const dist = Math.abs(dx) + Math.abs(dy); // manhattan
      if (dist > range || dist === 0) continue;
      perceived.push({ x: nx, y: ny, cell: world.cellAt(nx, ny), dist });
    }
  }
  return perceived;
}

// ── Scoring ──────────────────────────────────────────────

function scoreActions(
  creature: Creature,
  world: World,
  allCreatures: Creature[],
  perceived: PerceivedCell[],
): ActionScore[] {
  const w = creature.genome.reflexWeights;
  const scores: ActionScore[] = [];

  // Score: eat (if food at current position)
  const currentCell = world.cellAt(creature.x, creature.y);
  if (currentCell.food > 0) {
    const hunger = 1 - creature.energyRatio; // 0 = full, 1 = starving
    scores.push({
      action: 'eat',
      dx: 0,
      dy: 0,
      score: w.foodAttraction * (0.5 + hunger) * currentCell.food,
    });
  }

  // Score: rest (if low energy)
  if (creature.energyRatio < w.restThreshold) {
    scores.push({
      action: 'rest',
      dx: 0,
      dy: 0,
      score: (w.restThreshold - creature.energyRatio) * 2,
    });
  }

  // Score: move in each direction
  for (const dir of DIRS) {
    const nx = creature.x + dir.dx;
    const ny = creature.y + dir.dy;
    if (!world.isWalkable(nx, ny)) continue;

    let moveScore = 0;

    // Attraction to nearby food
    const foodCells = perceived.filter(p => p.cell.food > 0);
    for (const fc of foodCells) {
      const currentDist = Math.abs(fc.x - creature.x) + Math.abs(fc.y - creature.y);
      const newDist = Math.abs(fc.x - nx) + Math.abs(fc.y - ny);
      if (newDist < currentDist) {
        moveScore += w.foodAttraction * fc.cell.food / fc.dist;
      }
    }

    // Curiosity: prefer unexplored / distant movement
    moveScore += w.curiosity * 0.3;

    // Anti-oscillation: slight penalty for reversing last move
    const lastDx = creature.mem['lastDx'] as number | undefined;
    const lastDy = creature.mem['lastDy'] as number | undefined;
    if (lastDx !== undefined && dir.dx === -lastDx && dir.dy === -lastDy) {
      moveScore -= 0.2;
    }

    // Sociality: attraction/repulsion to other creatures
    const nearbyCreatures = allCreatures.filter(c =>
      c.id !== creature.id && c.alive &&
      Math.abs(c.x - nx) + Math.abs(c.y - ny) <= 3
    );
    if (nearbyCreatures.length > 0) {
      moveScore += w.sociality * nearbyCreatures.length * 0.2;
    }

    scores.push({ action: 'move', dx: dir.dx, dy: dir.dy, score: moveScore });
  }

  // Random noise to break ties and add unpredictability
  for (const s of scores) {
    s.score += Math.random() * 0.1;
  }

  return scores.sort((a, b) => b.score - a.score);
}

// ── Execute reflex tick ──────────────────────────────────

export interface ReflexResult {
  action: 'move' | 'eat' | 'rest' | 'idle';
  dx: number;
  dy: number;
  foodEaten: number;
}

export function reflexTick(
  creature: Creature,
  world: World,
  allCreatures: Creature[],
): ReflexResult {
  // Handle fractional speed: accumulate and only act when >= 1
  creature.moveAccumulator += creature.genome.speed;
  if (creature.moveAccumulator < 1) {
    return { action: 'idle', dx: 0, dy: 0, foodEaten: 0 };
  }
  creature.moveAccumulator -= 1;

  const perceived = perceive(creature, world, allCreatures);
  const actions = scoreActions(creature, world, allCreatures, perceived);

  if (actions.length === 0) {
    return { action: 'idle', dx: 0, dy: 0, foodEaten: 0 };
  }

  const best = actions[0];

  switch (best.action) {
    case 'eat': {
      const eaten = world.consumeFood(creature.x, creature.y);
      creature.feed(eaten);
      return { action: 'eat', dx: 0, dy: 0, foodEaten: eaten };
    }

    case 'rest': {
      // Resting recovers a tiny bit of energy
      creature.energy = Math.min(creature.maxEnergy, creature.energy + 0.5);
      return { action: 'rest', dx: 0, dy: 0, foodEaten: 0 };
    }

    case 'move': {
      creature.mem['lastDx'] = best.dx;
      creature.mem['lastDy'] = best.dy;
      creature.x += best.dx;
      creature.y += best.dy;
      creature.energy -= creature.moveCost;
      if (creature.energy <= 0) {
        creature.energy = 0;
        creature.alive = false;
      }
      return { action: 'move', dx: best.dx, dy: best.dy, foodEaten: 0 };
    }

    default:
      return { action: 'idle', dx: 0, dy: 0, foodEaten: 0 };
  }
}

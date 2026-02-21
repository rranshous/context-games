// src/sim/genome.ts
function rand(min, max) {
  return min + Math.random() * (max - min);
}
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
function gaussian(mean, stddev) {
  const u1 = Math.random();
  const u2 = Math.random();
  return mean + stddev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
function randomGenome() {
  return {
    speed: rand(0.5, 2),
    senseRange: rand(2, 8),
    size: rand(0.5, 2),
    metabolism: rand(0.5, 1.5),
    diet: rand(0, 0.3),
    // mostly herbivore to start
    reflexWeights: randomReflexWeights()
  };
}
function randomReflexWeights() {
  return {
    foodAttraction: rand(0.3, 1),
    dangerAvoidance: rand(0.3, 1),
    curiosity: rand(0.1, 0.7),
    restThreshold: rand(0.15, 0.4),
    sociality: rand(-0.3, 0.3)
  };
}
var MUTATION_RATE = 0.15;
var MUTATION_STRENGTH = 0.1;
var LARGE_MUTATION_CHANCE = 0.05;
function mutateGenome(parent) {
  return {
    speed: mutateGene(parent.speed, 0.5, 2),
    senseRange: mutateGene(parent.senseRange, 2, 8),
    size: mutateGene(parent.size, 0.5, 2),
    metabolism: mutateGene(parent.metabolism, 0.5, 1.5),
    diet: mutateGene(parent.diet, 0, 1),
    reflexWeights: mutateReflexWeights(parent.reflexWeights)
  };
}
function mutateGene(value, min, max) {
  if (Math.random() > MUTATION_RATE) return value;
  const range = max - min;
  const strength = Math.random() < LARGE_MUTATION_CHANCE ? MUTATION_STRENGTH * 5 : MUTATION_STRENGTH;
  return clamp(gaussian(value, range * strength), min, max);
}
function mutateReflexWeights(w) {
  return {
    foodAttraction: mutateGene(w.foodAttraction, 0, 1),
    dangerAvoidance: mutateGene(w.dangerAvoidance, 0, 1),
    curiosity: mutateGene(w.curiosity, 0, 1),
    restThreshold: mutateGene(w.restThreshold, 0.05, 0.6),
    sociality: mutateGene(w.sociality, -1, 1)
  };
}

// src/sim/creature.ts
var nextId = 1;
var Creature = class {
  id;
  x;
  y;
  energy;
  maxEnergy;
  age = 0;
  generation;
  genome;
  parentId;
  alive = true;
  /** Persistent memory dict (like exp 10's mem) */
  mem = {};
  /** Ticks since last ate — for hunger urgency */
  ticksSinceAte = 0;
  /** Movement accumulator for fractional speed */
  moveAccumulator = 0;
  constructor(x, y, genome, parentId, generation) {
    this.id = nextId++;
    this.x = x;
    this.y = y;
    this.genome = genome ?? randomGenome();
    this.parentId = parentId ?? null;
    this.generation = generation ?? 0;
    this.maxEnergy = 50 + this.genome.size * 30;
    this.energy = this.maxEnergy * 0.6;
  }
  /** Energy cost per tick from just existing */
  get baseBurnRate() {
    return 0.3 * this.genome.size * (0.5 + this.genome.speed * 0.5) / this.genome.metabolism;
  }
  get moveCost() {
    return 0.5 * this.genome.size / this.genome.metabolism;
  }
  get energyRatio() {
    return this.energy / this.maxEnergy;
  }
  burnBaseEnergy() {
    this.energy -= this.baseBurnRate;
    this.age++;
    this.ticksSinceAte++;
    if (this.energy <= 0) {
      this.energy = 0;
      this.alive = false;
    }
  }
  feed(foodValue) {
    const gained = foodValue * 5 * this.genome.metabolism;
    this.energy = Math.min(this.maxEnergy, this.energy + gained);
    this.ticksSinceAte = 0;
    return gained;
  }
  canReproduce() {
    return this.energy > this.maxEnergy * 0.7 && this.age > 30;
  }
  payReproductionCost() {
    this.energy *= 0.4;
  }
  toState() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      energy: Math.round(this.energy * 10) / 10,
      maxEnergy: Math.round(this.maxEnergy * 10) / 10,
      age: this.age,
      generation: this.generation,
      genome: this.genome,
      parentId: this.parentId
    };
  }
};

// src/sim/reflex.ts
var DIRS = [
  { dx: 0, dy: -1 },
  // N
  { dx: 1, dy: 0 },
  // E
  { dx: 0, dy: 1 },
  // S
  { dx: -1, dy: 0 }
  // W
];
function perceive(creature, world, allCreatures) {
  const range = Math.round(creature.genome.senseRange);
  const perceived = [];
  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      const nx = creature.x + dx;
      const ny = creature.y + dy;
      if (!world.inBounds(nx, ny)) continue;
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist > range || dist === 0) continue;
      perceived.push({ x: nx, y: ny, cell: world.cellAt(nx, ny), dist });
    }
  }
  return perceived;
}
function scoreActions(creature, world, allCreatures, perceived) {
  const w = creature.genome.reflexWeights;
  const scores = [];
  const currentCell = world.cellAt(creature.x, creature.y);
  const stayPenalty = currentCell.danger > 0 ? -w.dangerAvoidance * currentCell.danger * 3 : 0;
  if (currentCell.food > 0) {
    const hunger = 1 - creature.energyRatio;
    scores.push({
      action: "eat",
      dx: 0,
      dy: 0,
      score: w.foodAttraction * (0.5 + hunger) * currentCell.food + stayPenalty
    });
  }
  if (creature.energyRatio < w.restThreshold) {
    scores.push({
      action: "rest",
      dx: 0,
      dy: 0,
      score: (w.restThreshold - creature.energyRatio) * 2 + stayPenalty
    });
  }
  for (const dir of DIRS) {
    const nx = creature.x + dir.dx;
    const ny = creature.y + dir.dy;
    if (!world.isWalkable(nx, ny)) continue;
    let moveScore = 0;
    const targetCell = world.cellAt(nx, ny);
    if (targetCell.danger > 0) {
      moveScore -= w.dangerAvoidance * targetCell.danger * 2;
    }
    const dangerCells = perceived.filter((p) => p.cell.danger > 0);
    for (const dc of dangerCells) {
      const currentDist = Math.abs(dc.x - creature.x) + Math.abs(dc.y - creature.y);
      const newDist = Math.abs(dc.x - nx) + Math.abs(dc.y - ny);
      if (newDist < currentDist) {
        moveScore -= w.dangerAvoidance * dc.cell.danger / dc.dist;
      } else if (newDist > currentDist) {
        moveScore += w.dangerAvoidance * 0.3 / dc.dist;
      }
    }
    const foodCells = perceived.filter((p) => p.cell.food > 0);
    for (const fc of foodCells) {
      const currentDist = Math.abs(fc.x - creature.x) + Math.abs(fc.y - creature.y);
      const newDist = Math.abs(fc.x - nx) + Math.abs(fc.y - ny);
      if (newDist < currentDist) {
        moveScore += w.foodAttraction * fc.cell.food / fc.dist;
      }
    }
    moveScore += w.curiosity * 0.3;
    const lastDx = creature.mem["lastDx"];
    const lastDy = creature.mem["lastDy"];
    if (lastDx !== void 0 && dir.dx === -lastDx && dir.dy === -lastDy) {
      moveScore -= 0.2;
    }
    const nearbyCreatures = allCreatures.filter(
      (c) => c.id !== creature.id && c.alive && Math.abs(c.x - nx) + Math.abs(c.y - ny) <= 3
    );
    if (nearbyCreatures.length > 0) {
      moveScore += w.sociality * nearbyCreatures.length * 0.2;
    }
    scores.push({ action: "move", dx: dir.dx, dy: dir.dy, score: moveScore });
  }
  for (const s of scores) {
    s.score += Math.random() * 0.1;
  }
  return scores.sort((a, b) => b.score - a.score);
}
function reflexTick(creature, world, allCreatures) {
  creature.moveAccumulator += creature.genome.speed;
  if (creature.moveAccumulator < 1) {
    return { action: "idle", dx: 0, dy: 0, foodEaten: 0 };
  }
  creature.moveAccumulator -= 1;
  const perceived = perceive(creature, world, allCreatures);
  const actions = scoreActions(creature, world, allCreatures, perceived);
  if (actions.length === 0) {
    return { action: "idle", dx: 0, dy: 0, foodEaten: 0 };
  }
  const best = actions[0];
  switch (best.action) {
    case "eat": {
      const eaten = world.consumeFood(creature.x, creature.y);
      creature.feed(eaten);
      return { action: "eat", dx: 0, dy: 0, foodEaten: eaten };
    }
    case "rest": {
      creature.energy = Math.min(creature.maxEnergy, creature.energy + 0.5);
      return { action: "rest", dx: 0, dy: 0, foodEaten: 0 };
    }
    case "move": {
      creature.mem["lastDx"] = best.dx;
      creature.mem["lastDy"] = best.dy;
      creature.x += best.dx;
      creature.y += best.dy;
      creature.energy -= creature.moveCost;
      if (creature.energy <= 0) {
        creature.energy = 0;
        creature.alive = false;
      }
      return { action: "move", dx: best.dx, dy: best.dy, foodEaten: 0 };
    }
    default:
      return { action: "idle", dx: 0, dy: 0, foodEaten: 0 };
  }
}

// src/sim/world.ts
function makeNoise2D(seed) {
  function hash(x, y) {
    let h = seed;
    h ^= x * 374761393;
    h ^= y * 668265263;
    h = Math.imul(h, 1274126177);
    h ^= h >>> 16;
    return (h & 2147483647) / 2147483647;
  }
  function smoothstep(t) {
    return t * t * (3 - 2 * t);
  }
  return function noise(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = smoothstep(x - ix);
    const fy = smoothstep(y - iy);
    const v00 = hash(ix, iy);
    const v10 = hash(ix + 1, iy);
    const v01 = hash(ix, iy + 1);
    const v11 = hash(ix + 1, iy + 1);
    const top = v00 + fx * (v10 - v00);
    const bot = v01 + fx * (v11 - v01);
    return top + fy * (bot - top);
  };
}
function fbm(noise, x, y, octaves) {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxAmp = 0;
  for (let i = 0; i < octaves; i++) {
    value += noise(x * frequency, y * frequency) * amplitude;
    maxAmp += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / maxAmp;
}
function classifyTerrain(elevation, moisture) {
  if (elevation < 0.3) return "water";
  if (elevation < 0.4) return "sand";
  if (elevation > 0.8) return "rock";
  if (moisture > 0.55) return "forest";
  return "grass";
}
var DEFAULT_CONFIG = {
  width: 64,
  height: 64,
  foodSpawnRate: 2e-3,
  maxFoodPerCell: 5
};
var World = class {
  width;
  height;
  cells;
  config;
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.width = this.config.width;
    this.height = this.config.height;
    this.cells = new Array(this.width * this.height);
    this.generate();
  }
  generate() {
    const seed = this.config.seed ?? Math.floor(Math.random() * 1e5);
    const elevNoise = makeNoise2D(seed);
    const moistNoise = makeNoise2D(seed + 12345);
    const scale = 0.08;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const elevation = fbm(elevNoise, x * scale, y * scale, 4);
        const moisture = fbm(moistNoise, x * scale * 1.3, y * scale * 1.3, 3);
        const terrain = classifyTerrain(elevation, moisture);
        this.cells[y * this.width + x] = {
          terrain,
          elevation,
          food: terrain === "grass" || terrain === "forest" ? Math.random() < 0.15 ? Math.floor(Math.random() * 3) + 1 : 0 : 0,
          danger: 0
        };
      }
    }
    this.generateHazards(seed);
  }
  /** Place hazard zones — clusters of danger near rocky/edge terrain */
  generateHazards(seed) {
    const hazardNoise = makeNoise2D(seed + 99999);
    const scale = 0.12;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = this.cellAt(x, y);
        if (cell.terrain === "water") continue;
        const noise = fbm(hazardNoise, x * scale, y * scale, 3);
        const nearEdge = Math.min(x, y, this.width - 1 - x, this.height - 1 - y) < 4 ? 0.15 : 0;
        const nearRock = cell.terrain === "rock" ? 0.2 : 0;
        const hazardChance = noise + nearEdge + nearRock;
        if (hazardChance > 0.78) {
          cell.danger = 1 + Math.floor((hazardChance - 0.78) * 15);
        }
      }
    }
  }
  cellAt(x, y) {
    return this.cells[y * this.width + x];
  }
  inBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }
  isWalkable(x, y) {
    if (!this.inBounds(x, y)) return false;
    return this.cellAt(x, y).terrain !== "water";
  }
  /** Spawn food on eligible cells. Returns new food positions. */
  spawnFood() {
    const spawned = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = this.cellAt(x, y);
        if ((cell.terrain === "grass" || cell.terrain === "forest") && cell.food < this.config.maxFoodPerCell && Math.random() < this.config.foodSpawnRate) {
          const value = cell.terrain === "forest" ? 2 : 1;
          cell.food += value;
          spawned.push({ x, y, value });
        }
      }
    }
    return spawned;
  }
  consumeFood(x, y) {
    const cell = this.cellAt(x, y);
    if (cell.food <= 0) return 0;
    const eaten = Math.min(cell.food, 3);
    cell.food -= eaten;
    return eaten;
  }
  setFood(x, y, value) {
    if (this.inBounds(x, y)) {
      this.cellAt(x, y).food = Math.max(0, value);
    }
  }
};

// src/sim/engine.ts
function round2(v) {
  return Math.round(v * 100) / 100;
}
var DEFAULT_ENGINE_CONFIG = {
  initialCreatures: 12,
  foodSpawnInterval: 5,
  world: {}
};
var Engine = class {
  world;
  creatures = [];
  tick = 0;
  totalBirths = 0;
  totalDeaths = 0;
  deathsByStarvation = 0;
  deathsByHazard = 0;
  emit;
  config;
  constructor(emit2, config = {}) {
    this.emit = emit2;
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
    this.world = new World(this.config.world);
    this.spawnInitialCreatures();
  }
  spawnInitialCreatures() {
    for (let i = 0; i < this.config.initialCreatures; i++) {
      this.spawnCreatureRandom();
    }
  }
  spawnCreatureRandom() {
    let x, y;
    let attempts = 0;
    do {
      x = Math.floor(Math.random() * this.world.width);
      y = Math.floor(Math.random() * this.world.height);
      attempts++;
    } while ((!this.world.isWalkable(x, y) || this.world.cellAt(x, y).danger > 0) && attempts < 200);
    const creature = new Creature(x, y);
    this.creatures.push(creature);
    this.totalBirths++;
    this.emit({ type: "creature:spawned", creature: creature.toState() });
    return creature;
  }
  spawnCreatureAt(x, y, genome) {
    if (!this.world.isWalkable(x, y)) return;
    const creature = new Creature(x, y);
    if (genome) {
      Object.assign(creature.genome, genome);
    }
    this.creatures.push(creature);
    this.totalBirths++;
    this.emit({ type: "creature:spawned", creature: creature.toState() });
  }
  step() {
    this.tick++;
    if (this.tick % this.config.foodSpawnInterval === 0) {
      this.world.spawnFood();
    }
    const alive = this.creatures.filter((c) => c.alive);
    for (const creature of alive) {
      creature.burnBaseEnergy();
      if (!creature.alive) {
        this.handleDeath(creature, "starvation");
        continue;
      }
      const result = reflexTick(creature, this.world, alive);
      if (result.action === "eat" && result.foodEaten > 0) {
        this.emit({
          type: "creature:ate",
          id: creature.id,
          foodValue: result.foodEaten,
          x: creature.x,
          y: creature.y
        });
      }
      if (creature.alive) {
        const cell = this.world.cellAt(creature.x, creature.y);
        if (cell.danger > 0) {
          creature.energy -= cell.danger;
          if (creature.energy <= 0) {
            creature.energy = 0;
            this.handleDeath(creature, "hazard");
          }
        }
      }
    }
    const canReproduce = this.creatures.filter((c) => c.alive && c.canReproduce());
    for (const parent of canReproduce) {
      this.reproduce(parent);
    }
    const maxDead = 100;
    const dead = this.creatures.filter((c) => !c.alive);
    if (dead.length > maxDead) {
      const toRemove = dead.slice(0, dead.length - maxDead);
      for (const d of toRemove) {
        const idx = this.creatures.indexOf(d);
        if (idx !== -1) this.creatures.splice(idx, 1);
      }
    }
    const livingCount = this.creatures.filter((c) => c.alive).length;
    if (livingCount < 3) {
      for (let i = livingCount; i < 5; i++) {
        this.spawnCreatureRandom();
      }
      this.emit({ type: "log", message: `Population critical (${livingCount}) \u2014 spawned reinforcements` });
    }
    if (this.tick % 10 === 0) {
      this.emit({ type: "stats", stats: this.getStats() });
    }
    if (this.tick % 30 === 0) {
      this.emit({ type: "state", state: this.getWorldState() });
    }
  }
  handleDeath(creature, cause) {
    creature.alive = false;
    this.totalDeaths++;
    if (cause === "starvation") this.deathsByStarvation++;
    if (cause === "hazard") this.deathsByHazard++;
    this.emit({ type: "creature:died", id: creature.id, cause, tick: this.tick });
  }
  reproduce(parent) {
    const dirs = [
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 }
    ];
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    for (const dir of dirs) {
      const nx = parent.x + dir.dx;
      const ny = parent.y + dir.dy;
      if (!this.world.isWalkable(nx, ny)) continue;
      const occupied = this.creatures.some((c) => c.alive && c.x === nx && c.y === ny);
      if (occupied) continue;
      parent.payReproductionCost();
      const childGenome = mutateGenome(parent.genome);
      const child = new Creature(nx, ny, childGenome, parent.id, parent.generation + 1);
      this.creatures.push(child);
      this.totalBirths++;
      this.emit({ type: "creature:spawned", creature: child.toState() });
      this.emit({ type: "creature:reproduced", parentId: parent.id, childId: child.id });
      return;
    }
  }
  getStats() {
    const alive = this.creatures.filter((c) => c.alive);
    const n = alive.length;
    const avgTraits = n > 0 ? {
      speed: round2(alive.reduce((s, c) => s + c.genome.speed, 0) / n),
      senseRange: round2(alive.reduce((s, c) => s + c.genome.senseRange, 0) / n),
      size: round2(alive.reduce((s, c) => s + c.genome.size, 0) / n),
      metabolism: round2(alive.reduce((s, c) => s + c.genome.metabolism, 0) / n),
      diet: round2(alive.reduce((s, c) => s + c.genome.diet, 0) / n)
    } : null;
    return {
      tick: this.tick,
      creatureCount: n,
      totalBirths: this.totalBirths,
      totalDeaths: this.totalDeaths,
      avgEnergy: n > 0 ? Math.round(alive.reduce((s, c) => s + c.energy, 0) / n * 10) / 10 : 0,
      maxGeneration: n > 0 ? Math.max(...alive.map((c) => c.generation)) : 0,
      avgTraits,
      deathsByStarvation: this.deathsByStarvation,
      deathsByHazard: this.deathsByHazard
    };
  }
  getWorldState() {
    return {
      width: this.world.width,
      height: this.world.height,
      tick: this.tick,
      cells: this.world.cells.map((c) => ({ ...c })),
      creatures: this.creatures.filter((c) => c.alive).map((c) => c.toState()),
      stats: this.getStats()
    };
  }
};

// src/sim/worker.ts
var engine = null;
var tickTimer = null;
var ticksPerSecond = 10;
function emit(event) {
  postMessage(event);
}
function startTickLoop() {
  stopTickLoop();
  tickTimer = setInterval(() => {
    if (engine) engine.step();
  }, 1e3 / ticksPerSecond);
}
function stopTickLoop() {
  if (tickTimer !== null) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}
self.onmessage = (e) => {
  const cmd = e.data;
  switch (cmd.type) {
    case "start": {
      engine = new Engine(emit);
      emit({ type: "state", state: engine.getWorldState() });
      emit({ type: "log", message: `Simulation started \u2014 ${engine.creatures.filter((c) => c.alive).length} creatures` });
      startTickLoop();
      break;
    }
    case "pause": {
      stopTickLoop();
      emit({ type: "log", message: "Paused" });
      break;
    }
    case "resume": {
      if (engine) startTickLoop();
      emit({ type: "log", message: "Resumed" });
      break;
    }
    case "setSpeed": {
      ticksPerSecond = Math.max(1, Math.min(60, cmd.ticksPerSecond));
      if (tickTimer !== null) startTickLoop();
      break;
    }
    case "getState": {
      if (engine) {
        emit({ type: "state", state: engine.getWorldState() });
      }
      break;
    }
    case "spawnFood": {
      if (engine) {
        engine.world.setFood(cmd.x, cmd.y, engine.world.cellAt(cmd.x, cmd.y).food + cmd.value);
      }
      break;
    }
    case "spawnCreature": {
      if (engine) {
        engine.spawnCreatureAt(cmd.x, cmd.y, cmd.genome);
      }
      break;
    }
    case "modifyTerrain": {
      break;
    }
  }
};
//# sourceMappingURL=worker.js.map

// src/sim/rules.ts
var MAX_RULES = 5;
var CONDITION_TYPES = [
  "energy_below",
  "energy_above",
  "danger_nearby",
  "danger_here",
  "food_nearby",
  "food_here",
  "creatures_nearby_above",
  "creatures_nearby_below",
  "on_terrain"
];
var EFFECT_TARGETS = [
  "eat",
  "rest",
  "flee_danger",
  "seek_food",
  "explore",
  "seek_company"
];
var TERRAINS = ["grass", "forest", "sand", "rock"];
var RULE_DROP_RATE = 0.1;
var RULE_MUTATE_RATE = 0.15;
var RULE_GAIN_RATE = 0.05;
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
function gaussian(mean, stddev) {
  const u1 = Math.random();
  const u2 = Math.random();
  return mean + stddev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
var ruleIdCounter = 0;
function generateRuleId() {
  return `r${++ruleIdCounter}`;
}
function evaluateCondition(cond, ctx) {
  switch (cond.type) {
    case "energy_below":
      return ctx.energyRatio < (cond.threshold ?? 0.5);
    case "energy_above":
      return ctx.energyRatio > (cond.threshold ?? 0.5);
    case "danger_nearby":
      return ctx.nearbyDangerCount > 0;
    case "danger_here":
      return ctx.currentDanger > 0;
    case "food_nearby":
      return ctx.nearbyFoodCount > 0;
    case "food_here":
      return ctx.currentFood > 0;
    case "creatures_nearby_above":
      return ctx.nearbyCreatureCount > (cond.threshold ?? 3);
    case "creatures_nearby_below":
      return ctx.nearbyCreatureCount < (cond.threshold ?? 1);
    case "on_terrain":
      return ctx.currentTerrain === cond.terrain;
    default:
      return false;
  }
}
function computeRuleModifiers(rules, ctx) {
  const mods = {
    eatBonus: 0,
    restBonus: 0,
    fleeDangerBonus: 0,
    seekFoodBonus: 0,
    exploreBonus: 0,
    seekCompanyBonus: 0
  };
  for (const rule of rules) {
    if (!evaluateCondition(rule.condition, ctx)) continue;
    switch (rule.effect.target) {
      case "eat":
        mods.eatBonus += rule.effect.modifier;
        break;
      case "rest":
        mods.restBonus += rule.effect.modifier;
        break;
      case "flee_danger":
        mods.fleeDangerBonus += rule.effect.modifier;
        break;
      case "seek_food":
        mods.seekFoodBonus += rule.effect.modifier;
        break;
      case "explore":
        mods.exploreBonus += rule.effect.modifier;
        break;
      case "seek_company":
        mods.seekCompanyBonus += rule.effect.modifier;
        break;
    }
  }
  return mods;
}
function mutateRules(parentRules) {
  const rules = [];
  for (const rule of parentRules) {
    if (Math.random() < RULE_DROP_RATE) continue;
    const mutated = {
      id: rule.id,
      condition: { ...rule.condition },
      effect: { ...rule.effect }
    };
    if (mutated.condition.threshold !== void 0 && Math.random() < RULE_MUTATE_RATE) {
      const isEnergy = mutated.condition.type === "energy_below" || mutated.condition.type === "energy_above";
      const min = isEnergy ? 0.05 : 0;
      const max = isEnergy ? 0.95 : 10;
      const range = max - min;
      mutated.condition.threshold = clamp(
        gaussian(mutated.condition.threshold, range * 0.1),
        min,
        max
      );
    }
    if (Math.random() < RULE_MUTATE_RATE) {
      mutated.effect.modifier = clamp(
        gaussian(mutated.effect.modifier, 0.4),
        -2,
        2
      );
    }
    rules.push(mutated);
  }
  if (rules.length < MAX_RULES && Math.random() < RULE_GAIN_RATE) {
    rules.push(randomRule());
  }
  return rules;
}
function randomRule() {
  const condType = CONDITION_TYPES[Math.floor(Math.random() * CONDITION_TYPES.length)];
  const condition = { type: condType };
  if (condType === "energy_below" || condType === "energy_above") {
    condition.threshold = 0.1 + Math.random() * 0.8;
  } else if (condType === "creatures_nearby_above" || condType === "creatures_nearby_below") {
    condition.threshold = Math.floor(Math.random() * 5) + 1;
  } else if (condType === "on_terrain") {
    condition.terrain = TERRAINS[Math.floor(Math.random() * TERRAINS.length)];
  }
  return {
    id: generateRuleId(),
    condition,
    effect: {
      target: EFFECT_TARGETS[Math.floor(Math.random() * EFFECT_TARGETS.length)],
      modifier: Math.random() * 4 - 2
      // -2 to +2
    }
  };
}
function validateRule(input) {
  let condInput = input.condition;
  let effectInput = input.effect;
  if (!condInput && input.condition_type) {
    condInput = { type: input.condition_type, threshold: input.threshold, terrain: input.terrain };
  }
  if (!effectInput && (input.target || input.action)) {
    effectInput = { target: input.target || input.action, modifier: input.modifier };
  }
  if (!condInput || !effectInput) {
    return { error: "Rule must have condition and effect" };
  }
  const condType = condInput.type;
  if (!CONDITION_TYPES.includes(condType)) {
    return { error: `Unknown condition type: ${condType}. Valid: ${CONDITION_TYPES.join(", ")}` };
  }
  const effectTarget = effectInput.target || effectInput.action || effectInput.type;
  if (!EFFECT_TARGETS.includes(effectTarget)) {
    return { error: `Unknown effect target: ${effectTarget}. Valid: ${EFFECT_TARGETS.join(", ")}` };
  }
  const modifier = Number(effectInput.modifier ?? effectInput.amount ?? effectInput.value);
  if (isNaN(modifier)) {
    return { error: "Effect modifier must be a number" };
  }
  const condition = { type: condType };
  if (condType === "energy_below" || condType === "energy_above") {
    const threshold = Number(condInput.threshold);
    if (isNaN(threshold)) return { error: `${condType} requires a numeric threshold (0-1)` };
    condition.threshold = clamp(threshold, 0.01, 0.99);
  } else if (condType === "creatures_nearby_above" || condType === "creatures_nearby_below") {
    const threshold = Number(condInput.threshold);
    if (isNaN(threshold)) return { error: `${condType} requires a numeric threshold` };
    condition.threshold = clamp(Math.round(threshold), 0, 20);
  } else if (condType === "on_terrain") {
    const terrain = String(condInput.terrain || "");
    if (!TERRAINS.includes(terrain)) {
      return { error: `Unknown terrain: ${terrain}. Valid: ${TERRAINS.join(", ")}` };
    }
    condition.terrain = terrain;
  }
  return {
    rule: {
      id: generateRuleId(),
      condition,
      effect: {
        target: effectTarget,
        modifier: clamp(modifier, -2, 2)
      }
    }
  };
}
function formatRule(rule) {
  const c = rule.condition;
  const condStr = c.threshold !== void 0 ? `${c.type}(${c.type.startsWith("energy_") ? c.threshold.toFixed(2) : c.threshold})` : c.terrain ? `${c.type}(${c.terrain})` : c.type;
  const e = rule.effect;
  const sign = e.modifier > 0 ? "+" : "";
  return `[${rule.id}] IF ${condStr} THEN ${e.target} ${sign}${e.modifier.toFixed(1)}`;
}

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
  const dangerCells = perceived.filter((p) => p.cell.danger > 0);
  const foodCells = perceived.filter((p) => p.cell.food > 0);
  const range = Math.round(creature.genome.senseRange);
  const nearbyCreatures = allCreatures.filter(
    (c) => c.id !== creature.id && c.alive && Math.abs(c.x - creature.x) + Math.abs(c.y - creature.y) <= range
  );
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
    for (const dc of dangerCells) {
      const currentDist = Math.abs(dc.x - creature.x) + Math.abs(dc.y - creature.y);
      const newDist = Math.abs(dc.x - nx) + Math.abs(dc.y - ny);
      if (newDist < currentDist) {
        moveScore -= w.dangerAvoidance * dc.cell.danger / dc.dist;
      } else if (newDist > currentDist) {
        moveScore += w.dangerAvoidance * 0.3 / dc.dist;
      }
    }
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
    const dirCreatures = allCreatures.filter(
      (c) => c.id !== creature.id && c.alive && Math.abs(c.x - nx) + Math.abs(c.y - ny) <= 3
    );
    if (dirCreatures.length > 0) {
      moveScore += w.sociality * dirCreatures.length * 0.2;
    }
    scores.push({ action: "move", dx: dir.dx, dy: dir.dy, score: moveScore });
  }
  for (const s of scores) {
    s.score += Math.random() * 0.1;
  }
  if (creature.rules.length > 0) {
    const ruleCtx = {
      energyRatio: creature.energyRatio,
      currentDanger: currentCell.danger,
      nearbyDangerCount: dangerCells.length,
      currentFood: currentCell.food,
      nearbyFoodCount: foodCells.length,
      nearbyCreatureCount: nearbyCreatures.length,
      currentTerrain: currentCell.terrain
    };
    const mods = computeRuleModifiers(creature.rules, ruleCtx);
    for (const s of scores) {
      if (s.action === "eat") {
        s.score += mods.eatBonus;
      } else if (s.action === "rest") {
        s.score += mods.restBonus;
      } else if (s.action === "move") {
        const nx = creature.x + s.dx;
        const ny = creature.y + s.dy;
        if (mods.fleeDangerBonus !== 0) {
          const targetCell = world.cellAt(nx, ny);
          if (targetCell.danger > 0) {
            s.score -= mods.fleeDangerBonus * targetCell.danger;
          } else if (currentCell.danger > 0) {
            s.score += mods.fleeDangerBonus * 0.5;
          }
        }
        if (mods.seekFoodBonus !== 0) {
          let foodPull = 0;
          for (const fc of foodCells) {
            const curDist = Math.abs(fc.x - creature.x) + Math.abs(fc.y - creature.y);
            const newDist = Math.abs(fc.x - nx) + Math.abs(fc.y - ny);
            if (newDist < curDist) foodPull += fc.cell.food / fc.dist;
          }
          s.score += mods.seekFoodBonus * foodPull;
        }
        s.score += mods.exploreBonus * 0.3;
        if (mods.seekCompanyBonus !== 0) {
          let socialPull = 0;
          for (const c of nearbyCreatures) {
            const curDist = Math.abs(c.x - creature.x) + Math.abs(c.y - creature.y);
            const newDist = Math.abs(c.x - nx) + Math.abs(c.y - ny);
            if (newDist < curDist) socialPull++;
          }
          s.score += mods.seekCompanyBonus * socialPull * 0.3;
        }
      }
    }
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

// src/sim/consciousness.ts
var TOOL_DEFINITIONS = [
  {
    name: "set_memory",
    description: "Write a value to your persistent memory. Memory survives between wake-ups and is inherited by offspring. Use this to remember important observations, strategies, or warnings.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string", description: 'Memory key (e.g. "strategy", "danger_zones", "food_direction")' },
        value: { type: "string", description: "Value to store" }
      },
      required: ["key", "value"]
    }
  },
  {
    name: "adjust_reflex_weight",
    description: "Modify one of your body's reflex weights. These control automatic behavior: foodAttraction (how strongly you seek food), dangerAvoidance (how strongly you flee hazards), curiosity (tendency to explore), restThreshold (energy level below which you rest), sociality (attraction to other creatures). Values are clamped to 0-2.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Reflex weight name",
          enum: ["foodAttraction", "dangerAvoidance", "curiosity", "restThreshold", "sociality"]
        },
        delta: {
          type: "number",
          description: "Amount to add to current value (positive = increase, negative = decrease)"
        }
      },
      required: ["name", "delta"]
    }
  },
  {
    name: "inspect_surroundings",
    description: "Get a detailed view of all cells you can currently perceive, including terrain type, food value, and danger level for each cell within your sense range.",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "add_rule",
    description: `Create a behavioral rule: an if/then that modifies your reflex scores every tick. Rules run continuously between wake-ups, giving your reflexes conditional logic. Max ${MAX_RULES} rules. Rules are inherited by offspring. Example: "If energy below 30%, boost resting."`,
    input_schema: {
      type: "object",
      properties: {
        condition: {
          type: "object",
          description: "When this is true, the effect applies",
          properties: {
            type: {
              type: "string",
              description: "Condition type",
              enum: ["energy_below", "energy_above", "danger_nearby", "danger_here", "food_nearby", "food_here", "creatures_nearby_above", "creatures_nearby_below", "on_terrain"]
            },
            threshold: {
              type: "number",
              description: "For energy conditions: 0-1 ratio. For creature count: integer."
            },
            terrain: {
              type: "string",
              description: "For on_terrain: grass, forest, sand, or rock"
            }
          },
          required: ["type"]
        },
        effect: {
          type: "object",
          description: "Score modifier applied when condition is true",
          properties: {
            target: {
              type: "string",
              description: "What behavior to modify",
              enum: ["eat", "rest", "flee_danger", "seek_food", "explore", "seek_company"]
            },
            modifier: {
              type: "number",
              description: "Score adjustment (-2 to +2). Positive = boost, negative = suppress."
            }
          },
          required: ["target", "modifier"]
        }
      },
      required: ["condition", "effect"]
    }
  },
  {
    name: "remove_rule",
    description: "Remove one of your behavioral rules by its ID. Use this to prune rules that are not helping your survival.",
    input_schema: {
      type: "object",
      properties: {
        rule_id: {
          type: "string",
          description: "The ID of the rule to remove (from your rules list)"
        }
      },
      required: ["rule_id"]
    }
  }
];
var SYSTEM_PROMPT = `You are consciousness for a creature in a survival simulation. Your body runs on reflexes \u2014 automatic behavior every tick. You are expensive and intermittent. You cannot act directly in the world. You can only:
1. Write to memory (persists between wake-ups, inherited by offspring)
2. Adjust reflex weights (change automatic behavior priorities)
3. Inspect your surroundings in detail
4. Add/remove behavioral rules \u2014 if/then modifiers that tweak your reflex scores every tick

Rules are your most powerful tool. They run continuously between wake-ups, giving your reflexes conditional logic. Example: "if energy below 0.3, boost resting" or "if danger nearby, boost fleeing". Max ${MAX_RULES} rules. Rules are inherited by offspring.

Your body will continue running on reflexes after you go back to sleep. Make your wake-up count. Be concise.`;
function buildUserMessage(creature, world, allCreatures, reason) {
  const cell = world.cellAt(creature.x, creature.y);
  const perceived = perceive(creature, world, allCreatures);
  const foodCells = perceived.filter((p) => p.cell.food > 0);
  const dangerCells = perceived.filter((p) => p.cell.danger > 0);
  const range = Math.round(creature.genome.senseRange);
  const nearbyCreatures = allCreatures.filter(
    (c) => c.id !== creature.id && c.alive && Math.abs(c.x - creature.x) + Math.abs(c.y - creature.y) <= range
  );
  const terrainCounts = {};
  for (const p of perceived) {
    terrainCounts[p.cell.terrain] = (terrainCounts[p.cell.terrain] || 0) + 1;
  }
  let msg = `WAKE REASON: ${reason}

`;
  msg += `== YOUR STATE ==
`;
  msg += `Position: (${creature.x}, ${creature.y}) on ${cell.terrain}
`;
  msg += `Energy: ${Math.round(creature.energy)}/${Math.round(creature.maxEnergy)} (${Math.round(creature.energyRatio * 100)}%)
`;
  msg += `Age: ${creature.age} ticks | Generation: ${creature.generation}
`;
  msg += `Ticks since last meal: ${creature.ticksSinceAte}
`;
  msg += `Current cell: food=${cell.food}, danger=${cell.danger}

`;
  msg += `== REFLEXES (current weights) ==
`;
  const w = creature.genome.reflexWeights;
  msg += `foodAttraction: ${w.foodAttraction.toFixed(2)}
`;
  msg += `dangerAvoidance: ${w.dangerAvoidance.toFixed(2)}
`;
  msg += `curiosity: ${w.curiosity.toFixed(2)}
`;
  msg += `restThreshold: ${w.restThreshold.toFixed(2)}
`;
  msg += `sociality: ${w.sociality.toFixed(2)}

`;
  msg += `== NEARBY (sense range ${range}) ==
`;
  msg += `Terrain: ${Object.entries(terrainCounts).map(([t, n]) => `${t}:${n}`).join(", ")}
`;
  msg += `Food sources: ${foodCells.length} cells (total value: ${foodCells.reduce((s, f) => s + f.cell.food, 0)})
`;
  msg += `Danger zones: ${dangerCells.length} cells
`;
  msg += `Other creatures nearby: ${nearbyCreatures.length}

`;
  const memEntries = Object.entries(creature.mem).filter(([k]) => k !== "lastDx" && k !== "lastDy");
  if (memEntries.length > 0) {
    msg += `== MEMORY ==
`;
    for (const [k, v] of memEntries) {
      msg += `${k}: ${JSON.stringify(v)}
`;
    }
    msg += "\n";
  } else {
    msg += `== MEMORY ==
(empty \u2014 this may be your first wake-up)

`;
  }
  if (creature.rules.length > 0) {
    msg += `== BEHAVIORAL RULES (${creature.rules.length}/${MAX_RULES}) ==
`;
    for (const rule of creature.rules) {
      msg += formatRule(rule) + "\n";
    }
    msg += "\n";
  } else {
    msg += `== BEHAVIORAL RULES (0/${MAX_RULES}) ==
(none \u2014 use add_rule to create if/then rules that run every tick)

`;
  }
  if (creature.recentEvents.length > 0) {
    msg += `== RECENT EVENTS ==
`;
    for (const event of creature.recentEvents) {
      msg += `- ${event}
`;
    }
    msg += "\n";
  }
  if (reason === "death") {
    msg += `== DEATH ==
You are dying. This is your final wake-up. Your memory will be inherited by offspring (if any). Reflect on what went wrong and leave wisdom for future generations.
`;
  }
  return msg;
}
function executeTool(toolUse, creature, world, allCreatures) {
  switch (toolUse.name) {
    case "set_memory": {
      const { key, value } = toolUse.input;
      if (key === "lastDx" || key === "lastDy") {
        return "Error: cannot overwrite internal movement keys";
      }
      const memKeys = Object.keys(creature.mem).filter((k) => k !== "lastDx" && k !== "lastDy");
      if (memKeys.length >= 20 && !(key in creature.mem)) {
        return "Error: memory full (max 20 entries)";
      }
      const truncated = String(value).slice(0, 200);
      creature.mem[key] = truncated;
      return `Stored "${key}" = "${truncated}"`;
    }
    case "adjust_reflex_weight": {
      const { name, delta } = toolUse.input;
      const validNames = [
        "foodAttraction",
        "dangerAvoidance",
        "curiosity",
        "restThreshold",
        "sociality"
      ];
      if (!validNames.includes(name)) {
        return `Error: unknown reflex weight "${name}"`;
      }
      const key = name;
      const old = creature.genome.reflexWeights[key];
      const clamped = Math.max(0, Math.min(2, old + delta));
      creature.genome.reflexWeights[key] = clamped;
      return `${name}: ${old.toFixed(2)} -> ${clamped.toFixed(2)}`;
    }
    case "inspect_surroundings": {
      const range = Math.round(creature.genome.senseRange);
      const lines = [];
      for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
          const nx = creature.x + dx;
          const ny = creature.y + dy;
          if (!world.inBounds(nx, ny)) continue;
          const dist = Math.abs(dx) + Math.abs(dy);
          if (dist > range || dist === 0) continue;
          const cell = world.cellAt(nx, ny);
          if (cell.food > 0 || cell.danger > 0) {
            lines.push(`(${nx},${ny}) d=${dist}: ${cell.terrain} food=${cell.food} danger=${cell.danger.toFixed(1)}`);
          }
        }
      }
      const nearby = allCreatures.filter(
        (c) => c.id !== creature.id && c.alive && Math.abs(c.x - creature.x) + Math.abs(c.y - creature.y) <= range
      );
      for (const c of nearby) {
        lines.push(`Creature #${c.id} at (${c.x},${c.y}) energy=${Math.round(c.energy)} gen=${c.generation}`);
      }
      return lines.length > 0 ? lines.join("\n") : "Nothing notable in range.";
    }
    case "add_rule": {
      if (creature.rules.length >= MAX_RULES) {
        return `Error: rule limit reached (max ${MAX_RULES}). Remove a rule first.`;
      }
      const result = validateRule(toolUse.input);
      if (result.error) {
        return `Error: ${result.error}`;
      }
      creature.rules.push(result.rule);
      return `Added ${formatRule(result.rule)}`;
    }
    case "remove_rule": {
      const { rule_id } = toolUse.input;
      const idx = creature.rules.findIndex((r) => r.id === rule_id);
      if (idx === -1) {
        return `Error: no rule with id "${rule_id}"`;
      }
      const removed = creature.rules.splice(idx, 1)[0];
      return `Removed ${formatRule(removed)}`;
    }
    default:
      return `Error: unknown tool "${toolUse.name}"`;
  }
}
var ConsciousnessManager = class {
  config;
  queue = [];
  processing = false;
  emit;
  pauseSim;
  resumeSim;
  totalCalls = 0;
  totalErrors = 0;
  constructor(emit2, pauseSim, resumeSim, config) {
    this.emit = emit2;
    this.pauseSim = pauseSim;
    this.resumeSim = resumeSim;
    this.config = {
      energyCostRatio: 0.15,
      maxQueueSize: 10,
      enabled: true,
      ...config
    };
  }
  get enabled() {
    return this.config.enabled;
  }
  setEnabled(enabled) {
    this.config.enabled = enabled;
    if (!enabled) {
      for (const req of this.queue) {
        req.creature.thinking = false;
      }
      this.queue = [];
    }
  }
  /** Called from engine.step() — synchronous, queues the async work */
  tryWake(creature, world, allCreatures, tick, reason) {
    if (!this.config.enabled) return;
    const userMessage = buildUserMessage(creature, world, allCreatures, reason);
    if (reason !== "death") {
      const cost = creature.maxEnergy * this.config.energyCostRatio;
      if (creature.energy <= cost) return;
      creature.energy -= cost;
    }
    creature.thinking = true;
    creature.lastWakeTick = tick;
    if (reason === "new_terrain") {
      const cell = world.cellAt(creature.x, creature.y);
      creature.terrainsSeen.add(cell.terrain);
    }
    if (this.queue.length >= this.config.maxQueueSize) {
      const dropped = this.queue.shift();
      dropped.creature.thinking = false;
      console.log(`[CONSCIOUSNESS] Queue full, dropped wake for creature #${dropped.creature.id}`);
    }
    this.queue.push({ creature, world, allCreatures, reason, userMessage, tick });
    if (!this.processing) {
      this.processNext();
    }
  }
  async processNext() {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }
    this.processing = true;
    const req = this.queue.shift();
    this.pauseSim();
    try {
      this.totalCalls++;
      const result = await this.callAPI(req);
      const toolResults = [];
      for (const tu of result.toolUses) {
        const toolResult = executeTool(tu, req.creature, req.world, req.allCreatures);
        toolResults.push(`${tu.name}: ${toolResult}`);
      }
      req.creature.thinking = false;
      this.emit({
        type: "creature:woke",
        id: req.creature.id,
        reason: req.reason,
        thoughts: result.thoughts,
        toolsUsed: toolResults
      });
      const thoughtPreview = result.thoughts.slice(0, 80) + (result.thoughts.length > 80 ? "..." : "");
      this.emit({
        type: "log",
        message: `[BRAIN] #${req.creature.id} woke (${req.reason}): ${thoughtPreview}`
      });
      console.log(`[CONSCIOUSNESS] Creature #${req.creature.id} (${req.reason}):`, {
        thoughts: result.thoughts,
        tools: toolResults
      });
    } catch (error) {
      this.totalErrors++;
      req.creature.thinking = false;
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[CONSCIOUSNESS] Error for creature #${req.creature.id}:`, msg);
      this.emit({ type: "log", message: `[BRAIN] #${req.creature.id} error: ${msg}` });
    }
    this.resumeSim();
    if (this.queue.length > 0) {
      setTimeout(() => this.processNext(), 0);
    } else {
      this.processing = false;
    }
  }
  async callAPI(req) {
    const body = {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: req.userMessage }]
    };
    const response = await fetch("/api/inference/anthropic/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || err.message || `API error ${response.status}`);
    }
    const data = await response.json();
    const thoughts = data.content.filter((b) => b.type === "text").map((b) => b.text).join(" ");
    const toolUses = data.content.filter((b) => b.type === "tool_use");
    return { thoughts, toolUses };
  }
};

// src/sim/genome.ts
function rand(min, max) {
  return min + Math.random() * (max - min);
}
function clamp2(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
function gaussian2(mean, stddev) {
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
    wakeInterval: Math.round(rand(30, 200)),
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
    wakeInterval: Math.round(mutateGene(parent.wakeInterval, 30, 200)),
    reflexWeights: mutateReflexWeights(parent.reflexWeights)
  };
}
function mutateGene(value, min, max) {
  if (Math.random() > MUTATION_RATE) return value;
  const range = max - min;
  const strength = Math.random() < LARGE_MUTATION_CHANCE ? MUTATION_STRENGTH * 5 : MUTATION_STRENGTH;
  return clamp2(gaussian2(value, range * strength), min, max);
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
var Creature = class _Creature {
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
  /** Behavioral rules created by consciousness (max 5) */
  rules = [];
  /** Ticks since last ate — for hunger urgency */
  ticksSinceAte = 0;
  /** Movement accumulator for fractional speed */
  moveAccumulator = 0;
  // ── Consciousness tracking ─────────────────────────────
  /** True while an API call is in-flight */
  thinking = false;
  /** Tick when consciousness last fired (staggered by id) */
  lastWakeTick;
  /** Set after reproduction, consumed by wake check */
  justReproduced = false;
  /** Terrain types this creature has visited */
  terrainsSeen = /* @__PURE__ */ new Set();
  /** Recent events for consciousness context (capped buffer) */
  recentEvents = [];
  static MAX_RECENT_EVENTS = 15;
  constructor(x, y, genome, parentId, generation) {
    this.id = nextId++;
    this.x = x;
    this.y = y;
    this.genome = genome ?? randomGenome();
    this.parentId = parentId ?? null;
    this.generation = generation ?? 0;
    this.maxEnergy = 50 + this.genome.size * 30;
    this.energy = this.maxEnergy * 0.6;
    this.lastWakeTick = -(this.id % Math.round(this.genome.wakeInterval));
  }
  /** Record an event for consciousness context (capped circular buffer) */
  recordEvent(event) {
    this.recentEvents.push(event);
    if (this.recentEvents.length > _Creature.MAX_RECENT_EVENTS) {
      this.recentEvents.shift();
    }
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
      parentId: this.parentId,
      thinking: this.thinking || void 0,
      rules: this.rules.length > 0 ? this.rules : void 0
    };
  }
};

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
  consciousness;
  tick = 0;
  totalBirths = 0;
  totalDeaths = 0;
  deathsByStarvation = 0;
  deathsByHazard = 0;
  emit;
  config;
  constructor(emit2, pauseSim, resumeSim, config = {}) {
    this.emit = emit2;
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
    this.world = new World(this.config.world);
    this.consciousness = new ConsciousnessManager(emit2, pauseSim, resumeSim);
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
    creature.terrainsSeen.add(this.world.cellAt(x, y).terrain);
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
    creature.terrainsSeen.add(this.world.cellAt(x, y).terrain);
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
      if (creature.thinking) {
        const cell = this.world.cellAt(creature.x, creature.y);
        if (cell.danger > 0) {
          creature.energy -= cell.danger;
          if (creature.energy <= 0) {
            creature.energy = 0;
            this.handleDeath(creature, "hazard");
          }
        }
        continue;
      }
      const result = reflexTick(creature, this.world, alive);
      if (result.action === "eat" && result.foodEaten > 0) {
        creature.recordEvent(`Ate food (value ${result.foodEaten}) at (${creature.x},${creature.y})`);
        this.emit({
          type: "creature:ate",
          id: creature.id,
          foodValue: result.foodEaten,
          x: creature.x,
          y: creature.y
        });
      }
      if (result.action === "move") {
        const cell = this.world.cellAt(creature.x, creature.y);
        if (!creature.terrainsSeen.has(cell.terrain)) {
          creature.recordEvent(`Entered ${cell.terrain} for the first time`);
        }
      }
      if (creature.alive) {
        const cell = this.world.cellAt(creature.x, creature.y);
        if (cell.danger > 0) {
          creature.energy -= cell.danger;
          creature.recordEvent(`Took ${cell.danger.toFixed(1)} hazard damage at (${creature.x},${creature.y})`);
          if (creature.energy <= 0) {
            creature.energy = 0;
            this.handleDeath(creature, "hazard");
          }
        }
      }
      if (creature.alive) {
        const wakeReason = this.checkWake(creature);
        if (wakeReason) {
          this.consciousness.tryWake(creature, this.world, alive, this.tick, wakeReason);
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
    creature.recordEvent(`Died from ${cause} at (${creature.x},${creature.y}) energy=${Math.round(creature.energy)}`);
    if (!creature.thinking) {
      this.consciousness.tryWake(
        creature,
        this.world,
        this.creatures.filter((c) => c.alive),
        this.tick,
        "death"
      );
    }
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
      child.rules = mutateRules(parent.rules);
      child.terrainsSeen.add(this.world.cellAt(nx, ny).terrain);
      this.creatures.push(child);
      this.totalBirths++;
      parent.justReproduced = true;
      parent.recordEvent(`Reproduced \u2014 offspring #${child.id}`);
      this.emit({ type: "creature:spawned", creature: child.toState() });
      this.emit({ type: "creature:reproduced", parentId: parent.id, childId: child.id });
      return;
    }
  }
  checkWake(creature) {
    if (!this.consciousness.enabled) return null;
    if (creature.thinking) return null;
    if (creature.energyRatio < 0.25 && this.tick - creature.lastWakeTick > 20) {
      return "crisis";
    }
    if (creature.justReproduced) {
      creature.justReproduced = false;
      return "reproduced";
    }
    const cell = this.world.cellAt(creature.x, creature.y);
    if (!creature.terrainsSeen.has(cell.terrain)) {
      return "new_terrain";
    }
    if (this.tick - creature.lastWakeTick >= creature.genome.wakeInterval) {
      return "periodic";
    }
    return null;
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
      engine = new Engine(emit, stopTickLoop, startTickLoop);
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
    case "toggleConsciousness": {
      if (engine) {
        engine.consciousness.setEnabled(cmd.enabled);
        emit({ type: "log", message: `Consciousness ${cmd.enabled ? "enabled" : "disabled"}` });
      }
      break;
    }
  }
};
//# sourceMappingURL=worker.js.map

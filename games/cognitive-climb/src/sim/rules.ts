// ── Types ────────────────────────────────────────────────

export type ConditionType =
  | 'energy_below' | 'energy_above'
  | 'danger_nearby' | 'danger_here'
  | 'food_nearby' | 'food_here'
  | 'creatures_nearby_above' | 'creatures_nearby_below'
  | 'on_terrain';

export type EffectTarget =
  | 'eat' | 'rest' | 'flee_danger' | 'seek_food' | 'explore' | 'seek_company';

export interface RuleCondition {
  type: ConditionType;
  threshold?: number;   // energy (0-1) or creature count
  terrain?: string;     // for on_terrain
}

export interface RuleEffect {
  target: EffectTarget;
  modifier: number;     // -2 to +2
}

export interface Rule {
  id: string;
  condition: RuleCondition;
  effect: RuleEffect;
}

export const MAX_RULES = 5;

// ── Evaluation context (built from perception data) ─────

export interface RuleContext {
  energyRatio: number;
  currentDanger: number;
  nearbyDangerCount: number;
  currentFood: number;
  nearbyFoodCount: number;
  nearbyCreatureCount: number;
  currentTerrain: string;
}

// ── Accumulated modifiers from active rules ─────────────

export interface RuleModifiers {
  eatBonus: number;
  restBonus: number;
  fleeDangerBonus: number;
  seekFoodBonus: number;
  exploreBonus: number;
  seekCompanyBonus: number;
}

// ── Constants ────────────────────────────────────────────

const CONDITION_TYPES: ConditionType[] = [
  'energy_below', 'energy_above', 'danger_nearby', 'danger_here',
  'food_nearby', 'food_here', 'creatures_nearby_above', 'creatures_nearby_below',
  'on_terrain',
];

const EFFECT_TARGETS: EffectTarget[] = [
  'eat', 'rest', 'flee_danger', 'seek_food', 'explore', 'seek_company',
];

const TERRAINS = ['grass', 'forest', 'sand', 'rock'];

// Mutation rates
const RULE_DROP_RATE = 0.10;
const RULE_MUTATE_RATE = 0.15;
const RULE_GAIN_RATE = 0.05;

// ── Helpers ──────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function gaussian(mean: number, stddev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return mean + stddev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

let ruleIdCounter = 0;

export function generateRuleId(): string {
  return `r${++ruleIdCounter}`;
}

// ── Condition evaluation ────────────────────────────────

export function evaluateCondition(cond: RuleCondition, ctx: RuleContext): boolean {
  switch (cond.type) {
    case 'energy_below':
      return ctx.energyRatio < (cond.threshold ?? 0.5);
    case 'energy_above':
      return ctx.energyRatio > (cond.threshold ?? 0.5);
    case 'danger_nearby':
      return ctx.nearbyDangerCount > 0;
    case 'danger_here':
      return ctx.currentDanger > 0;
    case 'food_nearby':
      return ctx.nearbyFoodCount > 0;
    case 'food_here':
      return ctx.currentFood > 0;
    case 'creatures_nearby_above':
      return ctx.nearbyCreatureCount > (cond.threshold ?? 3);
    case 'creatures_nearby_below':
      return ctx.nearbyCreatureCount < (cond.threshold ?? 1);
    case 'on_terrain':
      return ctx.currentTerrain === cond.terrain;
    default:
      return false;
  }
}

// ── Compute accumulated modifiers from all active rules ─

export function computeRuleModifiers(rules: Rule[], ctx: RuleContext): RuleModifiers {
  const mods: RuleModifiers = {
    eatBonus: 0,
    restBonus: 0,
    fleeDangerBonus: 0,
    seekFoodBonus: 0,
    exploreBonus: 0,
    seekCompanyBonus: 0,
  };

  for (const rule of rules) {
    if (!evaluateCondition(rule.condition, ctx)) continue;

    switch (rule.effect.target) {
      case 'eat':          mods.eatBonus += rule.effect.modifier; break;
      case 'rest':         mods.restBonus += rule.effect.modifier; break;
      case 'flee_danger':  mods.fleeDangerBonus += rule.effect.modifier; break;
      case 'seek_food':    mods.seekFoodBonus += rule.effect.modifier; break;
      case 'explore':      mods.exploreBonus += rule.effect.modifier; break;
      case 'seek_company': mods.seekCompanyBonus += rule.effect.modifier; break;
    }
  }

  return mods;
}

// ── Mutation ─────────────────────────────────────────────

export function mutateRules(parentRules: Rule[]): Rule[] {
  const rules: Rule[] = [];

  for (const rule of parentRules) {
    // Drop check
    if (Math.random() < RULE_DROP_RATE) continue;

    // Copy and maybe mutate
    const mutated: Rule = {
      id: rule.id,
      condition: { ...rule.condition },
      effect: { ...rule.effect },
    };

    // Mutate threshold
    if (mutated.condition.threshold !== undefined && Math.random() < RULE_MUTATE_RATE) {
      const isEnergy = mutated.condition.type === 'energy_below' || mutated.condition.type === 'energy_above';
      const min = isEnergy ? 0.05 : 0;
      const max = isEnergy ? 0.95 : 10;
      const range = max - min;
      mutated.condition.threshold = clamp(
        gaussian(mutated.condition.threshold, range * 0.1),
        min, max,
      );
    }

    // Mutate modifier
    if (Math.random() < RULE_MUTATE_RATE) {
      mutated.effect.modifier = clamp(
        gaussian(mutated.effect.modifier, 0.4),
        -2, 2,
      );
    }

    rules.push(mutated);
  }

  // Chance to gain a random new rule (if under budget)
  if (rules.length < MAX_RULES && Math.random() < RULE_GAIN_RATE) {
    rules.push(randomRule());
  }

  return rules;
}

// ── Random rule generation ──────────────────────────────

export function randomRule(): Rule {
  const condType = CONDITION_TYPES[Math.floor(Math.random() * CONDITION_TYPES.length)];
  const condition: RuleCondition = { type: condType };

  if (condType === 'energy_below' || condType === 'energy_above') {
    condition.threshold = 0.1 + Math.random() * 0.8;
  } else if (condType === 'creatures_nearby_above' || condType === 'creatures_nearby_below') {
    condition.threshold = Math.floor(Math.random() * 5) + 1;
  } else if (condType === 'on_terrain') {
    condition.terrain = TERRAINS[Math.floor(Math.random() * TERRAINS.length)];
  }

  return {
    id: generateRuleId(),
    condition,
    effect: {
      target: EFFECT_TARGETS[Math.floor(Math.random() * EFFECT_TARGETS.length)],
      modifier: Math.random() * 4 - 2, // -2 to +2
    },
  };
}

// ── Validation (for consciousness add_rule tool) ────────

export function validateRule(
  input: Record<string, unknown>,
): { rule: Rule; error?: undefined } | { error: string; rule?: undefined } {
  let condInput = input.condition as Record<string, unknown> | undefined;
  let effectInput = input.effect as Record<string, unknown> | undefined;

  // Fallback: model may send flat structure with condition_type, target, modifier at top level
  if (!condInput && input.condition_type) {
    condInput = { type: input.condition_type, threshold: input.threshold, terrain: input.terrain };
  }
  if (!effectInput && (input.target || input.action)) {
    effectInput = { target: input.target || input.action, modifier: input.modifier };
  }

  if (!condInput || !effectInput) {
    return { error: 'Rule must have condition and effect' };
  }

  const condType = condInput.type as string;
  if (!CONDITION_TYPES.includes(condType as ConditionType)) {
    return { error: `Unknown condition type: ${condType}. Valid: ${CONDITION_TYPES.join(', ')}` };
  }

  // Model may use 'action' instead of 'target'
  const effectTarget = (effectInput.target || effectInput.action || effectInput.type) as string;
  if (!EFFECT_TARGETS.includes(effectTarget as EffectTarget)) {
    return { error: `Unknown effect target: ${effectTarget}. Valid: ${EFFECT_TARGETS.join(', ')}` };
  }

  const modifier = Number(effectInput.modifier ?? effectInput.amount ?? effectInput.value);
  if (isNaN(modifier)) {
    return { error: 'Effect modifier must be a number' };
  }

  const condition: RuleCondition = { type: condType as ConditionType };

  // Validate/set threshold for types that need it
  if (condType === 'energy_below' || condType === 'energy_above') {
    const threshold = Number(condInput.threshold);
    if (isNaN(threshold)) return { error: `${condType} requires a numeric threshold (0-1)` };
    condition.threshold = clamp(threshold, 0.01, 0.99);
  } else if (condType === 'creatures_nearby_above' || condType === 'creatures_nearby_below') {
    const threshold = Number(condInput.threshold);
    if (isNaN(threshold)) return { error: `${condType} requires a numeric threshold` };
    condition.threshold = clamp(Math.round(threshold), 0, 20);
  } else if (condType === 'on_terrain') {
    const terrain = String(condInput.terrain || '');
    if (!TERRAINS.includes(terrain)) {
      return { error: `Unknown terrain: ${terrain}. Valid: ${TERRAINS.join(', ')}` };
    }
    condition.terrain = terrain;
  }

  return {
    rule: {
      id: generateRuleId(),
      condition,
      effect: {
        target: effectTarget as EffectTarget,
        modifier: clamp(modifier, -2, 2),
      },
    },
  };
}

// ── Formatting ──────────────────────────────────────────

export function formatRule(rule: Rule): string {
  const c = rule.condition;
  const condStr = c.threshold !== undefined
    ? `${c.type}(${c.type.startsWith('energy_') ? c.threshold.toFixed(2) : c.threshold})`
    : c.terrain ? `${c.type}(${c.terrain})` : c.type;
  const e = rule.effect;
  const sign = e.modifier > 0 ? '+' : '';
  return `[${rule.id}] IF ${condStr} THEN ${e.target} ${sign}${e.modifier.toFixed(1)}`;
}

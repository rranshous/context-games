import type { SimEvent } from '../interface/events.js';
import type { ReflexWeights } from '../interface/state.js';
import type { Creature } from './creature.js';
import type { World } from './world.js';
import { perceive } from './reflex.js';

// ── Types ────────────────────────────────────────────────

export type WakeReason = 'crisis' | 'reproduced' | 'new_terrain' | 'periodic' | 'death';

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface TextBlock {
  type: 'text';
  text: string;
}

type ContentBlock = ToolUseBlock | TextBlock;

interface WakeRequest {
  creature: Creature;
  world: World;
  allCreatures: Creature[];
  reason: WakeReason;
  userMessage: string;
  tick: number;
}

interface ConsciousnessConfig {
  energyCostRatio: number;  // fraction of maxEnergy per wake-up
  maxQueueSize: number;
  enabled: boolean;
}

// ── Tool definitions (Anthropic format) ──────────────────

const TOOL_DEFINITIONS = [
  {
    name: 'set_memory',
    description: 'Write a value to your persistent memory. Memory survives between wake-ups and is inherited by offspring. Use this to remember important observations, strategies, or warnings.',
    input_schema: {
      type: 'object' as const,
      properties: {
        key: { type: 'string', description: 'Memory key (e.g. "strategy", "danger_zones", "food_direction")' },
        value: { type: 'string', description: 'Value to store' },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'adjust_reflex_weight',
    description: "Modify one of your body's reflex weights. These control automatic behavior: foodAttraction (how strongly you seek food), dangerAvoidance (how strongly you flee hazards), curiosity (tendency to explore), restThreshold (energy level below which you rest), sociality (attraction to other creatures). Values are clamped to 0-2.",
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'Reflex weight name',
          enum: ['foodAttraction', 'dangerAvoidance', 'curiosity', 'restThreshold', 'sociality'],
        },
        delta: {
          type: 'number',
          description: 'Amount to add to current value (positive = increase, negative = decrease)',
        },
      },
      required: ['name', 'delta'],
    },
  },
  {
    name: 'inspect_surroundings',
    description: 'Get a detailed view of all cells you can currently perceive, including terrain type, food value, and danger level for each cell within your sense range.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [] as string[],
    },
  },
];

// ── System prompt ────────────────────────────────────────

const SYSTEM_PROMPT = `You are consciousness for a creature in a survival simulation. Your body runs on reflexes — automatic behavior every tick. You are expensive and intermittent. You cannot act directly in the world. You can only:
1. Write to memory (persists between wake-ups, inherited by offspring)
2. Adjust reflex weights (change automatic behavior priorities)
3. Inspect your surroundings in detail

Your body will continue running on reflexes after you go back to sleep. Make your wake-up count. Be concise.`;

// ── Message building ─────────────────────────────────────

function buildUserMessage(
  creature: Creature,
  world: World,
  allCreatures: Creature[],
  reason: WakeReason,
): string {
  const cell = world.cellAt(creature.x, creature.y);
  const perceived = perceive(creature, world, allCreatures);

  const foodCells = perceived.filter(p => p.cell.food > 0);
  const dangerCells = perceived.filter(p => p.cell.danger > 0);
  const range = Math.round(creature.genome.senseRange);
  const nearbyCreatures = allCreatures.filter(c =>
    c.id !== creature.id && c.alive &&
    Math.abs(c.x - creature.x) + Math.abs(c.y - creature.y) <= range
  );

  // Terrain summary
  const terrainCounts: Record<string, number> = {};
  for (const p of perceived) {
    terrainCounts[p.cell.terrain] = (terrainCounts[p.cell.terrain] || 0) + 1;
  }

  let msg = `WAKE REASON: ${reason}\n\n`;

  msg += `== YOUR STATE ==\n`;
  msg += `Position: (${creature.x}, ${creature.y}) on ${cell.terrain}\n`;
  msg += `Energy: ${Math.round(creature.energy)}/${Math.round(creature.maxEnergy)} (${Math.round(creature.energyRatio * 100)}%)\n`;
  msg += `Age: ${creature.age} ticks | Generation: ${creature.generation}\n`;
  msg += `Ticks since last meal: ${creature.ticksSinceAte}\n`;
  msg += `Current cell: food=${cell.food}, danger=${cell.danger}\n\n`;

  msg += `== REFLEXES (current weights) ==\n`;
  const w = creature.genome.reflexWeights;
  msg += `foodAttraction: ${w.foodAttraction.toFixed(2)}\n`;
  msg += `dangerAvoidance: ${w.dangerAvoidance.toFixed(2)}\n`;
  msg += `curiosity: ${w.curiosity.toFixed(2)}\n`;
  msg += `restThreshold: ${w.restThreshold.toFixed(2)}\n`;
  msg += `sociality: ${w.sociality.toFixed(2)}\n\n`;

  msg += `== NEARBY (sense range ${range}) ==\n`;
  msg += `Terrain: ${Object.entries(terrainCounts).map(([t, n]) => `${t}:${n}`).join(', ')}\n`;
  msg += `Food sources: ${foodCells.length} cells (total value: ${foodCells.reduce((s, f) => s + f.cell.food, 0)})\n`;
  msg += `Danger zones: ${dangerCells.length} cells\n`;
  msg += `Other creatures nearby: ${nearbyCreatures.length}\n\n`;

  // Memory
  const memEntries = Object.entries(creature.mem).filter(([k]) => k !== 'lastDx' && k !== 'lastDy');
  if (memEntries.length > 0) {
    msg += `== MEMORY ==\n`;
    for (const [k, v] of memEntries) {
      msg += `${k}: ${JSON.stringify(v)}\n`;
    }
    msg += '\n';
  } else {
    msg += `== MEMORY ==\n(empty — this may be your first wake-up)\n\n`;
  }

  // Recent events
  if (creature.recentEvents.length > 0) {
    msg += `== RECENT EVENTS ==\n`;
    for (const event of creature.recentEvents) {
      msg += `- ${event}\n`;
    }
    msg += '\n';
  }

  // Death context
  if (reason === 'death') {
    msg += `== DEATH ==\nYou are dying. This is your final wake-up. Your memory will be inherited by offspring (if any). Reflect on what went wrong and leave wisdom for future generations.\n`;
  }

  return msg;
}

// ── Tool execution ───────────────────────────────────────

function executeTool(
  toolUse: ToolUseBlock,
  creature: Creature,
  world: World,
  allCreatures: Creature[],
): string {
  switch (toolUse.name) {
    case 'set_memory': {
      const { key, value } = toolUse.input as { key: string; value: string };
      if (key === 'lastDx' || key === 'lastDy') {
        return 'Error: cannot overwrite internal movement keys';
      }
      const memKeys = Object.keys(creature.mem).filter(k => k !== 'lastDx' && k !== 'lastDy');
      if (memKeys.length >= 20 && !(key in creature.mem)) {
        return 'Error: memory full (max 20 entries)';
      }
      const truncated = String(value).slice(0, 200);
      creature.mem[key] = truncated;
      return `Stored "${key}" = "${truncated}"`;
    }

    case 'adjust_reflex_weight': {
      const { name, delta } = toolUse.input as { name: string; delta: number };
      const validNames: (keyof ReflexWeights)[] = [
        'foodAttraction', 'dangerAvoidance', 'curiosity', 'restThreshold', 'sociality',
      ];
      if (!validNames.includes(name as keyof ReflexWeights)) {
        return `Error: unknown reflex weight "${name}"`;
      }
      const key = name as keyof ReflexWeights;
      const old = creature.genome.reflexWeights[key];
      const clamped = Math.max(0, Math.min(2, old + delta));
      creature.genome.reflexWeights[key] = clamped;
      return `${name}: ${old.toFixed(2)} -> ${clamped.toFixed(2)}`;
    }

    case 'inspect_surroundings': {
      const range = Math.round(creature.genome.senseRange);
      const lines: string[] = [];
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
      const nearby = allCreatures.filter(c =>
        c.id !== creature.id && c.alive &&
        Math.abs(c.x - creature.x) + Math.abs(c.y - creature.y) <= range
      );
      for (const c of nearby) {
        lines.push(`Creature #${c.id} at (${c.x},${c.y}) energy=${Math.round(c.energy)} gen=${c.generation}`);
      }
      return lines.length > 0 ? lines.join('\n') : 'Nothing notable in range.';
    }

    default:
      return `Error: unknown tool "${toolUse.name}"`;
  }
}

// ── ConsciousnessManager ─────────────────────────────────

export class ConsciousnessManager {
  private config: ConsciousnessConfig;
  private queue: WakeRequest[] = [];
  private processing: boolean = false;
  private emit: (event: SimEvent) => void;
  private pauseSim: () => void;
  private resumeSim: () => void;

  totalCalls: number = 0;
  totalErrors: number = 0;

  constructor(
    emit: (event: SimEvent) => void,
    pauseSim: () => void,
    resumeSim: () => void,
    config?: Partial<ConsciousnessConfig>,
  ) {
    this.emit = emit;
    this.pauseSim = pauseSim;
    this.resumeSim = resumeSim;
    this.config = {
      energyCostRatio: 0.15,
      maxQueueSize: 10,
      enabled: true,
      ...config,
    };
  }

  get enabled(): boolean { return this.config.enabled; }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    if (!enabled) {
      // Clear queue and unfreeze any thinking creatures
      for (const req of this.queue) {
        req.creature.thinking = false;
      }
      this.queue = [];
    }
  }

  /** Called from engine.step() — synchronous, queues the async work */
  tryWake(
    creature: Creature,
    world: World,
    allCreatures: Creature[],
    tick: number,
    reason: WakeReason,
  ): void {
    if (!this.config.enabled) return;

    // Build message now (snapshot of current state)
    const userMessage = buildUserMessage(creature, world, allCreatures, reason);

    // Charge energy (free on death)
    if (reason !== 'death') {
      const cost = creature.maxEnergy * this.config.energyCostRatio;
      if (creature.energy <= cost) return; // can't afford
      creature.energy -= cost;
    }

    creature.thinking = true;
    creature.lastWakeTick = tick;

    // Record terrain if that's the trigger
    if (reason === 'new_terrain') {
      const cell = world.cellAt(creature.x, creature.y);
      creature.terrainsSeen.add(cell.terrain);
    }

    // Drop oldest if queue is full
    if (this.queue.length >= this.config.maxQueueSize) {
      const dropped = this.queue.shift()!;
      dropped.creature.thinking = false;
      console.log(`[CONSCIOUSNESS] Queue full, dropped wake for creature #${dropped.creature.id}`);
    }

    this.queue.push({ creature, world, allCreatures, reason, userMessage, tick });

    // Start processing if not already
    if (!this.processing) {
      this.processNext();
    }
  }

  private async processNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const req = this.queue.shift()!;

    this.pauseSim();

    try {
      this.totalCalls++;
      const result = await this.callAPI(req);

      // Execute tool calls
      const toolResults: string[] = [];
      for (const tu of result.toolUses) {
        const toolResult = executeTool(tu, req.creature, req.world, req.allCreatures);
        toolResults.push(`${tu.name}: ${toolResult}`);
      }

      req.creature.thinking = false;

      this.emit({
        type: 'creature:woke',
        id: req.creature.id,
        reason: req.reason,
        thoughts: result.thoughts,
        toolsUsed: toolResults,
      });

      const thoughtPreview = result.thoughts.slice(0, 80) + (result.thoughts.length > 80 ? '...' : '');
      this.emit({
        type: 'log',
        message: `[BRAIN] #${req.creature.id} woke (${req.reason}): ${thoughtPreview}`,
      });

      console.log(`[CONSCIOUSNESS] Creature #${req.creature.id} (${req.reason}):`, {
        thoughts: result.thoughts,
        tools: toolResults,
      });
    } catch (error) {
      this.totalErrors++;
      req.creature.thinking = false;
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[CONSCIOUSNESS] Error for creature #${req.creature.id}:`, msg);
      this.emit({ type: 'log', message: `[BRAIN] #${req.creature.id} error: ${msg}` });
    }

    this.resumeSim();

    // Process next in queue (after resume, so sim ticks between calls)
    if (this.queue.length > 0) {
      // Use setTimeout(0) to let at least one tick happen between consciousness calls
      setTimeout(() => this.processNext(), 0);
    } else {
      this.processing = false;
    }
  }

  private async callAPI(req: WakeRequest): Promise<{ thoughts: string; toolUses: ToolUseBlock[] }> {
    const body = {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: req.userMessage }],
    };

    const response = await fetch('/api/inference/anthropic/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as Record<string, string>).error || (err as Record<string, string>).message || `API error ${response.status}`);
    }

    const data = await response.json() as { content: ContentBlock[] };

    const thoughts = data.content
      .filter((b): b is TextBlock => b.type === 'text')
      .map(b => b.text)
      .join(' ');

    const toolUses = data.content
      .filter((b): b is ToolUseBlock => b.type === 'tool_use');

    return { thoughts, toolUses };
  }
}

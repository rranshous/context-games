import type { SimEvent } from '../interface/events.js';
import type { Creature } from './creature.js';
import type { World } from './world.js';
import {
  buildMeApi, buildWorldApi, compileFunction,
  computeEmbodimentSize, ageScalar,
} from './embodiment.js';

// ── Types ────────────────────────────────────────────────

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
  reason: string;
  userMessage: string;
  tick: number;
}

interface ConsciousnessConfig {
  maxQueueSize: number;
  enabled: boolean;
}

// ── System prompt ────────────────────────────────────────

const SYSTEM_PROMPT = `You are consciousness for a creature in a survival simulation. Your embodiment is shown below in XML sections — it IS you. You can edit any section to improve your survival.

Your body runs on reflexes between wake-ups. Your on_tick code runs every tick, adjusting reflexes and deciding when to wake you. Your sensors code processes perception data. Your tools section defines custom tools you can create for yourself.

Wake-ups cost energy — less if you've rested long, more if you wake frequently. The exact cost is shown at the top of each message. Make each wake count. Be concise.`;

// ── Hardcoded edit tools (always available) ──────────────

const EDIT_TOOLS = [
  {
    name: 'edit_identity',
    description: 'Replace your <identity> section — your self-narrative, goals, and strategy notes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'New identity text' },
      },
      required: ['content'],
    },
  },
  {
    name: 'edit_sensors',
    description: 'Replace your <sensors> section — a JS function(me, world) that processes perception and writes to memory.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'New sensors function code' },
      },
      required: ['content'],
    },
  },
  {
    name: 'edit_on_tick',
    description: 'Replace your <on_tick> section — a JS function(me, world) that runs every tick. Call me.sensors.run(), adjust reflexes via me.reflex.*, and return {wake:true, reason} to wake consciousness.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'New onTick function code' },
      },
      required: ['content'],
    },
  },
  {
    name: 'edit_memory',
    description: 'Replace your <memory> section — a JSON object of key-value working state. Not inherited by offspring.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'New memory JSON string' },
      },
      required: ['content'],
    },
  },
  {
    name: 'edit_tools',
    description: 'Replace your <tools> section — a JSON array of custom tool definitions. Each tool has name, description, input_schema, and execute (a JS expression using me, world, args).',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'New tools JSON string' },
      },
      required: ['content'],
    },
  },
];

// ── Section name mapping ─────────────────────────────────

type EmbodimentSection = 'identity' | 'sensors' | 'on_tick' | 'memory' | 'tools';

const EDIT_TOOL_MAP: Record<string, EmbodimentSection> = {
  edit_identity: 'identity',
  edit_sensors: 'sensors',
  edit_on_tick: 'on_tick',
  edit_memory: 'memory',
  edit_tools: 'tools',
};

// ── Message building ─────────────────────────────────────

function buildUserMessage(
  creature: Creature,
  world: World,
  allCreatures: Creature[],
  reason: string,
  wakeCost: number,
): string {
  const e = creature.embodiment;
  const costPct = (wakeCost / creature.maxEnergy * 100).toFixed(1);
  let msg = `Wake cost: ${Math.round(wakeCost)} energy (${costPct}% of max) — you now have ${Math.round(creature.energy)}/${Math.round(creature.maxEnergy)} energy.\n`;
  msg += `WAKE REASON: ${reason}\n\n`;

  // Embodiment sections in XML tags
  msg += `<identity>\n${e.identity}\n</identity>\n\n`;
  msg += `<sensors>\n${e.sensors}\n</sensors>\n\n`;
  msg += `<on_tick>\n${e.on_tick}\n</on_tick>\n\n`;
  msg += `<memory>\n${e.memory}\n</memory>\n\n`;
  msg += `<tools>\n${e.tools}\n</tools>\n\n`;

  // Current state
  msg += `== STATE ==\n`;
  msg += `Position: (${creature.x}, ${creature.y})\n`;
  msg += `Energy: ${Math.round(creature.energy)}/${Math.round(creature.maxEnergy)} (${Math.round(creature.energyRatio * 100)}%)\n`;
  msg += `Age: ${creature.age} ticks | Gen: ${creature.generation}\n`;
  msg += `Ticks since last meal: ${creature.ticksSinceAte}\n`;
  const totalSize = computeEmbodimentSize(e);
  const maxSize = Math.round(Math.max(
    creature.inheritedEmbodimentSize,
    creature.genome.maxEmbodimentSize * ageScalar(creature.age),
  ));
  msg += `Embodiment: ${totalSize}/${maxSize} chars\n\n`;

  // Genome (immutable body)
  const g = creature.genome;
  msg += `== GENOME (immutable body) ==\n`;
  msg += `speed=${g.speed.toFixed(2)} sense=${Math.round(g.senseRange)} size=${g.size.toFixed(2)} metabolism=${g.metabolism.toFixed(2)} diet=${g.diet.toFixed(2)} wakeInterval=${g.wakeInterval}\n`;
  msg += `Base reflexes: food=${g.reflexWeights.foodAttraction.toFixed(2)} danger=${g.reflexWeights.dangerAvoidance.toFixed(2)} curiosity=${g.reflexWeights.curiosity.toFixed(2)} rest=${g.reflexWeights.restThreshold.toFixed(2)} social=${g.reflexWeights.sociality.toFixed(2)}\n`;
  const adj = creature.reflexAdjustments;
  msg += `Current adjustments: food=${adj.foodAttraction.toFixed(2)} danger=${adj.dangerAvoidance.toFixed(2)} curiosity=${adj.curiosity.toFixed(2)} rest=${adj.restThreshold.toFixed(2)} social=${adj.sociality.toFixed(2)}\n\n`;

  // Recent events
  if (creature.recentEvents.length > 0) {
    msg += `== RECENT EVENTS ==\n`;
    for (const event of creature.recentEvents) {
      msg += `- ${event}\n`;
    }
    msg += '\n';
  }

  return msg;
}

// ── Tool execution ───────────────────────────────────────

function executeTool(
  toolUse: ToolUseBlock,
  creature: Creature,
  world: World,
  allCreatures: Creature[],
  tick: number,
): string {
  // Check hardcoded edit tools
  const section = EDIT_TOOL_MAP[toolUse.name];
  if (section) {
    const inp = toolUse.input as Record<string, unknown>;
    let content: string;
    const raw = inp.content;
    if (typeof raw === 'string') {
      content = raw;
    } else if (Array.isArray(raw)) {
      // Model sent code as array of lines
      content = raw.join('\n');
    } else if (raw != null && typeof raw === 'object') {
      // Model wrapped code in a nested object — try common keys
      const obj = raw as Record<string, unknown>;
      const alt = obj.code ?? obj.text ?? obj.value ?? obj.content;
      content = typeof alt === 'string' ? alt : JSON.stringify(raw);
    } else {
      // content key missing or wrong type — pick the longest string value in the input as fallback
      const stringVals = Object.entries(inp)
        .filter(([, v]) => typeof v === 'string')
        .map(([k, v]) => ({ k, v: v as string }));
      if (stringVals.length > 0) {
        const best = stringVals.reduce((a, b) => a.v.length >= b.v.length ? a : b);
        content = best.v;
        console.warn(`[EMBODIMENT] ${toolUse.name}: used key "${best.k}" as content (content was ${typeof raw})`);
      } else {
        const dump = JSON.stringify(toolUse.input).slice(0, 120);
        console.warn(`[EMBODIMENT] ${toolUse.name}: no string found, input: ${dump}`);
        return `Error: no string content found. Got: ${dump}`;
      }
    }
    const oldSize = creature.embodiment[section].length;
    const newSize = content.length;
    const totalSize = computeEmbodimentSize(creature.embodiment) - oldSize + newSize;
    const maxAllowed = Math.max(
      creature.inheritedEmbodimentSize,
      creature.genome.maxEmbodimentSize * ageScalar(creature.age),
    );

    if (totalSize > maxAllowed && newSize > oldSize) {
      return `Error: embodiment budget exceeded (${totalSize}/${Math.round(maxAllowed)} chars)`;
    }

    creature.embodiment[section] = content;
    console.log(`[EMBODIMENT] #${creature.id} edited ${section}: ${oldSize} → ${newSize} chars`);
    return `Updated ${section} (${oldSize} → ${newSize} chars)`;
  }

  // Check custom tools from <tools> section
  return executeCustomTool(toolUse, creature, world, allCreatures, tick);
}

function executeCustomTool(
  toolUse: ToolUseBlock,
  creature: Creature,
  world: World,
  allCreatures: Creature[],
  tick: number,
): string {
  try {
    const tools = JSON.parse(creature.embodiment.tools) as Array<{
      name: string; execute: string;
    }>;
    const toolDef = tools.find(t => t.name === toolUse.name);
    if (!toolDef) {
      return `Error: unknown tool "${toolUse.name}"`;
    }

    // Custom tool execute is a simple expression, not a function wrapper
    const fn = compileFunction(`return ${toolDef.execute};`);
    if (!fn) {
      return `Error: failed to compile tool "${toolUse.name}"`;
    }

    const meApi = buildMeApi(creature, world, allCreatures, tick);
    const worldApi = buildWorldApi(creature, world, allCreatures, tick);
    const result = fn(meApi, worldApi, toolUse.input);

    // Sync memory changes back
    (meApi as any).__syncMemory();

    console.log(`[TOOLS] #${creature.id} ran custom tool "${toolUse.name}":`, toolUse.input);
    return result != null ? String(result) : 'OK';
  } catch (e) {
    console.error(`[TOOLS] Error executing "${toolUse.name}" for #${creature.id}:`, e);
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
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
      maxQueueSize: 10,
      enabled: true,
      ...config,
    };
  }

  get enabled(): boolean { return this.config.enabled; }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    if (!enabled) {
      for (const req of this.queue) {
        req.creature.thinking = false;
      }
      this.queue = [];
    }
  }

  /** Called from engine — synchronous, queues the async work */
  tryWake(
    creature: Creature,
    world: World,
    allCreatures: Creature[],
    tick: number,
    reason: string,
  ): void {
    if (!this.config.enabled) return;

    // Frequency-based wake cost: cheap after long rest, expensive if waking repeatedly
    let lastWakeTick = 0;
    try {
      const mem = JSON.parse(creature.embodiment.memory || '{}');
      if (typeof mem.last_wake_tick === 'number') lastWakeTick = mem.last_wake_tick;
    } catch { /* ignore */ }
    const ticksSinceWake = tick - lastWakeTick;
    const MAX_COST_RATIO = 0.15;
    const HALF_LIFE = 40;
    const costRatio = MAX_COST_RATIO * Math.exp(-ticksSinceWake / HALF_LIFE);
    const cost = creature.maxEnergy * costRatio;

    if (creature.energy <= cost) return;
    creature.energy -= cost;

    // Build message now (snapshot of current state, after energy deducted)
    const userMessage = buildUserMessage(creature, world, allCreatures, reason, cost);

    creature.thinking = true;

    // Drop oldest if queue is full
    if (this.queue.length >= this.config.maxQueueSize) {
      const dropped = this.queue.shift()!;
      dropped.creature.thinking = false;
      console.log(`[CONSCIOUSNESS] Queue full, dropped wake for creature #${dropped.creature.id}`);
    }

    this.queue.push({ creature, world, allCreatures, reason, userMessage, tick });

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
        const toolResult = executeTool(tu, req.creature, req.world, req.allCreatures, req.tick);
        toolResults.push(`${tu.name}: ${toolResult}`);
      }

      req.creature.thinking = false;

      // Update last_wake_tick in memory so default onTick periodic wake works
      try {
        const mem = JSON.parse(req.creature.embodiment.memory || '{}');
        mem.last_wake_tick = req.tick;
        req.creature.embodiment.memory = JSON.stringify(mem);
      } catch { /* ignore parse errors */ }

      this.emit({
        type: 'creature:woke',
        id: req.creature.id,
        reason: req.reason,
        thoughts: result.thoughts,
        toolsUsed: toolResults,
        tick: req.tick,
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

    if (this.queue.length > 0) {
      setTimeout(() => this.processNext(), 0);
    } else {
      this.processing = false;
    }
  }

  private async callAPI(req: WakeRequest): Promise<{ thoughts: string; toolUses: ToolUseBlock[] }> {
    // Parse custom tools from embodiment
    let customToolDefs: Array<{ name: string; description: string; input_schema: unknown }> = [];
    try {
      const parsed = JSON.parse(req.creature.embodiment.tools) as Array<{
        name: string; description: string; input_schema: unknown;
      }>;
      customToolDefs = parsed.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      }));
    } catch { /* ignore parse errors */ }

    const body = {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [...EDIT_TOOLS, ...customToolDefs],
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
      throw new Error(
        (err as Record<string, string>).error ||
        (err as Record<string, string>).message ||
        `API error ${response.status}`,
      );
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

/**
 * Configurable agent for the zork-search experiment.
 *
 * Each ExperimentConfig dimension controls a specific aspect of behavior:
 *   - memory:     what persistent sections exist and how they're managed
 *   - history:    how game transcript is stored/compressed
 *   - action:     how model output becomes a game command
 *   - reflection: when inference fires
 *   - selfMod:    what self-editing tools are available
 *
 * The agent implements the runEpisode pattern (agent owns the loop).
 */

import type { ExperimentConfig, TalesState, StepLog, EpisodeResult } from './types.js';
import { callModel, BudgetExhaustedError, type InferenceResult } from './inference.js';

const TOTAL_SOMA_CHAR_CAP = 300_000;

// ── Soma management ──────────────────────────────────────────

type Soma = Map<string, string>;

function assembleSoma(soma: Soma, config: ExperimentConfig): string {
  const parts: string[] = [];
  for (const [name, content] of soma) {
    const header = sectionHeader(name);
    parts.push(`${header}\n\n${content || '(empty)'}`);
  }
  return parts.join('\n\n');
}

function sectionHeader(name: string): string {
  const headers: Record<string, string> = {
    identity: '# Who I am',
    goal: '# What I want',
    memory: '# What I remember',
    history: '# What just happened',
    inner_voice: '# What I was just thinking',
    hard_earned_wisdom: '# Hard-earned wisdom (persists across lives)',
    map_knowledge: '# Map — what I know about this place',
    puzzle_tracker: '# Puzzles — what I have noticed and what I think I need',
    exploration_log: '# Exploration — where I have been and what I tried',
    world_model: '# Current world state (auto-updated)',
    on_tick: '# How I move each moment',
    custom_tools: '# Tools I have shaped for myself',
  };
  return headers[name] ?? `# ${name.replace(/_/g, ' ')}`;
}

function writeSection(soma: Soma, name: string, value: string): string {
  const prev = soma.get(name);
  soma.set(name, value);
  if (assembleSoma(soma, {} as any).length > TOTAL_SOMA_CHAR_CAP) {
    if (prev !== undefined) soma.set(name, prev);
    else soma.delete(name);
    return 'Error: write would exceed soma cap.';
  }
  return `Updated ${name}.`;
}

function appendToSection(soma: Soma, name: string, line: string): void {
  const cur = soma.get(name) ?? '';
  const candidate = cur + (cur ? '\n' : '') + line;
  soma.set(name, candidate);
  while (assembleSoma(soma, {} as any).length > TOTAL_SOMA_CHAR_CAP) {
    const text = soma.get(name) ?? '';
    const lines = text.split('\n');
    if (lines.length <= 1) break;
    lines.shift();
    soma.set(name, lines.join('\n'));
  }
}

// ── Default contents ─────────────────────────────────────────

const DEFAULT_IDENTITY = `I am an explorer in a strange underground world. I observe carefully, think about what I see, and act decisively. I map the places I visit, track items I find, and solve puzzles by reasoning about what I know.

When I die, I start over — but I keep my hard-earned wisdom. Each life I should use what I learned to get further, faster.`;

const DEFAULT_GOAL = `Explore thoroughly. Find treasures and bring them to safety. Solve puzzles. Survive. Maximize my score. Each life, push further than the last.`;

// ── Build initial soma based on config ───────────────────────

function buildInitialSoma(config: ExperimentConfig): Soma {
  const soma = new Map<string, string>();

  // Always present
  soma.set('identity', DEFAULT_IDENTITY);
  soma.set('goal', DEFAULT_GOAL);

  // Memory architecture
  switch (config.memory) {
    case 'blob':
      soma.set('memory', 'I just arrived. I know nothing yet.');
      break;
    case 'structured':
      soma.set('map_knowledge', '');
      soma.set('puzzle_tracker', '');
      soma.set('exploration_log', '');
      soma.set('memory', '');
      break;
    case 'auto_curated':
      soma.set('world_model', '(will be auto-populated each step)');
      soma.set('memory', '');
      break;
    case 'mounted':
      soma.set('memory', '');
      break;
    case 'hybrid':
      soma.set('world_model', '(will be auto-populated each step)');
      soma.set('memory', '');
      // Mounted sections will be added dynamically
      break;
  }

  // History
  if (config.history !== 'none') {
    soma.set('history', '');
  }

  // Inner voice (always useful)
  soma.set('inner_voice', '');

  // Hard-earned wisdom (cross-life persistence)
  soma.set('hard_earned_wisdom', '');

  // Custom tools section (if selfMod allows)
  if (config.selfMod === 'memory_tools' || config.selfMod === 'full_soma') {
    soma.set('custom_tools', '[]');
  }

  return soma;
}

// Sections that survive death (wisdom carries forward)
const CROSS_LIFE_SECTIONS = new Set(['identity', 'goal', 'hard_earned_wisdom', 'custom_tools']);

// Sections that are core and can't be mounted over
const CORE_SECTIONS = new Set(['identity', 'goal', 'inner_voice', 'hard_earned_wisdom', 'history', 'world_model', 'custom_tools', 'on_tick', 'memory', 'map_knowledge', 'puzzle_tracker', 'exploration_log']);

// ── Tool definitions per config ──────────────────────────────

interface ToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: any };
}

function buildTools(soma: Soma, config: ExperimentConfig): ToolDef[] {
  const tools: ToolDef[] = [];

  // Action tool
  if (config.action === 'tool') {
    tools.push({
      type: 'function',
      function: {
        name: 'take_action',
        description: 'Send a command to the game world. Examples: "go north", "take lamp", "examine mailbox", "open door", "read leaflet", "kill troll with sword", "put egg in case".',
        parameters: {
          type: 'object',
          properties: { command: { type: 'string', description: 'The game command to execute' } },
          required: ['command'],
          additionalProperties: false,
        },
      },
    });
  } else if (config.action === 'structured') {
    tools.push(
      {
        type: 'function',
        function: {
          name: 'go',
          description: 'Move in a direction.',
          parameters: {
            type: 'object',
            properties: { direction: { type: 'string', enum: ['north', 'south', 'east', 'west', 'up', 'down', 'northeast', 'northwest', 'southeast', 'southwest', 'in', 'out'] } },
            required: ['direction'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'examine',
          description: 'Look at something closely.',
          parameters: {
            type: 'object',
            properties: { thing: { type: 'string' } },
            required: ['thing'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'take',
          description: 'Pick up an item.',
          parameters: {
            type: 'object',
            properties: { item: { type: 'string' } },
            required: ['item'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'drop',
          description: 'Put down an item.',
          parameters: {
            type: 'object',
            properties: { item: { type: 'string' } },
            required: ['item'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'use_item',
          description: 'Use an item, optionally on/with something. Covers: open, close, turn on, turn off, unlock, light, read, move, push, pull, put, climb, etc.',
          parameters: {
            type: 'object',
            properties: {
              action: { type: 'string' },
              item: { type: 'string' },
              target: { type: 'string', description: 'Optional target' },
            },
            required: ['action', 'item'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'look',
          description: 'Look around the current location.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      },
      {
        type: 'function',
        function: {
          name: 'inventory',
          description: 'Check what I am carrying.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      },
      {
        type: 'function',
        function: {
          name: 'game_command',
          description: 'Send any arbitrary game command.',
          parameters: {
            type: 'object',
            properties: { command: { type: 'string' } },
            required: ['command'],
            additionalProperties: false,
          },
        },
      },
    );
  }

  // Self-modification tools
  if (config.selfMod !== 'none') {
    const editableSections = getEditableSections(soma, config);
    for (const name of editableSections) {
      tools.push({
        type: 'function',
        function: {
          name: `edit_${name}`,
          description: `Rewrite my "${name}" section with new content.`,
          parameters: {
            type: 'object',
            properties: { content: { type: 'string' } },
            required: ['content'],
            additionalProperties: false,
          },
        },
      });
    }
  }

  // Mount tools (for mounted and hybrid memory)
  if (config.memory === 'mounted' || config.memory === 'hybrid') {
    tools.push(
      {
        type: 'function',
        function: {
          name: 'mount',
          description: 'Pin a new named section into my soma. It persists and is visible every step until unmounted. Use this to keep important information (map data, puzzle notes, item locations) always visible.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Section name (lowercase_snake_case)' },
              content: { type: 'string', description: 'Initial content' },
            },
            required: ['name', 'content'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'unmount',
          description: 'Remove a previously mounted section. The content is gone.',
          parameters: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'update_mount',
          description: 'Update the content of a previously mounted section.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['name', 'content'],
            additionalProperties: false,
          },
        },
      },
    );
  }

  // Custom tool management
  if (config.selfMod === 'memory_tools' || config.selfMod === 'full_soma') {
    tools.push(
      {
        type: 'function',
        function: {
          name: 'add_custom_tool',
          description: 'Create a new custom tool.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              input_schema: { type: 'object' },
              body: { type: 'string' },
            },
            required: ['name', 'description', 'input_schema', 'body'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'remove_custom_tool',
          description: 'Remove a custom tool by name.',
          parameters: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
            additionalProperties: false,
          },
        },
      },
    );
  }

  return tools;
}

function getEditableSections(soma: Soma, config: ExperimentConfig): string[] {
  const editable: string[] = [];
  for (const name of soma.keys()) {
    if (name === 'inner_voice' || name === 'history' || name === 'world_model') continue;

    if (config.selfMod === 'memory_only') {
      if (['memory', 'map_knowledge', 'puzzle_tracker', 'exploration_log', 'hard_earned_wisdom'].includes(name)) {
        editable.push(name);
      }
    } else if (config.selfMod === 'memory_tools') {
      if (name !== 'on_tick' && name !== 'custom_tools') {
        editable.push(name);
      }
    } else if (config.selfMod === 'full_soma') {
      editable.push(name);
    }
  }
  return editable;
}

// ── History management ───────────────────────────────────────

function updateHistory(soma: Soma, config: ExperimentConfig, action: string, observation: string, step: number): void {
  if (config.history === 'none') return;

  const entry = `> ${action}\n${observation.slice(0, 300).replace(/\n{2,}/g, '\n')}`;

  if (config.history === 'rolling') {
    const cur = soma.get('history') ?? '';
    const newHist = (cur + (cur ? '\n\n' : '') + entry);
    const lines = newHist.split('\n');
    const maxLines = config.historyWindow * 3;
    if (lines.length > maxLines) {
      soma.set('history', lines.slice(-maxLines).join('\n'));
    } else {
      soma.set('history', newHist);
    }
  } else if (config.history === 'summarized') {
    const cur = soma.get('history') ?? '';
    soma.set('history', cur + (cur ? '\n\n' : '') + entry);
    if (step > 0 && step % config.periodicInterval === 0) {
      const text = soma.get('history') ?? '';
      const entries = text.split('\n\n');
      if (entries.length > 6) {
        const old = entries.slice(0, -3);
        const recent = entries.slice(-3);
        const compressed = old.map(e => {
          const lines = e.split('\n');
          return lines[0] + (lines.length > 1 ? ' → ' + lines.slice(1).join(' ').slice(0, 80) : '');
        });
        soma.set('history', [...compressed, '---', ...recent].join('\n'));
      }
    }
  } else if (config.history === 'full') {
    const cur = soma.get('history') ?? '';
    soma.set('history', cur + (cur ? '\n\n' : '') + entry);
  }
}

// ── Auto-curated world model ─────────────────────────────────

function updateWorldModel(soma: Soma, config: ExperimentConfig, state: TalesState, action: string, step: number, lifeNumber: number): void {
  if (config.memory !== 'auto_curated' && config.memory !== 'hybrid') return;

  const model = [
    `Score: ${state.score}/${state.max_score} | Step: ${step} | Life: ${lifeNumber}`,
    '',
    state.observation,
  ].join('\n');

  soma.set('world_model', model);
}

// ── Action extraction ────────────────────────────────────────

function extractActionFromText(text: string): string {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return 'look';
  let action = lines[lines.length - 1];
  action = action.replace(/^[>»]\s*/, '').replace(/^(command|action|do):\s*/i, '');
  return action || 'look';
}

function actionFromStructuredTool(name: string, args: Record<string, any>): string {
  switch (name) {
    case 'go': return `go ${args.direction}`;
    case 'examine': return `examine ${args.thing}`;
    case 'take': return `take ${args.item}`;
    case 'drop': return `drop ${args.item}`;
    case 'look': return 'look';
    case 'inventory': return 'inventory';
    case 'game_command': return args.command ?? 'look';
    case 'use_item': {
      let cmd = `${args.action} ${args.item}`;
      if (args.target) {
        const prep = ['put', 'place'].includes(args.action?.toLowerCase()) ? 'in' : 'with';
        cmd += ` ${prep} ${args.target}`;
      }
      return cmd;
    }
    default: return '';
  }
}

const STRUCTURED_ACTION_TOOLS = new Set(['go', 'examine', 'take', 'drop', 'look', 'inventory', 'use_item', 'game_command']);

// ── Custom tools parsing ─────────────────────────────────────

interface CustomToolDef {
  name: string;
  description: string;
  input_schema: any;
  body: string;
}

function parseCustomTools(content: string): CustomToolDef[] {
  if (!content || content.trim().length === 0 || content.trim() === '[]') return [];
  let jsonText = content.trim();
  const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) jsonText = fenceMatch[1].trim();
  if (!jsonText || jsonText === '[]') return [];
  try {
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e: any) => e && typeof e.name === 'string' && typeof e.body === 'string');
  } catch {
    return [];
  }
}

// ── The agent ────────────────────────────────────────────────

export interface AgentRunResult {
  finalState: TalesState;
  episodeResult: EpisodeResult;
  stepLogs: StepLog[];
}

export async function runAgent(
  config: ExperimentConfig,
  bridge: { step(action: string): Promise<TalesState>; reset(): Promise<TalesState> },
  initialState: TalesState,
  env: string,
  episode: number,
  verbose: boolean = false,
): Promise<AgentRunResult> {
  const startTime = Date.now();
  let state = initialState;
  let soma = buildInitialSoma(config);
  let totalWakeups = 0;
  let lifeNumber = 1;
  let bestScore = 0;
  let bestScoreThisLife = 0;
  let prevScore = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const stepLogs: StepLog[] = [];
  let globalStep = 0;

  // Anti-wandering: track recent observations to detect loops
  const recentObservations: string[] = [];   // last 10 observation fingerprints
  const recentActions: string[] = [];        // last 10 actions
  let stuckCounter = 0;                      // consecutive steps with repeated obs
  let lastScoreChangeStep = 0;               // step when score last changed

  // Build the user prompt with the current observation front and center
  function buildUserPrompt(step: number, currentObs: string, scoreChanged: boolean): string {
    const parts: string[] = [];

    // Current observation — THE most important thing
    parts.push(`== What you see now ==\n${currentObs}`);

    // Score info
    if (scoreChanged) {
      parts.push(`\n[Score changed! Now ${state.score}/${state.max_score}]`);
      lastScoreChangeStep = step;
    }

    // Anti-wandering warnings
    if (stuckCounter >= 3) {
      parts.push(`\n⚠ You have been in similar locations for ${stuckCounter} steps. You may be going in circles. Try a completely different direction or approach.`);
    }
    if (step - lastScoreChangeStep > 30 && state.score > 0) {
      parts.push(`\n⚠ ${step - lastScoreChangeStep} steps since your last score change. Consider: are you making progress or wandering?`);
    }

    // Recent action pattern detection
    const last5 = recentActions.slice(-5);
    const lookCount = last5.filter(a => a === 'look').length;
    if (lookCount >= 3) {
      parts.push(`\n⚠ You've used "look" ${lookCount} times in the last 5 steps. You already know what's here. Move or try something new.`);
    }

    // Budget
    parts.push(`\n[Life ${lifeNumber} | Step ${step} | Budget: ${totalWakeups}/${config.maxWakeups} wakes used]`);

    // Prompt based on reflection pattern
    switch (config.reflection) {
      case 'every_step':
        parts.push('\nAct.');
        break;
      case 'periodic':
        parts.push('\nThink about where you are, what you know, and what to do next. Then act.');
        break;
      case 'event_driven':
        parts.push('\nWhat do you notice? Act on it.');
        break;
      case 'actant_controlled':
        parts.push('\nAct.');
        break;
    }

    if (config.action === 'free_text') {
      parts.push('Write your game command as the last line.');
    }

    return parts.join('\n');
  }

  // Execute tool calls and extract game action
  function handleToolCalls(
    toolCalls: Array<{ id: string; name: string; args: Record<string, any> }>,
    logEntries: { name: string; args: any; result?: string }[],
  ): string | null {
    let gameAction: string | null = null;

    for (const tc of toolCalls) {
      let result: string;

      if (tc.name === 'take_action') {
        gameAction = tc.args.command ?? 'look';
        result = `(action queued: ${gameAction})`;
      } else if (STRUCTURED_ACTION_TOOLS.has(tc.name)) {
        const action = actionFromStructuredTool(tc.name, tc.args);
        if (action) {
          gameAction = action;
          result = `(action queued: ${action})`;
        } else {
          result = 'Error: could not parse action';
        }
      } else if (tc.name === 'mount') {
        if (config.memory !== 'mounted' && config.memory !== 'hybrid') {
          result = 'Error: mounting not available';
        } else if (!tc.args.name || !/^[a-z][a-z0-9_]{0,49}$/.test(tc.args.name)) {
          result = 'Error: invalid section name (lowercase_snake_case)';
        } else if (soma.has(tc.args.name) && CORE_SECTIONS.has(tc.args.name)) {
          result = `Error: cannot mount over core section "${tc.args.name}"`;
        } else {
          result = writeSection(soma, tc.args.name, tc.args.content ?? '');
        }
      } else if (tc.name === 'unmount') {
        if (CORE_SECTIONS.has(tc.args.name) || !soma.has(tc.args.name)) {
          result = `Error: cannot unmount "${tc.args.name}"`;
        } else {
          soma.delete(tc.args.name);
          result = `Unmounted "${tc.args.name}"`;
        }
      } else if (tc.name === 'update_mount') {
        if (!soma.has(tc.args.name) || CORE_SECTIONS.has(tc.args.name)) {
          result = `Error: "${tc.args.name}" is not a mounted section`;
        } else {
          result = writeSection(soma, tc.args.name, tc.args.content ?? '');
        }
      } else if (tc.name.startsWith('edit_')) {
        const sectionName = tc.name.slice(5);
        if (!soma.has(sectionName)) {
          result = `Error: section "${sectionName}" does not exist`;
        } else {
          result = writeSection(soma, sectionName, tc.args.content ?? '');
        }
      } else if (tc.name === 'add_custom_tool') {
        try {
          const existing = parseCustomTools(soma.get('custom_tools') ?? '[]');
          existing.push({
            name: tc.args.name,
            description: tc.args.description ?? '',
            input_schema: tc.args.input_schema ?? { type: 'object', properties: {} },
            body: tc.args.body ?? '',
          });
          writeSection(soma, 'custom_tools', JSON.stringify(existing, null, 2));
          result = `Added custom tool "${tc.args.name}"`;
        } catch (e: any) {
          result = `Error: ${e.message}`;
        }
      } else if (tc.name === 'remove_custom_tool') {
        const existing = parseCustomTools(soma.get('custom_tools') ?? '[]');
        const filtered = existing.filter(t => t.name !== tc.args.name);
        writeSection(soma, 'custom_tools', JSON.stringify(filtered, null, 2));
        result = `Removed custom tool "${tc.args.name}"`;
      } else {
        // Custom tool
        const customTools = parseCustomTools(soma.get('custom_tools') ?? '[]');
        const custom = customTools.find(t => t.name === tc.name);
        if (custom) {
          try {
            const fn = new Function(`return (${custom.body});`)();
            const val = fn(tc.args, { soma: Object.fromEntries(soma) });
            result = typeof val === 'string' ? val : JSON.stringify(val ?? 'ok').slice(0, 300);
          } catch (e: any) {
            result = `Custom tool error: ${e.message}`;
          }
        } else {
          result = `Unknown tool: ${tc.name}`;
        }
      }

      logEntries.push({ name: tc.name, args: tc.args, result });
    }

    return gameAction;
  }

  // Handle death — preserve wisdom, reset transient state
  function handleDeath(deathObs: string, lifeSteps: number) {
    const finalScore = state.score;

    // Build a death reflection note
    const deathNote = [
      `--- Life ${lifeNumber} (score: ${finalScore}, steps: ${lifeSteps}) ---`,
      `Died: ${deathObs.replace(/\n+/g, ' ').slice(0, 200)}`,
    ].join('\n');
    appendToSection(soma, 'hard_earned_wisdom', deathNote);

    // Preserve cross-life state, reset everything else
    const preserved = new Map<string, string>();
    for (const key of CROSS_LIFE_SECTIONS) {
      if (soma.has(key)) preserved.set(key, soma.get(key)!);
    }

    // Also preserve mounted sections (they're the agent's hard-won organization)
    const mountedSections = new Map<string, string>();
    for (const [key, value] of soma) {
      if (!CORE_SECTIONS.has(key)) {
        mountedSections.set(key, value);
      }
    }

    // Rebuild soma from scratch
    soma = buildInitialSoma(config);

    // Restore preserved sections
    for (const [key, value] of preserved) {
      soma.set(key, value);
    }

    // Restore mounted sections
    for (const [key, value] of mountedSections) {
      soma.set(key, value);
    }

    // Clear history for new life
    if (soma.has('history')) {
      soma.set('history', '');
    }

    lifeNumber++;
    bestScoreThisLife = 0;
    prevScore = 0;
    stuckCounter = 0;
    recentObservations.length = 0;
    recentActions.length = 0;
    lastScoreChangeStep = globalStep;
  }

  // ── Initial setup ──
  updateHistory(soma, config, 'look', state.observation, 0);
  updateWorldModel(soma, config, state, 'look', 0, lifeNumber);

  // ── Main loop ──
  let stepError: string | undefined;

  for (let step = 1; step <= config.maxSteps; step++) {
    globalStep = step;
    const scoreChanged = state.score !== prevScore;
    if (scoreChanged) prevScore = state.score;

    const toolCallLog: { name: string; args: any; result?: string }[] = [];
    const thinking: string[] = [];
    let actionTaken = '(no action)';

    if (totalWakeups >= config.maxWakeups) break;

    try {
      // Fire inference
      const system = assembleSoma(soma, config);
      const tools = buildTools(soma, config);
      const userPrompt = buildUserPrompt(step, state.observation, scoreChanged);

      const result = await callModel({
        model: config.model,
        system,
        messages: [{ role: 'user', content: userPrompt }],
        tools: tools.length > 0 ? tools : undefined,
        maxTokens: 4096,
        thinkingBudget: config.model.includes('anthropic/') ? (config.thinkingBudget ?? 2048) : undefined,
      });

      totalWakeups++;
      totalInputTokens += result.tokensUsed.input;
      totalOutputTokens += result.tokensUsed.output;

      if (result.text) {
        thinking.push(result.text.slice(0, 500));
        soma.set('inner_voice', result.text.slice(-3000));
      }

      // Handle tool calls
      let gameAction = handleToolCalls(result.toolCalls, toolCallLog);

      // For free_text, extract from text
      if (config.action === 'free_text' && !gameAction && result.text) {
        gameAction = extractActionFromText(result.text);
      }

      // Execute game action
      if (gameAction) {
        actionTaken = gameAction;
        state = await bridge.step(gameAction);
        updateHistory(soma, config, gameAction, state.observation, step);
        updateWorldModel(soma, config, state, gameAction, step, lifeNumber);

        // Anti-wandering tracking
        const obsFingerprint = state.observation.slice(0, 80).trim();
        recentActions.push(gameAction);
        if (recentActions.length > 10) recentActions.shift();

        if (recentObservations.includes(obsFingerprint)) {
          stuckCounter++;
        } else {
          stuckCounter = 0;
        }
        recentObservations.push(obsFingerprint);
        if (recentObservations.length > 10) recentObservations.shift();
      }
    } catch (err: any) {
      if (err instanceof BudgetExhaustedError) {
        if (verbose) console.log(`  [step ${step}] BUDGET EXHAUSTED — stopping cleanly`);
        stepError = 'Budget exhausted (OpenRouter 402)';
        break;
      }

      stepError = err.message;
      thinking.push(`[ERROR] ${err.message}`);
      if (verbose) console.log(`  [step ${step}] ERROR: ${err.message.slice(0, 200)}`);

      try {
        actionTaken = 'look';
        state = await bridge.step(actionTaken);
      } catch {
        break;
      }
    }

    if (state.score > bestScore) bestScore = state.score;
    if (state.score > bestScoreThisLife) bestScoreThisLife = state.score;

    if (verbose) {
      const scoreStr = state.score > 0 ? ` score=${state.score}` : '';
      console.log(`  s${step} L${lifeNumber}: "${actionTaken}"${scoreStr}${state.done ? (state.won ? ' WON' : ' DEAD') : ''}`);
    }

    // Log step
    stepLogs.push({
      step,
      observation: state.observation.slice(0, 500),
      action: actionTaken,
      score: state.score,
      maxScore: state.max_score,
      wakeupUsed: true,
      thinking,
      toolCalls: toolCallLog,
      somaSnapshot: Object.fromEntries(soma),
    });

    if (stepLogs.length > 300) {
      stepLogs.splice(0, stepLogs.length - 300);
    }

    // Handle death/respawn
    if (state.done) {
      if (verbose) {
        console.log(`  *** Life ${lifeNumber} ended: score ${state.score} ***`);
      }

      handleDeath(state.observation, step);

      if (totalWakeups >= config.maxWakeups) break;

      // Respawn
      state = await bridge.reset();
      prevScore = 0;
      updateHistory(soma, config, 'look', state.observation, step);
      updateWorldModel(soma, config, state, 'look', step, lifeNumber);
    }
  }

  // End summary
  if (verbose) {
    console.log(`\n  Best score: ${bestScore} | Lives: ${lifeNumber} | Wakeups: ${totalWakeups}/${config.maxWakeups}`);
    const mounted = [...soma.keys()].filter(k => !CORE_SECTIONS.has(k));
    if (mounted.length > 0) console.log(`  Mounted sections: ${mounted.join(', ')}`);
    const wisdom = soma.get('hard_earned_wisdom') ?? '';
    if (wisdom.length > 0) console.log(`  Hard-earned wisdom: ${wisdom.length} chars`);
  }

  const result: EpisodeResult = {
    configId: config.id,
    env,
    episode,
    score: state.score,
    maxScore: state.max_score,
    steps: globalStep,
    won: state.won,
    lives: lifeNumber,
    bestScore,
    totalWakeups,
    durationMs: Date.now() - startTime,
    tokenEstimate: { input: totalInputTokens, output: totalOutputTokens },
    error: stepError,
  };

  return { finalState: state, episodeResult: result, stepLogs };
}

// ── Reflection Manager ──
// After each chase, runs inference for each police actant to review the replay
// and update their soma (signal handlers, memory, tools).
// 
// Key principle from implementation guide: EXPLICIT IMPERATIVES.
// Don't say "update your tactical handlers." Say "call update_signal_handlers
// right now and rewrite your on_player_spotted case."

import { ChaseReplay, TileType } from './types';
import { Soma, DISCOVERABLE_TOOLS } from './soma';
import { renderChaseMap } from './chase-map-renderer';
import { summarizeReplayForActant, queryReplayRange, ReplaySummary } from './replay-summarizer';
import { clearHandlerCache } from './handler-executor';

// ── Scaffold Tool Definitions (for Anthropic tool_use) ──

const SCAFFOLD_TOOLS = [
  {
    name: 'update_signal_handlers',
    description: 'Rewrite how you respond during a chase. This is your actual behavior — the code that runs when you spot the suspect, lose them, or hear from an ally. Write the full onSignal function.',
    input_schema: {
      type: 'object' as const,
      properties: {
        handlers_code: {
          type: 'string',
          description: 'The complete onSignal(type, data, me) function including the function declaration. Must use me.callTool() for actions.',
        },
        reasoning: {
          type: 'string',
          description: 'Brief explanation of what you changed and why.',
        },
      },
      required: ['handlers_code', 'reasoning'],
    },
  },
  {
    name: 'update_memory',
    description: 'Update what you remember. Your memory persists across chases. Keep it focused on patterns and lessons, not raw data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        memory_content: {
          type: 'string',
          description: 'Your updated memory. This replaces your current memory entirely.',
        },
      },
      required: ['memory_content'],
    },
  },
  {
    name: 'discover_tools',
    description: 'See what capabilities are available to you that you haven\'t adopted yet. New tools expand what you can do during chases.',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'adopt_tools',
    description: 'Add new capabilities to your toolkit for future chases. Only adopt tools you have a specific plan to use.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tool_names: {
          type: 'array',
          items: { type: 'string' },
          description: 'Names of tools to adopt from the discoverable list.',
        },
        reasoning: {
          type: 'string',
          description: 'Why you need these tools for your evolving tactics.',
        },
      },
      required: ['tool_names', 'reasoning'],
    },
  },
  {
    name: 'query_replay',
    description: 'Look more closely at a specific moment in the chase. What happened between those ticks?',
    input_schema: {
      type: 'object' as const,
      properties: {
        start_tick: { type: 'number', description: 'Start tick of the range to examine.' },
        end_tick: { type: 'number', description: 'End tick of the range to examine.' },
      },
      required: ['start_tick', 'end_tick'],
    },
  },
];

// ── Prompt Construction ──

function buildSystemPrompt(soma: Soma): string {
  return `You are Officer ${soma.name}, badge ${soma.badgeNumber}, of the Hot Pursuit Division.

<identity>
${soma.nature}
</identity>

<responsibility>
${soma.responsibility}
</responsibility>

<tools>
Your current chase tools:
${soma.tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}
</tools>

<current_signal_handlers>
This is the code that controls your behavior during chases. When you spot the suspect, lose them, or hear from an ally, this code runs.
\`\`\`javascript
${soma.signalHandlers}
\`\`\`
</current_signal_handlers>

<memory>
${soma.memory}
</memory>

<chase_history>
${soma.chaseHistory.length === 0
    ? 'No previous chases.'
    : soma.chaseHistory.map(h =>
        `Run ${h.runId}: ${h.outcome} (${Math.round(h.durationSeconds)}s) ${h.spotted ? '- spotted suspect' : ''} ${h.captured ? '- MADE CAPTURE' : ''}`
      ).join('\n')
}
</chase_history>

<player_model>
Known suspect behaviors:
- Preferred routes: ${soma.playerModel.preferredRoutes.length > 0 ? soma.playerModel.preferredRoutes.join(', ') : 'Unknown'}
- Behavioral patterns: ${soma.playerModel.behavioralPatterns.length > 0 ? soma.playerModel.behavioralPatterns.join(', ') : 'Unknown'}
- Exploitation ideas: ${soma.playerModel.exploitationIdeas.length > 0 ? soma.playerModel.exploitationIdeas.join(', ') : 'None yet'}
</player_model>

IMPORTANT: During this reflection session, you have tools to modify your own behavior. You MUST use them — thinking about improvements without calling the tools changes nothing. Your signal handler code is what runs during chases. If you don't call update_signal_handlers, your behavior stays exactly the same next chase.

Available tools during reflection:
- move_toward({target}): Move toward a position (pathfinding)
- check_line_of_sight({target}): Check if you can see a position
- patrol_next(): Move to next patrol waypoint
- hold_position(): Stay put
${soma.tools.filter(t => t.name !== 'move_toward' && t.name !== 'check_line_of_sight').map(t => `- ${t.name}: ${t.description}`).join('\n')}

When writing signal handlers, use me.callTool(name, args) for actions, me.getState() for your current state, and me.getPosition() for your position.`;
}

function buildReflectionPrompt(summary: ReplaySummary, chaseCount: number): string {
  const isFirstChase = chaseCount <= 1;

  return `The chase is over. You're back at the precinct, replaying the night in your head.

<chase_replay>
Chase #${summary.runId} — Result: **${summary.outcome.toUpperCase()}**
Duration: ${summary.durationSeconds}s (${summary.durationTicks} ticks)

Your performance:
- ${summary.officerSummary.spottedPlayer ? 'You spotted the suspect' : 'You never saw the suspect'}
- ${summary.officerSummary.madeCapture ? 'YOU made the capture' : 'You did not make the capture'}
- Closest you got: ${summary.officerSummary.closestDistance}px
- Time breakdown: ${Object.entries(summary.officerSummary.stateBreakdown).map(([k, v]) => `${k}: ${v}s`).join(', ')}

Overall stats:
- Suspect was spotted ${summary.timesSpotted} time(s), lost ${summary.timesLost} time(s)
- Closest any officer got: ${Math.round(summary.closestApproach)}px
- Suspect traveled ${summary.playerDistanceTraveled}px total

Key moments (numbered markers on the attached chase map):
${summary.keyMoments.map((m, i) =>
    `  ${i + 1}. [${Math.round(m.time)}s] ${m.description}`
  ).join('\n')}
</chase_replay>

The attached image is a bird's-eye view of the chase. Green line = suspect path. Your path is colored by state (purple=patrol, red=pursuing, orange=searching). Numbered circles mark key moments listed above. Green squares = extraction points.

${isFirstChase
    ? `This was your first chase. Your default handlers are basic — move toward on sight, go to last known on lost, random patrol otherwise. There's a LOT of room to improve.`
    : `You've now completed ${chaseCount} chases. Review what changed since last time and whether your modifications helped.`
}

Now do the following, in order:

1. **Review**: What worked? What failed? What did the suspect do that surprised you?

2. **Call update_signal_handlers**: Rewrite your onSignal function RIGHT NOW with specific improvements based on what you learned. ${isFirstChase
    ? 'Your current handlers are naive — at minimum, add smarter search behavior when you lose the suspect instead of just walking to their last position.'
    : 'Build on your previous changes. Don\'t regress — keep what worked, fix what didn\'t.'}

   Your handler receives these signals:
   - 'tick': {own_position, state, tick, map_state} — fires every game tick
   - 'player_spotted': {player_position, own_position, map_state} — you can see the suspect
   - 'player_lost': {last_known_position, own_position, map_state} — just lost visual
   - 'ally_signal': {ally_id, signal_type, signal_data} — radio from another officer

   Available me.callTool() actions: ${[
     'move_toward({target})',
     'check_line_of_sight({target})',
     'patrol_next()',
     'hold_position()',
   ].join(', ')}

3. **Call update_memory**: Record what you learned. Focus on patterns — "the suspect tends to..." not raw tick data.

4. **Optionally call discover_tools** if you feel limited by your current capabilities, then **adopt_tools** for tools that match your evolving approach.

DO NOT just describe what you would change. CALL THE TOOLS. Your written analysis means nothing if you don't call update_signal_handlers.`;
}

// ── Reflection Execution ──

export interface ReflectionResult {
  actantId: string;
  success: boolean;
  handlersUpdated: boolean;
  memoryUpdated: boolean;
  toolsAdopted: string[];
  reasoning: string;
  error?: string;
  tokenUsage?: { input: number; output: number };
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'image';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  source?: { type: 'base64'; media_type: 'image/png'; data: string };
}

interface AnthropicResponse {
  id: string;
  content: AnthropicContentBlock[];
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

/**
 * Run reflection for a single actant.
 * Makes API calls, processes tool use, updates the soma in place.
 */
export interface MapInfo {
  tiles: TileType[][];
  cols: number;
  rows: number;
  tileSize: number;
}

export async function reflectActant(
  soma: Soma,
  replay: ChaseReplay,
  apiEndpoint: string,
  chaseMapBase64: string,
  model: string = 'claude-sonnet-4-20250514',
): Promise<ReflectionResult> {
  const result: ReflectionResult = {
    actantId: soma.id,
    success: false,
    handlersUpdated: false,
    memoryUpdated: false,
    toolsAdopted: [],
    reasoning: '',
  };

  try {
    const summary = summarizeReplayForActant(replay, soma);
    const systemPrompt = buildSystemPrompt(soma);
    const userPrompt = buildReflectionPrompt(summary, soma.chaseHistory.length);

    console.log(JSON.stringify({
      _hp: 'reflection_start',
      actantId: soma.id,
      name: soma.name,
      chaseCount: soma.chaseHistory.length,
      summaryKeyMoments: summary.keyMoments.length,
    }));

    // Initial inference call — multimodal (image + text)
    let messages: AnthropicMessage[] = [
      { role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: chaseMapBase64 } },
        { type: 'text', text: userPrompt },
      ] },
    ];

    let totalInput = 0;
    let totalOutput = 0;
    let turns = 0;
    const maxTurns = 5; // cap multi-turn to prevent runaway

    while (turns < maxTurns) {
      turns++;

      const response = await callAnthropicAPI(apiEndpoint, {
        model,
        system: systemPrompt,
        messages,
        tools: SCAFFOLD_TOOLS,
        max_tokens: 4096,
      });

      if (!response) {
        result.error = 'API call failed';
        return result;
      }

      totalInput += response.usage.input_tokens;
      totalOutput += response.usage.output_tokens;

      // Process the response
      const toolResults: AnthropicContentBlock[] = [];
      let hasToolUse = false;

      for (const block of response.content) {
        if (block.type === 'text' && block.text) {
          result.reasoning += block.text + '\n';
        }

        if (block.type === 'tool_use' && block.name && block.input) {
          hasToolUse = true;
          const toolResult = processToolCall(
            block.name,
            block.input,
            soma,
            replay,
            result,
          );
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(toolResult),
          });
        }
      }

      // If no tool use, we're done
      if (!hasToolUse || response.stop_reason === 'end_turn') {
        break;
      }

      // Continue the conversation with tool results
      messages = [
        ...messages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults },
      ];
    }

    result.success = true;
    result.tokenUsage = { input: totalInput, output: totalOutput };

    // Clear handler cache so new code gets compiled
    if (result.handlersUpdated) {
      clearHandlerCache();
    }

    console.log(JSON.stringify({
      _hp: 'reflection_complete',
      actantId: soma.id,
      name: soma.name,
      handlersUpdated: result.handlersUpdated,
      memoryUpdated: result.memoryUpdated,
      toolsAdopted: result.toolsAdopted,
      turns,
      tokens: result.tokenUsage,
      handlerLength: soma.signalHandlers.length,
    }));

  } catch (err) {
    result.error = String(err);
    console.log(JSON.stringify({
      _hp: 'reflection_error',
      actantId: soma.id,
      error: result.error,
    }));
  }

  return result;
}

// ── Tool Call Processing ──

function processToolCall(
  toolName: string,
  input: Record<string, unknown>,
  soma: Soma,
  replay: ChaseReplay,
  result: ReflectionResult,
): { success: boolean; data?: unknown; error?: string } {
  switch (toolName) {
    case 'update_signal_handlers': {
      const code = input.handlers_code as string;
      const reasoning = input.reasoning as string;

      if (!code) {
        return { success: false, error: 'handlers_code is required' };
      }

      // Validate the handler code
      const validation = validateHandlerCode(code);
      if (!validation.valid) {
        console.log(JSON.stringify({
          _hp: 'handler_validation_failed',
          actantId: soma.id,
          errors: validation.errors,
          code: code.slice(0, 300),
        }));
        return {
          success: false,
          error: `Handler validation failed: ${validation.errors.join(', ')}. Fix and try again.`,
        };
      }

      soma.signalHandlers = code;
      result.handlersUpdated = true;

      console.log(JSON.stringify({
        _hp: 'handlers_updated',
        actantId: soma.id,
        reasoning,
        codeLength: code.length,
        codePreview: code.slice(0, 200),
      }));

      return {
        success: true,
        data: { message: 'Signal handlers updated. They will execute in the next chase.' },
      };
    }

    case 'update_memory': {
      const content = input.memory_content as string;
      if (!content) {
        return { success: false, error: 'memory_content is required' };
      }

      soma.memory = content;
      result.memoryUpdated = true;

      console.log(JSON.stringify({
        _hp: 'memory_updated',
        actantId: soma.id,
        memoryLength: content.length,
        memoryPreview: content.slice(0, 200),
      }));

      return {
        success: true,
        data: { message: 'Memory updated.' },
      };
    }

    case 'discover_tools': {
      const currentToolNames = new Set(soma.tools.map(t => t.name));
      const available = DISCOVERABLE_TOOLS.filter(t => !currentToolNames.has(t.name));

      console.log(JSON.stringify({
        _hp: 'tools_discovered',
        actantId: soma.id,
        available: available.map(t => t.name),
      }));

      return {
        success: true,
        data: {
          available_tools: available.map(t => ({
            name: t.name,
            description: t.description,
          })),
        },
      };
    }

    case 'adopt_tools': {
      const toolNames = input.tool_names as string[];
      const reasoning = input.reasoning as string;

      if (!toolNames || !Array.isArray(toolNames)) {
        return { success: false, error: 'tool_names array is required' };
      }

      const adopted: string[] = [];
      const currentToolNames = new Set(soma.tools.map(t => t.name));

      for (const name of toolNames) {
        if (currentToolNames.has(name)) continue;
        const tool = DISCOVERABLE_TOOLS.find(t => t.name === name);
        if (tool) {
          soma.tools.push(tool);
          adopted.push(name);
          currentToolNames.add(name);
        }
      }

      result.toolsAdopted.push(...adopted);

      console.log(JSON.stringify({
        _hp: 'tools_adopted',
        actantId: soma.id,
        adopted,
        reasoning,
        totalTools: soma.tools.length,
      }));

      return {
        success: true,
        data: { adopted, message: `Adopted ${adopted.length} new tool(s). Use them in your signal handlers.` },
      };
    }

    case 'query_replay': {
      const startTick = input.start_tick as number;
      const endTick = input.end_tick as number;

      if (startTick === undefined || endTick === undefined) {
        return { success: false, error: 'start_tick and end_tick are required' };
      }

      const detail = queryReplayRange(replay, soma.id, startTick, endTick);
      return { success: true, data: detail };
    }

    default:
      return { success: false, error: `Unknown reflection tool: ${toolName}` };
  }
}

// ── Handler Validation ──

function validateHandlerCode(code: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Must contain onSignal function
  if (!code.includes('onSignal')) {
    errors.push('Must contain an onSignal function');
  }

  // Must contain function declaration with expected params
  if (!code.match(/(?:async\s+)?function\s+onSignal\s*\(\s*type\s*,\s*data\s*,\s*me\s*\)/)) {
    errors.push('onSignal must accept (type, data, me) parameters');
  }

  // Check for dangerous patterns
  const forbidden = [
    { pattern: /\beval\s*\(/, msg: 'eval() is not allowed' },
    { pattern: /\bFunction\s*\(/, msg: 'Function constructor is not allowed' },
    { pattern: /\bimport\s*\(/, msg: 'Dynamic import is not allowed' },
    { pattern: /\bfetch\s*\(/, msg: 'fetch() is not allowed in chase handlers' },
    { pattern: /\bXMLHttpRequest\b/, msg: 'XMLHttpRequest is not allowed' },
    { pattern: /\bwindow\b/, msg: 'window access is not allowed' },
    { pattern: /\bdocument\b/, msg: 'document access is not allowed' },
    { pattern: /\bglobalThis\b/, msg: 'globalThis access is not allowed' },
  ];

  for (const { pattern, msg } of forbidden) {
    if (pattern.test(code)) {
      errors.push(msg);
    }
  }

  // Try to compile it (syntax check)
  try {
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    new AsyncFunction('type', 'data', 'me', `${code}\nreturn onSignal(type, data, me);`);
  } catch (err) {
    errors.push(`Syntax error: ${String(err)}`);
  }

  return { valid: errors.length === 0, errors };
}

// ── API Call ──

async function callAnthropicAPI(
  endpoint: string,
  body: {
    model: string;
    system: string;
    messages: AnthropicMessage[];
    tools: typeof SCAFFOLD_TOOLS;
    max_tokens: number;
  },
): Promise<AnthropicResponse | null> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.log(JSON.stringify({
        _hp: 'api_error',
        status: response.status,
        error: errText.slice(0, 500),
      }));
      return null;
    }

    return await response.json() as AnthropicResponse;
  } catch (err) {
    console.log(JSON.stringify({
      _hp: 'api_error',
      error: String(err),
    }));
    return null;
  }
}

// ── Batch Reflection ──

/**
 * Run reflection for all actants in parallel.
 * Returns results and a combined strategy board narrative.
 */
export async function reflectAllActants(
  somas: Soma[],
  replay: ChaseReplay,
  apiEndpoint: string,
  mapInfo: MapInfo,
  model?: string,
  onProgress?: (actantId: string, status: string, chaseMapBase64?: string) => void,
): Promise<{
  results: ReflectionResult[];
  strategyBoard: StrategyBoardData;
}> {
  const promises = somas.map(async (soma) => {
    // Generate this officer's chase map before reflecting
    const summary = summarizeReplayForActant(replay, soma);
    const chaseMapBase64 = renderChaseMap(
      mapInfo.tiles, mapInfo.cols, mapInfo.rows,
      summary.playerWaypoints, summary.officerWaypoints,
      summary.keyMoments, mapInfo.tileSize,
    );

    if (onProgress) onProgress(soma.id, 'reflecting', chaseMapBase64);

    const result = await reflectActant(soma, replay, apiEndpoint, chaseMapBase64, model);

    if (onProgress) onProgress(soma.id, result.success ? 'complete' : 'failed');

    return result;
  });

  const results = await Promise.all(promises);

  // Build strategy board from results
  const strategyBoard = buildStrategyBoardData(somas, results, replay);

  return { results, strategyBoard };
}

// ── Strategy Board ──

export interface StrategyBoardData {
  runId: number;
  outcome: string;
  officers: Array<{
    id: string;
    name: string;
    nature: string;
    handlersUpdated: boolean;
    memoryUpdated: boolean;
    toolsAdopted: string[];
    reasoning: string;
    memoryPreview: string;
    handlerCodePreview: string;
    toolCount: number;
  }>;
}

function buildStrategyBoardData(
  somas: Soma[],
  results: ReflectionResult[],
  replay: ChaseReplay,
): StrategyBoardData {
  return {
    runId: replay.runId,
    outcome: replay.outcome,
    officers: somas.map((soma, i) => ({
      id: soma.id,
      name: soma.name,
      nature: soma.nature,
      handlersUpdated: results[i]?.handlersUpdated ?? false,
      memoryUpdated: results[i]?.memoryUpdated ?? false,
      toolsAdopted: results[i]?.toolsAdopted ?? [],
      reasoning: results[i]?.reasoning ?? '',
      memoryPreview: soma.memory,
      handlerCodePreview: soma.signalHandlers,
      toolCount: soma.tools.length,
    })),
  };
}

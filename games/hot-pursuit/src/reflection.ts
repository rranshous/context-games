// ── Reflection Manager ──
// After each chase, runs inference for each police actant to review the replay
// and update their soma (signal handlers, memory, tools).
// 
// Key principle from implementation guide: EXPLICIT IMPERATIVES.
// Don't say "update your tactical handlers." Say "call update_signal_handlers
// right now and rewrite your on_player_spotted case."

import { ChaseReplay, TileType, DEFAULT_CONFIG, GameConfig } from './types';
import { Soma } from './soma';
import { renderChaseMap, AllyPath } from './chase-map-renderer';
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

function buildReflectionPrompt(summary: ReplaySummary, chaseCount: number, config: GameConfig): string {
  const isFirstChase = chaseCount <= 1;
  const lowMovementThreshold = 8; // tiles — ~200px / 24px per tile

  return `The chase is over. You're back at the precinct, replaying the night in your head.

<chase_replay>
Chase #${summary.runId} — Result: **${summary.outcome.toUpperCase()}**
Duration: ${summary.durationSeconds}s (${summary.durationTicks} ticks)

Your performance:
- ${summary.officerSummary.spottedPlayer ? 'You spotted the suspect' : 'You never saw the suspect'}
- ${summary.officerSummary.madeCapture ? 'YOU made the capture' : 'You did not make the capture'}
- Closest you got: ${summary.officerSummary.closestDistance} tiles
- Distance you traveled: ${summary.officerSummary.distanceTraveled} tiles (suspect traveled ${summary.playerDistanceTraveled} tiles)${summary.officerSummary.distanceTraveled < lowMovementThreshold ? '\n- **WARNING: You barely moved this chase! Your handler is probably NOT producing movement commands for all signal types. Check every case in your switch statement — if a case doesn\'t call me.callTool() with a movement action, you stand still.**' : ''}
- Time breakdown: ${Object.entries(summary.officerSummary.stateBreakdown).map(([k, v]) => `${k}: ${v}s`).join(', ')}

Overall stats:
- Suspect was spotted ${summary.timesSpotted} time(s), lost ${summary.timesLost} time(s)
- Closest any officer got: ${summary.closestApproach} tiles
- Suspect traveled ${summary.playerDistanceTraveled} tiles total

Key moments (numbered markers on the attached chase map):
${summary.keyMoments.map((m, i) =>
    `  ${i + 1}. [${Math.round(m.time)}s] ${m.description}`
  ).join('\n')}
</chase_replay>

COORDINATE SYSTEM:
- All positions use tile-center coordinates: {x: 0, y: 0} is the map center.
- Units are tiles (not pixels). The map extends from {x: -${Math.round(config.mapCols / 2)}, y: -${Math.round(config.mapRows / 2)}} to {x: ${Math.round(config.mapCols / 2)}, y: ${Math.round(config.mapRows / 2)}}.
- Your LOS range is ${config.losRange} tiles. "12 tiles away" means ~1.5× your vision range.
- me.getPosition() returns your tile-center position. All tool targets use tile-center coords.
- data.map_state gives {halfWidth, halfHeight} — the map half-extents in tiles.

The attached image is a bird's-eye view of the chase with a legend at the bottom. IMPORTANT map rules:
- Dark blue/purple rectangles = BUILDINGS. They are impassable (you cannot walk through them) and they block line of sight completely.
- Dark gray = roads, darker gray = alleys. Both are passable and do NOT block LOS.
- You can only see the suspect when there is a clear line between you and them with no buildings in the way.
- When you "lose" the suspect, it is almost always because they moved behind a building, breaking your line of sight — not because they outran you.
- Green line = suspect path. Your path is colored by state (purple=patrol, red=pursuing, orange=searching). Numbered circles mark key moments. Green squares = extraction points.
- Cyan/teal lines = your allies' paths (labeled with their names at start positions). Use these to spot coverage gaps — areas where nobody was watching.

YOUR SENSING LIMITS — this is critical:
- You have a FORWARD CONE of vision: ${config.losRange} tiles range, 60° half-angle from your facing direction. You CANNOT see behind you or to your sides.
- Your facing direction is determined by your movement. Use me.getFacing() to check it.
- You are SLOWER than the suspect. You cannot simply chase them down — you must predict, cut off, or trap.
- Extraction points are randomized each chase and placed on the map edges. The suspect wins by reaching one.
- You cannot expand or improve your sensing range. Work within these limits by choosing patrol routes and facing directions strategically.

${isFirstChase
    ? `This was your first chase. Your default handlers are basic — move toward on sight, go to last known on lost, random patrol otherwise. There's a LOT of room to improve.`
    : `You've now completed ${chaseCount} chases. Review what changed since last time and whether your modifications helped.`
}

Now do the following, in order:

1. **Review**: What worked? What failed? What did the suspect do that surprised you?

2. **Call update_signal_handlers**: Rewrite your onSignal function RIGHT NOW with specific improvements based on what you learned. ${isFirstChase
    ? 'Your current handlers are naive — at minimum, add smarter search behavior when you lose the suspect instead of just walking to their last position.'
    : 'Build on your previous changes. Don\'t regress — keep what worked, fix what didn\'t.'}

   Your handler receives these signals (priority order — only one fires per tick):
   - 'player_spotted': {player_position, own_position, map_state} — you can see the suspect (highest priority)
   - 'player_lost': {last_known_position, own_position, map_state} — just lost visual
   - 'ally_signal': {ally_id, signal_type, signal_data, own_position, map_state} — radio from another officer (fires instead of tick when radio arrives)
   - 'tick': {own_position, state, tick, map_state} — fires every game tick when nothing else is happening

   All positions in signal data and tool results are in tile-center coords (center-origin, tile units).
   data.map_state = {halfWidth, halfHeight} — map half-extents in tiles.

   Available me.callTool() actions: ${[
     'move_toward({target})',
     'check_line_of_sight({target})',
     'patrol_next()',
     'hold_position()',
     'broadcast({signalType, data})',
     'ally_positions()',
     'distance_to({target})',
   ].join(', ')}

   RADIO COMMUNICATION:
   - You can call me.callTool('broadcast', {signalType: 'player_spotted', data: {position: {x, y}}}) during ANY signal handler to radio all allies.
   - Your allies receive your broadcast as an 'ally_signal' with {ally_id, signal_type, signal_data}.
   - Broadcasts are delivered on the NEXT tick (one-tick radio delay). Direct observation always takes priority — if an ally already sees the suspect, they won't process your radio.
   - Use radio to coordinate: share sightings, call for backup at chokepoints, warn allies about suspect direction.
   - Your 'ally_signal' handler case decides how you respond to radio. MAKE SURE it produces a movement action — if it doesn't call me.callTool() with a move, you'll stand still that tick.

3. **Call update_memory**: Record what you learned. Focus on patterns — "the suspect tends to..." not raw tick data.

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

export interface TurnUpdate {
  actantId: string;
  turnNum: number;
  newText: string;
  toolCalls: Array<{
    name: string;
    input: Record<string, unknown>;
    result: { success: boolean; data?: unknown; error?: string };
  }>;
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
  config: GameConfig = DEFAULT_CONFIG,
  model: string = 'claude-sonnet-4-6',
  onTurnUpdate?: (update: TurnUpdate) => void,
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
    const userPrompt = buildReflectionPrompt(summary, soma.chaseHistory.length, config);

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

      // Process the response — collect per-turn data for live UI
      const toolResults: AnthropicContentBlock[] = [];
      let hasToolUse = false;
      let turnText = '';
      const turnToolCalls: TurnUpdate['toolCalls'] = [];

      for (const block of response.content) {
        if (block.type === 'text' && block.text) {
          result.reasoning += block.text + '\n';
          turnText += block.text + '\n';
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
          turnToolCalls.push({
            name: block.name,
            input: block.input,
            result: toolResult,
          });
        }
      }

      // Fire per-turn callback for live UI
      if (onTurnUpdate) {
        onTurnUpdate({
          actantId: soma.id,
          turnNum: turns,
          newText: turnText,
          toolCalls: turnToolCalls,
        });
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

// ── Post-Reflection Summary ──

/**
 * Quick haiku call to produce a concise debrief summary for the player.
 * Replaces verbose multi-turn reasoning with 2-3 punchy bullet points.
 */
async function summarizeReflection(
  soma: Soma,
  reasoning: string,
  result: ReflectionResult,
  apiEndpoint: string,
): Promise<string> {
  try {
    const changes = [
      result.handlersUpdated ? 'Updated their chase behavior code' : null,
      result.memoryUpdated ? 'Updated their memory' : null,
    ].filter(Boolean).join('. ');

    const response = await callAnthropicAPI(apiEndpoint, {
      model: 'claude-haiku-4-5-20251001',
      system: 'Write concise tactical debrief summaries for police officers in a chase game. No preamble, just bullet points starting with a dash. 2-3 bullets max. Be specific about tactics, not vague.',
      messages: [{
        role: 'user',
        content: `Summarize this officer's reflection in 2-3 short bullet points. What did they learn? What did they change?\n\nOfficer: ${soma.name}\nChanges: ${changes || 'None'}\n\nReflection:\n${reasoning.slice(0, 3000)}`,
      }],
      max_tokens: 256,
    });

    if (response?.content?.[0]?.type === 'text') {
      return response.content[0].text || '';
    }
  } catch (err) {
    console.log(JSON.stringify({ _hp: 'summary_error', actantId: soma.id, error: String(err) }));
  }
  return '';
}

/**
 * Quick haiku call to summarize what an officer learned from the debrief sharing pass.
 */
async function summarizeDebriefSharing(
  soma: Soma,
  debriefResult: { handlersUpdated: boolean; memoryUpdated: boolean; reasoning: string },
  apiEndpoint: string,
): Promise<string> {
  try {
    const changes = [
      debriefResult.handlersUpdated ? 'Updated their handler code based on ally intel' : null,
      debriefResult.memoryUpdated ? 'Updated their memory with ally observations' : null,
    ].filter(Boolean).join('. ');

    const response = await callAnthropicAPI(apiEndpoint, {
      model: 'claude-haiku-4-5-20251001',
      system: 'Write concise summaries of what a police officer learned from reviewing ally intelligence after a chase. No preamble, just bullet points starting with a dash. 1-2 bullets max. Focus on what they adopted from allies.',
      messages: [{
        role: 'user',
        content: `Summarize what this officer learned from their allies in 1-2 short bullet points.\n\nOfficer: ${soma.name}\nChanges: ${changes || 'No changes made'}\n\nTheir reasoning:\n${debriefResult.reasoning.slice(0, 2000)}`,
      }],
      max_tokens: 192,
    });

    if (response?.content?.[0]?.type === 'text') {
      return response.content[0].text || '';
    }
  } catch (err) {
    console.log(JSON.stringify({ _hp: 'debrief_summary_error', actantId: soma.id, error: String(err) }));
  }
  return '';
}

// ── Handler Behavior Summary ──

/**
 * Haiku call to produce a plain-English summary of what an officer's
 * signal handler code does for each signal type.
 * Returns a short bullet list the player can scan without reading JS.
 */
export async function summarizeHandlerBehavior(
  soma: Soma,
  apiEndpoint: string,
): Promise<string> {
  try {
    const response = await callAnthropicAPI(apiEndpoint, {
      model: 'claude-haiku-4-5-20251001',
      system: 'You summarize JavaScript signal handler code for a police chase game. Output a short bullet list (one dash-prefixed line per signal type) describing what the code does in plain English. Be specific about tactics (e.g. "moves to intercept point ahead of suspect" not "responds to sighting"). Pay special attention to radio communication — how the officer uses broadcast() to share intel, and how they respond to ally_signal messages (e.g. moving toward reported positions, relaying sightings, coordinating pincer moves). Skip signal types that are trivial/empty. No preamble, just the bullets.',
      messages: [{
        role: 'user',
        content: `Summarize this officer's chase behavior in plain English. Pay attention to how they use radio (broadcast/ally_signal) to coordinate with teammates.\n\nSignal handlers:\n\`\`\`javascript\n${soma.signalHandlers}\n\`\`\`${soma.memory ? `\n\nOfficer memory:\n${soma.memory.slice(0, 500)}` : ''}`,
      }],
      max_tokens: 512,
    });

    if (response?.content?.[0]?.type === 'text') {
      return response.content[0].text || '';
    }
  } catch (err) {
    console.log(JSON.stringify({ _hp: 'handler_summary_error', actantId: soma.id, error: String(err) }));
  }
  return '';
}

/**
 * Haiku call to produce an overall squad tactical assessment —
 * how the team coordinates, gaps in coverage, emergent strategies.
 */
export async function summarizeSquadOverview(
  somas: Soma[],
  apiEndpoint: string,
): Promise<string> {
  try {
    const officerBlocks = somas.map(s => {
      const memSnip = s.memory ? `\nMemory: ${s.memory.slice(0, 300)}` : '';
      return `### ${s.name} (${s.badgeNumber})\nNature: ${s.nature}\nChases: ${s.chaseHistory.length}${memSnip}\n\`\`\`javascript\n${s.signalHandlers.slice(0, 1500)}\n\`\`\``;
    }).join('\n\n');

    const response = await callAnthropicAPI(apiEndpoint, {
      model: 'claude-haiku-4-5-20251001',
      system: 'You are analyzing the full squad of AI police officers in a chase game. Give an overall tactical assessment: how they work as a team, how they use radio to coordinate, any coverage gaps or redundancies, and emergent strategies. Be specific — reference officers by name. Use markdown with short sections. No preamble.',
      messages: [{
        role: 'user',
        content: `Give an overall squad assessment for these 4 officers.\n\n${officerBlocks}`,
      }],
      max_tokens: 1536,
    });

    if (response?.content?.[0]?.type === 'text') {
      return response.content[0].text || '';
    }
  } catch (err) {
    console.log(JSON.stringify({ _hp: 'squad_overview_error', error: String(err) }));
  }
  return '';
}

/**
 * Haiku call to summarize what changed across the squad after the latest wave —
 * what each officer learned, adapted, or adopted from allies.
 */
export async function summarizeWaveChanges(
  somas: Soma[],
  results: ReflectionResult[],
  debriefResults: { handlersUpdated: boolean; memoryUpdated: boolean; reasoning: string }[],
  apiEndpoint: string,
): Promise<string> {
  try {
    const officerBlocks = somas.map((s, i) => {
      const r = results[i];
      const dr = debriefResults[i];
      const changes = [
        r?.handlersUpdated ? 'Updated handlers' : null,
        r?.memoryUpdated ? 'Updated memory' : null,
        dr?.handlersUpdated ? 'Adopted ally tactics' : null,
        dr?.memoryUpdated ? 'Noted ally intel' : null,
      ].filter(Boolean).join(', ') || 'No changes';

      const reasoning = (r?.reasoning || '').slice(0, 1000);
      const debriefReasoning = (dr?.reasoning || '').slice(0, 600);

      return `### ${s.name}\nChanges: ${changes}\n\nReflection reasoning:\n${reasoning}${debriefReasoning ? `\n\nDebrief reasoning:\n${debriefReasoning}` : ''}`;
    }).join('\n\n');

    const response = await callAnthropicAPI(apiEndpoint, {
      model: 'claude-haiku-4-5-20251001',
      system: 'You are summarizing what changed across a squad of AI police officers after their latest chase and debrief. DO NOT break down by individual officer — the reader can check each officer separately. Instead, synthesize cross-squad themes: tactical shifts the group made together, ideas that spread from one officer to others, new strategies or discoveries that emerged, changes in coordination or radio usage, and any interesting patterns in how they adapted. Think of it as a changelog for the squad as a whole. Use markdown with short thematic sections. No preamble.',
      messages: [{
        role: 'user',
        content: `Summarize what changed across the squad after this wave.\n\n${officerBlocks}`,
      }],
      max_tokens: 1536,
    });

    if (response?.content?.[0]?.type === 'text') {
      return response.content[0].text || '';
    }
  } catch (err) {
    console.log(JSON.stringify({ _hp: 'wave_changes_error', error: String(err) }));
  }
  return '';
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

const MAX_HANDLER_CODE_LENGTH = 50000; // chars — very permissive for now, tighten later if needed

function validateHandlerCode(code: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Code length limit
  if (code.length > MAX_HANDLER_CODE_LENGTH) {
    errors.push(`Handler code is ${code.length} chars, max is ${MAX_HANDLER_CODE_LENGTH}. Write more concise code.`);
  }

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
    tools?: typeof SCAFFOLD_TOOLS;
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

// ── Debrief Sharing ──

/**
 * Build the shared intel context for a single officer from all allies' reflections.
 */
function buildDebriefContext(soma: Soma, allSomas: Soma[], results: ReflectionResult[]): string {
  const allyIntel: string[] = [];

  for (const allySoma of allSomas) {
    if (allySoma.id === soma.id) continue;
    const allyResult = results.find(r => r.actantId === allySoma.id);
    if (!allyResult || !allyResult.success) continue;

    const handlerPreview = allySoma.signalHandlers.length > 800
      ? allySoma.signalHandlers.slice(0, 800) + '\n// ... (truncated)'
      : allySoma.signalHandlers;

    allyIntel.push(`<ally name="${allySoma.name}">
Observations:
${allyResult.reasoning.slice(0, 1500)}

Their current handler code:
\`\`\`javascript
${handlerPreview}
\`\`\`

Their memory:
${allySoma.memory.slice(0, 500)}
</ally>`);
  }

  return allyIntel.join('\n\n');
}

/**
 * Run a second mini-reflection pass for debrief sharing.
 * Each officer receives allies' observations + handler code and can update their own.
 */
async function runDebriefSharing(
  soma: Soma,
  allSomas: Soma[],
  results: ReflectionResult[],
  apiEndpoint: string,
  model: string = 'claude-sonnet-4-6',
): Promise<{ handlersUpdated: boolean; memoryUpdated: boolean; reasoning: string }> {
  const allyContext = buildDebriefContext(soma, allSomas, results);
  if (!allyContext.trim()) return { handlersUpdated: false, memoryUpdated: false, reasoning: '' };

  const systemPrompt = `You are Officer ${soma.name}, badge ${soma.badgeNumber}, reviewing shared intelligence from your allies.

<identity>
${soma.nature}
</identity>

<your_current_handlers>
\`\`\`javascript
${soma.signalHandlers}
\`\`\`
</your_current_handlers>

<your_memory>
${soma.memory}
</your_memory>

You have tools to update your signal handlers and memory. Only use them if you see something genuinely useful in your allies' intel — don't change things just to change them.`;

  const userPrompt = `Your allies shared their observations and tactics after the chase:

${allyContext}

Review their intel. If any ally discovered a useful tactic or pattern you haven't considered:
1. **Call update_signal_handlers** to incorporate it (keep your own working tactics, merge in what's useful)
2. **Call update_memory** to note what you learned from allies

If their intel doesn't add anything new for you, that's fine — don't change things that are already working. But pay attention to:
- Ally handler patterns that could improve your ally_signal response
- Coordination ideas (radio protocols, zone assignments)
- Patterns about the suspect you missed`;

  // Only need handlers + memory tools for debrief pass
  const debriefTools = SCAFFOLD_TOOLS.filter(t => t.name !== 'query_replay');

  const result = { handlersUpdated: false, memoryUpdated: false, reasoning: '' };

  try {
    let messages: AnthropicMessage[] = [{ role: 'user', content: userPrompt }];
    let turns = 0;
    const maxTurns = 2;

    while (turns < maxTurns) {
      turns++;
      const response = await callAnthropicAPI(apiEndpoint, {
        model,
        system: systemPrompt,
        messages,
        tools: debriefTools,
        max_tokens: 2048,
      });

      if (!response) break;

      const toolResults: AnthropicContentBlock[] = [];
      let hasToolUse = false;

      // Dummy ReflectionResult for processToolCall
      const dummyResult: ReflectionResult = {
        actantId: soma.id, success: true,
        handlersUpdated: false, memoryUpdated: false,
        toolsAdopted: [], reasoning: '',
      };

      for (const block of response.content) {
        if (block.type === 'text' && block.text) {
          result.reasoning += block.text + '\n';
        }
        if (block.type === 'tool_use' && block.name && block.input) {
          hasToolUse = true;
          const toolResult = processToolCall(block.name, block.input, soma, null as any, dummyResult);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(toolResult),
          });
          if (block.name === 'update_signal_handlers' && toolResult.success) result.handlersUpdated = true;
          if (block.name === 'update_memory' && toolResult.success) result.memoryUpdated = true;
        }
      }

      if (!hasToolUse || response.stop_reason === 'end_turn') break;

      messages = [
        ...messages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults },
      ];
    }

    console.log(JSON.stringify({
      _hp: 'debrief_share_complete',
      actantId: soma.id,
      name: soma.name,
      handlersUpdated: result.handlersUpdated,
      memoryUpdated: result.memoryUpdated,
    }));

  } catch (err) {
    console.log(JSON.stringify({
      _hp: 'debrief_share_error',
      actantId: soma.id,
      error: String(err),
    }));
  }

  if (result.handlersUpdated) clearHandlerCache();
  return result;
}

// ── Batch Reflection ──

/**
 * Run reflection for all actants in parallel, then debrief sharing.
 * Fires onTurnUpdate after each API turn for live UI updates.
 */
export async function reflectAllActants(
  somas: Soma[],
  replay: ChaseReplay,
  apiEndpoint: string,
  mapInfo: MapInfo,
  config: GameConfig = DEFAULT_CONFIG,
  model?: string,
  onProgress?: (actantId: string, status: string, chaseMapBase64?: string) => void,
  onTurnUpdate?: (update: TurnUpdate) => void,
  onSummary?: (actantId: string, summary: string, fullReasoning: string) => void,
  onDebriefSummary?: (actantId: string, summary: string, fullReasoning: string) => void,
): Promise<{ results: ReflectionResult[]; debriefResults: { handlersUpdated: boolean; memoryUpdated: boolean; reasoning: string }[] }> {
  // Phase 1: Individual reflection (parallel)
  const promises = somas.map(async (soma) => {
    // Generate this officer's chase map before reflecting
    const summary = summarizeReplayForActant(replay, soma);

    // Build ally paths — other officers' simplified paths
    const allyPaths: AllyPath[] = somas
      .filter(s => s.id !== soma.id)
      .map(allySoma => {
        const rawPath = replay.actantPaths[allySoma.id] || [];
        return {
          name: allySoma.name,
          waypoints: rawPath
            .filter((_, i) => i % 10 === 0)
            .map(p => ({ tick: p.tick, pos: p.pos, state: p.state })),
        };
      });

    const chaseMapBase64 = renderChaseMap(
      mapInfo.tiles, mapInfo.cols, mapInfo.rows,
      summary.playerWaypoints, summary.officerWaypoints,
      summary.keyMoments, mapInfo.tileSize, allyPaths,
    );

    if (onProgress) onProgress(soma.id, 'reflecting', chaseMapBase64);

    const result = await reflectActant(soma, replay, apiEndpoint, chaseMapBase64, config, model, onTurnUpdate);

    if (onProgress) onProgress(soma.id, result.success ? 'complete' : 'failed');

    // Generate concise summary for player-facing debrief card
    if (result.success && onSummary) {
      const debrief = await summarizeReflection(soma, result.reasoning, result, apiEndpoint);
      onSummary(soma.id, debrief, result.reasoning);
    }

    return result;
  });

  const results = await Promise.all(promises);

  // Phase 2: Debrief sharing — officers exchange observations and tactics
  console.log(JSON.stringify({ _hp: 'debrief_share_start', officerCount: somas.length }));

  if (onProgress) {
    for (const soma of somas) onProgress(soma.id, 'sharing');
  }

  const debriefPromises = somas.map(soma =>
    runDebriefSharing(soma, somas, results, apiEndpoint, model)
  );
  const debriefResults = await Promise.all(debriefPromises);

  // Summarize debrief results in parallel
  const summaryPromises = somas.map(async (soma, i) => {
    const dr = debriefResults[i];
    const callback = onDebriefSummary || onSummary;
    if ((dr.handlersUpdated || dr.memoryUpdated) && dr.reasoning.trim() && callback) {
      const summary = await summarizeDebriefSharing(soma, dr, apiEndpoint);
      if (summary) {
        callback(soma.id, summary, dr.reasoning);
      }
    }
    if (onProgress) onProgress(soma.id, 'complete');
  });
  await Promise.all(summaryPromises);

  console.log(JSON.stringify({
    _hp: 'debrief_share_all_complete',
    updates: debriefResults.map((dr, i) => ({
      officer: somas[i].name,
      handlersUpdated: dr.handlersUpdated,
      memoryUpdated: dr.memoryUpdated,
    })),
  }));

  return { results, debriefResults };
}

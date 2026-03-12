// ── Reflection System ──
// After each run, the driver reviews what happened and updates their soma.
// Single actant (the driver), with boss radio transcript as key input.
// Uses claude-sonnet-4-6 for reflection. No separate summary call.

import { DriverSoma, RunRecording, Position } from './types';
import { clearCompileCache } from './soma';
import { CONFIG } from './config';

// ── Types ──

export interface ReflectionResult {
  success: boolean;
  onTickUpdated: boolean;
  memoryUpdated: boolean;
  identityUpdated: boolean;
  reasoning: string;
  changeSummary: string;
  tokenUsage?: { input: number; output: number };
  error?: string;
}

export interface TurnUpdate {
  turnNum: number;
  newText: string;
  toolCalls: Array<{
    name: string;
    input: Record<string, unknown>;
    result: { success: boolean; error?: string };
  }>;
}

// ── Anthropic API Types ──

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

// ── Scaffold Tool Definitions ──

const SCAFFOLD_TOOLS = [
  {
    name: 'edit_on_tick',
    description: 'Rewrite your driving code. This is the code that runs every frame to control steering, acceleration, and braking. It receives (me, world) — me has your controls (steer, accelerate, brake), position, speed, angle, and memory. world has the objective, radio transcript, terrain, pursuers, and distance/angle helpers.',
    input_schema: {
      type: 'object' as const,
      properties: {
        code: {
          type: 'string',
          description: 'The complete async function onTick(me, world) { ... } including the function declaration.',
        },
        reasoning: {
          type: 'string',
          description: 'Brief explanation of what you changed and why.',
        },
      },
      required: ['code', 'reasoning'],
    },
  },
  {
    name: 'edit_memory',
    description: 'Update what you remember across runs. Your memory persists. Keep it focused on patterns, lessons, and terrain knowledge — not raw data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string',
          description: 'Your updated memory. This replaces your current memory entirely.',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'edit_identity',
    description: 'Update your identity — who you are, how you think about driving. Use sparingly. This shapes your overall approach.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string',
          description: 'Your updated identity text.',
        },
      },
      required: ['content'],
    },
  },
];

// ── Forbidden Patterns ──

const FORBIDDEN_PATTERNS = [
  { pattern: /\beval\s*\(/, msg: 'eval() is not allowed' },
  { pattern: /\bFunction\s*\(/, msg: 'Function constructor is not allowed' },
  { pattern: /\bimport\s*\(/, msg: 'Dynamic import is not allowed' },
  { pattern: /\bfetch\s*\(/, msg: 'fetch() is not allowed in driving code' },
  { pattern: /\bXMLHttpRequest\b/, msg: 'XMLHttpRequest is not allowed' },
  { pattern: /\bwindow\b/, msg: 'window access is not allowed' },
  { pattern: /\bdocument\b/, msg: 'document access is not allowed' },
  { pattern: /\bglobalThis\b/, msg: 'globalThis access is not allowed' },
];

// ── Prompt Construction ──

function buildSystemPrompt(soma: DriverSoma): string {
  return `You are a wheelman — a driver for hire in the open desert. The boss watches you through a drone camera and talks to you on the radio. Your job: get the car to the objective. Every run, you learn.

<identity>
${soma.identity}
</identity>

<on_tick>
This is the code that controls your driving. It runs every single frame. It receives (me, world).
\`\`\`javascript
${soma.on_tick}
\`\`\`
</on_tick>

<memory>
${soma.memory || '(empty — no memories yet)'}
</memory>

<run_history>
${soma.runHistory.length === 0
    ? 'No previous runs.'
    : soma.runHistory.map(h =>
        `Run ${h.runId}: ${h.outcome} (${Math.round(h.durationSeconds)}s, ${Math.round(h.distanceCovered)}px traveled${h.reachedObjective ? ', REACHED OBJECTIVE' : ''})`
      ).join('\n')
}
</run_history>

YOUR DRIVING API — what you can use in on_tick(me, world):

me.position = {x, y}        — your world position
me.speed                     — current speed (px/s, max ~220)
me.angle                     — facing direction (radians, 0 = right)
me.steer(dir)                — turn the wheel: -1 (left) to 1 (right)
me.accelerate(amount)        — gas pedal: 0 to 1
me.brake(amount)             — brake pedal: 0 to 1
me.memory.read()             — read your memory string
me.memory.write(text)        — overwrite memory (use sparingly, not every tick)
me.identity.read()           — read your identity
me.on_tick.read()            — read your own driving code

world.objective              — {direction: "north"/"southeast"/etc, distance: "far"/"medium"/"close"/"very close"/"right here", type: string} or null
                               NOTE: You do NOT get exact coordinates. You only know the general compass direction and rough distance.
                               The boss can see the objective on the drone feed — listen to the radio for precise guidance!
world.radio                  — boss radio transcript (string, all speech so far)
world.pursuers               — array of {position, speed, angle} for any pursuers
world.terrain(x, y)          — terrain slowdown at position (1.0 = clear, 0.15 = water)
world.distanceTo(pos)        — distance from you to a position
world.angleTo(pos)           — angle from you to a position
world.mapBounds              — {width, height} of the desert
world.sensorRange            — how far you can "see" (${CONFIG.VEHICLE.SENSOR_RANGE}px)

TERRAIN: The desert has sand (1.0, normal), textured sand (0.4, rough), water oases (0.15, very slow), roads (0.9, fast), and rocks (solid obstacles that bounce you). Plan your route.

During this reflection, you have three tools:
- edit_on_tick: Rewrite your driving code. This is the most important tool.
- edit_memory: Update what you remember.
- edit_identity: Update who you are (rare).

IMPORTANT: Thinking about improvements without calling the tools changes nothing. You MUST call edit_on_tick to actually change your driving. Your written analysis means nothing if you don't call the tools.`;
}

function buildUserPrompt(recording: RunRecording): string {
  const radioBlock = recording.radioTranscript.length > 0
    ? recording.radioTranscript.map(r => `  [${r.time.toFixed(1)}s] Boss: "${r.text}"`).join('\n')
    : '  (no radio communication)';

  const eventsBlock = recording.events.length > 0
    ? recording.events.map((e, i) =>
        `  ${i + 1}. [tick ${e.tick}] ${e.description}${e.pos ? ` at (${Math.round(e.pos.x)}, ${Math.round(e.pos.y)})` : ''}`
      ).join('\n')
    : '  (no notable events)';

  return `The run is over. Here's what happened.

<run_summary>
Outcome: ${recording.outcome.toUpperCase()}
Duration: ${recording.durationSeconds.toFixed(1)}s (max ${CONFIG.RUN.MAX_DURATION}s)
Distance covered: ${Math.round(recording.distanceCovered)}px
Distance to objective at end: ${Math.round(recording.objectiveDistance)}px
Path waypoints: ${recording.driverPath.length}
</run_summary>

<events>
${eventsBlock}
</events>

<boss_radio_transcript>
${radioBlock}
</boss_radio_transcript>

The attached image is a bird's-eye view of your run. Green line = your path. Gold diamond = objective. Green circle = start. Red/gold circle = end.

Now reflect on this run. What worked? What failed? What did the boss tell you?

1. **Review**: Look at the map, the path you took, and the boss's radio messages. Did you listen to the boss? Did your route make sense?

2. **Call edit_on_tick**: Rewrite your driving code RIGHT NOW with specific improvements. Your current code is what actually runs — if you don't call edit_on_tick, nothing changes.
   - REMEMBER: You only get a compass direction and rough distance to the objective — NOT exact coordinates. You must navigate by feel and by listening to the boss.
   - Think about: obstacle avoidance, route planning, speed control, responding to boss radio commands, terrain awareness
   - The boss's radio messages are in world.radio — use them! The boss can see the objective on the drone. If the boss says "go left" or "watch out", your code should respond.
   - Parse the radio for directional cues! The boss is your GPS.

3. **Call edit_memory**: Record what you learned. Focus on patterns — terrain layout, boss communication style, what driving strategies work.

DO NOT just describe what you would change. CALL THE TOOLS.`;
}

// ── Code Validation ──

function validateOnTickCode(code: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (code.length > 30000) {
    errors.push(`Code is ${code.length} chars, max is 30000.`);
  }

  if (!code.includes('onTick')) {
    errors.push('Must contain an onTick function.');
  }

  if (!code.match(/(?:async\s+)?function\s+onTick\s*\(\s*me\s*,\s*world\s*\)/)) {
    errors.push('onTick must accept (me, world) parameters.');
  }

  for (const { pattern, msg } of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      errors.push(msg);
    }
  }

  // Syntax check via compilation
  try {
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    new AsyncFunction('me', 'world', `${code}\nreturn onTick(me, world);`);
  } catch (err) {
    errors.push(`Syntax error: ${String(err)}`);
  }

  return { valid: errors.length === 0, errors };
}

// ── Tool Call Processing ──

function processToolCall(
  toolName: string,
  input: Record<string, unknown>,
  soma: DriverSoma,
  result: ReflectionResult,
): { success: boolean; error?: string } {
  switch (toolName) {
    case 'edit_on_tick': {
      const code = input.code as string;
      const reasoning = input.reasoning as string;

      if (!code) {
        return { success: false, error: 'code is required' };
      }

      const validation = validateOnTickCode(code);
      if (!validation.valid) {
        console.log(JSON.stringify({
          _wm: 'ontick_validation_failed',
          errors: validation.errors,
          code: code.slice(0, 300),
        }));
        return {
          success: false,
          error: `Validation failed: ${validation.errors.join(', ')}. Fix and try again.`,
        };
      }

      soma.on_tick = code;
      result.onTickUpdated = true;

      console.log(JSON.stringify({
        _wm: 'ontick_updated',
        reasoning,
        codeLength: code.length,
        codePreview: code.slice(0, 200),
      }));

      return { success: true };
    }

    case 'edit_memory': {
      const content = input.content as string;
      if (!content) {
        return { success: false, error: 'content is required' };
      }

      soma.memory = content;
      result.memoryUpdated = true;

      console.log(JSON.stringify({
        _wm: 'memory_updated',
        memoryLength: content.length,
        memoryPreview: content.slice(0, 200),
      }));

      return { success: true };
    }

    case 'edit_identity': {
      const content = input.content as string;
      if (!content) {
        return { success: false, error: 'content is required' };
      }

      soma.identity = content;
      result.identityUpdated = true;

      console.log(JSON.stringify({
        _wm: 'identity_updated',
        identityLength: content.length,
      }));

      return { success: true };
    }

    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

// ── API Call Helper ──

async function callAPI(body: {
  model: string;
  system: string;
  messages: AnthropicMessage[];
  tools?: typeof SCAFFOLD_TOOLS;
  max_tokens: number;
}): Promise<AnthropicResponse | null> {
  try {
    const response = await fetch(CONFIG.API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.log(JSON.stringify({
        _wm: 'api_error',
        status: response.status,
        error: errText.slice(0, 500),
      }));
      return null;
    }

    return await response.json() as AnthropicResponse;
  } catch (err) {
    console.log(JSON.stringify({
      _wm: 'api_error',
      error: String(err),
    }));
    return null;
  }
}

// ── Reflection Execution ──

export async function reflectDriver(
  soma: DriverSoma,
  recording: RunRecording,
  chaseMapBase64: string,
  onTurnUpdate?: (update: TurnUpdate) => void,
): Promise<ReflectionResult> {
  const result: ReflectionResult = {
    success: false,
    onTickUpdated: false,
    memoryUpdated: false,
    identityUpdated: false,
    reasoning: '',
    changeSummary: '',
  };

  try {
    const systemPrompt = buildSystemPrompt(soma);
    const userPrompt = buildUserPrompt(recording);

    console.log(JSON.stringify({
      _wm: 'reflection_start',
      runHistory: soma.runHistory.length,
      recordingEvents: recording.events.length,
      radioLines: recording.radioTranscript.length,
    }));

    // Initial message — multimodal (image + text)
    let messages: AnthropicMessage[] = [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: chaseMapBase64,
            },
          },
          { type: 'text', text: userPrompt },
        ],
      },
    ];

    let totalInput = 0;
    let totalOutput = 0;
    let turns = 0;
    const maxTurns = 3;

    while (turns < maxTurns) {
      turns++;

      const response = await callAPI({
        model: 'claude-sonnet-4-6',
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

      // Process response
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
          const toolResult = processToolCall(block.name, block.input, soma, result);
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
          turnNum: turns,
          newText: turnText,
          toolCalls: turnToolCalls,
        });
      }

      // If no tool use or stop, we're done
      if (!hasToolUse || response.stop_reason === 'end_turn') {
        break;
      }

      // Continue conversation with tool results
      messages = [
        ...messages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults },
      ];
    }

    result.success = true;
    result.tokenUsage = { input: totalInput, output: totalOutput };

    // Clear compile cache so new code gets compiled next run
    if (result.onTickUpdated) {
      clearCompileCache();
    }

    // Simple inline summary — no extra API call
    const changes = [
      result.onTickUpdated ? 'Rewrote driving code' : null,
      result.memoryUpdated ? 'Updated memory' : null,
      result.identityUpdated ? 'Changed identity' : null,
    ].filter(Boolean);
    result.changeSummary = changes.length > 0
      ? changes.join('. ') + '.'
      : 'No changes made.';

    console.log(JSON.stringify({
      _wm: 'reflection_complete',
      onTickUpdated: result.onTickUpdated,
      memoryUpdated: result.memoryUpdated,
      identityUpdated: result.identityUpdated,
      turns,
      tokens: result.tokenUsage,
      onTickLength: soma.on_tick.length,
      summaryLength: result.changeSummary.length,
    }));

  } catch (err) {
    result.error = String(err);
    console.log(JSON.stringify({
      _wm: 'reflection_error',
      error: result.error,
    }));
  }

  return result;
}


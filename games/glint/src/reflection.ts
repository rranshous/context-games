// Reflection — async predator learning via Claude.
// After a failed hunt, the predator's instinct code is sent to Claude
// along with a hunt summary. Claude rewrites the instincts via scaffold tools.
// Runs in the background — no game pause.

import { PredatorSoma } from './soma.js';
import { HuntSummary } from './hunt-tracker.js';

// --- Scaffold tools ---

const SCAFFOLD_TOOLS = [
  {
    name: 'update_instinct',
    description: 'Rewrite your hunting instincts. This is the code that runs when you detect prey, lose it, or patrol between hunts. Write the complete onStimulus(type, data, me) function.',
    input_schema: {
      type: 'object' as const,
      properties: {
        instinct_code: {
          type: 'string',
          description: 'The complete async function onStimulus(type, data, me) { ... } function body.',
        },
        reasoning: {
          type: 'string',
          description: 'What you changed and why.',
        },
      },
      required: ['instinct_code', 'reasoning'],
    },
  },
  {
    name: 'update_memory',
    description: 'Update what you remember about this reef and its prey. Your memory persists across hunts. Keep it focused on spatial patterns and prey behavior.',
    input_schema: {
      type: 'object' as const,
      properties: {
        memory_content: {
          type: 'string',
          description: 'Your updated memory. Replaces current memory entirely.',
        },
      },
      required: ['memory_content'],
    },
  },
  {
    name: 'recall_hunt',
    description: 'Review the details of a specific past hunt.',
    input_schema: {
      type: 'object' as const,
      properties: {
        hunt_id: {
          type: 'number',
          description: 'The hunt number to recall.',
        },
      },
      required: ['hunt_id'],
    },
  },
];

// --- Prompt construction ---

function buildSystemPrompt(soma: PredatorSoma): string {
  return `You are a ${soma.species} in a coral reef. You hunt a small bioluminescent squid.

<nature>
${soma.nature}
</nature>

<current_instincts>
This is the code that controls your hunting behavior. When you detect prey, lose it, or patrol, this code runs.
\`\`\`javascript
${soma.instinctCode}
\`\`\`
</current_instincts>

<memory>
${soma.memory}
</memory>

<hunt_record>
${soma.huntHistory.length === 0
    ? 'No previous hunts.'
    : soma.huntHistory.map(h =>
        `Hunt #${h.huntId}: ${h.outcome} (${h.durationSeconds.toFixed(1)}s) closest: ${h.closestDistance.toFixed(1)}u${h.preyConcealed ? ` — prey hid in ${h.concealmentTile}` : ''}`
      ).join('\n')
}
</hunt_record>

<reef_knowledge>
The reef is a maze of coral walls, open water channels, kelp forests, narrow crevices, and dens.
- Walls block movement and line of sight
- Kelp: passable but prey can hide here (concealment — becomes invisible to sensors)
- Crevices: narrow passages — you CANNOT fit through (too big), but the squid can
- Dens: alcoves carved into walls — prey hides here, you cannot enter
- The squid conceals itself by going still on hiding tiles (kelp, crevice, den). When concealed, your sensors cannot detect it.
- You must catch the squid in open water or while it's moving through kelp.
</reef_knowledge>

<sensing>
Your sensors detect prey within 16 world units if line of sight is clear AND prey is not concealed.
- me.check_los(pos) — checks if you can see a position (walls block)
- me.nearby_tiles(type) — returns nearby tiles of a given type ('kelp', 'den', 'crevice', 'open') within sensor range, sorted by distance. Each has {x, z, dist}.
- me.distance_to(pos) — returns distance to a position
</sensing>

<movement>
Available in onStimulus(type, data, me):
- me.pursue(target) — chase speed, beeline toward target position {x, z}
- me.patrol_to(target) — patrol speed, move toward specific position {x, z}
- me.patrol_random() — pick a random open tile and patrol toward it (picks a new waypoint only if current one is null)
- me.hold() — stay still
- me.getLastKnown() / me.setLastKnown(pos) — last known prey position {x, z}
- me.getTimeSinceLost() — seconds since prey was last detected
- me.getPosition() — your current position {x, z}
- me.memory.read() / me.memory.write(s) — read/write your persistent memory string
</movement>

<stimuli>
Your onStimulus function receives one of three stimulus types:
- 'prey_detected' — you can see the prey right now. data.prey_position = {x, z}, data.prey_distance = number
- 'prey_lost' — you were pursuing (called me.pursue() last frame) but can no longer see the prey. data.last_known_position = {x, z}
- 'tick' — nothing detected and you weren't pursuing. data.time_since_lost = seconds since last detection
Only one stimulus fires per frame, in priority order: prey_detected > prey_lost > tick.
Note: 'prey_lost' only fires if you called me.pursue() on the previous frame. If you were patrolling and the prey disappears, you just get 'tick'.
</stimuli>

IMPORTANT: You MUST call update_instinct to change your behavior. Thinking about improvements without calling the tool changes nothing. Your instinct code is what actually runs during hunts.`;
}

function buildReflectionPrompt(summary: HuntSummary, huntCount: number): string {
  return `A hunt just failed. The prey escaped.

<hunt_replay>
${summary.textSummary}
</hunt_replay>

${huntCount <= 1
    ? 'This was your first failed hunt. Your default instincts are basic — chase on sight, go to last-known on loss, random patrol otherwise. Think about what you could do differently when the prey hides or breaks line of sight.'
    : `You have completed ${huntCount} hunts total. Review whether your previous changes helped. If your hunt duration or closest approach is improving, keep refining. If not, try a different approach.`
}

Reflect on this hunt:

1. **What happened?** Why did the prey escape? Did it hide? Where? Could you have predicted it?

2. **Call update_instinct**: Rewrite your onStimulus function with specific improvements. Ideas:
   - After losing prey, check nearby hiding tiles (me.nearby_tiles('kelp'), me.nearby_tiles('den')) instead of just going to last-known position
   - Use memory to track where prey hides repeatedly
   - Patrol routes that pass near known hiding spots instead of random waypoints
   - Search patterns (check nearby tiles systematically) instead of standing at last-known
   - Predict which direction the prey fled based on your approach angle

3. **Call update_memory**: Record spatial knowledge — where are the good hiding spots? Where does prey tend to go?

DO NOT just describe improvements. CALL THE TOOLS.`;
}

// --- Instinct validation ---

const MAX_INSTINCT_LENGTH = 10000;

function validateInstinctCode(code: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (code.length > MAX_INSTINCT_LENGTH) {
    errors.push(`Instinct code is ${code.length} chars, max is ${MAX_INSTINCT_LENGTH}`);
  }

  if (!code.includes('onStimulus')) {
    errors.push('Must contain an onStimulus function');
  }

  if (!code.match(/(?:async\s+)?function\s+onStimulus\s*\(\s*type\s*,\s*data\s*,\s*me\s*\)/)) {
    errors.push('onStimulus must accept (type, data, me) parameters');
  }

  const forbidden = [
    { pattern: /\beval\s*\(/, msg: 'eval() not allowed' },
    { pattern: /\bFunction\s*\(/, msg: 'Function constructor not allowed' },
    { pattern: /\bimport\s*\(/, msg: 'Dynamic import not allowed' },
    { pattern: /\bfetch\s*\(/, msg: 'fetch() not allowed' },
    { pattern: /\bwindow\b/, msg: 'window access not allowed' },
    { pattern: /\bdocument\b/, msg: 'document access not allowed' },
  ];

  for (const { pattern, msg } of forbidden) {
    if (pattern.test(code)) errors.push(msg);
  }

  // Syntax check
  try {
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    new AsyncFunction('type', 'data', 'me', `${code}\nreturn onStimulus(type, data, me);`);
  } catch (err) {
    errors.push(`Syntax error: ${String(err)}`);
  }

  return { valid: errors.length === 0, errors };
}

// --- Reflection result ---

export interface ReflectionResult {
  predatorId: string;
  success: boolean;
  instinctUpdated: boolean;
  memoryUpdated: boolean;
  reasoning: string;
  error?: string;
}

// --- Tool call processing ---

function processToolCall(
  toolName: string,
  input: Record<string, unknown>,
  soma: PredatorSoma,
  allHunts: HuntSummary[],
  result: ReflectionResult,
): { success: boolean; data?: unknown; error?: string } {
  switch (toolName) {
    case 'update_instinct': {
      const code = input.instinct_code as string;
      const reasoning = input.reasoning as string;

      if (!code) return { success: false, error: 'instinct_code is required' };

      const validation = validateInstinctCode(code);
      if (!validation.valid) {
        console.log(`[GLINT] Instinct validation failed for ${soma.id}: ${validation.errors.join(', ')}`);
        return {
          success: false,
          error: `Validation failed: ${validation.errors.join(', ')}. Fix and try again.`,
        };
      }

      soma.instinctCode = code;
      result.instinctUpdated = true;

      console.log(`[GLINT] Instinct updated for ${soma.id}: ${reasoning} (${code.length} chars)`);
      return {
        success: true,
        data: { message: 'Instincts updated. They will execute on the next hunt.' },
      };
    }

    case 'update_memory': {
      const content = input.memory_content as string;
      if (!content) return { success: false, error: 'memory_content is required' };

      soma.memory = content;
      result.memoryUpdated = true;

      console.log(`[GLINT] Memory updated for ${soma.id}: ${content.slice(0, 100)}`);
      return { success: true, data: { message: 'Memory updated.' } };
    }

    case 'recall_hunt': {
      const huntId = input.hunt_id as number;
      if (huntId === undefined) return { success: false, error: 'hunt_id is required' };

      const hunt = allHunts.find(h => h.huntId === huntId);
      if (!hunt) return { success: false, error: `Hunt #${huntId} not found.` };

      return { success: true, data: { summary: hunt.textSummary } };
    }

    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

// --- API call ---

interface APIMessage {
  role: string;
  content: unknown;
}

interface APIContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

async function callAPI(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<{ content: APIContentBlock[]; stop_reason: string } | null> {
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      console.log(`[GLINT] Reflection API error: ${resp.status} ${resp.statusText}`);
      return null;
    }
    return await resp.json();
  } catch (err) {
    console.log(`[GLINT] Reflection API fetch error: ${err}`);
    return null;
  }
}

// --- Main reflection function ---

const REFLECTION_MAX_TURNS = 3;

export async function reflectPredator(
  soma: PredatorSoma,
  huntSummary: HuntSummary,
  allHunts: HuntSummary[],
  apiEndpoint: string,
): Promise<ReflectionResult> {
  soma.reflectionPending = true;

  const result: ReflectionResult = {
    predatorId: soma.id,
    success: false,
    instinctUpdated: false,
    memoryUpdated: false,
    reasoning: '',
  };

  try {
    const systemPrompt = buildSystemPrompt(soma);
    const userPrompt = buildReflectionPrompt(huntSummary, soma.huntHistory.length);

    let messages: APIMessage[] = [
      { role: 'user', content: userPrompt },
    ];

    let turns = 0;

    while (turns < REFLECTION_MAX_TURNS) {
      turns++;

      const response = await callAPI(apiEndpoint, {
        model: 'claude-haiku-4-5-20251001',
        system: systemPrompt,
        messages,
        tools: SCAFFOLD_TOOLS,
        max_tokens: 2048,
      });

      if (!response) {
        result.error = 'API call failed';
        break;
      }

      // Process response blocks
      const toolResults: unknown[] = [];
      let hasToolUse = false;

      for (const block of response.content) {
        if (block.type === 'text' && block.text) {
          result.reasoning += block.text + '\n';
        }

        if (block.type === 'tool_use' && block.name && block.input) {
          hasToolUse = true;
          const toolResult = processToolCall(block.name, block.input, soma, allHunts, result);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(toolResult),
          });
        }
      }

      // If no tools called or stop_reason indicates done, we're finished
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
  } catch (err) {
    result.error = String(err);
    console.log(`[GLINT] Reflection error for ${soma.id}: ${err}`);
  } finally {
    soma.reflectionPending = false;
  }

  return result;
}

// --- Reflection trigger logic ---

const REFLECTION_COOLDOWN = 60; // seconds between reflections per predator
const MIN_HUNT_DURATION = 2;    // don't reflect on trivial detections

export function shouldReflect(
  soma: PredatorSoma,
  summary: HuntSummary,
  gameTime: number,
): boolean {
  if (soma.reflectionPending) return false;
  if (soma.lastReflectionTime > 0 && gameTime - soma.lastReflectionTime < REFLECTION_COOLDOWN) return false;
  if (summary.durationSeconds < MIN_HUNT_DURATION) return false;
  return true;
}

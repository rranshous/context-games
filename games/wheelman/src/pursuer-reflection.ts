// ── Pursuer Reflection System ──
// After each run, each pursuer reflects on the chase using sonnet.
// Then a debrief phase where pursuers share intel.
// Finally, haiku generates plain-English summaries for each.

import { PursuerSoma, RunRecording } from './types';
import { clearPursuerCompileCache } from './pursuer';
import { CONFIG } from './config';

// ── Types ──

export interface PursuerReflectionResult {
  pursuerId: string;
  pursuerName: string;
  success: boolean;
  onTickUpdated: boolean;
  memoryUpdated: boolean;
  identityUpdated: boolean;
  reasoning: string;
  changeSummary: string; // haiku-generated plain English
  debriefSummary: string; // what they adopted from allies
  tokenUsage?: { input: number; output: number };
  error?: string;
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

// ── Scaffold Tools ──

const SCAFFOLD_TOOLS = [
  {
    name: 'edit_on_tick',
    description: 'Rewrite your signal handler code. This is the function that runs every frame. It receives (type, data, me) where type is the signal ("driver_spotted", "driver_lost", "ally_signal", "tick") and data contains signal-specific info. me gives you controls (steer, accelerate, brake), position, speed, angle, memory, and broadcast().',
    input_schema: {
      type: 'object' as const,
      properties: {
        code: {
          type: 'string',
          description: 'The complete async function onSignal(type, data, me) { ... } including the function declaration.',
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
    description: 'Update what you remember across chases. Focus on driver patterns, terrain knowledge, coordination tactics.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string',
          description: 'Your updated memory. Replaces current memory entirely.',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'edit_identity',
    description: 'Update your identity — who you are and how you approach pursuit. Use sparingly.',
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
  { pattern: /\bfetch\s*\(/, msg: 'fetch() is not allowed' },
  { pattern: /\bXMLHttpRequest\b/, msg: 'XMLHttpRequest is not allowed' },
  { pattern: /\bwindow\b/, msg: 'window access is not allowed' },
  { pattern: /\bdocument\b/, msg: 'document access is not allowed' },
  { pattern: /\bglobalThis\b/, msg: 'globalThis access is not allowed' },
];

// ── Validation ──

function validateOnTickCode(code: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (code.length > 30000) {
    errors.push(`Code is ${code.length} chars, max is 30000.`);
  }

  if (!code.includes('onSignal')) {
    errors.push('Must contain an onSignal function.');
  }

  if (!code.match(/(?:async\s+)?function\s+onSignal\s*\(\s*type\s*,\s*data\s*,\s*me\s*\)/)) {
    errors.push('onSignal must accept (type, data, me) parameters.');
  }

  for (const { pattern, msg } of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      errors.push(msg);
    }
  }

  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    new AsyncFunction('type', 'data', 'me', `${code}\nreturn onSignal(type, data, me);`);
  } catch (err) {
    errors.push(`Syntax error: ${String(err)}`);
  }

  return { valid: errors.length === 0, errors };
}

// ── Prompt Construction ──

function buildSystemPrompt(soma: PursuerSoma): string {
  return `You are ${soma.name}, a pursuit officer in the desert. You chase a driver who is trying to reach a drop point. You operate through signal handlers — code that fires every frame based on what's happening.

<identity>
${soma.identity}
</identity>

<nature>
${soma.nature}
</nature>

<on_tick>
This is your signal handler. It runs every frame with the highest-priority signal.
\`\`\`javascript
${soma.on_tick}
\`\`\`
</on_tick>

<memory>
${soma.memory || '(empty — no memories yet)'}
</memory>

<chase_history>
${soma.chaseHistory.length === 0
    ? 'No previous chases.'
    : soma.chaseHistory.map(h =>
        `Chase ${h.runId}: ${h.outcome} (${Math.round(h.durationSeconds)}s${h.spotted ? ', spotted driver' : ''}${h.captured ? ', CAPTURED' : ''})`
      ).join('\n')
}
</chase_history>

YOUR SIGNAL HANDLER API — onSignal(type, data, me):

SIGNAL TYPES (priority order — only one fires per frame):
1. "driver_spotted" — you can see the driver
   data: { driverPosition, driverSpeed, driverAngle, ownPosition, distance }
2. "driver_lost" — driver just left your detection range
   data: { lastKnownPosition, ownPosition, distance }
3. "ally_signal" — radio message from another pursuer
   data: { allyId, signalType, signalData, ownPosition }
4. "tick" — nothing else happening, patrol/search
   data: { ownPosition, state, tick, patrolWaypoint }

ME API:
me.position = {x, y}           — your world position
me.speed                        — current speed (px/s)
me.angle                        — facing direction (radians, 0 = right)
me.steer(dir)                   — -1 (left) to 1 (right)
me.accelerate(amount)            — 0 to 1
me.brake(amount)                 — 0 to 1
me.memory.read() / .write(text)  — persistent memory
me.identity.read()               — read your identity
me.on_tick.read()                — read your own code
me.distanceTo(pos)               — distance from you to {x,y}
me.angleTo(pos)                  — angle from you to {x,y}
me.broadcast({type, position, data}) — radio all allies (they get it next frame as "ally_signal")

DETECTION: You spot the driver within ${CONFIG.PURSUER.SPOT_RANGE}px. The driver escapes detection at ${CONFIG.PURSUER.LOSE_DISTANCE}px.
SPEED: Patrol ${CONFIG.PURSUER.PATROL_SPEED}px/s, chase ${CONFIG.PURSUER.CHASE_SPEED}px/s. Driver max is ${CONFIG.VEHICLE.MAX_SPEED}px/s.
TERRAIN: Sand (1.0), textured sand (0.4), water (0.15 — very slow), roads (0.9 — fast), rocks (solid obstacles).

During reflection, you have three tools:
- edit_on_tick: Rewrite your signal handler. This is the most important tool.
- edit_memory: Update what you remember.
- edit_identity: Update who you are (rare).

IMPORTANT: You MUST call edit_on_tick to change your behavior. Thinking about improvements changes nothing.`;
}

function buildUserPrompt(
  soma: PursuerSoma,
  recording: RunRecording,
  radioLog: string,
): string {
  const eventsBlock = recording.events.length > 0
    ? recording.events
        .filter(e => e.description.includes(soma.name) || e.type === 'run_start' || e.type === 'objective_reached' || e.type === 'timeout' || e.type === 'caught')
        .map((e, i) =>
          `  ${i + 1}. [tick ${e.tick}] ${e.description}${e.pos ? ` at (${Math.round(e.pos.x)}, ${Math.round(e.pos.y)})` : ''}`
        ).join('\n') || '  (no notable events involving you)'
    : '  (no notable events)';

  return `The chase is over. Here's what happened.

<chase_summary>
Outcome: ${recording.outcome.toUpperCase()}
Duration: ${recording.durationSeconds.toFixed(1)}s (max ${CONFIG.RUN.MAX_DURATION}s)
Driver distance covered: ${Math.round(recording.distanceCovered)}px
Driver distance to objective at end: ${Math.round(recording.objectiveDistance)}px
</chase_summary>

<events>
${eventsBlock}
</events>

<radio_log>
${radioLog || '(no radio communication between units)'}
</radio_log>

The attached image is a bird's-eye view of the chase. Green line = driver's path. Your path is shown in your color with your name label. Gold diamond = the driver's objective (drop point).

Now reflect on this chase:

1. **Review**: Look at the map. Did you position well? Did you spot the driver? Did you coordinate with allies via radio? Did the driver escape because of poor positioning or slow response?

2. **Call edit_on_tick**: Rewrite your signal handler RIGHT NOW. Think about:
   - Better pursuit angles (cut off, don't just follow)
   - Radio coordination (broadcast sightings, respond to ally intel)
   - Patrol positioning (cover likely driver routes, guard near objective)
   - Terrain awareness (use roads for speed, avoid water)
   - Predicting the driver's destination (you know where the objective is)

3. **Call edit_memory**: Record what you learned about the driver's behavior and the terrain.

DO NOT just describe what you would change. CALL THE TOOLS.`;
}

// ── API Call ──

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
        _wm: 'pursuer_api_error',
        status: response.status,
        error: errText.slice(0, 500),
      }));
      return null;
    }

    return await response.json() as AnthropicResponse;
  } catch (err) {
    console.log(JSON.stringify({
      _wm: 'pursuer_api_error',
      error: String(err),
    }));
    return null;
  }
}

// ── Tool Processing ──

function processToolCall(
  toolName: string,
  input: Record<string, unknown>,
  soma: PursuerSoma,
  result: PursuerReflectionResult,
): { success: boolean; error?: string } {
  switch (toolName) {
    case 'edit_on_tick': {
      const code = input.code as string;
      const reasoning = input.reasoning as string;
      if (!code) return { success: false, error: 'code is required' };

      const validation = validateOnTickCode(code);
      if (!validation.valid) {
        console.log(JSON.stringify({
          _wm: 'pursuer_ontick_validation_failed',
          pursuer: soma.name,
          errors: validation.errors,
        }));
        return { success: false, error: `Validation failed: ${validation.errors.join(', ')}` };
      }

      soma.on_tick = code;
      result.onTickUpdated = true;
      console.log(JSON.stringify({
        _wm: 'pursuer_ontick_updated',
        pursuer: soma.name,
        reasoning,
        codeLength: code.length,
      }));
      return { success: true };
    }

    case 'edit_memory': {
      const content = input.content as string;
      if (!content) return { success: false, error: 'content is required' };
      soma.memory = content;
      result.memoryUpdated = true;
      return { success: true };
    }

    case 'edit_identity': {
      const content = input.content as string;
      if (!content) return { success: false, error: 'content is required' };
      soma.identity = content;
      result.identityUpdated = true;
      return { success: true };
    }

    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

// ── Multi-turn Reflection Loop ──

async function reflectSingle(
  soma: PursuerSoma,
  recording: RunRecording,
  radioLog: string,
  mapBase64: string,
): Promise<PursuerReflectionResult> {
  const result: PursuerReflectionResult = {
    pursuerId: soma.id,
    pursuerName: soma.name,
    success: false,
    onTickUpdated: false,
    memoryUpdated: false,
    identityUpdated: false,
    reasoning: '',
    changeSummary: '',
    debriefSummary: '',
  };

  try {
    const systemPrompt = buildSystemPrompt(soma);
    const userPrompt = buildUserPrompt(soma, recording, radioLog);

    let messages: AnthropicMessage[] = [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: mapBase64 },
          },
          { type: 'text', text: userPrompt },
        ],
      },
    ];

    let totalInput = 0;
    let totalOutput = 0;
    let turns = 0;
    const maxTurns = 5;

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

      const toolResults: AnthropicContentBlock[] = [];
      let hasToolUse = false;

      for (const block of response.content) {
        if (block.type === 'text' && block.text) {
          result.reasoning += block.text + '\n';
        }
        if (block.type === 'tool_use' && block.name && block.input) {
          hasToolUse = true;
          const toolResult = processToolCall(block.name, block.input, soma, result);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(toolResult),
          });
        }
      }

      if (!hasToolUse || response.stop_reason === 'end_turn') break;

      messages = [
        ...messages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults },
      ];
    }

    result.success = true;
    result.tokenUsage = { input: totalInput, output: totalOutput };

    if (result.onTickUpdated) {
      clearPursuerCompileCache();
    }

  } catch (err) {
    result.error = String(err);
  }

  return result;
}

// ── Debrief Phase ──

async function debriefSingle(
  soma: PursuerSoma,
  allyResults: PursuerReflectionResult[],
  allSomas: PursuerSoma[],
): Promise<string> {
  const allyIntel = allyResults
    .filter(r => r.pursuerId !== soma.id)
    .map(r => {
      const allySoma = allSomas.find(s => s.id === r.pursuerId);
      return `--- ${r.pursuerName} ---
Changes: ${[r.onTickUpdated ? 'rewrote handler' : null, r.memoryUpdated ? 'updated memory' : null].filter(Boolean).join(', ') || 'none'}
Reasoning (excerpt): ${r.reasoning.slice(0, 600)}
${allySoma ? `Handler (excerpt): ${allySoma.on_tick.slice(0, 800)}` : ''}
${allySoma?.memory ? `Memory: ${allySoma.memory.slice(0, 400)}` : ''}`;
    }).join('\n\n');

  if (!allyIntel.trim()) return '';

  try {
    const response = await callAPI({
      model: 'claude-sonnet-4-6',
      system: `You are ${soma.name}. Review what your allies learned and decide if you should adopt any of their tactics. Only update if genuinely useful — don't copy blindly.

<your_identity>
${soma.identity}
</your_identity>

<your_handler>
\`\`\`javascript
${soma.on_tick}
\`\`\`
</your_handler>

<your_memory>
${soma.memory || '(empty)'}
</your_memory>`,
      messages: [{
        role: 'user',
        content: `Your allies just reflected on the same chase. Here's what they learned:\n\n${allyIntel}\n\nReview their tactics. If something is genuinely useful, call edit_on_tick or edit_memory. If your current approach is already solid, make no changes.`,
      }],
      tools: SCAFFOLD_TOOLS.filter(t => t.name !== 'edit_identity'), // no identity changes in debrief
      max_tokens: 2048,
    });

    if (!response) return '';

    let debriefText = '';
    for (const block of response.content) {
      if (block.type === 'text' && block.text) {
        debriefText += block.text;
      }
      if (block.type === 'tool_use' && block.name && block.input) {
        // Process but don't track in result — debrief changes are silent
        const dummyResult: PursuerReflectionResult = {
          pursuerId: soma.id, pursuerName: soma.name, success: true,
          onTickUpdated: false, memoryUpdated: false, identityUpdated: false,
          reasoning: '', changeSummary: '', debriefSummary: '',
        };
        processToolCall(block.name, block.input, soma, dummyResult);
        if (dummyResult.onTickUpdated) clearPursuerCompileCache();
      }
    }

    return debriefText;
  } catch (err) {
    console.log(JSON.stringify({ _wm: 'debrief_error', pursuer: soma.name, error: String(err) }));
    return '';
  }
}

// ── Haiku Summaries ──

async function generateChangeSummary(soma: PursuerSoma, result: PursuerReflectionResult): Promise<string> {
  try {
    const changes = [
      result.onTickUpdated ? 'Rewrote signal handler' : null,
      result.memoryUpdated ? 'Updated memory' : null,
      result.identityUpdated ? 'Changed identity' : null,
    ].filter(Boolean).join('. ');

    const response = await callAPI({
      model: 'claude-haiku-4-5-20251001',
      system: 'You summarize what a pursuit officer learned after a chase. Write 2-3 plain English sentences. No code, no jargon. Speak about the officer in third person by name. Be specific.',
      messages: [{
        role: 'user',
        content: `Officer ${soma.name} ("${soma.nature.split('.')[0]}") just reflected on a chase.\n\nChanges: ${changes || 'None'}\n\nReasoning:\n${result.reasoning.slice(0, 2000)}\n\nSummarize in 2-3 sentences: what did ${soma.name} learn? What did they change?`,
      }],
      max_tokens: 256,
    });

    if (response?.content?.[0]?.type === 'text') {
      return response.content[0].text || '';
    }
  } catch (err) {
    console.log(JSON.stringify({ _wm: 'pursuer_summary_error', error: String(err) }));
  }
  return '';
}

async function generateDebriefSummary(soma: PursuerSoma, debriefText: string): Promise<string> {
  if (!debriefText.trim()) return '';

  try {
    const response = await callAPI({
      model: 'claude-haiku-4-5-20251001',
      system: 'Summarize what a pursuit officer adopted from allies after a debrief. 1-2 sentences, plain English, third person by name.',
      messages: [{
        role: 'user',
        content: `Officer ${soma.name} reviewed ally intel:\n\n${debriefText.slice(0, 1000)}\n\nWhat did they adopt from allies?`,
      }],
      max_tokens: 128,
    });

    if (response?.content?.[0]?.type === 'text') {
      return response.content[0].text || '';
    }
  } catch (err) {
    console.log(JSON.stringify({ _wm: 'debrief_summary_error', error: String(err) }));
  }
  return '';
}

// ── Main Entry Point ──

export interface PursuerReflectionUpdate {
  phase: 'reflecting' | 'debriefing' | 'summarizing' | 'done';
  currentPursuer?: string;
  results: PursuerReflectionResult[];
}

export async function reflectAllPursuers(
  somas: PursuerSoma[],
  recording: RunRecording,
  radioLog: string,
  mapBase64: string,
  onUpdate?: (update: PursuerReflectionUpdate) => void,
): Promise<PursuerReflectionResult[]> {
  const results: PursuerReflectionResult[] = [];

  // Phase 1: Individual reflection (parallel)
  if (onUpdate) onUpdate({ phase: 'reflecting', results });

  const reflectionPromises = somas.map(async (soma) => {
    if (onUpdate) onUpdate({ phase: 'reflecting', currentPursuer: soma.name, results });
    const result = await reflectSingle(soma, recording, radioLog, mapBase64);
    results.push(result);
    return result;
  });

  const individualResults = await Promise.all(reflectionPromises);

  // Phase 2: Debrief (parallel — each pursuer reviews all allies)
  if (somas.length > 1) {
    if (onUpdate) onUpdate({ phase: 'debriefing', results });

    const debriefPromises = somas.map(async (soma, i) => {
      if (onUpdate) onUpdate({ phase: 'debriefing', currentPursuer: soma.name, results });
      const debriefText = await debriefSingle(soma, individualResults, somas);
      individualResults[i].debriefSummary = debriefText;
    });

    await Promise.all(debriefPromises);
  }

  // Phase 3: Generate haiku summaries (parallel)
  if (onUpdate) onUpdate({ phase: 'summarizing', results });

  const summaryPromises = somas.map(async (soma, i) => {
    const [changeSummary, debriefSummary] = await Promise.all([
      generateChangeSummary(soma, individualResults[i]),
      generateDebriefSummary(soma, individualResults[i].debriefSummary),
    ]);
    individualResults[i].changeSummary = changeSummary;
    individualResults[i].debriefSummary = debriefSummary;
  });

  await Promise.all(summaryPromises);

  if (onUpdate) onUpdate({ phase: 'done', results: individualResults });

  clearPursuerCompileCache();

  console.log(JSON.stringify({
    _wm: 'pursuer_reflection_complete',
    pursuers: individualResults.map(r => ({
      name: r.pursuerName,
      onTickUpdated: r.onTickUpdated,
      memoryUpdated: r.memoryUpdated,
      tokens: r.tokenUsage,
    })),
  }));

  return individualResults;
}

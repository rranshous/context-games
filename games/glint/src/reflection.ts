// Reflection — async predator learning via Claude.
// After a hunt, the predator reflects on its hunt_journal via scaffold tools
// that edit named soma sections. Runs in the background — no game pause.

import { PredatorSoma } from './soma.js';

// --- Scaffold tools (one per editable section) ---

const SCAFFOLD_TOOLS = [
  {
    name: 'edit_on_tick',
    description: 'Rewrite your per-frame behavior code. This is the code that runs every tick — it reads sensors, tracks state, records events to your hunt journal, and issues movement commands. Write the complete async function on_tick(me, world) { ... } body.',
    input_schema: {
      type: 'object' as const,
      properties: {
        code: {
          type: 'string',
          description: 'The complete async function on_tick(me, world) { ... } function.',
        },
        reasoning: {
          type: 'string',
          description: 'What you changed and why.',
        },
      },
      required: ['code', 'reasoning'],
    },
  },
  {
    name: 'edit_memory',
    description: 'Update what you remember about this reef and its prey. Your memory persists across hunts and reflections.',
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
    description: 'Rewrite your identity — who you are, your hunting philosophy. This shapes how you think about yourself during reflection.',
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
  {
    name: 'edit_hunt_journal',
    description: 'Curate your hunt journal. Summarize old entries, trim noise, keep what matters. Your on_tick code appends to this during hunts; you can clean it up during reflection.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string',
          description: 'Your updated hunt journal. Replaces current journal entirely.',
        },
      },
      required: ['content'],
    },
  },
];

// --- Prompt construction ---

function buildSystemPrompt(soma: PredatorSoma): string {
  return `

<identity>
${soma.identity}
</identity>

<on_tick>
${soma.on_tick}
</on_tick>

<memory>
${soma.memory}
</memory>

<hunt_journal>
${soma.hunt_journal || ''}
</hunt_journal>


`;
}

function buildReflectionPrompt(soma: PredatorSoma): string {
  return `thrive`;
}

// --- Code validation ---

const MAX_ON_TICK_LENGTH = 10000;

function validateOnTickCode(code: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (code.length > MAX_ON_TICK_LENGTH) {
    errors.push(`on_tick code is ${code.length} chars, max is ${MAX_ON_TICK_LENGTH}`);
  }

  if (!code.includes('on_tick')) {
    errors.push('Must contain an on_tick function');
  }

  if (!code.match(/(?:async\s+)?function\s+on_tick\s*\(\s*me\s*,\s*world\s*\)/)) {
    errors.push('on_tick must accept (me, world) parameters');
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
    new AsyncFunction('me', 'world', `${code}\nreturn on_tick(me, world);`);
  } catch (err) {
    errors.push(`Syntax error: ${String(err)}`);
  }

  return { valid: errors.length === 0, errors };
}

// --- Reflection result ---

export interface ReflectionResult {
  predatorId: string;
  success: boolean;
  onTickUpdated: boolean;
  memoryUpdated: boolean;
  identityUpdated: boolean;
  journalUpdated: boolean;
  reasoning: string;
  error?: string;
}

// --- Tool call processing ---

function processToolCall(
  toolName: string,
  input: Record<string, unknown>,
  soma: PredatorSoma,
  result: ReflectionResult,
): { success: boolean; data?: unknown; error?: string } {
  switch (toolName) {
    case 'edit_on_tick': {
      const code = input.code as string;
      const reasoning = input.reasoning as string;

      if (!code) return { success: false, error: 'code is required' };

      const validation = validateOnTickCode(code);
      if (!validation.valid) {
        console.log(`[GLINT] on_tick validation failed for ${soma.id}: ${validation.errors.join(', ')}`);
        return {
          success: false,
          error: `Validation failed: ${validation.errors.join(', ')}. Fix and try again.`,
        };
      }

      soma.on_tick = code;
      result.onTickUpdated = true;

      console.log(`[GLINT] on_tick updated for ${soma.id}: ${reasoning} (${code.length} chars)`);
      return {
        success: true,
        data: { message: 'on_tick updated. It will execute on the next frame.' },
      };
    }

    case 'edit_memory': {
      const content = input.content as string;
      if (!content) return { success: false, error: 'content is required' };

      soma.memory = content;
      result.memoryUpdated = true;

      console.log(`[GLINT] Memory updated for ${soma.id}: ${content.slice(0, 100)}`);
      return { success: true, data: { message: 'Memory updated.' } };
    }

    case 'edit_identity': {
      const content = input.content as string;
      if (!content) return { success: false, error: 'content is required' };

      soma.identity = content;
      result.identityUpdated = true;

      console.log(`[GLINT] Identity updated for ${soma.id}: ${content.slice(0, 100)}`);
      return { success: true, data: { message: 'Identity updated.' } };
    }

    case 'edit_hunt_journal': {
      const content = input.content as string;
      if (content === undefined) return { success: false, error: 'content is required' };

      soma.hunt_journal = content;
      result.journalUpdated = true;

      console.log(`[GLINT] Hunt journal updated for ${soma.id}: ${content.length} chars`);
      return { success: true, data: { message: 'Hunt journal updated.' } };
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
  gameTime: number,
  apiEndpoint: string,
): Promise<ReflectionResult> {
  soma.reflectionPending = true;

  const result: ReflectionResult = {
    predatorId: soma.id,
    success: false,
    onTickUpdated: false,
    memoryUpdated: false,
    identityUpdated: false,
    journalUpdated: false,
    reasoning: '',
  };

  try {
    const systemPrompt = buildSystemPrompt(soma);
    const userPrompt = buildReflectionPrompt(soma);

    let messages: APIMessage[] = [
      { role: 'user', content: userPrompt },
    ];

    let turns = 0;

    while (turns < REFLECTION_MAX_TURNS) {
      turns++;

      const response = await callAPI(apiEndpoint, {
        model: 'claude-sonnet-4-6',
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
          const toolResult = processToolCall(block.name, block.input, soma, result);
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

export function shouldReflect(
  soma: PredatorSoma,
  gameTime: number,
): boolean {
  if (soma.reflectionPending) return false;
  if (soma.lastReflectionTime > 0 && gameTime - soma.lastReflectionTime < REFLECTION_COOLDOWN) return false;
  // Only reflect if there's journal content to learn from
  if (!soma.hunt_journal || soma.hunt_journal.trim().length < 20) return false;
  return true;
}

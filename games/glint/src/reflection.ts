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
  return `You are a ${soma.species} in a coral reef. You hunt a small bioluminescent squid.

<identity>
${soma.identity}
</identity>

<on_tick>
This is your per-frame behavior code. It runs every tick with on_tick(me, world).
\`\`\`javascript
${soma.on_tick}
\`\`\`
</on_tick>

<memory>
${soma.memory}
</memory>

<hunt_journal>
${soma.hunt_journal || 'No hunt entries yet.'}
</hunt_journal>

<reef_knowledge>
The reef is a maze of coral walls, open water channels, kelp forests, narrow crevices, and dens.
- Walls block movement and line of sight
- Kelp: passable but prey can hide here (concealment — becomes invisible to sensors)
- Crevices: narrow passages — you CANNOT fit through (too big), but the squid can
- Dens: alcoves carved into walls — prey hides here, you cannot enter
- The squid conceals itself by going still on hiding tiles (kelp, crevice, den). When concealed, your sensors cannot detect it.
- You must catch the squid in open water or while it's moving through kelp.
</reef_knowledge>

<sensors>
Your on_tick(me, world) receives:
- world.squidDetected — boolean, true if you can see the prey right now
- world.squidPos — {x, z} prey position (only meaningful when detected)
- world.squidDist — distance to prey
- world.dt — seconds since last frame
- world.t — total elapsed game time

The me object provides:
Movement commands (call one per tick — first one wins):
- me.pursue(target) — chase speed, beeline toward {x, z}
- me.patrol_to(target) — patrol speed, move toward {x, z}
- me.patrol_random() — pick a random open tile and go there
- me.hold() — stay still

Sensing:
- me.check_los(pos) — checks if you can see a position (walls block)
- me.nearby_tiles(type) — returns nearby tiles of a given type ('kelp', 'den', 'crevice', 'open') within sensor range, sorted by distance. Each has {x, z, dist}.
- me.distance_to(pos) — returns distance to a position
- me.getPosition() — your current position {x, z}

Sections:
- me.memory.read() / me.memory.write(s) — your persistent memory. Use this for EVERYTHING: working state (pursuing? lost time? last known position?) AND long-term notes. Write it every tick. Parse with string matching.
- me.hunt_journal.read() / me.hunt_journal.write(s) — your hunt log
- me.on_tick.read() — read your own code (read-only at runtime)
- me.identity.read() — read your identity (read-only at runtime)
</sensors>

IMPORTANT: You MUST call edit_on_tick to change your behavior. Thinking about improvements without calling the tool changes nothing. Your on_tick code is what actually runs during hunts.`;
}

function buildReflectionPrompt(soma: PredatorSoma): string {
  return `Time to reflect on your recent hunting experience.

Review your hunt journal above. It contains observations your on_tick code recorded during recent hunts.

Reflect:

1. **What happened?** Why did the prey escape? Did it hide? Where? Could you have predicted it?

2. **Call edit_on_tick**: Rewrite your on_tick function with specific improvements. Ideas:
   - After losing prey, check nearby hiding tiles (me.nearby_tiles('kelp'), me.nearby_tiles('den')) instead of just going to last-known position
   - Use memory to track where prey hides repeatedly
   - Write more detailed hunt journal entries from your on_tick code so you can learn from them later
   - Add systematic search patterns instead of random patrol
   - Predict which direction the prey fled based on your approach angle
   - Use me.memory for frame-to-frame tracking (was I pursuing? how long since lost? last known position?) — parse with string matching, write every tick

3. **Call edit_memory**: Record spatial knowledge — where are the good hiding spots? Where does prey tend to go?

4. **Call edit_hunt_journal**: Curate your journal — summarize old entries, keep what matters, trim what doesn't. An overly long journal wastes your attention.

DO NOT just describe improvements. CALL THE TOOLS.`;
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

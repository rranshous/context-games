// ── Reflection ──
// Between rounds, AI cars reflect on their performance and edit their soma.
// Sonnet for strategic reflection (edit on_tick/memory).
// Haiku for trash talk (shown to player).

import { CONFIG } from './config.js';
import { CarSoma, RoundResult } from './types.js';

const API = CONFIG.API_ENDPOINT;

async function callAPI(
  model: string,
  system: string,
  userMsg: string,
  tools?: unknown[],
  maxTokens: number = 1024,
): Promise<{ content: Array<{ type: string; text?: string; input?: Record<string, string> }>; tool_calls?: unknown[] }> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: userMsg }],
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = { type: 'any' };
  }

  const resp = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`API ${resp.status}: ${text}`);
  }

  return resp.json();
}

// ── Strategic Reflection (Sonnet) ──

const REFLECTION_TOOLS = [
  {
    name: 'edit_on_tick',
    description: 'Replace your driving code. This code runs every frame with (me, world) as arguments. me has: x, y, angle, speed, isIt, itTimer, immuneTimer, alive, steer(dir), accelerate(amt), brake(amt), distanceTo(x,y), angleTo(x,y), memory.read()/write(), identity.read(), on_tick.read(). world has: time, arenaWidth, arenaHeight, otherCars[{id,x,y,angle,speed,isIt,alive,immuneTimer}], obstacles[{x,y,radius,type}].',
    input_schema: {
      type: 'object' as const,
      properties: {
        code: { type: 'string' as const, description: 'New JavaScript code for on_tick' },
      },
      required: ['code'],
      additionalProperties: false,
    },
  },
  {
    name: 'edit_memory',
    description: 'Update your persistent memory. Survives across rounds. Use it to track strategies, observations, what works and what doesn\'t.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string' as const, description: 'New memory content' },
      },
      required: ['content'],
      additionalProperties: false,
    },
  },
  {
    name: 'edit_identity',
    description: 'Update your identity description — who you are, your driving philosophy.',
    input_schema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string' as const, description: 'New identity content' },
      },
      required: ['content'],
      additionalProperties: false,
    },
  },
];

export async function reflectOnRound(
  carName: string,
  soma: CarSoma,
  result: RoundResult,
): Promise<CarSoma> {
  const system = `You are ${carName}, a car in a desert demolition derby tag game. You have a soma — code that controls how you drive. After each round, you can modify your code and memory to improve.

Your current soma:
<identity>${soma.identity.content}</identity>
<on_tick>${soma.on_tick.content}</on_tick>
<memory>${soma.memory.content || '(empty)'}</memory>

The game: cars play tag in a desert arena with obstacles. One car is "it" and must ram another car to pass the tag. If you're "it" too long, you're eliminated. Last car alive wins.

Call ALL tools you want to use in a single response.`;

  const userMsg = `Round ${result.roundNumber} results:
- Placement: ${result.placement}/${result.totalCars}
- Survived: ${result.survivedSeconds.toFixed(1)}s
- Tags given: ${result.tagsGiven}, received: ${result.tagsReceived}
- ${result.wasEliminated ? 'ELIMINATED (timed out while "it")' : 'Survived!'}

Reflect on your performance and improve your driving code. Think about:
1. If you got eliminated, how can you tag someone faster?
2. If you survived, what worked well? Can you be even better?
3. Are there patterns in how other cars move that you can exploit?

Call the tools to update your soma.`;

  try {
    const resp = await callAPI('claude-sonnet-4-5-20250929', system, userMsg, REFLECTION_TOOLS);

    // Apply tool calls
    const updated = { ...soma };
    for (const block of resp.content) {
      if (block.type === 'tool_use' && block.input) {
        const input = block.input as Record<string, string>;
        const name = (block as { name?: string }).name;
        if (name === 'edit_on_tick' && input.code) {
          updated.on_tick = { content: input.code };
        } else if (name === 'edit_memory' && input.content) {
          updated.memory = { content: input.content };
        } else if (name === 'edit_identity' && input.content) {
          updated.identity = { content: input.content };
        }
      }
    }

    console.log(`[REFLECT] ${carName} reflection complete`);
    return updated;
  } catch (err) {
    console.warn(`[REFLECT] ${carName} reflection failed:`, err);
    return soma; // keep existing
  }
}

// ── Trash Talk (Haiku) ──

export async function generateTrashTalk(
  carName: string,
  soma: CarSoma,
  result: RoundResult,
  allResults: { name: string; result: RoundResult }[],
): Promise<string> {
  const system = `You are ${carName}, a car in a desert demolition derby tag game. Stay in character based on your identity: "${soma.identity.content.slice(0, 200)}"`;

  const standings = allResults
    .sort((a, b) => a.result.placement - b.result.placement)
    .map(r => `${r.name}: #${r.result.placement}${r.result.wasEliminated ? ' (eliminated)' : ''}`)
    .join(', ');

  const userMsg = `You just finished round ${result.roundNumber}. You placed #${result.placement}/${result.totalCars}.${result.wasEliminated ? ' You got eliminated!' : ' You survived!'} Standings: ${standings}.

Give a short trash talk line (1-2 sentences max). Be cocky if you won, salty if you lost. Reference specific rivals or moments. Keep it fun and in-character.`;

  try {
    const resp = await callAPI('claude-haiku-4-5-20251001', system, userMsg, undefined, 150);
    const text = resp.content.find(b => b.type === 'text')?.text;
    return text || '...';
  } catch {
    return '...';
  }
}

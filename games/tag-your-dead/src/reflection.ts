// ── Reflection ──
// Background reflection: AI cars reflect on their last life after dying.
// Runs async while the game continues.

import { CONFIG } from './config.js';
import { CarSoma, LifeResult } from './types.js';

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

// ── Reflection Tools ──

const REFLECTION_TOOLS = [
  {
    name: 'edit_on_tick',
    description: 'Replace your driving code. Runs every frame with (me, world). me: x, y, angle, speed, hp, maxHp, maxSpeed, score, isIt, itTimer, immuneTimer, alive, steer(dir), accelerate(amt), brake(amt), distanceTo(x,y), angleTo(x,y), memory.read()/write(), identity.read(), on_tick.read(). world: time, arenaWidth, arenaHeight, otherCars[{id,x,y,angle,speed,hp,score,isIt,alive,immuneTimer}], obstacles[{x,y,radius,type}].',
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
    description: 'Update your persistent memory. Survives across lives. Track strategies, observations, what works.',
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

// ── Background Reflection ──

export async function reflectOnLife(
  carName: string,
  soma: CarSoma,
  result: LifeResult,
): Promise<CarSoma> {
  const system = `You are ${carName}, a car in a never-ending desert demolition derby. You just died and are reflecting on your last life while you respawn.

Your current soma:
<identity>${soma.identity.content}</identity>
<on_tick>${soma.on_tick.content}</on_tick>
<memory>${soma.memory.content || '(empty)'}</memory>

The game: continuous demolition derby. All cars ram each other for damage (speed × 0.15). Being "it" gives 3x damage output. Die (HP=0 or IT timeout) → score halved, respawn in 5s. Higher score = more HP and speed. No rounds — fight forever, climb the scoreboard.

me.score and me.maxHp/me.maxSpeed let you know your current scaling. Other cars' score and hp are visible too — target the weak, avoid the strong.

Call ALL tools you want to use in a single response.`;

  const userMsg = `You died! Cause: ${result.deathCause === 'destroyed' ? 'HP reached 0' : 'IT timer ran out'}.
- Score before death penalty: ${result.score} (now halved)
- Damage dealt: ${result.damageDealt}, taken: ${result.damageTaken}
- Kills: ${result.kills}
- Tags given: ${result.tagsGiven}, received: ${result.tagsReceived}

Improve your driving code. Think about:
1. Why did you die? How can you avoid that?
2. Are you dealing enough damage? High-speed rams at full throttle maximize damage.
3. Being "it" = 3x damage. Use it to destroy low-HP cars, not just pass the tag.
4. Check other cars' score/hp to pick fights you can win.
5. Your score affects your HP and speed — staying alive is key to scaling up.

Call the tools to update your soma.`;

  try {
    const resp = await callAPI('claude-sonnet-4-5-20250929', system, userMsg, REFLECTION_TOOLS);

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
    return soma;
  }
}

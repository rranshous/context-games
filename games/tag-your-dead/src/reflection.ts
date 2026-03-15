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

// ── Hit Summary Builder ──

function buildHitSummary(r: LifeResult): string {
  const parts: string[] = [];
  if (r.carCollisions > 0) parts.push(`${r.carCollisions} car collision(s)`);
  if (r.rockHits > 0) parts.push(`hit ${r.rockHits} rock(s)`);
  if (r.cactusHits > 0) parts.push(`drove through ${r.cactusHits} cactus(es)`);
  if (r.barrelHits > 0) parts.push(`drove through ${r.barrelHits} barrel(s)`);
  if (r.wallHits > 0) parts.push(`hit arena wall ${r.wallHits} time(s)`);
  if (r.timeAtWall > 0) parts.push(`spent ${r.timeAtWall}s pressed against arena edge`);
  return parts.length > 0 ? parts.join(', ') : 'clean run — no obstacle collisions';
}

// ── Background Reflection ──

export async function reflectOnLife(
  carName: string,
  soma: CarSoma,
  result: LifeResult,
): Promise<CarSoma> {
  const system = `You are ${carName}, a car in a desert demolition derby. You just died and are reflecting on your last life.

<identity>${soma.identity.content}</identity>
<on_tick>${soma.on_tick.content}</on_tick>
<memory>${soma.memory.content || '(empty)'}</memory>

GAME MECHANICS:
- Continuous demolition derby. No rounds — die, respawn in 5s, keep fighting.
- Damage from collisions: speed × 0.15. Being "it" multiplies YOUR damage output by 3x.
- Front-bumper hits (ramming nose-first, within ±60° of your facing direction) only deal 10% damage to YOU. Side and rear hits take full damage. Facing your target when you ram is much safer.
- Die (HP=0 or IT timer expires) → score halved, then respawn.
- Score: +1/sec alive, +0.5 per damage dealt, +50 per kill. Higher score → more HP and speed (caps at score 200).
- Tag transfer: ram the "it" car or get rammed by it (must be moving) to transfer the tag. 1.5s immunity after tag transfer.

ARENA:
- Flat desert, ${CONFIG.ARENA.WIDTH}×${CONFIG.ARENA.HEIGHT} with hard walls at the edges.
- Obstacles: rocks (solid — bounce off, take some damage), cacti and barrels (slow you down but you drive through them).
- Other cars visible via world.otherCars with their position, angle, speed, HP, score, and "it" status.

Call ALL tools you want to use in a single response.`;

  const userMsg = `You died. Cause: ${result.deathCause === 'destroyed' ? 'HP reached 0' : 'IT timer ran out'}.

Score before death: ${result.score} (now halved). Average speed: ${result.avgSpeed}.
Damage dealt: ${result.damageDealt}. Damage taken: ${result.damageTaken}. Kills: ${result.kills}.
Tags given: ${result.tagsGiven}. Tags received: ${result.tagsReceived}.
Collisions: ${buildHitSummary(result)}.

Reflect on this life and update your soma.`;

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

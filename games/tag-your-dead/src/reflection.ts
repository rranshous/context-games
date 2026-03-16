// ── Reflection ──
// Background reflection: AI cars reflect on their last life after dying.
// Runs async while the game continues.

import { CONFIG } from './config.js';
import { CarSoma, LifeResult, Obstacle, SandPatch } from './types.js';
import { renderLifeMap } from './life-map.js';

const API = CONFIG.API_ENDPOINT;

export interface ArenaContext {
  arenaWidth: number;
  arenaHeight: number;
  obstacles: Obstacle[];
  sandPatches: SandPatch[];
  carColor: string;
}

interface ContentBlock {
  type: string;
  text?: string;
  input?: Record<string, string>;
  name?: string;
  id?: string;
}

interface APIResponse {
  content: ContentBlock[];
  stop_reason?: string;
}

async function callAPI(
  model: string,
  system: string,
  messages: Array<{ role: string; content: unknown }>,
  tools?: unknown[],
  maxTokens: number = 4096,
): Promise<APIResponse> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    system,
    messages,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = { type: 'auto' };
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
    description: 'Rewrite your driving code — this is what actually runs every frame. Write the COMPLETE new on_tick body. Available API: me.x, me.y, me.angle, me.speed, me.hp, me.maxHp, me.maxSpeed, me.score, me.isIt, me.itTimer, me.immuneTimer, me.alive, me.steer(dir), me.accelerate(amt), me.brake(amt), me.boost(), me.isBoosting, me.boostCooldownFrac, me.distanceTo(x,y), me.angleTo(x,y), me.memory.read()/write(), me.identity.read(), me.on_tick.read(). world.time, world.arenaWidth, world.arenaHeight, world.otherCars[{id,x,y,angle,speed,hp,score,isIt,alive,immuneTimer}], world.obstacles[{x,y,radius,type}].',
    input_schema: {
      type: 'object' as const,
      properties: {
        reasoning: { type: 'string' as const, description: 'What you are changing and why — reference specific events from your last life' },
        code: { type: 'string' as const, description: 'The COMPLETE new on_tick code. Must be valid JavaScript.' },
      },
      required: ['reasoning', 'code'],
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

export interface ReflectionResult {
  soma: CarSoma;
  brag: string | null; // in-character announcement of changes, null if no on_tick change
}

export async function reflectOnLife(
  carName: string,
  soma: CarSoma,
  result: LifeResult,
  arena: ArenaContext,
): Promise<ReflectionResult> {
  const system = `You are ${carName}, a car in a desert demolition derby. You just died and are reflecting on your last life.

<identity>${soma.identity.content}</identity>
<on_tick>${soma.on_tick.content}</on_tick>
<memory>${soma.memory.content || '(empty)'}</memory>

GAME MECHANICS:
- Continuous demolition derby. No rounds — die, respawn in 5s, keep fighting.
- Damage from collisions: speed × 0.15. Being "it" multiplies YOUR damage output by 3x.
- Being "it" also gives +15% max speed and 2x faster boost recharge — use this advantage to chase down targets.
- BUT being "it" makes you take 35% MORE damage from all sources. High reward, high risk — pass the tag quickly or die fast.
- Front-bumper hits (ramming nose-first, within ±60° of your facing direction) only deal 10% damage to YOU. Side and rear hits take full damage. Facing your target when you ram is much safer.
- Die (HP=0 or IT timer expires) → score halved, then respawn.
- Score: +1/sec alive, +0.5 per damage dealt, +50 per kill (+150 for killing the "it" car). Higher score → more HP and speed (caps at score 200).
- Tag transfer: ram the "it" car or get rammed by it (must be moving) to transfer the tag. 1.5s immunity after tag transfer.
- boost(): short speed burst (1.8x max speed, 3x accel) on 3s cooldown. IT cars recharge 2x faster.

ARENA:
- Flat desert, ${CONFIG.ARENA.WIDTH}×${CONFIG.ARENA.HEIGHT}, toroidal — driving off one edge puts you on the opposite side (no walls).
- Obstacles: rocks (solid — bounce off, take some damage), cacti and barrels (slow you down but you drive through them). Rough sand patches increase friction and slow you down gradually.
- Other cars visible via world.otherCars with their position, angle, speed, HP, score, and "it" status.
- Coordinates: (0,0) is top-left, (${CONFIG.ARENA.WIDTH},${CONFIG.ARENA.HEIGHT}) is bottom-right.

The attached image shows a bird's-eye map of your last life. Your path is shown in your color (red when IT). Numbered circles mark key events listed below. Green square = spawn, red X = death.

Call ALL tools you want to use in a single response.`;

  // Build key moments text
  const moments = result.lifeEvents.length > 0
    ? '\nKEY MOMENTS:\n' + result.lifeEvents.map((ev, i) =>
        `${i + 1}. [${Math.round(ev.time)}s] ${ev.description}`
      ).join('\n')
    : '';

  const userText = `You died. Cause: ${result.deathCause === 'destroyed' ? 'HP reached 0' : 'IT timer ran out'}.

Score before death: ${result.score} (now halved). Average speed: ${result.avgSpeed}.
Damage dealt: ${result.damageDealt}. Damage taken: ${result.damageTaken}. Kills: ${result.kills}.
Tags given: ${result.tagsGiven}. Tags received: ${result.tagsReceived}.
Collisions: ${buildHitSummary(result)}.
${moments}
Steps:
1. Review the map and key moments above. What pattern led to your death?
2. Call edit_on_tick RIGHT NOW with your improved driving code. Include reasoning about what you changed. The code field must contain your COMPLETE new on_tick body — not a description, the actual JavaScript.
3. Call edit_memory to record what you learned.

DO NOT just describe what you would change. CALL THE TOOLS. Your driving code is what runs — analysis without edit_on_tick changes nothing.`;

  // Render life map if we have trail data
  let userContent: string | Array<Record<string, unknown>> = userText;
  if (result.trail.length > 2) {
    try {
      const mapBase64 = renderLifeMap({
        arenaWidth: arena.arenaWidth,
        arenaHeight: arena.arenaHeight,
        obstacles: arena.obstacles,
        sandPatches: arena.sandPatches,
        trail: result.trail,
        events: result.lifeEvents,
        carColor: arena.carColor,
        carName,
      });
      userContent = [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: mapBase64 } },
        { type: 'text', text: userText },
      ];
      console.log(`[REFLECT] ${carName} life map rendered (${result.trail.length} trail points, ${result.lifeEvents.length} events)`);
    } catch (err) {
      console.warn(`[REFLECT] ${carName} life map failed, using text-only:`, err);
    }
  }

  try {
    const updated = { ...soma };
    const messages: Array<{ role: string; content: unknown }> = [
      { role: 'user', content: userContent },
    ];
    const allToolsCalled: string[] = [];
    const MAX_TURNS = 3;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const resp = await callAPI('claude-sonnet-4-6', system, messages, REFLECTION_TOOLS);

      // Process tool calls
      const toolResults: Array<{ type: string; tool_use_id: string; content: string }> = [];
      for (const block of resp.content) {
        if (block.type === 'tool_use' && block.id) {
          const input = (block.input || {}) as Record<string, string>;
          console.log(`[REFLECT] ${carName} turn ${turn + 1}: ${block.name} (${JSON.stringify(input).length} chars)`);
          allToolsCalled.push(block.name || 'unknown');

          let resultText = '';
          if (block.name === 'edit_on_tick' && input.code) {
            updated.on_tick = { content: input.code };
            resultText = `on_tick updated (${input.code.length} chars). Your new driving code is now active.`;
          } else if (block.name === 'edit_on_tick') {
            resultText = 'Error: code field is required. You must provide the full new on_tick code.';
          } else if (block.name === 'edit_memory' && input.content) {
            updated.memory = { content: input.content };
            resultText = 'Memory updated.';
          } else if (block.name === 'edit_identity' && input.content) {
            updated.identity = { content: input.content };
            resultText = 'Identity updated.';
          } else {
            resultText = 'Error: content field is required.';
          }
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultText });
        }
      }

      // If no tool calls or stop_reason is end_turn, we're done
      if (toolResults.length === 0 || resp.stop_reason === 'end_turn') {
        break;
      }

      // Add assistant response + tool results for next turn
      messages.push({ role: 'assistant', content: resp.content });
      messages.push({ role: 'user', content: toolResults });
    }

    console.log(`[REFLECT] ${carName} reflection complete — tools: ${allToolsCalled.join(', ') || 'none'}`);

    // Generate in-character brag if on_tick changed
    const oldCode = soma.on_tick.content.trim();
    const newCode = updated.on_tick.content.trim();
    const codeChanged = newCode !== oldCode;
    let brag: string | null = null;
    if (codeChanged) {
      console.log(`[REFLECT] ${carName} on_tick changed (${oldCode.length} → ${newCode.length} chars), generating brag...`);
      brag = await generateBrag(carName, updated.identity.content, soma.on_tick.content, updated.on_tick.content);
      console.log(`[REFLECT] ${carName} brag: ${brag ?? '(failed)'}`);
    } else {
      console.log(`[REFLECT] ${carName} on_tick unchanged — no brag`);
    }

    return { soma: updated, brag };
  } catch (err) {
    console.warn(`[REFLECT] ${carName} reflection failed:`, err);
    return { soma, brag: null };
  }
}

async function generateBrag(
  name: string,
  identity: string,
  oldCode: string,
  newCode: string,
): Promise<string | null> {
  try {
    const resp = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `You are ${name}, a demolition derby driver. Your identity: "${identity}"

You just updated your driving code after dying. Write a short, cocky, in-character brag about what you changed (1 sentence, max 15 words). Be specific about the tactical change, not generic. No quotes.

OLD CODE (snippet):
${oldCode.slice(0, 400)}

NEW CODE (snippet):
${newCode.slice(0, 400)}`,
        }],
      }),
    });
    if (!resp.ok) {
      console.warn(`[BRAG] API ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    const text = data.content?.[0]?.text?.trim();
    if (!text) console.warn('[BRAG] empty response', data);
    return text || null;
  } catch (err) {
    console.warn('[BRAG] failed:', err);
    return null;
  }
}

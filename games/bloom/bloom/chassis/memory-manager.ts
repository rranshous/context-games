import { writeSection, readSection } from './soma-io.js';

const FRAME_URL = process.env.FRAME_URL || 'http://localhost:4444';
const HISTORY_CAP = 5000;

export interface Signal {
  type: 'tick' | 'chat';
  data: Record<string, unknown>;
}

export interface ActionRecord {
  tool: string;
  input: Record<string, unknown>;
  result: string;
}

let lastSeenChatId: string | null = null;

// --- Signal detection ---

export async function pollChatSignals(): Promise<Signal[]> {
  try {
    const url = lastSeenChatId
      ? `${FRAME_URL}/api/chat?after=${lastSeenChatId}`
      : `${FRAME_URL}/api/chat?count=1`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const msgs = await res.json() as Array<{ id: string; handle: string; text: string; ts: number }>;

    // Filter to non-bloom messages (signals come from outside)
    const external = msgs.filter(m => m.handle !== 'bloom');

    if (msgs.length > 0) {
      lastSeenChatId = msgs[msgs.length - 1].id;
    }

    if (external.length > 0) {
      console.log(`[memory] ${external.length} new chat signal(s): ${external.map(m => `${m.handle}: "${m.text.slice(0, 40)}"`).join(', ')}`);
    }

    return external.map(m => ({
      type: 'chat' as const,
      data: { handle: m.handle, text: m.text, id: m.id, ts: m.ts },
    }));
  } catch (err) {
    console.log(`[memory] chat poll failed: ${(err as Error).message}`);
    return [];
  }
}

// --- things_noticed ---

export async function buildThingsNoticed(signal: Signal): Promise<void> {
  const parts: string[] = [];

  // Signal that triggered this call
  if (signal.type === 'chat') {
    parts.push(`signal: chat from ${signal.data.handle}`);
    parts.push(`message: "${signal.data.text}"`);
  } else if (signal.type === 'tick') {
    parts.push(`signal: tick`);
    parts.push(`stage_impulse: ${signal.data.stageImpulse}`);
  }

  // Recent chat
  try {
    const res = await fetch(`${FRAME_URL}/api/chat?count=20`);
    if (res.ok) {
      const msgs = await res.json() as Array<{ handle: string; text: string; ts: number }>;
      if (msgs.length > 0) {
        parts.push('');
        parts.push('recent_chat:');
        for (const m of msgs) {
          const time = new Date(m.ts).toISOString().slice(11, 19);
          parts.push(`  [${time}] ${m.handle}: ${m.text}`);
        }
      }
    }
  } catch {}

  // Artifact inventory
  try {
    const res = await fetch(`${FRAME_URL}/api/artifacts`);
    if (res.ok) {
      const arts = await res.json() as Array<{ name: string; type: string }>;
      if (arts.length > 0) {
        parts.push('');
        parts.push('artifacts:');
        for (const a of arts) {
          parts.push(`  ${a.name} (${a.type})`);
        }
      }
    }
  } catch {}

  // Current stage
  const identity = readSection('identity.md');
  const stageMatch = identity.match(/current_stage:\s*(\d+)/);
  if (stageMatch) {
    parts.push('');
    parts.push(`current_stage: ${stageMatch[1]}`);
  }

  const content = parts.join('\n');
  console.log(`[memory] things_noticed: ${parts.length} parts, ${content.length} chars`);
  writeSection('things_noticed.md', content);
}

// --- history ---

export function recordHistory(actions: ActionRecord[]): void {
  if (actions.length === 0) {
    console.log('[memory] no actions to record');
    return;
  }
  console.log(`[memory] recording ${actions.length} action(s) to history`);

  const current = readSection('history.md');
  const ts = new Date().toISOString().slice(0, 19);

  const lines: string[] = [`[${ts}]`];
  for (const a of actions) {
    const inputSummary = summarizeInput(a.input);
    lines.push(`  ${a.tool}(${inputSummary}) → ${a.result.slice(0, 80)}`);
  }

  const entry = lines.join('\n');
  let updated = current.trim() ? current.trim() + '\n\n' + entry : entry;

  // Cap history
  while (updated.length > HISTORY_CAP) {
    const idx = updated.indexOf('\n\n');
    if (idx === -1) break;
    updated = updated.slice(idx + 2);
  }

  writeSection('history.md', updated);
}

function summarizeInput(input: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(input)) {
    const val = typeof v === 'string'
      ? (v.length > 40 ? v.slice(0, 37) + '...' : v)
      : JSON.stringify(v);
    parts.push(`${k}: ${val}`);
  }
  return parts.join(', ');
}

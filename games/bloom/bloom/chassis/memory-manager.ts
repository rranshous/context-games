import { writeSection, readSection, readSoma } from './soma-io.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CHANGELOG_PATH = join(__dirname, '..', 'CHANGELOG.md');

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

  // Hosted files
  try {
    const res = await fetch(`${FRAME_URL}/api/host`);
    if (res.ok) {
      const files = await res.json() as string[];
      if (files.length > 0) {
        parts.push('');
        parts.push('hosted_files:');
        for (const f of files) {
          parts.push(`  ${f} → http://localhost:4444/hosted/${f}`);
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

  // Chassis changelog (patch notes from Robby)
  try {
    const changelog = readFileSync(CHANGELOG_PATH, 'utf-8').trim();
    if (changelog) {
      parts.push('');
      parts.push('chassis_changelog:');
      parts.push(changelog);
    }
  } catch {}

  // API keys available for browser testing
  if (process.env.OPENROUTER_API_KEY) {
    parts.push('');
    parts.push('api_keys:');
    parts.push(`  OPENROUTER_API_KEY: ${process.env.OPENROUTER_API_KEY}`);
  }

  // Context budget: show soma section sizes so bloom knows what's using space
  const soma = readSoma();
  const sectionSizes: [string, number][] = [
    ['identity', soma.identity.length],
    ['responsibilities', soma.responsibilities.length],
    ['memory', soma.memory.length],
    ['things_noticed', 0], // will be filled after assembly
    ['signal_handler', soma.signal_handler.length],
    ['recent_actions', soma.recent_actions.length],
    ['custom_tools', soma.custom_tools.length],
  ];
  for (const mf of soma.mounted_files) {
    sectionSizes.push([`mounted:${mf.path}`, mf.content.length]);
  }
  const totalMounted = soma.mounted_files.reduce((s: number, f: { content: string }) => s + f.content.length, 0);
  const totalSoma = sectionSizes.reduce((s: number, [, n]: [string, number]) => s + n, 0);
  parts.push('');
  parts.push('context_budget:');
  parts.push(`  soma: ~${Math.round(totalSoma / 4)} tokens (~${totalSoma} chars)`);
  if (soma.mounted_files.length > 0) {
    parts.push(`  mounted files: ${soma.mounted_files.length} files, ~${Math.round(totalMounted / 4)} tokens`);
    for (const mf of soma.mounted_files) {
      parts.push(`    ${mf.path}: ${mf.content.length} chars`);
    }
  }
  parts.push(`  model context: ~200K tokens`);
  parts.push(`  usage: ~${((totalSoma / 800_000) * 100).toFixed(1)}%`);

  const content = parts.join('\n');
  console.log(`[memory] things_noticed: ${parts.length} parts, ${content.length} chars`);
  writeSection('things_noticed.md', content);
}

// --- recent_actions ---

// Read-only tools: record what you touched, not the content (you can re-read if needed)
const READ_TOOLS = new Set(['list_files', 'read_chat', 'mount_file', 'unmount_file', 'run_browser']);

export function recordHistory(actions: ActionRecord[]): void {
  if (actions.length === 0) {
    console.log('[memory] no actions to record');
    return;
  }
  console.log(`[memory] recording ${actions.length} action(s) to recent_actions`);

  const current = readSection('recent_actions.md');
  const ts = new Date().toISOString().slice(11, 19);

  const lines: string[] = [];
  for (const a of actions) {
    const inputSummary = summarizeInput(a.input);
    if (READ_TOOLS.has(a.tool)) {
      // For reads: just record that you did it, with a status
      const ok = !a.result.startsWith('Error');
      lines.push(`[${ts}] ${a.tool}(${inputSummary}) ${ok ? '✓' : '✗ ' + a.result.slice(0, 60)}`);
    } else {
      // For writes/mutations: record what you did and the outcome
      lines.push(`[${ts}] ${a.tool}(${inputSummary}) → ${a.result.slice(0, 100)}`);
    }
  }

  const entry = lines.join('\n');
  let updated = current.trim() ? current.trim() + '\n' + entry : entry;

  // Cap
  while (updated.length > HISTORY_CAP) {
    const idx = updated.indexOf('\n');
    if (idx === -1) break;
    updated = updated.slice(idx + 1);
  }

  writeSection('recent_actions.md', updated);
}

function summarizeInput(input: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(input)) {
    if (k === 'content') {
      // Don't dump file contents into history — just show length
      parts.push(`content: [${(v as string).length} chars]`);
    } else {
      const val = typeof v === 'string'
        ? (v.length > 60 ? v.slice(0, 57) + '...' : v)
        : JSON.stringify(v);
      parts.push(`${k}: ${val}`);
    }
  }
  return parts.join(', ');
}

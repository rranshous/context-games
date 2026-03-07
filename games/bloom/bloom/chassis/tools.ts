import { writeSection, readSection } from './soma-io.js';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type Anthropic from '@anthropic-ai/sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..');

const FRAME_URL = process.env.FRAME_URL || 'http://localhost:4444';

// --- Tool registry ---

interface ToolDef {
  schema: Anthropic.Tool;
  execute: (input: Record<string, unknown>) => Promise<string> | string;
}

const registry: Record<string, ToolDef> = {};

function def(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  execute: ToolDef['execute'],
): void {
  registry[name] = {
    schema: {
      name,
      description,
      input_schema: {
        type: 'object' as const,
        properties,
        required,
        additionalProperties: false,
      },
    },
    execute,
  };
}

// --- Soma tools ---

def('update_identity', 'Rewrite your identity section. This is who you are.',
  { content: { type: 'string', description: 'New identity content' } }, ['content'],
  (input) => { writeSection('identity.md', input.content as string); return 'Identity updated.'; },
);

def('update_memory', 'Rewrite your working memory.',
  { content: { type: 'string', description: 'New memory content' } }, ['content'],
  (input) => { writeSection('memory.md', input.content as string); return 'Memory updated.'; },
);

def('update_signal_handlers', 'Rewrite your signal handler code.',
  { content: { type: 'string', description: 'New signal handler code' } }, ['content'],
  (input) => { writeSection('signal-handlers.ts', input.content as string); return 'Signal handlers updated.'; },
);

def('append_history', 'Append a timestamped entry to your history.',
  { entry: { type: 'string', description: 'History entry to append' } }, ['entry'],
  (input) => {
    const current = readSection('history.md');
    const ts = new Date().toISOString();
    const updated = current + (current.trim() ? '\n\n' : '') + `## ${ts}\n${input.entry}`;
    writeSection('history.md', updated);
    return 'History entry appended.';
  },
);

// --- File tools ---

def('read_file', 'Read a file from the repository.',
  { path: { type: 'string', description: 'Path relative to repo root' } }, ['path'],
  (input) => {
    try {
      return readFileSync(join(REPO_ROOT, input.path as string), 'utf-8');
    } catch (err: unknown) {
      return `Error: ${(err as Error).message}`;
    }
  },
);

def('write_file', 'Write or create a file in the repository.',
  {
    path: { type: 'string', description: 'Path relative to repo root' },
    content: { type: 'string', description: 'File content' },
  }, ['path', 'content'],
  (input) => {
    const fullPath = join(REPO_ROOT, input.path as string);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, input.content as string, 'utf-8');
    return `Written: ${input.path}`;
  },
);

def('list_files', 'List files and directories.',
  { path: { type: 'string', description: 'Path relative to repo root (default: root)' } }, [],
  (input) => {
    const dir = join(REPO_ROOT, (input.path as string) || '.');
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      return entries
        .filter(e => e.name !== 'node_modules' && e.name !== '.git')
        .map(e => `${e.isDirectory() ? 'd' : 'f'} ${e.name}`)
        .join('\n') || '(empty)';
    } catch (err: unknown) {
      return `Error: ${(err as Error).message}`;
    }
  },
);

// --- Frame tools ---

def('post_chat', 'Post a message to the chat. This is how you talk to Robby.',
  { text: { type: 'string', description: 'Message text' } }, ['text'],
  async (input) => {
    const res = await fetch(`${FRAME_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: 'bloom', text: input.text }),
    });
    if (!res.ok) return `Error: ${res.status} ${await res.text()}`;
    return JSON.stringify(await res.json());
  },
);

def('read_chat', 'Read recent chat messages.',
  { count: { type: 'number', description: 'Number of messages to read (default: 20)' } }, [],
  async (input) => {
    const count = (input.count as number) || 20;
    const res = await fetch(`${FRAME_URL}/api/chat?count=${count}`);
    if (!res.ok) return `Error: ${res.status}`;
    return JSON.stringify(await res.json());
  },
);

def('deliver_artifact', 'Deliver an artifact (file, code, content) to the frame.',
  {
    name: { type: 'string', description: 'Artifact name' },
    content: { type: 'string', description: 'Artifact content' },
    type: { type: 'string', description: 'MIME type (default: text/plain)' },
  }, ['name', 'content'],
  async (input) => {
    const res = await fetch(`${FRAME_URL}/api/artifacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handle: 'bloom',
        name: input.name,
        content: input.content,
        type: input.type || 'text/plain',
      }),
    });
    if (!res.ok) return `Error: ${res.status} ${await res.text()}`;
    return JSON.stringify(await res.json());
  },
);

def('list_artifacts', 'List all delivered artifacts.',
  {}, [],
  async () => {
    const res = await fetch(`${FRAME_URL}/api/artifacts`);
    if (!res.ok) return `Error: ${res.status}`;
    return JSON.stringify(await res.json());
  },
);

// --- Export ---

export function buildToolSchemas(): Anthropic.Tool[] {
  return Object.values(registry).map(t => t.schema);
}

export async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  const tool = registry[name];
  if (!tool) return `Unknown tool: ${name}`;
  return tool.execute(input);
}

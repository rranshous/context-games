import { writeSection, readSection } from './soma-io.js';
import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
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

def('update_responsibilities', 'Rewrite your responsibilities section. This is what you are doing now.',
  { content: { type: 'string', description: 'New responsibilities content' } }, ['content'],
  (input) => { writeSection('responsibilities.md', input.content as string); return 'Responsibilities updated.'; },
);

def('update_memory', 'Rewrite your memory. Your persistent notes and state.',
  { content: { type: 'string', description: 'New memory content' } }, ['content'],
  (input) => { writeSection('memory.md', input.content as string); return 'Memory updated.'; },
);

def('update_signal_handler', 'Rewrite your signal handler function. Controls how you respond to signals.',
  { content: { type: 'string', description: 'New signal handler code (a function that takes signal and returns impulse string or null)' } }, ['content'],
  (input) => { writeSection('signal_handler.js', input.content as string); return 'Signal handler updated.'; },
);

// --- Custom tool management ---

def('add_custom_tool', 'Add a new custom tool to your soma.',
  {
    name: { type: 'string', description: 'Tool name' },
    description: { type: 'string', description: 'Tool description' },
    input_schema: { type: 'string', description: 'JSON string of the input schema object' },
    function_body: { type: 'string', description: 'JS function body: function(input) { ... }' },
  }, ['name', 'description', 'input_schema', 'function_body'],
  (input) => {
    const tools = parseCustomTools();
    const existing = tools.findIndex(t => t.name === input.name);
    if (existing !== -1) return `Error: tool "${input.name}" already exists. Use edit_custom_tool.`;
    tools.push({
      name: input.name as string,
      description: input.description as string,
      input_schema: JSON.parse(input.input_schema as string),
      function_body: input.function_body as string,
    });
    writeSection('custom_tools.json', JSON.stringify(tools, null, 2));
    return `Custom tool "${input.name}" added.`;
  },
);

def('edit_custom_tool', 'Edit an existing custom tool.',
  {
    name: { type: 'string', description: 'Tool name to edit' },
    description: { type: 'string', description: 'New description (optional)' },
    input_schema: { type: 'string', description: 'New JSON input schema (optional)' },
    function_body: { type: 'string', description: 'New function body (optional)' },
  }, ['name'],
  (input) => {
    const tools = parseCustomTools();
    const idx = tools.findIndex(t => t.name === input.name);
    if (idx === -1) return `Error: tool "${input.name}" not found.`;
    if (input.description) tools[idx].description = input.description as string;
    if (input.input_schema) tools[idx].input_schema = JSON.parse(input.input_schema as string);
    if (input.function_body) tools[idx].function_body = input.function_body as string;
    writeSection('custom_tools.json', JSON.stringify(tools, null, 2));
    return `Custom tool "${input.name}" updated.`;
  },
);

def('remove_custom_tool', 'Remove a custom tool from your soma.',
  { name: { type: 'string', description: 'Tool name to remove' } }, ['name'],
  (input) => {
    const tools = parseCustomTools();
    const idx = tools.findIndex(t => t.name === input.name);
    if (idx === -1) return `Error: tool "${input.name}" not found.`;
    tools.splice(idx, 1);
    writeSection('custom_tools.json', JSON.stringify(tools, null, 2));
    return `Custom tool "${input.name}" removed.`;
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

def('append_file', 'Append content to an existing file. Use this to write large files in chunks.',
  {
    path: { type: 'string', description: 'Path relative to repo root' },
    content: { type: 'string', description: 'Content to append' },
  }, ['path', 'content'],
  (input) => {
    const fullPath = join(REPO_ROOT, input.path as string);
    if (!existsSync(fullPath)) return `Error: file does not exist. Use write_file to create it first.`;
    appendFileSync(fullPath, input.content as string, 'utf-8');
    return `Appended to: ${input.path}`;
  },
);

def('replace_in_file', 'Replace an exact string in a file. The old_string must appear exactly once in the file. Use this for targeted edits.',
  {
    path: { type: 'string', description: 'Path relative to repo root' },
    old_string: { type: 'string', description: 'Exact string to find (must be unique in the file)' },
    new_string: { type: 'string', description: 'Replacement string' },
  }, ['path', 'old_string', 'new_string'],
  (input) => {
    const fullPath = join(REPO_ROOT, input.path as string);
    if (!existsSync(fullPath)) return `Error: file not found: ${input.path}`;
    const content = readFileSync(fullPath, 'utf-8');
    const old = input.old_string as string;
    const idx = content.indexOf(old);
    if (idx === -1) return `Error: old_string not found in ${input.path}. Make sure it matches exactly (including whitespace).`;
    if (content.indexOf(old, idx + 1) !== -1) return `Error: old_string appears multiple times. Provide more surrounding context to make it unique.`;
    writeFileSync(fullPath, content.slice(0, idx) + (input.new_string as string) + content.slice(idx + old.length), 'utf-8');
    return `Replaced in: ${input.path}`;
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

// --- Custom tool compilation ---

interface CustomToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  function_body: string;
}

function parseCustomTools(): CustomToolDef[] {
  const raw = readSection('custom_tools.json');
  if (!raw.trim()) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function compileCustomTools(customToolsJson: string): Anthropic.Tool[] {
  if (!customToolsJson.trim()) return [];
  let tools: CustomToolDef[];
  try {
    tools = JSON.parse(customToolsJson);
  } catch {
    return [];
  }

  const schemas: Anthropic.Tool[] = [];
  for (const tool of tools) {
    // Register in runtime registry so executeTool can find them
    try {
      const fn = new Function('return ' + tool.function_body)() as (input: Record<string, unknown>) => unknown;
      registry[tool.name] = {
        schema: {
          name: tool.name,
          description: tool.description,
          input_schema: {
            type: 'object' as const,
            ...tool.input_schema,
            additionalProperties: false,
          },
        },
        execute: (input) => {
          const result = fn(input);
          return typeof result === 'string' ? result : JSON.stringify(result);
        },
      };
      schemas.push(registry[tool.name].schema);
    } catch (err: unknown) {
      console.error(`[bloom] custom tool "${tool.name}" compile error: ${(err as Error).message}`);
    }
  }
  return schemas;
}

// --- Export ---

export function buildToolSchemas(): Anthropic.Tool[] {
  return Object.values(registry).map(t => t.schema);
}

export async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  const tool = registry[name];
  if (!tool) return `Unknown tool: ${name}`;
  return tool.execute(input);
}

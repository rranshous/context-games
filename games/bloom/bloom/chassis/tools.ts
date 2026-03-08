import { writeSection, readSection, readMountedPaths, writeMountedPaths, isFileMounted } from './soma-io.js';
import { runBrowser, type BrowserResult } from './browser.js';
import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import type Anthropic from '@anthropic-ai/sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..');

const FRAME_URL = process.env.FRAME_URL || 'http://localhost:4444';

// Write boundary: bloom can only write within its project root (REPO_ROOT).
// Reads (mount, list) are unrestricted. Writes must resolve inside REPO_ROOT.
function assertWritable(relPath: string): string | null {
  const full = resolve(REPO_ROOT, relPath);
  if (!full.startsWith(REPO_ROOT + '/') && full !== REPO_ROOT) {
    return `Cannot write to "${relPath}" — that path is outside your project directory. You can write anywhere within bloom/ (soma, chassis, games, etc.) but not above it. Use mount_file to read files outside your project.`;
  }
  return null;
}

// --- Tool registry ---

// Tool results can be plain strings or structured content (for images)
export type ToolContent = string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>;

interface ToolDef {
  schema: Anthropic.Tool;
  execute: (input: Record<string, unknown>) => Promise<ToolContent> | ToolContent;
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

// --- Mount tools ---

def('mount_file', 'Mount a file into your soma. The file contents become part of your system prompt every turn. You must mount a file before you can edit it. Use this to bring a file into your working awareness.',
  { path: { type: 'string', description: 'Path relative to repo root' } }, ['path'],
  (input) => {
    const p = input.path as string;
    const fullPath = join(REPO_ROOT, p);
    if (!existsSync(fullPath)) return `Error: file not found: ${p}`;
    const paths = readMountedPaths();
    if (paths.includes(p)) return `Already mounted: ${p}`;
    paths.push(p);
    writeMountedPaths(paths);
    return `Mounted: ${p} — it is now part of your soma.`;
  },
);

def('unmount_file', 'Unmount a file from your soma. The file stays on disk but is no longer part of your system prompt. Use this when you are done working on a file.',
  { path: { type: 'string', description: 'Path relative to repo root' } }, ['path'],
  (input) => {
    const p = input.path as string;
    const paths = readMountedPaths();
    const idx = paths.indexOf(p);
    if (idx === -1) return `Error: ${p} is not mounted.`;
    paths.splice(idx, 1);
    writeMountedPaths(paths);
    return `Unmounted: ${p} — removed from soma, file unchanged on disk.`;
  },
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

// read_file removed — use mount_file to bring files into your soma

def('write_file', 'Create a new file in the repository. Auto-mounts the file into your soma so you can see and edit it.',
  {
    path: { type: 'string', description: 'Path relative to repo root' },
    content: { type: 'string', description: 'File content' },
  }, ['path', 'content'],
  (input) => {
    const p = input.path as string;
    const err = assertWritable(p);
    if (err) return err;
    const fullPath = resolve(REPO_ROOT, p);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, input.content as string, 'utf-8');
    // Auto-mount
    const paths = readMountedPaths();
    if (!paths.includes(p)) {
      paths.push(p);
      writeMountedPaths(paths);
    }
    return `Written and mounted: ${p}`;
  },
);

// append_file removed — caused duplication confusion. Use write_file for new files, replace_in_file for edits.

def('replace_in_file', 'Replace an exact string in a mounted file. File must be mounted first. The old_string must appear exactly once.',
  {
    path: { type: 'string', description: 'Path relative to repo root' },
    old_string: { type: 'string', description: 'Exact string to find (must be unique in the file)' },
    new_string: { type: 'string', description: 'Replacement string' },
  }, ['path', 'old_string', 'new_string'],
  (input) => {
    const p = input.path as string;
    const err = assertWritable(p);
    if (err) return err;
    if (!isFileMounted(p)) return `Error: ${p} is not mounted. Use mount_file first.`;
    const fullPath = resolve(REPO_ROOT, p);
    if (!existsSync(fullPath)) return `Error: file not found: ${p}`;
    const content = readFileSync(fullPath, 'utf-8');
    const old = input.old_string as string;
    const idx = content.indexOf(old);
    if (idx === -1) return `Error: old_string not found in ${p}. Make sure it matches exactly (including whitespace).`;
    if (content.indexOf(old, idx + 1) !== -1) return `Error: old_string appears multiple times. Provide more surrounding context to make it unique.`;
    writeFileSync(fullPath, content.slice(0, idx) + (input.new_string as string) + content.slice(idx + old.length), 'utf-8');
    return `Replaced in: ${p}`;
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

// post_chat removed — text blocks in responses auto-post to chat (see loop.ts)

def('read_chat', 'Read recent chat messages.',
  { count: { type: 'number', description: 'Number of messages to read (default: 20)' } }, [],
  async (input) => {
    const count = (input.count as number) || 20;
    const res = await fetch(`${FRAME_URL}/api/chat?count=${count}`);
    if (!res.ok) return `Error: ${res.status}`;
    return JSON.stringify(await res.json());
  },
);

def('host_file', 'Register a file to be served via HTTP by the frame. Returns the URL. The file must exist within your project. Edits to the file on disk are immediately reflected at the URL.',
  { path: { type: 'string', description: 'Path relative to bloom root (e.g. games/qacky/index.html)' } }, ['path'],
  async (input) => {
    const p = input.path as string;
    const res = await fetch(`${FRAME_URL}/api/host`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: p }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      return `Error: ${(err as Record<string, string>).error || res.statusText}`;
    }
    const data = await res.json() as { url: string; path: string };
    return `Hosted: ${data.url}`;
  },
);

def('run_browser', 'Run a Playwright script in a headless browser. Write async JavaScript that uses the `page` variable (a Playwright Page object). A screenshot is automatically taken after execution and returned as an image. The browser persists across calls within a dispatch — navigate once, then interact across multiple calls.',
  { code: { type: 'string', description: 'Async JavaScript to execute. Has access to `page` (Playwright Page). Example: await page.goto("http://..."); return await page.title();' } }, ['code'],
  async (input): Promise<ToolContent> => {
    const result: BrowserResult = await runBrowser(input.code as string);
    const content: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [
      { type: 'text', text: result.text },
    ];
    if (result.consoleMessages && result.consoleMessages.length > 0) {
      content.push({ type: 'text', text: `Console:\n${result.consoleMessages.join('\n')}` });
    }
    if (result.screenshot) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: result.screenshot },
      });
    }
    return content;
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

export async function executeTool(name: string, input: Record<string, unknown>): Promise<ToolContent> {
  const tool = registry[name];
  if (!tool) return `Unknown tool: ${name}`;
  return tool.execute(input);
}

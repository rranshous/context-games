import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SOMA_DIR = join(__dirname, '..', 'soma');
const REPO_ROOT = join(__dirname, '..', '..');

export interface MountedFile {
  path: string;
  content: string;
}

export interface Soma {
  identity: string;
  responsibilities: string;
  memory: string;
  things_noticed: string;
  signal_handler: string;
  recent_actions: string;
  custom_tools: string;
  mounted_files: MountedFile[];
}

export function readMountedPaths(): string[] {
  try {
    const raw = readFileSync(join(SOMA_DIR, 'mounted_files.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function writeMountedPaths(paths: string[]): void {
  writeFileSync(join(SOMA_DIR, 'mounted_files.json'), JSON.stringify(paths, null, 2), 'utf-8');
}

export function isFileMounted(path: string): boolean {
  return readMountedPaths().includes(path);
}

export function readSoma(): Soma {
  const mountedPaths = readMountedPaths();
  const mounted_files: MountedFile[] = [];
  for (const p of mountedPaths) {
    const fullPath = join(REPO_ROOT, p);
    try {
      const content = readFileSync(fullPath, 'utf-8');
      mounted_files.push({ path: p, content });
    } catch {
      mounted_files.push({ path: p, content: `[ERROR: file not found: ${p}]` });
    }
  }

  return {
    identity: readSection('identity.md'),
    responsibilities: readSection('responsibilities.md'),
    memory: readSection('memory.md'),
    things_noticed: readSection('things_noticed.md'),
    signal_handler: readSection('signal_handler.js'),
    recent_actions: readSection('recent_actions.md'),
    custom_tools: readSection('custom_tools.json'),
    mounted_files,
  };
}

export function readSection(filename: string): string {
  try {
    return readFileSync(join(SOMA_DIR, filename), 'utf-8');
  } catch {
    return '';
  }
}

export function writeSection(filename: string, content: string): void {
  writeFileSync(join(SOMA_DIR, filename), content, 'utf-8');
}

export function assembleSomaPrompt(soma: Soma): string {
  const sections: [string, string][] = [
    ['identity', soma.identity],
    ['responsibilities', soma.responsibilities],
    ['memory', soma.memory],
    ['things_noticed', soma.things_noticed],
    ['signal_handler', soma.signal_handler],
    ['recent_actions', soma.recent_actions],
    ['custom_tools', soma.custom_tools],
  ];

  const parts = sections
    .filter(([, content]) => content.trim())
    .map(([name, content]) => `<${name}>\n${content}\n</${name}>`);

  for (const mf of soma.mounted_files) {
    parts.push(`<mounted:${mf.path}>\n${mf.content}\n</mounted:${mf.path}>`);
  }

  return parts.join('\n\n');
}

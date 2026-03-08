import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SOMA_DIR = join(__dirname, '..', 'soma');

export interface Soma {
  identity: string;
  responsibilities: string;
  memory: string;
  things_noticed: string;
  signal_handler: string;
  history: string;
  custom_tools: string;
}

export function readSoma(): Soma {
  return {
    identity: readSection('identity.md'),
    responsibilities: readSection('responsibilities.md'),
    memory: readSection('memory.md'),
    things_noticed: readSection('things_noticed.md'),
    signal_handler: readSection('signal_handler.js'),
    history: readSection('history.md'),
    custom_tools: readSection('custom_tools.json'),
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
    ['history', soma.history],
    ['custom_tools', soma.custom_tools],
  ];
  return sections
    .filter(([, content]) => content.trim())
    .map(([name, content]) => `<${name}>\n${content}\n</${name}>`)
    .join('\n\n');
}

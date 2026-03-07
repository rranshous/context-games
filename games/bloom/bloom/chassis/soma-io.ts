import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SOMA_DIR = join(__dirname, '..', 'soma');

export interface Soma {
  identity: string;
  memory: string;
  signal_handlers: string;
  history: string;
}

export function readSoma(): Soma {
  return {
    identity: readSection('identity.md'),
    memory: readSection('memory.md'),
    signal_handlers: readSection('signal-handlers.ts'),
    history: readSection('history.md'),
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
  const parts: string[] = [];
  if (soma.identity) parts.push(`<identity>\n${soma.identity}\n</identity>`);
  if (soma.memory) parts.push(`<memory>\n${soma.memory}\n</memory>`);
  if (soma.signal_handlers) parts.push(`<signal_handlers>\n${soma.signal_handlers}\n</signal_handlers>`);
  if (soma.history) parts.push(`<history>\n${soma.history}\n</history>`);
  return parts.join('\n\n');
}

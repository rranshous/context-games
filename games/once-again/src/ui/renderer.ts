import { GameOutput } from '../engine/types.js';

const outputEl = document.getElementById('output')!;
const statusInfoEl = document.getElementById('status-info')!;

export function appendOutput(outputs: GameOutput[]): void {
  for (const output of outputs) {
    const line = document.createElement('div');

    if (output.text === '') {
      line.className = 'output-break';
    } else {
      line.className = `output-line ${output.type}`;
      line.textContent = output.text;
    }

    outputEl.appendChild(line);
  }

  scrollToBottom();
}

export function appendEcho(text: string): void {
  const line = document.createElement('div');
  line.className = 'output-line echo';
  line.textContent = `> ${text}`;
  outputEl.appendChild(line);

  // Small gap after echo
  const gap = document.createElement('div');
  gap.style.height = '4px';
  outputEl.appendChild(gap);

  scrollToBottom();
}

export function appendBreak(): void {
  const br = document.createElement('div');
  br.className = 'output-break';
  outputEl.appendChild(br);
}

export function updateStatusBar(text: string): void {
  statusInfoEl.textContent = text;
}

function scrollToBottom(): void {
  outputEl.scrollTop = outputEl.scrollHeight;
}

/**
 * Append outputs with delays between lines for dramatic effect.
 */
export function appendOutputSequence(
  outputs: GameOutput[],
  delayMs: number = 400,
): Promise<void> {
  return new Promise((resolve) => {
    let i = 0;
    function next() {
      if (i >= outputs.length) {
        resolve();
        return;
      }
      appendOutput([outputs[i]]);
      i++;
      setTimeout(next, delayMs);
    }
    next();
  });
}

import { ActantTurn, onTurn, isThinking } from './actant.js';

const logEl = document.getElementById('inspector-log')!;
const statusEl = document.getElementById('inspector-status')!;

export function initInspector(): void {
  // Toggle collapse
  const inspector = document.getElementById('inspector')!;
  const toggleBtn = document.getElementById('inspector-toggle')!;
  toggleBtn.addEventListener('click', () => {
    inspector.classList.toggle('collapsed');
    toggleBtn.textContent = inspector.classList.contains('collapsed') ? '▶' : '◀';
  });

  // Click to expand/collapse entries
  logEl.addEventListener('click', (e) => {
    const header = (e.target as HTMLElement).closest('.inspector-entry-header');
    if (header) {
      header.parentElement!.classList.toggle('expanded');
    }
  });

  // Listen for actant turns
  onTurn((turn) => {
    addEntry(turn);
    updateStatus();
  });
}

export function setStatus(msg: string, className: string = ''): void {
  statusEl.textContent = msg;
  statusEl.className = `inspector-status ${className}`;
}

function updateStatus(): void {
  if (isThinking()) {
    setStatus('Thinking...', 'thinking');
  } else {
    setStatus('Idle');
  }
}

function addEntry(turn: ActantTurn): void {
  // Remove the idle status message if it's still there
  statusEl.style.display = 'none';

  const entry = document.createElement('div');
  entry.className = 'inspector-entry expanded'; // auto-expand newest

  // Collapse all previous entries
  logEl.querySelectorAll('.inspector-entry.expanded').forEach((el) => {
    el.classList.remove('expanded');
  });

  const time = new Date(turn.timestamp).toLocaleTimeString();

  entry.innerHTML = `
    <div class="inspector-entry-header">
      <span>
        <span class="turn-label">T${turn.turn}</span>
        <span class="command-label">${escapeHtml(turn.command)}</span>
      </span>
      <span>${time}</span>
    </div>
    <div class="inspector-entry-body">
      <div class="inspector-section">
        <div class="inspector-section-label">Prompt sent</div>
        <div class="inspector-section-content prompt">${escapeHtml(turn.prompt)}</div>
      </div>
      <div class="inspector-section">
        <div class="inspector-section-label">Model response</div>
        <div class="inspector-section-content response">${escapeHtml(turn.response)}</div>
      </div>
      <div class="inspector-section">
        <div class="inspector-section-label">Command executed</div>
        <div class="inspector-section-content">${escapeHtml(turn.command)}</div>
      </div>
      <div class="inspector-section">
        <div class="inspector-section-label">Game output</div>
        <div class="inspector-section-content game-output">${escapeHtml(turn.gameOutput)}</div>
      </div>
    </div>
  `;

  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

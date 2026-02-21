import type { SimCommand } from '../interface/commands.js';

// ── Controls panel ───────────────────────────────────────

export class Controls {
  private container: HTMLElement;
  private send: (cmd: SimCommand) => void;
  private paused = false;
  private speed = 10;

  constructor(container: HTMLElement, send: (cmd: SimCommand) => void) {
    this.container = container;
    this.send = send;
    this.build();
  }

  private build(): void {
    this.container.innerHTML = '';
    this.container.style.cssText = `
      display: flex; align-items: center; gap: 12px;
      padding: 8px 16px; background: #1a1a2e; color: #ddd;
      font-family: monospace; font-size: 13px;
      border-bottom: 1px solid #333;
    `;

    // Pause / Resume
    const pauseBtn = document.createElement('button');
    pauseBtn.textContent = '⏸ Pause';
    pauseBtn.style.cssText = btnStyle();
    pauseBtn.onclick = () => {
      this.paused = !this.paused;
      this.send({ type: this.paused ? 'pause' : 'resume' });
      pauseBtn.textContent = this.paused ? '▶ Resume' : '⏸ Pause';
    };
    this.container.appendChild(pauseBtn);

    // Speed
    const speedLabel = document.createElement('span');
    speedLabel.textContent = `Speed: ${this.speed} t/s`;
    this.container.appendChild(speedLabel);

    const speedSlider = document.createElement('input');
    speedSlider.type = 'range';
    speedSlider.min = '1';
    speedSlider.max = '60';
    speedSlider.value = String(this.speed);
    speedSlider.style.cssText = 'width: 120px; cursor: pointer;';
    speedSlider.oninput = () => {
      this.speed = parseInt(speedSlider.value);
      speedLabel.textContent = `Speed: ${this.speed} t/s`;
      this.send({ type: 'setSpeed', ticksPerSecond: this.speed });
    };
    this.container.appendChild(speedSlider);

    // Consciousness toggle
    const brainBtn = document.createElement('button');
    brainBtn.textContent = 'Brain: ON';
    brainBtn.style.cssText = btnStyle();
    let consciousnessEnabled = true;
    brainBtn.onclick = () => {
      consciousnessEnabled = !consciousnessEnabled;
      this.send({ type: 'toggleConsciousness', enabled: consciousnessEnabled });
      brainBtn.textContent = consciousnessEnabled ? 'Brain: ON' : 'Brain: OFF';
    };
    this.container.appendChild(brainBtn);

    // Log area
    const logEl = document.createElement('span');
    logEl.id = 'sim-log';
    logEl.style.cssText = 'margin-left: auto; color: #888; font-size: 11px; max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
    this.container.appendChild(logEl);
  }

  showLog(message: string): void {
    const el = document.getElementById('sim-log');
    if (el) el.textContent = message;
  }
}

function btnStyle(): string {
  return `
    padding: 4px 12px; cursor: pointer;
    background: #2a2a4e; color: #ddd; border: 1px solid #444;
    border-radius: 4px; font-family: monospace; font-size: 13px;
  `;
}

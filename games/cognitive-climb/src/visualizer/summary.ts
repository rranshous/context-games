import type { CreatureState } from '../interface/state.js';
import type { StatsHistoryStore, StatsSnapshot, Milestone } from './stats-history.js';

// ── Sparkline helper ────────────────────────────────────

function drawSparkline(
  canvas: HTMLCanvasElement,
  data: number[],
  color: string,
  label: string,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx || data.length < 2) return;

  const w = canvas.width;
  const h = canvas.height;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.scale(dpr, dpr);

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = w / (data.length - 1);

  const toY = (v: number) => h - 4 - ((v - min) / range) * (h - 8);

  // Area fill
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i < data.length; i++) {
    ctx.lineTo(i * stepX, toY(data[i]));
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = color + '20';
  ctx.fill();

  // Line
  ctx.beginPath();
  for (let i = 0; i < data.length; i++) {
    const x = i * stepX;
    const y = toY(data[i]);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Current value
  const current = data[data.length - 1];
  const displayVal = current % 1 === 0 ? String(current) : current.toFixed(1);
  ctx.fillStyle = '#ddd';
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(displayVal, w - 4, 12);

  // Label
  ctx.fillStyle = '#888';
  ctx.textAlign = 'left';
  ctx.fillText(label, 4, 12);
}

// ── Summary context builder ─────────────────────────────

function buildSummaryContext(
  history: StatsHistoryStore,
  creatures: CreatureState[],
): string {
  const lines: string[] = [];
  const latest = history.getLatest();
  if (!latest) return 'No simulation data yet.';

  lines.push(`=== FULL SIMULATION SUMMARY (Tick ${latest.tick}) ===\n`);

  // Current state
  lines.push('CURRENT STATE');
  const seasonLabel = latest.season ? latest.season.charAt(0).toUpperCase() + latest.season.slice(1) : 'Unknown';
  lines.push(`Season: ${seasonLabel} | Alive: ${latest.alive} | Born: ${latest.totalBirths} | Died: ${latest.totalDeaths} | Max Gen: ${latest.maxGeneration}`);
  lines.push(`Avg energy: ${Math.round(latest.avgEnergy)}% | Variants: ${latest.variantCount} (dominant: ${latest.dominantVariantPct}%)`);
  if (latest.avgTraits) {
    const t = latest.avgTraits;
    lines.push(`Traits: spd=${t.speed.toFixed(2)}, sns=${t.senseRange.toFixed(1)}, sz=${t.size.toFixed(2)}, met=${t.metabolism.toFixed(2)}, diet=${t.diet.toFixed(2)}`);
  }
  lines.push('');

  // Population trajectory (sampled)
  const sampled = history.getSampledHistory(50);
  if (sampled.length > 1) {
    lines.push('POPULATION OVER TIME (sampled)');
    lines.push('Tick | Season | Alive | Born | Died | AvgEnergy | MaxGen | Variants');
    for (const s of sampled) {
      const sn = s.season ? s.season.charAt(0).toUpperCase() + s.season.slice(1) : '?';
      lines.push(`${s.tick} | ${sn} | ${s.alive} | ${s.totalBirths} | ${s.totalDeaths} | ${Math.round(s.avgEnergy)}% | ${s.maxGeneration} | ${s.variantCount} (${s.dominantVariantPct}%)`);
    }
    lines.push('');
  }

  // Milestones
  const milestones = history.milestones;
  if (milestones.length > 0) {
    lines.push('KEY MILESTONES');
    // Show last 30 milestones
    for (const m of milestones.slice(-30)) {
      lines.push(`  Tick ${m.tick}: ${m.text}`);
    }
    lines.push('');
  }

  // Current variant distribution
  if (creatures.length > 0) {
    lines.push('BEHAVIORAL VARIANTS (current)');
    const variantMap = new Map<number, { count: number; sample: string }>();
    for (const c of creatures) {
      const len = c.embodiment.on_tick.length;
      const existing = variantMap.get(len);
      if (existing) existing.count++;
      else variantMap.set(len, { count: 1, sample: c.embodiment.on_tick });
    }
    const variants = [...variantMap.entries()].sort((a, b) => b[1].count - a[1].count);
    for (const [len, { count }] of variants.slice(0, 3)) {
      const pct = Math.round(count / creatures.length * 100);
      lines.push(`  ${len} chars: ${count} creatures (${pct}%)`);
    }
    // Dominant variant code
    if (variants.length > 0) {
      lines.push(`\nDOMINANT CODE (${variants[0][0]} chars):`);
      lines.push('```js');
      lines.push(variants[0][1].sample);
      lines.push('```');
    }
    lines.push('');
  }

  // Notable creatures
  if (creatures.length > 0) {
    const oldest = creatures.reduce((a, b) => a.age > b.age ? a : b);
    const healthiest = creatures.reduce((a, b) =>
      (a.energy / a.maxEnergy) > (b.energy / b.maxEnergy) ? a : b);
    lines.push('NOTABLE CREATURES');
    lines.push(`Oldest: #${oldest.id} (Gen ${oldest.generation}, age ${oldest.age})`);
    lines.push(`Healthiest: #${healthiest.id} (Gen ${healthiest.generation}, ${Math.round(healthiest.energy / healthiest.maxEnergy * 100)}%)`);
  }

  return lines.join('\n');
}

const SUMMARY_SCHEMA = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'A naturalist field journal entry summarizing the full simulation run. 3-6 sentences. Cover the arc: how it started, key turning points, where it stands now. Reference creature IDs and tick numbers.' },
    },
    required: ['summary'],
    additionalProperties: false,
  },
};

const SUMMARY_SYSTEM = `You are a naturalist writing a field journal entry after observing a digital creature simulation. Summarize the ENTIRE run from start to present — the arc, not just the current moment. What were the key turning points? What survived and why? What behavioral strategies evolved? Be vivid but concise — this is a journal entry, not a paper.`;

async function callSummaryAPI(context: string): Promise<string | null> {
  try {
    const resp = await fetch('/api/inference/anthropic/messages', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: SUMMARY_SYSTEM,
        messages: [{ role: 'user', content: context }],
        output_config: { format: SUMMARY_SCHEMA },
      }),
    });

    if (!resp.ok) {
      console.error('[SUMMARY] API error:', resp.status, await resp.text());
      return null;
    }

    const data = await resp.json();
    for (const block of data.content ?? []) {
      if (block.type === 'text') {
        const parsed = JSON.parse(block.text);
        return parsed.summary;
      }
    }
    return null;
  } catch (err) {
    console.error('[SUMMARY] Call failed:', err);
    return null;
  }
}

// ── Summary Modal ───────────────────────────────────────

export class SummaryModal {
  private overlay: HTMLElement;
  private content: HTMLElement;
  isOpen = false;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'summary-overlay';
    this.overlay.style.display = 'none';
    this.overlay.onclick = (e) => {
      if (e.target === this.overlay) this.close();
    };

    this.content = document.createElement('div');
    this.content.className = 'summary-content';
    this.overlay.appendChild(this.content);

    document.body.appendChild(this.overlay);
  }

  async open(statsHistory: StatsHistoryStore, creatures: CreatureState[]): Promise<void> {
    if (this.isOpen) return;
    this.isOpen = true;
    this.overlay.style.display = 'flex';
    this.renderContent(statsHistory, creatures);

    // Fire AI summary
    const context = buildSummaryContext(statsHistory, creatures);
    console.log('[SUMMARY] Context length:', context.length);
    const narrativeEl = this.content.querySelector('.summary-narrative') as HTMLElement;
    if (narrativeEl) {
      narrativeEl.textContent = 'Generating summary...';
      narrativeEl.style.color = '#6af';
    }

    const summary = await callSummaryAPI(context);
    if (narrativeEl) {
      if (summary) {
        narrativeEl.textContent = summary;
        narrativeEl.style.color = '#ccd';
      } else {
        narrativeEl.textContent = 'Failed to generate summary — are you logged in at localhost:3000?';
        narrativeEl.style.color = '#f66';
      }
    }
  }

  close(): void {
    this.isOpen = false;
    this.overlay.style.display = 'none';
  }

  private renderContent(statsHistory: StatsHistoryStore, creatures: CreatureState[]): void {
    const history = statsHistory.getHistory();
    const latest = statsHistory.getLatest();
    this.content.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;';
    const title = document.createElement('h2');
    title.style.cssText = 'margin: 0; color: #eee; font-size: 18px; font-family: monospace;';
    title.textContent = 'Simulation Summary';
    header.appendChild(title);
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '\u00d7';
    closeBtn.style.cssText = 'background: none; border: none; color: #888; font-size: 24px; cursor: pointer; padding: 0 4px; line-height: 1;';
    closeBtn.onclick = () => this.close();
    header.appendChild(closeBtn);
    this.content.appendChild(header);

    if (!latest || history.length < 2) {
      const msg = document.createElement('div');
      msg.style.cssText = 'color: #666; font-style: italic;';
      msg.textContent = 'Not enough data yet. Let the simulation run for a while.';
      this.content.appendChild(msg);
      return;
    }

    // Key stats line
    const statsLine = document.createElement('div');
    statsLine.style.cssText = 'color: #aab; font-size: 12px; margin-bottom: 16px; padding: 8px 12px; background: #1a1a3a; border-radius: 4px;';
    statsLine.textContent = `Tick ${latest.tick}  ·  ${latest.alive} alive  ·  ${latest.totalBirths} born  ·  ${latest.totalDeaths} died  ·  Gen ${latest.maxGeneration}`;
    this.content.appendChild(statsLine);

    // Charts
    const chartsRow = document.createElement('div');
    chartsRow.style.cssText = 'display: flex; gap: 12px; margin-bottom: 16px;';

    const popCanvas = this.createChart(chartsRow, 'Population');
    drawSparkline(popCanvas, history.map(s => s.alive), '#4c4', 'Population');

    const energyCanvas = this.createChart(chartsRow, 'Avg Energy');
    drawSparkline(energyCanvas, history.map(s => s.avgEnergy), '#6af', 'Avg Energy %');

    const genCanvas = this.createChart(chartsRow, 'Max Generation');
    drawSparkline(genCanvas, history.map(s => s.maxGeneration), '#da6', 'Max Gen');

    this.content.appendChild(chartsRow);

    // Milestones
    const milestones = statsHistory.milestones;
    if (milestones.length > 0) {
      const msSection = document.createElement('div');
      msSection.style.cssText = 'margin-bottom: 16px;';
      const msTitle = document.createElement('div');
      msTitle.style.cssText = 'color: #8888cc; font-size: 11px; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;';
      msTitle.textContent = 'Milestones';
      msSection.appendChild(msTitle);

      const msList = document.createElement('div');
      msList.style.cssText = 'max-height: 150px; overflow-y: auto; font-size: 11px; line-height: 1.6;';
      // Show most recent first
      for (const m of [...milestones].reverse().slice(0, 30)) {
        const row = document.createElement('div');
        row.style.cssText = 'color: #aab;';
        const tickSpan = document.createElement('span');
        tickSpan.style.cssText = 'color: #666; margin-right: 6px;';
        tickSpan.textContent = `t${m.tick}`;
        row.appendChild(tickSpan);
        row.appendChild(document.createTextNode(m.text));
        msList.appendChild(row);
      }
      msSection.appendChild(msList);
      this.content.appendChild(msSection);
    }

    // AI Narrative
    const narSection = document.createElement('div');
    const narTitle = document.createElement('div');
    narTitle.style.cssText = 'color: #8888cc; font-size: 11px; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;';
    narTitle.textContent = 'Field Notes';
    narSection.appendChild(narTitle);
    const narrativeEl = document.createElement('div');
    narrativeEl.className = 'summary-narrative';
    narrativeEl.style.cssText = 'font-size: 12px; line-height: 1.6; color: #6af; white-space: pre-wrap; word-break: break-word;';
    narrativeEl.textContent = 'Generating summary...';
    narSection.appendChild(narrativeEl);
    this.content.appendChild(narSection);
  }

  private createChart(parent: HTMLElement, label: string): HTMLCanvasElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'flex: 1; min-width: 0;';
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    canvas.style.cssText = 'width: 100%; height: 50px; border-radius: 3px; background: #1a1a3a;';
    wrapper.appendChild(canvas);
    parent.appendChild(wrapper);
    return canvas;
  }
}

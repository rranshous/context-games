import type { CellState, CreatureState, SimStats } from '../interface/state.js';

// ── Types ───────────────────────────────────────────────

export interface ObserverReport {
  headline: string;
  narrative: string;
  mood: 'thriving' | 'struggling' | 'crisis' | 'evolving' | 'stable';
  watch_for: string;
  scratchpad: string;
}

interface ReportEntry {
  tick: number;
  report: ObserverReport;
  expanded: boolean;
}

// ── Context builder ─────────────────────────────────────

export function buildObserverContext(
  creatures: CreatureState[],
  cells: CellState[],
  stats: SimStats,
  eventBuffer: string[],
  recentlyEditedIds: number[],
  previousScratchpad: string | null,
): string {
  const lines: string[] = [];
  const tick = stats.tick;

  lines.push(`=== SIMULATION SNAPSHOT (Tick ${tick}) ===\n`);

  // ── Global stats
  lines.push('GLOBAL STATS');
  const seasonLabel = stats.season ? stats.season.charAt(0).toUpperCase() + stats.season.slice(1) : 'Unknown';
  lines.push(`Season: ${seasonLabel} | Alive: ${stats.creatureCount} | Born: ${stats.totalBirths} | Died: ${stats.totalDeaths} (starvation: ${stats.deathsByStarvation}, hazard: ${stats.deathsByHazard})`);
  const avgEnergyPct = creatures.length > 0
    ? Math.round(creatures.reduce((s, c) => s + c.energy / c.maxEnergy, 0) / creatures.length * 100)
    : 0;
  lines.push(`Avg energy: ${avgEnergyPct}% of max | Max generation: ${stats.maxGeneration}`);
  if (stats.avgTraits) {
    const t = stats.avgTraits;
    lines.push(`Traits: spd=${t.speed.toFixed(2)}, sns=${t.senseRange.toFixed(1)}, sz=${t.size.toFixed(2)}, met=${t.metabolism.toFixed(2)}, diet=${t.diet.toFixed(2)}`);
  }
  const foodCells = cells.filter(c => c.food > 0).length;
  lines.push(`Food available: ${foodCells} cells with food (out of ${cells.length} total)\n`);

  // ── Behavioral genetics — on_tick variant distribution
  lines.push('BEHAVIORAL GENETICS');
  const variantMap = new Map<number, { count: number; sample: string }>();
  for (const c of creatures) {
    const len = c.embodiment.on_tick.length;
    const existing = variantMap.get(len);
    if (existing) {
      existing.count++;
    } else {
      variantMap.set(len, { count: 1, sample: c.embodiment.on_tick });
    }
  }
  const variants = [...variantMap.entries()].sort((a, b) => b[1].count - a[1].count);
  const defaultLen = 953; // approximate default on_tick length
  lines.push('Variant distribution (by char count — creatures sharing length share inherited code):');
  for (const [len, { count }] of variants.slice(0, 5)) {
    const pct = creatures.length > 0 ? Math.round(count / creatures.length * 100) : 0;
    const marker = len <= defaultLen + 20 ? ' ← default' : '';
    lines.push(`  ${len} chars: ${count} creatures (${pct}%)${marker}`);
  }
  const defaultCount = variants.find(([len]) => len <= defaultLen + 20)?.[1].count ?? 0;
  if (defaultCount === 0) {
    lines.push('  (default code is extinct — all creatures have self-modified or inherited modified code)');
  }
  lines.push('');

  // ── Dominant variant code
  let codeBlocksShown = 0;
  if (variants.length > 0) {
    const [domLen, { count: domCount, sample: domCode }] = variants[0];
    const domPct = creatures.length > 0 ? Math.round(domCount / creatures.length * 100) : 0;
    lines.push(`DOMINANT VARIANT CODE (${domLen} chars, ${domCount} creatures, ${domPct}%):`);
    lines.push('```js');
    lines.push(domCode);
    lines.push('```\n');
    codeBlocksShown++;

    // Runner-up if >5% of population
    if (variants.length > 1) {
      const [ruLen, { count: ruCount, sample: ruCode }] = variants[1];
      const ruPct = creatures.length > 0 ? Math.round(ruCount / creatures.length * 100) : 0;
      if (ruPct > 5) {
        lines.push(`RUNNER-UP VARIANT CODE (${ruLen} chars, ${ruCount} creatures, ${ruPct}%):`);
        lines.push('```js');
        lines.push(ruCode);
        lines.push('```\n');
        codeBlocksShown++;
      }
    }
  }

  // ── Recently edited creatures (up to 2, not already shown)
  const shownLengths = new Set(variants.slice(0, codeBlocksShown).map(([len]) => len));
  const recentEdited = recentlyEditedIds
    .map(id => creatures.find(c => c.id === id))
    .filter((c): c is CreatureState => c != null && !shownLengths.has(c.embodiment.on_tick.length))
    .slice(0, 2);
  if (recentEdited.length > 0) {
    lines.push('RECENTLY EDITED CREATURES:');
    for (const c of recentEdited) {
      lines.push(`#${c.id} (Gen ${c.generation}, age ${c.age}) just edited on_tick — current code:`);
      lines.push('```js');
      lines.push(c.embodiment.on_tick);
      lines.push('```');
    }
    lines.push('');
  }

  // ── Generation distribution
  const genMap = new Map<number, number>();
  for (const c of creatures) {
    genMap.set(c.generation, (genMap.get(c.generation) ?? 0) + 1);
  }
  const gens = [...genMap.entries()].sort((a, b) => a[0] - b[0]);
  lines.push('GENERATION DISTRIBUTION');
  lines.push(gens.map(([g, n]) => `Gen ${g}: ${n}`).join(' | '));
  lines.push('');

  // ── Notable creatures
  lines.push('NOTABLE CREATURES');
  if (creatures.length > 0) {
    const oldest = creatures.reduce((a, b) => a.age > b.age ? a : b);
    const healthiest = creatures.reduce((a, b) =>
      (a.energy / a.maxEnergy) > (b.energy / b.maxEnergy) ? a : b);
    const thinking = creatures.filter(c => c.thinking);

    lines.push(`Oldest alive: #${oldest.id} (Gen ${oldest.generation}, age ${oldest.age}, energy ${Math.round(oldest.energy)}/${Math.round(oldest.maxEnergy)} = ${Math.round(oldest.energy / oldest.maxEnergy * 100)}%)`);
    lines.push(`Highest energy: #${healthiest.id} (Gen ${healthiest.generation}, ${Math.round(healthiest.energy)}/${Math.round(healthiest.maxEnergy)} = ${Math.round(healthiest.energy / healthiest.maxEnergy * 100)}%, age ${healthiest.age})`);
    lines.push(`Currently thinking: ${thinking.length > 0 ? thinking.map(c => '#' + c.id).join(', ') : 'none'}`);
  } else {
    lines.push('No creatures alive');
  }
  lines.push('');

  // ── Recent notable events
  lines.push('RECENT NOTABLE EVENTS');
  if (eventBuffer.length > 0) {
    for (const ev of eventBuffer.slice(-20)) {
      lines.push('  ' + ev);
    }
  } else {
    lines.push('  (no notable events since last report)');
  }
  lines.push('');

  // ── Scratchpad (from your previous call)
  if (previousScratchpad) {
    lines.push('YOUR SCRATCHPAD (from your last call — update this)');
    lines.push(previousScratchpad);
  } else {
    lines.push('YOUR SCRATCHPAD');
    lines.push('(empty — this is your first observation, start taking notes)');
  }

  return lines.join('\n');
}

// ── API call ────────────────────────────────────────────

const OBSERVER_SCHEMA = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    properties: {
      headline: { type: 'string', description: 'Punchy field note headline, under 80 chars' },
      narrative: { type: 'string', description: '2-4 sentences. Brief, vivid, specific. Use #N for creature IDs.' },
      mood: { type: 'string', enum: ['thriving', 'struggling', 'crisis', 'evolving', 'stable'] },
      watch_for: { type: 'string', description: 'One sentence: what to check next' },
      scratchpad: { type: 'string', description: 'Your field notebook. Persists between calls. Track creatures, predictions, trends, hypotheses. Be thorough — this is your memory.' },
    },
    required: ['headline', 'narrative', 'mood', 'watch_for', 'scratchpad'],
    additionalProperties: false,
  },
};

const OBSERVER_SYSTEM = `You are a naturalist observing digital creatures in the field. You have a keen eye, a quick pen, and genuine fascination for what these creatures do. You notice the small things — a lone creature thriving where others failed, a new behavioral variant spreading, a prediction confirmed.

Your outputs:
- "headline" + "narrative": Your PUBLIC field report. Keep it SHORT and vivid — a few sentences, not essays. Name creatures by #ID. Note tick numbers. Describe what code strategies actually do, not just that they exist. If your scratchpad had a prediction, say whether it came true.
- "scratchpad": Your PRIVATE field notebook, carried to your next call. This is your real workspace — be thorough here. Track:
  - Creatures you're watching and why (#14: oldest, modified on_tick at tick 200)
  - Predictions with specifics ("Expect 1667-char variant to dominate by tick 500")
  - Trend data with numbers (avg energy, variant spread %, generation counts)
  - Questions to answer next time ("Is #22's offspring inheriting the crisis-wake code?")
  Drop stale notes. Update numbers. This is how you remember.`;

export async function callObserverAPI(context: string): Promise<ObserverReport | null> {
  try {
    const resp = await fetch('/api/inference/anthropic/messages', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        system: OBSERVER_SYSTEM,
        messages: [{ role: 'user', content: context }],
        output_config: { format: OBSERVER_SCHEMA },
      }),
    });

    if (!resp.ok) {
      console.error('[OBSERVER] API error:', resp.status, await resp.text());
      return null;
    }

    const data = await resp.json();
    // Extract JSON from content blocks
    for (const block of data.content ?? []) {
      if (block.type === 'text') {
        return JSON.parse(block.text) as ObserverReport;
      }
    }
    console.error('[OBSERVER] No text block in response');
    return null;
  } catch (err) {
    console.error('[OBSERVER] Call failed:', err);
    return null;
  }
}

// ── Panel UI ────────────────────────────────────────────

const MOOD_COLORS: Record<string, string> = {
  thriving: '#4c4',
  evolving: '#6af',
  stable: '#888',
  struggling: '#da6',
  crisis: '#f44',
};

export class ObserverPanel {
  isVisible = false;
  private container: HTMLElement;
  private reports: ReportEntry[] = [];
  private onSelectCreature: ((id: number) => void) | null = null;
  private onRequestReport: (() => void) | null = null;
  private thinkingEl: HTMLElement | null = null;
  private reportBtn: HTMLButtonElement | null = null;
  private reportsEl: HTMLElement | null = null;
  private scratchpadEl: HTMLElement | null = null;
  private scratchpadExpanded = false;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  setOnSelectCreature(cb: (id: number) => void): void {
    this.onSelectCreature = cb;
  }

  setOnRequestReport(cb: () => void): void {
    this.onRequestReport = cb;
  }

  show(): void {
    this.isVisible = true;
    this.container.style.display = 'flex';
    this.render();
  }

  hide(): void {
    this.isVisible = false;
    this.container.style.display = 'none';
  }

  toggle(): void {
    if (this.isVisible) this.hide(); else this.show();
  }

  setThinking(active: boolean): void {
    if (this.thinkingEl) {
      this.thinkingEl.style.display = active ? 'block' : 'none';
    }
    if (this.reportBtn) {
      this.reportBtn.disabled = active;
      this.reportBtn.textContent = active ? 'Observing...' : 'New Report';
      this.reportBtn.style.opacity = active ? '0.5' : '1';
    }
  }

  showError(message: string): void {
    if (!this.reportsEl) return;
    // Only show if no reports yet (don't overwrite existing reports)
    if (this.reports.length > 0) return;
    this.reportsEl.innerHTML = '';
    const el = document.createElement('div');
    el.style.cssText = 'padding: 12px 10px; color: #f66; font-size: 11px;';
    el.textContent = message;
    this.reportsEl.appendChild(el);
  }

  addReport(tick: number, report: ObserverReport): void {
    this.reports.unshift({ tick, report, expanded: false });
    // Expand the latest report automatically
    if (this.reports.length > 1) this.reports[1].expanded = false;
    this.reports[0].expanded = true;
    // Cap at 20 reports
    if (this.reports.length > 20) this.reports.length = 20;
    this.renderScratchpad();
    this.renderReports();
  }

  getLastScratchpad(): string | null {
    return this.reports.length > 0 ? this.reports[0].report.scratchpad : null;
  }

  render(): void {
    this.container.innerHTML = '';

    // Header with report button
    const header = document.createElement('div');
    header.style.cssText = 'padding: 8px 10px 6px; background: #1a1a3a; border-bottom: 1px solid #2a2a4e; display: flex; align-items: center; justify-content: space-between;';
    const title = document.createElement('span');
    title.style.cssText = 'font-size: 14px; font-weight: bold; color: #eee;';
    title.textContent = 'Observer';
    header.appendChild(title);

    this.reportBtn = document.createElement('button');
    this.reportBtn.textContent = 'New Report';
    this.reportBtn.style.cssText = 'padding: 2px 10px; cursor: pointer; background: #2a2a4e; color: #6af; border: 1px solid #444; border-radius: 3px; font-family: monospace; font-size: 11px;';
    this.reportBtn.onclick = () => {
      if (this.onRequestReport) this.onRequestReport();
    };
    header.appendChild(this.reportBtn);
    this.container.appendChild(header);

    // Scratchpad section
    this.scratchpadEl = document.createElement('div');
    this.scratchpadEl.style.cssText = 'border-bottom: 1px solid #2a2a4e;';
    this.container.appendChild(this.scratchpadEl);
    this.renderScratchpad();

    // Thinking indicator
    this.thinkingEl = document.createElement('div');
    this.thinkingEl.style.cssText = 'padding: 6px 10px; color: #6af; font-size: 11px; display: none;';
    this.thinkingEl.textContent = '● Observing...';
    this.container.appendChild(this.thinkingEl);

    // Reports container
    this.reportsEl = document.createElement('div');
    this.reportsEl.style.cssText = 'flex: 1; overflow-y: auto;';
    // Event delegation for creature ID links
    this.reportsEl.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('.obs-link') as HTMLElement | null;
      if (target && this.onSelectCreature) {
        const id = parseInt(target.dataset.id ?? '', 10);
        if (!isNaN(id)) this.onSelectCreature(id);
      }
    });
    this.container.appendChild(this.reportsEl);

    this.renderReports();
  }

  private renderScratchpad(): void {
    if (!this.scratchpadEl) return;
    const pad = this.getLastScratchpad();
    this.scratchpadEl.innerHTML = '';

    const header = document.createElement('div');
    header.style.cssText = 'padding: 5px 10px; display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none;';
    header.onclick = () => {
      this.scratchpadExpanded = !this.scratchpadExpanded;
      this.renderScratchpad();
    };

    const icon = document.createElement('span');
    icon.style.cssText = 'font-size: 10px; color: #6af;';
    icon.textContent = this.scratchpadExpanded ? '▼' : '▶';
    header.appendChild(icon);

    const label = document.createElement('span');
    label.style.cssText = 'font-size: 11px; color: #998; font-weight: bold;';
    label.textContent = 'Scratchpad';
    header.appendChild(label);

    if (!pad) {
      const empty = document.createElement('span');
      empty.style.cssText = 'font-size: 10px; color: #555; font-style: italic;';
      empty.textContent = '(empty)';
      header.appendChild(empty);
    }

    this.scratchpadEl.appendChild(header);

    if (this.scratchpadExpanded && pad) {
      const body = document.createElement('div');
      body.style.cssText = 'padding: 4px 10px 8px; font-size: 10px; color: #aab; line-height: 1.5; white-space: pre-wrap; word-break: break-word; background: #13132a;';
      body.textContent = pad;
      this.scratchpadEl.appendChild(body);
    }
  }

  private renderReports(): void {
    if (!this.reportsEl) return;
    this.reportsEl.innerHTML = '';

    if (this.reports.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding: 12px 10px; color: #666; font-size: 11px; font-style: italic;';
      empty.textContent = 'Waiting for first observation...';
      this.reportsEl.appendChild(empty);
      return;
    }

    for (const entry of this.reports) {
      const el = this.renderEntry(entry);
      this.reportsEl.appendChild(el);
    }
  }

  private renderEntry(entry: ReportEntry): HTMLElement {
    const { tick, report, expanded } = entry;
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'padding: 8px 10px; border-bottom: 1px solid #222244;';

    // Mood dot + tick + mood label
    const headerLine = document.createElement('div');
    headerLine.style.cssText = 'display: flex; align-items: center; gap: 6px; font-size: 11px; color: #999; margin-bottom: 3px;';
    const dot = document.createElement('span');
    dot.textContent = '●';
    dot.style.color = MOOD_COLORS[report.mood] ?? '#888';
    headerLine.appendChild(dot);
    const tickSpan = document.createElement('span');
    tickSpan.textContent = `Tick ${tick}`;
    headerLine.appendChild(tickSpan);
    const moodSpan = document.createElement('span');
    moodSpan.textContent = `— ${report.mood}`;
    moodSpan.style.color = MOOD_COLORS[report.mood] ?? '#888';
    headerLine.appendChild(moodSpan);
    wrapper.appendChild(headerLine);

    // Headline
    const headlineEl = document.createElement('div');
    headlineEl.style.cssText = 'font-size: 12px; color: #ddd; margin-bottom: 4px; font-weight: bold;';
    headlineEl.textContent = report.headline;
    wrapper.appendChild(headlineEl);

    // Expand/collapse toggle
    const toggleBtn = document.createElement('span');
    toggleBtn.style.cssText = 'color: #6af; cursor: pointer; font-size: 10px; user-select: none;';
    toggleBtn.textContent = expanded ? '▼ collapse' : '▶ expand';
    toggleBtn.onclick = () => {
      entry.expanded = !entry.expanded;
      this.renderReports();
    };
    wrapper.appendChild(toggleBtn);

    // Narrative (expanded)
    if (expanded) {
      const narrativeEl = document.createElement('div');
      narrativeEl.style.cssText = 'font-size: 11px; color: #aab; margin: 6px 0; line-height: 1.5; white-space: pre-wrap; word-break: break-word;';
      narrativeEl.innerHTML = this.linkifyCreatureIds(report.narrative);
      wrapper.appendChild(narrativeEl);
    }

    // Watch for (always visible)
    const watchEl = document.createElement('div');
    watchEl.style.cssText = 'font-size: 10px; color: #998; font-style: italic; margin-top: 4px;';
    watchEl.textContent = '👁 ' + report.watch_for;
    wrapper.appendChild(watchEl);

    return wrapper;
  }

  private linkifyCreatureIds(text: string): string {
    // Replace #N with clickable spans
    return text.replace(/#(\d+)/g, (match, idStr) => {
      const id = parseInt(idStr, 10);
      return `<span class="obs-link" data-id="${id}" style="color: #6af; cursor: pointer; text-decoration: underline;">${match}</span>`;
    });
  }

}

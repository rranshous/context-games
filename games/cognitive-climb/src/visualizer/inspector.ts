import type { CreatureState, RuleState } from '../interface/state.js';
import type { TimelineEntry } from './history.js';

// ── Inspector Panel ─────────────────────────────────────

export class Inspector {
  private el: HTMLElement;
  private onNavigate: ((id: number) => void) | null = null;
  private visible = false;

  constructor(container: HTMLElement) {
    this.el = container;
    this.el.innerHTML = '';
    this.hide();
  }

  /** Set callback for when user clicks a creature ID link */
  setOnNavigate(fn: (id: number) => void): void {
    this.onNavigate = fn;
  }

  show(): void {
    this.visible = true;
    this.el.style.display = 'flex';
  }

  hide(): void {
    this.visible = false;
    this.el.style.display = 'none';
    this.el.innerHTML = '';
  }

  /** Update the panel with fresh creature state + timeline */
  update(creature: CreatureState | null, timeline: TimelineEntry[], dead: boolean): void {
    if (!creature && !dead) {
      this.hide();
      return;
    }
    if (!this.visible) this.show();
    if (!creature && dead) {
      // Dead creature with no current state — show timeline only
      this.el.innerHTML = this.renderDeadPlaceholder(timeline);
      this.bindLinks();
      return;
    }
    if (!creature) return;

    this.el.innerHTML = this.render(creature, timeline, dead);
    this.bindLinks();
  }

  private render(c: CreatureState, timeline: TimelineEntry[], dead: boolean): string {
    return `
      ${this.renderHeader(c, dead)}
      ${this.renderVitals(c, dead)}
      ${this.renderGenome(c)}
      ${this.renderReflexes(c)}
      ${this.renderRules(c)}
      ${this.renderMemory(c)}
      ${this.renderTimeline(timeline)}
    `;
  }

  private renderDeadPlaceholder(timeline: TimelineEntry[]): string {
    const bornEntry = timeline.find(e => e.type === 'born') as (TimelineEntry & { type: 'born' }) | undefined;
    const diedEntry = timeline.find(e => e.type === 'died') as (TimelineEntry & { type: 'died' }) | undefined;
    return `
      <div class="insp-header">
        <span class="insp-title">Creature (dead)</span>
        <button class="insp-close" title="Close">&times;</button>
      </div>
      <div class="insp-section">
        <div class="insp-muted">This creature is no longer alive.</div>
        ${bornEntry ? `<div class="insp-muted">Lived: tick ${bornEntry.tick} - ${diedEntry ? `tick ${diedEntry.tick}` : '?'}</div>` : ''}
      </div>
      ${this.renderTimeline(timeline)}
    `;
  }

  private renderHeader(c: CreatureState, dead: boolean): string {
    const status = dead ? ' <span class="insp-dead-badge">DEAD</span>' : '';
    const parentLink = c.parentId != null
      ? `<a class="insp-link" data-creature-id="${c.parentId}">#${c.parentId}</a>`
      : 'none';
    return `
      <div class="insp-header">
        <span class="insp-title">Creature #${c.id}${status}</span>
        <button class="insp-close" title="Close">&times;</button>
      </div>
      <div class="insp-subheader">
        Gen ${c.generation} &bull; Age ${c.age} &bull; Parent: ${parentLink}
      </div>
    `;
  }

  private renderVitals(c: CreatureState, dead: boolean): string {
    const pct = dead ? 0 : Math.round(c.energy / c.maxEnergy * 100);
    const barColor = pct > 30 ? '#4caf50' : pct > 10 ? '#ff9800' : '#f44336';
    return `
      <div class="insp-section">
        <div class="insp-energy-bar">
          <div class="insp-energy-fill" style="width:${pct}%;background:${barColor}"></div>
          <span class="insp-energy-text">${dead ? 'Dead' : `${c.energy} / ${c.maxEnergy} (${pct}%)`}</span>
        </div>
        <div class="insp-row">Pos: (${c.x}, ${c.y}) &bull; Hungry: ${c.ticksSinceAte} ticks</div>
      </div>
    `;
  }

  private renderGenome(c: CreatureState): string {
    const g = c.genome;
    const traits = [
      { name: 'speed', val: g.speed, min: 0.5, max: 2 },
      { name: 'sense', val: g.senseRange, min: 2, max: 8 },
      { name: 'size', val: g.size, min: 0.5, max: 2 },
      { name: 'metabolism', val: g.metabolism, min: 0.5, max: 1.5 },
      { name: 'diet', val: g.diet, min: 0, max: 1 },
      { name: 'wakeInterval', val: g.wakeInterval, min: 30, max: 200 },
    ];
    const rows = traits.map(t => {
      const pct = Math.round((t.val - t.min) / (t.max - t.min) * 100);
      return `
        <div class="insp-trait">
          <span class="insp-trait-name">${t.name}</span>
          <div class="insp-trait-bar"><div class="insp-trait-fill" style="width:${pct}%"></div></div>
          <span class="insp-trait-val">${t.val.toFixed(2)}</span>
        </div>`;
    }).join('');
    return `<div class="insp-section"><div class="insp-section-title">Genome</div>${rows}</div>`;
  }

  private renderReflexes(c: CreatureState): string {
    const w = c.genome.reflexWeights;
    const reflexes = [
      { name: 'foodAttraction', val: w.foodAttraction },
      { name: 'dangerAvoidance', val: w.dangerAvoidance },
      { name: 'curiosity', val: w.curiosity },
      { name: 'restThreshold', val: w.restThreshold },
      { name: 'sociality', val: w.sociality },
    ];
    const rows = reflexes.map(r => {
      const pct = Math.round(r.val / 2 * 100); // 0-2 range
      return `
        <div class="insp-trait">
          <span class="insp-trait-name">${r.name}</span>
          <div class="insp-trait-bar"><div class="insp-trait-fill reflex" style="width:${pct}%"></div></div>
          <span class="insp-trait-val">${r.val.toFixed(2)}</span>
        </div>`;
    }).join('');
    return `<div class="insp-section"><div class="insp-section-title">Reflexes</div>${rows}</div>`;
  }

  private renderRules(c: CreatureState): string {
    const rules = c.rules;
    if (rules.length === 0) {
      return `<div class="insp-section"><div class="insp-section-title">Rules (0/5)</div><div class="insp-muted">No rules</div></div>`;
    }
    const rows = rules.map(r => `<div class="insp-rule">${formatRuleHTML(r)}</div>`).join('');
    return `<div class="insp-section"><div class="insp-section-title">Rules (${rules.length}/5)</div>${rows}</div>`;
  }

  private renderMemory(c: CreatureState): string {
    const entries = Object.entries(c.mem);
    if (entries.length === 0) {
      return `<div class="insp-section"><div class="insp-section-title">Memory</div><div class="insp-muted">Empty</div></div>`;
    }
    const rows = entries.map(([k, v]) =>
      `<div class="insp-mem"><span class="insp-mem-key">${esc(k)}</span>: <span class="insp-mem-val">${esc(String(v))}</span></div>`
    ).join('');
    return `<div class="insp-section"><div class="insp-section-title">Memory (${entries.length})</div>${rows}</div>`;
  }

  private renderTimeline(timeline: TimelineEntry[]): string {
    if (timeline.length === 0) {
      return `<div class="insp-section insp-timeline"><div class="insp-section-title">Timeline</div><div class="insp-muted">No events yet</div></div>`;
    }

    // Show newest first
    const reversed = [...timeline].reverse();
    const rows = reversed.map(e => this.renderTimelineEntry(e)).join('');
    return `<div class="insp-section insp-timeline"><div class="insp-section-title">Timeline (${timeline.length})</div>${rows}</div>`;
  }

  private renderTimelineEntry(e: TimelineEntry): string {
    switch (e.type) {
      case 'born': {
        const parentLink = e.parentId != null
          ? `from <a class="insp-link" data-creature-id="${e.parentId}">#${e.parentId}</a>`
          : 'spawned';
        return `<div class="tl-entry tl-born"><span class="tl-tick">t${e.tick}</span> Born (gen ${e.generation}) ${parentLink}</div>`;
      }

      case 'ate':
        return `<div class="tl-entry tl-ate"><span class="tl-tick">t${e.tick}</span> Ate (${e.foodValue.toFixed(1)}) at (${e.x},${e.y})</div>`;

      case 'woke': {
        const tools = e.toolsUsed.length > 0
          ? e.toolsUsed.map(t => `<div class="tl-tool">&rarr; ${esc(t)}</div>`).join('')
          : '';
        return `
          <div class="tl-entry tl-woke">
            <span class="tl-tick">t${e.tick}</span> <span class="tl-brain">Brain</span> (${esc(e.reason)})
            <div class="tl-thoughts">${esc(e.thoughts)}</div>
            ${tools}
          </div>`;
      }

      case 'reproduced':
        return `<div class="tl-entry tl-reproduced"><span class="tl-tick">t${e.tick}</span> Reproduced &rarr; <a class="insp-link" data-creature-id="${e.childId}">#${e.childId}</a></div>`;

      case 'died':
        return `<div class="tl-entry tl-died"><span class="tl-tick">t${e.tick}</span> Died (${esc(e.cause)})</div>`;
    }
  }

  private bindLinks(): void {
    // Close button
    const closeBtn = this.el.querySelector('.insp-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.hide();
        this.onNavigate?.(-1); // -1 signals deselect
      });
    }

    // Creature ID links
    for (const link of this.el.querySelectorAll('.insp-link')) {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const id = Number((link as HTMLElement).dataset.creatureId);
        if (!isNaN(id) && id >= 0) {
          this.onNavigate?.(id);
        }
      });
    }
  }
}

// ── Helpers ──────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatRuleHTML(r: RuleState): string {
  const c = r.condition;
  let condStr = c.type;
  if (c.threshold != null) condStr += `(${c.threshold})`;
  if (c.terrain) condStr += `(${c.terrain})`;

  const sign = r.effect.modifier >= 0 ? '+' : '';
  return `<span class="rule-cond">IF</span> ${esc(condStr)} <span class="rule-then">THEN</span> ${esc(r.effect.target)} ${sign}${r.effect.modifier.toFixed(1)}`;
}

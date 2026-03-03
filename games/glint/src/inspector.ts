// Inspector panel — on-demand haiku briefing + soma deep-link.

import { Predator } from './predator.js';
import { PredatorSoma } from './soma.js';
import { DEFAULT_SHARK_ON_TICK, DEFAULT_SHARK_IDENTITY, DEFAULT_SHARK_MEMORY } from './soma.js';

let contentEl: HTMLElement | null = null;
let refreshBtn: HTMLButtonElement | null = null;
let headerTitleEl: HTMLElement | null = null;
let predatorsRef: Predator[] = [];
let apiEndpoint = '';

// Track which view we're in
let currentView: 'overview' | 'detail' = 'overview';
let detailSharkId: string | null = null;

export function initInspector(predators: Predator[], endpoint: string): void {
  predatorsRef = predators;
  apiEndpoint = endpoint;

  contentEl = document.getElementById('inspector-content');
  refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement | null;
  headerTitleEl = document.querySelector('.inspector-title');

  refreshBtn?.addEventListener('click', () => {
    if (currentView === 'detail') {
      showOverview();
    } else {
      refreshInspector();
    }
  });

  // Event delegation for card clicks and back button
  contentEl?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // Deep-link: click a soma-link in a summary to jump to that section
    const link = target.closest('.soma-link') as HTMLElement | null;
    if (link) {
      const card = link.closest('[data-shark-id]') as HTMLElement | null;
      const section = link.dataset.section;
      if (card?.dataset.sharkId && section) {
        showDetail(card.dataset.sharkId, section);
      }
      return;
    }

    // Drill into shark detail (click anywhere else on card)
    const card = target.closest('[data-shark-id]') as HTMLElement | null;
    if (card && !target.closest('.soma-section')) {
      const sharkId = card.dataset.sharkId;
      if (sharkId) showDetail(sharkId);
    }
  });
}

function showOverview(): void {
  currentView = 'overview';
  detailSharkId = null;
  if (headerTitleEl) headerTitleEl.textContent = 'Shark Intel';
  if (refreshBtn) {
    refreshBtn.textContent = 'REFRESH';
    refreshBtn.disabled = false;
  }
  refreshInspector();
}

function showDetail(sharkId: string, scrollToSection?: string): void {
  const pred = predatorsRef.find(p => p.id === sharkId);
  if (!pred || !contentEl) return;

  currentView = 'detail';
  detailSharkId = sharkId;
  if (headerTitleEl) headerTitleEl.textContent = sharkId;
  if (refreshBtn) refreshBtn.textContent = '← BACK';

  const soma = pred.predatorSoma;
  contentEl.innerHTML = renderDetail(soma);

  if (scrollToSection) {
    const el = document.getElementById('soma-' + scrollToSection);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('soma-section-highlight');
      setTimeout(() => el.classList.remove('soma-section-highlight'), 1500);
    }
  }
}

function renderDetail(soma: PredatorSoma): string {
  const sections: { key: string; label: string; content: string; isCode: boolean; changed: boolean }[] = [
    {
      key: 'identity',
      label: 'Identity',
      content: soma.identity,
      isCode: false,
      changed: soma.identity !== DEFAULT_SHARK_IDENTITY,
    },
    {
      key: 'on_tick',
      label: 'on_tick',
      content: soma.on_tick,
      isCode: true,
      changed: soma.on_tick !== DEFAULT_SHARK_ON_TICK,
    },
    {
      key: 'memory',
      label: 'Memory',
      content: soma.memory,
      isCode: false,
      changed: soma.memory !== DEFAULT_SHARK_MEMORY,
    },
    {
      key: 'hunt_journal',
      label: 'Hunt Journal',
      content: soma.hunt_journal || '(empty)',
      isCode: false,
      changed: soma.hunt_journal.trim().length > 0,
    },
  ];

  return sections.map(s => {
    const changedBadge = s.changed
      ? '<span class="soma-changed">evolved</span>'
      : '<span class="soma-default">default</span>';
    const contentClass = s.isCode ? 'soma-content soma-code' : 'soma-content';
    return `<div class="soma-section" id="soma-${s.key}">
      <div class="soma-section-header">
        <span class="soma-section-label">${escapeHtml(s.label)}</span>
        ${changedBadge}
      </div>
      <div class="${contentClass}">${escapeHtml(s.content)}</div>
    </div>`;
  }).join('');
}

async function refreshInspector(): Promise<void> {
  if (!contentEl || !refreshBtn) return;

  refreshBtn.disabled = true;
  contentEl.innerHTML = '<div class="inspector-loading">Scanning shark somas...</div>';

  const cards: string[] = [];

  // Fire all shark briefings in parallel
  const results = await Promise.allSettled(
    predatorsRef.map(pred => briefShark(pred))
  );

  for (let i = 0; i < predatorsRef.length; i++) {
    const pred = predatorsRef[i];
    const result = results[i];
    const summary = result.status === 'fulfilled'
      ? result.value
      : '<span class="unchanged">Briefing failed</span>';
    cards.push(renderCard(pred.id, summary));
  }

  contentEl.innerHTML = cards.join('');
  refreshBtn.disabled = false;
}

function renderCard(sharkId: string, summary: string): string {
  const pred = predatorsRef.find(p => p.id === sharkId);
  const changedCount = pred ? countChanges(pred.predatorSoma) : 0;
  const badge = changedCount > 0
    ? `<span class="shark-card-badge">${changedCount} evolved</span>`
    : '';
  return `<div class="shark-card" data-shark-id="${escapeHtml(sharkId)}">
    <div class="shark-card-header">
      <span>${escapeHtml(sharkId)}</span>
      ${badge}
    </div>
    <div class="shark-card-body">${summary}</div>
  </div>`;
}

function countChanges(soma: PredatorSoma): number {
  let n = 0;
  if (soma.identity !== DEFAULT_SHARK_IDENTITY) n++;
  if (soma.on_tick !== DEFAULT_SHARK_ON_TICK) n++;
  if (soma.memory !== DEFAULT_SHARK_MEMORY) n++;
  if (soma.hunt_journal.trim().length > 0) n++;
  return n;
}

async function briefShark(pred: Predator): Promise<string> {
  const soma = pred.predatorSoma;

  // Check if anything has changed from defaults
  const onTickChanged = soma.on_tick !== DEFAULT_SHARK_ON_TICK;
  const identityChanged = soma.identity !== DEFAULT_SHARK_IDENTITY;
  const memoryChanged = soma.memory !== DEFAULT_SHARK_MEMORY;
  const hasJournal = soma.hunt_journal.trim().length > 0;

  if (!onTickChanged && !identityChanged && !memoryChanged && !hasJournal) {
    return '<span class="unchanged">Factory defaults — no reflections yet.</span>';
  }

  const prompt = buildBriefingPrompt(soma.id, soma.identity, soma.on_tick, soma.memory, soma.hunt_journal, identityChanged, onTickChanged, memoryChanged);

  try {
    const resp = await fetch(apiEndpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        system: 'You are a marine biologist observing AI-controlled reef sharks in a simulation. Summarize behavioral evolution concisely. Use present tense. No markdown. When referencing a soma section, wrap the section name in double brackets: [[on_tick]], [[memory]], [[identity]], or [[hunt_journal]]. Always use these markers when mentioning a section.',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 512,
      }),
    });

    if (!resp.ok) return '<span class="unchanged">API error: ' + resp.status + '</span>';

    const data = await resp.json();
    const text = data.content?.[0]?.text;
    if (!text) return '<span class="unchanged">Empty response</span>';

    return linkifySections(escapeHtml(text));
  } catch (err) {
    return '<span class="unchanged">Fetch error: ' + escapeHtml(String(err)) + '</span>';
  }
}

function buildBriefingPrompt(
  id: string,
  identity: string,
  onTick: string,
  memory: string,
  journal: string,
  identityChanged: boolean,
  onTickChanged: boolean,
  memoryChanged: boolean,
): string {
  let prompt = `Shark "${id}" soma briefing.\n\n`;

  if (identityChanged) {
    prompt += `<identity_default>\n${DEFAULT_SHARK_IDENTITY}\n</identity_default>\n\n`;
    prompt += `<identity_current>\n${identity}\n</identity_current>\n\n`;
  } else {
    prompt += `Identity: unchanged from default.\n\n`;
  }

  if (onTickChanged) {
    prompt += `<on_tick_default>\n${DEFAULT_SHARK_ON_TICK}\n</on_tick_default>\n\n`;
    prompt += `<on_tick_current>\n${onTick}\n</on_tick_current>\n\n`;
  } else {
    prompt += `on_tick: unchanged from default.\n\n`;
  }

  if (memoryChanged) {
    prompt += `<memory_default>\n${DEFAULT_SHARK_MEMORY}\n</memory_default>\n\n`;
    prompt += `<memory_current>\n${memory}\n</memory_current>\n\n`;
  } else {
    prompt += `Memory: unchanged from default.\n\n`;
  }

  if (journal.trim().length > 0) {
    // Truncate journal to last 2000 chars for the briefing
    const trimmed = journal.length > 2000 ? '...' + journal.slice(-2000) : journal;
    prompt += `<hunt_journal>\n${trimmed}\n</hunt_journal>\n\n`;
  }

  prompt += `In 3-5 sentences, describe what this shark has learned compared to its factory defaults. Focus on: new hunting strategies in its [[on_tick]] code, spatial knowledge in [[memory]], and any [[identity]] shifts. Reference the [[hunt_journal]] if it reveals patterns. Be specific about behavioral changes (e.g. "now checks kelp after losing prey" not "improved hunting"). Always wrap section names in double brackets.`;

  return prompt;
}

const SECTION_NAMES = ['on_tick', 'memory', 'identity', 'hunt_journal'] as const;

function linkifySections(html: string): string {
  // Replace [[section_name]] markers with clickable spans
  return html.replace(/\[\[(on_tick|memory|identity|hunt_journal)\]\]/g,
    (_, section) => `<span class="soma-link" data-section="${section}">${section}</span>`);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

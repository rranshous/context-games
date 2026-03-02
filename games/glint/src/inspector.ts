// Inspector panel — on-demand haiku briefing comparing shark somas to defaults.

import { Predator } from './predator.js';
import { DEFAULT_SHARK_ON_TICK, DEFAULT_SHARK_IDENTITY, DEFAULT_SHARK_MEMORY } from './soma.js';

let contentEl: HTMLElement | null = null;
let refreshBtn: HTMLButtonElement | null = null;
let predatorsRef: Predator[] = [];
let apiEndpoint = '';

export function initInspector(predators: Predator[], endpoint: string): void {
  predatorsRef = predators;
  apiEndpoint = endpoint;

  contentEl = document.getElementById('inspector-content');
  refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement | null;

  refreshBtn?.addEventListener('click', () => {
    refreshInspector();
  });
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
  return `<div class="shark-card">
    <div class="shark-card-header">${escapeHtml(sharkId)}</div>
    <div class="shark-card-body">${summary}</div>
  </div>`;
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
        system: 'You are a marine biologist observing AI-controlled reef sharks in a simulation. Summarize behavioral evolution concisely. Use present tense. No markdown.',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 512,
      }),
    });

    if (!resp.ok) return '<span class="unchanged">API error: ' + resp.status + '</span>';

    const data = await resp.json();
    const text = data.content?.[0]?.text;
    if (!text) return '<span class="unchanged">Empty response</span>';

    return escapeHtml(text);
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

  prompt += `In 3-5 sentences, describe what this shark has learned compared to its factory defaults. Focus on: new hunting strategies in its on_tick code, spatial knowledge in memory, and any identity shifts. Be specific about behavioral changes (e.g. "now checks kelp after losing prey" not "improved hunting").`;

  return prompt;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

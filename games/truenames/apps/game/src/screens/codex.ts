// The Name Book: two tabs (beings whose words you hold / every being you know of),
// filters (search, element, form, might, status) and compact rows that scale to hundreds.
// A being has several facets; each row shows them, with the word you hold for each.
import type { App } from '../main.ts';
import { esc } from '../dom.ts';
import {
  ELEMENT_NAMES, ELEMENT_COLOR, ELEMENT_GLYPH, ASPECTS, FORMS, TEMPERS, HEARTH_GOD,
  addressOf, spiritName, magnitudeTitle, weightWord, generosityWord, nameRunes, fmtDuration, truths,
} from '../lore.ts';
import { persist, spiritOf, splitWord, type CodexView } from '../save.ts';
import { sigilURL } from '../sigil.ts';
import { facetCount, facetForm, wordBar, type Spirit } from '@truenames/universe';

const PAGE = 60;
/** The truth bar shows the being's bar plus this much resonance. */
const BAR_SPAN = 10;
const facetForms = (sp: Spirit) => Array.from({ length: facetCount(sp.magnitude) }, (_, f) => facetForm(sp.traits, f));
export const FORM_GLYPH = ['➶', '◎', '⛨', '⟋', '✺', '⚉', '☍', '↯'];

export function defaultCodexView(): CodexView {
  return { tab: 'names', q: '', elements: [], forms: [], minMag: 0, status: 'any', sort: 'truth' };
}

const STATUS: Record<CodexView['status'], string> = {
  any: 'any state',
  meditating: 'meditating',
  seeking: 'meditating, no word grasped yet',
  unnamed: 'no word yet',
  bound: 'bound to a slot',
  unbound: 'grasped but not bound',
  focused: 'in focus',
};
const SORTS: Record<CodexView['sort'], string> = {
  truth: 'truest word',
  might: 'mightiest',
  newest: 'newest found',
  soonest: 'next truth soonest',
  generous: 'most generous',
  light: 'lightest strain',
  name: 'name A–Z',
};

export interface Codex {
  render(): void;
  renderList(): void;
}

export function createCodex(app: App, host: HTMLElement, fresh: Set<string>): Codex {
  const S = app.services;
  const save = app.save;
  if (!save.codex) save.codex = defaultCodexView();
  const v = save.codex;
  let shown = PAGE;

  host.innerHTML = `
    <div class="codex-tabs" id="cx-tabs"></div>
    <div class="codex-filters">
      <input id="cx-q" type="search" placeholder="search beings, aspects, traditions, forms, divisions…" data-tip="=Search by a being's name, element, aspect, tradition, might, form or division.">
      <div class="chips" id="cx-el"></div>
      <div class="chips" id="cx-form"></div>
      <div class="cx-row">
        <select id="cx-mag" data-tip="magnitude"></select>
        <select id="cx-status" data-tip="=Filter by what you are doing with each spirit."></select>
        <select id="cx-sort" data-tip="=How to order the list."></select>
        <button class="small" id="cx-clear" data-tip="=Clear every filter.">clear</button>
      </div>
      <div class="cx-count dim" id="cx-count"></div>
    </div>
    <div id="cx-list"></div>`;
  const $ = <T extends HTMLElement>(id: string) => host.querySelector('#' + id) as T;
  const q = $<HTMLInputElement>('cx-q');
  q.value = v.q;

  const save_ = () => persist(save);

  // Controls are built once; updates only toggle state and counts, so open dropdowns and focus survive.
  $('cx-tabs').innerHTML = `
    <button class="tab" data-tab="names" data-tip="=Beings whose words of power you have grasped. A word is grasped once it reaches its being's bar; grasped words are what you bind and speak.">Words <span class="dim" id="cx-n-names"></span></button>
    <button class="tab" data-tab="spirits" data-tip="=Every being you know of. To find a being is to see its facets; meditate on one and words come to its facets as they will.">Beings <span class="dim" id="cx-n-spirits"></span></button>`;
  $('cx-el').innerHTML = ELEMENT_NAMES.map((n, i) => `<button class="chip" data-el="${i}" style="--c:${ELEMENT_COLOR[i]}" data-tip="=Only ${n} spirits (click several to combine).">${ELEMENT_GLYPH[i]}</button>`).join('');
  $('cx-form').innerHTML = FORMS.map((f) => `<button class="chip" data-form="${f.id}" data-tip="=Only ${f.name}: ${f.desc}.">${FORM_GLYPH[f.id]} ${f.name}</button>`).join('');
  $<HTMLSelectElement>('cx-mag').innerHTML = [0, 1, 2, 3, 4, 6, 9].map((m) => `<option value="${m}">${m === 0 ? 'any might' : `${magnitudeTitle(m)}s and up`}</option>`).join('');
  $<HTMLSelectElement>('cx-status').innerHTML = (Object.keys(STATUS) as CodexView['status'][]).map((k) => `<option value="${k}">${STATUS[k]}</option>`).join('');
  $<HTMLSelectElement>('cx-sort').innerHTML = (Object.keys(SORTS) as CodexView['sort'][]).map((k) => `<option value="${k}">sort: ${SORTS[k]}</option>`).join('');

  function renderControls() {
    const all = spirits();
    $('cx-n-names').textContent = String(all.filter((s) => S.learned(s.cell)).length);
    $('cx-n-spirits').textContent = String(all.length);
    host.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === v.tab));
    host.querySelectorAll<HTMLElement>('[data-el]').forEach((b) => b.classList.toggle('on', v.elements.includes(Number(b.dataset.el))));
    host.querySelectorAll<HTMLElement>('[data-form]').forEach((b) => b.classList.toggle('on', v.forms.includes(Number(b.dataset.form))));
    $<HTMLSelectElement>('cx-mag').value = String(v.minMag);
    $<HTMLSelectElement>('cx-status').value = v.status;
    $<HTMLSelectElement>('cx-sort').value = v.sort;
  }

  function spirits(): Spirit[] {
    return Object.keys(save.spirits).map((c) => spiritOf(save, c)!).filter(Boolean);
  }

  function nextTruthSeconds(sp: Spirit): number {
    if (!S.isMeditating(sp.cell)) return Infinity;
    const total = S.pool.list().reduce((a, t) => a + S.pool.weight(t.id), 0) || 1;
    const share = (S.pool.rate() * S.pool.weight('name:' + sp.cell)) / total;
    // the next truth on the weakest facet: each utterance touches it 1 time in (facet count)
    const words = S.words(sp.cell);
    const weakest = Math.min(...words.map((w) => w.strength));
    return (2 ** (weakest + 1) * words.length) / Math.max(1, share);
  }

  function matches(sp: Spirit, needle: string): boolean {
    if (!needle) return true;
    const hay = `${spiritName(sp)} ${addressOf(sp.cell)} ${sp.cell} ${facetForms(sp).map((f) => FORMS[f]!.name).join(' ')} ${magnitudeTitle(sp.magnitude)} ${TEMPERS[sp.traits.temperIdx]}`.toLowerCase();
    return needle.split(/\s+/).every((w) => hay.includes(w));
  }

  function filtered(): Spirit[] {
    const needle = v.q.trim().toLowerCase();
    const found = (c: string) => save.spirits[c]?.foundAt ?? 0;
    const list = spirits().filter((sp) => {
      const s = S.strength(sp.cell);
      const grasped = S.learned(sp.cell);
      const bound = save.loadout.some((k) => k && splitWord(k).cell === sp.cell);
      if (v.tab === 'names' && !grasped) return false;
      if (v.elements.length && !v.elements.includes(sp.element)) return false;
      if (v.forms.length && !facetForms(sp).some((f) => v.forms.includes(f))) return false;
      if (sp.magnitude < v.minMag) return false;
      const med = S.isMeditating(sp.cell);
      switch (v.status) {
        case 'meditating': if (!med) return false; break;
        case 'seeking': if (!med || grasped) return false; break;
        case 'unnamed': if (s > 0) return false; break;
        case 'bound': if (!bound) return false; break;
        case 'unbound': if (!grasped || bound) return false; break;
        case 'focused': if (!S.isFocused(sp.cell)) return false; break;
      }
      return matches(sp, needle);
    });
    const by = (f: (s: Spirit) => number) => (a: Spirit, b: Spirit) => f(b) - f(a) || (a.cell < b.cell ? -1 : 1);
    switch (v.sort) {
      case 'truth': return list.sort(by((s) => S.strength(s.cell) * 100 + s.magnitude));
      case 'might': return list.sort(by((s) => s.magnitude * 100 + S.strength(s.cell)));
      case 'newest': return list.sort(by((s) => found(s.cell)));
      case 'soonest': return list.sort((a, b) => nextTruthSeconds(a) - nextTruthSeconds(b) || (a.cell < b.cell ? -1 : 1));
      case 'generous': return list.sort(by((s) => s.traits.generosityIdx * 100 + s.magnitude));
      case 'light': return list.sort(by((s) => -s.traits.weightIdx * 100 + s.magnitude));
      case 'name': return list.sort((a, b) => spiritName(a).localeCompare(spiritName(b)));
    }
  }

  /** One facet: its form, and the word you hold for it (bind / deck / drag when grasped). */
  function facetChip(sp: Spirit, w: { key: string; facet: number; strength: number; grasped: boolean }): string {
    const form = facetForm(sp.traits, w.facet);
    const bound = save.loadout.includes(w.key);
    const inDeck = (save.councilDeck ?? []).includes(w.key);
    const tip = `=Facet ${w.facet + 1}: ${FORMS[form]!.name}, ${FORMS[form]!.desc}. ${w.strength ? `Your word holds ${truths(w.strength)}${w.grasped ? ', grasped.' : `; it is grasped at ${truths(wordBar(sp.magnitude))}.`}` : 'No word for this facet has come to you yet. You can\'t aim: each word comes to whichever facet it will.'}`;
    return `<span class="facet ${w.grasped ? 'grasped' : w.strength ? 'forming' : 'unknown'}" ${w.grasped ? `draggable="true" data-drag="${w.key}"` : ''} data-tip="${tip}">${FORM_GLYPH[form]} ${FORMS[form]!.name}${w.strength ? ` <b>${w.strength}</b>` : ''}${w.grasped ? ` <button class="tiny" data-bind="${w.key}" data-tip="bind" ${bound ? 'disabled' : ''}>${bound ? 'bound' : 'bind'}</button><button class="tiny ${inDeck ? 'on' : ''}" data-deck="${w.key}" data-tip="=${inDeck ? 'In your Council deck. Click to take it out.' : 'Add this word to your Council deck (up to 12 words, played as cards).'}">◇</button>` : ''}</span>`;
  }

  function row(sp: Spirit): string {
    const s = S.strength(sp.cell);
    const bar = wordBar(sp.magnitude);
    const learned = S.learned(sp.cell);
    const med = S.isMeditating(sp.cell);
    const color = ELEMENT_COLOR[sp.element]!;
    const words = S.words(sp.cell);
    const best = words.reduce((a, w) => (w.strength > a.strength ? w : a), words[0]!);
    const rec = save.names[best.key];
    const t = sp.traits;
    const next = med ? fmtDuration(nextTruthSeconds(sp)) : '';
    return `<div class="crow ${fresh.has(sp.cell) ? 'new' : ''} ${learned ? 'learned' : ''}" style="--c:${color}">
      <img class="csig" src="${sigilURL(sp)}" alt="" data-card="${sp.cell}" data-tip="card">
      <div class="cmain">
        <div class="cl1"><span class="nm" data-card="${sp.cell}" data-tip="card">${esc(spiritName(sp))}</span>
          <span class="dim" data-tip="magnitude">${magnitudeTitle(sp.magnitude)} of ${esc(ASPECTS[sp.element]![sp.aspect]!)}</span>${sp.cell === HEARTH_GOD ? ' <i class="dim">· the hearth</i>' : ''}</div>
        <div class="cl2"><span data-tip="weight">${weightWord(t.weightIdx)}</span> · <span data-tip="generosity">${generosityWord(t.generosityIdx)}</span> · <span data-tip="temper">${TEMPERS[t.temperIdx]}</span> · <span class="faint" data-tip="address">${ELEMENT_GLYPH[sp.element]} ${sp.cell}</span></div>
        <div class="facets">${words.map((w) => facetChip(sp, w)).join('')}</div>
        ${s ? `<div class="bar thin" data-tip="=Your truest word for this being. The mark is its bar, ${truths(bar)}, where a word is grasped; truths beyond it are resonance."><i style="width:${Math.min(100, (100 * s) / (bar + BAR_SPAN))}%"></i><span class="mark" style="left:${(100 * bar) / (bar + BAR_SPAN)}%"></span></div>` : ''}
      </div>
      <div class="cside">
        <div><span class="bits ${learned ? 'gold' : 'dim'}" data-tip="truths">${s ? truths(s) : 'unnamed'}</span></div>
        <div class="cside-sub">${med ? `<span data-tip="nextTruth">next ~${next}</span>` : rec ? `<span class="runes" data-tip="runes">${nameRunes(rec.claim.nonce, 5)}</span>` : ''}</div>
        <div class="cbtns">
          <button class="small ${med ? 'on' : ''}" data-med="${sp.cell}" data-tip="meditate">${med ? 'meditating' : 'meditate'}</button>
          ${med ? `<button class="small ${S.isFocused(sp.cell) ? 'on' : ''}" data-focus="${sp.cell}" data-tip="focus">${S.isFocused(sp.cell) ? '★' : '☆'}</button>` : ''}
          ${S.choirs.some((c) => c.connected && c.members.length > 1) ? `<button class="small" data-share="${sp.cell}" data-tip="=Share this being's sign with your choir: they will know where it dwells.">share</button>` : ''}
        </div>
      </div>
    </div>`;
  }

  function renderList() {
    const list = filtered();
    const total = v.tab === 'names' ? spirits().filter((s) => S.learned(s.cell)).length : Object.keys(save.spirits).length;
    const active = v.q.trim() || v.elements.length || v.forms.length || v.minMag || v.status !== 'any';
    $('cx-count').textContent = active ? `showing ${list.length} of ${total}` : `${total} ${total === 1 ? 'being' : 'beings'}`;
    const box = $('cx-list');
    if (!list.length) {
      box.innerHTML = `<div class="hint">${
        !total ? (v.tab === 'names' ? `You hold no words yet. Meditate on a being until a word reaches its bar (${truths(wordBar(0))} for a wisp).` : 'You know no beings. Scry to find one.') : 'Nothing matches these filters.'
      }</div>`;
      return;
    }
    box.innerHTML = list.slice(0, shown).map(row).join('') + (list.length > shown ? `<button class="small more" data-more>show ${Math.min(PAGE, list.length - shown)} more (${list.length - shown} hidden)</button>` : '');
  }

  function render() {
    renderControls();
    renderList();
  }

  const change = () => { shown = PAGE; save_(); render(); };
  host.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const tab = t.closest('[data-tab]')?.getAttribute('data-tab');
    if (tab) { v.tab = tab as CodexView['tab']; if (tab === 'names' && v.sort === 'might') v.sort = 'truth'; return change(); }
    const el = t.closest('[data-el]')?.getAttribute('data-el');
    if (el !== undefined && el !== null) { const n = Number(el); v.elements = v.elements.includes(n) ? v.elements.filter((x) => x !== n) : [...v.elements, n]; return change(); }
    const fm = t.closest('[data-form]')?.getAttribute('data-form');
    if (fm !== undefined && fm !== null) { const n = Number(fm); v.forms = v.forms.includes(n) ? v.forms.filter((x) => x !== n) : [...v.forms, n]; return change(); }
    if (t.closest('#cx-clear')) { Object.assign(v, { q: '', elements: [], forms: [], minMag: 0, status: 'any' }); q.value = ''; return change(); }
  });
  host.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('[data-more]')) { shown += PAGE; renderList(); }
  });
  q.addEventListener('input', () => { v.q = q.value; shown = PAGE; save_(); renderList(); });
  $<HTMLSelectElement>('cx-mag').addEventListener('change', (e) => { v.minMag = Number((e.target as HTMLSelectElement).value); change(); });
  $<HTMLSelectElement>('cx-status').addEventListener('change', (e) => { v.status = (e.target as HTMLSelectElement).value as CodexView['status']; change(); });
  $<HTMLSelectElement>('cx-sort').addEventListener('change', (e) => { v.sort = (e.target as HTMLSelectElement).value as CodexView['sort']; change(); });

  render();
  return { render, renderList };
}

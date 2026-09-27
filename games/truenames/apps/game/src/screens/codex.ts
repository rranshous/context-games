// The Name Book, reworked: two tabs (names you hold / spirits you know of),
// filters (search, element, form, might, status) and compact rows that scale to hundreds.
import type { App } from '../main.ts';
import { esc } from '../dom.ts';
import {
  ELEMENT_NAMES, ELEMENT_COLOR, ELEMENT_GLYPH, ASPECTS, FORMS, TEMPERS, HEARTH_GOD,
  addressOf, spiritName, magnitudeTitle, weightWord, generosityWord, nameRunes, fmtDuration, truths,
} from '../lore.ts';
import { persist, spiritOf, type CodexView } from '../save.ts';
import { sigilURL } from '../sigil.ts';
import { MIN_NAME_BITS, type Spirit } from '@truenames/universe';

const PAGE = 60;
const MAX_BAR = 28;
export const FORM_GLYPH = ['➶', '◎', '⛨', '⟋', '✺', '⚉', '☍', '↯'];

export function defaultCodexView(): CodexView {
  return { tab: 'names', q: '', elements: [], forms: [], minMag: 0, status: 'any', sort: 'truth' };
}

const STATUS: Record<CodexView['status'], string> = {
  any: 'any state',
  meditating: 'meditating',
  seeking: 'meditating, not yet learned',
  unnamed: 'never meditated',
  bound: 'bound to a slot',
  unbound: 'learned but not bound',
  focused: 'in focus',
};
const SORTS: Record<CodexView['sort'], string> = {
  truth: 'truest name',
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
      <input id="cx-q" type="search" placeholder="search names, aspects, traditions, divisions…" data-tip="=Search by spirit name, element, aspect, tradition, form or division.">
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
    <button class="tab" data-tab="names" data-tip="=Names you hold: every spirit whose name you have learned (12 truths or more). These are what you can bind and speak.">Names <span class="dim" id="cx-n-names"></span></button>
    <button class="tab" data-tab="spirits" data-tip="=Every spirit you know of, named or not. Meditate here to begin learning a name.">Spirits <span class="dim" id="cx-n-spirits"></span></button>`;
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
    return 2 ** (S.strength(sp.cell) + 1) / Math.max(1, share);
  }

  function matches(sp: Spirit, needle: string): boolean {
    if (!needle) return true;
    const hay = `${spiritName(sp)} ${addressOf(sp.cell)} ${sp.cell} ${FORMS[sp.traits.form]!.name} ${magnitudeTitle(sp.magnitude)} ${TEMPERS[sp.traits.temperIdx]}`.toLowerCase();
    return needle.split(/\s+/).every((w) => hay.includes(w));
  }

  function filtered(): Spirit[] {
    const needle = v.q.trim().toLowerCase();
    const found = (c: string) => save.spirits[c]?.foundAt ?? 0;
    const list = spirits().filter((sp) => {
      const s = S.strength(sp.cell);
      if (v.tab === 'names' && s < MIN_NAME_BITS) return false;
      if (v.elements.length && !v.elements.includes(sp.element)) return false;
      if (v.forms.length && !v.forms.includes(sp.traits.form)) return false;
      if (sp.magnitude < v.minMag) return false;
      const med = S.isMeditating(sp.cell);
      switch (v.status) {
        case 'meditating': if (!med) return false; break;
        case 'seeking': if (!med || s >= MIN_NAME_BITS) return false; break;
        case 'unnamed': if (s > 0) return false; break;
        case 'bound': if (!save.loadout.includes(sp.cell)) return false; break;
        case 'unbound': if (s < MIN_NAME_BITS || save.loadout.includes(sp.cell)) return false; break;
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

  function row(sp: Spirit): string {
    const s = S.strength(sp.cell);
    const learned = s >= MIN_NAME_BITS;
    const med = S.isMeditating(sp.cell);
    const bound = save.loadout.includes(sp.cell);
    const color = ELEMENT_COLOR[sp.element]!;
    const rec = save.names[sp.cell];
    const t = sp.traits;
    const next = med ? fmtDuration(nextTruthSeconds(sp)) : '';
    return `<div class="crow ${fresh.has(sp.cell) ? 'new' : ''} ${learned ? 'learned' : ''}" style="--c:${color}" ${learned ? `draggable="true" data-drag="${sp.cell}"` : ''}>
      <img class="csig" src="${sigilURL(sp)}" alt="" data-card="${sp.cell}" data-tip="card">
      <div class="cmain">
        <div class="cl1"><span class="nm" data-card="${sp.cell}" data-tip="card">${esc(spiritName(sp))}</span>
          <span class="dim" data-tip="magnitude">${magnitudeTitle(sp.magnitude)} of ${esc(ASPECTS[sp.element]![sp.aspect]!)}</span>${sp.cell === HEARTH_GOD ? ' <i class="dim">· the hearth-god</i>' : ''}</div>
        <div class="cl2"><span data-tip="form">${FORM_GLYPH[t.form]} ${FORMS[t.form]!.name}</span> · <span data-tip="weight">${weightWord(t.weightIdx)}</span> · <span data-tip="generosity">${generosityWord(t.generosityIdx)}</span> · <span data-tip="temper">${TEMPERS[t.temperIdx]}</span> · <span class="faint" data-tip="address">${ELEMENT_GLYPH[sp.element]} ${sp.cell}</span></div>
        ${s ? `<div class="bar thin" data-tip="=How true your name is. The mark is 12 truths, where a name is learned."><i style="width:${(100 * s) / MAX_BAR}%"></i><span class="mark" style="left:${(100 * MIN_NAME_BITS) / MAX_BAR}%"></span></div>` : ''}
      </div>
      <div class="cside">
        <div><span class="bits ${learned ? 'gold' : 'dim'}" data-tip="truths">${s ? truths(s) : 'unnamed'}</span></div>
        <div class="cside-sub">${med ? `<span data-tip="nextTruth">next ~${next}</span>` : rec ? `<span class="runes" data-tip="runes">${nameRunes(rec.claim.nonce, 5)}</span>` : ''}</div>
        <div class="cbtns">
          <button class="small ${med ? 'on' : ''}" data-med="${sp.cell}" data-tip="meditate">${med ? 'meditating' : 'meditate'}</button>
          ${med ? `<button class="small ${S.isFocused(sp.cell) ? 'on' : ''}" data-focus="${sp.cell}" data-tip="focus">${S.isFocused(sp.cell) ? '★' : '☆'}</button>` : ''}
          ${learned ? `<button class="small" data-bind="${sp.cell}" data-tip="bind" ${bound ? 'disabled' : ''}>${bound ? 'bound' : 'bind'}</button>` : ''}
        </div>
      </div>
    </div>`;
  }

  function renderList() {
    const list = filtered();
    const total = v.tab === 'names' ? spirits().filter((s) => S.learned(s.cell)).length : Object.keys(save.spirits).length;
    const active = v.q.trim() || v.elements.length || v.forms.length || v.minMag || v.status !== 'any';
    $('cx-count').textContent = active ? `showing ${list.length} of ${total}` : `${total} ${v.tab === 'names' ? (total === 1 ? 'name' : 'names') : total === 1 ? 'spirit' : 'spirits'}`;
    const box = $('cx-list');
    if (!list.length) {
      box.innerHTML = `<div class="hint">${
        !total ? (v.tab === 'names' ? `You hold no names yet. Meditate on a spirit until its name holds ${truths(MIN_NAME_BITS)}.` : 'You know no spirits. Scry to find one.') : 'Nothing matches these filters.'
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

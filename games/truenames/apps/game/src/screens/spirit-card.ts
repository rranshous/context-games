// A being's card: its seal, its facets and the words you hold for them, and what a word can draw.
import type { App } from '../main.ts';
import { frag, esc } from '../dom.ts';
import {
  ELEMENT_COLOR, ELEMENT_NAMES, ASPECTS, FORMS, TEMPERS, HEARTH_GOD,
  addressOf, spiritName, magnitudeTitle, weightWord, generosityWord, nameRunes, fmtDuration, truths,
} from '../lore.ts';
import { spiritOf } from '../save.ts';
import { sigilURL } from '../sigil.ts';
import { spiritStats, castCap, castStrain } from '@truenames/authority';
import { facetForm, wordBar } from '@truenames/universe';
import { FORM_GLYPH } from './codex.ts';

export function openSpiritCard(app: App, cell: string) {
  const S = app.services;
  const sp = spiritOf(app.save, cell);
  if (!sp) return;
  const st = spiritStats(sp);
  const color = ELEMENT_COLOR[sp.element]!;
  const s = S.strength(cell);
  const words = S.words(sp.cell);
  const best = words.reduce((a, w) => (w.strength > a.strength ? w : a), words[0]!);
  const rec = app.save.names[best.key];
  const rate = Math.max(1, S.pool.rate() / Math.max(1, S.pool.list().length));
  const bar = wordBar(sp.magnitude);
  const rows = [0, 2, 4, 6, 8].map((r) => bar + r).filter((b) => b >= Math.max(bar, s - 4)).slice(0, 5);
  const known = S.learned(cell);
  const facets = words.map((w) => {
    const f = FORMS[facetForm(sp.traits, w.facet)]!;
    return `<div data-tip="=${f.name}: ${f.desc}."><span class="dim">facet ${w.facet + 1}</span> ${FORM_GLYPH[f.id]} ${f.name} · ${w.strength ? `${w.grasped ? '<span class="gold">grasped</span>' : 'forming'}, ${truths(w.strength)}` : '<span class="faint">no word yet</span>'}</div>`;
  }).join('');
  const root = frag(`<div class="overlay card-overlay">
    <div class="spirit-card" style="--c:${color}">
      <img src="${sigilURL(sp, 160)}" width="160" height="160" alt="" style="filter: drop-shadow(0 0 16px ${color}66)">
      <h1 style="color:${color}; font-size:30px; margin-top:8px">${esc(spiritName(sp))}</h1>
      <div class="dim" style="font-style:italic">${magnitudeTitle(sp.magnitude)} of ${esc(ASPECTS[sp.element]![sp.aspect]!)}${cell === HEARTH_GOD ? ', the hearth' : ''}</div>
      <div class="dim" style="font-size:14px; margin-top:4px">${esc(addressOf(cell))} <span class="mono faint">${cell}</span></div>
      <div class="card-grid">
        <div data-tip="element"><span class="dim">element</span> ${ELEMENT_NAMES[sp.element]}</div>
        <div data-tip="magnitude"><span class="dim">might</span> ${magnitudeTitle(sp.magnitude)}: it lends a vessel of ${Math.round(st.poolCap).toLocaleString()}, refilling ${st.refill.toFixed(1)} each breath, shared by all its words</div>
        <div data-tip="=The truths a word for this being must reach before it is grasped. Mightier beings set a higher bar."><span class="dim">bar</span> ${truths(bar)}</div>
        <div data-tip="weight"><span class="dim">weight</span> ${weightWord(sp.traits.weightIdx)}: each evocation strains you ~${castStrain(st, Math.max(s, bar)).toFixed(2)}</div>
        <div data-tip="generosity"><span class="dim">generosity</span> ${generosityWord(sp.traits.generosityIdx)} (×${st.generosity.toFixed(2)})</div>
        <div data-tip="temper"><span class="dim">temper</span> ${TEMPERS[sp.traits.temperIdx]}</div>
      </div>
      <div class="card-facets">${facets}</div>
      <div style="margin-top:10px">${rec ? `Your truest word: <span class="runes" style="font-size:16px" data-tip="runes">${nameRunes(rec.claim.nonce, 12)}</span> holds <span class="gold mono">${truths(s)}</span>` : `<span class="dim">No word of it has come to you yet.</span>`}</div>
      <table class="card-table">
        <tr><th data-tip="truths">word</th><th data-tip="=The most a single evocation can draw from this spirit with a name this true, before strain. Your vessel may hold less.">draws up to</th><th data-tip="=How much strain each evocation adds to your aura. Truer names weigh less.">strain / cast</th><th data-tip="=Roughly how long meditation would take to reach this, at this name's current share of your hum.">meditation to reach</th></tr>
        ${rows.map((b) => `<tr class="${b <= s ? 'reached' : ''}"><td class="mono">${truths(b)}</td><td class="mono">${castCap(b, st.generosity).toFixed(1)}</td><td class="mono">${castStrain(st, b).toFixed(2)}</td><td>${b <= s ? '✓' : `~${fmtDuration((2 ** b - 2 ** s) / rate)} here`}</td></tr>`).join('')}
      </table>
      <div class="faint" style="font-size:13px; max-width:460px">Draw is before strain. Every point of strain you carry costs you a truth at the moment you speak. ${known ? '' : `Meditate on it: each word that comes touches one of its ${words.length === 1 ? 'facet' : `${words.length} facets`}, and a word is grasped at ${truths(bar)}.`}</div>
      <button data-close style="margin-top:8px">close</button>
    </div>
  </div>`);
  const opened = performance.now(); // opened on pointerdown: ignore the click that finishes that same press
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (performance.now() - opened < 350) return;
    if (t === root || t.closest('[data-close]')) root.remove();
  });
  document.getElementById('ui')!.appendChild(root);
}
